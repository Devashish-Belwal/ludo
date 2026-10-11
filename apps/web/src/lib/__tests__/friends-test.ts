import { prisma, normalizeUsername } from "@ludo/database";

// Helper to run tests for Milestone 4 friends business logic and database constraints

// Helper to run tests with a simulated session user
async function runFriendsTests() {
  console.log("Starting Milestone 4 Friends System Unit & Integration Tests...");

  // 1. Setup test users in PostgreSQL
  const suffix = Date.now();
  const user1 = await prisma.user.create({
    data: {
      googleId: `google-friend-1-${suffix}`,
      email: `friend1-${suffix}@test.ludo`,
      username: `Alpha_${suffix}`,
      normalizedUsername: normalizeUsername(`Alpha_${suffix}`),
    },
  });

  const user2 = await prisma.user.create({
    data: {
      googleId: `google-friend-2-${suffix}`,
      email: `friend2-${suffix}@test.ludo`,
      username: `Beta_${suffix}`,
      normalizedUsername: normalizeUsername(`Beta_${suffix}`),
    },
  });

  const user3 = await prisma.user.create({
    data: {
      googleId: `google-friend-3-${suffix}`,
      email: `friend3-${suffix}@test.ludo`,
      username: `Gamma_${suffix}`,
      normalizedUsername: normalizeUsername(`Gamma_${suffix}`),
    },
  });

  console.log("✓ Created 3 test users:", user1.username, user2.username, user3.username);

  // 2. Direct database tests for business constraints
  console.log("Testing friend request creation directly in database...");
  const fr = await prisma.friendRequest.create({
    data: {
      senderId: user1.id,
      receiverId: user2.id,
    },
  });
  console.log("✓ Friend request created:", fr.id);

  // Duplicate request check
  let dupRejected = false;
  try {
    await prisma.friendRequest.create({
      data: {
        senderId: user1.id,
        receiverId: user2.id,
      },
    });
  } catch {
    dupRejected = true;
  }
  if (!dupRejected) throw new Error("Duplicate friend request was not rejected!");
  console.log("✓ Duplicate pending friend request rejected by database constraint.");

  // Transaction accept
  await prisma.$transaction([
    prisma.friendship.create({
      data: {
        user1Id: user1.id < user2.id ? user1.id : user2.id,
        user2Id: user1.id < user2.id ? user2.id : user1.id,
      },
    }),
    prisma.friendRequest.delete({ where: { id: fr.id } }),
  ]);
  console.log("✓ Accepted request and created friendship inside transaction.");

  // Verify friendship exists
  const count = await prisma.friendship.count({
    where: {
      OR: [
        { user1Id: user1.id, user2Id: user2.id },
        { user1Id: user2.id, user2Id: user1.id },
      ],
    },
  });
  if (count !== 1) throw new Error("Friendship was not found after acceptance!");
  console.log("✓ Friendship verified in database.");

  // 3. Clean up test users
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { user1Id: { in: [user1.id, user2.id, user3.id] } },
        { user2Id: { in: [user1.id, user2.id, user3.id] } },
      ],
    },
  });
  await prisma.friendRequest.deleteMany({
    where: {
      OR: [
        { senderId: { in: [user1.id, user2.id, user3.id] } },
        { receiverId: { in: [user1.id, user2.id, user3.id] } },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [user1.id, user2.id, user3.id] } },
  });

  console.log("✓ Test users cleaned up successfully.");
  console.log("All Milestone 4 logic & constraint tests passed successfully!");
}

runFriendsTests()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
