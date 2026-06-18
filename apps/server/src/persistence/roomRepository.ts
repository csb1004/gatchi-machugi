import type { RoomVisibility } from "@gatchi/shared";
import type { PrismaClient } from "@prisma/client";

export interface PersistRoomInput {
  roomCode: string;
  title: string;
  visibility: RoomVisibility;
  phase: string;
  hostTokenHash: string;
  expiresAt: Date;
}

export class RoomRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createRoom(input: PersistRoomInput) {
    return this.prisma.room.create({
      data: {
        roomCode: input.roomCode,
        title: input.title,
        visibility: input.visibility,
        phase: input.phase,
        hostTokenHash: input.hostTokenHash,
        expiresAt: input.expiresAt
      }
    });
  }

  async listPublicRooms() {
    return this.prisma.room.findMany({
      where: {
        visibility: "public",
        phase: { notIn: ["ended", "expired"] },
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }
}
