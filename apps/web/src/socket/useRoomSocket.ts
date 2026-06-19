import type {
  ChatMessagePayload,
  ClientToServerEvents,
  JoinRoomPayload,
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

function localizeSocketError(message: string) {
  const translations: Record<string, string> = {
    "Room not found": "방을 찾을 수 없습니다.",
    "Invalid room join payload": "입장 정보가 올바르지 않습니다.",
    "Failed to join room": "방에 입장하지 못했습니다.",
    "Room authorization required": "방 입장 권한이 필요합니다.",
    "Participant authorization required": "참가자 권한이 필요합니다.",
    "Cannot submit for another participant": "다른 참가자 이름으로 답변할 수 없습니다.",
    "Submissions are closed for this question": "이 문제의 답변 제출이 마감되었습니다.",
    "Invalid answer payload": "답변 정보가 올바르지 않습니다.",
    "Answer submit failed": "답변 제출에 실패했습니다.",
    "Invalid chat payload": "채팅 메시지가 올바르지 않습니다.",
    "Chat message is empty": "채팅 메시지를 입력해주세요.",
    "Chat failed": "채팅 전송에 실패했습니다.",
    "Host authorization required": "방장 권한이 필요합니다.",
    "Quiz command failed": "방장 조작을 전달하지 못했습니다."
  };

  return translations[message] ?? message;
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

  function joinRoom(input: { roomCode: string; nickname: string; participantId?: string; participantCode?: string }) {
    const roomCode = normalizeRoomCode(input.roomCode);
    const payload: JoinRoomPayload = {
      roomCode,
      nickname: input.nickname.trim(),
      ...(input.participantId ? { participantId: input.participantId } : {}),
      ...(input.participantCode ? { participantCode: input.participantCode } : {})
    };

    setError(null);
    socket.connect();
    socket.emit(
      "room:join",
      payload,
      (ack) => {
        if (ack.ok) {
          localStorage.setItem("participantId", ack.data.participantId);
          localStorage.setItem("participantCode", ack.data.participantCode);
          setParticipantId(ack.data.participantId);
          setState(ack.data.state);
          return;
        }

        setError(localizeSocketError(ack.error));
      }
    );
  }

  function submitAnswer(rawAnswer: string) {
    if (!state || !participantId) return;

    socket.emit("answer:submit", { roomCode: state.roomCode, participantId, rawAnswer }, (ack) => {
      if (!ack.ok) setError(localizeSocketError(ack.error));
    });
  }

  function sendChat(text: string) {
    if (!state || !participantId) return;

    socket.emit("chat:send", { roomCode: state.roomCode, participantId, text }, (ack) => {
      if (!ack.ok) setError(localizeSocketError(ack.error));
    });
  }

  function sendHostCommand(command: QuizCommandName) {
    if (!state) return;

    socket.emit("quiz:command", { roomCode: state.roomCode, command }, (ack) => {
      if (!ack.ok) setError(localizeSocketError(ack.error));
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
