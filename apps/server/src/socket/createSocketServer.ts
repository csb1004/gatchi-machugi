import type { Server as HttpServer } from "node:http";
import type {
  Ack,
  AddAliasPayload,
  AdjustScorePayload,
  ClientToServerEvents,
  ExtensionSourcePayload,
  ExtensionStatePayload,
  HostPairAck,
  HostPairPayload,
  JoinRoomAck,
  JoinRoomPayload,
  KickParticipantPayload,
  OriginalResultPayload,
  OriginalFailurePayload,
  OriginalSubmitRequestPayload,
  QuizCommandPayload,
  RoomLeavePayload,
  RevealAnswerPayload,
  RoomSettings,
  RoomState,
  SendChatPayload,
  SourceMirrorActionFailurePayload,
  SourceMirrorActionPayload,
  SourceMirrorPayload,
  SubmitAnswerPayload
} from "@gatchi/shared";
import { Server } from "socket.io";
import { z } from "zod";
import type { RoomService } from "../domain/roomService.js";

interface SocketSession {
  roomCode?: string;
  participantId?: string;
  role?: "host" | "participant";
  clientKind?: "web" | "extension";
}

type HostPairGatewayAck = HostPairAck & { state: RoomState };
const defaultHostWebReconnectGraceMs = 5000;

const joinRoomSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  nickname: z.string().trim().min(1).max(40),
  participantId: z.string().trim().min(1).optional(),
  participantCode: z.string().trim().min(1).optional()
});

const roomLeaveSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  participantId: z.string().trim().min(1)
});

const hostPairSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  hostCode: z.string().trim().min(1)
});

const extensionStateSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  quiz: z.custom<ExtensionStatePayload["quiz"]>((value) => typeof value === "object" && value !== null)
});

const extensionSourceSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  sourceWindow: z.object({
    status: z.enum(["disconnected", "connected", "unsupported"]),
    url: z.string().nullable(),
    title: z.string().nullable(),
    lastSeenAt: z.string().nullable(),
    message: z.string().nullable()
  })
});

const sourceMirrorActionSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  actionId: z.string().trim().min(1).max(80),
  action: z.custom<SourceMirrorActionPayload["action"]>((value) => typeof value === "object" && value !== null)
});

const sourceMirrorSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  sourceMirror: z.custom<SourceMirrorPayload["sourceMirror"]>((value) => typeof value === "object" && value !== null)
});

const sourceMirrorFailureSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  actionId: z.string().trim().min(1).max(80),
  action: z.custom<SourceMirrorActionFailurePayload["action"]>((value) => typeof value === "object" && value !== null),
  reason: z.string().trim().min(1).max(500)
});

const originalSubmitRequestSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  questionKey: z.string().trim().min(1)
});

const originalResultSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  questionKey: z.string().trim().min(1),
  quiz: z.custom<OriginalResultPayload["quiz"]>((value) => typeof value === "object" && value !== null)
});

const originalFailureSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  questionKey: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500)
});

const submitAnswerSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  participantId: z.string().trim().min(1),
  rawAnswer: z.string()
});

const revealAnswersSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  skippedParticipantIds: z.array(z.string().trim().min(1))
});

const quizCommandSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  command: z.enum(["configure", "start", "next", "previous", "skip", "reset", "reveal-original-answer"]),
  values: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

const addAliasSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  alias: z.string()
});

const sendChatSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  participantId: z.string().trim().min(1),
  text: z.string().max(500)
});

const adjustScoreSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  participantId: z.string().trim().min(1),
  delta: z.number().finite().min(-1000).max(1000),
  reason: z.string().trim().min(1).max(120)
});

const updateSettingsSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  settings: z.object({
    visibility: z.enum(["public", "private"]).optional(),
    submissionVisibility: z.enum(["status-only", "hidden"]).optional(),
    timerSeconds: z.number().int().positive().nullable().optional(),
    title: z.string().trim().min(1).max(100).optional()
  })
});

const kickParticipantSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  participantId: z.string().trim().min(1)
});

function ackError<T>(ack: Ack<T>, error: string) {
  ack({ ok: false, error });
}

function requireHostSession(session: SocketSession, roomCode: string) {
  if (session.role !== "host" || session.roomCode !== roomCode) {
    throw new Error("Host authorization required");
  }
}

function requireHostExtensionSession(session: SocketSession, roomCode: string) {
  requireHostSession(session, roomCode);
  if (session.clientKind !== "extension") {
    throw new Error("Host extension authorization required");
  }
}

