"use server";

import { auth } from "@/lib/auth";
import {
  redis,
  handleRollDice,
  handleMoveToken,
  getAuthoritativeGameState,
  type TokenKey,
} from "@ludo/redis";
import type { GameState, RollDiceResult, MoveTokenResult } from "@ludo/game-engine";

export interface GameActionResult<T = unknown> {
  success: boolean;
  data?: T;
  game?: GameState;
  error?: string;
}

/**
 * Server Action to authoritatively roll the dice.
 */
export async function rollDiceAction(
  gameId: string
): Promise<GameActionResult<RollDiceResult>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const res = await handleRollDice(redis, gameId, session.user.id);
    if (!res.success) {
      return { success: false, error: res.error || "Failed to roll dice" };
    }

    return {
      success: true,
      data: res.result,
      game: res.game,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to roll dice";
    return { success: false, error: msg };
  }
}

/**
 * Server Action to authoritatively move a selected token.
 */
export async function moveTokenAction(
  gameId: string,
  tokenKey: TokenKey
): Promise<GameActionResult<MoveTokenResult>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const res = await handleMoveToken(redis, gameId, session.user.id, tokenKey);
    if (!res.success) {
      return { success: false, error: res.error || "Failed to move token" };
    }

    return {
      success: true,
      data: res.result,
      game: res.game,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to move token";
    return { success: false, error: msg };
  }
}

/**
 * Server Action to fetch current authoritative game snapshot.
 */
export async function getGameStateAction(
  gameId: string
): Promise<GameActionResult<GameState>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const game = await getAuthoritativeGameState(redis, gameId);
    if (!game) {
      return { success: false, error: "Game not found" };
    }

    return {
      success: true,
      data: game,
      game,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch game state";
    return { success: false, error: msg };
  }
}
