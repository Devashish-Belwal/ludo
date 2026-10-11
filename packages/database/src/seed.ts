import { prisma, normalizeFriendshipPair, normalizeUsername } from "./index";

async function main() {
  console.log("Starting database verification test & seed...");

  // 1. Clean up previous test data if any
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { user1: { email: { contains: "@test.ludo" } } },
        { user2: { email: { contains: "@test.ludo" } } },
      ],
    },
  });
  await prisma.friendRequest.deleteMany({
    where: {
      OR: [
        { sender: { email: { contains: "@test.ludo" } } },
        { receiver: { email: { contains: "@test.ludo" } } },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: { email: { contains: "@test.ludo" } },
  });

  // 2. Test user creation
  const userA = await prisma.user.create({
    data: {
      googleId: "google-test-id-1",
      email: "player1@test.ludo",
      username: "PlayerOne",
      normalizedUsername: normalizeUsername("PlayerOne"),
    },
  });

  const userB = await prisma.user.create({
    data: {
      googleId: "google-test-id-2",
      email: "player2@test.ludo",
      username: "PlayerTwo",
      normalizedUsername: normalizeUsername("PlayerTwo"),
    },
  });

  console.log("✓ User creation verified:", userA.id, userB.id);

  // 3. Test case-insensitive username collision
  let collisionFailed = false;
  try {
    await prisma.user.create({
      data: {
        googleId: "google-test-id-3",
        email: "player3@test.ludo",
        username: "playerone", // duplicate in lowercase
        normalizedUsername: normalizeUsername("playerone"),
      },
    });
  } catch {
    collisionFailed = true;
  }

  if (!collisionFailed) {
    throw new Error("Case-insensitive username uniqueness constraint failed to reject duplicate!");
  }
  console.log("✓ Case-insensitive duplicate username correctly rejected by constraint.");

  // 4. Test Friend Request creation
  const request = await prisma.friendRequest.create({
    data: {
      senderId: userA.id,
      receiverId: userB.id,
    },
  });
  console.log("✓ Friend request creation verified:", request.id);

  // Test duplicate friend request prevention
  let dupRequestRejected = false;
  try {
    await prisma.friendRequest.create({
      data: {
        senderId: userA.id,
        receiverId: userB.id,
      },
    });
  } catch {
    dupRequestRejected = true;
  }

  if (!dupRequestRejected) {
    throw new Error("Duplicate friend request was not rejected by database constraint!");
  }
  console.log("✓ Duplicate pending friend request correctly rejected.");

  // 5. Test Friendship creation with pair normalization
  const pair1 = normalizeFriendshipPair(userA.id, userB.id);
  const friendship = await prisma.friendship.create({
    data: {
      user1Id: pair1.user1Id,
      user2Id: pair1.user2Id,
    },
  });
  console.log("✓ Friendship created with normalized pair:", friendship.id, pair1);

  // Attempt duplicate friendship with reversed pair
  const pair2 = normalizeFriendshipPair(userB.id, userA.id);
  let dupFriendshipRejected = false;
  try {
    await prisma.friendship.create({
      data: {
        user1Id: pair2.user1Id,
        user2Id: pair2.user2Id,
      },
    });
  } catch {
    dupFriendshipRejected = true;
  }

  if (!dupFriendshipRejected) {
    throw new Error("Duplicate friendship was not rejected by database constraint!");
  }
  console.log("✓ Duplicate friendship correctly rejected by unique constraint.");

  // 6. Clean up verification records
  await prisma.friendship.delete({ where: { id: friendship.id } });
  await prisma.friendRequest.delete({ where: { id: request.id } });
  await prisma.user.deleteMany({
    where: { email: { contains: "@test.ludo" } },
  });

  console.log("✓ Test cleanup completed. All constraints and models verified successfully!");
}

main()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