function requireHostWebSession(session: SocketSession, roomCode: string) {
  requireHostSession(session, roomCode);
  if (session.clientKind !== "web") {
    throw new Error("Host web authorization required");
  }
}

function requireCurrentHostExtensionSession(session: SocketSession, socketId: string, roomCode: string, hostExtensionSocketIds: Map<string, string>) {
  requireHostExtensionSession(session, roomCode);
  if (hostExtensionSocketIds.get(roomCode) !== socketId) {
    throw new Error("Current host extension authorization required");
  }
}

function requireParticipantSession(session: SocketSession, roomCode: string, participantId: string) {
  if (session.roomCode !== roomCode || session.participantId !== participantId) {
    throw new Error("Participant authorization required");
  }
}

function definedSettings(settings: z.infer<typeof updateSettingsSchema>["settings"]): Partial<RoomSettings> {
  const next: Partial<RoomSettings> = {};
  if (settings.visibility !== undefined) next.visibility = settings.visibility;
  if (settings.submissionVisibility !== undefined) next.submissionVisibility = settings.submissionVisibility;
  if (settings.timerSeconds !== undefined) next.timerSeconds = settings.timerSeconds;
  if (settings.title !== undefined) next.title = settings.title;
  return next;
}

function markParticipantDisconnected(roomService: RoomService, socket: SocketSession): RoomState | null {
  if (!socket.roomCode || !socket.participantId) return null;

  try {
    return roomService.disconnectParticipant({
      roomCode: socket.roomCode,
      participantId: socket.participantId
    });
  } catch {
    return null;
  }
}

