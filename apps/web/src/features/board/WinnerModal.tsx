"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trophy, Crown, Sparkles, ArrowRight } from "lucide-react";
import type { PlayerColor } from "@ludo/game-engine";

interface WinnerModalProps {
  isOpen: boolean;
  winnerUsername: string;
  winnerColor: PlayerColor;
  isCurrentUserWinner: boolean;
  isForfeit?: boolean;
  onReturnToLobby: () => void;
}

export function WinnerModal({
  isOpen,
  winnerUsername,
  winnerColor,
  isCurrentUserWinner,
  isForfeit,
  onReturnToLobby,
}: WinnerModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onReturnToLobby()}>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100 text-center p-8">
        <DialogHeader className="items-center">
          <div className="relative mb-4 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl animate-pulse" />
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 p-0.5 shadow-xl flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center">
                <Trophy className="w-10 h-10 text-amber-400 animate-bounce" />
              </div>
            </div>
            <Crown className="w-6 h-6 text-amber-400 absolute -top-2 fill-current" />
          </div>

          <DialogTitle className="text-2xl font-black tracking-tight text-zinc-100 flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            {isCurrentUserWinner ? "Victory! You Won!" : `${winnerUsername} Won!`}
            <Sparkles className="w-5 h-5 text-amber-400" />
          </DialogTitle>

          <DialogDescription className="text-zinc-400 text-sm mt-2">
            {isForfeit
              ? isCurrentUserWinner
                ? "Opponent left the match. You won by forfeit!"
                : `${winnerUsername} won by forfeit.`
              : isCurrentUserWinner
              ? "Congratulations! You have successfully brought all 4 tokens home!"
              : `${winnerUsername} (${winnerColor}) brought all 4 tokens into the center finish.`}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-6">
          <Button
            onClick={onReturnToLobby}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold py-6 text-base shadow-xl shadow-amber-500/20"
          >
            <span>Back to Dashboard</span>
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
