import type {
  ChatMessagePayload,
  ClientToServerEvents,
  QuizCommandName,
  RoomState,
  ServerToClientEvents
} from "@gatchi/shared";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

export function useRoomSocket() {
  const [state, setState] = useState<RoomState | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(() => localStorage.getItem("participantId"));
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socket = useMemo<RoomSocket>(() => io("/", { autoConnect: false, transports: ["websocket"] }), []);

  useEffect(() => {
    function handleState(nextState: RoomState) {
      setState(nextState);
    }

    function handleChat(message: ChatMessagePayload) {
      setChatMessages((messages) => [...messages, message]);
    }

    socket.on("room:state", handleState);
    socket.on("chat:message", handleChat);

    return () => {
      socket.off("room:state", handleState);
      socket.off("chat:message", handleChat);
      socket.disconnect();
    };
  }, [socket]);

  function joinRoom(input: { roomCode: string; nickname: string }) {
    const roomCode = normalizeRoomCode(input.roomCode);
    setError(null);
    socket.connect();
    socket.emit("room:join", { roomCode, nickname: input.nickname.trim() }, (ack) => {
      if (ack.ok) {
        localStorage.setItem("participantId", ack.data.participantId);
        setParticipantId(ack.data.participantId);
        setState(ack.data.state);
        return;
      }

      setError(ack.error);
    });
  }

  function submitAnswer(rawAnswer: string) {
    if (!state || !participantId) return;

    socket.emit("answer:submit", { roomCode: state.roomCode, participantId, rawAnswer }, (ack) => {
      if (!ack.ok) setError(ack.error);
    });
  }

  function sendChat(text: string) {
    if (!state || !participantId) return;

    socket.emit("chat:send", { roomCode: state.roomCode, participantId, text }, (ack) => {
      if (!ack.ok) setError(ack.error);
    });
  }

  function sendHostCommand(command: QuizCommandName) {
    if (!state) return;

    socket.emit("quiz:command", { roomCode: state.roomCode, command }, (ack) => {
      if (!ack.ok) setError(ack.error);
    });
  }

  return {
    state,
    participantId,
    chatMessages,
    error,
    joinRoom,
    submitAnswer,
    sendChat,
    sendHostCommand
  };
}
