"use client";

import { useState, useEffect } from "react";
import { CreateRoomModal } from "./CreateRoomModal";
import { WaitingRoom } from "./WaitingRoom";
import { InvitationsBanner } from "./InvitationsBanner";
import { MatchmakingModal } from "@/features/matchmaking/MatchmakingModal";
import { getMatchmakingStatusAction } from "@/actions/matchmaking";
import { Users, Swords } from "lucide-react";

interface PlayLudoSectionProps {
  currentUserId: string;
  username: string | null;
}

export function PlayLudoSection({
  currentUserId,
  username,
}: PlayLudoSectionProps) {
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMatchmakingOpen, setIsMatchmakingOpen] = useState(false);

  // Auto-recover active game mapping on load per Section 14.4
  useEffect(() => {
    let isMounted = true;
    getMatchmakingStatusAction()
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data?.inGame && res.data.gameId) {
          setActiveGameId(res.data.gameId);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // If currently in a waiting room, render the WaitingRoom lobby
  if (activeGameId) {
    return (
      <div className="space-y-6">
        <WaitingRoom
          gameId={activeGameId}
          currentUserId={currentUserId}
          onLeave={() => setActiveGameId(null)}
          onGameStarted={() => {
            console.log("Game started! Transitioning to board...");
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Real-time Invitations Banner */}
      <InvitationsBanner onAccepted={(gameId) => setActiveGameId(gameId)} />

      {/* Main Play Hub */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Swords className="w-5 h-5 text-indigo-400" />
          Play Ludo
        </h2>
        <p className="text-sm text-muted-foreground">
          Match with other players online or create a private room with your friends.
        </p>

        <div className="flex flex-wrap gap-4 pt-2">
          <button
            disabled={!username}
            onClick={() => setIsMatchmakingOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Play Public
          </button>

          <button
            disabled={!username}
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Users className="w-4 h-4 text-indigo-400" />
            Invite & Play
          </button>
        </div>

        {!username && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            Please save a unique username above before entering matchmaking or creating rooms.
          </p>
        )}
      </div>

      {/* Public Matchmaking Modal */}
      <MatchmakingModal
        isOpen={isMatchmakingOpen}
        onClose={() => setIsMatchmakingOpen(false)}
        onMatchFound={(gameId) => {
          setIsMatchmakingOpen(false);
          setActiveGameId(gameId);
        }}
      />

      {/* Create Room Modal */}
      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onRoomCreated={(gameId) => setActiveGameId(gameId)}
      />
    </div>
  );
}
