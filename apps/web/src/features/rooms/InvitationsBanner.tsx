"use client";

import { useState, useEffect } from "react";
import {
  getPendingInvitationsAction,
  acceptInvitationAction,
  declineInvitationAction,
} from "@/actions/rooms";
import type { GameInvitation } from "@ludo/shared";
import { Button } from "@/components/ui/button";
import { Mail, Check, X, Loader2 } from "lucide-react";

interface InvitationsBannerProps {
  onAccepted: (gameId: string) => void;
}

export function InvitationsBanner({ onAccepted }: InvitationsBannerProps) {
  const [invitations, setInvitations] = useState<GameInvitation[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkInvitations = async () => {
      try {
        const res = await getPendingInvitationsAction();
        if (!isMounted) return;
        if (res.success && res.data) {
          setInvitations(res.data);
        }
      } catch {
        // Suppress network abort or fetch failures when unmounting
      }
    };

    checkInvitations();
    const interval = setInterval(checkInvitations, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleAccept = async (invite: GameInvitation) => {
    setProcessingId(invite.inviteId);
    const res = await acceptInvitationAction(invite.inviteId);
    setProcessingId(null);

    if (res.success && res.data) {
      setInvitations((prev) => prev.filter((i) => i.inviteId !== invite.inviteId));
      onAccepted(res.data.gameId);
    }
  };

  const handleDecline = async (invite: GameInvitation) => {
    setProcessingId(invite.inviteId);
    await declineInvitationAction(invite.inviteId);
    setProcessingId(null);
    setInvitations((prev) => prev.filter((i) => i.inviteId !== invite.inviteId));
  };

  if (invitations.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {invitations.map((inv) => (
        <div
          key={inv.inviteId}
          className="bg-indigo-950/60 border border-indigo-700/60 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-indigo-950/40 animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-300 shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-100">
                <span className="text-indigo-300 font-bold">{inv.hostUsername}</span> invited you to a game!
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Join their private Ludo room before the invitation expires.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={processingId === inv.inviteId}
              onClick={() => handleDecline(inv)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-900 h-8"
            >
              <X className="w-3.5 h-3.5 mr-1 text-zinc-400" />
              Decline
            </Button>
            <Button
              size="sm"
              disabled={processingId === inv.inviteId}
              onClick={() => handleAccept(inv)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium h-8"
            >
              {processingId === inv.inviteId ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-1" />
              )}
              Accept & Play
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
