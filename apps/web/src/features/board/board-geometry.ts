import {
  TRACK_COORDINATES,
  PLAYER_SLOT_CONFIG,
  SAFE_TRACK_INDICES,
  type BoardCoordinate,
  type TokenPosition,
  type TokenKey,
  type PlayerColor,
} from "@ludo/game-engine";

export interface CellInfo {
  row: number;
  col: number;
  type: "YARD" | "TRACK" | "FINAL_PATH" | "CENTER" | "EMPTY";
  color?: PlayerColor;
  trackIndex?: number;
  isSafe?: boolean;
  isStart?: boolean;
  finalPathIndex?: number;
  yardSlot?: number;
  yardTokenIndex?: number;
}

// Build a 15x15 lookup map of cell information
export function buildBoardGrid(): CellInfo[][] {
  const grid: CellInfo[][] = Array.from({ length: 15 }, (_, row) =>
    Array.from({ length: 15 }, (_, col) => ({
      row,
      col,
      type: "EMPTY",
    }))
  );

  // 1. Mark Red Home Yard (Top-Left, 6x6)
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      grid[r][c] = { row: r, col: c, type: "YARD", color: "RED", yardSlot: 0 };
    }
  }

  // 2. Mark Green Home Yard (Top-Right, 6x6)
  for (let r = 0; r < 6; r++) {
    for (let c = 9; c < 15; c++) {
      grid[r][c] = { row: r, col: c, type: "YARD", color: "GREEN", yardSlot: 1 };
    }
  }

  // 3. Mark Yellow Home Yard (Bottom-Right, 6x6)
  for (let r = 9; r < 15; r++) {
    for (let c = 9; c < 15; c++) {
      grid[r][c] = { row: r, col: c, type: "YARD", color: "YELLOW", yardSlot: 2 };
    }
  }

  // 4. Mark Blue Home Yard (Bottom-Left, 6x6)
  for (let r = 9; r < 15; r++) {
    for (let c = 0; c < 6; c++) {
      grid[r][c] = { row: r, col: c, type: "YARD", color: "BLUE", yardSlot: 3 };
    }
  }

  // 5. Mark Center Home Triangle (rows 6..8, cols 6..8)
  for (let r = 6; r <= 8; r++) {
    for (let c = 6; c <= 8; c++) {
      grid[r][c] = { row: r, col: c, type: "CENTER" };
    }
  }

  // 6. Mark 52 Track Squares
  TRACK_COORDINATES.forEach((coord, index) => {
    const isSafe = SAFE_TRACK_INDICES.includes(index);
    let color: PlayerColor | undefined;
    let isStart = false;

    if (index === 0) { color = "RED"; isStart = true; }
    else if (index === 13) { color = "GREEN"; isStart = true; }
    else if (index === 26) { color = "YELLOW"; isStart = true; }
    else if (index === 39) { color = "BLUE"; isStart = true; }

    grid[coord.row][coord.col] = {
      row: coord.row,
      col: coord.col,
      type: "TRACK",
      trackIndex: index,
      isSafe,
      isStart,
      color,
    };
  });

  // 7. Mark Final Paths for each color
  PLAYER_SLOT_CONFIG.forEach((slotCfg) => {
    slotCfg.finalPathCoordinates.forEach((coord, pathIdx) => {
      grid[coord.row][coord.col] = {
        row: coord.row,
        col: coord.col,
        type: "FINAL_PATH",
        color: slotCfg.color,
        finalPathIndex: pathIdx,
      };
    });
  });

  return grid;
}

export const TOKEN_KEYS: TokenKey[] = ["token1", "token2", "token3", "token4"];

/**
 * Returns exact { row, col } grid coordinates for any token position.
 */
export function getTokenCoordinate(
  position: TokenPosition,
  slotIndex: number,
  tokenKey: TokenKey
): BoardCoordinate {
  const slotCfg = PLAYER_SLOT_CONFIG[slotIndex];

  if (position.type === "HOME") {
    const tokenIndex = TOKEN_KEYS.indexOf(tokenKey);
    return slotCfg.homeYardCoordinates[tokenIndex >= 0 ? tokenIndex : 0];
  }

  if (position.type === "TRACK") {
    return TRACK_COORDINATES[position.index];
  }

  if (position.type === "FINAL_PATH") {
    return slotCfg.finalPathCoordinates[position.index];
  }

  // FINISHED: center finish triangle
  return slotCfg.finishCoordinate;
}