export function createSocketServer(
  httpServer: HttpServer,
  {
    roomService,
    hostWebReconnectGraceMs = defaultHostWebReconnectGraceMs
  }: { roomService: RoomService; hostWebReconnectGraceMs?: number }
) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });
  const hostExtensionSocketIds = new Map<string, string>();
  const hostWebDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearHostWebDisconnectTimer(roomCode: string) {
    const timer = hostWebDisconnectTimers.get(roomCode);
    if (!timer) return;
    clearTimeout(timer);
    hostWebDisconnectTimers.delete(roomCode);
  }

  function deleteHostExtensionSocketId(roomCode: string, socketId: string) {
    if (hostExtensionSocketIds.get(roomCode) === socketId) {
      hostExtensionSocketIds.delete(roomCode);
    }
  }

  function expireRoomForHostDisconnect(roomCode: string) {
    clearHostWebDisconnectTimer(roomCode);
    try {
      const state = roomService.expireRoom(roomCode);
      state.hostExtensionConnected = false;
      hostExtensionSocketIds.delete(roomCode);
      io.to(roomCode).emit("host:disconnected");
      io.to(roomCode).emit("room:state", state);
    } catch {
      return;
    }
  }

  function scheduleHostWebDisconnect(roomCode: string) {
    clearHostWebDisconnectTimer(roomCode);
    hostWebDisconnectTimers.set(
      roomCode,
      setTimeout(() => expireRoomForHostDisconnect(roomCode), hostWebReconnectGraceMs)
    );
  }

  function emitOriginalSubmitIfReady(roomCode: string, state: RoomState) {
    if (state.fairPlay.originalSubmitStatus !== "ready" || !state.fairPlay.questionKey) return;
    if (state.sourceWindow.status !== "connected") return;
    const extensionSocketId = hostExtensionSocketIds.get(roomCode);
    if (!extensionSocketId) return;
    const extensionSocket = io.sockets.sockets.get(extensionSocketId);
    const extensionSession = extensionSocket?.data as SocketSession | undefined;
    if (
      !extensionSocket?.connected ||
      extensionSession?.roomCode !== roomCode ||
      extensionSession.role !== "host" ||
      extensionSession.clientKind !== "extension"
    ) {
      deleteHostExtensionSocketId(roomCode, extensionSocketId);
      return;
    }

    try {
      const payload = roomService.requestOriginalSubmission({
        roomCode,
        questionKey: state.fairPlay.questionKey
      });
      io.to(extensionSocketId).emit("original:submit-allowed", payload);
      io.to(roomCode).emit("room:state", roomService.getState(roomCode));
    } catch {
      return;
    }
  }

  io.on("connection", (socket) => {
    const session = socket.data as SocketSession;

    socket.on("room:join", (payload: JoinRoomPayload, ack: Ack<JoinRoomAck>) => {
      const parsed = joinRoomSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid room join payload");
        return;
      }

      try {
        const previousRoomCode = session.roomCode;
        const participantId = session.participantId;
        const trustedParticipantId = participantId ?? (parsed.data.participantCode ? parsed.data.participantId : undefined);
        const joined = roomService.joinParticipant({
          roomCode: parsed.data.roomCode,
          nickname: parsed.data.nickname,
          ...(trustedParticipantId ? { participantId: trustedParticipantId } : {}),
          ...(parsed.data.participantCode ? { participantCode: parsed.data.participantCode } : {})
        });

        socket.join(parsed.data.roomCode);
        if (previousRoomCode && previousRoomCode !== parsed.data.roomCode) {
          socket.leave(previousRoomCode);
        }
        if (previousRoomCode) {
          deleteHostExtensionSocketId(previousRoomCode, socket.id);
        }
        deleteHostExtensionSocketId(parsed.data.roomCode, socket.id);
        session.roomCode = parsed.data.roomCode;
        session.participantId = joined.participant.id;
        session.role = joined.participant.role === "host" ? "host" : "participant";
        session.clientKind = "web";
        if (session.role === "host") {
          clearHostWebDisconnectTimer(parsed.data.roomCode);
        }

        ack({
          ok: true,
          data: {
            participantId: joined.participant.id,
            participantCode: joined.participantCode,
            state: joined.state
          }
        });

        io.to(parsed.data.roomCode).emit("room:state", joined.state);
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Failed to join room");
      }
    });

    socket.on("host:pair", async (payload: HostPairPayload, ack: Ack<HostPairAck>) => {
      const parsed = hostPairSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid host pair payload");
        return;
      }

      const isValidHost = roomService.verifyHost({
        roomCode: parsed.data.roomCode,
        hostCode: parsed.data.hostCode
      });

      if (!isValidHost) {
        ackError(ack, "Invalid host code");
        return;
      }

      try {
        const previousRoomCode = session.roomCode;
        const joined = roomService.joinHostExtension({
          roomCode: parsed.data.roomCode,
          hostCode: parsed.data.hostCode
        });
        const state = joined.state;
        const previousExtensionSocketId = hostExtensionSocketIds.get(parsed.data.roomCode);
        if (previousExtensionSocketId && previousExtensionSocketId !== socket.id) {
          const previousExtensionSocket = io.sockets.sockets.get(previousExtensionSocketId);
          const previousExtensionSession = previousExtensionSocket?.data as SocketSession | undefined;
          previousExtensionSocket?.leave(parsed.data.roomCode);
          if (previousExtensionSession?.roomCode === parsed.data.roomCode && previousExtensionSession.clientKind === "extension") {
            delete previousExtensionSession.roomCode;
            delete previousExtensionSession.participantId;
            delete previousExtensionSession.role;
            delete previousExtensionSession.clientKind;
          }
          previousExtensionSocket?.disconnect(true);
        }

        socket.join(parsed.data.roomCode);
        if (previousRoomCode && previousRoomCode !== parsed.data.roomCode) {
          socket.leave(previousRoomCode);
          deleteHostExtensionSocketId(previousRoomCode, socket.id);
        }
        session.roomCode = parsed.data.roomCode;
        session.participantId = joined.participant.id;
        session.role = "host";
        session.clientKind = "extension";
        hostExtensionSocketIds.set(parsed.data.roomCode, socket.id);

        (ack as Ack<HostPairGatewayAck>)({
          ok: true,
          data: {
            roomCode: parsed.data.roomCode,
            state
          }
        });

        io.to(parsed.data.roomCode).emit("host:connected");
        io.to(parsed.data.roomCode).emit("room:state", state);
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Failed to pair host");
      }
    });

    socket.on("room:leave", (payload: RoomLeavePayload, ack: Ack<void>) => {
      const parsed = roomLeaveSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid room leave payload");
        return;
      }

      try {
        requireParticipantSession(session, parsed.data.roomCode, parsed.data.participantId);

        if (session.role === "host") {
          clearHostWebDisconnectTimer(parsed.data.roomCode);
          const extensionSocketId = hostExtensionSocketIds.get(parsed.data.roomCode);
          if (extensionSocketId) {
            io.sockets.sockets.get(extensionSocketId)?.leave(parsed.data.roomCode);
            hostExtensionSocketIds.delete(parsed.data.roomCode);
          }

          const state = roomService.expireRoom(parsed.data.roomCode);
          state.hostExtensionConnected = false;
          io.to(parsed.data.roomCode).emit("host:disconnected");
          io.to(parsed.data.roomCode).emit("room:state", state);
        } else {
          const state = roomService.disconnectParticipant(parsed.data);
          io.to(parsed.data.roomCode).emit("room:state", state);
        }

        socket.leave(parsed.data.roomCode);
        deleteHostExtensionSocketId(parsed.data.roomCode, socket.id);
        delete session.roomCode;
        delete session.participantId;
        delete session.role;
        delete session.clientKind;
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Room leave failed");
      }
    });

    socket.on("extension:state", (payload: ExtensionStatePayload, ack: Ack<void>) => {
      const parsed = extensionStateSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid extension state payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        const state = roomService.updateQuizState(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "State update failed");
      }
    });

    socket.on("extension:source", (payload: ExtensionSourcePayload, ack: Ack<void>) => {
      const parsed = extensionSourceSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid extension source payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        if (parsed.data.sourceWindow.status === "disconnected") {
          roomService.updateSourceWindow(parsed.data);
          clearHostWebDisconnectTimer(parsed.data.roomCode);
          const state = roomService.expireRoom(parsed.data.roomCode);
          state.hostExtensionConnected = false;
          deleteHostExtensionSocketId(parsed.data.roomCode, socket.id);
          socket.leave(parsed.data.roomCode);
          io.to(parsed.data.roomCode).emit("host:disconnected");
          io.to(parsed.data.roomCode).emit("room:state", state);
          ack({ ok: true, data: undefined });
          return;
        }

        const state = roomService.updateSourceWindow(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
        emitOriginalSubmitIfReady(parsed.data.roomCode, state);
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Source update failed");
      }
    });

    socket.on("source:mirror", (payload: SourceMirrorPayload, ack: Ack<void>) => {
      const parsed = sourceMirrorSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid source mirror payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        const state = roomService.updateSourceMirror(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
        emitOriginalSubmitIfReady(parsed.data.roomCode, state);
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Source mirror update failed");
      }
    });

    socket.on("source:action", (payload: SourceMirrorActionPayload, ack: Ack<void>) => {
      const parsed = sourceMirrorActionSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid source action payload");
        return;
      }

      try {
        requireHostWebSession(session, parsed.data.roomCode);
        const extensionSocketId = hostExtensionSocketIds.get(parsed.data.roomCode);
        if (!extensionSocketId) {
          throw new Error("Host extension is not connected");
        }

        let actionPayload = parsed.data;
        if (parsed.data.action.name === "skip") {
          const questionKey = roomService.getState(parsed.data.roomCode).fairPlay.questionKey;
          if (!questionKey) {
            throw new Error("No active question to skip");
          }
          const allowed = roomService.requestSkippedOriginalSubmission({
            roomCode: parsed.data.roomCode,
            questionKey
          });
          actionPayload = {
            ...parsed.data,
            action: {
              ...parsed.data.action,
              rawAnswer: allowed.hostRawAnswer
            }
          };
          io.to(parsed.data.roomCode).emit("room:state", roomService.getState(parsed.data.roomCode));
        }

        io.to(extensionSocketId).emit("source:action", actionPayload);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Source action failed");
      }
    });

    socket.on("source:action-failure", (payload: SourceMirrorActionFailurePayload, ack: Ack<void>) => {
      const parsed = sourceMirrorFailureSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid source action failure payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        io.to(parsed.data.roomCode).emit("source:action-failure", parsed.data);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Source action failure failed");
      }
    });

    socket.on("original:request-submit", (payload: OriginalSubmitRequestPayload, ack: Ack<void>) => {
      const parsed = originalSubmitRequestSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid original submit payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        const allowed = roomService.requestOriginalSubmission(parsed.data);
        socket.emit("original:submit-allowed", allowed);
        io.to(parsed.data.roomCode).emit("room:state", roomService.getState(parsed.data.roomCode));
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Original submit request failed");
      }
    });

    socket.on("original:result", (payload: OriginalResultPayload, ack: Ack<void>) => {
      const parsed = originalResultSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid original result payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        const state = roomService.applyOriginalResult(parsed.data);
        io.to(parsed.data.roomCode).emit("answer:revealed", state.revealedSubmissions);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Original result failed");
      }
    });

    socket.on("original:failure", (payload: OriginalFailurePayload, ack: Ack<void>) => {
      const parsed = originalFailureSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid original failure payload");
        return;
      }

      try {
        requireCurrentHostExtensionSession(session, socket.id, parsed.data.roomCode, hostExtensionSocketIds);
        const state = roomService.failOriginalSubmission(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Original failure failed");
      }
    });

    socket.on("quiz:command", (payload: QuizCommandPayload, ack: Ack<void>) => {
      const parsed = quizCommandSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid quiz command payload");
        return;
      }

      try {
        requireHostSession(session, parsed.data.roomCode);
        const extensionSocketId = hostExtensionSocketIds.get(parsed.data.roomCode);
        if (extensionSocketId) {
          io.to(extensionSocketId).emit("quiz:command", parsed.data);
        }
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Quiz command failed");
      }
    });

    socket.on("answer:submit", (payload: SubmitAnswerPayload, ack: Ack<void>) => {
      const parsed = submitAnswerSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid answer payload");
        return;
      }

      try {
        if (session.roomCode !== parsed.data.roomCode) {
          throw new Error("Room authorization required");
        }
        if (session.participantId !== parsed.data.participantId) {
          throw new Error("Cannot submit for another participant");
        }

        const state = roomService.submitAnswer(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        emitOriginalSubmitIfReady(parsed.data.roomCode, state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Answer submit failed");
      }
    });

    socket.on("answer:reveal", (payload: RevealAnswerPayload, ack: Ack<void>) => {
      const parsed = revealAnswersSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid reveal payload");
        return;
      }

      try {
        requireHostSession(session, parsed.data.roomCode);
        const state = roomService.revealAnswers(parsed.data);
        io.to(parsed.data.roomCode).emit("answer:revealed", state.revealedSubmissions);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Reveal failed");
      }
    });

    socket.on("answer:add-alias", (payload: AddAliasPayload, ack: Ack<void>) => {
      const parsed = addAliasSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid alias payload");
        return;
      }

      try {
        requireHostSession(session, parsed.data.roomCode);
        const state = roomService.addAlias(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Alias failed");
      }
    });

    socket.on("chat:send", (payload: SendChatPayload, ack: Ack<void>) => {
      const parsed = sendChatSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid chat payload");
        return;
      }

      try {
        requireParticipantSession(session, parsed.data.roomCode, parsed.data.participantId);
        const message = roomService.addChatMessage(parsed.data);
        io.to(parsed.data.roomCode).emit("chat:message", message);
        io.to(parsed.data.roomCode).emit("room:state", roomService.getState(parsed.data.roomCode));
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Chat failed");
      }
    });

    socket.on("score:adjust", (payload: AdjustScorePayload, ack: Ack<void>) => {
      const parsed = adjustScoreSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid score adjustment payload");
        return;
      }

      try {
        requireHostSession(session, parsed.data.roomCode);
        const state = roomService.adjustScore(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Score adjustment failed");
      }
    });

    socket.on("room:update-settings", (payload, ack: Ack<void>) => {
      const parsed = updateSettingsSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid settings payload");
        return;
      }

      try {
        requireHostSession(session, parsed.data.roomCode);
        const state = roomService.updateSettings({
          roomCode: parsed.data.roomCode,
          settings: definedSettings(parsed.data.settings)
        });
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Settings update failed");
      }
    });

    socket.on("participant:kick", (payload: KickParticipantPayload, ack: Ack<void>) => {
      const parsed = kickParticipantSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid kick payload");
        return;
      }

      try {
        requireHostSession(session, parsed.data.roomCode);
        const state = roomService.kickParticipant(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "Kick failed");
      }
    });

    socket.on("disconnect", () => {
      if (!session.roomCode) return;

      if (session.clientKind === "extension" && session.roomCode) {
        const isCurrentExtension = hostExtensionSocketIds.get(session.roomCode) === socket.id;
        deleteHostExtensionSocketId(session.roomCode, socket.id);
        if (!isCurrentExtension) {
          return;
        }
      }

      if (session.role === "host") {
        if (session.clientKind === "web") {
          scheduleHostWebDisconnect(session.roomCode);
          return;
        }
        expireRoomForHostDisconnect(session.roomCode);
        return;
      }

      const state = markParticipantDisconnected(roomService, session);
      if (state) {
        io.to(session.roomCode).emit("room:state", state);
      }
    });
  });

  return io;
}
