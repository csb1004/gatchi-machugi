import type { PublicRoomSummary } from "@gatchi/shared";

export interface CreateRoomInput {
  roomName: string;
  public: boolean;
  nickname: string;
}

export interface CreatedRoom {
  roomCode: string;
  hostParticipantId: string;
  hostCode: string;
}

export interface AdminRoomSummary {
  roomCode: string;
  title: string;
  quizTitle: string | null;
  participantCount: number;
  phase: string;
  visibility: string;
  hostExtensionConnected: boolean;
  sourceWindowStatus: string;
}

function adminRequestInit(token: string, init: RequestInit = {}): RequestInit {
  const trimmedToken = token.trim();
  if (!trimmedToken) return init;
  return {
    ...init,
    headers: {
      ...init.headers,
      "x-admin-token": trimmedToken
    }
  };
}

export async function fetchPublicRooms(): Promise<PublicRoomSummary[]> {
  const response = await fetch("/api/rooms/public");
  if (!response.ok) throw new Error("Failed to load public rooms");
  return (await response.json()) as PublicRoomSummary[];
}

export async function createRoom(input: CreateRoomInput): Promise<CreatedRoom> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) throw new Error("Failed to create room");
  return (await response.json()) as CreatedRoom;
}

export async function fetchAdminRooms(token: string): Promise<AdminRoomSummary[]> {
  const response = await fetch("/api/admin/rooms", adminRequestInit(token));

  if (!response.ok) throw new Error("Failed to load admin rooms");
  return (await response.json()) as AdminRoomSummary[];
}

export async function closeAdminRoom(roomCode: string, token: string): Promise<void> {
  const response = await fetch(`/api/admin/rooms/${roomCode}/close`, adminRequestInit(token, { method: "POST" }));

  if (!response.ok) throw new Error("Failed to close room");
}
