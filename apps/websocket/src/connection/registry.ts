import type { WebSocket } from "ws";

export interface AuthenticatedSocket extends WebSocket {
  connectionId: string;
  userId: string;
  deviceId: string;
  sessionId: string;
  isAlive: boolean;
  gameId?: string;
}

/**
 * In-memory connection registry mapping:
 * - connectionId -> AuthenticatedSocket
 * - userId -> Set of connectionIds (multiple tabs support)
 */
export class ConnectionRegistry {
  private connections = new Map<string, AuthenticatedSocket>();
  private userConnections = new Map<string, Set<string>>();
  private gameConnections = new Map<string, Set<string>>();

  public add(socket: AuthenticatedSocket): void {
    this.connections.set(socket.connectionId, socket);

    if (!this.userConnections.has(socket.userId)) {
      this.userConnections.set(socket.userId, new Set());
    }
    this.userConnections.get(socket.userId)!.add(socket.connectionId);
  }

  public remove(connectionId: string): AuthenticatedSocket | undefined {
    const socket = this.connections.get(connectionId);
    if (!socket) return undefined;

    this.connections.delete(connectionId);

    const userSet = this.userConnections.get(socket.userId);
    if (userSet) {
      userSet.delete(connectionId);
      if (userSet.size === 0) {
        this.userConnections.delete(socket.userId);
      }
    }

    if (socket.gameId) {
      this.leaveGame(socket.gameId, connectionId);
    }

    return socket;
  }

  public get(connectionId: string): AuthenticatedSocket | undefined {
    return this.connections.get(connectionId);
  }

  public getUserConnections(userId: string): AuthenticatedSocket[] {
    const connIds = this.userConnections.get(userId);
    if (!connIds) return [];

    const sockets: AuthenticatedSocket[] = [];
    for (const id of connIds) {
      const s = this.connections.get(id);
      if (s && s.readyState === s.OPEN) {
        sockets.push(s);
      }
    }
    return sockets;
  }

  public joinGame(gameId: string, connectionId: string): void {
    if (!this.gameConnections.has(gameId)) {
      this.gameConnections.set(gameId, new Set());
    }
    this.gameConnections.get(gameId)!.add(connectionId);
    const socket = this.connections.get(connectionId);
    if (socket) {
      socket.gameId = gameId;
    }
  }

  public leaveGame(gameId: string, connectionId: string): void {
    const set = this.gameConnections.get(gameId);
    if (set) {
      set.delete(connectionId);
      if (set.size === 0) {
        this.gameConnections.delete(gameId);
      }
    }
    const socket = this.connections.get(connectionId);
    if (socket && socket.gameId === gameId) {
      socket.gameId = undefined;
    }
  }

  public getGameConnections(gameId: string): AuthenticatedSocket[] {
    const connIds = this.gameConnections.get(gameId);
    if (!connIds) return [];

    const sockets: AuthenticatedSocket[] = [];
    for (const id of connIds) {
      const s = this.connections.get(id);
      if (s && s.readyState === s.OPEN) {
        sockets.push(s);
      }
    }
    return sockets;
  }

  public getAllConnections(): AuthenticatedSocket[] {
    return Array.from(this.connections.values());
  }
}
