import { z } from "zod";

/**
 * Username constraints:
 * - 3 to 20 characters
 * - Letters, numbers, and underscores only
 * - No whitespace
 */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(
    USERNAME_REGEX,
    "Username can only contain letters, numbers, and underscores"
  );

export const updateUsernameSchema = z.object({
  username: usernameSchema,
});

export type UpdateUsernameInput = z.infer<typeof updateUsernameSchema>;

