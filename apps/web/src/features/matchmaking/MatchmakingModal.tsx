"use client";

import { useState, useEffect } from "react";
import {
  joinMatchmakingAction,
  cancelMatchmakingAction,
  getMatchmakingStatusAction,
} from "@/actions/matchmaking";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Users, X, AlertTriangle, CheckCircle2 } from "lucide-react";

interface MatchmakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchFound: (gameId: string) => void;
}

export function MatchmakingModal({
  isOpen,
  onClose,
  onMatchFound,
}: MatchmakingModalProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchStatus, setMatchStatus] = useState<"SEARCHING" | "RESERVED" | "FOUND">("SEARCHING");

  // Join queue when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    joinMatchmakingAction()
      .then((res) => {
        if (!isMounted) return;
        setIsJoining(false);
        if (!res.success) {
          setError(res.error || "Failed to enter matchmaking queue");
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsJoining(false);
          setError("Network error joining matchmaking");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Elapsed seconds timer
  useEffect(() => {
    if (!isOpen || matchStatus === "FOUND") return;

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, matchStatus]);

  // Poll matchmaking and active game status every 1 second
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const checkStatus = async () => {
      try {
        const res = await getMatchmakingStatusAction();
        if (!isMounted || !res.success || !res.data) return;

        const status = res.data;

        if (status.inGame && status.gameId) {
          setMatchStatus("FOUND");
          setTimeout(() => {
            if (isMounted) onMatchFound(status.gameId!);
          }, 1000);
          return;
        }

        if (status.isReserved) {
          setMatchStatus("RESERVED");
        }
      } catch {
        // Suppress network abort error
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, onMatchFound]);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const res = await cancelMatchmakingAction();
      setIsCancelling(false);

      if (res.success) {
        setElapsedSeconds(0);
        setMatchStatus("SEARCHING");
        setError(null);
        onClose();
      } else {
        // Race condition: reservation already won!
        setError(res.error || "Match found and reserved! Entering game...");
      }
    } catch {
      setIsCancelling(false);
      setElapsedSeconds(0);
      setMatchStatus("SEARCHING");
      setError(null);
      onClose();
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Public Matchmaking
            </span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Searching for 4 players for a classic public Ludo match.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 flex flex-col items-center justify-center space-y-6">
          {/* Animated Radar/Seat visual */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* Outer pulsating ring */}
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 animate-ping opacity-25" />
            <div className="absolute inset-2 rounded-full border border-indigo-500/40 animate-pulse" />

            {/* 4 Ludo colored dots revolving or pulsing */}
            <div className="absolute top-1 w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-500 animate-pulse" />
            <div className="absolute right-1 w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500 animate-pulse delay-75" />
            <div className="absolute bottom-1 w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-500 animate-pulse delay-150" />
            <div className="absolute left-1 w-3 h-3 rounded-full bg-sky-500 shadow-sm shadow-sky-500 animate-pulse delay-200" />

            {/* Center Status */}
            <div className="flex flex-col items-center justify-center">
              {matchStatus === "FOUND" ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-in zoom-in-75 duration-300" />
              ) : (
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Status Message & Timer */}
          <div className="text-center space-y-1">
            {matchStatus === "FOUND" ? (
              <p className="text-base font-semibold text-emerald-400">
                Match Found! Starting game...
              </p>
            ) : matchStatus === "RESERVED" ? (
              <p className="text-base font-semibold text-amber-400 animate-pulse">
                Opponents found! Finalizing 4-player table...
              </p>
            ) : isJoining ? (
              <p className="text-sm text-muted-foreground">Joining FIFO queue...</p>
            ) : (
              <>
                <p className="text-base font-medium text-foreground">
                  Looking for players...
                </p>
                <p className="text-2xl font-mono font-bold text-indigo-400 tracking-wider">
                  {formatTimer(elapsedSeconds)}
                </p>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              4-Player Free-for-all (FIFO Queue)
            </p>
          </div>

          {/* Error Message if any */}
          {error && (
            <div className="w-full bg-destructive/15 border border-destructive/30 rounded-lg p-3 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isCancelling || matchStatus === "FOUND"}
            className="w-full sm:w-auto"
          >
            {isCancelling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Cancelling...
              </>
            ) : (
              <>
                <X className="w-4 h-4 mr-2" />
                Cancel Search
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
