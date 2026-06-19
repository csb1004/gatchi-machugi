import { createServer, type Server as HttpServer } from "node:http";
import type {
  AddAliasPayload,
  ClientToServerEvents,
  ExtensionSourcePayload,
  ExtensionStatePayload,
  HostPairPayload,
  JoinRoomPayload,
  OriginalFailurePayload,
  OriginalResultPayload,
  OriginalSubmitRequestPayload,
  QuizCommandPayload,
  RevealAnswerPayload,
  ServerToClientEvents,
  SubmitAnswerPayload
} from "@gatchi/shared";
import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { RoomService } from "../domain/roomService.js";
import { createApp } from "../app.js";
import { createSocketServer } from "./createSocketServer.js";
import { listenOnTestPort } from "./testListen.js";

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

function eventReceivedWithin<EventName extends keyof ServerToClientEvents>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  event: EventName,
  timeoutMs = 100
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent as never);
      resolve(false);
    }, timeoutMs);
    const onEvent = () => {
      clearTimeout(timer);
      resolve(true);
    };
    socket.once(event, onEvent as never);
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

function emitExtensionSource(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: ExtensionSourcePayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("extension:source", payload, resolve);
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

function emitQuizCommand(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: QuizCommandPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("quiz:command", payload, resolve);
  });
}

function emitConnectedSource(socket: Socket<ServerToClientEvents, ClientToServerEvents>, roomCode: string) {
  return emitExtensionSource(socket, {
    roomCode,
    sourceWindow: {
      status: "connected",
      url: "https://machugi.io/quiz/current",
      title: "Current source",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      message: null
    }
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

function emitOriginalRequestSubmit(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: OriginalSubmitRequestPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("original:request-submit", payload, resolve);
  });
}

function emitOriginalResult(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: OriginalResultPayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("original:result", payload, resolve);
  });
}

