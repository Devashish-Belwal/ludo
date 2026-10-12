import type { Redis } from "ioredis";
import { processAllActiveGamesRecovery } from "@ludo/redis";

/**
 * GameRecoveryWorker: Periodic background worker that enforces:
 * 1. 10-second turn timeout auto-skip / auto-move rules.
 * 2. 60-second disconnect grace period expirations and forfeit resolution.
 * 3. Safe cleanup of finished/abandoned games.
 */
export class GameRecoveryWorker {
  private redis: Redis;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isProcessing: boolean = false;

  constructor(redis: Redis, intervalMs: number = 1000) {
    this.redis = redis;
    this.intervalMs = intervalMs;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      try {
        await processAllActiveGamesRecovery(this.redis);
      } catch (err) {
        console.error("[GameRecoveryWorker] Error during recovery cycle:", err);
      } finally {
        this.isProcessing = false;
      }
    }, this.intervalMs);

    console.log(`[GameRecoveryWorker] Started recovery worker (interval: ${this.intervalMs}ms).`);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[GameRecoveryWorker] Stopped recovery worker.");
  }
}
