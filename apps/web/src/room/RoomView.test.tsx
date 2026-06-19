import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { RoomState } from "@gatchi/shared";
import { describe, expect, it } from "vitest";
import { RoomView } from "./RoomView";

const baseState: RoomState = {
  roomCode: "ABC123",
  phase: "playing",
  settings: { title: "마추기 방", visibility: "public", submissionVisibility: "status-only", timerSeconds: null },
  participants: [
    { id: "host", nickname: "Host", role: "host", connected: true, score: 0 },
    { id: "p1", nickname: "Mina", role: "player", connected: true, score: 0 }
  ],
  quiz: {
    quizTitle: "Pokemon",
    questionIndex: 1,
    totalQuestions: 10,
    questionType: "free-text",
    questionText: "Who is this?",
    imageUrl: null,
    audioUrl: null,
    videoUrl: null,
    choices: [],
    timerSecondsRemaining: null,
    canGoNext: true,
    canGoPrevious: false,
    resultMessage: null,
    answerCandidates: []
  },
  submissions: [{ participantId: "p1", submitted: true, skipped: false }],
  revealedSubmissions: [],
  fairPlay: {
    questionKey: "q1",
    requiredParticipantIds: ["host", "p1"],
    submittedParticipantIds: ["p1"],
    allRequiredSubmitted: false,
    originalSubmitStatus: "locked",
    lockReason: "모든 참가자가 제출해야 원본 정답 제출이 가능합니다."
  },
  sourceWindow: {
    status: "connected",
    url: "https://machugi.io/",
    title: "Machugi",
    lastSeenAt: "2026-06-19T00:00:00.000Z",
    message: null
  },
  hostExtensionConnected: true,
  chatMessageCount: 0
};

describe("RoomView", () => {
  it("shows submission status without raw answer before reveal", () => {
    render(<RoomView state={baseState} currentParticipantId="host" onSubmitAnswer={() => undefined} />);

    expect(screen.getByText("Mina 제출됨")).toBeInTheDocument();
    expect(screen.queryByText("rawAnswer")).not.toBeInTheDocument();
    expect(screen.queryByText("blue archive")).not.toBeInTheDocument();
  });
});
