import type { Redis } from "ioredis";
import type { AuthenticatedSocket } from "../connection/registry";
import type { ConnectionRegistry } from "../connection/registry";
import { clientMessageSchema, ClientCommands, ServerEvents } from "@ludo/shared";
import { sendServerMessage, sendErrorMessage } from "./sender";
import { refreshPresenceHeartbeat } from "@ludo/redis";

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

    default: {
      // Future milestone handlers (matchmaking, roll dice, move token) will hook in here
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
