import type { Server as HttpServer } from "node:http";
import type {
  Ack,
  AddAliasPayload,
  ClientToServerEvents,
  ExtensionStatePayload,
  HostPairAck,
  HostPairPayload,
  JoinRoomAck,
  JoinRoomPayload,
  RevealAnswerPayload,
  RoomState,
  SubmitAnswerPayload
} from "@gatchi/shared";
import { Server } from "socket.io";
import { z } from "zod";
import type { RoomService } from "../domain/roomService.js";

interface SocketSession {
  roomCode?: string;
  participantId?: string;
  role?: "host" | "participant";
}

type HostPairGatewayAck = HostPairAck & { state: RoomState };

const joinRoomSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  nickname: z.string().trim().min(1).max(40),
  participantId: z.string().trim().min(1).optional()
});

const hostPairSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  hostToken: z.string().trim().min(1)
});

const extensionStateSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  quiz: z.custom<ExtensionStatePayload["quiz"]>((value) => typeof value === "object" && value !== null)
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

const addAliasSchema = z.object({
  roomCode: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  alias: z.string()
});

function ackError<T>(ack: Ack<T>, error: string) {
  ack({ ok: false, error });
}

function requireHostSession(session: SocketSession, roomCode: string) {
  if (session.role !== "host" || session.roomCode !== roomCode) {
    throw new Error("Host authorization required");
  }
}

function markParticipantDisconnected(roomService: RoomService, socket: SocketSession): RoomState | null {
  if (!socket.roomCode || !socket.participantId) return null;

  try {
    const state = roomService.getState(socket.roomCode);
    const participant = state.participants.find((entry) => entry.id === socket.participantId);
    if (!participant) return null;

    participant.connected = false;
    return state;
  } catch {
    return null;
  }
}

export function createSocketServer(httpServer: HttpServer, { roomService }: { roomService: RoomService }) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    const session = socket.data as SocketSession;

    socket.on("room:join", (payload: JoinRoomPayload, ack: Ack<JoinRoomAck>) => {
      const parsed = joinRoomSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid room join payload");
        return;
      }

      try {
        const participantId = session.participantId;
        const joined = roomService.joinParticipant(
          participantId
            ? {
                roomCode: parsed.data.roomCode,
                nickname: parsed.data.nickname,
                participantId
              }
            : {
                roomCode: parsed.data.roomCode,
                nickname: parsed.data.nickname
              }
        );

        socket.join(parsed.data.roomCode);
        session.roomCode = parsed.data.roomCode;
        session.participantId = joined.participant.id;
        session.role = "participant";

        ack({
          ok: true,
          data: {
            participantId: joined.participant.id,
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

      const isValidHost = await roomService.verifyHost({
        roomCode: parsed.data.roomCode,
        hostToken: parsed.data.hostToken
      });

      if (!isValidHost) {
        ackError(ack, "Invalid host token");
        return;
      }

      try {
        const joined = roomService.joinHostPlayer({
          roomCode: parsed.data.roomCode,
          nickname: "Host"
        });
        const state = joined.state;
        state.hostExtensionConnected = true;

        socket.join(parsed.data.roomCode);
        session.roomCode = parsed.data.roomCode;
        session.participantId = joined.participant.id;
        session.role = "host";

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

    socket.on("extension:state", (payload: ExtensionStatePayload, ack: Ack<void>) => {
      const parsed = extensionStateSchema.safeParse(payload);
      if (!parsed.success) {
        ackError(ack, "Invalid extension state payload");
        return;
      }

      try {
        requireHostSession(session, parsed.data.roomCode);
        const state = roomService.updateQuizState(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
        ack({ ok: true, data: undefined });
      } catch (error) {
        ackError(ack, error instanceof Error ? error.message : "State update failed");
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
        if (session.role !== "host" && session.participantId !== parsed.data.participantId) {
          throw new Error("Cannot submit for another participant");
        }

        const state = roomService.submitAnswer(parsed.data);
        io.to(parsed.data.roomCode).emit("room:state", state);
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

    socket.on("disconnect", () => {
      if (!session.roomCode) return;

      if (session.role === "host") {
        try {
          const state = markParticipantDisconnected(roomService, session) ?? roomService.getState(session.roomCode);
          state.hostExtensionConnected = false;
          io.to(session.roomCode).emit("host:disconnected");
          io.to(session.roomCode).emit("room:state", state);
        } catch {
          return;
        }

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
