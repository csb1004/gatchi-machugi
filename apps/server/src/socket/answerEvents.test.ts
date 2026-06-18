import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  AddAliasPayload,
  ClientToServerEvents,
  ExtensionStatePayload,
  HostPairPayload,
  JoinRoomPayload,
  RevealAnswerPayload,
  ServerToClientEvents,
  SubmitAnswerPayload
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
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    data: (await response.json()) as { roomCode: string; hostToken: string }
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
): Promise<{ ok: true; data: { participantId: string; state: { roomCode: string } } } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("room:join", payload, resolve);
  });
}

function emitHostPair(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: HostPairPayload
): Promise<
  | { ok: true; data: { roomCode: string; state: { roomCode: string; participants: { id: string; role: string }[]; quiz: ExtensionStatePayload["quiz"] } } }
  | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    socket.emit("host:pair", payload, ((response: unknown) => resolve(response as never)) as never);
  });
}

function emitExtensionState(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: ExtensionStatePayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("extension:state", payload, resolve);
  });
}

function emitSubmitAnswer(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: SubmitAnswerPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("answer:submit", payload, resolve);
  });
}

function emitRevealAnswers(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: RevealAnswerPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("answer:reveal", payload, resolve);
  });
}

function emitAddAlias(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: AddAliasPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("answer:add-alias", payload, resolve);
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

describe("answer socket events", () => {
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

  it("prevents a normal participant from submitting an answer for someone else", async () => {
    const roomService = new RoomService({ hostTokenPepper: "pepper" });
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false });

    const firstSocket = await connectClient(baseUrl);
    const secondSocket = await connectClient(baseUrl);
    sockets.push(firstSocket, secondSocket);

    const firstJoin = await emitJoin(firstSocket, { roomCode: created.data.roomCode, nickname: "Mina" });
    const secondJoin = await emitJoin(secondSocket, { roomCode: created.data.roomCode, nickname: "Ari" });

    expect(firstJoin.ok).toBe(true);
    expect(secondJoin.ok).toBe(true);
    if (!firstJoin.ok || !secondJoin.ok) {
      throw new Error("Join failed");
    }

    const submitAck = await emitSubmitAnswer(firstSocket, {
      roomCode: created.data.roomCode,
      participantId: secondJoin.data.participantId,
      rawAnswer: "spoofed"
    });

    expect(submitAck).toEqual({
      ok: false,
      error: "Cannot submit for another participant"
    });
  });

  it("does not let a fresh socket claim another visible participant id on join", async () => {
    const roomService = new RoomService({ hostTokenPepper: "pepper" });
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false });

    const firstSocket = await connectClient(baseUrl);
    const secondSocket = await connectClient(baseUrl);
    sockets.push(firstSocket, secondSocket);

    const firstJoin = await emitJoin(firstSocket, { roomCode: created.data.roomCode, nickname: "Mina" });
    expect(firstJoin.ok).toBe(true);
    if (!firstJoin.ok) {
      throw new Error(firstJoin.error);
    }

    const secondJoin = await emitJoin(secondSocket, {
      roomCode: created.data.roomCode,
      nickname: "Ari",
      participantId: firstJoin.data.participantId
    });
    expect(secondJoin.ok).toBe(true);
    if (!secondJoin.ok) {
      throw new Error(secondJoin.error);
    }
    expect(secondJoin.data.participantId).not.toBe(firstJoin.data.participantId);

    const submitAck = await emitSubmitAnswer(secondSocket, {
      roomCode: created.data.roomCode,
      participantId: firstJoin.data.participantId,
      rawAnswer: "hijacked"
    });

    expect(submitAck).toEqual({
      ok: false,
      error: "Cannot submit for another participant"
    });
  });

  it("rejects reveal, alias, and extension state changes from non-host sockets", async () => {
    const roomService = new RoomService({ hostTokenPepper: "pepper" });
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false });

    const participantSocket = await connectClient(baseUrl);
    sockets.push(participantSocket);

    const joinAck = await emitJoin(participantSocket, { roomCode: created.data.roomCode, nickname: "Mina" });
    expect(joinAck.ok).toBe(true);

    const stateAck = await emitExtensionState(participantSocket, {
      roomCode: created.data.roomCode,
      quiz: {
        ...roomService.getState(created.data.roomCode).quiz,
        questionIndex: 1,
        questionText: "Question",
        answerCandidates: ["answer"]
      }
    });
    const revealAck = await emitRevealAnswers(participantSocket, {
      roomCode: created.data.roomCode,
      skippedParticipantIds: []
    });
    const aliasAck = await emitAddAlias(participantSocket, {
      roomCode: created.data.roomCode,
      alias: "accepted alias"
    });

    expect(stateAck).toEqual({ ok: false, error: "Host authorization required" });
    expect(revealAck).toEqual({ ok: false, error: "Host authorization required" });
    expect(aliasAck).toEqual({ ok: false, error: "Host authorization required" });
  });

  it("broadcasts room state without raw answers before reveal", async () => {
    const roomService = new RoomService({ hostTokenPepper: "pepper" });
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false });

    const participantSocket = await connectClient(baseUrl);
    sockets.push(participantSocket);

    const joinAck = await emitJoin(participantSocket, { roomCode: created.data.roomCode, nickname: "Mina" });
    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) {
      throw new Error(joinAck.error);
    }

    const statePromise = waitForEvent(participantSocket, "room:state");
    const submitAck = await emitSubmitAnswer(participantSocket, {
      roomCode: created.data.roomCode,
      participantId: joinAck.data.participantId,
      rawAnswer: "Blue Archive"
    });

    expect(submitAck).toEqual({ ok: true, data: undefined });

    const state = await statePromise;
    expect(JSON.stringify(state)).not.toContain("rawAnswer");
    expect(state.submissions).toEqual([
      {
        participantId: joinAck.data.participantId,
        submitted: true,
        skipped: false
      }
    ]);
    expect(state.revealedSubmissions).toEqual([]);
  });

  it("lets the host reveal after every required participant, including the host player, has submitted", async () => {
    const roomService = new RoomService({ hostTokenPepper: "pepper" });
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    sockets.push(hostSocket, participantSocket);

    const hostAck = await emitHostPair(hostSocket, {
      roomCode: created.data.roomCode,
      hostToken: created.data.hostToken
    });
    expect(hostAck.ok).toBe(true);
    if (!hostAck.ok) {
      throw new Error(hostAck.error);
    }

    const hostParticipantId = hostAck.data.state.participants.find((participant) => participant.role === "host")?.id;
    if (!hostParticipantId) {
      throw new Error("Host participant missing");
    }

    const joinAck = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });
    expect(joinAck.ok).toBe(true);
    if (!joinAck.ok) {
      throw new Error(joinAck.error);
    }

    const updateStateAck = await emitExtensionState(hostSocket, {
      roomCode: created.data.roomCode,
      quiz: {
        ...hostAck.data.state.quiz,
        questionIndex: 1,
        questionText: "Name the game",
        answerCandidates: ["blue archive"]
      }
    });
    expect(updateStateAck).toEqual({ ok: true, data: undefined });

    const hostSubmitAck = await emitSubmitAnswer(hostSocket, {
      roomCode: created.data.roomCode,
      participantId: hostParticipantId,
      rawAnswer: "BlueArchive"
    });
    const participantSubmitAck = await emitSubmitAnswer(participantSocket, {
      roomCode: created.data.roomCode,
      participantId: joinAck.data.participantId,
      rawAnswer: "blue archive"
    });

    expect(hostSubmitAck).toEqual({ ok: true, data: undefined });
    expect(participantSubmitAck).toEqual({ ok: true, data: undefined });

    const revealedPromise = waitForEvent(participantSocket, "answer:revealed");
    const statePromise = waitForEvent(participantSocket, "room:state");
    const revealAck = await emitRevealAnswers(hostSocket, {
      roomCode: created.data.roomCode,
      skippedParticipantIds: []
    });

    expect(revealAck).toEqual({ ok: true, data: undefined });

    const revealed = await revealedPromise;
    const revealedState = await statePromise;

    expect(revealed).toEqual([
      expect.objectContaining({ participantId: hostParticipantId, rawAnswer: "BlueArchive", correct: true }),
      expect.objectContaining({ participantId: joinAck.data.participantId, rawAnswer: "blue archive", correct: true })
    ]);
    expect(revealedState.revealedSubmissions).toEqual(revealed);
  });
});
