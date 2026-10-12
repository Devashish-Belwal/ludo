import type { Redis } from "ioredis";
import { RedisKeys, RedisChannels } from "../keys";
import { publishUserEvent } from "../pubsub";
import { setUserActiveGame, getUserActiveGame } from "../game/active-mapping";
import { RESERVE_MATCHMAKING_BATCH_LUA, CANCEL_MATCHMAKING_LUA } from "../scripts/matchmaking.lua";
import { createGame, type GameState } from "@ludo/game-engine";
import {
  ServerEvents,
  type MatchmakingBatch,
  type MatchmakingFoundPayload,
} from "@ludo/shared";

export interface JoinMatchmakingResult {
  success: boolean;
  queueEntryTime: number;
  error?: string;
  alreadyQueued?: boolean;
}

export interface CancelMatchmakingResult {
  success: boolean;
  status: "CANCELLED" | "NOT_IN_QUEUE" | "RESERVED";
  error?: string;
}

export interface MatchmakingStatusResult {
  inGame: boolean;
  gameId?: string;
  inQueue: boolean;
  queueEntryTime?: number;
  isReserved: boolean;
  batchId?: string;
}

const USER_META_PREFIX = "user:matchmaking-meta:";

/**
 * Enters the public FIFO matchmaking queue.
 * Validates no active game, no active reservation, and prevents duplicates.
 */
export async function joinMatchmakingQueue(
  redis: Redis,
  userId: string,
  username: string
): Promise<JoinMatchmakingResult> {
  // 1. Verify user has no active game
  const activeGame = await getUserActiveGame(redis, userId);
  if (activeGame) {
    return { success: false, queueEntryTime: 0, error: "ALREADY_IN_GAME" };
  }

  // 2. Verify user is not already reserved in an active batch
  const reservedBatch = await redis.get(RedisKeys.matchmakingReserved(userId));
  if (reservedBatch) {
    return {
      success: false,
      queueEntryTime: 0,
      error: "MATCHMAKING_ALREADY_RESERVED",
    };
  }

  // 3. Check if already queued in matchmaking:public
  const queueKey = RedisKeys.matchmakingQueue();
  const existingScore = await redis.zscore(queueKey, userId);
  if (existingScore !== null) {
    return {
      success: true,
      queueEntryTime: parseFloat(existingScore),
      alreadyQueued: true,
    };
  }

  // 4. Store user metadata (username) for quick worker retrieval
  const now = Date.now();
  await redis.set(
    `${USER_META_PREFIX}${userId}`,
    JSON.stringify({ username, joinedAt: now }),
    "EX",
    3600
  );

  // 5. Add to Sorted Set with timestamp score (FIFO)
  await redis.zadd(queueKey, now, userId);

  // 6. Publish MATCHMAKING_JOINED event
  await publishUserEvent(redis, userId, ServerEvents.MATCHMAKING_JOINED, {
    userId,
    queueEntryTime: now,
  });

  return { success: true, queueEntryTime: now };
}

/**
 * Cancels public matchmaking with atomic race handling per Section 14.3.
 */
export async function cancelMatchmakingQueue(
  redis: Redis,
  userId: string
): Promise<CancelMatchmakingResult> {
  const queueKey = RedisKeys.matchmakingQueue();

  // Execute atomic cancellation Lua script
  const res = (await redis.eval(
    CANCEL_MATCHMAKING_LUA,
    1,
    queueKey,
    userId
  )) as number;

  if (res === 0) {
    // Reservation won the race: user is already reserved in a batch
    return {
      success: false,
      status: "RESERVED",
      error: "MATCHMAKING_ALREADY_RESERVED",
    };
  }

  if (res === 1) {
    // Successfully removed from queue
    await redis.del(`${USER_META_PREFIX}${userId}`);
    await publishUserEvent(redis, userId, ServerEvents.MATCHMAKING_CANCELLED, {
      userId,
    });
    return { success: true, status: "CANCELLED" };
  }

  // Not in queue
  return { success: true, status: "NOT_IN_QUEUE" };
}

/**
 * Gets the current matchmaking and game status of a user.
 */
