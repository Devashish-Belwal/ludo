import type { GameState } from "../types/game.types";
import { GameEngineError, type RollDiceResult } from "../types/events.types";
import { calculateLegalMoves } from "./movement";
import { getNextActiveTurn } from "./turn";

/**
 * Executes a dice roll for the current player's turn.
 * Accepts an optional simulatedRoll (1..6) for deterministic engine testing.
 */
export function rollDice(
  state: GameState,
  simulatedRoll?: number
): RollDiceResult {
  if (state.status !== "IN_PROGRESS") {
    throw new GameEngineError("GAME_NOT_IN_PROGRESS", "Game is not in progress");
  }

  if (state.currentTurn === null) {
    throw new GameEngineError("NOT_PLAYER_TURN", "No current player turn active");
  }

  if (state.turnPhase !== "WAITING_FOR_ROLL") {
    throw new GameEngineError("INVALID_PHASE", `Cannot roll dice in ${state.turnPhase} phase`);
  }

  const currentSlot = state.currentTurn;
  const player = state.players[currentSlot];
  if (!player) {
    throw new GameEngineError("PLAYER_NOT_FOUND", `No player at slot ${currentSlot}`);
  }

  const diceValue = simulatedRoll ?? Math.floor(Math.random() * 6) + 1;
  if (!Number.isInteger(diceValue) || diceValue < 1 || diceValue > 6) {
    throw new GameEngineError("INVALID_DICE_VALUE", `Dice roll must be integer between 1 and 6, got ${diceValue}`);
  }

  const now = Date.now();

  // 1. Check for Consecutive Sixes
  if (diceValue === 6) {
    const consecutiveSixes = state.consecutiveSixes + 1;

    // Rule: 3 consecutive sixes -> third six invalidated, turn ends immediately
    if (consecutiveSixes === 3) {
      const nextTurn = getNextActiveTurn(state.players, currentSlot);
      const nextState: GameState = {
        ...state,
        currentTurn: nextTurn,
        turnPhase: "WAITING_FOR_ROLL",
        diceValue: null,
        consecutiveSixes: 0,
        version: state.version + 1,
        turnStartedAt: now,
        lastActivityAt: now,
      };

      return {
        diceValue: 6,
        consecutiveSixes: 3,
        isThirdConsecutiveSix: true,
        legalMoves: [],
        turnEnded: true,
        nextTurn,
        nextPhase: "WAITING_FOR_ROLL",
        nextState,
      };
    }

    // 1st or 2nd six
    const legalMoves = calculateLegalMoves(player, currentSlot, 6);

    // If player has no legal moves even with a 6 (e.g. all finished / blocked)
    if (legalMoves.length === 0) {
      const nextTurn = getNextActiveTurn(state.players, currentSlot);
      const nextState: GameState = {
        ...state,
        currentTurn: nextTurn,
        turnPhase: "WAITING_FOR_ROLL",
        diceValue: null,
        consecutiveSixes: 0,
        version: state.version + 1,
        turnStartedAt: now,
        lastActivityAt: now,
      };

      return {
        diceValue: 6,
        consecutiveSixes,
        isThirdConsecutiveSix: false,
        legalMoves: [],
        turnEnded: true,
        nextTurn,
        nextPhase: "WAITING_FOR_ROLL",
        nextState,
      };
    }

    // Legal moves available for six
    const nextState: GameState = {
      ...state,
      turnPhase: "WAITING_FOR_MOVE",
      diceValue: 6,
      consecutiveSixes,
      version: state.version + 1,
      lastActivityAt: now,
    };

    return {
      diceValue: 6,
      consecutiveSixes,
      isThirdConsecutiveSix: false,
      legalMoves,
      turnEnded: false,
      nextTurn: currentSlot,
      nextPhase: "WAITING_FOR_MOVE",
      nextState,
    };
  }

  // 2. Non-six roll (1..5)
  const legalMoves = calculateLegalMoves(player, currentSlot, diceValue);

  // If no legal moves available, turn ends immediately
  if (legalMoves.length === 0) {
    const nextTurn = getNextActiveTurn(state.players, currentSlot);
    const nextState: GameState = {
      ...state,
      currentTurn: nextTurn,
      turnPhase: "WAITING_FOR_ROLL",
      diceValue: null,
      consecutiveSixes: 0,
      version: state.version + 1,
      turnStartedAt: now,
      lastActivityAt: now,
    };

    return {
      diceValue,
      consecutiveSixes: state.consecutiveSixes,
      isThirdConsecutiveSix: false,
      legalMoves: [],
      turnEnded: true,
      nextTurn,
      nextPhase: "WAITING_FOR_ROLL",
      nextState,
    };
  }

  // Legal moves available for non-six roll
  const nextState: GameState = {
    ...state,
    turnPhase: "WAITING_FOR_MOVE",
    diceValue,
    consecutiveSixes: state.consecutiveSixes,
    version: state.version + 1,
    lastActivityAt: now,
  };

  return {
    diceValue,
    consecutiveSixes: state.consecutiveSixes,
    isThirdConsecutiveSix: false,
    legalMoves,
    turnEnded: false,
    nextTurn: currentSlot,
    nextPhase: "WAITING_FOR_MOVE",
    nextState,
  };
}
