import type { Redis } from "ioredis";
import type { ConnectionRegistry } from "../connection/registry";
import { RedisChannels } from "@ludo/redis";
import { sendServerMessage } from "../handlers/sender";

/**
 * Initializes Redis Pub/Sub subscription and distributes real-time events to connected sockets.
 */
export async function setupPubSubListener(
  redisSubscriber: Redis,
  registry: ConnectionRegistry
): Promise<void> {
  // Subscribe to pattern for all user and game events
  await redisSubscriber.psubscribe("user:events:*", "game:events:*", "presence:events", "matchmaking:events");

  redisSubscriber.on("pmessage", (pattern, channel, message) => {
    try {
      const parsed = JSON.parse(message);
      const { type, payload } = parsed;

      if (channel.startsWith("user:events:")) {
        const userId = channel.replace("user:events:", "");
        const sockets = registry.getUserConnections(userId);
        for (const socket of sockets) {
          sendServerMessage(socket, type, payload);
        }
      } else if (channel.startsWith("game:events:")) {
        const gameId = channel.replace("game:events:", "");
        const sockets = registry.getGameConnections(gameId);
        for (const socket of sockets) {
          sendServerMessage(socket, type, payload);
        }
      }
    } catch (err) {
      console.error("Failed to process Pub/Sub message:", err);
    }
  });
}
