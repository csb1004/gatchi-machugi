import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  ClientToServerEvents,
  HostPairPayload,
  JoinRoomPayload,
  PublicRoomSummary,
  ServerToClientEvents
} from "@gatchi/shared";
import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { RoomService } from "../domain/roomService.js";
import { createApp } from "../app.js";
import { createSocketServer } from "./createSocketServer.js";

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  return (server.address() as AddressInfo).port;
}

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

function waitForEvent<EventName extends keyof ServerToClientEvents>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  event: EventName
): Promise<Parameters<ServerToClientEvents[EventName]>[0]> {
  return new Promise((resolve) => {
    socket.once(
      event,
      ((...args: unknown[]) => resolve(args[0] as Parameters<ServerToClientEvents[EventName]>[0])) as never
    );
  });
}

function emitJoin(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: JoinRoomPayload
): Promise<
  | { ok: true; data: { participantId: string; participantCode: string; state: { roomCode: string; participants: { nickname: string }[] } } }
  | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    socket.emit("room:join", payload, resolve);
  });
}

function emitHostPair(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: HostPairPayload
): Promise<{ ok: true; data: { roomCode: string; state: { roomCode: string; hostExtensionConnected: boolean } } } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit(
      "host:pair",
      payload,
      ((response: unknown) => {
        resolve(
          response as
            | { ok: true; data: { roomCode: string; state: { roomCode: string; hostExtensionConnected: boolean } } }
            | { ok: false; error: string }
        );
      }) as never
    );
  });
}

async function connectClient(baseUrl: string): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  const socket = createClient(baseUrl, {
    transports: ["websocket"],
    forceNew: true
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });

  return socket;
}

describe("socket server", () => {
  const sockets: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];
  const servers: HttpServer[] = [];

  afterEach(async () => {
    for (const socket of sockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }

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

    sockets.length = 0;
    servers.length = 0;
  });

  it("serves room endpoints and lets a participant join over sockets", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    const healthResponse = await fetch(`${baseUrl}/health`);
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.text()).toBe("ok");

    const created = await createRoom(baseUrl, { roomName: "Friday quiz", public: true, nickname: "Host" });
    expect(created.status).toBe(201);
    expect(created.data.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.data.hostCode).toMatch(/^#[A-Z0-9]{4}$/);
    expect(created.data.hostParticipantId).toEqual(expect.any(String));

    const roomsResponse = await fetch(`${baseUrl}/api/rooms/public`);
    const rooms = (await roomsResponse.json()) as PublicRoomSummary[];

    expect(rooms).toEqual([
      expect.objectContaining({
        roomCode: created.data.roomCode,
        title: "Friday quiz",
        visibility: "public",
        participantCount: 1
      })
    ]);

    const participantSocket = await connectClient(baseUrl);
    sockets.push(participantSocket);

    const broadcastPromise = waitForEvent(participantSocket, "room:state");
    const joinAck = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });

    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) {
      throw new Error(joinAck.error);
    }

    expect(joinAck.data.state.roomCode).toBe(created.data.roomCode);
    expect(joinAck.data.participantCode).toMatch(/^#[A-Z0-9]{4}$/);
    expect(joinAck.data.state.participants).toEqual([
      expect.objectContaining({
        id: created.data.hostParticipantId,
        nickname: "Host",
        role: "host",
        connected: true
      }),
      expect.objectContaining({
        id: joinAck.data.participantId,
        nickname: "Mina",
        role: "player",
        connected: true
      })
    ]);

    const broadcastState = await broadcastPromise;
    expect(broadcastState.participants).toHaveLength(2);
    expect(broadcastState.participants[1]).toEqual(
      expect.objectContaining({
        id: joinAck.data.participantId,
        nickname: "Mina",
        connected: true
      })
    );
  });

  it("pairs hosts with a valid participant code, rejects invalid codes, and expires the room on extension disconnect", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    const created = await createRoom(baseUrl, { roomName: "Private room", public: false });
    const participantSocket = await connectClient(baseUrl);
    sockets.push(participantSocket);

    const joinAck = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });
    expect(joinAck.ok).toBe(true);

    const invalidHostSocket = await connectClient(baseUrl);
    sockets.push(invalidHostSocket);

    const invalidAck = await emitHostPair(invalidHostSocket, {
      roomCode: created.data.roomCode,
      hostCode: "#NOPE"
    });
    expect(invalidAck).toEqual({
      ok: false,
      error: "Invalid host code"
    });

    const hostSocket = await connectClient(baseUrl);
    sockets.push(hostSocket);

    const connectedEvent = waitForEvent(participantSocket, "host:connected");
    const connectedState = waitForEvent(participantSocket, "room:state");

    const hostAck = await emitHostPair(hostSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(hostAck.ok).toBe(true);
    if (!hostAck.ok) {
      throw new Error(hostAck.error);
    }

    expect(hostAck.data.roomCode).toBe(created.data.roomCode);
    expect(hostAck.data.state.hostExtensionConnected).toBe(true);

    await connectedEvent;
    expect((await connectedState).hostExtensionConnected).toBe(true);

    const disconnectedEvent = waitForEvent(participantSocket, "host:disconnected");
    const disconnectedState = waitForEvent(participantSocket, "room:state");

    hostSocket.disconnect();

    await disconnectedEvent;
    const expiredState = await disconnectedState;
    expect(expiredState.hostExtensionConnected).toBe(false);
    expect(expiredState.phase).toBe("expired");
    expect(roomService.listPublicRooms()).toEqual([]);
  });
});
