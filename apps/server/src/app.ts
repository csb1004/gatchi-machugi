import { existsSync } from "node:fs";
import { join } from "node:path";
import cors from "cors";
import express from "express";
import { z } from "zod";
import type { RoomState, RoomVisibility } from "@gatchi/shared";
import type { RoomService } from "./domain/roomService.js";

const createRoomSchema = z
  .object({
    roomName: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(100).optional(),
    public: z.boolean().optional(),
    visibility: z.enum(["public", "private"]).optional(),
    nickname: z.string().trim().min(1).max(40)
  })
  .strict();

function resolveVisibility(input: { public: boolean | undefined; visibility: RoomVisibility | undefined }): RoomVisibility {
  if (input.visibility) return input.visibility;
  return input.public ? "public" : "private";
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function adminTokenFromRequest(request: express.Request) {
  const authorization = request.header("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.header("x-admin-token")?.trim();
}

export function createApp({
  roomService,
  staticDir,
  adminToken,
  broadcastRoomState
}: {
  roomService: RoomService;
  repository?: unknown;
  staticDir?: string;
  adminToken?: string | undefined;
  broadcastRoomState?: (roomCode: string, state: RoomState) => void;
}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.type("text/plain").send("ok");
  });

  app.get("/api/rooms/public", (_request, response) => {
    response.json(roomService.listPublicRooms());
  });

  function requireAdmin(request: express.Request, response: express.Response) {
    const expectedToken = adminToken?.trim();
    if (!expectedToken) {
      response.status(503).json({ error: "Admin token is not configured" });
      return false;
    }

    if (adminTokenFromRequest(request) === expectedToken) return true;

    response.status(401).json({ error: "Admin authorization required" });
    return false;
  }

  app.get("/api/admin/rooms", (request, response) => {
    if (!requireAdmin(request, response)) return;
    response.json(roomService.listAdminRooms());
  });

  app.post("/api/admin/rooms/:roomCode/close", (request, response) => {
    if (!requireAdmin(request, response)) return;

    const roomCode = normalizeRoomCode(request.params.roomCode ?? "");
    if (!roomCode) {
      response.status(400).json({ error: "Invalid room code" });
      return;
    }

    try {
      const state = roomService.expireRoom(roomCode);
      state.hostExtensionConnected = false;
      broadcastRoomState?.(roomCode, state);
      response.json({ ok: true, roomCode });
    } catch {
      response.status(404).json({ error: "Room not found" });
    }
  });

  app.post("/api/rooms", async (request, response) => {
    const parsed = createRoomSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid room payload" });
      return;
    }

    const created = await roomService.createRoom({
      title: parsed.data.roomName ?? parsed.data.title ?? "Untitled room",
      hostNickname: parsed.data.nickname,
      visibility: resolveVisibility({
        public: parsed.data.public,
        visibility: parsed.data.visibility
      })
    });

    response.status(201).json({
      roomCode: created.roomCode,
      hostParticipantId: created.hostParticipantId,
      hostCode: created.hostCode
    });
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api/") || request.path === "/health" || request.path.startsWith("/socket.io/")) {
        next();
        return;
      }

      response.sendFile(join(staticDir, "index.html"));
    });
  }

  return app;
}
