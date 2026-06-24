import { act, render, waitFor } from "@testing-library/react";
import type { ChatMessagePayload, RoomState } from "@gatchi/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStoredRoomSession, useRoomSocket } from "./useRoomSocket";

type Handler = (payload: unknown) => void;

const handlers = vi.hoisted(() => new Map<string, Set<Handler>>());
const emitMock = vi.hoisted(() => vi.fn());
const socketMock = vi.hoisted(() => ({
  on: vi.fn((event: string, handler: Handler) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)?.add(handler);
  }),
  off: vi.fn((event: string, handler: Handler) => {
    handlers.get(event)?.delete(handler);
  }),
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: emitMock
}));

vi.mock("socket.io-client", () => ({
  io: () => socketMock
}));

const roomState: RoomState = {
  roomCode: "ABC123",
  phase: "playing",
  settings: { title: "마추기 방", visibility: "public", submissionVisibility: "status-only", timerSeconds: null },
  participants: [{ id: "p1", nickname: "Mina", role: "player", connected: true, score: 0 }],
  quiz: {
    quizTitle: "Pokemon",
    questionIndex: 1,
    totalQuestions: 10,
    questionType: "free-text",
    questionText: null,
    imageUrl: null,
    audioUrl: null,
    videoUrl: null,
    choices: [],
    timerSecondsRemaining: null,
    canGoNext: false,
    canGoPrevious: false,
    resultMessage: null,
    answerCandidates: []
  },
  submissions: [],
  revealedSubmissions: [],
  fairPlay: {
    questionKey: "q1",
    requiredParticipantIds: ["p1"],
    submittedParticipantIds: [],
    allRequiredSubmitted: false,
    originalSubmitStatus: "locked",
    lockReason: null
  },
  sourceWindow: {
    status: "connected",
    url: "https://machugi.io/",
    title: "Machugi",
    lastSeenAt: "2026-06-19T00:00:00.000Z",
    message: null
  },
  sourceMirror: {
    kind: "disconnected",
    url: null,
    title: null,
    lastSeenAt: null,
    message: "원본 탭을 연결해 주세요."
  },
  hostExtensionConnected: true,
  chatMessageCount: 0
};

function emitSocketEvent(event: string, payload: unknown) {
  for (const handler of handlers.get(event) ?? []) {
    handler(payload);
  }
}

function chatMessage(index: number): ChatMessagePayload {
  return {
    id: `m-${index}`,
    roomCode: "ABC123",
    participantId: "p1",
    nickname: "Mina",
    text: `message ${index}`,
    createdAt: "2026-06-19T00:00:00.000Z"
  };
}

function Harness({ onHook }: { onHook: (hook: ReturnType<typeof useRoomSocket>) => void }) {
  const hook = useRoomSocket();
  onHook(hook);
  return null;
}