function emitOriginalFailure(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  payload: OriginalFailurePayload
): Promise<{ ok: true; data: void } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    socket.emit("original:failure", payload, resolve);
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
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
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
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
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
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
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
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
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
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    sockets.push(hostSocket, participantSocket);

    const hostAck = await emitHostPair(hostSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
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

  it("does not let a host socket submit for another participant", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    sockets.push(hostSocket, participantSocket);

    const hostAck = await emitHostPair(hostSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });
    const joinAck = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });

    expect(hostAck.ok).toBe(true);
    expect(joinAck.ok).toBe(true);
    if (!hostAck.ok || !joinAck.ok) {
      throw new Error("Setup failed");
    }

    const submitAck = await emitSubmitAnswer(hostSocket, {
      roomCode: created.data.roomCode,
      participantId: joinAck.data.participantId,
      rawAnswer: "host overwrite"
    });

    expect(submitAck).toEqual({
      ok: false,
      error: "Cannot submit for another participant"
    });
  });

  it("emits original submit only to the paired extension after all required submissions", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostWebSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    const extensionSocket = await connectClient(baseUrl);
    sockets.push(hostWebSocket, participantSocket, extensionSocket);

    const hostWebJoin = await emitJoin(hostWebSocket, {
      roomCode: created.data.roomCode,
      nickname: "Host",
      participantId: created.data.hostParticipantId,
      participantCode: created.data.hostCode
    });
    const participantJoin = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });
    const extensionPair = await emitHostPair(extensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(hostWebJoin.ok).toBe(true);
    expect(participantJoin.ok).toBe(true);
    expect(extensionPair.ok).toBe(true);
    if (!hostWebJoin.ok || !participantJoin.ok || !extensionPair.ok) throw new Error("setup failed");

    let leakedToHostWeb = false;
    hostWebSocket.once("original:submit-allowed", () => {
      leakedToHostWeb = true;
    });
    const originalSubmitPromise = waitForEvent(extensionSocket, "original:submit-allowed");

    const stateAck = await emitExtensionState(extensionSocket, {
      roomCode: created.data.roomCode,
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
        canGoNext: false,
        canGoPrevious: false,
        resultMessage: null,
        answerCandidates: []
      }
    });
    expect(stateAck).toEqual({ ok: true, data: undefined });
    await expect(emitConnectedSource(extensionSocket, created.data.roomCode)).resolves.toEqual({ ok: true, data: undefined });

    const hostSubmitAck = await emitSubmitAnswer(hostWebSocket, {
      roomCode: created.data.roomCode,
      participantId: created.data.hostParticipantId,
      rawAnswer: "blue archive"
    });
    const playerSubmitAck = await emitSubmitAnswer(participantSocket, {
      roomCode: created.data.roomCode,
      participantId: participantJoin.data.participantId,
      rawAnswer: "wrong"
    });
    expect(hostSubmitAck).toEqual({ ok: true, data: undefined });
    expect(playerSubmitAck).toEqual({ ok: true, data: undefined });

    await expect(originalSubmitPromise).resolves.toMatchObject({
      roomCode: created.data.roomCode,
      hostRawAnswer: "blue archive"
    });
    expect(leakedToHostWeb).toBe(false);
  });

  it("returns original submission state to ready when the current extension reports failure", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostWebSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    const extensionSocket = await connectClient(baseUrl);
    sockets.push(hostWebSocket, participantSocket, extensionSocket);

    const hostWebJoin = await emitJoin(hostWebSocket, {
      roomCode: created.data.roomCode,
      nickname: "Host",
      participantId: created.data.hostParticipantId,
      participantCode: created.data.hostCode
    });
    const participantJoin = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });
    const extensionPair = await emitHostPair(extensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(hostWebJoin.ok).toBe(true);
    expect(participantJoin.ok).toBe(true);
    expect(extensionPair.ok).toBe(true);
    if (!hostWebJoin.ok || !participantJoin.ok || !extensionPair.ok) throw new Error("setup failed");

    const stateAck = await emitExtensionState(extensionSocket, {
      roomCode: created.data.roomCode,
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
        canGoNext: false,
        canGoPrevious: false,
        resultMessage: null,
        answerCandidates: []
      }
    });
    expect(stateAck).toEqual({ ok: true, data: undefined });
    await expect(emitConnectedSource(extensionSocket, created.data.roomCode)).resolves.toEqual({ ok: true, data: undefined });

    const originalSubmitPromise = waitForEvent(extensionSocket, "original:submit-allowed");
    const hostSubmitAck = await emitSubmitAnswer(hostWebSocket, {
      roomCode: created.data.roomCode,
      participantId: created.data.hostParticipantId,
      rawAnswer: "blue archive"
    });
    const playerSubmitAck = await emitSubmitAnswer(participantSocket, {
      roomCode: created.data.roomCode,
      participantId: participantJoin.data.participantId,
      rawAnswer: "wrong"
    });
    expect(hostSubmitAck).toEqual({ ok: true, data: undefined });
    expect(playerSubmitAck).toEqual({ ok: true, data: undefined });

    const originalSubmit = await originalSubmitPromise;
    const recoveredStatePromise = waitForEvent(participantSocket, "room:state");
    const failureAck = await emitOriginalFailure(extensionSocket, {
      roomCode: created.data.roomCode,
      questionKey: originalSubmit.questionKey,
      reason: "원본 사이트에 답을 자동 제출하지 못했습니다."
    });

    expect(failureAck).toEqual({ ok: true, data: undefined });
    await expect(recoveredStatePromise).resolves.toMatchObject({
      fairPlay: {
        originalSubmitStatus: "ready",
        lockReason: "원본 사이트에 답을 자동 제출하지 못했습니다."
      }
    });
  });

  it("waits for the source window before auto-submitting the host answer", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostWebSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    const extensionSocket = await connectClient(baseUrl);
    sockets.push(hostWebSocket, participantSocket, extensionSocket);

    const hostWebJoin = await emitJoin(hostWebSocket, {
      roomCode: created.data.roomCode,
      nickname: "Host",
      participantId: created.data.hostParticipantId,
      participantCode: created.data.hostCode
    });
    const participantJoin = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });
    const extensionPair = await emitHostPair(extensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(hostWebJoin.ok).toBe(true);
    expect(participantJoin.ok).toBe(true);
    expect(extensionPair.ok).toBe(true);
    if (!hostWebJoin.ok || !participantJoin.ok || !extensionPair.ok) throw new Error("setup failed");

    const stateAck = await emitExtensionState(extensionSocket, {
      roomCode: created.data.roomCode,
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
        canGoNext: false,
        canGoPrevious: false,
        resultMessage: null,
        answerCandidates: []
      }
    });
    expect(stateAck).toEqual({ ok: true, data: undefined });
    await expect(
      emitExtensionSource(extensionSocket, {
        roomCode: created.data.roomCode,
        sourceWindow: {
          status: "disconnected",
          url: null,
          title: null,
          lastSeenAt: "2026-06-19T00:00:00.000Z",
          message: "source closed"
        }
      })
    ).resolves.toEqual({ ok: true, data: undefined });

    const leakedWhileDisconnected = eventReceivedWithin(extensionSocket, "original:submit-allowed");
    const hostSubmitAck = await emitSubmitAnswer(hostWebSocket, {
      roomCode: created.data.roomCode,
      participantId: created.data.hostParticipantId,
      rawAnswer: "blue archive"
    });
    const playerSubmitAck = await emitSubmitAnswer(participantSocket, {
      roomCode: created.data.roomCode,
      participantId: participantJoin.data.participantId,
      rawAnswer: "wrong"
    });

    expect(hostSubmitAck).toEqual({ ok: true, data: undefined });
    expect(playerSubmitAck).toEqual({ ok: true, data: undefined });
    await expect(leakedWhileDisconnected).resolves.toBe(false);
    expect(roomService.getState(created.data.roomCode).fairPlay.originalSubmitStatus).toBe("ready");

    const originalSubmitPromise = waitForEvent(extensionSocket, "original:submit-allowed");
    await expect(emitConnectedSource(extensionSocket, created.data.roomCode)).resolves.toEqual({ ok: true, data: undefined });
    await expect(originalSubmitPromise).resolves.toMatchObject({
      roomCode: created.data.roomCode,
      hostRawAnswer: "blue archive"
    });
  });

  it("rejects extension-only events from a superseded paired extension socket", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostWebSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    const firstExtensionSocket = await connectClient(baseUrl);
    const secondExtensionSocket = await connectClient(baseUrl);
    sockets.push(hostWebSocket, participantSocket, firstExtensionSocket, secondExtensionSocket);

    const hostWebJoin = await emitJoin(hostWebSocket, {
      roomCode: created.data.roomCode,
      nickname: "Host",
      participantId: created.data.hostParticipantId,
      participantCode: created.data.hostCode
    });
    const participantJoin = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });
    const firstPair = await emitHostPair(firstExtensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });
    const secondPair = await emitHostPair(secondExtensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(hostWebJoin.ok).toBe(true);
    expect(participantJoin.ok).toBe(true);
    expect(firstPair.ok).toBe(true);
    expect(secondPair.ok).toBe(true);
    if (!hostWebJoin.ok || !participantJoin.ok || !firstPair.ok || !secondPair.ok) throw new Error("setup failed");

    const staleStateAck = await emitExtensionState(firstExtensionSocket, {
      roomCode: created.data.roomCode,
      quiz: {
        quizTitle: "Stale Quiz",
        questionIndex: 99,
        totalQuestions: 100,
        questionType: "free-text",
        questionText: "Stale question",
        imageUrl: null,
        audioUrl: null,
        videoUrl: null,
        choices: [],
        timerSecondsRemaining: null,
        canGoNext: false,
        canGoPrevious: false,
        resultMessage: null,
        answerCandidates: []
      }
    });
    expect(staleStateAck).toEqual({ ok: false, error: "Current host extension authorization required" });

    const currentStateAck = await emitExtensionState(secondExtensionSocket, {
      roomCode: created.data.roomCode,
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
        canGoNext: false,
        canGoPrevious: false,
        resultMessage: null,
        answerCandidates: []
      }
    });
    expect(currentStateAck).toEqual({ ok: true, data: undefined });
    await expect(emitConnectedSource(secondExtensionSocket, created.data.roomCode)).resolves.toEqual({ ok: true, data: undefined });

    const originalSubmitPromise = waitForEvent(secondExtensionSocket, "original:submit-allowed");
    await emitSubmitAnswer(hostWebSocket, {
      roomCode: created.data.roomCode,
      participantId: created.data.hostParticipantId,
      rawAnswer: "blue archive"
    });
    await emitSubmitAnswer(participantSocket, {
      roomCode: created.data.roomCode,
      participantId: participantJoin.data.participantId,
      rawAnswer: "wrong"
    });

    const originalSubmit = await originalSubmitPromise;
    const staleRequestAck = await emitOriginalRequestSubmit(firstExtensionSocket, {
      roomCode: created.data.roomCode,
      questionKey: originalSubmit.questionKey
    });
    const staleResultAck = await emitOriginalResult(firstExtensionSocket, {
      roomCode: created.data.roomCode,
      questionKey: originalSubmit.questionKey,
      quiz: {
        ...roomService.getState(created.data.roomCode).quiz,
        resultMessage: "correct",
        answerCandidates: ["blue archive"],
        canGoNext: true
      }
    });

    expect(staleRequestAck).toEqual({ ok: false, error: "Current host extension authorization required" });
    expect(staleResultAck).toEqual({ ok: false, error: "Current host extension authorization required" });
    expect(roomService.getState(created.data.roomCode).quiz.questionIndex).toBe(1);
  });

  it("rejects source-window updates from a superseded paired extension socket", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const firstExtensionSocket = await connectClient(baseUrl);
    const secondExtensionSocket = await connectClient(baseUrl);
    sockets.push(firstExtensionSocket, secondExtensionSocket);

    const firstPair = await emitHostPair(firstExtensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });
    const secondPair = await emitHostPair(secondExtensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(firstPair.ok).toBe(true);
    expect(secondPair.ok).toBe(true);
    if (!firstPair.ok || !secondPair.ok) throw new Error("setup failed");

    const staleAck = await emitExtensionSource(firstExtensionSocket, {
      roomCode: created.data.roomCode,
      sourceWindow: {
        status: "connected",
        url: "https://machugi.io/stale",
        title: "Stale source",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        message: null
      }
    });
    const currentAck = await emitExtensionSource(secondExtensionSocket, {
      roomCode: created.data.roomCode,
      sourceWindow: {
        status: "connected",
        url: "https://machugi.io/current",
        title: "Current source",
        lastSeenAt: "2026-06-19T00:00:01.000Z",
        message: null
      }
    });

    expect(staleAck).toEqual({ ok: false, error: "Current host extension authorization required" });
    expect(currentAck).toEqual({ ok: true, data: undefined });
    expect(roomService.getState(created.data.roomCode).sourceWindow).toMatchObject({
      status: "connected",
      url: "https://machugi.io/current",
      title: "Current source"
    });
  });

  it("sends quiz commands only to the current paired extension socket", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostWebSocket = await connectClient(baseUrl);
    const firstExtensionSocket = await connectClient(baseUrl);
    const secondExtensionSocket = await connectClient(baseUrl);
    sockets.push(hostWebSocket, firstExtensionSocket, secondExtensionSocket);

    const hostWebJoin = await emitJoin(hostWebSocket, {
      roomCode: created.data.roomCode,
      nickname: "Host",
      participantId: created.data.hostParticipantId,
      participantCode: created.data.hostCode
    });
    const firstPair = await emitHostPair(firstExtensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });
    const secondPair = await emitHostPair(secondExtensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(hostWebJoin.ok).toBe(true);
    expect(firstPair.ok).toBe(true);
    expect(secondPair.ok).toBe(true);
    if (!hostWebJoin.ok || !firstPair.ok || !secondPair.ok) throw new Error("setup failed");

    const staleCommandReceived = eventReceivedWithin(firstExtensionSocket, "quiz:command");
    const currentCommandPromise = waitForEvent(secondExtensionSocket, "quiz:command");
    const commandAck = await emitQuizCommand(hostWebSocket, {
      roomCode: created.data.roomCode,
      command: "next"
    });

    expect(commandAck).toEqual({ ok: true, data: undefined });
    await expect(currentCommandPromise).resolves.toMatchObject({
      roomCode: created.data.roomCode,
      command: "next"
    });
    await expect(staleCommandReceived).resolves.toBe(false);
  });

  it("does not emit original submit to a paired extension socket after it rejoins as web", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostWebSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    const extensionThenWebSocket = await connectClient(baseUrl);
    sockets.push(hostWebSocket, participantSocket, extensionThenWebSocket);

    const hostWebJoin = await emitJoin(hostWebSocket, {
      roomCode: created.data.roomCode,
      nickname: "Host",
      participantId: created.data.hostParticipantId,
      participantCode: created.data.hostCode
    });
    const participantJoin = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });
    const extensionPair = await emitHostPair(extensionThenWebSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(hostWebJoin.ok).toBe(true);
    expect(participantJoin.ok).toBe(true);
    expect(extensionPair.ok).toBe(true);
    if (!hostWebJoin.ok || !participantJoin.ok || !extensionPair.ok) throw new Error("setup failed");

    const stateAck = await emitExtensionState(extensionThenWebSocket, {
      roomCode: created.data.roomCode,
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
        canGoNext: false,
        canGoPrevious: false,
        resultMessage: null,
        answerCandidates: []
      }
    });
    expect(stateAck).toEqual({ ok: true, data: undefined });

    const rejoinAck = await emitJoin(extensionThenWebSocket, {
      roomCode: created.data.roomCode,
      nickname: "Host",
      participantId: created.data.hostParticipantId,
      participantCode: created.data.hostCode
    });
    expect(rejoinAck.ok).toBe(true);
    if (!rejoinAck.ok) throw new Error(rejoinAck.error);

    const leakedToRejoinedWeb = eventReceivedWithin(extensionThenWebSocket, "original:submit-allowed");
    const hostSubmitAck = await emitSubmitAnswer(hostWebSocket, {
      roomCode: created.data.roomCode,
      participantId: created.data.hostParticipantId,
      rawAnswer: "blue archive"
    });
    const playerSubmitAck = await emitSubmitAnswer(participantSocket, {
      roomCode: created.data.roomCode,
      participantId: participantJoin.data.participantId,
      rawAnswer: "wrong"
    });

    expect(hostSubmitAck).toEqual({ ok: true, data: undefined });
    expect(playerSubmitAck).toEqual({ ok: true, data: undefined });
    await expect(leakedToRejoinedWeb).resolves.toBe(false);
  });

  it("keeps the newer paired extension mapped when an older extension disconnects", async () => {
    const roomService = new RoomService();
    const app = createApp({ roomService });
    const server = createServer(app);
    createSocketServer(server, { roomService });
    servers.push(server);

    const port = await listenOnTestPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const created = await createRoom(baseUrl, { roomName: "Room", public: false, nickname: "Host" });

    const hostWebSocket = await connectClient(baseUrl);
    const participantSocket = await connectClient(baseUrl);
    const firstExtensionSocket = await connectClient(baseUrl);
    const secondExtensionSocket = await connectClient(baseUrl);
    sockets.push(hostWebSocket, participantSocket, firstExtensionSocket, secondExtensionSocket);

    const hostWebJoin = await emitJoin(hostWebSocket, {
      roomCode: created.data.roomCode,
      nickname: "Host",
      participantId: created.data.hostParticipantId,
      participantCode: created.data.hostCode
    });
    const participantJoin = await emitJoin(participantSocket, {
      roomCode: created.data.roomCode,
      nickname: "Mina"
    });
    const firstPair = await emitHostPair(firstExtensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });
    const secondPair = await emitHostPair(secondExtensionSocket, {
      roomCode: created.data.roomCode,
      hostCode: created.data.hostCode
    });

    expect(hostWebJoin.ok).toBe(true);
    expect(participantJoin.ok).toBe(true);
    expect(firstPair.ok).toBe(true);
    expect(secondPair.ok).toBe(true);
    if (!hostWebJoin.ok || !participantJoin.ok || !firstPair.ok || !secondPair.ok) throw new Error("setup failed");

    firstExtensionSocket.disconnect();

    const originalSubmitPromise = waitForEvent(secondExtensionSocket, "original:submit-allowed");
    const stateAck = await emitExtensionState(secondExtensionSocket, {
      roomCode: created.data.roomCode,
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
        canGoNext: false,
        canGoPrevious: false,
        resultMessage: null,
        answerCandidates: []
      }
    });
    expect(stateAck).toEqual({ ok: true, data: undefined });
    await expect(emitConnectedSource(secondExtensionSocket, created.data.roomCode)).resolves.toEqual({ ok: true, data: undefined });

    const hostSubmitAck = await emitSubmitAnswer(hostWebSocket, {
      roomCode: created.data.roomCode,
      participantId: created.data.hostParticipantId,
      rawAnswer: "blue archive"
    });
    const playerSubmitAck = await emitSubmitAnswer(participantSocket, {
      roomCode: created.data.roomCode,
      participantId: participantJoin.data.participantId,
      rawAnswer: "wrong"
    });
    expect(hostSubmitAck).toEqual({ ok: true, data: undefined });
    expect(playerSubmitAck).toEqual({ ok: true, data: undefined });

    await expect(originalSubmitPromise).resolves.toMatchObject({
      roomCode: created.data.roomCode,
      hostRawAnswer: "blue archive"
    });
  });
});
