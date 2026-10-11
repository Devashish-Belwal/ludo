"use server";

import { auth } from "@/lib/auth";
import { prisma, normalizeFriendshipPair } from "@ludo/database";
import type {
  FriendUser,
  IncomingFriendRequest,
  SearchUserResult,
  RelationshipStatus,
} from "@ludo/shared";

/**
 * Searches users by username (excluding current user) and attaches relationship status.
 */
export async function searchUsers(
  query: string
): Promise<{ success: boolean; data?: SearchUserResult[]; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return { success: true, data: [] };
  }

  const currentUserId = session.user.id;

  try {
    // 1. Find users whose username matches (case-insensitive) and not current user
    const users = await prisma.user.findMany({
      where: {
        normalizedUsername: {
          contains: trimmed,
        },
        NOT: { id: currentUserId },
        username: { not: null },
      },
      select: {
        id: true,
        username: true,
      },
      take: 20,
    });

    if (users.length === 0) {
      return { success: true, data: [] };
    }

    const userIds = users.map((u) => u.id);

    // 2. Fetch existing friendships with these users
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { user1Id: currentUserId, user2Id: { in: userIds } },
          { user2Id: currentUserId, user1Id: { in: userIds } },
        ],
      },
    });

    const friendIdSet = new Set<string>();
    for (const f of friendships) {
      friendIdSet.add(f.user1Id === currentUserId ? f.user2Id : f.user1Id);
    }

    // 3. Fetch friend requests (both outgoing and incoming)
    const outgoingRequests = await prisma.friendRequest.findMany({
      where: {
        senderId: currentUserId,
        receiverId: { in: userIds },
        status: "PENDING",
      },
    });
    const outgoingMap = new Map<string, string>(); // receiverId -> requestId
    for (const req of outgoingRequests) {
      outgoingMap.set(req.receiverId, req.id);
    }

    const incomingRequests = await prisma.friendRequest.findMany({
      where: {
        receiverId: currentUserId,
        senderId: { in: userIds },
        status: "PENDING",
      },
    });
    const incomingMap = new Map<string, string>(); // senderId -> requestId
    for (const req of incomingRequests) {
      incomingMap.set(req.senderId, req.id);
    }

    // 4. Map each user to SearchUserResult with relationship status
    const results: SearchUserResult[] = users.map((u) => {
      let relationship: RelationshipStatus = "NONE";
      let requestId: string | undefined = undefined;

      if (friendIdSet.has(u.id)) {
        relationship = "FRIENDS";
      } else if (outgoingMap.has(u.id)) {
        relationship = "OUTGOING_PENDING";
        requestId = outgoingMap.get(u.id);
      } else if (incomingMap.has(u.id)) {
        relationship = "INCOMING_PENDING";
        requestId = incomingMap.get(u.id);
      }

      return {
        id: u.id,
        username: u.username ?? "Unknown",
        relationship,
        requestId,
      };
    });

    // Sort alphabetically by username (case-insensitive)
    results.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));

    return { success: true, data: results };
  } catch (error) {
    console.error("searchUsers error:", error);
    return { success: false, error: "Failed to search users" };
  }
}

/**
 * Returns the current user's friends list sorted alphabetically (case-insensitive).
 */
export async function getFriends(): Promise<{
  success: boolean;
  data?: FriendUser[];
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const currentUserId = session.user.id;

  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }],
      },
      include: {
        user1: { select: { id: true, username: true } },
        user2: { select: { id: true, username: true } },
      },
    });

    const friends: FriendUser[] = friendships.map((f) => {
      const friend = f.user1Id === currentUserId ? f.user2 : f.user1;
      return {
        id: friend.id,
        username: friend.username ?? "Unknown",
      };
    });

    // Sort alphabetically (case-insensitive)
    friends.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));

    return { success: true, data: friends };
  } catch (error) {
    console.error("getFriends error:", error);
    return { success: false, error: "Failed to fetch friends" };
  }
}

/**
 * Returns pending incoming friend requests for the current user.
 */
