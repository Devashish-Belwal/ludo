"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dices, Sparkles, Loader2 } from "lucide-react";
import type { PlayerColor } from "@ludo/game-engine";

interface DiceRollerProps {
  diceValue: number | null;
  turnPhase: "WAITING_FOR_ROLL" | "WAITING_FOR_MOVE";
  isMyTurn: boolean;
  consecutiveSixes: number;
  activeColor: PlayerColor;
  activePlayerName: string;
  onRoll: () => Promise<void>;
  disabled?: boolean;
}

export function DiceRoller({
  diceValue,
  turnPhase,
  isMyTurn,
  consecutiveSixes,
  activeColor,
  activePlayerName,
  onRoll,
  disabled = false,
}: DiceRollerProps) {
  const [isRolling, setIsRolling] = useState(false);

  const handleRollClick = async () => {
    if (!isMyTurn || turnPhase !== "WAITING_FOR_ROLL" || isRolling || disabled) return;
    setIsRolling(true);
    try {
      await onRoll();
    } finally {
      setTimeout(() => setIsRolling(false), 300);
    }
  };

  const COLOR_THEMES: Record<PlayerColor, { bg: string; border: string; glow: string; text: string }> = {
    RED: { bg: "bg-rose-500", border: "border-rose-400", glow: "shadow-rose-500/50", text: "text-rose-400" },
    GREEN: { bg: "bg-emerald-500", border: "border-emerald-400", glow: "shadow-emerald-500/50", text: "text-emerald-400" },
    YELLOW: { bg: "bg-amber-500", border: "border-amber-400", glow: "shadow-amber-500/50", text: "text-amber-400" },
    BLUE: { bg: "bg-sky-500", border: "border-sky-400", glow: "shadow-sky-500/50", text: "text-sky-400" },
  };

  const theme = COLOR_THEMES[activeColor];

  // Render pips for values 1..6
  const renderDicePips = (val: number | null) => {
    const value = val || 1;
    return (
      <div className="grid grid-cols-3 grid-rows-3 w-12 h-12 p-1.5 gap-1 bg-white rounded-xl shadow-inner border border-zinc-200">
        {/* Pip 1 (Top-Left) */}
        <div className="flex items-center justify-center">
          {[2, 3, 4, 5, 6].includes(value) && <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />}
        </div>
        {/* Pip 2 (Top-Middle) */}
        <div className="flex items-center justify-center" />
        {/* Pip 3 (Top-Right) */}
        <div className="flex items-center justify-center">
          {[4, 5, 6].includes(value) && <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />}
        </div>
        {/* Pip 4 (Middle-Left) */}
        <div className="flex items-center justify-center">
          {value === 6 && <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />}
        </div>
        {/* Pip 5 (Center) */}
        <div className="flex items-center justify-center">
          {[1, 3, 5].includes(value) && <div className={`w-3 h-3 rounded-full ${value === 6 ? "bg-zinc-900" : "bg-rose-600 shadow-sm"}`} />}
        </div>
        {/* Pip 6 (Middle-Right) */}
        <div className="flex items-center justify-center">
          {value === 6 && <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />}
        </div>
        {/* Pip 7 (Bottom-Left) */}
        <div className="flex items-center justify-center">
          {[4, 5, 6].includes(value) && <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />}
        </div>
        {/* Pip 8 (Bottom-Middle) */}
        <div className="flex items-center justify-center" />
        {/* Pip 9 (Bottom-Right) */}
        <div className="flex items-center justify-center">
          {[2, 3, 4, 5, 6].includes(value) && <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />}
        </div>
      </div>
    );
  };

  const canClickRoll = isMyTurn && turnPhase === "WAITING_FOR_ROLL" && !isRolling && !disabled;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 shadow-xl backdrop-blur-md">
      {/* Dice & Status */}
      <div className="flex items-center gap-4">
        {/* 3D Dice Face */}
        <button
          onClick={handleRollClick}
          disabled={!canClickRoll}
          className={`relative p-2 rounded-2xl transition-all duration-300 transform ${
            canClickRoll
              ? "cursor-pointer hover:scale-105 active:scale-95 shadow-lg " + theme.glow
              : "opacity-85 cursor-not-allowed"
          } ${isRolling ? "animate-spin" : ""}`}
        >
          {renderDicePips(diceValue)}
          {canClickRoll && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500" />
            </span>
          )}
        </button>

        {/* Turn description */}
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${theme.text}`}>
              {activeColor} Turn
            </span>
            {consecutiveSixes > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> Six #{consecutiveSixes}!
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-zinc-100 mt-0.5">
            {isMyTurn
              ? turnPhase === "WAITING_FOR_ROLL"
                ? "Your turn: Roll the dice!"
                : `You rolled a ${diceValue}! Select a piece.`
              : `${activePlayerName}'s turn (${turnPhase === "WAITING_FOR_ROLL" ? "Rolling" : "Moving"})`}
          </p>
        </div>
      </div>

      {/* Action button */}
      <div>
        {isMyTurn && turnPhase === "WAITING_FOR_ROLL" ? (
          <Button
            onClick={handleRollClick}
            disabled={!canClickRoll}
            className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold px-6 shadow-lg shadow-amber-500/25 animate-pulse"
          >
            {isRolling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rolling...
              </>
            ) : (
              <>
                <Dices className="w-4 h-4 mr-2" /> Roll Dice
              </>
            )}
          </Button>
        ) : isMyTurn && turnPhase === "WAITING_FOR_MOVE" ? (
          <div className="text-xs font-medium text-amber-300 bg-amber-950/60 border border-amber-800/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Click any glowing piece to move</span>
          </div>
        ) : (
          <div className="text-xs text-zinc-400 italic">Waiting for opponent...</div>
        )}
      </div>
    </div>
  );
}
