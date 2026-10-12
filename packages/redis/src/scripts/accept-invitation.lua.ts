/**
 * Redis Lua script for atomic acceptance of game invitations per Section 13.3.
 *
 * Keys:
 * 1: user:active-game:{recipientId}
 * 2: invite:{inviteId}
 * 3: user:invitations:{recipientId}
 * 4: game:{gameId}
 * 5: game:players:{gameId}
 *
 * ARGV:
 * 1: recipientId
 * 2: recipientUsername
 * 3: currentTime (ms)
 */
export const ACCEPT_INVITATION_LUA = `
local activeGame = redis.call('GET', KEYS[1])
if activeGame then
  return cjson.encode({ ok = false, error = 'USER_ALREADY_IN_GAME' })
end

local inviteRaw = redis.call('GET', KEYS[2])
if not inviteRaw then
  return cjson.encode({ ok = false, error = 'INVITATION_NOT_FOUND' })
end

local invite = cjson.decode(inviteRaw)
if invite.recipientId ~= ARGV[1] then
  return cjson.encode({ ok = false, error = 'NOT_INVITATION_RECIPIENT' })
end

if invite.status ~= 'PENDING' then
  return cjson.encode({ ok = false, error = 'INVITATION_NOT_PENDING' })
end

if tonumber(ARGV[3]) > tonumber(invite.expiresAt) then
  invite.status = 'EXPIRED'
  redis.call('SET', KEYS[2], cjson.encode(invite), 'KEEPTTL')
  redis.call('SREM', KEYS[3], invite.inviteId)
  return cjson.encode({ ok = false, error = 'INVITATION_EXPIRED' })
end

local gameRaw = redis.call('GET', KEYS[4])
if not gameRaw then
  return cjson.encode({ ok = false, error = 'GAME_NOT_FOUND' })
end

local game = cjson.decode(gameRaw)
if game.status ~= 'WAITING' then
  return cjson.encode({ ok = false, error = 'GAME_NOT_WAITING' })
end

-- Find available slot (0-indexed)
local assignedSlot = -1
for i = 1, 4 do
  if game.players[i] == nil or game.players[i] == cjson.null then
    assignedSlot = i - 1
    break
  end
end

if assignedSlot == -1 then
  return cjson.encode({ ok = false, error = 'GAME_FULL' })
end

-- Colors matching slot order in Ludo engine: RED, GREEN, YELLOW, BLUE
local colors = { 'RED', 'GREEN', 'YELLOW', 'BLUE' }
local newPlayer = {
  userId = ARGV[1],
  username = ARGV[2],
  color = colors[assignedSlot + 1],
  tokens = {
    token1 = { type = 'HOME' },
    token2 = { type = 'HOME' },
    token3 = { type = 'HOME' },
    token4 = { type = 'HOME' }
  }
}

game.players[assignedSlot + 1] = newPlayer
game.version = (game.version or 1) + 1
game.lastActivityAt = tonumber(ARGV[3])

for i = 1, 4 do
  if game.players[i] == nil then
    game.players[i] = cjson.null
  end
end

-- Persist atomic state changes
redis.call('SET', KEYS[4], cjson.encode(game), 'KEEPTTL')
redis.call('SADD', KEYS[5], ARGV[1])
redis.call('SET', KEYS[1], game.gameId)

invite.status = 'ACCEPTED'
redis.call('SET', KEYS[2], cjson.encode(invite), 'KEEPTTL')
redis.call('SREM', KEYS[3], invite.inviteId)

return cjson.encode({
  ok = true,
  slot = assignedSlot,
  game = game,
  invite = invite
})
`;
