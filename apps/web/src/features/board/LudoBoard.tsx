"use client";

import { useMemo } from "react";
import {
  buildBoardGrid,
  getTokenCoordinate,
  TOKEN_KEYS,
  type CellInfo,
} from "./board-geometry";
import type {
  GameState,
  TokenKey,
  PlayerColor,
} from "@ludo/game-engine";
import { Star } from "lucide-react";

interface LudoBoardProps {
  game: GameState;
  currentUserId: string;
  legalMoves: TokenKey[];
  onSelectToken: (tokenKey: TokenKey) => void;
  disabled?: boolean;
}

interface PlacedToken {
  slot: number;
  color: PlayerColor;
  tokenKey: TokenKey;
  isLegal: boolean;
  isCurrentUser: boolean;
}

export function LudoBoard({
  game,
  currentUserId,
  legalMoves,
  onSelectToken,
  disabled = false,
}: LudoBoardProps) {
  const grid = useMemo(() => buildBoardGrid(), []);

  // Determine current player's slot and turn status
  const currentSlot = game.currentTurn;
  const isMyTurn = currentSlot !== null && game.players[currentSlot]?.userId === currentUserId;

  // Map each grid cell coordinate "r,c" to tokens positioned there
  const tokensByCell = useMemo(() => {
    const map = new Map<string, PlacedToken[]>();

    game.players.forEach((player, slot) => {
      if (!player) return;
      const isPlayerUser = player.userId === currentUserId;

      TOKEN_KEYS.forEach((tKey) => {
        const pos = player.tokens[tKey];
        if (!pos) return;

        const coord = getTokenCoordinate(pos, slot, tKey);
        const key = `${coord.row},${coord.col}`;

        const isLegal =
          isMyTurn &&
          slot === currentSlot &&
          game.turnPhase === "WAITING_FOR_MOVE" &&
          legalMoves.includes(tKey);

        const list = map.get(key) || [];
        list.push({
          slot,
          color: player.color,
          tokenKey: tKey,
          isLegal,
          isCurrentUser: isPlayerUser,
        });
        map.set(key, list);
      });
    });

    return map;
  }, [game, currentUserId, currentSlot, isMyTurn, legalMoves]);

  const COLOR_STYLES = {
    RED: {
      yardBg: "bg-rose-600",
      trackBg: "bg-rose-500",
      tokenBg: "bg-gradient-to-tr from-rose-700 to-rose-500 border-rose-300",
      tokenGlow: "ring-4 ring-amber-400 animate-pulse shadow-lg shadow-amber-400/50",
    },
    GREEN: {
      yardBg: "bg-emerald-600",
      trackBg: "bg-emerald-500",
      tokenBg: "bg-gradient-to-tr from-emerald-700 to-emerald-500 border-emerald-300",
      tokenGlow: "ring-4 ring-amber-400 animate-pulse shadow-lg shadow-amber-400/50",
    },
    YELLOW: {
      yardBg: "bg-amber-500",
      trackBg: "bg-amber-400",
      tokenBg: "bg-gradient-to-tr from-amber-600 to-yellow-400 border-yellow-200",
      tokenGlow: "ring-4 ring-amber-400 animate-pulse shadow-lg shadow-amber-400/50",
    },
    BLUE: {
      yardBg: "bg-sky-600",
      trackBg: "bg-sky-500",
      tokenBg: "bg-gradient-to-tr from-sky-700 to-sky-500 border-sky-300",
      tokenGlow: "ring-4 ring-amber-400 animate-pulse shadow-lg shadow-amber-400/50",
    },
  };

  const renderCellContent = (cell: CellInfo) => {
    const key = `${cell.row},${cell.col}`;
    const tokens = tokensByCell.get(key) || [];

    // Render tokens if present
    if (tokens.length > 0) {
      return (
        <div className="w-full h-full flex items-center justify-center relative p-0.5">
          {tokens.length === 1 ? (
            <button
              onClick={() => tokens[0].isLegal && !disabled && onSelectToken(tokens[0].tokenKey)}
              disabled={!tokens[0].isLegal || disabled}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all transform shadow-md ${
                COLOR_STYLES[tokens[0].color].tokenBg
              } ${
                tokens[0].isLegal
                  ? `cursor-pointer scale-110 z-20 ${COLOR_STYLES[tokens[0].color].tokenGlow}`
                  : "cursor-default"
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-white/70 shadow-inner" />
            </button>
          ) : (
            // Multiple tokens clustered
            <div className="flex flex-wrap items-center justify-center gap-0.5 w-full h-full">
              {tokens.map((t, idx) => (
                <button
                  key={idx}
                  onClick={() => t.isLegal && !disabled && onSelectToken(t.tokenKey)}
                  disabled={!t.isLegal || disabled}
                  className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border flex items-center justify-center transition-transform ${
                    COLOR_STYLES[t.color].tokenBg
                  } ${
                    t.isLegal
                      ? `cursor-pointer scale-125 z-20 ${COLOR_STYLES[t.color].tokenGlow}`
                      : "cursor-default"
                  }`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Safe Star Icon
    if (cell.isSafe) {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 fill-amber-400 drop-shadow-sm" />
        </div>
      );
    }

    return null;
  };

  const getCellClassName = (cell: CellInfo) => {
    const base = "relative border border-zinc-300 dark:border-zinc-700/80 flex items-center justify-center transition-colors select-none";

    // 1. Center Finish Area (rows 6..8, cols 6..8)
    if (cell.type === "CENTER") {
      // Create center triangles
      if (cell.row === 6 && cell.col === 6) return `${base} bg-rose-500/80`;
      if (cell.row === 6 && cell.col === 7) return `${base} bg-emerald-500/80`;
      if (cell.row === 6 && cell.col === 8) return `${base} bg-emerald-500/80`;
      if (cell.row === 7 && cell.col === 6) return `${base} bg-rose-500/80`;
      if (cell.row === 7 && cell.col === 7) return `${base} bg-zinc-900 border-none`;
      if (cell.row === 7 && cell.col === 8) return `${base} bg-amber-500/80`;
      if (cell.row === 8 && cell.col === 6) return `${base} bg-sky-500/80`;
      if (cell.row === 8 && cell.col === 7) return `${base} bg-sky-500/80`;
      if (cell.row === 8 && cell.col === 8) return `${base} bg-amber-500/80`;
      return `${base} bg-zinc-800`;
    }

    // 2. Home Yards
    if (cell.type === "YARD") {
      if (cell.color === "RED") return `${base} bg-rose-600 border-rose-700`;
      if (cell.color === "GREEN") return `${base} bg-emerald-600 border-emerald-700`;
      if (cell.color === "YELLOW") return `${base} bg-amber-500 border-amber-600`;
      if (cell.color === "BLUE") return `${base} bg-sky-600 border-sky-700`;
    }

    // 3. Final Home Paths
    if (cell.type === "FINAL_PATH") {
      if (cell.color === "RED") return `${base} bg-rose-500`;
      if (cell.color === "GREEN") return `${base} bg-emerald-500`;
      if (cell.color === "YELLOW") return `${base} bg-amber-400`;
      if (cell.color === "BLUE") return `${base} bg-sky-500`;
    }

    // 4. Starting Track Squares
    if (cell.isStart) {
      if (cell.color === "RED") return `${base} bg-rose-400/90`;
      if (cell.color === "GREEN") return `${base} bg-emerald-400/90`;
      if (cell.color === "YELLOW") return `${base} bg-amber-300/90`;
      if (cell.color === "BLUE") return `${base} bg-sky-400/90`;
    }

    // 5. Regular Safe Squares
    if (cell.isSafe) {
      return `${base} bg-amber-100 dark:bg-amber-950/40`;
    }

    // 6. Regular Track Squares
    return `${base} bg-zinc-50 dark:bg-zinc-800/90`;
  };

  return (
    <div className="w-full max-w-[560px] mx-auto aspect-square p-2 sm:p-4 rounded-3xl bg-zinc-950/90 border border-zinc-800 shadow-2xl backdrop-blur-xl flex items-center justify-center">
      {/* 15x15 Grid Layout */}
      <div
        className="w-full h-full grid border-2 border-zinc-900 rounded-2xl overflow-hidden shadow-2xl relative"
        style={{
          gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
          gridTemplateRows: "repeat(15, minmax(0, 1fr))",
        }}
      >
        {/* Render 15x15 cells */}
        {grid.map((rowCells, r) =>
          rowCells.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              className={getCellClassName(cell)}
              style={{
                gridRow: r + 1,
                gridColumn: c + 1,
              }}
            >
              {renderCellContent(cell)}
            </div>
          ))
        )}

        {/* 4 Inner White Yard Boxes with 4 Home Circles */}
        {/* Red Home Yard (Top-Left) */}
        <div
          className="absolute pointer-events-none rounded-2xl bg-zinc-950/90 border-2 border-rose-400/40 flex items-center justify-center p-3 shadow-inner"
          style={{
            top: "6.66%",
            left: "6.66%",
            width: "26.66%",
            height: "26.66%",
          }}
        >
          <div className="text-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-rose-400">
              Red Yard
            </span>
          </div>
        </div>

        {/* Green Home Yard (Top-Right) */}
        <div
          className="absolute pointer-events-none rounded-2xl bg-zinc-950/90 border-2 border-emerald-400/40 flex items-center justify-center p-3 shadow-inner"
          style={{
            top: "6.66%",
            right: "6.66%",
            width: "26.66%",
            height: "26.66%",
          }}
        >
          <div className="text-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
              Green Yard
            </span>
          </div>
        </div>

        {/* Yellow Home Yard (Bottom-Right) */}
        <div
          className="absolute pointer-events-none rounded-2xl bg-zinc-950/90 border-2 border-amber-400/40 flex items-center justify-center p-3 shadow-inner"
          style={{
            bottom: "6.66%",
            right: "6.66%",
            width: "26.66%",
            height: "26.66%",
          }}
        >
          <div className="text-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
              Yellow Yard
            </span>
          </div>
        </div>

        {/* Blue Home Yard (Bottom-Left) */}
        <div
          className="absolute pointer-events-none rounded-2xl bg-zinc-950/90 border-2 border-sky-400/40 flex items-center justify-center p-3 shadow-inner"
          style={{
            bottom: "6.66%",
            left: "6.66%",
            width: "26.66%",
            height: "26.66%",
          }}
        >
          <div className="text-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-sky-400">
              Blue Yard
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
