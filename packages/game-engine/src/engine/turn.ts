import type { GamePlayer, GameState } from "../types/game.types";
import { GameEngineError } from "../types/events.types";

/**
 * Returns the next active player slot index in clockwise order, skipping null/empty slots.
 */
export function getNextActiveTurn(
  players: GameState["players"],
  currentTurn: number
): number {
  for (let offset = 1; offset <= 4; offset++) {
    const nextSlot = (currentTurn + offset) % 4;
    const player = players[nextSlot];
    if (player !== null) {
      return nextSlot;
    }
  }
  throw new GameEngineError("PLAYER_NOT_FOUND", "No active players remaining in the game");
}

/**
 * Advances the turn to the next active player and resets turn counters.
 */
export function advanceTurn(state: GameState): GameState {
  if (state.currentTurn === null) {
    throw new GameEngineError("NOT_PLAYER_TURN", "Cannot advance turn when currentTurn is null");
  }

  const nextTurn = getNextActiveTurn(state.players, state.currentTurn);
  const now = Date.now();

  return {
    ...state,
    currentTurn: nextTurn,
    turnPhase: "WAITING_FOR_ROLL",
    diceValue: null,
    consecutiveSixes: 0,
    version: state.version + 1,
    turnStartedAt: now,
    lastActivityAt: now,
  };
}
