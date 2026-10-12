import { createRedisClient, redis } from "../client";
import { RedisKeys, RedisTTL } from "../keys";
import {
  createPrivateRoom,
  getGameState,
  startPrivateRoomGame,
  leaveWaitingRoom,
  expireWaitingRoom,
} from "../game/private-room";
import {
  getUserPendingInvitations,
  declineInvitation,
  acceptInvitationAtomically,
} from "../invitations";
import { getUserActiveGame, removeUserActiveGame } from "../game/active-mapping";

async function runMilestone8Tests() {
  console.log("Starting Milestone 8: Private Games & Invitations Automated Tests...\n");

  const testRedis = createRedisClient();
  await testRedis.connect();

  const hostId = `host-${Date.now()}`;
  const hostUsername = "HostPlayer";

  const friend1 = { userId: `friend1-${Date.now()}`, username: "FriendOne" };
  const friend2 = { userId: `friend2-${Date.now()}`, username: "FriendTwo" };
  const friend3 = { userId: `friend3-${Date.now()}`, username: "FriendThree" };
  const friend4 = { userId: `friend4-${Date.now()}`, username: "FriendFour" };

  try {
    // 1. Max 3 Invitees Enforcement
    console.log("1. Testing invitee count limit (max 3)...");
    let threwMaxLimit = false;
    try {
      await createPrivateRoom(testRedis, {
        gameId: `game-max-${Date.now()}`,
        hostId,
        hostUsername,
        invitedFriends: [friend1, friend2, friend3, friend4],
      });
    } catch (err: any) {
      if (err.message === "MAX_THREE_INVITEES_EXCEEDED") {
        threwMaxLimit = true;
      }
    }
    if (!threwMaxLimit) throw new Error("Failed to reject more than 3 invitees!");
    console.log("✓ Correctly rejected invitation request exceeding 3 friends.");

    // 2. Private Room Creation & Host Reservation
    console.log("2. Creating private waiting room with 3 friends...");
    const gameId = `game-room-${Date.now()}`;
    const { game, invitations } = await createPrivateRoom(testRedis, {
      gameId,
      hostId,
      hostUsername,
      invitedFriends: [friend1, friend2, friend3],
    });

    if (game.status !== "WAITING") throw new Error("Game status must be WAITING");
    if (invitations.length !== 3) throw new Error(`Expected 3 invitations, got ${invitations.length}`);
    console.log("✓ Created private game in WAITING state with 3 invitations.");

    // Verify host is reserved
    const hostActive = await getUserActiveGame(testRedis, hostId);
    if (hostActive !== gameId) throw new Error(`Host not reserved in active-game! Got: ${hostActive}`);
    console.log("✓ Host reserved in user:active-game:{hostId}.");

    // Verify waiting room TTL (3 minutes = 180s)
    const roomTtl = await testRedis.ttl(RedisKeys.game(gameId));
    if (roomTtl <= 0 || roomTtl > RedisTTL.WAITING_ROOM) {
      throw new Error(`Invalid waiting room TTL: ${roomTtl}`);
    }
    console.log(`✓ Waiting room has 3-minute TTL (${roomTtl}s remaining).`);

    // 3. Prevent Host from creating another game while active
    console.log("3. Testing prevention of host creating second game...");
    let threwHostActive = false;
    try {
      await createPrivateRoom(testRedis, {
        gameId: `game-dup-${Date.now()}`,
        hostId,
        hostUsername,
        invitedFriends: [friend1],
      });
    } catch (err: any) {
      if (err.message === "HOST_ALREADY_IN_GAME") {
        threwHostActive = true;
      }
    }
    if (!threwHostActive) throw new Error("Allowed host with active game to create another game!");
    console.log("✓ Prevented host in active game from creating a second room.");

    // 4. Friend Invitation Retrieval & Expiry
    console.log("4. Testing pending invitations retrieval for invitees...");
    const friend1Invites = await getUserPendingInvitations(testRedis, friend1.userId);
    if (friend1Invites.length !== 1 || friend1Invites[0].inviteId !== invitations[0].inviteId) {
      throw new Error("Friend 1 failed to receive pending invitation");
    }
    const inviteTtl = await testRedis.ttl(RedisKeys.invite(invitations[0].inviteId));
    if (inviteTtl <= 0 || inviteTtl > RedisTTL.INVITATION) {
      throw new Error(`Invalid invitation TTL: ${inviteTtl}`);
    }
    console.log(`✓ Pending invitations retrieved successfully (TTL: ${inviteTtl}s).`);

    // 5. Decline Invitation
    console.log("5. Testing invitation decline...");
    const friend3Invite = invitations[2];
    const declineRes = await declineInvitation(testRedis, friend3Invite.inviteId, friend3.userId);
    if (!declineRes.success || declineRes.invitation?.status !== "DECLINED") {
      throw new Error("Failed to decline invitation");
    }
    const friend3Pending = await getUserPendingInvitations(testRedis, friend3.userId);
    if (friend3Pending.length !== 0) {
      throw new Error("Declined invitation still appeared in pending list");
    }
    console.log("✓ Invitation declined and removed from recipient's pending set.");

    // 6. Cannot Start Game with only 1 player
    console.log("6. Testing game start with only 1 player (Host alone)...");
    let threwMinPlayers = false;
    try {
      await startPrivateRoomGame(testRedis, gameId, hostId);
    } catch (err: any) {
      if (err.message === "MINIMUM_PLAYERS_NOT_MET") {
        threwMinPlayers = true;
      }
    }
    if (!threwMinPlayers) throw new Error("Host was allowed to start game with only 1 player!");
    console.log("✓ Correctly rejected starting game with fewer than 2 players.");

    // 7. Atomic Acceptance (Friend 1 accepts)
    console.log("7. Testing atomic invitation acceptance (Lua script)...");
    const friend1Invite = invitations[0];
    const acceptRes1 = await acceptInvitationAtomically(
      testRedis,
      friend1Invite.inviteId,
      friend1.userId,
      friend1.username,
      gameId
    );

    if (!acceptRes1.success || acceptRes1.slot !== 1) {
      throw new Error(`Acceptance failed or wrong slot assigned! Result: ${JSON.stringify(acceptRes1)}`);
    }

    const friend1Active = await getUserActiveGame(testRedis, friend1.userId);
    if (friend1Active !== gameId) throw new Error("Friend 1 active game not set after acceptance!");
    console.log(`✓ Friend 1 atomically accepted invitation; assigned to Slot ${acceptRes1.slot} (GREEN).`);

    // 8. Prevent user from accepting two games simultaneously
    console.log("8. Testing simultaneous game reservation prevention...");
    const acceptResDup = await acceptInvitationAtomically(
      testRedis,
      invitations[1].inviteId,
      friend1.userId, // Friend 1 tries to accept another invite while already in gameId
      friend1.username,
      gameId
    );
    if (acceptResDup.success || acceptResDup.error !== "USER_ALREADY_IN_GAME") {
      throw new Error(`Expected USER_ALREADY_IN_GAME error, got: ${JSON.stringify(acceptResDup)}`);
    }
    console.log("✓ Correctly rejected acceptance because user already has an active game.");

    // 9. Non-host cannot start game
    console.log("9. Testing non-host authorization for game start...");
    let threwNonHost = false;
    try {
      await startPrivateRoomGame(testRedis, gameId, friend1.userId);
    } catch (err: any) {
      if (err.message === "UNAUTHORIZED_NOT_HOST") {
        threwNonHost = true;
      }
    }
    if (!threwNonHost) throw new Error("Guest was allowed to start the game!");
    console.log("✓ Correctly rejected non-host attempt to start the game.");

    // 10. Host Starts Game with 2 human players
    console.log("10. Testing host starting game with 2 players...");
    const startedGame = await startPrivateRoomGame(testRedis, gameId, hostId);
    if (startedGame.status !== "IN_PROGRESS") throw new Error("Game status did not transition to IN_PROGRESS");
    if (startedGame.currentTurn !== 0) throw new Error("Game turn did not start at Slot 0");
    if (startedGame.players[0] === null || startedGame.players[1] === null) {
      throw new Error("Active players missing in started game");
    }
    // Verify empty slots remain empty
    if (startedGame.players[2] !== null || startedGame.players[3] !== null) {
      throw new Error("Empty slots (2 and 3) were not preserved as null!");
    }
    // Verify 3-minute waiting room TTL was cleared (persisted for active game lifecycle)
    const activeTtl = await testRedis.ttl(RedisKeys.game(gameId));
    if (activeTtl !== -1) {
      throw new Error(`Active game should have no TTL (-1), got: ${activeTtl}`);
    }
    console.log("✓ Game started: status is IN_PROGRESS, empty slots 2 & 3 remain null, TTL cleared.");

    // 11. Testing Host Leaving Waiting Room & Releasing all Guests
    console.log("11. Testing host leaving waiting room and releasing guests...");
    const host2Id = `host2-${Date.now()}`;
    const guestId = `guest2-${Date.now()}`;
    const game2Id = `game-leave-${Date.now()}`;
    await createPrivateRoom(testRedis, {
      gameId: game2Id,
      hostId: host2Id,
      hostUsername: "Host2",
      invitedFriends: [{ userId: guestId, username: "Guest2" }],
    });
    const guestInvites = await getUserPendingInvitations(testRedis, guestId);
    await acceptInvitationAtomically(testRedis, guestInvites[0].inviteId, guestId, "Guest2", game2Id);

    const hActiveBefore = await getUserActiveGame(testRedis, host2Id);
    const gActiveBefore = await getUserActiveGame(testRedis, guestId);
    if (hActiveBefore !== game2Id || gActiveBefore !== game2Id) {
      throw new Error("Host or guest not active before host leave!");
    }

    const leaveResult = await leaveWaitingRoom(testRedis, game2Id, host2Id);
    if (!leaveResult.abandoned) throw new Error("Room was not abandoned on host leave");

    const hActiveAfter = await getUserActiveGame(testRedis, host2Id);
    const gActiveAfter = await getUserActiveGame(testRedis, guestId);
    if (hActiveAfter !== null) throw new Error("Host active game was not cleared!");
    if (gActiveAfter !== null) throw new Error("Guest active game was not released on host leave!");
    console.log("✓ Host leaving waiting room abandoned room and released all guest reservations.");

    // 12. Cleanup test keys
    console.log("12. Cleaning up test data...");
    await removeUserActiveGame(testRedis, hostId);
    await removeUserActiveGame(testRedis, friend1.userId);
    await testRedis.del(
      RedisKeys.game(gameId),
      RedisKeys.game(game2Id),
      RedisKeys.gamePlayers(gameId),
      RedisKeys.gamePlayers(game2Id),
      RedisKeys.invite(invitations[0].inviteId),
      RedisKeys.invite(invitations[1].inviteId),
      RedisKeys.invite(invitations[2].inviteId),
      RedisKeys.userInvitations(friend1.userId),
      RedisKeys.userInvitations(friend2.userId),
      RedisKeys.userInvitations(friend3.userId),
      RedisKeys.userInvitations(guestId)
    );

    console.log("\nAll Milestone 8 Private Games & Invitations tests passed successfully!");
  } finally {
    await testRedis.quit();
  }
}

runMilestone8Tests().catch((err) => {
  console.error("Milestone 8 tests failed:", err);
  process.exit(1);
});
