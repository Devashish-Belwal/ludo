import { Badge } from "@/components/ui/badge";
import { Crown, Trophy, Sparkles } from "lucide-react";
import type { GamePlayer, PlayerColor } from "@ludo/game-engine";

interface PlayerCardProps {
  player: GamePlayer | null;
  slotIndex: number;
  isCurrentTurn: boolean;
  isCurrentUser: boolean;
}

const COLOR_CONFIG: Record<
  PlayerColor,
  {
    name: string;
    border: string;
    activeBorder: string;
    bg: string;
    badge: string;
    dot: string;
    text: string;
  }
> = {
  RED: {
    name: "Red",
    border: "border-rose-900/40",
    activeBorder: "border-rose-500 ring-2 ring-rose-500/50 shadow-lg shadow-rose-950/60",
    bg: "bg-rose-950/30",
    badge: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    dot: "bg-rose-500",
    text: "text-rose-400",
  },
  GREEN: {
    name: "Green",
    border: "border-emerald-900/40",
    activeBorder: "border-emerald-500 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-950/60",
    bg: "bg-emerald-950/30",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    dot: "bg-emerald-500",
    text: "text-emerald-400",
  },
  YELLOW: {
    name: "Yellow",
    border: "border-amber-900/40",
    activeBorder: "border-amber-500 ring-2 ring-amber-500/50 shadow-lg shadow-amber-950/60",
    bg: "bg-amber-950/30",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    dot: "bg-amber-500",
    text: "text-amber-400",
  },
  BLUE: {
    name: "Blue",
    border: "border-sky-900/40",
    activeBorder: "border-sky-500 ring-2 ring-sky-500/50 shadow-lg shadow-sky-950/60",
    bg: "bg-sky-950/30",
    badge: "bg-sky-500/20 text-sky-300 border-sky-500/40",
    dot: "bg-sky-500",
    text: "text-sky-400",
  },
};

const DEFAULT_SLOT_COLORS: PlayerColor[] = ["RED", "GREEN", "YELLOW", "BLUE"];

export function PlayerCard({
  player,
  slotIndex,
  isCurrentTurn,
  isCurrentUser,
}: PlayerCardProps) {
  const color = player?.color || DEFAULT_SLOT_COLORS[slotIndex];
  const theme = COLOR_CONFIG[color];

  // Calculate finished tokens count
  let finishedCount = 0;
  if (player?.tokens) {
    for (const t of Object.values(player.tokens)) {
      if (t.type === "FINISHED") finishedCount++;
    }
  }

  return (
    <div
      className={`p-3.5 rounded-xl border transition-all duration-300 backdrop-blur-md ${
        isCurrentTurn ? theme.activeBorder : theme.border
      } ${theme.bg}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${theme.dot} ${isCurrentTurn ? "animate-pulse" : ""}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${theme.text}`}>
            {theme.name} (Slot {slotIndex + 1})
          </span>
        </div>

        {isCurrentTurn && (
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] gap-1 py-0 animate-pulse">
            <Sparkles className="w-2.5 h-2.5" /> Turn
          </Badge>
        )}
      </div>

      {player ? (
        <div className="flex items-center justify-between gap-2 mt-1">
          <div>
            <div className="font-semibold text-zinc-100 flex items-center gap-1.5 text-sm">
              <span className="truncate max-w-[120px]">{player.username}</span>
              {isCurrentUser && (
                <span className="text-xs text-zinc-400 font-normal">(You)</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5">
              <Trophy className="w-3 h-3 text-amber-400" />
              <span>{finishedCount}/4 Home</span>
            </div>
          </div>

          {finishedCount === 4 && (
            <Badge className="bg-amber-500 text-zinc-950 font-bold text-xs gap-1">
              <Crown className="w-3 h-3 fill-current" /> Winner!
            </Badge>
          )}
        </div>
      ) : (
        <div className="text-xs text-zinc-500 italic py-1">Empty Slot</div>
      )}
    </div>
  );
}
