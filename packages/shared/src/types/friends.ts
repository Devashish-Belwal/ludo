export type RelationshipStatus =
  | "NONE"
  | "FRIENDS"
  | "OUTGOING_PENDING"
  | "INCOMING_PENDING";

export interface FriendUser {
  id: string;
  username: string;
}

export interface IncomingFriendRequest {
  id: string;
  sender: {
    id: string;
    username: string;
  };
  createdAt: Date;
}

export interface SearchUserResult {
  id: string;
  username: string;
  relationship: RelationshipStatus;
  requestId?: string; // If OUTGOING_PENDING or INCOMING_PENDING
}
