import { createServer, request, type Server as HttpServer } from "node:http";
import type {
  ChatMessagePayload,
  ClientToServerEvents,
  JoinRoomPayload,
  OriginalResultPayload,
  SendChatPayload,
  ServerToClientEvents
} from "@gatchi/shared";
import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { createApp } from "../app.js";
import { RoomService } from "../domain/roomService.js";
import { createSocketServer } from "./createSocketServer.js";
import { listenOnTestPort } from "./testListen.js";

async function createRoom(baseUrl: string) {
  return await new Promise<{ roomCode: string; hostParticipantId: string; hostCode: string }>((resolve, reject) => {
    const body = JSON.stringify({ roomName: "Room", public: false, nickname: "Host" });
    const url = new URL("/api/rooms", baseUrl);
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as { roomCode: string; hostParticipantId: string; hostCode: string });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.end(body);
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

function emitJoin(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: JoinRoomPayload
): Promise<{ ok: true; data: { participantId: string } } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("room:join", payload, ((response: unknown) => resolve(response as never)) as never);
  });
}

function emitChat(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: SendChatPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("chat:send", payload, resolve);
  });
}

function emitOriginalResult(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: OriginalResultPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("original:result", payload, ((response: unknown) => resolve(response as never)) as never);
  });
}

function waitForChat(socket: Socket<ServerToClientEvents, ClientToServerEvents>): Promise<ChatMessagePayload> {
  return new Promise((resolve) => {
    socket.once("chat:message", resolve);
  });
}

describe("operation socket events", () => {
  const sockets: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];
  const servers: HttpServer[] = [];

  afterEach(async () => {
    for (const socket of sockets) {
      if (socket.connected) socket.disconnect();
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

  it("broadcasts chat from the joined participant session", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const room = await createRoom(baseUrl);
    const socket = await connectClient(baseUrl);
    sockets.push(socket);

    const joined = await emitJoin(socket, { roomCode: room.roomCode, nickname: "Mina" });
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error(joined.error);

    const chatPromise = waitForChat(socket);
    const ack = await emitChat(socket, {
      roomCode: room.roomCode,
      participantId: joined.data.participantId,
      text: "hello"
    });

    expect(ack).toEqual({ ok: true, data: undefined });
    await expect(chatPromise).resolves.toEqual(expect.objectContaining({ nickname: "Mina", text: "hello" }));
    expect(roomService.getState(room.roomCode).chatMessageCount).toBe(1);
  });

  it("rejects host-only operations from participant sockets", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const room = await createRoom(baseUrl);
    const socket = await connectClient(baseUrl);
    sockets.push(socket);

    const joined = await emitJoin(socket, { roomCode: room.roomCode, nickname: "Mina" });
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error(joined.error);

    const ack = await new Promise<{ ok: true; data: void } | { ok: false; error: string }>((resolve) => {
      socket.emit(
        "score:adjust",
        { roomCode: room.roomCode, participantId: joined.data.participantId, delta: 1, reason: "manual" },
        resolve
      );
    });

    expect(ack).toEqual({ ok: false, error: "Host authorization required" });
  });

  it("rejects original result from a host web socket", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const room = await createRoom(baseUrl);
    const hostWebSocket = await connectClient(baseUrl);
    sockets.push(hostWebSocket);

    const joined = await emitJoin(hostWebSocket, {
      roomCode: room.roomCode,
      nickname: "Host",
      participantId: room.hostParticipantId,
      participantCode: room.hostCode
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error(joined.error);

    const response = await emitOriginalResult(hostWebSocket, {
      roomCode: room.roomCode,
      questionKey: "not-authorized",
      quiz: {
        quizTitle: "Quiz",
        questionIndex: 1,
        totalQuestions: 10,
        questionType: "free-text",
        questionText: "Name the game",
        imageUrl: null,
        audioUrl: null,
        videoUrl: null,
        choices: [],
        timerSecondsRemaining: null,
        canGoNext: true,
        canGoPrevious: false,
        resultMessage: "correct",
        answerCandidates: ["blue archive"]
      }
    });

    expect(response).toEqual({ ok: false, error: "Host extension authorization required" });
  });
});
