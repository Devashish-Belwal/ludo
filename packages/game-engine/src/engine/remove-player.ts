import type { GameState, GamePlayer } from "../types/game.types";
import { getNextActiveTurn } from "./turn";

/**
 * Removes a player from the game (e.g. after disconnect expiry).
 * Slot is set to null, skipped in future turn rotations.
 * If 0 players remain, game becomes ABANDONED.
 * If only 1 player remains in an IN_PROGRESS game, the remaining player wins by abandonment.
 */
export function removePlayer(state: GameState, slotIndex: number): GameState {
  if (state.players[slotIndex] === null) {
    return state;
  }

  const nextPlayers = [...state.players] as GameState["players"];
  nextPlayers[slotIndex] = null;

  const now = Date.now();
  const remainingPlayers = nextPlayers
    .map((p, idx) => ({ player: p, slot: idx }))
    .filter((entry): entry is { player: GamePlayer; slot: number } => entry.player !== null);

  // If no players remain, game is ABANDONED
  if (remainingPlayers.length === 0) {
    return {
      ...state,
      players: nextPlayers,
      status: "ABANDONED",
      currentTurn: null,
      diceValue: null,
      consecutiveSixes: 0,
      version: state.version + 1,
      lastActivityAt: now,
    };
  }

  // If only 1 player remains during an IN_PROGRESS game, they win by forfeit
  if (state.status === "IN_PROGRESS" && remainingPlayers.length === 1) {
    const winner = remainingPlayers[0];
    return {
      ...state,
      players: nextPlayers,
      status: "COMPLETED",
      currentTurn: winner.slot,
      winnerUserId: winner.player.userId,
      winningSlot: winner.slot,
      diceValue: null,
      consecutiveSixes: 0,
      turnPhase: "WAITING_FOR_ROLL",
      version: state.version + 1,
      lastActivityAt: now,
    };
  }

  // If it was the removed player's turn, advance turn to next active player
  let nextTurn = state.currentTurn;
  let turnPhase = state.turnPhase;
  let consecutiveSixes = state.consecutiveSixes;
  let diceValue = state.diceValue;
  let turnStartedAt = state.turnStartedAt;

  if (state.currentTurn === slotIndex) {
    nextTurn = getNextActiveTurn(nextPlayers, slotIndex);
    turnPhase = "WAITING_FOR_ROLL";
    consecutiveSixes = 0;
    diceValue = null;
    turnStartedAt = now;
  }

  return {
    ...state,
    players: nextPlayers,
    currentTurn: nextTurn,
    turnPhase,
    consecutiveSixes,
    diceValue,
    version: state.version + 1,
    turnStartedAt,
    lastActivityAt: now,
  };
}
