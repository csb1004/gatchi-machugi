import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { APP_PAIRING_SETTINGS_MESSAGE, type RoomState } from "@gatchi/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendHostCommand = vi.hoisted(() => vi.fn());
const sendSourceAction = vi.hoisted(() => vi.fn());
const addAlias = vi.hoisted(() => vi.fn());
const joinRoom = vi.hoisted(() => vi.fn());
const socketError = vi.hoisted(() => ({ value: null as string | null }));
const roomSocketState = vi.hoisted(() => ({ value: null as RoomState | null }));
const roomSocketParticipantId = vi.hoisted(() => ({ value: null as string | null }));

const hostState = vi.hoisted<() => RoomState>(() => () => ({
  roomCode: "ABC123",
  phase: "playing",
  settings: { title: "마추기 방", visibility: "public", submissionVisibility: "status-only", timerSeconds: null },
  participants: [{ id: "host", nickname: "방장", role: "host", connected: true, score: 0 }],
  quiz: {
    quizTitle: "마추기 아이오",
    questionIndex: null,
    totalQuestions: null,
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
    questionKey: null,
    requiredParticipantIds: [],
    submittedParticipantIds: [],
    allRequiredSubmitted: false,
    originalSubmitStatus: "idle",
    lockReason: null
  },
  sourceWindow: {
    status: "connected",
    url: "https://machugi.io/",
    title: "마추기 아이오",
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
}));

vi.mock("./api", () => ({
  createRoom: vi.fn(),
  fetchPublicRooms: vi.fn(async () => [])
}));

vi.mock("./socket/useRoomSocket", async () => ({
  ...(await vi.importActual<typeof import("./socket/useRoomSocket")>("./socket/useRoomSocket")),
  useRoomSocket: () => ({
    state: roomSocketState.value,
    participantId: roomSocketParticipantId.value,
    chatMessages: [],
    error: socketError.value,
    joinRoom,
    submitAnswer: vi.fn(),
    addAlias,
    sendChat: vi.fn(),
    sendHostCommand,
    sendSourceAction
  })
}));

import { App } from "./App";

describe("App host room", () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    sendHostCommand.mockClear();
    sendSourceAction.mockClear();
    addAlias.mockClear();
    joinRoom.mockClear();
    roomSocketState.value = hostState();
    roomSocketParticipantId.value = "host";
    socketError.value = null;
    localStorage.clear();
    window.history.replaceState(null, "", originalPath);
  });

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", originalPath);
    vi.restoreAllMocks();
  });

  it("shows the source mirror surface instead of the old host control panel", () => {
    render(<App />);

    expect(screen.getByText("원본 탭을 연결해 주세요")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "방장 컨트롤" })).not.toBeInTheDocument();
    expect(sendHostCommand).not.toHaveBeenCalled();
  });

  it("places host setup panels below the room surface", () => {
    const { container } = render(<App />);
    const room = screen.getByRole("region", { name: /방 ABC123/ });
    const hostWorkspace = screen.getByRole("region", { name: "방장 진행 화면" });

    expect([...container.querySelectorAll(".room-layout, .host-workspace")]).toEqual([room, hostWorkspace]);
  });

  it("shows source action errors while already inside a room", () => {
    socketError.value = "다음 버튼을 찾을 수 없습니다.";

    render(<App />);

    expect(screen.getByText("다음 버튼을 찾을 수 없습니다.")).toBeInTheDocument();
  });

  it("restores a stored room session from a room URL", () => {
    roomSocketState.value = null;
    roomSocketParticipantId.value = null;
    window.history.replaceState(null, "", "/rooms/abc123");
    localStorage.setItem("activeRoomCode", "ABC123");
    localStorage.setItem("activeNickname", "방장");
    localStorage.setItem("participantId", "host");
    localStorage.setItem("participantCode", "#H0ST");

    render(<App />);

    expect(joinRoom).toHaveBeenCalledWith({
      roomCode: "ABC123",
      nickname: "방장",
      participantId: "host",
      participantCode: "#H0ST"
    });
  });

  it("does not restore a stored session for a different room URL", () => {
    roomSocketState.value = null;
    roomSocketParticipantId.value = null;
    window.history.replaceState(null, "", "/rooms/abc123");
    localStorage.setItem("activeRoomCode", "ZZZ999");
    localStorage.setItem("activeNickname", "방장");
    localStorage.setItem("participantId", "host");
    localStorage.setItem("participantCode", "#H0ST");

    render(<App />);

    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("keeps the URL on the active room and returns to the lobby URL after leaving", async () => {
    window.history.replaceState(null, "", "/");
    const { rerender } = render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/rooms/ABC123"));

    roomSocketState.value = null;
    roomSocketParticipantId.value = null;
    rerender(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  it("resends extension pairing from a restored host room session", () => {
    localStorage.setItem("activeRoomCode", "ABC123");
    localStorage.setItem("activeNickname", "방장");
    localStorage.setItem("participantId", "host");
    localStorage.setItem("participantCode", "#H0ST");
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "확장 프로그램에 저장" }));

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: APP_PAIRING_SETTINGS_MESSAGE,
        payload: {
          serverUrl: window.location.origin,
          roomCode: "ABC123",
          hostCode: "#H0ST"
        }
      },
      window.location.origin
    );
  });
});
