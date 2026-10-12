"use client";

import { useState, useEffect } from "react";
import { getFriends } from "@/actions/friends";
import { createPrivateRoomAction } from "@/actions/rooms";
import type { FriendUser } from "@ludo/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, UserPlus, Loader2, Check } from "lucide-react";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomCreated: (gameId: string) => void;
}

export function CreateRoomModal({
  isOpen,
  onClose,
  onRoomCreated,
}: CreateRoomModalProps) {
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    getFriends()
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setFriends(res.data);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingFriends(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleClose = () => {
    setSelectedFriends([]);
    setError(null);
    onClose();
  };

  const toggleSelectFriend = (userId: string) => {
    if (selectedFriends.includes(userId)) {
      setSelectedFriends(selectedFriends.filter((id) => id !== userId));
    } else {
      if (selectedFriends.length >= 3) {
        setError("You can select at most 3 friends for a 4-player game");
        return;
      }
      setError(null);
      setSelectedFriends([...selectedFriends, userId]);
    }
  };

  const handleCreate = async () => {
    if (selectedFriends.length === 0) {
      setError("Please select at least 1 friend to invite");
      return;
    }

    setIsCreating(true);
    setError(null);

    const res = await createPrivateRoomAction(selectedFriends);
    setIsCreating(false);

    if (res.success && res.data) {
      onRoomCreated(res.data.gameId);
      handleClose();
    } else {
      setError(res.error || "Failed to create room");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Users className="w-5 h-5 text-indigo-400" />
            Create Private Game
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Select up to 3 friends to invite to your private room.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Your Friends ({selectedFriends.length}/3 selected)
          </div>

          {isLoadingFriends ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span className="text-sm">Loading friends...</span>
            </div>
          ) : friends.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-sm bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/60">
              You haven&apos;t added any friends yet. Add friends using the Friends panel on the left to invite them!
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {friends.map((friend) => {
                const isSelected = selectedFriends.includes(friend.id);
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => toggleSelectFriend(friend.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition text-left ${
                      isSelected
                        ? "bg-indigo-950/50 border-indigo-600/70 text-zinc-100"
                        : "bg-zinc-900/40 border-zinc-800/60 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-9 h-9 border border-zinc-700">
                        <AvatarFallback className="bg-zinc-800 text-xs text-zinc-300 font-semibold">
                          {friend.username?.slice(0, 2).toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="truncate">
                        <div className="text-sm font-medium leading-none truncate">
                          {friend.username}
                        </div>
                        <div className="text-xs text-zinc-500 truncate mt-1">
                          Friend
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center transition ${
                        isSelected
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "border-zinc-700 bg-zinc-800/60 text-transparent"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={selectedFriends.length === 0 || isCreating}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Creating Room...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Invite & Create
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
