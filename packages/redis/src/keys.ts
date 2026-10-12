/**
 * Centralized Redis key schema matching Section 10.2 of technical specification:
 *
 * presence:{userId}
 * connections:{userId}
 * connection:{connectionId}
 * user:active-game:{userId}
 * game:{gameId}
 * game:players:{gameId}
 * game:connections:{gameId}
 * game:disconnect:{gameId}
 * matchmaking:public
 * matchmaking:reserved:{userId}
 * matchmaking:batch:{batchId}
 * ws:action:{userId}:{actionId}
 * invite:{inviteId}
 * user:invitations:{userId}
 */

export const RedisKeys = {
  // Presence & Connection tracking
  presence: (userId: string) => `presence:${userId}`,
  userConnections: (userId: string) => `connections:${userId}`,
  connection: (connectionId: string) => `connection:${connectionId}`,

  // Active game mapping
  userActiveGame: (userId: string) => `user:active-game:${userId}`,

  // Active game state
  gamesActive: () => `games:active`,
  game: (gameId: string) => `game:${gameId}`,
  gamePlayers: (gameId: string) => `game:players:${gameId}`,
  gameConnections: (gameId: string) => `game:connections:${gameId}`,
  gameDisconnect: (gameId: string) => `game:disconnect:${gameId}`,
  gameTimeouts: (gameId: string) => `game:timeouts:${gameId}`,

  // Public Matchmaking
  matchmakingQueue: () => `matchmaking:public`,
  matchmakingReserved: (userId: string) => `matchmaking:reserved:${userId}`,
  matchmakingBatch: (batchId: string) => `matchmaking:batch:${batchId}`,

  // Idempotency
  wsAction: (userId: string, actionId: string) => `ws:action:${userId}:${actionId}`,

  // Invitations
  invite: (inviteId: string) => `invite:${inviteId}`,
  userInvitations: (userId: string) => `user:invitations:${userId}`,
} as const;

/**
 * Pub/Sub channel names per Section 10.6
 */
export const RedisChannels = {
  gameEvents: (gameId: string) => `game:events:${gameId}`,
  userEvents: (userId: string) => `user:events:${userId}`,
  presenceEvents: () => `presence:events`,
  matchmakingEvents: () => `matchmaking:events`,
} as const;

/**
 * Key Expiration Policies per Section 10.3 & 15.1
 */
export const RedisTTL = {
  PRESENCE: 45,                  // 45 seconds, refreshed every 15s heartbeat
  INVITATION: 300,               // 5 minutes
  WAITING_ROOM: 180,             // 3 minutes
  IDEMPOTENCY_ACTION: 600,       // 10 minutes
  TURN_SKIP: 10,                 // 10 seconds turn skip deadline
  DISCONNECT_REMOVAL: 60,        // 60 seconds removal deadline
  GAME_INACTIVITY: 300,          // 5 minutes of zero activity closes match
  MAX_CONSECUTIVE_TIMEOUTS: 3,   // 3 consecutive missed turns forfeits player
} as const;
