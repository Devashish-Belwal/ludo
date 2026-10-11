import { jwtVerify } from "jose";
import type { WebSocketCredential } from "@ludo/shared";

function getSecretKey(): Uint8Array {
  const secret = process.env.WS_TOKEN_SECRET;
  if (!secret) {
    throw new Error("WS_TOKEN_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Authenticates the incoming WebSocket connection ticket independently.
 * Does not trust user IDs provided in client messages (Section 9.2 & 17).
 */
export async function authenticateWebSocketTicket(
  ticket: string
): Promise<WebSocketCredential | null> {
  if (!ticket || typeof ticket !== "string") {
    return null;
  }

  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(ticket, secretKey);

    if (!payload.sub || typeof payload.sub !== "string") {
      return null;
    }

    return {
      sub: payload.sub,
      sessionId: (payload.sessionId as string) || "",
      jti: payload.jti || "",
      exp: payload.exp || 0,
      iat: payload.iat,
    };
  } catch (error) {
    return null;
  }
}
