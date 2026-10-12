"use server";

import { auth } from "@/lib/auth";
import { prisma, normalizeFriendshipPair } from "@ludo/database";
import {
  redis,
  createPrivateRoom,
  getWaitingRoomState,
  getUserPendingInvitations,
  getInvitation,
  acceptInvitationAtomically,
  declineInvitation,
  startPrivateRoomGame,
  leaveWaitingRoom,
  getUserActiveGame,
  publishGameEvent,
} from "@ludo/redis";
import { ServerEvents, type GameInvitation, type WaitingRoomState } from "@ludo/shared";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Creates a private waiting room and sends invitations to up to 3 validated friends.
 */
export async function createPrivateRoomAction(
  friendUserIds: string[]
): Promise<ActionResult<{ gameId: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }
  const hostId = session.user.id;
  const hostUsername = session.user.username || "Host";

  if (!friendUserIds || friendUserIds.length === 0) {
    return { success: false, error: "Select at least 1 friend to invite" };
  }

  if (friendUserIds.length > 3) {
    return { success: false, error: "You can invite a maximum of 3 friends" };
  }

  // 1. Verify host has no active game
  const hostActive = await getUserActiveGame(redis, hostId);
  if (hostActive) {
    return { success: false, error: "You are already in an active game" };
  }

  // 2. Validate friendship in database for every invited friend (Section 13.1 & 13.2)
  const invitedFriends: { userId: string; username: string }[] = [];
  for (const friendId of friendUserIds) {
    if (friendId === hostId) {
      return { success: false, error: "You cannot invite yourself" };
    }

    const { user1Id, user2Id } = normalizeFriendshipPair(hostId, friendId);
    const friendship = await prisma.friendship.findUnique({
      where: {
        user1Id_user2Id: { user1Id, user2Id },
      },
      include: {
        user1: { select: { id: true, username: true } },
        user2: { select: { id: true, username: true } },
      },
    });

    if (!friendship) {
      return { success: false, error: "Only verified friends can be invited" };
    }

    const friendUser = friendship.user1Id === friendId ? friendship.user1 : friendship.user2;
    const friendUsername = friendUser.username || "Friend";

    // Check if friend is already in an active game
    const friendActive = await getUserActiveGame(redis, friendId);
    if (friendActive) {
      return { success: false, error: `${friendUsername} is already in an active game` };
    }

    invitedFriends.push({ userId: friendId, username: friendUsername });
  }

  // 3. Create private room in Redis
  const gameId = `game-${crypto.randomUUID()}`;
  try {
    await createPrivateRoom(redis, {
      gameId,
      hostId,
      hostUsername,
      invitedFriends,
    });

    return { success: true, data: { gameId } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create private room";
    return { success: false, error: message };
  }
}

/**
 * Retrieves the waiting room state for a game.
 */
export async function getWaitingRoomStateAction(
  gameId: string
): Promise<ActionResult<WaitingRoomState>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const room = await getWaitingRoomState(redis, gameId);
  if (!room) {
    return { success: false, error: "Room not found or expired" };
  }

  return { success: true, data: room };
}

/**
 * Retrieves all pending invitations for the current user.
 */
export async function getPendingInvitationsAction(): Promise<
  ActionResult<GameInvitation[]>
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const invitations = await getUserPendingInvitations(redis, session.user.id);
  return { success: true, data: invitations };
}

/**
 * Atomically accepts an invitation and assigns a player slot in the waiting room.
 */
export async function acceptInvitationAction(
  inviteId: string
): Promise<ActionResult<{ gameId: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }
  const userId = session.user.id;
  const username = session.user.username || "Player";

  const invite = await getInvitation(redis, inviteId);
  if (!invite) {
    return { success: false, error: "Invitation not found or expired" };
  }

  if (invite.recipientId !== userId) {
    return { success: false, error: "This invitation is not for you" };
  }

  const result = await acceptInvitationAtomically(
    redis,
    inviteId,
    userId,
    username,
    invite.gameId
  );

  if (!result.success) {
    return { success: false, error: result.error || "Could not accept invitation" };
  }

  // Notify waiting room participants via Pub/Sub
  await publishGameEvent(redis, invite.gameId, ServerEvents.GAME_PLAYER_JOINED, {
    gameId: invite.gameId,
    player: {
      userId,
      username,
      slot: result.slot,
    },
  });

  return { success: true, data: { gameId: invite.gameId } };
}

/**
 * Declines an invitation.
 */
export async function declineInvitationAction(
  inviteId: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const res = await declineInvitation(redis, inviteId, session.user.id);
  if (!res.success) {
    return { success: false, error: res.error || "Failed to decline invitation" };
  }

  return { success: true };
}

/**
 * Host explicitly starts a private game.
 */
export async function startPrivateRoomAction(
  gameId: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await startPrivateRoomGame(redis, gameId, session.user.id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start game";
    return { success: false, error: message };
  }
}

/**
 * Leaves a waiting room.
 */
export async function leaveWaitingRoomAction(
  gameId: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await leaveWaitingRoom(redis, gameId, session.user.id);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to leave waiting room";
    return { success: false, error: message };
  }
}
