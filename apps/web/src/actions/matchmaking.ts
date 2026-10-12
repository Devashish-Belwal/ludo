"use server";

import { auth } from "@/lib/auth";
import {
  redis,
  joinMatchmakingQueue,
  cancelMatchmakingQueue,
  getMatchmakingStatus,
  type MatchmakingStatusResult,
} from "@ludo/redis";

export interface MatchmakingActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Enters the public FIFO matchmaking queue.
 * Requires authenticated session and valid username per Section 14.1.
 */
export async function joinMatchmakingAction(): Promise<
  MatchmakingActionResult<{ queueEntryTime: number; alreadyQueued?: boolean }>
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const userId = session.user.id;
  const username = session.user.username;

  if (!username) {
    return { success: false, error: "Please set your username before playing public matches" };
  }

  try {
    const res = await joinMatchmakingQueue(redis, userId, username);
    if (!res.success) {
      if (res.error === "ALREADY_IN_GAME") {
        return { success: false, error: "You are already in an active game" };
      }
      if (res.error === "MATCHMAKING_ALREADY_RESERVED") {
        return { success: false, error: "A match is already being formed for you" };
      }
      return { success: false, error: res.error || "Failed to join matchmaking" };
    }

    return {
      success: true,
      data: {
        queueEntryTime: res.queueEntryTime,
        alreadyQueued: res.alreadyQueued,
      },
    };
  } catch {
    console.error("joinMatchmakingAction error");
    return { success: false, error: "Server error joining matchmaking" };
  }
}

/**
 * Cancels public matchmaking.
 * Adheres to atomic cancellation/reservation race rules per Section 14.3.
 */
export async function cancelMatchmakingAction(): Promise<
  MatchmakingActionResult<{ status: string }>
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const userId = session.user.id;

  try {
    const res = await cancelMatchmakingQueue(redis, userId);
    if (!res.success) {
      return {
        success: false,
        error: "Match found and reserved! Joining game now...",
      };
    }

    return { success: true, data: { status: res.status } };
  } catch {
    console.error("cancelMatchmakingAction error");
    return { success: false, error: "Server error cancelling matchmaking" };
  }
}

/**
 * Fetches current user matchmaking/game status.
 */
export async function getMatchmakingStatusAction(): Promise<
  MatchmakingActionResult<MatchmakingStatusResult>
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const userId = session.user.id;

  try {
    const status = await getMatchmakingStatus(redis, userId);
    return { success: true, data: status };
  } catch {
    console.error("getMatchmakingStatusAction error");
    return { success: false, error: "Server error checking status" };
  }
}
