import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "../keys";

export interface IdempotencyRecord<T = unknown> {
  actionId: string;
  commandType: string;
  result: T;
  executedAt: number;
}

/**
 * Checks if an action ID has already been executed for this user (10m retention).
 * If executed, returns the cached result.
 * If not executed, returns null.
 */
export async function getProcessedAction<T>(
  redis: Redis,
  userId: string,
  actionId: string
): Promise<IdempotencyRecord<T> | null> {
  const key = RedisKeys.wsAction(userId, actionId);
  const raw = await redis.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as IdempotencyRecord<T>;
  } catch {
    return null;
  }
}

/**
 * Stores the result of an executed action for 10 minutes (600s TTL) to prevent duplicate execution.
 */
export async function saveProcessedAction<T>(
  redis: Redis,
  userId: string,
  actionId: string,
  commandType: string,
  result: T
): Promise<void> {
  const key = RedisKeys.wsAction(userId, actionId);
  const record: IdempotencyRecord<T> = {
    actionId,
    commandType,
    result,
    executedAt: Date.now(),
  };

  await redis.set(key, JSON.stringify(record), "EX", RedisTTL.IDEMPOTENCY_ACTION);
}
