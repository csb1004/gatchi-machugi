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
