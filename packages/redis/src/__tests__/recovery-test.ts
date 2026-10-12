import { createRedisClient } from "../client";
import { RedisKeys, RedisTTL } from "../keys";
import { createGame, rollDice } from "@ludo/game-engine";
import {
  getProcessedAction,
  saveProcessedAction,
} from "../game/idempotency";
import {
  recordPlayerDisconnect,
  clearPlayerDisconnect,
  getDisconnectedPlayers,
  checkAndExpireDisconnectedPlayers,
  checkTurnTimeout,
  processAllActiveGamesRecovery,
} from "../game/recovery";
import { getAuthoritativeGameState } from "../game/play-game";
import { setUserActiveGame } from "../game/active-mapping";

async function runMilestone11Tests() {
  console.log("Starting Milestone 11: Reliability, Recovery & Timeouts Automated Tests...\n");

  const testRedis = createRedisClient();
  await testRedis.connect();

  const user1 = { userId: `user-1-${Date.now()}`, username: "PlayerOne" };
  const user2 = { userId: `user-2-${Date.now()}`, username: "PlayerTwo" };
  const gameId = `recovery-game-${Date.now()}`;

  try {
    // 1. Action Idempotency Record & Caching (Section 16.4)
    console.log("1. Testing action idempotency caching (10-minute TTL)...");
    const actionId = `action-${crypto.randomUUID()}`;
    const initialCheck = await getProcessedAction(testRedis, user1.userId, actionId);
    if (initialCheck !== null) throw new Error("Expected initial check to be null");

    const sampleResult = { diceValue: 6, legalMoves: ["token1"] };
    await saveProcessedAction(testRedis, user1.userId, actionId, "DICE_ROLLED", sampleResult);

    const cachedCheck = await getProcessedAction<typeof sampleResult>(
      testRedis,
      user1.userId,
      actionId
    );
    if (!cachedCheck) throw new Error("Expected cached record to exist!");
    if (cachedCheck.commandType !== "DICE_ROLLED") throw new Error("Cached commandType mismatch");
    if (cachedCheck.result.diceValue !== 6) throw new Error("Cached diceValue mismatch");

    const actionTtl = await testRedis.ttl(RedisKeys.wsAction(user1.userId, actionId));
    if (actionTtl < 500 || actionTtl > 600) {
      throw new Error(`Expected idempotency TTL ~600s, got ${actionTtl}s`);
    }
    console.log(`✓ Idempotency record saved and retrieved cleanly with TTL=${actionTtl}s.`);

    // 2. Initialize 2-Player Game for Turn Timeout & Disconnect Tests
    console.log("\n2. Initializing 2-player active game...");
    const game = createGame(gameId, [user1, user2], { status: "IN_PROGRESS" });
    await testRedis.set(RedisKeys.game(gameId), JSON.stringify(game));
    await testRedis.sadd(RedisKeys.gamesActive(), gameId);
    await setUserActiveGame(testRedis, user1.userId, gameId);
    await setUserActiveGame(testRedis, user2.userId, gameId);
    console.log("✓ Game initialized in IN_PROGRESS state.");

    // 3. Turn Timeout Warning (7 seconds)
    console.log("\n3. Testing 7-second turn timeout warning...");
    // Simulate game turn started 8 seconds ago
    const warnedGame = {
      ...game,
      turnStartedAt: Date.now() - 8000,
    };
    await testRedis.set(RedisKeys.game(gameId), JSON.stringify(warnedGame));

    const warnResult = await checkTurnTimeout(testRedis, gameId);
    if (warnResult.timedOut) throw new Error("Should not time out at 8 seconds");
    if (!warnResult.warningSent) throw new Error("Expected warningSent to be true at 8 seconds");
    console.log("✓ Turn timeout warning emitted successfully.");

    // 4. Turn Timeout Auto-Skip (10 seconds)
    console.log("\n4. Testing 10-second turn timeout auto-skip (waiting for roll)...");
    // Simulate game turn started 11 seconds ago in WAITING_FOR_ROLL phase
    const timedOutGame = {
      ...game,
      currentTurn: 0,
      turnPhase: "WAITING_FOR_ROLL" as const,
      turnStartedAt: Date.now() - 11000,
    };
    await testRedis.set(RedisKeys.game(gameId), JSON.stringify(timedOutGame));

    const timeoutResult = await checkTurnTimeout(testRedis, gameId);
    if (!timeoutResult.timedOut) throw new Error("Expected turn to time out after 10s");
    if (timeoutResult.updatedGame?.currentTurn !== 1) {
      throw new Error(`Expected turn to advance to slot 1, got ${timeoutResult.updatedGame?.currentTurn}`);
    }
    console.log("✓ Turn auto-skipped: passed clockwise to Slot 1 (PlayerTwo).");

    // 5. Turn Timeout Auto-Move (waiting for move)
    console.log("\n5. Testing 10-second turn timeout auto-move (waiting for move)...");
    // Slot 1 rolled a 6: has legal moves from HOME!
    const rollResult = rollDice(timeoutResult.updatedGame!, 6);
    const rolledGame = {
      ...rollResult.nextState,
      turnStartedAt: Date.now() - 11000, // Timed out waiting to select token
    };
    await testRedis.set(RedisKeys.game(gameId), JSON.stringify(rolledGame));

    const autoMoveResult = await checkTurnTimeout(testRedis, gameId);
    if (!autoMoveResult.timedOut) throw new Error("Expected auto-move on turn timeout");
    // First legal move token1 should have moved from HOME to TRACK!
    const slot1Token1 = autoMoveResult.updatedGame?.players[1]?.tokens.token1;
    if (!slot1Token1 || slot1Token1.type !== "TRACK") {
      throw new Error(`Expected token1 to auto-move to TRACK, got ${JSON.stringify(slot1Token1)}`);
    }
    console.log("✓ Turn auto-moved: first legal token automatically played on timeout.");

    // 6. Disconnect Grace Period Recording & Listing
    console.log("\n6. Testing player disconnect grace period (60s)...");
    const disconnectPayload = await recordPlayerDisconnect(testRedis, gameId, user1.userId, 0, 60);
    if (disconnectPayload.gracePeriodSeconds !== 60) throw new Error("Expected 60s grace period");

    const disconnectedList = await getDisconnectedPlayers(testRedis, gameId);
    if (disconnectedList.length !== 1) throw new Error(`Expected 1 disconnected player, got ${disconnectedList.length}`);
    if (disconnectedList[0].userId !== user1.userId) throw new Error("User ID mismatch in disconnect list");
    console.log("✓ Disconnect grace period recorded and verified in Redis.");

    // 7. Player Reconnect within Grace Period
    console.log("\n7. Testing player reconnect within grace period...");
    const reconnected = await clearPlayerDisconnect(testRedis, gameId, user1.userId);
    if (!reconnected) throw new Error("Expected clearPlayerDisconnect to return payload");
    if (reconnected.userId !== user1.userId) throw new Error("Reconnected userId mismatch");

    const afterReconnectList = await getDisconnectedPlayers(testRedis, gameId);
    if (afterReconnectList.length !== 0) throw new Error("Expected empty disconnected list after reconnect");
    console.log("✓ Player reconnected cleanly: disconnect record cleared.");

    // 8. Disconnect Grace Period Expiration & Forfeit Resolution
    console.log("\n8. Testing disconnect grace period expiration & forfeit win...");
    // Record disconnect 65 seconds ago (grace period expired)
    const expiredRecord = {
      gameId,
      userId: user1.userId,
      slot: 0,
      disconnectedAt: Date.now() - 65000,
      gracePeriodSeconds: 60,
    };
    await testRedis.hset(RedisKeys.gameDisconnect(gameId), user1.userId, JSON.stringify(expiredRecord));

    const expirationResult = await checkAndExpireDisconnectedPlayers(testRedis, gameId);
    if (!expirationResult.expiredUsers.includes(user1.userId)) {
      throw new Error("Expected user1 to be expired");
    }
    if (expirationResult.updatedGame?.status !== "COMPLETED") {
      throw new Error(`Expected game to complete by forfeit, got ${expirationResult.updatedGame?.status}`);
    }
    if (expirationResult.updatedGame?.winnerUserId !== user2.userId) {
      throw new Error(`Expected remaining player (user2) to win, got ${expirationResult.updatedGame?.winnerUserId}`);
    }
    console.log("✓ Disconnect expired: Player 1 removed, Player 2 awarded forfeit victory!");

    // 9. Global Active Games Recovery Worker Cycle
    console.log("\n9. Testing processAllActiveGamesRecovery cycle...");
    const sweepResult = await processAllActiveGamesRecovery(testRedis);
    if (sweepResult.processedGames === 0) {
      // Completed game was removed from active set
      console.log("✓ Completed game removed from active set during sweep.");
    }

    const isActiveGameStill = await testRedis.sismember(RedisKeys.gamesActive(), gameId);
    if (isActiveGameStill) throw new Error("Completed game should be removed from games:active");
    console.log("✓ Completed game cleanly cleaned up from games:active set.");

    // 10. Consecutive AFK Strikes (3 Strikes = Auto-Forfeit)
    console.log("\n10. Testing consecutive AFK strikes (3 strikes auto-forfeit)...");
    const afkGameId = `test-afk-${Date.now()}`;
    const afkGame = createGame(
      afkGameId,
      [
        { userId: "afk-u1", username: "AfkPlayer1" },
        { userId: "afk-u2", username: "ActivePlayer2" },
      ],
      { status: "IN_PROGRESS" }
    );
    afkGame.currentTurn = 0;
    afkGame.turnStartedAt = Date.now() - 11000;

    await testRedis.set(RedisKeys.game(afkGameId), JSON.stringify(afkGame));
    await testRedis.sadd(RedisKeys.gamesActive(), afkGameId);
    await testRedis.sadd(RedisKeys.gamePlayers(afkGameId), "afk-u1", "afk-u2");

    // Strike 1 for slot 0
    const afkRes1 = await checkTurnTimeout(testRedis, afkGameId);
    if (!afkRes1.timedOut) throw new Error("Expected strike 1 timeout");
    const strike1Count = await testRedis.hget(RedisKeys.gameTimeouts(afkGameId), "0");
    if (strike1Count !== "1") throw new Error(`Expected strike count 1, got ${strike1Count}`);

    // Set slot 0 turn again 11s ago -> Strike 2
    const afkGame2 = { ...afkRes1.updatedGame!, currentTurn: 0, turnStartedAt: Date.now() - 11000 };
    await testRedis.set(RedisKeys.game(afkGameId), JSON.stringify(afkGame2));
    const afkRes2 = await checkTurnTimeout(testRedis, afkGameId);
    if (!afkRes2.timedOut) throw new Error("Expected strike 2 timeout");
    const strike2Count = await testRedis.hget(RedisKeys.gameTimeouts(afkGameId), "0");
    if (strike2Count !== "2") throw new Error(`Expected strike count 2, got ${strike2Count}`);

    // Set slot 0 turn again 11s ago -> Strike 3 (Forfeit!)
    const afkGame3 = { ...afkRes2.updatedGame!, currentTurn: 0, turnStartedAt: Date.now() - 11000 };
    await testRedis.set(RedisKeys.game(afkGameId), JSON.stringify(afkGame3));
    const afkRes3 = await checkTurnTimeout(testRedis, afkGameId);
    if (!afkRes3.timedOut) throw new Error("Expected strike 3 timeout");
    if (afkRes3.updatedGame?.status !== "COMPLETED") {
      throw new Error(`Expected game COMPLETED after 3 AFK strikes, got ${afkRes3.updatedGame?.status}`);
    }
    if (afkRes3.updatedGame?.winnerUserId !== "afk-u2") {
      throw new Error(`Expected active opponent to win, got ${afkRes3.updatedGame?.winnerUserId}`);
    }
    console.log("✓ 3 consecutive AFK strikes triggered authoritative forfeit victory for opponent!");

    // 11. 5-Minute Game Inactivity Auto-Abandonment
    console.log("\n11. Testing 5-minute total game inactivity auto-abandonment...");
    const idleGameId = `test-idle-${Date.now()}`;
    const idleGame = createGame(
      idleGameId,
      [
        { userId: "idle-u1", username: "IdlePlayer1" },
        { userId: "idle-u2", username: "IdlePlayer2" },
      ],
      { status: "IN_PROGRESS" }
    );
    idleGame.lastActivityAt = Date.now() - 305000; // 5 minutes and 5 seconds ago
    idleGame.turnStartedAt = Date.now() - 305000;

    await testRedis.set(RedisKeys.game(idleGameId), JSON.stringify(idleGame));
    await testRedis.sadd(RedisKeys.gamesActive(), idleGameId);
    await testRedis.sadd(RedisKeys.gamePlayers(idleGameId), "idle-u1", "idle-u2");

    const idleRes = await checkTurnTimeout(testRedis, idleGameId);
    if (!idleRes.timedOut) throw new Error("Expected idle game timeout");
    if (idleRes.updatedGame?.status !== "ABANDONED") {
      throw new Error(`Expected game ABANDONED after 5 minutes inactivity, got ${idleRes.updatedGame?.status}`);
    }
    const idleStillActive = await testRedis.sismember(RedisKeys.gamesActive(), idleGameId);
    if (idleStillActive) throw new Error("Idle abandoned game should be removed from games:active");
    console.log("✓ 5 minutes of total game inactivity successfully auto-abandoned match and freed player reservations!");

    console.log("\n ALL 11 MILESTONE 11 TESTS PASSED SUCCESSFULLY! \n");
  } finally {
    // Teardown test keys
    await testRedis.del(RedisKeys.game(gameId));
    await testRedis.del(RedisKeys.gameDisconnect(gameId));
    await testRedis.del(RedisKeys.gameTimeouts(gameId));
    await testRedis.srem(RedisKeys.gamesActive(), gameId);
    await testRedis.quit();
  }
}

runMilestone11Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
