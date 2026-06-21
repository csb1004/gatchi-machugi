import { createServer, type Server as HttpServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { RoomService } from "./domain/roomService.js";
import { listenOnTestPort } from "./socket/testListen.js";

async function createRoom(baseUrl: string, body: { roomName: string; public: boolean; nickname?: string }) {
  const response = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, nickname: body.nickname ?? "Host" })
  });

  return {
    status: response.status,
    data: (await response.json()) as { roomCode: string; hostParticipantId: string; hostCode: string }
  };
}

describe("app admin routes", () => {
  const servers: HttpServer[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          })
      )
    );
    servers.length = 0;
  });

  it("lists open rooms and force closes a room", async () => {
    const roomService = new RoomService();
    const broadcastRoomState = vi.fn();
    const adminHeaders = { "x-admin-token": "secret" };
    const app = createApp({ roomService, broadcastRoomState, adminToken: "secret" });
    const server = createServer(app);
    servers.push(server);
    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Admin room", public: true });

    const roomsResponse = await fetch(`${baseUrl}/api/admin/rooms`, { headers: adminHeaders });
    expect(roomsResponse.status).toBe(200);
    await expect(roomsResponse.json()).resolves.toEqual([
      expect.objectContaining({
        roomCode: created.data.roomCode,
        title: "Admin room",
        phase: "lobby",
        participantCount: 1
      })
    ]);

    const closeResponse = await fetch(`${baseUrl}/api/admin/rooms/${created.data.roomCode}/close`, {
      method: "POST",
      headers: adminHeaders
    });
    expect(closeResponse.status).toBe(200);
    await expect(closeResponse.json()).resolves.toEqual({
      ok: true,
      roomCode: created.data.roomCode
    });
    expect(roomService.getState(created.data.roomCode).phase).toBe("expired");
    expect(broadcastRoomState).toHaveBeenCalledWith(created.data.roomCode, expect.objectContaining({ phase: "expired" }));

    const afterCloseResponse = await fetch(`${baseUrl}/api/admin/rooms`, { headers: adminHeaders });
    await expect(afterCloseResponse.json()).resolves.toEqual([]);
  });

  it("refuses admin routes until the server token is configured", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    servers.push(server);
    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    await expect(fetch(`${baseUrl}/api/admin/rooms`)).resolves.toMatchObject({ status: 503 });
  });

  it("requires the configured admin token", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService, adminToken: "secret" });
    const server = createServer(app);
    servers.push(server);
    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    await expect(fetch(`${baseUrl}/api/admin/rooms`)).resolves.toMatchObject({ status: 401 });
    await expect(fetch(`${baseUrl}/api/admin/rooms`, { headers: { "x-admin-token": "secret" } })).resolves.toMatchObject({
      status: 200
    });
  });
});
