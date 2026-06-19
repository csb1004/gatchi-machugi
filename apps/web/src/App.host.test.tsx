import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RoomState } from "@gatchi/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendHostCommand = vi.hoisted(() => vi.fn());

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
  hostExtensionConnected: true,
  chatMessageCount: 0
}));

vi.mock("./api", () => ({
  createRoom: vi.fn(),
  fetchPublicRooms: vi.fn(async () => [])
}));

vi.mock("./socket/useRoomSocket", () => ({
  useRoomSocket: () => ({
    state: hostState(),
    participantId: "host",
    chatMessages: [],
    error: null,
    joinRoom: vi.fn(),
    submitAnswer: vi.fn(),
    sendChat: vi.fn(),
    sendHostCommand
  })
}));

import { App } from "./App";

describe("App host room", () => {
  beforeEach(() => {
    sendHostCommand.mockClear();
  });

  it("shows host controls and sends search commands to the source window", () => {
    render(<App />);

    expect(screen.getByRole("region", { name: "방장 컨트롤" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /검색 화면/ })).toBeEnabled();
    expect(screen.getByText("원본 창에서 검색하거나 문제를 선택해 주세요.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /검색 화면/ }));

    expect(sendHostCommand).toHaveBeenCalledWith("configure");
  });
});
