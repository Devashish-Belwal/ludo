import {
  createRedisClient,
  joinMatchmakingQueue,
  cancelMatchmakingQueue,
  getMatchmakingStatus,
  processMatchmakingBatch,
  recoverMatchmakingBatches,
  MatchmakingWorker,
  setUserActiveGame,
  removeUserActiveGame,
  RedisKeys,
} from "../index";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runMilestone9Tests() {
  console.log("Starting Milestone 9: Public Matchmaking Automated Tests...\n");

  const redis = createRedisClient();
  await redis.connect();

  const testUser1 = `test-user-m9-1-${Date.now()}`;
  const testUser2 = `test-user-m9-2-${Date.now()}`;
  const testUser3 = `test-user-m9-3-${Date.now()}`;
  const testUser4 = `test-user-m9-4-${Date.now()}`;
  const testUser5 = `test-user-m9-5-${Date.now()}`;
  const allUsers = [testUser1, testUser2, testUser3, testUser4, testUser5];

  const cleanup = async () => {
    await redis.del(RedisKeys.matchmakingQueue());
    for (const uid of allUsers) {
      await redis.del(RedisKeys.matchmakingReserved(uid));
      await removeUserActiveGame(redis, uid);
    }
  };

  try {
    await cleanup();

    // 1. Queue Entry & Timestamp Score
    console.log("1. Testing queue entry with timestamp score (FIFO)...");
    const res1 = await joinMatchmakingQueue(redis, testUser1, "Alice");
    assert(res1.success === true, "User1 should successfully join queue");
    assert(res1.queueEntryTime > 0, "Queue entry time should be positive timestamp");

    const status1 = await getMatchmakingStatus(redis, testUser1);
    assert(status1.inQueue === true, "User1 status should report inQueue");
    assert(status1.inGame === false, "User1 should not be inGame");
    assert(status1.isReserved === false, "User1 should not be reserved");
    console.log("   ✓ User queued successfully with timestamp score");

    // 2. Duplicate Entry Prevention
    console.log("2. Testing duplicate entry prevention...");
    const resDup = await joinMatchmakingQueue(redis, testUser1, "Alice");
    assert(resDup.success === true, "Duplicate entry should return success");
    assert(resDup.alreadyQueued === true, "Duplicate entry should flag alreadyQueued");
    assert(resDup.queueEntryTime === res1.queueEntryTime, "Duplicate entry should keep original timestamp score");

    const countAfterDup = await redis.zcard(RedisKeys.matchmakingQueue());
    assert(countAfterDup === 1, "Queue length should remain 1");
    console.log("   ✓ Duplicate entry correctly prevented and preserved original score");

    // 3. Active Game Prevention
    console.log("3. Testing active-game user entry rejection...");
    await setUserActiveGame(redis, testUser2, "active-game-existing");
    const resActive = await joinMatchmakingQueue(redis, testUser2, "Bob");
    assert(resActive.success === false, "User with active game should be rejected");
    assert(resActive.error === "ALREADY_IN_GAME", "Error code must be ALREADY_IN_GAME");
    await removeUserActiveGame(redis, testUser2);
    console.log("   ✓ User with active game rejected from matchmaking");

    // 4. Cancellation Workflow
    console.log("4. Testing queue cancellation workflow...");
    const cancelRes = await cancelMatchmakingQueue(redis, testUser1);
    assert(cancelRes.success === true, "Cancellation should succeed");
    assert(cancelRes.status === "CANCELLED", "Cancellation status should be CANCELLED");

    const statusAfterCancel = await getMatchmakingStatus(redis, testUser1);
    assert(statusAfterCancel.inQueue === false, "User should no longer be in queue");
    console.log("   ✓ Queue cancellation succeeded cleanly");

    // 5. Cancellation vs Reservation Race Rules (Section 14.3)
    console.log("5. Testing cancellation rejection when reservation won race...");
    await joinMatchmakingQueue(redis, testUser1, "Alice");
    // Simulate reservation won race
    await redis.set(RedisKeys.matchmakingReserved(testUser1), "batch-race-test");
    const cancelRaceRes = await cancelMatchmakingQueue(redis, testUser1);
    assert(cancelRaceRes.success === false, "Cancellation must fail when reservation won race");
    assert(cancelRaceRes.status === "RESERVED", "Status must be RESERVED");
    assert(cancelRaceRes.error === "MATCHMAKING_ALREADY_RESERVED", "Error must be MATCHMAKING_ALREADY_RESERVED");
    await redis.del(RedisKeys.matchmakingReserved(testUser1));
    await redis.del(RedisKeys.matchmakingQueue());
    console.log("   ✓ Cancellation correctly rejected when reserved in a batch");

    // 6. Atomic 4-Player Batch Processing & FIFO Ordering
    console.log("6. Testing 4-player FIFO matchmaking and atomic reservation...");
    await joinMatchmakingQueue(redis, testUser1, "Alice");
    await new Promise((r) => setTimeout(r, 10));
    await joinMatchmakingQueue(redis, testUser2, "Bob");
    await new Promise((r) => setTimeout(r, 10));
    await joinMatchmakingQueue(redis, testUser3, "Charlie");
    await new Promise((r) => setTimeout(r, 10));

    // Only 3 players queued: should not match yet
    const batchUnderfilled = await processMatchmakingBatch(redis);
    assert(batchUnderfilled === null, "Underfilled queue (3 players) must not produce a match");

    // 4th and 5th players join
    await joinMatchmakingQueue(redis, testUser4, "David");
    await new Promise((r) => setTimeout(r, 10));
    await joinMatchmakingQueue(redis, testUser5, "Eve");

    const game = await processMatchmakingBatch(redis);
    assert(game !== null, "Queue with >= 4 players must produce a matched game");
    assert(game!.status === "IN_PROGRESS", "Matched public game must start IN_PROGRESS");
    assert(game!.players.length === 4, "Game must have 4 player slots");

    // Check exact FIFO color assignments: Slot 0 (RED), 1 (GREEN), 2 (YELLOW), 3 (BLUE)
    assert(game!.players[0]?.userId === testUser1, "Slot 0 must be User 1 (Alice)");
    assert(game!.players[0]?.color === "RED", "Slot 0 color must be RED");
    assert(game!.players[1]?.userId === testUser2, "Slot 1 must be User 2 (Bob)");
    assert(game!.players[1]?.color === "GREEN", "Slot 1 color must be GREEN");
    assert(game!.players[2]?.userId === testUser3, "Slot 2 must be User 3 (Charlie)");
    assert(game!.players[2]?.color === "YELLOW", "Slot 2 color must be YELLOW");
    assert(game!.players[3]?.userId === testUser4, "Slot 3 must be User 4 (David)");
    assert(game!.players[3]?.color === "BLUE", "Slot 3 color must be BLUE");

    // Check 5th user (Eve) remained in queue
    const remainingInQueue = await redis.zrange(RedisKeys.matchmakingQueue(), 0, -1);
    assert(remainingInQueue.length === 1 && remainingInQueue[0] === testUser5, "5th user must remain in queue");

    // Check active game mappings established for all 4 players
    for (const uid of [testUser1, testUser2, testUser3, testUser4]) {
      const activeGame = await redis.get(RedisKeys.userActiveGame(uid));
      assert(activeGame === game!.gameId, `User ${uid} active game mapping must point to ${game!.gameId}`);
      const reservedKey = await redis.get(RedisKeys.matchmakingReserved(uid));
      assert(reservedKey === null, `Reservation key for ${uid} must be cleared`);
    }
    console.log("   ✓ 4 players matched atomically with color slots and active mappings");

    // 7. Worker Recovery: Incomplete RESERVED Batch
    console.log("7. Testing worker recovery for incomplete RESERVED batch...");
    await cleanup();
    const batchIdRecovery = `batch-rec-${Date.now()}`;
    const gameIdRecovery = `game-rec-${Date.now()}`;
    const batchUsers = [testUser1, testUser2, testUser3, testUser4];

    for (const uid of batchUsers) {
      await redis.set(RedisKeys.matchmakingReserved(uid), batchIdRecovery, "EX", 120);
    }
    const incompleteBatch = {
      batchId: batchIdRecovery,
      gameId: gameIdRecovery,
      userIds: batchUsers,
      status: "RESERVED" as const,
      createdAt: Date.now(),
    };
    await redis.set(RedisKeys.matchmakingBatch(batchIdRecovery), JSON.stringify(incompleteBatch));

    const recoveredCount = await recoverMatchmakingBatches(redis);
    assert(recoveredCount > 0, "Worker recovery should recover incomplete batch");

    for (const uid of batchUsers) {
      const activeGame = await redis.get(RedisKeys.userActiveGame(uid));
      assert(activeGame === gameIdRecovery, `Recovered user ${uid} must have active game ${gameIdRecovery}`);
      const reservedKey = await redis.get(RedisKeys.matchmakingReserved(uid));
      assert(reservedKey === null, `Recovered reservation key for ${uid} must be deleted`);
    }
    console.log("   ✓ Incomplete RESERVED batch successfully recovered and finalized");

    // 8. Worker Recovery: Stale Batches Release Reservations
    console.log("8. Testing worker recovery releasing stale reservations (> 60s)...");
    await cleanup();
    const batchIdStale = `batch-stale-${Date.now()}`;
    for (const uid of batchUsers) {
      await redis.set(RedisKeys.matchmakingReserved(uid), batchIdStale, "EX", 120);
    }
    const staleBatch = {
      batchId: batchIdStale,
      gameId: `game-stale-${Date.now()}`,
      userIds: batchUsers,
      status: "RESERVED" as const,
      createdAt: Date.now() - 70000, // 70s ago
    };
    await redis.set(RedisKeys.matchmakingBatch(batchIdStale), JSON.stringify(staleBatch));

    const staleRecovered = await recoverMatchmakingBatches(redis);
    assert(staleRecovered > 0, "Stale batch should be processed");

    for (const uid of batchUsers) {
      const reservedKey = await redis.get(RedisKeys.matchmakingReserved(uid));
      assert(reservedKey === null, `Stale reservation for ${uid} must be safely released`);
    }
    console.log("   ✓ Stale reservations safely released without stuck players");

    // 9. MatchmakingWorker Background Loop
    console.log("9. Testing MatchmakingWorker background loop...");
    await cleanup();
    const worker = new MatchmakingWorker(redis, { intervalMs: 100 });
    await worker.start();

    try {
      await joinMatchmakingQueue(redis, testUser1, "P1");
      await joinMatchmakingQueue(redis, testUser2, "P2");
      await joinMatchmakingQueue(redis, testUser3, "P3");
      await joinMatchmakingQueue(redis, testUser4, "P4");

      // Wait 350ms for worker tick
      await new Promise((r) => setTimeout(r, 400));

      const ag1 = await redis.get(RedisKeys.userActiveGame(testUser1));
      const ag2 = await redis.get(RedisKeys.userActiveGame(testUser2));
      const ag3 = await redis.get(RedisKeys.userActiveGame(testUser3));
      const ag4 = await redis.get(RedisKeys.userActiveGame(testUser4));

      assert(ag1 !== null && ag1 === ag2 && ag2 === ag3 && ag3 === ag4, "Worker should match all 4 players into same game");
      const qLen = await redis.zcard(RedisKeys.matchmakingQueue());
      assert(qLen === 0, "Queue should be completely empty after worker match");
      console.log("   ✓ MatchmakingWorker automatically matched players via periodic tick");
    } finally {
      worker.stop();
    }

    console.log("\nAll 9 Milestone 9 automated test suites passed successfully! ✓\n");
  } finally {
    await cleanup();
    await redis.quit();
  }
}

runMilestone9Tests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
