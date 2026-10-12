import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "../keys";
import { publishGameEvent } from "../pubsub";
import { removeUserActiveGame } from "./active-mapping";
import {
  advanceTurn,
  calculateLegalMoves,
  moveToken,
  removePlayer,
  type GameState,
} from "@ludo/game-engine";
import {
  ServerEvents,
  type OpponentDisconnectedPayload,
  type OpponentReconnectedPayload,
  type TurnTimeoutWarningPayload,
} from "@ludo/shared";

/**
 * Disconnect record stored per player in Redis hash `game:disconnect:{gameId}`
 */
export interface DisconnectRecord {
  gameId: string;
  userId: string;
  slot: number;
  disconnectedAt: number;
  gracePeriodSeconds: number;
}

/**
 * Records a player disconnect during an active game (Section 10.3 & 15.1).
 * Sets up 60-second recovery grace period before authoritative forfeiture/removal.
 */
export async function recordPlayerDisconnect(
  redis: Redis,
  gameId: string,
  userId: string,
  slot: number,
  gracePeriodSeconds: number = RedisTTL.DISCONNECT_REMOVAL
): Promise<OpponentDisconnectedPayload> {
  const hashKey = RedisKeys.gameDisconnect(gameId);
  const now = Date.now();

  const record: DisconnectRecord = {
    gameId,
    userId,
    slot,
    disconnectedAt: now,
    gracePeriodSeconds,
  };

  await redis.hset(hashKey, userId, JSON.stringify(record));
  // Expire the disconnect hash if all players abandon
  await redis.expire(hashKey, gracePeriodSeconds + 60);

  const payload: OpponentDisconnectedPayload = {
    gameId,
    userId,
    slot,
    gracePeriodSeconds,
    disconnectedAt: now,
  };

  await publishGameEvent(redis, gameId, ServerEvents.OPPONENT_DISCONNECTED, payload);

  return payload;
}

/**
 * Clears a player's disconnect status upon successful reconnection within grace period.
 * Broadcasts OPPONENT_RECONNECTED event to other room participants.
 */
export async function clearPlayerDisconnect(
  redis: Redis,
  gameId: string,
  userId: string
): Promise<OpponentReconnectedPayload | null> {
  const hashKey = RedisKeys.gameDisconnect(gameId);
  const raw = await redis.hget(hashKey, userId);

  if (!raw) {
    return null;
  }

  let record: DisconnectRecord;
  try {
    record = JSON.parse(raw);
  } catch {
    await redis.hdel(hashKey, userId);
    return null;
  }

  await redis.hdel(hashKey, userId);

  const payload: OpponentReconnectedPayload = {
    gameId,
    userId,
    slot: record.slot,
    reconnectedAt: Date.now(),
  };

  await publishGameEvent(redis, gameId, ServerEvents.OPPONENT_RECONNECTED, payload);

  return payload;
}

/**
 * Retrieves all currently disconnected players awaiting reconnection in a game.
 */
export async function getDisconnectedPlayers(
  redis: Redis,
  gameId: string
): Promise<DisconnectRecord[]> {
  const hashKey = RedisKeys.gameDisconnect(gameId);
  const all = await redis.hgetall(hashKey);

  const records: DisconnectRecord[] = [];
  for (const raw of Object.values(all)) {
    try {
      records.push(JSON.parse(raw) as DisconnectRecord);
    } catch {
      // Ignore corrupt entries
    }
  }

  return records;
}

/**
 * Evaluates disconnect grace periods for a game.
 * If 60 seconds have elapsed without player reconnection, authoritatively removes the player.
 */
