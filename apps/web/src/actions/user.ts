"use server";

import { auth } from "@/lib/auth";
import { prisma, normalizeUsername } from "@ludo/database";
import { usernameSchema } from "@ludo/shared";

export type UpdateUsernameResult =
  | { success: true; username: string }
  | { success: false; error: string };

/**
 * Server Action to update the user's permanent application username.
 * Validates with Zod and enforces case-insensitive uniqueness in PostgreSQL.
 */
export async function updateUsername(
  rawUsername: string
): Promise<UpdateUsernameResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized: Please sign in." };
  }

  // 1. Zod validation
  const validation = usernameSchema.safeParse(rawUsername);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors[0]?.message || "Invalid username format.",
    };
  }

  const cleanUsername = validation.data;
  const normalized = normalizeUsername(cleanUsername);

  try {
    // 2. Check if another user already has this normalized username
    const existing = await prisma.user.findFirst({
      where: {
        normalizedUsername: normalized,
        NOT: { id: session.user.id },
      },
    });

    if (existing) {
      return { success: false, error: "Username is already taken." };
    }

    // 3. Update in PostgreSQL
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        username: cleanUsername,
        normalizedUsername: normalized,
      },
    });

    return { success: true, username: updatedUser.username ?? cleanUsername };
  } catch (error) {
    console.error("Failed to update username:", error);
    return { success: false, error: "Failed to update username. Please try again." };
  }
}

