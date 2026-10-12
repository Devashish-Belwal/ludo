import type { GameState, TokenKey, TokenPosition, TurnPhase } from "./game.types";

export type BonusReason = "SIX_ROLLED" | "CAPTURE";

export interface CapturedTokenInfo {
  slot: number;
  tokenKey: TokenKey;
  userId: string;
}

export interface RollDiceResult {
  diceValue: number;
  consecutiveSixes: number;
  isThirdConsecutiveSix: boolean;
  legalMoves: TokenKey[];
  turnEnded: boolean;
  nextTurn: number;
  nextPhase: TurnPhase;
  nextState: GameState;
}

export interface MoveTokenResult {
  tokenKey: TokenKey;
  fromPosition: TokenPosition;
  toPosition: TokenPosition;
  capturedTokens: CapturedTokenInfo[];
  hasBonusRoll: boolean;
  bonusReason?: BonusReason;
  isWin: boolean;
  turnEnded: boolean;
  nextTurn: number;
  nextPhase: TurnPhase;
  nextState: GameState;
}

export type GameEngineErrorCode =
  | "GAME_NOT_IN_PROGRESS"
  | "NOT_PLAYER_TURN"
  | "INVALID_PHASE"
  | "INVALID_DICE_VALUE"
  | "ILLEGAL_MOVE"
  | "PLAYER_NOT_FOUND"
  | "SLOT_EMPTY";

export class GameEngineError extends Error {
  constructor(
    public readonly code: GameEngineErrorCode,
    message: string
  ) {
    super(message);
    this.name = "GameEngineError";
  }
}
