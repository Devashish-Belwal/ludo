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

let _client: Redis | undefined;
let _subClient: Redis | undefined;

/**
 * Reusable default Redis client for standard commands (lazy singleton).
 */
export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    if (!_client) {
      _client = globalForRedis.redisClient ?? createRedisClient();
      if (process.env.NODE_ENV !== "production") {
        globalForRedis.redisClient = _client;
      }
    }
    const val = Reflect.get(_client, prop, receiver);
    if (typeof val === "function") {
      return val.bind(_client);
    }
    return val;
  },
});

/**
 * Reusable subscriber Redis client for Redis Pub/Sub (lazy singleton).
 */
export const redisSubscriber: Redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    if (!_subClient) {
      _subClient = globalForRedis.redisSubClient ?? createRedisClient();
      if (process.env.NODE_ENV !== "production") {
        globalForRedis.redisSubClient = _subClient;
      }
    }
    const val = Reflect.get(_subClient, prop, receiver);
    if (typeof val === "function") {
      return val.bind(_subClient);
    }
    return val;
  },
});
