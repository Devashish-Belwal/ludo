import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "../keys";
import { publishGameEvent, publishUserEvent } from "../pubsub";
import { setUserActiveGame, removeUserActiveGame, getUserActiveGame } from "./active-mapping";
import { createInvitation } from "../invitations";
import { leaveActiveGame } from "./play-game";
import {
  createGame,
  startGame,
  type GameState,
  type GamePlayer,
  PLAYER_SLOT_CONFIG,
} from "@ludo/game-engine";
import { ServerEvents, type GameInvitation, type WaitingRoomState, type RoomSlotPlayer } from "@ludo/shared";

export interface CreatePrivateRoomInput {
  gameId: string;
  hostId: string;
  hostUsername: string;
  invitedFriends: { userId: string; username: string }[];
}

export interface CreatePrivateRoomResult {
  game: GameState;
  invitations: GameInvitation[];
}

/**
 * Creates a private waiting room, reserves host, and creates/publishes invitations.
 */
export async function createPrivateRoom(
  redis: Redis,
  input: CreatePrivateRoomInput
): Promise<CreatePrivateRoomResult> {
  // 1. Verify host has no active game
  const hostActiveGame = await getUserActiveGame(redis, input.hostId);
  if (hostActiveGame) {
    throw new Error("HOST_ALREADY_IN_GAME");
  }

  // 2. Validate invitee count (max 3 friends)
  if (input.invitedFriends.length > 3) {
    throw new Error("MAX_THREE_INVITEES_EXCEEDED");
  }

  // 3. Create initial WAITING GameState
  const game = createGame(
    input.gameId,
    [{ userId: input.hostId, username: input.hostUsername, slot: 0 }],
    { status: "WAITING" }
  );

  // 4. Save game in Redis with 3-minute waiting room TTL (Section 10.3 & 13.5)
  await redis.set(
    RedisKeys.game(input.gameId),
    JSON.stringify(game),
    "EX",
    RedisTTL.WAITING_ROOM
  );

  // 5. Reserve host atomically
  await setUserActiveGame(redis, input.hostId, input.gameId);
  await redis.sadd(RedisKeys.gamePlayers(input.gameId), input.hostId);
  await redis.expire(RedisKeys.gamePlayers(input.gameId), RedisTTL.WAITING_ROOM);

  // 6. Create invitations for selected friends
  const invitations: GameInvitation[] = [];
  for (const friend of input.invitedFriends) {
    const inviteId = `invite-${crypto.randomUUID()}`;
    const invitation = await createInvitation(redis, {
      inviteId,
      gameId: input.gameId,
      hostId: input.hostId,
      hostUsername: input.hostUsername,
      recipientId: friend.userId,
      recipientUsername: friend.username,
    });
    invitations.push(invitation);

    // 7. Publish real-time notification to friend's connected tabs
    await publishUserEvent(redis, friend.userId, ServerEvents.INVITATION_RECEIVED, invitation);
  }

  return { game, invitations };
}

/**
 * Retrieves game state from Redis.
 */
export async function getGameState(
  redis: Redis,
  gameId: string
): Promise<GameState | null> {
  const raw = await redis.get(RedisKeys.game(gameId));
  if (!raw) return null;
  const game = JSON.parse(raw) as GameState;
  const normalizedPlayers: [
    GamePlayer | null,
    GamePlayer | null,
    GamePlayer | null,
    GamePlayer | null
  ] = [
    game.players[0] ?? null,
    game.players[1] ?? null,
    game.players[2] ?? null,
    game.players[3] ?? null,
  ];
  game.players = normalizedPlayers;
  return game;
}

/**
 * Saves game state to Redis.
 */
export async function saveGameState(
  redis: Redis,
  game: GameState,
  ttlSeconds?: number
): Promise<void> {
  if (ttlSeconds) {
    await redis.set(RedisKeys.game(game.gameId), JSON.stringify(game), "EX", ttlSeconds);
  } else {
    await redis.set(RedisKeys.game(game.gameId), JSON.stringify(game), "KEEPTTL");
  }
}

/**
 * Formats GameState + invitations into WaitingRoomState for UI consumption.
 */
export async function getWaitingRoomState(
  redis: Redis,
  gameId: string
): Promise<WaitingRoomState | null> {
  const game = await getGameState(redis, gameId);
  if (!game) return null;

  const hostPlayer = game.players[0];
  const hostId = hostPlayer ? hostPlayer.userId : "";

  const players: [
    RoomSlotPlayer | null,
    RoomSlotPlayer | null,
    RoomSlotPlayer | null,
    RoomSlotPlayer | null
  ] = [null, null, null, null];

  for (let slot = 0; slot < 4; slot++) {
    const p = game.players[slot];
    if (p) {
      players[slot] = {
        userId: p.userId,
        username: p.username,
        slot,
        color: PLAYER_SLOT_CONFIG[slot].color,
        isHost: slot === 0,
      };
    }
  }

  // Get TTL remaining on waiting room
  const ttl = await redis.ttl(RedisKeys.game(gameId));
  const remainingMs = Math.max(0, ttl) * 1000;
  const now = Date.now();

  return {
    gameId,
    hostId,
    status: game.status as "WAITING" | "IN_PROGRESS" | "ABANDONED",
    players,
    invitedFriends: [],
    createdAt: game.createdAt,
    expiresAt: now + remainingMs,
  };
}

