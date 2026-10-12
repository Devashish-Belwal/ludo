import { PLAYER_SLOT_CONFIG } from "../board/board.config";
import type {
  GamePlayer,
  GameState,
  GameStatus,
  PlayerColor,
  TokenPosition,
} from "../types/game.types";
import { GameEngineError } from "../types/events.types";

export function createInitialTokens(): GamePlayer["tokens"] {
  return {
    token1: { type: "HOME" },
    token2: { type: "HOME" },
    token3: { type: "HOME" },
    token4: { type: "HOME" },
  };
}

export function createPlayer(
  userId: string,
  username: string,
  slotIndex: number
): GamePlayer {
  const color = PLAYER_SLOT_CONFIG[slotIndex].color;
  return {
    userId,
    username,
    color,
    tokens: createInitialTokens(),
  };
}

export interface InitialPlayerInput {
  userId: string;
  username: string;
  slot?: number;
}

export function createGame(
  gameId: string,
  initialPlayers: InitialPlayerInput[],
  options?: {
    status?: GameStatus;
  }
): GameState {
  const status: GameStatus = options?.status ?? (initialPlayers.length >= 2 ? "IN_PROGRESS" : "WAITING");
  const players: [GamePlayer | null, GamePlayer | null, GamePlayer | null, GamePlayer | null] = [
    null,
    null,
    null,
    null,
  ];

  for (const input of initialPlayers) {
    let targetSlot = input.slot;
    if (targetSlot === undefined || players[targetSlot] !== null) {
      targetSlot = players.findIndex((p) => p === null);
      if (targetSlot === -1) {
        throw new GameEngineError("SLOT_EMPTY", "Game is already full (maximum 4 players)");
      }
    }
    players[targetSlot] = createPlayer(input.userId, input.username, targetSlot);
  }

  const now = Date.now();
  const firstActiveSlot = players.findIndex((p) => p !== null);
  const currentTurn = status === "IN_PROGRESS" ? (firstActiveSlot !== -1 ? firstActiveSlot : null) : null;

  return {
    gameId,
    status,
    players,
    currentTurn,
    turnPhase: "WAITING_FOR_ROLL",
    diceValue: null,
    consecutiveSixes: 0,
    version: 1,
    createdAt: now,
    lastActivityAt: now,
    turnStartedAt: status === "IN_PROGRESS" ? now : null,
  };
}

/**
 * Host explicitly starts a private WAITING game.
 * Requires at least 2 human players (Section 13.4).
 */
export function startGame(state: GameState): GameState {
  if (state.status !== "WAITING") {
    throw new GameEngineError("GAME_NOT_IN_PROGRESS", "Only a WAITING game can be started");
  }

  const activePlayers = state.players.filter((p): p is GamePlayer => p !== null);
  if (activePlayers.length < 2) {
    throw new GameEngineError("GAME_NOT_IN_PROGRESS", "At least 2 players are required to start a game");
  }

  const firstActiveSlot = state.players.findIndex((p) => p !== null);
  const now = Date.now();

  return {
    ...state,
    status: "IN_PROGRESS",
    currentTurn: firstActiveSlot,
    turnPhase: "WAITING_FOR_ROLL",
    diceValue: null,
    consecutiveSixes: 0,
    version: state.version + 1,
    lastActivityAt: now,
    turnStartedAt: now,
  };
}

/**
 * Adds a player to a WAITING game slot.
 */
export function addPlayerToGame(
  state: GameState,
  player: { userId: string; username: string },
  preferredSlot?: number
): GameState {
  if (state.status !== "WAITING") {
    throw new GameEngineError("GAME_NOT_IN_PROGRESS", "Cannot join a game that is not in WAITING state");
  }

  let slot = preferredSlot;
  if (slot === undefined || state.players[slot] !== null) {
    slot = state.players.findIndex((p) => p === null);
    if (slot === -1) {
      throw new GameEngineError("SLOT_EMPTY", "Game is full");
    }
  }

  const nextPlayers = [...state.players] as GameState["players"];
  nextPlayers[slot] = createPlayer(player.userId, player.username, slot);

  return {
    ...state,
    players: nextPlayers,
    version: state.version + 1,
    lastActivityAt: Date.now(),
  };
}
