import type { Redis } from "ioredis";
import { RedisChannels } from "../keys";

export interface RedisEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
}

/**
 * Publishes an event to a game-specific channel (game:events:{gameId}).
 */
export async function publishGameEvent<T>(
  redis: Redis,
  gameId: string,
  type: string,
  payload: T
): Promise<number> {
  const channel = RedisChannels.gameEvents(gameId);
  const event: RedisEvent<T> = {
    type,
    payload,
    timestamp: Date.now(),
  };
  return await redis.publish(channel, JSON.stringify(event));
}

/**
 * Publishes an event to a user-specific channel (user:events:{userId}).
 */
export async function publishUserEvent<T>(
  redis: Redis,
  userId: string,
  type: string,
  payload: T
): Promise<number> {
  const channel = RedisChannels.userEvents(userId);
  const event: RedisEvent<T> = {
    type,
    payload,
    timestamp: Date.now(),
  };
  return await redis.publish(channel, JSON.stringify(event));
}

/**
 * Publishes an event to the global presence channel (presence:events).
 */
export async function publishPresenceEvent<T>(
  redis: Redis,
  type: string,
  payload: T
): Promise<number> {
  const channel = RedisChannels.presenceEvents();
  const event: RedisEvent<T> = {
    type,
    payload,
    timestamp: Date.now(),
  };
  return await redis.publish(channel, JSON.stringify(event));
}

/**
 * Publishes an event to the matchmaking channel (matchmaking:events).
 */
export async function publishMatchmakingEvent<T>(
  redis: Redis,
  type: string,
  payload: T
): Promise<number> {
  const channel = RedisChannels.matchmakingEvents();
  const event: RedisEvent<T> = {
    type,
    payload,
    timestamp: Date.now(),
  };
  return await redis.publish(channel, JSON.stringify(event));
}
