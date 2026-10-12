export type PlayerColor = "RED" | "GREEN" | "YELLOW" | "BLUE";

export type TokenKey = "token1" | "token2" | "token3" | "token4";

export type TokenPosition =
  | { type: "HOME" }
  | { type: "TRACK"; index: number }
  | { type: "FINAL_PATH"; index: number }
  | { type: "FINISHED" };

export interface GamePlayer {
  userId: string;
  username: string;
  color: PlayerColor;
  tokens: {
    token1: TokenPosition;
    token2: TokenPosition;
    token3: TokenPosition;
    token4: TokenPosition;
  };
}

export type GameStatus =
  | "WAITING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ABANDONED";

export type TurnPhase =
  | "WAITING_FOR_ROLL"
  | "WAITING_FOR_MOVE";

export interface GameState {
  gameId: string;
  status: GameStatus;
  players: [
    GamePlayer | null,
    GamePlayer | null,
    GamePlayer | null,
    GamePlayer | null
  ];
  currentTurn: number | null;
  turnPhase: TurnPhase;
  diceValue: number | null;
  consecutiveSixes: number;
  version: number;
  createdAt: number;
  lastActivityAt: number;
  turnStartedAt: number | null;
  winnerUserId?: string | null;
  winningSlot?: number | null;
}
