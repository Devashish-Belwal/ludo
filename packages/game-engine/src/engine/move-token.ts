import type {
  GamePlayer,
  GameState,
  TokenKey,
} from "../types/game.types";
import {
  GameEngineError,
  type MoveTokenResult,
  type BonusReason,
} from "../types/events.types";
import { computeTargetPosition } from "./movement";
import { findCapturesAtPosition } from "./capture";
import { isPlayerWinner } from "./win";
import { getNextActiveTurn } from "./turn";

/**
 * Executes a token move for the current player using the active rolled diceValue.
 */
export function moveToken(
  state: GameState,
  tokenKey: TokenKey
): MoveTokenResult {
  if (state.status !== "IN_PROGRESS") {
    throw new GameEngineError("GAME_NOT_IN_PROGRESS", "Game is not in progress");
  }

  if (state.currentTurn === null) {
    throw new GameEngineError("NOT_PLAYER_TURN", "No current player turn active");
  }

  if (state.turnPhase !== "WAITING_FOR_MOVE") {
    throw new GameEngineError("INVALID_PHASE", `Cannot move token in ${state.turnPhase} phase`);
  }

  if (state.diceValue === null) {
    throw new GameEngineError("INVALID_PHASE", "No active dice roll to move with");
  }

  const currentSlot = state.currentTurn;
  const player = state.players[currentSlot];
  if (!player) {
    throw new GameEngineError("PLAYER_NOT_FOUND", `No player at slot ${currentSlot}`);
  }

  const fromPosition = player.tokens[tokenKey];
  const targetPosition = computeTargetPosition(fromPosition, currentSlot, state.diceValue);

  if (targetPosition === null) {
    throw new GameEngineError(
      "ILLEGAL_MOVE",
      `Token ${tokenKey} cannot legally move by ${state.diceValue} from ${fromPosition.type}`
    );
  }

  const now = Date.now();

  // Clone players array and update moving player's token
  const nextPlayers = state.players.map((p) =>
    p ? { ...p, tokens: { ...p.tokens } } : null
  ) as GameState["players"];

  const activePlayer = nextPlayers[currentSlot]!;
  activePlayer.tokens[tokenKey] = targetPosition;

  // Check captures
  const capturedTokens = findCapturesAtPosition(state, currentSlot, targetPosition);
  for (const capture of capturedTokens) {
    const opp = nextPlayers[capture.slot];
    if (opp) {
      opp.tokens[capture.tokenKey] = { type: "HOME" };
    }
  }

  // Check win condition
  const isWin = isPlayerWinner(activePlayer);
  if (isWin) {
    const nextState: GameState = {
      ...state,
      status: "COMPLETED",
      players: nextPlayers,
      winnerUserId: activePlayer.userId,
      winningSlot: currentSlot,
      diceValue: null,
      turnPhase: "WAITING_FOR_ROLL",
      version: state.version + 1,
      lastActivityAt: now,
    };

    return {
      tokenKey,
      fromPosition,
      toPosition: targetPosition,
      capturedTokens,
      hasBonusRoll: false,
      isWin: true,
      turnEnded: true,
      nextTurn: currentSlot,
      nextPhase: "WAITING_FOR_ROLL",
      nextState,
    };
  }

  // Determine bonus roll
  let hasBonusRoll = false;
  let bonusReason: BonusReason | undefined = undefined;

  if (capturedTokens.length > 0) {
    hasBonusRoll = true;
    bonusReason = "CAPTURE";
  } else if (state.diceValue === 6) {
    hasBonusRoll = true;
    bonusReason = "SIX_ROLLED";
  }

  if (hasBonusRoll) {
    // Current player keeps turn for bonus roll
    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      diceValue: null,
      turnPhase: "WAITING_FOR_ROLL",
      version: state.version + 1,
      turnStartedAt: now,
      lastActivityAt: now,
    };

    return {
      tokenKey,
      fromPosition,
      toPosition: targetPosition,
      capturedTokens,
      hasBonusRoll: true,
      bonusReason,
      isWin: false,
      turnEnded: false,
      nextTurn: currentSlot,
      nextPhase: "WAITING_FOR_ROLL",
      nextState,
    };
  }

  // Turn ends normally: advance turn to next active player
  const nextTurn = getNextActiveTurn(nextPlayers, currentSlot);
  const nextState: GameState = {
    ...state,
    players: nextPlayers,
    currentTurn: nextTurn,
    diceValue: null,
    turnPhase: "WAITING_FOR_ROLL",
    consecutiveSixes: 0,
    version: state.version + 1,
    turnStartedAt: now,
    lastActivityAt: now,
  };

  return {
    tokenKey,
    fromPosition,
    toPosition: targetPosition,
    capturedTokens,
    hasBonusRoll: false,
    isWin: false,
    turnEnded: true,
    nextTurn,
    nextPhase: "WAITING_FOR_ROLL",
    nextState,
  };
}
