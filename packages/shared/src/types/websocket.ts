import { z } from "zod";

/**
 * Client Message Envelope per Section 9.3
 */
export const clientMessageSchema = z.object({
  type: z.string().min(1, "Command type is required"),
  actionId: z.string().min(1, "ActionId is required"),
  payload: z.unknown().default({}),
});

export type ClientMessage<T = unknown> = {
  type: string;
  actionId: string;
  payload: T;
};

/**
 * Server Message Envelope per Section 9.3
 */
export interface ServerMessage<T = unknown> {
  type: string;
  eventId: string;
  payload: T;
  timestamp: number;
}

/**
 * Standard Error Payload per Section 9.6
 */
export interface ErrorPayload {
  code: string;
  message: string;
  actionId?: string;
}

/**
 * Standard Client Command Types per Section 9.4
 */
export const ClientCommands = {
  JOIN_GAME: "JOIN_GAME",
  LEAVE_GAME: "LEAVE_GAME",
  START_GAME: "START_GAME",
  REQUEST_GAME_STATE: "REQUEST_GAME_STATE",
  JOIN_MATCHMAKING: "JOIN_MATCHMAKING",
  CANCEL_MATCHMAKING: "CANCEL_MATCHMAKING",
  SEND_ROOM_INVITATION: "SEND_ROOM_INVITATION",
  ACCEPT_ROOM_INVITATION: "ACCEPT_ROOM_INVITATION",
  DECLINE_ROOM_INVITATION: "DECLINE_ROOM_INVITATION",
  ROLL_DICE: "ROLL_DICE",
  MOVE_TOKEN: "MOVE_TOKEN",
  PING: "PING",
} as const;

/**
 * Standard Server Event Types per Section 9.5
 */
export const ServerEvents = {
  CONNECTION_ESTABLISHED: "CONNECTION_ESTABLISHED",
  PONG: "PONG",
  GAME_STATE: "GAME_STATE",
  GAME_PLAYER_JOINED: "GAME_PLAYER_JOINED",
  GAME_PLAYER_LEFT: "GAME_PLAYER_LEFT",
  GAME_STARTED: "GAME_STARTED",
  DICE_ROLLED: "DICE_ROLLED",
  TOKEN_MOVED: "TOKEN_MOVED",
  PLAYER_CAPTURED: "PLAYER_CAPTURED",
  TURN_CHANGED: "TURN_CHANGED",
  TURN_TIMEOUT_WARNING: "TURN_TIMEOUT_WARNING",
  TURN_SKIPPED: "TURN_SKIPPED",
  PLAYER_WON: "PLAYER_WON",
  GAME_COMPLETED: "GAME_COMPLETED",
  GAME_ABANDONED: "GAME_ABANDONED",
  OPPONENT_DISCONNECTED: "OPPONENT_DISCONNECTED",
  OPPONENT_RECONNECTED: "OPPONENT_RECONNECTED",
  DEVICE_TAKEOVER: "DEVICE_TAKEOVER",
  MATCHMAKING_JOINED: "MATCHMAKING_JOINED",
  MATCHMAKING_FOUND: "MATCHMAKING_FOUND",
  MATCHMAKING_CANCELLED: "MATCHMAKING_CANCELLED",
  PRESENCE_CHANGED: "PRESENCE_CHANGED",
  INVITATION_RECEIVED: "INVITATION_RECEIVED",
  INVITATION_UPDATED: "INVITATION_UPDATED",
  ERROR: "ERROR",
} as const;

export interface OpponentDisconnectedPayload {
  gameId: string;
  userId: string;
  slot: number;
  gracePeriodSeconds: number;
  disconnectedAt: number;
}

export interface OpponentReconnectedPayload {
  gameId: string;
  userId: string;
  slot: number;
  reconnectedAt: number;
}

export interface TurnTimeoutWarningPayload {
  gameId: string;
  slot: number;
  secondsRemaining: number;
}

export interface DeviceTakeoverPayload {
  message: string;
  newDeviceId: string;
  timestamp: number;
}
