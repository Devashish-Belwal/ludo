import { auth } from "@/lib/auth";
import { issueWebSocketTicket } from "@/lib/ws-token";
import { NextResponse } from "next/server";

/**
 * Issues short-lived signed WebSocket connection tickets for authenticated users.
 * Next.js validates session before issuance; WS service independently verifies it.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized: authentication required" },
      { status: 401 }
    );
  }

  try {
    const ticket = await issueWebSocketTicket(
      session.user.id,
      session.user.id // sessionId
    );

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("Failed to generate WebSocket ticket:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

