export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

export interface GameInvitation {
  inviteId: string;
  gameId: string;
  hostId: string;
  hostUsername: string;
  recipientId: string;
  recipientUsername?: string;
  status: InvitationStatus;
  createdAt: number;
  expiresAt: number;
}

export interface RoomSlotPlayer {
  userId: string;
  username: string;
  slot: number;
  color: "RED" | "GREEN" | "YELLOW" | "BLUE";
  isHost: boolean;
}

export interface WaitingRoomState {
  gameId: string;
  hostId: string;
  status: "WAITING" | "IN_PROGRESS" | "ABANDONED";
  players: [
    RoomSlotPlayer | null,
    RoomSlotPlayer | null,
    RoomSlotPlayer | null,
    RoomSlotPlayer | null
  ];
  invitedFriends: {
    userId: string;
    username: string;
    inviteId: string;
    status: InvitationStatus;
  }[];
  createdAt: number;
  expiresAt: number;
}