export async function getIncomingFriendRequests(): Promise<{
  success: boolean;
  data?: IncomingFriendRequest[];
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const currentUserId = session.user.id;

  try {
    const requests = await prisma.friendRequest.findMany({
      where: {
        receiverId: currentUserId,
        status: "PENDING",
      },
      include: {
        sender: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted: IncomingFriendRequest[] = requests.map((r) => ({
      id: r.id,
      sender: {
        id: r.sender.id,
        username: r.sender.username ?? "Unknown",
      },
      createdAt: r.createdAt,
    }));

    return { success: true, data: formatted };
  } catch (error) {
    console.error("getIncomingFriendRequests error:", error);
    return { success: false, error: "Failed to fetch friend requests" };
  }
}

/**
 * Sends a friend request from current user to target receiver.
 */
export async function sendFriendRequest(
  receiverId: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const senderId = session.user.id;
  if (senderId === receiverId) {
    return { success: false, error: "You cannot send a friend request to yourself." };
  }

  try {
    // 1. Check if already friends
    const pair = normalizeFriendshipPair(senderId, receiverId);
    const existingFriendship = await prisma.friendship.findUnique({
      where: {
        user1Id_user2Id: {
          user1Id: pair.user1Id,
          user2Id: pair.user2Id,
        },
      },
    });
    if (existingFriendship) {
      return { success: false, error: "You are already friends." };
    }

    // 2. Check if a request already exists between them (in either direction)
    const existingReq = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId, status: "PENDING" },
          { senderId: receiverId, receiverId: senderId, status: "PENDING" },
        ],
      },
    });
    if (existingReq) {
      return { success: false, error: "A pending friend request already exists." };
    }

    const created = await prisma.friendRequest.create({
      data: {
        senderId,
        receiverId,
      },
    });

    return { success: true, requestId: created.id };
  } catch (error) {
    console.error("sendFriendRequest error:", error);
    return { success: false, error: "Failed to send friend request." };
  }
}

/**
 * Cancels an outgoing pending friend request.
 */
export async function cancelFriendRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const req = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!req || req.senderId !== session.user.id) {
      return { success: false, error: "Friend request not found or unauthorized." };
    }

    await prisma.friendRequest.delete({
      where: { id: requestId },
    });

    return { success: true };
  } catch (error) {
    console.error("cancelFriendRequest error:", error);
    return { success: false, error: "Failed to cancel friend request." };
  }
}

/**
 * Accepts an incoming friend request and creates friendship inside a transaction.
 */
export async function acceptFriendRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const currentUserId = session.user.id;

  try {
    const req = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!req || req.receiverId !== currentUserId || req.status !== "PENDING") {
      return { success: false, error: "Invalid or expired friend request." };
    }

    const pair = normalizeFriendshipPair(req.senderId, req.receiverId);

    // Atomic transaction: create friendship and remove pending request
    await prisma.$transaction([
      prisma.friendship.create({
        data: {
          user1Id: pair.user1Id,
          user2Id: pair.user2Id,
        },
      }),
      prisma.friendRequest.delete({
        where: { id: requestId },
      }),
    ]);

    return { success: true };
  } catch (error) {
    console.error("acceptFriendRequest error:", error);
    return { success: false, error: "Failed to accept friend request." };
  }
}

/**
 * Declines an incoming friend request.
 */
export async function declineFriendRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const req = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!req || req.receiverId !== session.user.id) {
      return { success: false, error: "Friend request not found or unauthorized." };
    }

    await prisma.friendRequest.delete({
      where: { id: requestId },
    });

    return { success: true };
  } catch (error) {
    console.error("declineFriendRequest error:", error);
    return { success: false, error: "Failed to decline friend request." };
  }
}

/**
 * Removes an existing friend.
 */
export async function removeFriend(
  friendId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const pair = normalizeFriendshipPair(session.user.id, friendId);

    await prisma.friendship.deleteMany({
      where: {
        user1Id: pair.user1Id,
        user2Id: pair.user2Id,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("removeFriend error:", error);
    return { success: false, error: "Failed to remove friend." };
  }
}
