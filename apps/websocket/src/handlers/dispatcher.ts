import type { Redis } from "ioredis";
import type { AuthenticatedSocket } from "../connection/registry";
import type { ConnectionRegistry } from "../connection/registry";
import { clientMessageSchema, ClientCommands, ServerEvents } from "@ludo/shared";
import { sendServerMessage, sendErrorMessage } from "./sender";
import {
  refreshPresenceHeartbeat,
  startPrivateRoomGame,
  getGameState,
  joinMatchmakingQueue,
  cancelMatchmakingQueue,
  handleRollDice,
  handleMoveToken,
  type TokenKey,
} from "@ludo/redis";

/**
 * Handles incoming client messages over WebSocket.
 * Validates envelope with Zod and authorizes commands per user.
 */
export async function handleClientMessage(
  socket: AuthenticatedSocket,
  rawMessage: string,
  redis: Redis,
  registry: ConnectionRegistry
): Promise<void> {
  // 1. Parse JSON
  let json: unknown;
  try {
    json = JSON.parse(rawMessage);
  } catch {
    sendErrorMessage(socket, "INVALID_MESSAGE", "Message must be valid JSON");
    return;
  }

  // 2. Validate envelope with Zod
  const validation = clientMessageSchema.safeParse(json);
  if (!validation.success) {
    sendErrorMessage(
      socket,
      "INVALID_MESSAGE",
      validation.error.errors[0]?.message || "Invalid message envelope"
    );
    return;
  }

  const { type, actionId, payload } = validation.data;

  // 3. Dispatch commands
  switch (type) {
    case ClientCommands.PING: {
      socket.isAlive = true;
      // Refresh presence TTL in Redis (15s heartbeat, 45s TTL)
      await refreshPresenceHeartbeat(redis, socket.userId);
      sendServerMessage(socket, ServerEvents.PONG, { timestamp: Date.now() }, actionId);
      break;
    }

    case ClientCommands.JOIN_GAME: {
      const p = payload as { gameId?: string };
      if (p?.gameId) {
        registry.joinGame(p.gameId, socket.connectionId);
        sendServerMessage(
          socket,
          ServerEvents.GAME_PLAYER_JOINED,
          { gameId: p.gameId, userId: socket.userId },
          actionId
        );
      } else {
        sendErrorMessage(socket, "INVALID_MESSAGE", "gameId required", actionId);
      }
      break;
    }

    case ClientCommands.LEAVE_GAME: {
      const p = payload as { gameId?: string };
      if (p?.gameId) {
        registry.leaveGame(p.gameId, socket.connectionId);
        sendServerMessage(
          socket,
          ServerEvents.GAME_PLAYER_LEFT,
          { gameId: p.gameId, userId: socket.userId },
          actionId
        );
      }
      break;
    }

    case ClientCommands.START_GAME: {
      const p = payload as { gameId?: string };
      if (!p?.gameId) {
        sendErrorMessage(socket, "INVALID_MESSAGE", "gameId required", actionId);
        break;
      }
      try {
        const game = await startPrivateRoomGame(redis, p.gameId, socket.userId);
        sendServerMessage(socket, ServerEvents.GAME_STARTED, game, actionId);
      } catch (err: any) {
        sendErrorMessage(socket, "START_GAME_ERROR", err.message || "Failed to start game", actionId);
      }
      break;
    }

    case ClientCommands.REQUEST_GAME_STATE: {
      const p = payload as { gameId?: string };
      if (!p?.gameId) {
        sendErrorMessage(socket, "INVALID_MESSAGE", "gameId required", actionId);
        break;
      }
      const game = await getGameState(redis, p.gameId);
      if (game) {
        sendServerMessage(socket, ServerEvents.GAME_STATE, game, actionId);
      } else {
        sendErrorMessage(socket, "GAME_NOT_FOUND", "Game not found", actionId);
      }
      break;
    }

    case ClientCommands.JOIN_MATCHMAKING: {
      const p = payload as { username?: string };
      const username = p?.username || `Player_${socket.userId.slice(0, 6)}`;
      const result = await joinMatchmakingQueue(redis, socket.userId, username);
      if (result.success) {
        sendServerMessage(
          socket,
          ServerEvents.MATCHMAKING_JOINED,
          { userId: socket.userId, queueEntryTime: result.queueEntryTime },
          actionId
        );
      } else {
        sendErrorMessage(
          socket,
          result.error || "MATCHMAKING_ERROR",
          result.error === "ALREADY_IN_GAME"
            ? "Cannot join matchmaking while in an active game"
            : "Failed to join matchmaking",
          actionId
        );
      }
      break;
    }

    case ClientCommands.CANCEL_MATCHMAKING: {
      const result = await cancelMatchmakingQueue(redis, socket.userId);
      if (result.success) {
        sendServerMessage(
          socket,
          ServerEvents.MATCHMAKING_CANCELLED,
          { userId: socket.userId },
          actionId
        );
      } else {
        sendErrorMessage(
          socket,
          result.error || "MATCHMAKING_ALREADY_RESERVED",
          "Match found and reserved; cancellation rejected",
          actionId
        );
      }
      break;
    }

    case ClientCommands.ROLL_DICE: {
      const p = payload as { gameId?: string };
      if (!p?.gameId) {
        sendErrorMessage(socket, "INVALID_MESSAGE", "gameId required", actionId);
        break;
      }

      const res = await handleRollDice(redis, p.gameId, socket.userId);
      if (res.success && res.result) {
        sendServerMessage(socket, ServerEvents.DICE_ROLLED, res.result, actionId);
      } else {
        sendErrorMessage(
          socket,
          res.error || "ROLL_DICE_ERROR",
          res.error || "Failed to roll dice",
          actionId
        );
      }
      break;
    }

    case ClientCommands.MOVE_TOKEN: {
      const p = payload as { gameId?: string; tokenKey?: TokenKey };
      if (!p?.gameId || !p?.tokenKey) {
        sendErrorMessage(socket, "INVALID_MESSAGE", "gameId and tokenKey required", actionId);
        break;
      }

      const res = await handleMoveToken(redis, p.gameId, socket.userId, p.tokenKey);
      if (res.success && res.result) {
        sendServerMessage(socket, ServerEvents.TOKEN_MOVED, res.result, actionId);
      } else {
        sendErrorMessage(
          socket,
          res.error || "MOVE_TOKEN_ERROR",
          res.error || "Failed to move token",
          actionId
        );
      }
      break;
    }

    default: {
      sendServerMessage(
        socket,
        "COMMAND_ACK",
        { status: "RECEIVED", command: type },
        actionId
      );
      break;
    }
  }
}
