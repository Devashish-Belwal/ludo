/**
 * Lua script: Atomic Matchmaking Batch Reservation
 *
 * KEYS[1]: matchmaking:public (sorted set)
 * ARGV[1]: batchId
 * If #ARGV >= 6:
 *   ARGV[2]: batchJsonData
 *   ARGV[3..6]: 4 userIds
 * If #ARGV == 5:
 *   ARGV[2..5]: 4 userIds
 *
 * Checks:
 * 1. All 4 users exist in queue (ZSCORE).
 * 2. None of the 4 users are currently reserved (matchmaking:reserved:{userId}).
 * 3. None of the 4 users already have an active game (user:active-game:{userId}).
 *    - If a user has an active game, evicts them from matchmaking:public and aborts.
 *
 * If valid:
 * - Atomically removes all 4 from matchmaking:public.
 * - Sets matchmaking:reserved:{userId} = batchId with 120s TTL (prevents stuck reservations).
 * - Stores matchmaking:batch:{batchId} = batchJsonData with 300s TTL (if batchData provided).
 * - Returns 1 on success, 0 on failure.
 */
export const RESERVE_MATCHMAKING_BATCH_LUA = `
local queueKey = KEYS[1]
local batchId = ARGV[1]
local batchData = nil
local userStartIdx = 2

if #ARGV >= 6 then
  batchData = ARGV[2]
  userStartIdx = 3
end

-- 1. Validate all 4 users
for i = userStartIdx, userStartIdx + 3 do
  local userId = ARGV[i]
  
  -- Check active game first; evict if present
  local activeGame = redis.call('GET', 'user:active-game:' .. userId)
  if activeGame then
    redis.call('ZREM', queueKey, userId)
    return 0
  end

  -- Check queued in matchmaking:public
  local score = redis.call('ZSCORE', queueKey, userId)
  if not score then
    return 0
  end

  -- Check not already reserved
  local reserved = redis.call('GET', 'matchmaking:reserved:' .. userId)
  if reserved then
    return 0
  end
end

-- 2. Atomically reserve all 4 users and save batch record
for i = userStartIdx, userStartIdx + 3 do
  local userId = ARGV[i]
  redis.call('ZREM', queueKey, userId)
  redis.call('SET', 'matchmaking:reserved:' .. userId, batchId, 'EX', 120)
end

if batchData then
  redis.call('SET', 'matchmaking:batch:' .. batchId, batchData, 'EX', 300)
end

return 1
`;

/**
 * Lua script: Atomic Matchmaking Cancellation
 *
 * KEYS[1]: matchmaking:public (sorted set)
 * ARGV[1]: userId
 *
 * Enforces race rules per Section 14.3:
 * - If user is already reserved in a batch (matchmaking:reserved:{userId}),
 *   cancellation is rejected (returns 0).
 * - If user is in queue and NOT reserved, removes from queue (returns 1).
 * - If user was not in queue and not reserved, returns 2.
 */
export const CANCEL_MATCHMAKING_LUA = `
local queueKey = KEYS[1]
local userId = ARGV[1]

-- 1. Check if reservation already won the race
local reserved = redis.call('GET', 'matchmaking:reserved:' .. userId)
if reserved then
  return 0
end

-- 2. Check if user is in queue
local score = redis.call('ZSCORE', queueKey, userId)
if score then
  redis.call('ZREM', queueKey, userId)
  return 1
end

return 2
`;
