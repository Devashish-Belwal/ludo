import { SignJWT, jwtVerify } from "jose";
import type { WebSocketCredential } from "@ludo/shared";

function getSecretKey(): Uint8Array {
  const secret = process.env.WS_TOKEN_SECRET;
  if (!secret) {
    throw new Error("WS_TOKEN_SECRET environment variable is not defined");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Issues a short-lived signed WebSocket connection ticket (60s TTL).
 * Claims: sub (userId), sessionId, jti, exp, iat.
 */
export async function issueWebSocketTicket(
  userId: string,
  sessionId: string
): Promise<string> {
  const secretKey = getSecretKey();
  const jti = crypto.randomUUID();

  return await new SignJWT({
    sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("60s") // short-lived connection ticket
    .sign(secretKey);
}

/**
 * Verifies a WebSocket ticket using the shared WS_TOKEN_SECRET.
 * Used by Next.js and WebSocket service to independently verify tickets.
 */
export async function verifyWebSocketTicket(
  token: string
): Promise<WebSocketCredential> {
  const secretKey = getSecretKey();
  const { payload } = await jwtVerify(token, secretKey);

  if (!payload.sub) {
    throw new Error("Invalid token payload: missing sub");
  }

  return {
    sub: payload.sub,
    sessionId: (payload.sessionId as string) || "",
    jti: payload.jti || "",
    exp: payload.exp || 0,
    iat: payload.iat,
  };
}

