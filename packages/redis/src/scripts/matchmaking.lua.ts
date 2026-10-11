/**
 * Lua script: Atomic Matchmaking Batch Reservation
 *
 * KEYS[1]: matchmaking:public (sorted set)
 * ARGV[1]: batchId
 * ARGV[2..5]: 4 userIds
 *
 * Checks that all 4 users are currently in the queue and not already reserved.
 * Atomically removes them from queue and writes matchmaking:reserved:{userId} = batchId.
 * Returns 1 on success, 0 on failure.
 */
export const RESERVE_MATCHMAKING_BATCH_LUA = `
local queueKey = KEYS[1]
local batchId = ARGV[1]

-- 1. Check all 4 users exist in queue and are not reserved
for i = 2, 5 do
  local userId = ARGV[i]
  local score = redis.call('ZSCORE', queueKey, userId)
  if not score then
    return 0
  end
  local reserved = redis.call('GET', 'matchmaking:reserved:' .. userId)
  if reserved then
    return 0
  end
end

-- 2. Reserve all 4 users and remove from queue
for i = 2, 5 do
  local userId = ARGV[i]
  redis.call('ZREM', queueKey, userId)
  redis.call('SET', 'matchmaking:reserved:' .. userId, batchId)
end

return 1
`;
