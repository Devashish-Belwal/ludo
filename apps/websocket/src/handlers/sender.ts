import type { WebSocket } from "ws";
import type { ServerMessage, ErrorPayload } from "@ludo/shared";
import { ServerEvents } from "@ludo/shared";

/**
 * Sends a typed, structured ServerMessage envelope per Section 9.3
 */
export function sendServerMessage<T>(
  socket: WebSocket,
  type: string,
  payload: T,
  eventId?: string
): void {
  if (socket.readyState !== socket.OPEN) return;

  const message: ServerMessage<T> = {
    type,
    eventId: eventId ?? crypto.randomUUID(),
    payload,
    timestamp: Date.now(),
  };

  socket.send(JSON.stringify(message));
}

/**
 * Sends a standardized Error envelope per Section 9.6
 */
export function sendErrorMessage(
  socket: WebSocket,
  code: string,
  message: string,
  actionId?: string
): void {
  const errorPayload: ErrorPayload = {
    code,
    message,
    actionId,
  };

  sendServerMessage(socket, ServerEvents.ERROR, errorPayload);
}
