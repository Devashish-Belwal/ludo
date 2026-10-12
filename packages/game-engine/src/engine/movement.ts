import {
  PLAYER_SLOT_CONFIG,
  TOTAL_STEPS_TO_FINISH,
  FINAL_PATH_LENGTH,
} from "../board/board.config";
import type {
  GamePlayer,
  GameState,
  TokenKey,
  TokenPosition,
} from "../types/game.types";

export const TOKEN_KEYS: TokenKey[] = ["token1", "token2", "token3", "token4"];

/**
 * Computes step count (0..56) from start track position for a given token position.
 * Returns -1 if token is in HOME.
 */
export function getTokenStepCount(
  position: TokenPosition,
  slotIndex: number
): number {
  if (position.type === "HOME") {
    return -1;
  }
  if (position.type === "FINISHED") {
    return TOTAL_STEPS_TO_FINISH; // 56
  }
  if (position.type === "FINAL_PATH") {
    return 51 + position.index;
  }
  if (position.type === "TRACK") {
    const startTrackIndex = PLAYER_SLOT_CONFIG[slotIndex].startTrackIndex;
    return (position.index - startTrackIndex + 52) % 52;
  }
  return -1;
}

/**
 * Computes destination position for a token given diceValue (1..6).
 * Returns null if the move is illegal (e.g. not a 6 to leave home, overshoot finish, already finished).
 */
export function computeTargetPosition(
  currentPosition: TokenPosition,
  slotIndex: number,
  diceValue: number
): TokenPosition | null {
  const startTrackIndex = PLAYER_SLOT_CONFIG[slotIndex].startTrackIndex;

  // 1. Leaving Home (Requires a six)
  if (currentPosition.type === "HOME") {
    if (diceValue === 6) {
      return { type: "TRACK", index: startTrackIndex };
    }
    return null;
  }

  // 2. Already finished cannot move
  if (currentPosition.type === "FINISHED") {
    return null;
  }

  // 3. Movement on Track or Final Path
  const currentSteps = getTokenStepCount(currentPosition, slotIndex);
  if (currentSteps < 0) {
    return null;
  }

  const targetSteps = currentSteps + diceValue;

  // Exact finishing: overshooting 56 is illegal
  if (targetSteps > TOTAL_STEPS_TO_FINISH) {
    return null;
  }

  // Exact finishing
  if (targetSteps === TOTAL_STEPS_TO_FINISH) {
    return { type: "FINISHED" };
  }

  // Enters or continues on protected final path (steps 51..55)
  if (targetSteps >= 51) {
    const finalPathIndex = targetSteps - 51;
    return { type: "FINAL_PATH", index: finalPathIndex };
  }

  // Continues on shared main track (steps 0..50)
  const targetTrackIndex = (startTrackIndex + targetSteps) % 52;
  return { type: "TRACK", index: targetTrackIndex };
}

/**
 * Calculates which tokens the player can legally move for the given dice roll.
 */
export function calculateLegalMoves(
  player: GamePlayer,
  slotIndex: number,
  diceValue: number
): TokenKey[] {
  const legalTokens: TokenKey[] = [];

  for (const key of TOKEN_KEYS) {
    const pos = player.tokens[key];
    const target = computeTargetPosition(pos, slotIndex, diceValue);
    if (target !== null) {
      legalTokens.push(key);
    }
  }

  return legalTokens;
}
