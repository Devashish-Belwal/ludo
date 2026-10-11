export interface WebSocketCredential {
  sub: string;       // User UUID
  sessionId: string; // Session ID or JTI
  jti: string;       // Unique ticket ID
  exp: number;       // Expiration timestamp (seconds)
  iat?: number;      // Issued at timestamp (seconds)
}

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  createdAt: Date;
  updatedAt: Date;
}

