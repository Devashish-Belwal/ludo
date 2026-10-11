import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";

/**
 * Normalizes two user IDs so that user1Id is lexicographically smaller than user2Id.
 * This guarantees unique pair storage in the Friendship table regardless of who initiated it.
 */
export function normalizeFriendshipPair(
  userIdA: string,
  userIdB: string
): { user1Id: string; user2Id: string } {
  if (userIdA === userIdB) {
    throw new Error("Users cannot form a friendship with themselves.");
  }
  return userIdA < userIdB
    ? { user1Id: userIdA, user2Id: userIdB }
    : { user1Id: userIdB, user2Id: userIdA };
}

/**
 * Normalizes a username for case-insensitive uniqueness checks.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

