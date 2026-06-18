import type { PublicRoomSummary } from "@gatchi/shared";

export async function fetchPublicRooms(): Promise<PublicRoomSummary[]> {
  const response = await fetch("/api/rooms/public");
  if (!response.ok) throw new Error("Failed to load public rooms");
  return (await response.json()) as PublicRoomSummary[];
}