export async function getMatchmakingStatus(
  redis: Redis,
  userId: string
): Promise<MatchmakingStatusResult> {
  const activeGame = await getUserActiveGame(redis, userId);
  if (activeGame) {
    return { inGame: true, gameId: activeGame, inQueue: false, isReserved: false };
  }

  const reservedBatch = await redis.get(RedisKeys.matchmakingReserved(userId));
  if (reservedBatch) {
    return {
      inGame: false,
      inQueue: false,
      isReserved: true,
      batchId: reservedBatch,
    };
  }

  const score = await redis.zscore(RedisKeys.matchmakingQueue(), userId);
  if (score !== null) {
    return {
      inGame: false,
      inQueue: true,
      queueEntryTime: parseFloat(score),
      isReserved: false,
    };
  }

  return { inGame: false, inQueue: false, isReserved: false };
}

export type UsernameLookupFn = (userIds: string[]) => Promise<Map<string, string>>;

/**
 * Helper to fetch usernames for players.
 * Tries Redis user metadata first, falling back to optional DB lookup or default.
 */
async function resolveUsernames(
  redis: Redis,
  userIds: string[],
  dbLookup?: UsernameLookupFn
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const missing: string[] = [];

  for (const uid of userIds) {
    const raw = await redis.get(`${USER_META_PREFIX}${uid}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.username) {
          result.set(uid, parsed.username);
          continue;
        }
      } catch {
        // fallback
      }
    }
    missing.push(uid);
  }

  if (missing.length > 0 && dbLookup) {
    try {
      const dbNames = await dbLookup(missing);
      for (const [uid, name] of dbNames.entries()) {
        result.set(uid, name);
      }
    } catch {
      // fallback
    }
  }

  for (const uid of missing) {
    if (!result.has(uid)) {
      result.set(uid, `Player_${uid.slice(0, 6)}`);
    }
  }

  return result;
}

/**
 * Attempts to process one matchmaking batch of 4 eligible FIFO players.
 * Returns the created GameState if a batch was processed, or null otherwise.
 */
export async function processMatchmakingBatch(
  redis: Redis,
  dbLookup?: UsernameLookupFn
): Promise<GameState | null> {
  const queueKey = RedisKeys.matchmakingQueue();

  // 1. Check if at least 4 users are queued
  const count = await redis.zcard(queueKey);
  if (count < 4) {
    return null;
  }

  // 2. Select the 4 oldest candidates
  const candidates = await redis.zrange(queueKey, 0, 3);
  if (candidates.length < 4) {
    return null;
  }

  // 3. Prepare batch and game IDs
  const batchId = `batch-${crypto.randomUUID()}`;
  const gameId = `game-pub-${crypto.randomUUID()}`;

  const batchRecord: MatchmakingBatch = {
    batchId,
    gameId,
    userIds: candidates,
    status: "RESERVED",
    createdAt: Date.now(),
  };

  // 4. Execute atomic Lua reservation script
  const luaRes = (await redis.eval(
    RESERVE_MATCHMAKING_BATCH_LUA,
    1,
    queueKey,
    batchId,
    JSON.stringify(batchRecord),
    ...candidates
  )) as number;

  if (luaRes !== 1) {
    // Reservation failed (e.g. race with cancellation or active game eviction)
    return null;
  }

  // 5. Reservation succeeded: Resolve usernames and build GameState
  return await finalizeBatchCreation(redis, batchRecord, dbLookup);
}

/**
 * Creates game state, sets active game mappings, dispatches MATCHMAKING_FOUND,
 * and clears reservations.
 */
async function finalizeBatchCreation(
  redis: Redis,
  batchRecord: MatchmakingBatch,
  dbLookup?: UsernameLookupFn
): Promise<GameState> {
  const { batchId, gameId, userIds } = batchRecord;

  // 1. Resolve usernames
  const usernames = await resolveUsernames(redis, userIds, dbLookup);

  // 2. Build 4 player inputs for game engine
  const initialPlayers = userIds.map((uid: string, slot: number) => ({
    userId: uid,
    username: usernames.get(uid) || `Player_${slot + 1}`,
    slot,
  }));

  // 3. Create full GameState starting IN_PROGRESS
  const game = createGame(gameId, initialPlayers, { status: "IN_PROGRESS" });

  // 4. Save game state in Redis (active game lifecycle, no waiting room TTL)
  await redis.set(RedisKeys.game(gameId), JSON.stringify(game));

  // 5. Set active game mappings and player set
  await redis.sadd(RedisKeys.gamePlayers(gameId), ...userIds);
  await redis.sadd(RedisKeys.gamesActive(), gameId);
  for (const uid of userIds) {
    await setUserActiveGame(redis, uid, gameId);
  }

  // 6. Update batch status to CREATED
  batchRecord.status = "CREATED";
  await redis.set(
    RedisKeys.matchmakingBatch(batchId),
    JSON.stringify(batchRecord),
    "EX",
    120
  );

  // 7. Publish MATCHMAKING_FOUND to each player's user event channel
  for (let slot = 0; slot < 4; slot++) {
    const player = game.players[slot]!;
    const payload: MatchmakingFoundPayload = {
      gameId,
      slotIndex: slot,
      color: player.color,
      players: game.players,
    };
    await publishUserEvent(redis, player.userId, ServerEvents.MATCHMAKING_FOUND, payload);
  }

  // 8. Clear individual reservations and clean up batch
  for (const uid of userIds) {
    await redis.del(RedisKeys.matchmakingReserved(uid));
    await redis.del(`${USER_META_PREFIX}${uid}`);
  }
  await redis.del(RedisKeys.matchmakingBatch(batchId));

  return game;
}

/**
 * Worker recovery: Identifies batches that were reserved but not fully completed
 * after a worker restart, ensuring reservations never stay permanently stuck.
 */
export async function recoverMatchmakingBatches(
  redis: Redis,
  dbLookup?: UsernameLookupFn
): Promise<number> {
  let recoveredCount = 0;
  const keys = await redis.keys("matchmaking:batch:*");

  for (const key of keys) {
    try {
      const raw = await redis.get(key);
      if (!raw) continue;

      const batch = JSON.parse(raw) as MatchmakingBatch;
      const isStale = Date.now() - batch.createdAt > 60000;

      if (batch.status === "RESERVED" && !isStale) {
        // Complete the reservation into an active game
        await finalizeBatchCreation(redis, batch, dbLookup);
        recoveredCount++;
      } else if (batch.status === "CREATED") {
        // Ensure reservations are cleaned up
        for (const uid of batch.userIds) {
          await redis.del(RedisKeys.matchmakingReserved(uid));
        }
        await redis.del(key);
        recoveredCount++;
      } else if (isStale) {
        // Stale stuck batch: release all reservations
        for (const uid of batch.userIds) {
          await redis.del(RedisKeys.matchmakingReserved(uid));
        }
        await redis.del(key);
        recoveredCount++;
      }
    } catch (err) {
      console.error("[Matchmaking] Error recovering batch key", key, err);
    }
  }

  return recoveredCount;
}

/**
 * MatchmakingWorker: Single worker running periodic checks per Section 10.5.
 */
export class MatchmakingWorker {
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private redis: Redis,
    private options: {
      intervalMs?: number;
      dbLookup?: UsernameLookupFn;
    } = {}
  ) {}

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Run recovery pass on startup
    try {
      const recovered = await recoverMatchmakingBatches(
        this.redis,
        this.options.dbLookup
      );
      if (recovered > 0) {
        console.log(`[MatchmakingWorker] Recovered ${recovered} unfinished batch(es).`);
      }
    } catch (err) {
      console.error("[MatchmakingWorker] Error during startup recovery:", err);
    }

    // 2. Start polling interval
    const intervalMs = this.options.intervalMs ?? 500;
    this.intervalTimer = setInterval(() => {
      this.tick().catch((err) => {
        console.error("[MatchmakingWorker] Error in tick:", err);
      });
    }, intervalMs);

    console.log(`[MatchmakingWorker] Started worker (interval: ${intervalMs}ms).`);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    console.log("[MatchmakingWorker] Stopped worker.");
  }

  public async tick(): Promise<void> {
    if (!this.isRunning || this.isProcessing) return;
    this.isProcessing = true;
    try {
      // Process batches as long as eligible sets of 4 exist
      let processed: GameState | null = null;
      do {
        processed = await processMatchmakingBatch(
          this.redis,
          this.options.dbLookup
        );
      } while (processed !== null);
    } finally {
      this.isProcessing = false;
    }
  }
}
