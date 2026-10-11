"use client";

import { useState, useEffect, useCallback } from "react";
import {
  searchUsers,
  getFriends,
  getIncomingFriendRequests,
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from "@/actions/friends";
import type {
  FriendUser,
  IncomingFriendRequest,
  SearchUserResult,
} from "@ludo/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, UserX, Check, X, Search, Users } from "lucide-react";

export function FriendsPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load initial friends and incoming requests
  const loadFriendsData = useCallback(async () => {
    const [friendsRes, requestsRes] = await Promise.all([
      getFriends(),
      getIncomingFriendRequests(),
    ]);

    if (friendsRes.success && friendsRes.data) {
      setFriends(friendsRes.data);
    }
    if (requestsRes.success && requestsRes.data) {
      setIncomingRequests(requestsRes.data);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getFriends(), getIncomingFriendRequests()]).then(([fRes, rRes]) => {
      if (active) {
        if (fRes.success && fRes.data) setFriends(fRes.data);
        if (rRes.success && rRes.data) setIncomingRequests(rRes.data);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Debounced user search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchUsers(trimmed);
      if (res.success && res.data) {
        setSearchResults(res.data);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Actions
  async function handleSendRequest(userId: string) {
    setActionLoading(userId);
    const res = await sendFriendRequest(userId);
    if (res.success) {
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, relationship: "OUTGOING_PENDING", requestId: res.requestId }
            : u
        )
      );
    }
    setActionLoading(null);
  }

  async function handleCancelRequest(requestId: string, userId: string) {
    setActionLoading(userId);
    const res = await cancelFriendRequest(requestId);
    if (res.success) {
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, relationship: "NONE", requestId: undefined }
            : u
        )
      );
    }
    setActionLoading(null);
  }

  async function handleAcceptRequest(requestId: string) {
    setActionLoading(requestId);
    const res = await acceptFriendRequest(requestId);
    if (res.success) {
      await loadFriendsData();
      if (searchQuery.trim()) {
        const refreshed = await searchUsers(searchQuery.trim());
        if (refreshed.success && refreshed.data) setSearchResults(refreshed.data);
      }
    }
    setActionLoading(null);
  }

  async function handleDeclineRequest(requestId: string) {
    setActionLoading(requestId);
    const res = await declineFriendRequest(requestId);
    if (res.success) {
      setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (searchQuery.trim()) {
        const refreshed = await searchUsers(searchQuery.trim());
        if (refreshed.success && refreshed.data) setSearchResults(refreshed.data);
      }
    }
    setActionLoading(null);
  }

  async function handleRemoveFriend(friendId: string) {
    setActionLoading(friendId);
    const res = await removeFriend(friendId);
    if (res.success) {
      await loadFriendsData();
      if (searchQuery.trim()) {
        const refreshed = await searchUsers(searchQuery.trim());
        if (refreshed.success && refreshed.data) setSearchResults(refreshed.data);
      }
    }
    setActionLoading(null);
  }

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Friends</h2>
        </div>
        <Badge variant="secondary" className="font-mono text-xs">
          {friends.length}
        </Badge>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Main Content Area */}
      <div className="space-y-4 flex-1 overflow-y-auto">
        {isSearching ? (
          // SEARCH RESULTS MODE
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Search Results
            </h3>
            {loading ? (
              <p className="text-sm text-muted-foreground py-2 text-center">Searching...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">No users found</p>
            ) : (
              searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 p-2.5 bg-background/50 hover:bg-accent/40 transition-colors"
                >
                  <span className="font-medium text-sm truncate max-w-[140px]">
                    {user.username}
                  </span>

                  <div>
                    {user.relationship === "FRIENDS" && (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30">
                        Friends
                      </Badge>
                    )}

                    {user.relationship === "OUTGOING_PENDING" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        disabled={actionLoading === user.id}
                        onClick={() => user.requestId && handleCancelRequest(user.requestId, user.id)}
                      >
                        Cancel
                      </Button>
                    )}

                    {user.relationship === "INCOMING_PENDING" && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600"
                          disabled={actionLoading === user.requestId}
                          onClick={() => user.requestId && handleAcceptRequest(user.requestId)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          disabled={actionLoading === user.requestId}
                          onClick={() => user.requestId && handleDeclineRequest(user.requestId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {user.relationship === "NONE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={actionLoading === user.id}
                        onClick={() => handleSendRequest(user.id)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          // DEFAULT LIST MODE: INCOMING REQUESTS & FRIENDS LIST
          <>
            {/* Incoming Requests */}
            {incomingRequests.length > 0 && (
              <div className="space-y-2 pb-2 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Requests ({incomingRequests.length})
                </h3>
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5"
                  >
                    <span className="font-medium text-sm truncate max-w-[130px]">
                      {req.sender.username}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                        disabled={actionLoading === req.id}
                        onClick={() => handleAcceptRequest(req.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        disabled={actionLoading === req.id}
                        onClick={() => handleDeclineRequest(req.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friends List */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                All Friends
              </h3>
              {friends.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <p>No friends added yet.</p>
                  <p className="text-xs mt-1">Search above to find and add players.</p>
                </div>
              ) : (
                friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between rounded-lg border border-border/40 p-2.5 bg-background/40 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="h-2 w-2 rounded-full bg-zinc-400" title="Offline" />
                      <span className="font-medium text-sm truncate">
                        {friend.username}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={actionLoading === friend.id}
                      onClick={() => handleRemoveFriend(friend.id)}
                      title="Remove friend"
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
