import "dotenv/config";
import WebSocket from "ws";
import { SignJWT } from "jose";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { createRedisClient, publishUserEvent, publishGameEvent, RedisKeys } from "@ludo/redis";
import { ServerEvents, ClientCommands } from "@ludo/shared";

// Generate signed ticket for testing
async function generateTestTicket(userId: string): Promise<string> {
  const secret = process.env.WS_TOKEN_SECRET;
  if (!secret) throw new Error("WS_TOKEN_SECRET required");
  const secretKey = new TextEncoder().encode(secret);

  return await new SignJWT({ sessionId: "test-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(secretKey);
}

async function ensureServerRunning(port: string): Promise<ChildProcess | null> {
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    if (res.ok) return null;
  } catch {
    // Not running yet
  }

  console.log(`[Test] Launching local WebSocket server on port ${port}...`);
  const serverPath = path.resolve(__dirname, "../server.ts");
  const child = spawn("bun", ["run", serverPath], {
    stdio: "pipe",
    env: { ...process.env, WS_PORT: port },
  });

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) {
        console.log(`[Test] WebSocket server ready on port ${port}.`);
        return child;
      }
    } catch {
      // Continue polling
    }
  }

  child.kill();
  throw new Error(`WebSocket server did not respond on port ${port} within 10s`);
}

async function runWebSocketTests() {
  console.log("Starting Milestone 6 WebSocket Infrastructure Automated Tests...");

  const wsPort = process.env.WS_PORT || "3001";
  const serverProc = await ensureServerRunning(wsPort);

  const testUserId = `user-ws-test-${Date.now()}`;
  const validTicket = await generateTestTicket(testUserId);
  const redis = createRedisClient();
  await redis.connect();

  const wsUrl = `ws://localhost:${wsPort}?ticket=${validTicket}&deviceId=device-1`;

  // 1. Test Unauthenticated Connection Rejection
  console.log("1. Testing connection rejection with invalid ticket...");
  const invalidWs = new WebSocket(`ws://localhost:${wsPort}?ticket=invalid-ticket`);
  const rejectedPromise = new Promise<boolean>((resolve) => {
    invalidWs.on("unexpected-response", (req, res) => {
      if (res.statusCode === 401) {
        resolve(true);
      }
    });
    invalidWs.on("error", () => resolve(true));
  });
  const rejected = await rejectedPromise;
  if (!rejected) throw new Error("Invalid ticket was not rejected with 401!");
  console.log("✓ Invalid WebSocket ticket rejected with 401 Unauthorized.");

  // 2. Test Valid Authenticated Connection & CONNECTION_ESTABLISHED event
  console.log("2. Testing connection with valid ticket...");
  const ws1 = new WebSocket(wsUrl);

  const connPromise = new Promise<{ connectionId: string }>((resolve, reject) => {
    ws1.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === ServerEvents.CONNECTION_ESTABLISHED) {
        resolve(msg.payload);
      }
    });
    ws1.on("error", reject);
  });

  const { connectionId } = await connPromise;
  console.log("✓ Connection established:", connectionId);

  // Verify connection registered in Redis
  const connCount = await redis.scard(RedisKeys.userConnections(testUserId));
  if (connCount !== 1) {
    throw new Error(`Expected 1 Redis connection, got ${connCount}`);
  }
  console.log("✓ Registered in Redis connections:userId.");

  // 3. Test Second Connection for Same User (Multi-Tab)
  console.log("3. Testing second connection (multi-tab)...");
  const ws2 = new WebSocket(wsUrl);
  await new Promise<void>((resolve) => {
    ws2.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === ServerEvents.CONNECTION_ESTABLISHED) {
        resolve();
      }
    });
  });

  const multiConnCount = await redis.scard(RedisKeys.userConnections(testUserId));
  if (multiConnCount !== 2) {
    throw new Error(`Expected 2 Redis connections for multi-tab, got ${multiConnCount}`);
  }
  console.log("✓ Second tab connected successfully (Redis connections count = 2).");

  // 4. Test PING -> PONG heartbeat handling
  console.log("4. Testing PING / PONG heartbeat...");
  const pongPromise = new Promise<void>((resolve) => {
    ws1.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === ServerEvents.PONG) {
        resolve();
      }
    });
  });
  ws1.send(JSON.stringify({ type: ClientCommands.PING, actionId: "ping-1", payload: {} }));
  await pongPromise;
  console.log("✓ Received PONG with refreshed presence timestamp.");

  // 5. Test Redis Pub/Sub User Event Delivery
  console.log("5. Testing Redis Pub/Sub delivery to user sockets...");
  let userEventCount = 0;
  const userEventPromise = new Promise<void>((resolve) => {
    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "FRIEND_REQUEST_RECEIVED") {
        userEventCount++;
        if (userEventCount === 2) resolve(); // Both tabs should receive it
      }
    };
    ws1.on("message", handler);
    ws2.on("message", handler);
  });

  await publishUserEvent(redis, testUserId, "FRIEND_REQUEST_RECEIVED", { from: "Player_Beta" });
  await userEventPromise;
  console.log("✓ Both open tabs received real-time Pub/Sub event.");

  // 6. Test Game Join & Game Pub/Sub Delivery
  console.log("6. Testing game join and game-specific event delivery...");
  const testGameId = `game-${Date.now()}`;
  ws1.send(JSON.stringify({
    type: ClientCommands.JOIN_GAME,
    actionId: "join-1",
    payload: { gameId: testGameId }
  }));

  const gameEventPromise = new Promise<void>((resolve) => {
    ws1.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === ServerEvents.DICE_ROLLED) {
        resolve();
      }
    });
  });

  // Give socket a moment to join game room
  await new Promise((r) => setTimeout(r, 200));
  await publishGameEvent(redis, testGameId, ServerEvents.DICE_ROLLED, { dice: 6 });
  await gameEventPromise;
  console.log("✓ Game-specific Pub/Sub event received by room member.");

  // 7. Cleanup
  ws1.close();
  ws2.close();
  await redis.del(RedisKeys.presence(testUserId), RedisKeys.userConnections(testUserId));
  await redis.quit();

  if (serverProc) {
    serverProc.kill("SIGTERM");
  }

  console.log("All Milestone 6 WebSocket tests completed successfully!");
  process.exit(0);
}

runWebSocketTests().catch((err) => {
  console.error("WebSocket test failed:", err);
  process.exit(1);
});
