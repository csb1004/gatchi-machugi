import type { Server as HttpServer } from "node:http";
import type { Ack, ClientToServerEvents, HostPairAck, HostPairPayload, JoinRoomAck, JoinRoomPayload, RoomState } from "@gatchi/shared";
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

function ackError<T>(ack: Ack<T>, error: string) {
  ack({ ok: false, error });
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
        const participantId = session.participantId ?? parsed.data.participantId;
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
        const state = roomService.getState(parsed.data.roomCode);
        state.hostExtensionConnected = true;

        socket.join(parsed.data.roomCode);
        session.roomCode = parsed.data.roomCode;
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

    socket.on("disconnect", () => {
      if (!session.roomCode) return;

      if (session.role === "host") {
        try {
          const state = roomService.getState(session.roomCode);
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
