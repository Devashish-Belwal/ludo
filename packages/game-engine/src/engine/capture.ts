import { isSafeTrackIndex } from "../board/board.config";
import type { GameState, TokenPosition } from "../types/game.types";
import type { CapturedTokenInfo } from "../types/events.types";
import { TOKEN_KEYS } from "./movement";

/**
 * Checks if landing on targetPosition captures any opponent tokens.
 * Safe squares and final path tokens cannot be captured.
 */
export function findCapturesAtPosition(
  state: GameState,
  currentSlot: number,
  targetPosition: TokenPosition
): CapturedTokenInfo[] {
  // Only non-safe main track positions can produce a capture
  if (targetPosition.type !== "TRACK") {
    return [];
  }

  if (isSafeTrackIndex(targetPosition.index)) {
    return [];
  }

  const captured: CapturedTokenInfo[] = [];

  for (let slot = 0; slot < 4; slot++) {
    if (slot === currentSlot) continue;
    const opponent = state.players[slot];
    if (!opponent) continue;

    for (const key of TOKEN_KEYS) {
      const pos = opponent.tokens[key];
      if (pos.type === "TRACK" && pos.index === targetPosition.index) {
        captured.push({
          slot,
          tokenKey: key,
          userId: opponent.userId,
        });
      }
    }
  }

  return captured;
}
