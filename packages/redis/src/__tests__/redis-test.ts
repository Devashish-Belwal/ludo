import {
  createRedisClient,
  registerConnection,
  removeConnection,
  refreshPresenceHeartbeat,
  getPresence,
  getMultiplePresences,
  setUserActiveGame,
  getUserActiveGame,
  removeUserActiveGame,
  saveProcessedAction,
  getProcessedAction,
  publishGameEvent,
  publishUserEvent,
  RESERVE_MATCHMAKING_BATCH_LUA,
  RedisKeys,
  RedisChannels,
} from "../index";

async function runRedisTests() {
  console.log("Starting Milestone 5 Redis Infrastructure & Presence Tests...");

  const redis = createRedisClient();
  const sub = createRedisClient();

  await redis.connect();
  await sub.connect();
  console.log("✓ Connected to Redis successfully.");

  const testUserId = `test-user-${Date.now()}`;
  const testConn1 = `conn-tab-1-${Date.now()}`;
  const testConn2 = `conn-tab-2-${Date.now()}`;

  // 1. Connection registration & Multi-tab tracking
  console.log("Testing multi-connection registration...");
  await registerConnection(redis, testUserId, testConn1);
  await registerConnection(redis, testUserId, testConn2);

  const connCount = await redis.scard(RedisKeys.userConnections(testUserId));
  if (connCount !== 2) {
    throw new Error(`Expected 2 active connections, got ${connCount}`);
  }
  console.log("✓ Multiple tabs tracked correctly under connections:userId (count = 2).");

  // 2. Presence Status & TTL check
  console.log("Testing presence reading and TTL...");
  const presence = await getPresence(redis, testUserId);
  if (presence.status !== "ONLINE") {
    throw new Error(`Expected status ONLINE, got ${presence.status}`);
  }
  const ttl = await redis.ttl(RedisKeys.presence(testUserId));
  if (ttl <= 0 || ttl > 45) {
    throw new Error(`Expected presence TTL <= 45s, got ${ttl}`);
  }
  console.log(`✓ Presence verified: status=${presence.status}, TTL=${ttl}s.`);

  // 3. Heartbeat refresh
  console.log("Testing heartbeat TTL refresh...");
  const refreshed = await refreshPresenceHeartbeat(redis, testUserId);
  if (!refreshed) throw new Error("Failed to refresh heartbeat!");
  const refreshedTtl = await redis.ttl(RedisKeys.presence(testUserId));
  console.log(`✓ Heartbeat refreshed presence TTL to ${refreshedTtl}s.`);

  // 4. Tab disconnect & grace period
  console.log("Testing closing 1 tab out of 2...");
  const { remainingConnections } = await removeConnection(redis, testUserId, testConn1);
  if (remainingConnections !== 1) {
    throw new Error(`Expected 1 remaining connection, got ${remainingConnections}`);
  }
  const stillOnline = await getPresence(redis, testUserId);
  if (stillOnline.status !== "ONLINE") {
    throw new Error("User should remain ONLINE while second tab is connected!");
  }
  console.log("✓ User remains ONLINE when only one tab disconnects.");

  // Remove final tab
  await removeConnection(redis, testUserId, testConn2);

  // 5. Active Game Mappings
  console.log("Testing active-game mappings...");
  const testGameId = `game-uuid-${Date.now()}`;
  await setUserActiveGame(redis, testUserId, testGameId);
  const activeGame = await getUserActiveGame(redis, testUserId);
  if (activeGame !== testGameId) {
    throw new Error(`Expected active game ${testGameId}, got ${activeGame}`);
  }
  console.log("✓ Active game mapping verified:", activeGame);

  await removeUserActiveGame(redis, testUserId);
  const cleared = await getUserActiveGame(redis, testUserId);
  if (cleared !== null) {
    throw new Error("Active game mapping was not cleared!");
  }
  console.log("✓ Active game mapping cleared successfully.");

  // 6. Idempotency Records
  console.log("Testing action idempotency storage (10m TTL)...");
  const testActionId = `action-roll-${Date.now()}`;
  await saveProcessedAction(redis, testUserId, testActionId, "ROLL_DICE", { diceValue: 6 });
  const cachedAction = await getProcessedAction<{ diceValue: number }>(redis, testUserId, testActionId);
  if (!cachedAction || cachedAction.result.diceValue !== 6) {
    throw new Error("Failed to retrieve idempotency record!");
  }
  const actionTtl = await redis.ttl(RedisKeys.wsAction(testUserId, testActionId));
  console.log(`✓ Idempotency record retrieved with TTL=${actionTtl}s.`);

  // 7. Pub/Sub event delivery
  console.log("Testing Redis Pub/Sub delivery...");
  let pubsubReceived = false;
  const testChannel = "pubsub-test-channel";
  await sub.subscribe(RedisChannels.gameEvents(testChannel));
  sub.on("message", (channel, message) => {
    const data = JSON.parse(message);
    if (data.type === "TEST_EVENT") {
      pubsubReceived = true;
    }
  });

  await publishGameEvent(redis, "pubsub-test-channel", "TEST_EVENT", { test: true });
  await new Promise((r) => setTimeout(r, 200));

  if (!pubsubReceived) {
    throw new Error("Pub/Sub message was not received!");
  }
  console.log("✓ Redis Pub/Sub event published and received cleanly.");

  // 8. Atomic Lua script test for 4-player reservation
  console.log("Testing atomic Lua reservation script...");
  const qKey = RedisKeys.matchmakingQueue();
  const u1 = "u1", u2 = "u2", u3 = "u3", u4 = "u4";
  const now = Date.now();
  await redis.zadd(qKey, now, u1, now + 1, u2, now + 2, u3, now + 3, u4);

  const batchId = `batch-${now}`;
  const res = await redis.eval(RESERVE_MATCHMAKING_BATCH_LUA, 1, qKey, batchId, u1, u2, u3, u4);
  if (res !== 1) {
    throw new Error(`Expected Lua reservation script to return 1, got ${res}`);
  }
  const remQueue = await redis.zcard(qKey);
  const r1 = await redis.get(RedisKeys.matchmakingReserved(u1));
  if (remQueue !== 0 || r1 !== batchId) {
    throw new Error("Lua reservation script failed to reserve users atomically!");
  }
  console.log("✓ Atomic Lua 4-player reservation script verified successfully.");

  // Clean up test keys
  await redis.del(
    RedisKeys.presence(testUserId),
    RedisKeys.userConnections(testUserId),
    RedisKeys.wsAction(testUserId, testActionId),
    RedisKeys.matchmakingReserved(u1),
    RedisKeys.matchmakingReserved(u2),
    RedisKeys.matchmakingReserved(u3),
    RedisKeys.matchmakingReserved(u4)
  );

  await redis.quit();
  await sub.quit();
  console.log("All Milestone 5 Redis & Presence tests completed successfully!");
}

runRedisTests().catch((err) => {
  console.error("Redis test failed:", err);
  process.exit(1);
});