export async function checkAndExpireDisconnectedPlayers(
  redis: Redis,
  gameId: string
): Promise<{ expiredUsers: string[]; updatedGame: GameState | null }> {
  const records = await getDisconnectedPlayers(redis, gameId);
  if (records.length === 0) {
    return { expiredUsers: [], updatedGame: null };
  }

  const rawGame = await redis.get(RedisKeys.game(gameId));
  if (!rawGame) {
    return { expiredUsers: [], updatedGame: null };
  }

  let game: GameState;
  try {
    game = JSON.parse(rawGame) as GameState;
  } catch {
    return { expiredUsers: [], updatedGame: null };
  }

  if (game.status !== "IN_PROGRESS") {
    // Only remove players for IN_PROGRESS games
    return { expiredUsers: [], updatedGame: game };
  }

  const now = Date.now();
  const hashKey = RedisKeys.gameDisconnect(gameId);
  const expiredUsers: string[] = [];
  let stateModified = false;

  for (const record of records) {
    const elapsedSeconds = (now - record.disconnectedAt) / 1000;
    if (elapsedSeconds >= record.gracePeriodSeconds) {
      // Grace period expired! Remove player from game
      expiredUsers.push(record.userId);
      await redis.hdel(hashKey, record.userId);
      await removeUserActiveGame(redis, record.userId);
      await redis.srem(RedisKeys.gamePlayers(gameId), record.userId);

      game = removePlayer(game, record.slot);
      stateModified = true;

      // Broadcast player left
      await publishGameEvent(redis, gameId, ServerEvents.GAME_PLAYER_LEFT, {
        gameId,
        userId: record.userId,
        slot: record.slot,
        reason: "DISCONNECT_TIMEOUT",
      });

      // Check if this caused game completion (e.g. 1 player remaining wins by forfeit)
      if (game.status === "COMPLETED") {
        await publishGameEvent(redis, gameId, ServerEvents.PLAYER_WON, {
          gameId,
          winnerSlot: game.winningSlot,
          winnerUserId: game.winnerUserId,
          reason: "OPPONENTS_FORFEIT",
          version: game.version,
        });

        await publishGameEvent(redis, gameId, ServerEvents.GAME_COMPLETED, {
          gameId,
          winnerSlot: game.winningSlot,
          winnerUserId: game.winnerUserId,
          reason: "OPPONENTS_FORFEIT",
          version: game.version,
        });

        await redis.srem(RedisKeys.gamesActive(), gameId);
      } else if (game.status === "ABANDONED") {
        await publishGameEvent(redis, gameId, ServerEvents.GAME_ABANDONED, {
          gameId,
          reason: "ALL_PLAYERS_DISCONNECTED",
          version: game.version,
        });

        await redis.srem(RedisKeys.gamesActive(), gameId);
      }
    }
  }

  if (stateModified) {
    await redis.set(RedisKeys.game(gameId), JSON.stringify(game));
    await publishGameEvent(redis, gameId, ServerEvents.GAME_STATE, game);
  }

  return { expiredUsers, updatedGame: stateModified ? game : null };
}

/**
 * Evaluates active turn timeout (10-second rule per Section 15.1).
 * If 7 seconds have elapsed, emits TURN_TIMEOUT_WARNING.
 * If 10 seconds have elapsed, automatically skips or auto-plays the turn.
 */
