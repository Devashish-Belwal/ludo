import type { PlayerColor } from "./game.types";

export interface BoardCoordinate {
  row: number; // 0..14 on 15x15 board
  col: number; // 0..14 on 15x15 board
}

export interface PlayerSlotConfig {
  slot: number; // 0, 1, 2, 3
  color: PlayerColor;
  startTrackIndex: number;
  exitTrackIndex: number; // last track square before entering final path
  homeYardCoordinates: [BoardCoordinate, BoardCoordinate, BoardCoordinate, BoardCoordinate];
  finalPathCoordinates: [BoardCoordinate, BoardCoordinate, BoardCoordinate, BoardCoordinate, BoardCoordinate];
  finishCoordinate: BoardCoordinate;
}

export interface BoardConfig {
  totalTrackSquares: number; // 52
  finalPathLength: number; // 5
  totalStepsToFinish: number; // 56
  safeTrackIndices: number[]; // [0, 8, 13, 21, 26, 34, 39, 47]
  trackCoordinates: BoardCoordinate[]; // length 52
  slots: [PlayerSlotConfig, PlayerSlotConfig, PlayerSlotConfig, PlayerSlotConfig];
}
