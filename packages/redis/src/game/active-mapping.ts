import type { Redis } from "ioredis";
import { RedisKeys } from "../keys";

/**
 * Sets an active game mapping for a user in Redis (user:active-game:{userId} -> gameId).
 * Automatically updates their presence to IN_GAME.
 */
export async function setUserActiveGame(
  redis: Redis,
  userId: string,
  gameId: string
): Promise<void> {
  await redis.set(RedisKeys.userActiveGame(userId), gameId);
}

/**
 * Gets the active game ID for a user, or null if not currently in a game.
 */
export async function getUserActiveGame(
  redis: Redis,
  userId: string
): Promise<string | null> {
  return await redis.get(RedisKeys.userActiveGame(userId));
}

/**
 * Removes the active game mapping for a user when game finishes, is abandoned, or user is removed.
 */
export async function removeUserActiveGame(
  redis: Redis,
  userId: string
): Promise<void> {
  await redis.del(RedisKeys.userActiveGame(userId));
}

/**
 * Checks if a user is currently in an active game.
 */
export async function isUserInGame(
  redis: Redis,
  userId: string
): Promise<boolean> {
  const gameId = await getUserActiveGame(redis, userId);
  return gameId !== null;
}
