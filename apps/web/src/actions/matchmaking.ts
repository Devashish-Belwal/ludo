"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@ludo/database";
import {
  redis,
  joinMatchmakingQueue,
  cancelMatchmakingQueue,
  getMatchmakingStatus,
  processMatchmakingBatch,
  type MatchmakingStatusResult,
} from "@ludo/redis";

export interface MatchmakingActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Helper to look up usernames from PostgreSQL during batch creation
async function lookupUsernamesFromDb(userIds: string[]): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });
  return new Map(users.map((u) => [u.id, u.username || `Player_${u.id.slice(0, 4)}`]));
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
  let username = session.user.username;

  // Authoritative check against PostgreSQL in case session token is not yet refreshed
  if (!username) {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    username = dbUser?.username ?? null;
  }

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

    // Opportunistically check if 4 players are ready in queue right now
    await processMatchmakingBatch(redis, lookupUsernamesFromDb);

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
    // Opportunistically process any pending batch if 4 players are waiting
    await processMatchmakingBatch(redis, lookupUsernamesFromDb);

    const status = await getMatchmakingStatus(redis, userId);
    return { success: true, data: status };
  } catch {
    console.error("getMatchmakingStatusAction error");
    return { success: false, error: "Server error checking status" };
  }
}
