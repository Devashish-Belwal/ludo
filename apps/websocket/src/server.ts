import "dotenv/config";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { authenticateWebSocketTicket } from "./authentication/verifier";
import { ConnectionRegistry, type AuthenticatedSocket } from "./connection/registry";
import { handleClientMessage } from "./handlers/dispatcher";
import { sendServerMessage, sendErrorMessage } from "./handlers/sender";
import { setupPubSubListener } from "./pubsub/listener";
import {
  createRedisClient,
  registerConnection,
  removeConnection,
  MatchmakingWorker,
} from "@ludo/redis";
import { ServerEvents } from "@ludo/shared";


const PORT = parseInt(process.env.WS_PORT || "3001", 10);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", timestamp: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });
const registry = new ConnectionRegistry();

// Initialize Redis clients
const redis = createRedisClient();
const redisSubscriber = createRedisClient();

async function bootstrap() {
  await redis.connect();
  await redisSubscriber.connect();
  console.log("[WebSocket] Redis connected successfully.");

  await setupPubSubListener(redisSubscriber, registry);
  console.log("[WebSocket] Redis Pub/Sub listeners initialized.");

  // Initialize and start single FIFO matchmaking worker per Section 10.5
  const matchmakingWorker = new MatchmakingWorker(redis, { intervalMs: 500 });
  await matchmakingWorker.start();

  // Upgrade HTTP to WebSocket with authentication ticket verification
  server.on("upgrade", async (request, socket, head) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const ticket = url.searchParams.get("ticket") || (request.headers["sec-websocket-protocol"] as string);

      if (!ticket) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const credential = await authenticateWebSocketTicket(ticket);
      if (!credential) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const authSocket = ws as AuthenticatedSocket;
        authSocket.connectionId = crypto.randomUUID();
        authSocket.userId = credential.sub;
        authSocket.sessionId = credential.sessionId;
        authSocket.deviceId = url.searchParams.get("deviceId") || "default-device";
        authSocket.isAlive = true;

        wss.emit("connection", authSocket, request);
      });
    } catch (err) {
      console.error("[WebSocket] Upgrade error:", err);
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  });

  // Handle new authenticated connections
  wss.on("connection", async (socket: AuthenticatedSocket) => {
    registry.add(socket);

    // Register connection in Redis & update presence
    await registerConnection(redis, socket.userId, socket.connectionId);
    console.log(`[WebSocket] Connected: user=${socket.userId}, conn=${socket.connectionId}`);

    // Send CONNECTION_ESTABLISHED event
    sendServerMessage(socket, ServerEvents.CONNECTION_ESTABLISHED, {
      connectionId: socket.connectionId,
      userId: socket.userId,
    });

    // Ping-pong liveness check
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    // Handle messages
    socket.on("message", async (data) => {
      try {
        const raw = data.toString();
        await handleClientMessage(socket, raw, redis, registry);
      } catch (err) {
        console.error("[WebSocket] Message error:", err);
        sendErrorMessage(socket, "INTERNAL_ERROR", "Error handling message");
      }
    });

    // Handle disconnect
    socket.on("close", async () => {
      registry.remove(socket.connectionId);
      const { remainingConnections } = await removeConnection(redis, socket.userId, socket.connectionId);
      console.log(`[WebSocket] Disconnected: user=${socket.userId}, conn=${socket.connectionId}, remaining=${remainingConnections}`);
    });

    socket.on("error", (err) => {
      console.error(`[WebSocket] Socket error (${socket.connectionId}):`, err);
    });
  });

  // 15-second heartbeat sweep
  const heartbeatInterval = setInterval(() => {
    for (const socket of registry.getAllConnections()) {
      if (!socket.isAlive) {
        console.log(`[WebSocket] Terminating inactive socket ${socket.connectionId}`);
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 15000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  server.listen(PORT, () => {
    console.log(`[WebSocket] Service listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("[WebSocket] Fatal startup error:", err);
  process.exit(1);
});
