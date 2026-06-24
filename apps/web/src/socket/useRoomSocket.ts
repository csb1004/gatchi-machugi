import type {
  ChatMessagePayload,
  ClientToServerEvents,
  JoinRoomPayload,
  QuizCommandName,
  RoomSettings,
  RoomState,
  ServerToClientEvents,
  SourceMirrorAction
} from "@gatchi/shared";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const chatMessageLimit = 100;
const participantIdStorageKey = "participantId";
const participantCodeStorageKey = "participantCode";
const activeRoomCodeStorageKey = "activeRoomCode";
const activeNicknameStorageKey = "activeNickname";
const roomSessionsStorageKey = "roomSessions";

export interface StoredRoomSession {
  roomCode: string;
  nickname: string;
  participantId: string;
  participantCode: string;
}

export function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

export function roomCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/rooms\/([^/?#]+)/i);
  const pathRoomCode = match?.[1];
  if (!pathRoomCode) return null;

  let decodedRoomCode: string;
  try {
    decodedRoomCode = decodeURIComponent(pathRoomCode);
  } catch {
    return null;
  }

  const roomCode = normalizeRoomCode(decodedRoomCode);
  return roomCode || null;
}

export function roomPath(roomCode: string) {
  return `/rooms/${encodeURIComponent(normalizeRoomCode(roomCode))}`;
}

function activeStoredRoomSession(): StoredRoomSession | null {
  const roomCode = localStorage.getItem(activeRoomCodeStorageKey);
  const nickname = localStorage.getItem(activeNicknameStorageKey);
  const participantId = localStorage.getItem(participantIdStorageKey);
  const participantCode = localStorage.getItem(participantCodeStorageKey);

  if (!roomCode || !nickname || !participantId || !participantCode) return null;
  return {
    roomCode,
    nickname,
    participantId,
    participantCode
  };
}

function readStoredRoomSessionMap(): Record<string, StoredRoomSession> {
  const rawSessions = localStorage.getItem(roomSessionsStorageKey);
  if (!rawSessions) return {};

  try {
    const parsed = JSON.parse(rawSessions) as Record<string, Partial<StoredRoomSession>>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, session]) => {
          const roomCode = normalizeRoomCode(session.roomCode ?? key);
          if (!roomCode || !session.nickname || !session.participantId || !session.participantCode) return null;
          return [
            roomCode,
            {
              roomCode,
              nickname: session.nickname,
              participantId: session.participantId,
              participantCode: session.participantCode
            }
          ] as const;
        })
        .filter((entry): entry is readonly [string, StoredRoomSession] => Boolean(entry))
    );
  } catch {
    return {};
  }
}

function writeStoredRoomSession(session: StoredRoomSession) {
  const roomCode = normalizeRoomCode(session.roomCode);
  const nextSession = { ...session, roomCode };
  const sessions = readStoredRoomSessionMap();
  sessions[roomCode] = nextSession;

  localStorage.setItem(roomSessionsStorageKey, JSON.stringify(sessions));
  localStorage.setItem(activeRoomCodeStorageKey, roomCode);
  localStorage.setItem(activeNicknameStorageKey, nextSession.nickname);
  localStorage.setItem(participantIdStorageKey, nextSession.participantId);
  localStorage.setItem(participantCodeStorageKey, nextSession.participantCode);
}

export function readStoredRoomSession(roomCode?: string): StoredRoomSession | null {
  const normalizedRoomCode = roomCode ? normalizeRoomCode(roomCode) : null;
  const sessions = readStoredRoomSessionMap();

  if (normalizedRoomCode) {
    const storedForRoom = sessions[normalizedRoomCode];
    if (storedForRoom) return storedForRoom;

    const activeSession = activeStoredRoomSession();
    return activeSession?.roomCode === normalizedRoomCode ? activeSession : null;
  }

  const activeSession = activeStoredRoomSession();
  if (activeSession) return activeSession;

  return null;
}

