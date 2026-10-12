import { z } from "zod";

export type MatchmakingPlayerColor = "RED" | "GREEN" | "YELLOW" | "BLUE";

export interface MatchmakingQueueEntry {
  userId: string;
  username: string;
  joinedAt: number;
}

export type MatchmakingBatchStatus = "RESERVED" | "CREATED" | "NOTIFIED";

export interface MatchmakingBatch {
  batchId: string;
  gameId: string;
  userIds: string[];
  status: MatchmakingBatchStatus;
  createdAt: number;
}

export interface MatchmakingJoinedPayload {
  userId: string;
  queueEntryTime: number;
}

export interface MatchmakingFoundPayload {
  gameId: string;
  slotIndex: number;
  color: MatchmakingPlayerColor;
  players: unknown[];
}

export interface MatchmakingCancelledPayload {
  userId: string;
}

export const joinMatchmakingSchema = z.object({
  actionId: z.string().min(1, "actionId is required"),
});

export const cancelMatchmakingSchema = z.object({
  actionId: z.string().min(1, "actionId is required"),
});
