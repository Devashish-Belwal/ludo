import type { Redis } from "ioredis";
import { RedisKeys } from "../keys";
import { publishGameEvent } from "../pubsub";
import {
  rollDice,
  moveToken,
  type GameState,
  type TokenKey,
  type RollDiceResult,
  type MoveTokenResult,
} from "@ludo/game-engine";
import { ServerEvents } from "@ludo/shared";

export interface PlayGameResult<T = unknown> {
  success: boolean;
  game?: GameState;
  result?: T;
  error?: string;
}

/**
 * Retrieves the authoritative GameState from Redis.
 */
export async function getAuthoritativeGameState(
  redis: Redis,
  gameId: string
): Promise<GameState | null> {
  const raw = await redis.get(RedisKeys.game(gameId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

/**
 * Authoritatively rolls the dice for the current player's turn per Section 11.1 & 12.
 */
export async function handleRollDice(
  redis: Redis,
  gameId: string,
  userId: string,
  simulatedRoll?: number
): Promise<PlayGameResult<RollDiceResult>> {
  const game = await getAuthoritativeGameState(redis, gameId);
  if (!game) {
    return { success: false, error: "GAME_NOT_FOUND" };
  }

  if (game.status !== "IN_PROGRESS") {
    return { success: false, error: "GAME_NOT_IN_PROGRESS" };
  }

  if (game.currentTurn === null) {
    return { success: false, error: "NO_ACTIVE_TURN" };
  }

  const activePlayer = game.players[game.currentTurn];
  if (!activePlayer || activePlayer.userId !== userId) {
    return { success: false, error: "NOT_YOUR_TURN" };
  }

  if (game.turnPhase !== "WAITING_FOR_ROLL") {
    return { success: false, error: "ALREADY_ROLLED" };
  }

  try {
    const diceResult = rollDice(game, simulatedRoll);
    const updatedGame = diceResult.nextState;

    // Persist updated game state in Redis
    await redis.set(RedisKeys.game(gameId), JSON.stringify(updatedGame));

    // Publish DICE_ROLLED event to all players in the room
    await publishGameEvent(redis, gameId, ServerEvents.DICE_ROLLED, {
      gameId,
      slot: game.currentTurn,
      userId,
      diceValue: diceResult.diceValue,
      consecutiveSixes: diceResult.consecutiveSixes,
      isThirdConsecutiveSix: diceResult.isThirdConsecutiveSix,
      legalMoves: diceResult.legalMoves,
      nextTurn: updatedGame.currentTurn,
      version: updatedGame.version,
    });

    // If turn automatically changed (e.g. no legal moves or 3rd consecutive six)
    if (updatedGame.currentTurn !== game.currentTurn) {
      await publishGameEvent(redis, gameId, ServerEvents.TURN_CHANGED, {
        gameId,
        previousTurn: game.currentTurn,
        currentTurn: updatedGame.currentTurn,
        version: updatedGame.version,
      });
    }

    // Broadcast full updated state snapshot
    await publishGameEvent(redis, gameId, ServerEvents.GAME_STATE, updatedGame);

    return { success: true, game: updatedGame, result: diceResult };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to roll dice";
    return { success: false, error: msg };
  }
}

/**
 * Authoritatively moves a token for the current player's turn per Section 11.2 & 12.
 */
export async function handleMoveToken(
  redis: Redis,
  gameId: string,
  userId: string,
  tokenKey: TokenKey
): Promise<PlayGameResult<MoveTokenResult>> {
  const game = await getAuthoritativeGameState(redis, gameId);
  if (!game) {
    return { success: false, error: "GAME_NOT_FOUND" };
  }

  if (game.status !== "IN_PROGRESS") {
    return { success: false, error: "GAME_NOT_IN_PROGRESS" };
  }

  if (game.currentTurn === null) {
    return { success: false, error: "NO_ACTIVE_TURN" };
  }

  const activePlayer = game.players[game.currentTurn];
  if (!activePlayer || activePlayer.userId !== userId) {
    return { success: false, error: "NOT_YOUR_TURN" };
  }

  if (game.turnPhase !== "WAITING_FOR_MOVE") {
    return { success: false, error: "MUST_ROLL_DICE_FIRST" };
  }

  try {
    const moveResult = moveToken(game, tokenKey);
    const updatedGame = moveResult.nextState;

    // Persist updated game state in Redis
    await redis.set(RedisKeys.game(gameId), JSON.stringify(updatedGame));

    // Publish TOKEN_MOVED event
    await publishGameEvent(redis, gameId, ServerEvents.TOKEN_MOVED, {
      gameId,
      slot: game.currentTurn,
      userId,
      tokenKey,
      fromPosition: moveResult.fromPosition,
      toPosition: moveResult.toPosition,
      hasBonusRoll: moveResult.hasBonusRoll,
      bonusReason: moveResult.bonusReason,
      version: updatedGame.version,
    });

    // If opponent token was captured
    if (moveResult.capturedTokens.length > 0) {
      for (const cap of moveResult.capturedTokens) {
        await publishGameEvent(redis, gameId, ServerEvents.PLAYER_CAPTURED, {
          gameId,
          capturingSlot: game.currentTurn,
          capturedSlot: cap.slot,
          capturedTokenKey: cap.tokenKey,
          capturedUserId: cap.userId,
          version: updatedGame.version,
        });
      }
    }

    // If player won
    if (moveResult.isWin) {
      await publishGameEvent(redis, gameId, ServerEvents.PLAYER_WON, {
        gameId,
        winnerSlot: game.currentTurn,
        winnerUserId: userId,
        version: updatedGame.version,
      });

      await publishGameEvent(redis, gameId, ServerEvents.GAME_COMPLETED, {
        gameId,
        winnerSlot: game.currentTurn,
        winnerUserId: userId,
        version: updatedGame.version,
      });
    }

    // If turn changed to next player
    if (updatedGame.currentTurn !== game.currentTurn) {
      await publishGameEvent(redis, gameId, ServerEvents.TURN_CHANGED, {
        gameId,
        previousTurn: game.currentTurn,
        currentTurn: updatedGame.currentTurn,
        version: updatedGame.version,
      });
    }

    // Broadcast full updated state snapshot
    await publishGameEvent(redis, gameId, ServerEvents.GAME_STATE, updatedGame);

    return { success: true, game: updatedGame, result: moveResult };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to move token";
    return { success: false, error: msg };
  }
}
