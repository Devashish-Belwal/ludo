import type { BoardConfig, BoardCoordinate, PlayerSlotConfig } from "../types/board.types";

export const TOTAL_TRACK_SQUARES = 52;
export const FINAL_PATH_LENGTH = 5;
export const TOTAL_STEPS_TO_FINISH = 56;

/**
 * Standard Ludo safe squares:
 * - 4 starting squares: 0 (Red), 13 (Green), 26 (Yellow), 39 (Blue)
 * - 4 star/globe squares: 8, 21, 34, 47
 */
export const SAFE_TRACK_INDICES: number[] = [0, 8, 13, 21, 26, 34, 39, 47];

export function isSafeTrackIndex(trackIndex: number): boolean {
  return SAFE_TRACK_INDICES.includes(trackIndex);
}

/**
 * Exact 15x15 grid coordinates for the 52 perimeter track squares (clockwise).
 * row: 0..14, col: 0..14
 */
export const TRACK_COORDINATES: BoardCoordinate[] = [
  // Red starting arm (west arm, bottom row moving right)
  { row: 6, col: 1 },  // 0: Red start (Safe)
  { row: 6, col: 2 },  // 1
  { row: 6, col: 3 },  // 2
  { row: 6, col: 4 },  // 3
  { row: 6, col: 5 },  // 4
  // North arm (moving up along left column)
  { row: 5, col: 6 },  // 5
  { row: 4, col: 6 },  // 6
  { row: 3, col: 6 },  // 7
  { row: 2, col: 6 },  // 8: Safe (Star)
  { row: 1, col: 6 },  // 9
  { row: 0, col: 6 },  // 10
  // Top edge
  { row: 0, col: 7 },  // 11
  { row: 0, col: 8 },  // 12
  // North arm (moving down along right column)
  { row: 1, col: 8 },  // 13: Green start (Safe)
  { row: 2, col: 8 },  // 14
  { row: 3, col: 8 },  // 15
  { row: 4, col: 8 },  // 16
  { row: 5, col: 8 },  // 17
  // East arm (moving right along top row)
  { row: 6, col: 9 },  // 18
  { row: 6, col: 10 }, // 19
  { row: 6, col: 11 }, // 20
  { row: 6, col: 12 }, // 21: Safe (Star)
  { row: 6, col: 13 }, // 22
  { row: 6, col: 14 }, // 23
  // Right edge
  { row: 7, col: 14 }, // 24
  { row: 8, col: 14 }, // 25
  // East arm (moving left along bottom row)
  { row: 8, col: 13 }, // 26: Yellow start (Safe)
  { row: 8, col: 12 }, // 27
  { row: 8, col: 11 }, // 28
  { row: 8, col: 10 }, // 29
  { row: 8, col: 9 },  // 30
  // South arm (moving down along right column)
  { row: 9, col: 8 },  // 31
  { row: 10, col: 8 }, // 32
  { row: 11, col: 8 }, // 33
  { row: 12, col: 8 }, // 34: Safe (Star)
  { row: 13, col: 8 }, // 35
  { row: 14, col: 8 }, // 36
  // Bottom edge
  { row: 14, col: 7 }, // 37
  { row: 14, col: 6 }, // 38
  // South arm (moving up along left column)
  { row: 13, col: 6 }, // 39: Blue start (Safe)
  { row: 12, col: 6 }, // 40
  { row: 11, col: 6 }, // 41
  { row: 10, col: 6 }, // 42
  { row: 9, col: 6 },  // 43
  // West arm (moving left along bottom row)
  { row: 8, col: 5 },  // 44
  { row: 8, col: 4 },  // 45
  { row: 8, col: 3 },  // 46
  { row: 8, col: 2 },  // 47: Safe (Star)
  { row: 8, col: 1 },  // 48
  { row: 8, col: 0 },  // 49
  // Left edge
  { row: 7, col: 0 },  // 50: Red exit track square before home column
  { row: 6, col: 0 },  // 51
];

export const PLAYER_SLOT_CONFIG: [
  PlayerSlotConfig,
  PlayerSlotConfig,
  PlayerSlotConfig,
  PlayerSlotConfig
] = [
  // Slot 0: RED (Top-Left Yard, enters at track 0, exits at track 50)
  {
    slot: 0,
    color: "RED",
    startTrackIndex: 0,
    exitTrackIndex: 50,
    homeYardCoordinates: [
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 3, col: 2 },
      { row: 3, col: 3 },
    ],
    finalPathCoordinates: [
      { row: 7, col: 1 },
      { row: 7, col: 2 },
      { row: 7, col: 3 },
      { row: 7, col: 4 },
      { row: 7, col: 5 },
    ],
    finishCoordinate: { row: 7, col: 6 },
  },

  // Slot 1: GREEN (Top-Right Yard, enters at track 13, exits at track 11)
  {
    slot: 1,
    color: "GREEN",
    startTrackIndex: 13,
    exitTrackIndex: 11,
    homeYardCoordinates: [
      { row: 2, col: 11 },
      { row: 2, col: 12 },
      { row: 3, col: 11 },
      { row: 3, col: 12 },
    ],
    finalPathCoordinates: [
      { row: 1, col: 7 },
      { row: 2, col: 7 },
      { row: 3, col: 7 },
      { row: 4, col: 7 },
      { row: 5, col: 7 },
    ],
    finishCoordinate: { row: 6, col: 7 },
  },

  // Slot 2: YELLOW (Bottom-Right Yard, enters at track 26, exits at track 24)
  {
    slot: 2,
    color: "YELLOW",
    startTrackIndex: 26,
    exitTrackIndex: 24,
    homeYardCoordinates: [
      { row: 11, col: 11 },
      { row: 11, col: 12 },
      { row: 12, col: 11 },
      { row: 12, col: 12 },
    ],
    finalPathCoordinates: [
      { row: 7, col: 13 },
      { row: 7, col: 12 },
      { row: 7, col: 11 },
      { row: 7, col: 10 },
      { row: 7, col: 9 },
    ],
    finishCoordinate: { row: 7, col: 8 },
  },

  // Slot 3: BLUE (Bottom-Left Yard, enters at track 39, exits at track 37)
  {
    slot: 3,
    color: "BLUE",
    startTrackIndex: 39,
    exitTrackIndex: 37,
    homeYardCoordinates: [
      { row: 11, col: 2 },
      { row: 11, col: 3 },
      { row: 12, col: 2 },
      { row: 12, col: 3 },
    ],
    finalPathCoordinates: [
      { row: 13, col: 7 },
      { row: 12, col: 7 },
      { row: 11, col: 7 },
      { row: 10, col: 7 },
      { row: 9, col: 7 },
    ],
    finishCoordinate: { row: 8, col: 7 },
  },
];

export const BOARD_CONFIG: BoardConfig = {
  totalTrackSquares: TOTAL_TRACK_SQUARES,
  finalPathLength: FINAL_PATH_LENGTH,
  totalStepsToFinish: TOTAL_STEPS_TO_FINISH,
  safeTrackIndices: SAFE_TRACK_INDICES,
  trackCoordinates: TRACK_COORDINATES,
  slots: PLAYER_SLOT_CONFIG,
};
