import { issueWebSocketTicket, verifyWebSocketTicket } from "../ws-token";
import { usernameSchema } from "@ludo/shared";

async function testAuthAndTokens() {
  console.log("Running Milestone 3 Verification Tests...");

  // 1. Test Username Validation Schema
  console.log("Testing Username Validation Schema...");
  const validUsernames = ["player1", "Ludo_King", "abc", "User_123_456"];
  for (const name of validUsernames) {
    const res = usernameSchema.safeParse(name);
    if (!res.success) {
      throw new Error(`Valid username '${name}' failed schema validation!`);
    }
  }

  const invalidUsernames = [
    "ab", // too short (<3)
    "a_very_long_username_exceeding_20_chars", // too long (>20)
    "user name", // contains whitespace
    "user@123", // invalid symbol @
    "user-name", // dash is not allowed (only letters, numbers, underscores)
  ];
  for (const name of invalidUsernames) {
    const res = usernameSchema.safeParse(name);
    if (res.success) {
      throw new Error(`Invalid username '${name}' was incorrectly accepted!`);
    }
  }
  console.log("✓ Username validation schema conforms strictly to specification (3-20 chars, letters/numbers/underscores).");

  // 2. Test WebSocket Ticket Issuance & Verification
  console.log("Testing WebSocket Ticket issuance and independent verification...");
  const testUserId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
  const testSessionId = "session-test-uuid";

  const ticket = await issueWebSocketTicket(testUserId, testSessionId);
  if (!ticket || typeof ticket !== "string") {
    throw new Error("Failed to generate WebSocket ticket");
  }

  const claims = await verifyWebSocketTicket(ticket);
  if (claims.sub !== testUserId) {
    throw new Error(`Expected sub '${testUserId}', got '${claims.sub}'`);
  }
  if (claims.sessionId !== testSessionId) {
    throw new Error(`Expected sessionId '${testSessionId}', got '${claims.sessionId}'`);
  }
  if (!claims.jti) {
    throw new Error("Expected jti in token claims");
  }
  if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Expected future expiration on ticket");
  }

  console.log("✓ WebSocket ticket issued and independently verified successfully:", {
    sub: claims.sub,
    sessionId: claims.sessionId,
    jti: claims.jti,
    exp: claims.exp,
  });

  // 3. Test Invalid Ticket Rejection
  let invalidRejected = false;
  try {
    await verifyWebSocketTicket("invalid.jwt.token");
  } catch {
    invalidRejected = true;
  }
  if (!invalidRejected) {
    throw new Error("Tampered/invalid WebSocket ticket was not rejected!");
  }
  console.log("✓ Invalid/tampered WebSocket ticket correctly rejected.");

  console.log("All Milestone 3 unit tests passed successfully!");
}

testAuthAndTokens().catch((err) => {
  console.error(err);
  process.exit(1);
});

