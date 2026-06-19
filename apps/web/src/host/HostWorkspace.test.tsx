import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { RoomState } from "@gatchi/shared";
import { describe, expect, it, vi } from "vitest";
import { HostWorkspace } from "./HostWorkspace";

function state(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: "ABC123",
    phase: "playing",
    settings: { title: "마추기 방", visibility: "public", submissionVisibility: "status-only", timerSeconds: null },
    participants: [
      { id: "host", nickname: "상범", role: "host", connected: true, score: 0 },
      { id: "p1", nickname: "민아", role: "player", connected: true, score: 0 }
    ],
    quiz: {
      quizTitle: "테스트 퀴즈",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "free-text",
      questionText: "문제",
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
    submissions: [{ participantId: "host", submitted: true, skipped: false }],
    revealedSubmissions: [],
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
    chatMessageCount: 0,
    fairPlay: {
      questionKey: "q1",
      requiredParticipantIds: ["host", "p1"],
      submittedParticipantIds: ["host"],
      allRequiredSubmitted: false,
      originalSubmitStatus: "locked",
      lockReason: "모든 참가자가 제출해야 원본 정답 제출이 가능합니다."
    },
    ...overrides
  };
}

describe("HostWorkspace", () => {
  it("renders source-window status without embedding machugi", () => {
    render(
      <HostWorkspace
        state={state()}
        extensionReleaseUrl="https://github.com/csb1004/gatchi-machugi/releases"
        extensionSyncLabel="확장 프로그램 연결됨"
        onResendPairing={vi.fn()}
      />
    );

    expect(screen.queryByTitle(/마추기아이오 원본 화면/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /마추기아이오 열기/ })).toHaveAttribute("href", "https://machugi.io/");
    expect(screen.getAllByText("원본 창 연결됨").length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 2명 제출")).toBeInTheDocument();
    expect(screen.getByText("원본 제출 잠금")).toBeInTheDocument();
  });

  it("shows setup action when extension is disconnected", () => {
    render(
      <HostWorkspace
        state={state({ hostExtensionConnected: false })}
        extensionReleaseUrl="https://github.com/csb1004/gatchi-machugi/releases"
        extensionSyncLabel="확장 설치 후 다시 저장하세요"
        onResendPairing={vi.fn()}
      />
    );

    expect(screen.getByText("확장 프로그램 연결 필요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /확장 프로그램 다운로드/ })).toHaveAttribute(
      "href",
      "https://github.com/csb1004/gatchi-machugi/releases"
    );
  });
});
