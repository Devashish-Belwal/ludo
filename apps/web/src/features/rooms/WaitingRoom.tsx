"use client";

import { useState, useEffect } from "react";
import {
  getWaitingRoomStateAction,
  startPrivateRoomAction,
  leaveWaitingRoomAction,
} from "@/actions/rooms";
import type { WaitingRoomState } from "@ludo/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Play,
  LogOut,
  Clock,
  Crown,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface WaitingRoomProps {
  gameId: string;
  currentUserId: string;
  onLeave: () => void;
  onGameStarted?: () => void;
}

const SLOT_STYLES = [
  {
    colorName: "Red",
    bg: "bg-rose-950/40 border-rose-800/60 text-rose-300",
    badge: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    dot: "bg-rose-500",
  },
  {
    colorName: "Green",
    bg: "bg-emerald-950/40 border-emerald-800/60 text-emerald-300",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  {
    colorName: "Yellow",
    bg: "bg-amber-950/40 border-amber-800/60 text-amber-300",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    dot: "bg-amber-500",
  },
  {
    colorName: "Blue",
    bg: "bg-sky-950/40 border-sky-800/60 text-sky-300",
    badge: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    dot: "bg-sky-500",
  },
];

export function WaitingRoom({
  gameId,
  currentUserId,
  onLeave,
  onGameStarted,
}: WaitingRoomProps) {
  const [room, setRoom] = useState<WaitingRoomState | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(180);
  const [isStarting, setIsStarting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll room state every 2 seconds
  useEffect(() => {
    let isMounted = true;

    const fetchState = async () => {
      const res = await getWaitingRoomStateAction(gameId);
      if (!isMounted) return;

      if (res.success && res.data) {
        setRoom(res.data);
        if (res.data.status === "IN_PROGRESS") {
          onGameStarted?.();
        }
      } else {
        setError(res.error || "Room was closed or expired");
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [gameId, onGameStarted]);

  // Expiration countdown timer
  useEffect(() => {
    if (!room) return;
    const updateCountdown = () => {
      const remainingSeconds = Math.max(0, Math.floor((room.expiresAt - Date.now()) / 1000));
      setTimeLeft(remainingSeconds);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [room]);

  const handleStartGame = async () => {
    setIsStarting(true);
    setError(null);
    const res = await startPrivateRoomAction(gameId);
    setIsStarting(false);
    if (res.success) {
      onGameStarted?.();
    } else {
      setError(res.error || "Failed to start game");
    }
  };

  const handleLeaveRoom = async () => {
    setIsLeaving(true);
    await leaveWaitingRoomAction(gameId);
    setIsLeaving(false);
    onLeave();
  };

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm">Connecting to waiting room...</p>
      </div>
    );
  }

  const isHost = room.hostId === currentUserId;
  const activeCount = room.players.filter((p) => p !== null).length;
  const canStart = isHost && activeCount >= 2;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  return (
    <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 max-w-2xl mx-auto shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-800/80 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
              Private Waiting Room
            </span>
            <Badge variant="outline" className="text-zinc-400 border-zinc-700">
              {activeCount}/4 Players
            </Badge>
          </div>
          <h2 className="text-2xl font-bold text-zinc-100 mt-1">Ludo Match Lobby</h2>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-lg text-sm text-zinc-300">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>Expires in:</span>
          <span className="font-mono font-bold text-amber-400">{formattedTime}</span>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Slots Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
        {room.players.map((player, slot) => {
          const style = SLOT_STYLES[slot];
          const isCurrent = player?.userId === currentUserId;

          return (
            <div
              key={slot}
              className={`p-4 rounded-xl border transition-all ${
                player
                  ? style.bg
                  : "bg-zinc-900/20 border-zinc-800/50 text-zinc-600 border-dashed"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${player ? style.dot : "bg-zinc-700"}`} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Slot {slot + 1} ({style.colorName})
                  </span>
                </div>
                {player?.isHost && (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] gap-1 py-0">
                    <Crown className="w-2.5 h-2.5" /> Host
                  </Badge>
                )}
              </div>

              {player ? (
                <div className="flex items-center justify-between mt-3">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    <span>{player.username}</span>
                    {isCurrent && (
                      <span className="text-xs text-zinc-400 font-normal">(You)</span>
                    )}
                  </div>
                  <Badge className={style.badge}>Ready</Badge>
                </div>
              ) : (
                <div className="mt-3 text-sm text-zinc-500 italic flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>Waiting for player...</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-zinc-800/80">
        <Button
          variant="outline"
          onClick={handleLeaveRoom}
          disabled={isLeaving}
          className="w-full sm:w-auto border-zinc-700 text-zinc-300 hover:bg-zinc-900"
        >
          {isLeaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <LogOut className="w-4 h-4 mr-2" />
          )}
          Leave Room
        </Button>

        {isHost ? (
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            {!canStart && (
              <span className="text-xs text-zinc-400 italic">
                Need at least 2 players to start
              </span>
            )}
            <Button
              onClick={handleStartGame}
              disabled={!canStart || isStarting}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 shadow-lg shadow-emerald-950"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Starting Game...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2 fill-current" />
                  Start Game
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="text-sm text-zinc-400 italic flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Waiting for host to start the game...</span>
          </div>
        )}
      </div>
    </div>
  );
}
