import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "../keys";
import { ACCEPT_INVITATION_LUA } from "../scripts/accept-invitation.lua";
import type { GameInvitation, InvitationStatus } from "@ludo/shared";

export interface CreateInvitationInput {
  inviteId: string;
  gameId: string;
  hostId: string;
  hostUsername: string;
  recipientId: string;
  recipientUsername?: string;
}

/**
 * Creates and stores a game invitation in Redis with a 5-minute TTL.
 */
export async function createInvitation(
  redis: Redis,
  input: CreateInvitationInput
): Promise<GameInvitation> {
  const now = Date.now();
  const expiresAt = now + RedisTTL.INVITATION * 1000;

  const invitation: GameInvitation = {
    inviteId: input.inviteId,
    gameId: input.gameId,
    hostId: input.hostId,
    hostUsername: input.hostUsername,
    recipientId: input.recipientId,
    recipientUsername: input.recipientUsername,
    status: "PENDING",
    createdAt: now,
    expiresAt,
  };

  const pipeline = redis.pipeline();
  pipeline.set(
    RedisKeys.invite(input.inviteId),
    JSON.stringify(invitation),
    "EX",
    RedisTTL.INVITATION
  );
  pipeline.sadd(RedisKeys.userInvitations(input.recipientId), input.inviteId);
  pipeline.expire(RedisKeys.userInvitations(input.recipientId), RedisTTL.INVITATION);
  await pipeline.exec();

  return invitation;
}

/**
 * Retrieves an invitation by ID from Redis.
 */
export async function getInvitation(
  redis: Redis,
  inviteId: string
): Promise<GameInvitation | null> {
  const raw = await redis.get(RedisKeys.invite(inviteId));
  if (!raw) return null;
  return JSON.parse(raw) as GameInvitation;
}

/**
 * Retrieves all pending, non-expired invitations for a recipient.
 * Automatically cleans up expired/missing invitations from the user's set.
 */
export async function getUserPendingInvitations(
  redis: Redis,
  userId: string
): Promise<GameInvitation[]> {
  const inviteIds = await redis.smembers(RedisKeys.userInvitations(userId));
  if (inviteIds.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of inviteIds) {
    pipeline.get(RedisKeys.invite(id));
  }
  const results = await pipeline.exec();

  const now = Date.now();
  const validInvitations: GameInvitation[] = [];
  const expiredIds: string[] = [];

  results?.forEach((res, idx) => {
    const raw = res[1] as string | null;
    const id = inviteIds[idx];
    if (!raw) {
      expiredIds.push(id);
      return;
    }
    const inv = JSON.parse(raw) as GameInvitation;
    if (inv.status !== "PENDING" || now > inv.expiresAt) {
      expiredIds.push(id);
    } else {
      validInvitations.push(inv);
    }
  });

  if (expiredIds.length > 0) {
    await redis.srem(RedisKeys.userInvitations(userId), ...expiredIds);
  }

  return validInvitations;
}

/**
 * Declines an invitation: updates status to DECLINED and removes from pending set.
 */
export async function declineInvitation(
  redis: Redis,
  inviteId: string,
  userId: string
): Promise<{ success: boolean; invitation?: GameInvitation; error?: string }> {
  const raw = await redis.get(RedisKeys.invite(inviteId));
  if (!raw) {
    return { success: false, error: "INVITATION_NOT_FOUND" };
  }

  const invitation = JSON.parse(raw) as GameInvitation;
  if (invitation.recipientId !== userId) {
    return { success: false, error: "NOT_INVITATION_RECIPIENT" };
  }

  invitation.status = "DECLINED";

  const pipeline = redis.pipeline();
  pipeline.set(RedisKeys.invite(inviteId), JSON.stringify(invitation), "KEEPTTL");
  pipeline.srem(RedisKeys.userInvitations(userId), inviteId);
  await pipeline.exec();

  return { success: true, invitation };
}

export interface AcceptInvitationResult {
  success: boolean;
  error?: string;
  slot?: number;
  game?: any;
  invite?: GameInvitation;
}

/**
 * Atomically accepts a game invitation using Redis Lua script per Section 13.3.
 */
export async function acceptInvitationAtomically(
  redis: Redis,
  inviteId: string,
  recipientId: string,
  recipientUsername: string,
  gameId: string
): Promise<AcceptInvitationResult> {
  const keys = [
    RedisKeys.userActiveGame(recipientId),
    RedisKeys.invite(inviteId),
    RedisKeys.userInvitations(recipientId),
    RedisKeys.game(gameId),
    RedisKeys.gamePlayers(gameId),
  ];

  const args = [recipientId, recipientUsername, Date.now().toString()];

  const rawResult = (await redis.eval(
    ACCEPT_INVITATION_LUA,
    keys.length,
    ...keys,
    ...args
  )) as string;

  const result = JSON.parse(rawResult);
  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    slot: result.slot,
    game: result.game,
    invite: result.invite,
  };
}
