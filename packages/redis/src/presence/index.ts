import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "../keys";

export type PresenceStatus = "ONLINE" | "OFFLINE" | "IN_GAME";

export interface PresenceData {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: number;
}

/**
 * Registers a new connection ID for a user.
 * Adds connectionId to connections:{userId} and maps connection:{connectionId} -> userId.
 * Sets user presence to ONLINE (or preserves IN_GAME if currently in active game).
 */
export async function registerConnection(
  redis: Redis,
  userId: string,
  connectionId: string,
  status: PresenceStatus = "ONLINE"
): Promise<void> {
  const userConnKey = RedisKeys.userConnections(userId);
  const connKey = RedisKeys.connection(connectionId);
  const presenceKey = RedisKeys.presence(userId);

  // If user is already mapped to an active game, status remains IN_GAME
  const activeGame = await redis.get(RedisKeys.userActiveGame(userId));
  const effectiveStatus: PresenceStatus = activeGame ? "IN_GAME" : status;

  const now = Date.now();
  const presencePayload: PresenceData = {
    userId,
    status: effectiveStatus,
    lastSeenAt: now,
  };

  const pipeline = redis.pipeline();
  pipeline.sadd(userConnKey, connectionId);
  pipeline.set(connKey, userId);
  pipeline.set(presenceKey, JSON.stringify(presencePayload), "EX", RedisTTL.PRESENCE);
  await pipeline.exec();
}

/**
 * Removes a connection ID when a tab or socket disconnects.
 * If user still has other active connections (e.g. other tabs), presence remains active.
 * If zero connections remain, keeps presence during grace period before marking OFFLINE.
 */
export async function removeConnection(
  redis: Redis,
  userId: string,
  connectionId: string
): Promise<{ remainingConnections: number }> {
  const userConnKey = RedisKeys.userConnections(userId);
  const connKey = RedisKeys.connection(connectionId);

  await redis.srem(userConnKey, connectionId);
  await redis.del(connKey);

  const remaining = await redis.scard(userConnKey);
  if (remaining === 0) {
    // Grace period: keep key with remaining TTL or mark OFFLINE when TTL expires
    // The presence key TTL will naturally expire in 45s unless refreshed
  }

  return { remainingConnections: remaining };
}

/**
 * Refreshes presence TTL on client heartbeat (every 15s).
 * Does not count as a game action or update game activity timestamps (Section 8.3).
 */
export async function refreshPresenceHeartbeat(
  redis: Redis,
  userId: string
): Promise<boolean> {
  const presenceKey = RedisKeys.presence(userId);
  const existing = await redis.get(presenceKey);

  if (!existing) {
    return false;
  }

  try {
    const data: PresenceData = JSON.parse(existing);
    data.lastSeenAt = Date.now();

    // Check if user has active game to maintain correct status
    const activeGame = await redis.get(RedisKeys.userActiveGame(userId));
    if (activeGame) {
      data.status = "IN_GAME";
    }

    await redis.set(presenceKey, JSON.stringify(data), "EX", RedisTTL.PRESENCE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Updates a user's presence status (e.g. transitioning into IN_GAME or ONLINE).
 */
export async function updatePresenceStatus(
  redis: Redis,
  userId: string,
  status: PresenceStatus
): Promise<void> {
  const presenceKey = RedisKeys.presence(userId);
  const data: PresenceData = {
    userId,
    status,
    lastSeenAt: Date.now(),
  };

  await redis.set(presenceKey, JSON.stringify(data), "EX", RedisTTL.PRESENCE);
}

/**
 * Retrieves the current presence status of a single user.
 */
export async function getPresence(
  redis: Redis,
  userId: string
): Promise<PresenceData> {
  const presenceKey = RedisKeys.presence(userId);
  const raw = await redis.get(presenceKey);

  if (!raw) {
    return {
      userId,
      status: "OFFLINE",
      lastSeenAt: 0,
    };
  }

  try {
    return JSON.parse(raw) as PresenceData;
  } catch {
    return {
      userId,
      status: "OFFLINE",
      lastSeenAt: 0,
    };
  }
}

/**
 * Batch retrieves presence status for multiple users (e.g. friends list).
 */
export async function getMultiplePresences(
  redis: Redis,
  userIds: string[]
): Promise<Map<string, PresenceData>> {
  const result = new Map<string, PresenceData>();
  if (userIds.length === 0) return result;

  const keys = userIds.map((id) => RedisKeys.presence(id));
  const responses = await redis.mget(...keys);

  userIds.forEach((userId, index) => {
    const raw = responses[index];
    if (raw) {
      try {
        result.set(userId, JSON.parse(raw));
      } catch {
        result.set(userId, { userId, status: "OFFLINE", lastSeenAt: 0 });
      }
    } else {
      result.set(userId, { userId, status: "OFFLINE", lastSeenAt: 0 });
    }
  });

  return result;
}