/**
 * Explicitly starts a WAITING game. Only host can start; requires >= 2 players.
 */
export async function startPrivateRoomGame(
  redis: Redis,
  gameId: string,
  hostId: string
): Promise<GameState> {
  const game = await getGameState(redis, gameId);
  if (!game) {
    throw new Error("GAME_NOT_FOUND");
  }

  if (game.status !== "WAITING") {
    throw new Error("GAME_NOT_WAITING");
  }

  const hostPlayer = game.players[0];
  if (!hostPlayer || hostPlayer.userId !== hostId) {
    throw new Error("UNAUTHORIZED_NOT_HOST");
  }

  const activePlayers = game.players.filter((p: any): p is GamePlayer => p !== null);
  if (activePlayers.length < 2) {
    throw new Error("MINIMUM_PLAYERS_NOT_MET");
  }

  // Use pure game engine logic to start the game
  const startedGame = startGame(game);

  // Persist updated game and remove 3-minute waiting room TTL (active game lifecycle)
  await redis.set(RedisKeys.game(gameId), JSON.stringify(startedGame));
  await redis.persist(RedisKeys.game(gameId));
  await redis.persist(RedisKeys.gamePlayers(gameId));
  await redis.sadd(RedisKeys.gamesActive(), gameId);

  // Publish GAME_STARTED to game room
  await publishGameEvent(redis, gameId, ServerEvents.GAME_STARTED, startedGame);

  return startedGame;
}

/**
 * Leaves a waiting room.
 * If host leaves: waiting room is marked ABANDONED and all reservations cleared.
 * If guest leaves: guest slot is set to null and their reservation cleared.
 */
export async function leaveWaitingRoom(
  redis: Redis,
  gameId: string,
  userId: string
): Promise<{ abandoned: boolean; updatedGame?: GameState }> {
  const game = await getGameState(redis, gameId);
  if (!game) {
    await removeUserActiveGame(redis, userId);
    return { abandoned: true };
  }

  // If game is already active (IN_PROGRESS), handle with authoritative active game leave logic
  if (game.status === "IN_PROGRESS") {
    const res = await leaveActiveGame(redis, gameId, userId);
    return { abandoned: res.game?.status === "ABANDONED", updatedGame: res.game };
  }

  const hostPlayer = game.players[0];
  const isHost = hostPlayer?.userId === userId;

  if (isHost || game.status !== "WAITING") {
    // Host left waiting lobby: clean up all participants from both game.players and Redis set
    const allPlayerIds = new Set<string>();
    for (const p of game.players) {
      if (p?.userId) {
        allPlayerIds.add(p.userId);
      }
    }
    const setMembers = await redis.smembers(RedisKeys.gamePlayers(gameId));
    for (const m of setMembers) {
      allPlayerIds.add(m);
    }

    for (const pid of allPlayerIds) {
      await removeUserActiveGame(redis, pid);
    }

    game.status = "ABANDONED";
    game.version += 1;
    await redis.set(RedisKeys.game(gameId), JSON.stringify(game), "EX", 30);
    await redis.del(RedisKeys.gamePlayers(gameId));

    await publishGameEvent(redis, gameId, ServerEvents.GAME_ABANDONED, {
      gameId,
      reason: "HOST_LEFT",
    });
    return { abandoned: true, updatedGame: game };
  }

  // Regular guest left
  const slotIdx = game.players.findIndex((p: any) => p?.userId === userId);
  if (slotIdx !== -1) {
    game.players[slotIdx] = null;
    game.version += 1;
    await redis.set(RedisKeys.game(gameId), JSON.stringify(game), "KEEPTTL");
  }

  await removeUserActiveGame(redis, userId);
  await redis.srem(RedisKeys.gamePlayers(gameId), userId);

  await publishGameEvent(redis, gameId, ServerEvents.GAME_PLAYER_LEFT, {
    gameId,
    userId,
    slot: slotIdx,
  });

  return { abandoned: false, updatedGame: game };
}

/**
 * Handles waiting room expiration (Section 13.5).
 */
export async function expireWaitingRoom(
  redis: Redis,
  gameId: string
): Promise<void> {
  const game = await getGameState(redis, gameId);
  if (!game || game.status !== "WAITING") return;

  const playerIds = await redis.smembers(RedisKeys.gamePlayers(gameId));
  for (const pid of playerIds) {
    await removeUserActiveGame(redis, pid);
  }

  game.status = "ABANDONED";
  game.version += 1;

  await redis.set(RedisKeys.game(gameId), JSON.stringify(game), "EX", 30);
  await redis.del(RedisKeys.gamePlayers(gameId));

  await publishGameEvent(redis, gameId, ServerEvents.GAME_ABANDONED, {
    gameId,
    reason: "WAITING_ROOM_EXPIRED",
  });
}