export async function checkTurnTimeout(
  redis: Redis,
  gameId: string
): Promise<{ timedOut: boolean; warningSent: boolean; updatedGame?: GameState }> {
  const rawGame = await redis.get(RedisKeys.game(gameId));
  if (!rawGame) {
    return { timedOut: false, warningSent: false };
  }

  let game: GameState;
  try {
    game = JSON.parse(rawGame) as GameState;
  } catch {
    return { timedOut: false, warningSent: false };
  }

  if (game.status !== "IN_PROGRESS" || game.currentTurn === null) {
    return { timedOut: false, warningSent: false };
  }

  const turnStartedAt = game.turnStartedAt || game.lastActivityAt;
  const now = Date.now();
  const elapsedMs = now - turnStartedAt;

  // 1. Send warning at 7 seconds (3 seconds remaining)
  if (elapsedMs >= 7000 && elapsedMs < 10000) {
    const warnKey = `game:timeout_warn:${gameId}:${game.currentTurn}:${game.version}`;
    const alreadyWarned = await redis.get(warnKey);

    if (!alreadyWarned) {
      await redis.set(warnKey, "1", "EX", 10);
      const remainingSeconds = Math.max(1, Math.ceil((10000 - elapsedMs) / 1000));
      const warningPayload: TurnTimeoutWarningPayload = {
        gameId,
        slot: game.currentTurn,
        secondsRemaining: remainingSeconds,
      };

      await publishGameEvent(redis, gameId, ServerEvents.TURN_TIMEOUT_WARNING, warningPayload);
      return { timedOut: false, warningSent: true, updatedGame: game };
    }

    return { timedOut: false, warningSent: false, updatedGame: game };
  }

  // 2. Full 10-second turn timeout
  if (elapsedMs >= 10000) {
    const previousTurn = game.currentTurn;
    let nextGame: GameState;

    if (game.turnPhase === "WAITING_FOR_ROLL") {
      // Player failed to roll in 10s: pass turn to next active player
      nextGame = advanceTurn(game);
    } else {
      // Player rolled but failed to move token in 10s: auto-move first legal token or advance
      const activePlayer = game.players[previousTurn];
      if (activePlayer && game.diceValue !== null) {
        const legalMoves = calculateLegalMoves(activePlayer, previousTurn, game.diceValue);
        if (legalMoves.length > 0) {
          const moveResult = moveToken(game, legalMoves[0]);
          nextGame = moveResult.nextState;
        } else {
          nextGame = advanceTurn(game);
        }
      } else {
        nextGame = advanceTurn(game);
      }
    }

    // Persist state in Redis
    await redis.set(RedisKeys.game(gameId), JSON.stringify(nextGame));

    // Broadcast TURN_SKIPPED event
    await publishGameEvent(redis, gameId, ServerEvents.TURN_SKIPPED, {
      gameId,
      slot: previousTurn,
      nextTurn: nextGame.currentTurn,
      reason: "TURN_TIMEOUT",
      version: nextGame.version,
    });

    // Broadcast TURN_CHANGED if turn changed
    if (nextGame.currentTurn !== previousTurn) {
      await publishGameEvent(redis, gameId, ServerEvents.TURN_CHANGED, {
        gameId,
        previousTurn,
        currentTurn: nextGame.currentTurn,
        version: nextGame.version,
      });
    }

    // Broadcast full updated state snapshot
    await publishGameEvent(redis, gameId, ServerEvents.GAME_STATE, nextGame);

    return { timedOut: true, warningSent: false, updatedGame: nextGame };
  }

  return { timedOut: false, warningSent: false, updatedGame: game };
}

/**
 * Sweeps all active games in Redis, enforcing turn timeouts and disconnect grace periods.
 */
export async function processAllActiveGamesRecovery(
  redis: Redis
): Promise<{ processedGames: number; timeoutsHandled: number; disconnectsExpired: number }> {
  const activeGameIds = await redis.smembers(RedisKeys.gamesActive());
  let timeoutsHandled = 0;
  let disconnectsExpired = 0;

  for (const gameId of activeGameIds) {
    try {
      const disconnectResult = await checkAndExpireDisconnectedPlayers(redis, gameId);
      if (disconnectResult.expiredUsers.length > 0) {
        disconnectsExpired += disconnectResult.expiredUsers.length;
      }

      const timeoutResult = await checkTurnTimeout(redis, gameId);
      if (timeoutResult.timedOut) {
        timeoutsHandled++;
      }

      // Check if game is completed or abandoned, and remove from active games set
      const raw = await redis.get(RedisKeys.game(gameId));
      if (raw) {
        const parsed = JSON.parse(raw) as GameState;
        if (parsed.status === "COMPLETED" || parsed.status === "ABANDONED") {
          await redis.srem(RedisKeys.gamesActive(), gameId);
        }
      } else {
        await redis.srem(RedisKeys.gamesActive(), gameId);
      }
    } catch (err) {
      console.error(`[Recovery] Error processing game ${gameId}:`, err);
    }
  }

  return {
    processedGames: activeGameIds.length,
    timeoutsHandled,
    disconnectsExpired,
  };
}