describe("useRoomSocket lifecycle", () => {
  let hook: ReturnType<typeof useRoomSocket>;

  beforeEach(() => {
    handlers.clear();
    emitMock.mockReset();
    socketMock.on.mockClear();
    socketMock.off.mockClear();
    socketMock.connect.mockClear();
    socketMock.disconnect.mockClear();
    localStorage.clear();
    emitMock.mockImplementation((event: string, _payload: unknown, ack?: (response: unknown) => void) => {
      if (event === "room:join") {
        ack?.({
          ok: true,
          data: {
            participantId: "p1",
            participantCode: "#P001",
            state: roomState
          }
        });
      }
      if (event === "room:leave") {
        ack?.({ ok: true, data: undefined });
      }
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("stores the active room session after a successful join", async () => {
    render(<Harness onHook={(nextHook) => (hook = nextHook)} />);

    act(() => {
      hook.joinRoom({ roomCode: "abc123", nickname: "Mina" });
    });

    await waitFor(() => expect(hook.participantId).toBe("p1"));
    expect(localStorage.getItem("participantId")).toBe("p1");
    expect(localStorage.getItem("participantCode")).toBe("#P001");
    expect(localStorage.getItem("activeRoomCode")).toBe("ABC123");
    expect(localStorage.getItem("activeNickname")).toBe("Mina");
  });

  it("sends room setting updates for the active room", async () => {
    render(<Harness onHook={(nextHook) => (hook = nextHook)} />);

    act(() => {
      hook.joinRoom({ roomCode: "ABC123", nickname: "Mina" });
    });
    await waitFor(() => expect(hook.state?.roomCode).toBe("ABC123"));

    act(() => {
      hook.updateSettings({ imageScale: 1.2 });
    });

    expect(emitMock).toHaveBeenCalledWith(
      "room:update-settings",
      { roomCode: "ABC123", settings: { imageScale: 1.2 } },
      expect.any(Function)
    );
  });

  it("keeps player sessions for multiple rooms and reads them by room code", async () => {
    emitMock.mockImplementation((event: string, payload: unknown, ack?: (response: unknown) => void) => {
      if (event !== "room:join") return;
      const roomCode = (payload as { roomCode: string }).roomCode;
      ack?.({
        ok: true,
        data: {
          participantId: roomCode === "ABC123" ? "p-abc" : "p-xyz",
          participantCode: roomCode === "ABC123" ? "#A123" : "#X999",
          state: { ...roomState, roomCode }
        }
      });
    });
    render(<Harness onHook={(nextHook) => (hook = nextHook)} />);

    act(() => {
      hook.joinRoom({ roomCode: "ABC123", nickname: "Mina" });
    });
    await waitFor(() => expect(hook.participantId).toBe("p-abc"));

    act(() => {
      hook.joinRoom({ roomCode: "XYZ999", nickname: "Jin" });
    });
    await waitFor(() => expect(hook.participantId).toBe("p-xyz"));

    expect(readStoredRoomSession("ABC123")).toEqual({
      roomCode: "ABC123",
      nickname: "Mina",
      participantId: "p-abc",
      participantCode: "#A123"
    });
    expect(readStoredRoomSession("XYZ999")).toEqual({
      roomCode: "XYZ999",
      nickname: "Jin",
      participantId: "p-xyz",
      participantCode: "#X999"
    });
  });

  it("clears the active room session when the room expires", async () => {
    render(<Harness onHook={(nextHook) => (hook = nextHook)} />);

    act(() => {
      hook.joinRoom({ roomCode: "ABC123", nickname: "Mina" });
    });
    await waitFor(() => expect(hook.participantId).toBe("p1"));

    act(() => {
      emitSocketEvent("room:state", { ...roomState, phase: "expired" });
    });

    await waitFor(() => expect(hook.state).toBeNull());
    expect(localStorage.getItem("activeRoomCode")).toBeNull();
    expect(localStorage.getItem("activeNickname")).toBeNull();
    expect(localStorage.getItem("participantId")).toBeNull();
    expect(localStorage.getItem("participantCode")).toBeNull();
  });

  it("removes only the expired room from stored room sessions", async () => {
    localStorage.setItem("activeRoomCode", "ABC123");
    localStorage.setItem("activeNickname", "Mina");
    localStorage.setItem("participantId", "p-abc");
    localStorage.setItem("participantCode", "#A123");
    localStorage.setItem(
      "roomSessions",
      JSON.stringify({
        ABC123: {
          roomCode: "ABC123",
          nickname: "Mina",
          participantId: "p-abc",
          participantCode: "#A123"
        },
        XYZ999: {
          roomCode: "XYZ999",
          nickname: "Jin",
          participantId: "p-xyz",
          participantCode: "#X999"
        }
      })
    );
    render(<Harness onHook={(nextHook) => (hook = nextHook)} />);

    act(() => {
      emitSocketEvent("room:state", { ...roomState, roomCode: "ABC123", phase: "expired" });
    });

    await waitFor(() => expect(hook.state).toBeNull());
    expect(readStoredRoomSession("ABC123")).toBeNull();
    expect(readStoredRoomSession("XYZ999")).toEqual({
      roomCode: "XYZ999",
      nickname: "Jin",
      participantId: "p-xyz",
      participantCode: "#X999"
    });
  });

  it("clears stale stored credentials after a credentialed join failure", () => {
    localStorage.setItem("activeRoomCode", "ABC123");
    localStorage.setItem("activeNickname", "Mina");
    localStorage.setItem("participantId", "p1");
    localStorage.setItem("participantCode", "#P001");
    emitMock.mockImplementation((event: string, _payload: unknown, ack?: (response: unknown) => void) => {
      if (event === "room:join") ack?.({ ok: false, error: "Room not found" });
    });
    render(<Harness onHook={(nextHook) => (hook = nextHook)} />);

    act(() => {
      hook.joinRoom({ roomCode: "ABC123", nickname: "Mina", participantId: "p1", participantCode: "#P001" });
    });

    expect(localStorage.getItem("activeRoomCode")).toBeNull();
    expect(localStorage.getItem("participantId")).toBeNull();
  });

  it("keeps only the latest 100 chat messages", async () => {
    render(<Harness onHook={(nextHook) => (hook = nextHook)} />);

    act(() => {
      for (let index = 0; index < 105; index += 1) {
        emitSocketEvent("chat:message", chatMessage(index));
      }
    });

    await waitFor(() => expect(hook.chatMessages).toHaveLength(100));
    expect(hook.chatMessages[0]?.id).toBe("m-5");
    expect(hook.chatMessages.at(-1)?.id).toBe("m-104");
  });
});
