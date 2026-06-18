import cors from "cors";
import express from "express";
import { z } from "zod";
import type { RoomVisibility } from "@gatchi/shared";
import type { RoomService } from "./domain/roomService.js";

const createRoomSchema = z
  .object({
    roomName: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(100).optional(),
    public: z.boolean().optional(),
    visibility: z.enum(["public", "private"]).optional(),
    nickname: z.string().trim().min(1).max(40).optional()
  })
  .strict()
  .partial();

function resolveVisibility(input: { public: boolean | undefined; visibility: RoomVisibility | undefined }): RoomVisibility {
  if (input.visibility) return input.visibility;
  return input.public ? "public" : "private";
}

export function createApp({ roomService }: { roomService: RoomService }) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.type("text/plain").send("ok");
  });

  app.get("/api/rooms/public", (_request, response) => {
    response.json(roomService.listPublicRooms());
  });

  app.post("/api/rooms", async (request, response) => {
    const parsed = createRoomSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid room payload" });
      return;
    }

    const created = await roomService.createRoom({
      title: parsed.data.roomName ?? parsed.data.title ?? "Untitled room",
      visibility: resolveVisibility({
        public: parsed.data.public,
        visibility: parsed.data.visibility
      })
    });

    response.status(201).json({
      roomCode: created.roomCode,
      hostToken: created.hostToken
    });
  });

  return app;
}
