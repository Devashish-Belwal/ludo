import Redis, { type RedisOptions } from "ioredis";

const globalForRedis = globalThis as unknown as {
  redisClient: Redis | undefined;
  redisSubClient: Redis | undefined;
};

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is required");
  }
  return url;
}

/**
 * Creates an ioredis client instance configured for Upstash Redis / self-hosted Redis.
 */
export function createRedisClient(options?: RedisOptions): Redis {
  const url = getRedisUrl();
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    ...options,
  });
}

/**
 * Reusable default Redis client for standard commands (singleton in Node/Next dev).
 */
export const redis: Redis =
  globalForRedis.redisClient ??
  createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisClient = redis;
}

/**
 * Reusable subscriber Redis client for Redis Pub/Sub (dedicated connection required by Redis).
 */
export const redisSubscriber: Redis =
  globalForRedis.redisSubClient ??
  createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisSubClient = redisSubscriber;
}