export function clearStoredRoomSession(roomCode?: string) {
  const normalizedRoomCode = roomCode ? normalizeRoomCode(roomCode) : null;
  if (normalizedRoomCode) {
    const sessions = readStoredRoomSessionMap();
    delete sessions[normalizedRoomCode];
    if (Object.keys(sessions).length > 0) {
      localStorage.setItem(roomSessionsStorageKey, JSON.stringify(sessions));
    } else {
      localStorage.removeItem(roomSessionsStorageKey);
    }
  } else {
    localStorage.removeItem(roomSessionsStorageKey);
  }

  if (normalizedRoomCode && localStorage.getItem(activeRoomCodeStorageKey) !== normalizedRoomCode) return;

  localStorage.removeItem(activeRoomCodeStorageKey);
  localStorage.removeItem(activeNicknameStorageKey);
  localStorage.removeItem(participantIdStorageKey);
  localStorage.removeItem(participantCodeStorageKey);
}

export function shouldReturnToLobbyOnState(state: Pick<RoomState, "phase">) {
  return state.phase === "expired";
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
    "Invalid room leave payload": "방 나가기 정보가 올바르지 않습니다.",
    "Room leave failed": "방에서 나가지 못했습니다.",
    "Quiz command failed": "방장 조작을 전달하지 못했습니다."
  };

  return translations[message] ?? message;
}

function createActionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldClearStoredSessionAfterJoinFailure(error: string, input: { participantId?: string; participantCode?: string }) {
  if (!input.participantId && !input.participantCode) return false;

  return [
    "Room not found",
    "Participant code required",
    "Invalid participant code",
    "Participant not found",
    "Participant code missing"
  ].includes(error);
}

export function useRoomSocket() {
  const [state, setState] = useState<RoomState | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(() => localStorage.getItem(participantIdStorageKey));
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socket = useMemo<RoomSocket>(() => io("/", { autoConnect: false, transports: ["websocket"] }), []);

  useEffect(() => {
    function handleState(nextState: RoomState) {
      if (shouldReturnToLobbyOnState(nextState)) {
        setState(null);
        setChatMessages([]);
        setError(null);
        clearStoredRoomSession(nextState.roomCode);
        return;
      }

      setState(nextState);
    }

    function handleChat(message: ChatMessagePayload) {
      setChatMessages((messages) => [...messages, message].slice(-chatMessageLimit));
    }

    function handleSourceActionFailure(payload: { reason: string }) {
      setError(payload.reason);
    }

    socket.on("room:state", handleState);
    socket.on("chat:message", handleChat);
    socket.on("source:action-failure", handleSourceActionFailure);

    return () => {
      socket.off("room:state", handleState);
      socket.off("chat:message", handleChat);
      socket.off("source:action-failure", handleSourceActionFailure);
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
          writeStoredRoomSession({
            roomCode,
            nickname: payload.nickname,
            participantId: ack.data.participantId,
            participantCode: ack.data.participantCode
          });
          setParticipantId(ack.data.participantId);
          setState(ack.data.state);
          return;
        }

        if (shouldClearStoredSessionAfterJoinFailure(ack.error, input)) {
          clearStoredRoomSession(roomCode);
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

  function addAlias(alias: string) {
    if (!state) return;

    socket.emit("answer:add-alias", { roomCode: state.roomCode, alias }, (ack) => {
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

  function sendSourceAction(action: SourceMirrorAction) {
    if (!state) return;

    socket.emit(
      "source:action",
      {
        roomCode: state.roomCode,
        actionId: createActionId(),
        action
      },
      (ack) => {
        if (!ack.ok) setError(localizeSocketError(ack.error));
      }
    );
  }

  function updateSettings(settings: Partial<RoomSettings>) {
    if (!state) return;

    socket.emit("room:update-settings", { roomCode: state.roomCode, settings }, (ack) => {
      if (!ack.ok) setError(localizeSocketError(ack.error));
    });
  }

  function leaveRoom(onLeft?: () => void) {
    if (!state || !participantId) return;

    const leavingRoomCode = state.roomCode;
    socket.emit("room:leave", { roomCode: leavingRoomCode, participantId }, (ack) => {
      if (!ack.ok) {
        setError(localizeSocketError(ack.error));
        return;
      }

      if (state.roomCode === leavingRoomCode) {
        setState(null);
        setChatMessages([]);
        setError(null);
        clearStoredRoomSession(leavingRoomCode);
        onLeft?.();
      }
    });
  }

  return {
    state,
    participantId,
    chatMessages,
    error,
    joinRoom,
    submitAnswer,
    addAlias,
    sendChat,
    sendHostCommand,
    sendSourceAction,
    updateSettings,
    leaveRoom
  };
}
