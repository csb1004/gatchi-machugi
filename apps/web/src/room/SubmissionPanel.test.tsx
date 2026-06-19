import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RoomState } from "@gatchi/shared";
import { SubmissionPanel } from "./SubmissionPanel";

const state: RoomState = {
  roomCode: "ABC123",
  phase: "playing",
  settings: { title: "Room", visibility: "public", submissionVisibility: "status-only", timerSeconds: null },
  participants: [
    { id: "host", nickname: "Host", role: "host", connected: true, score: 0 },
    { id: "p1", nickname: "Mina", role: "player", connected: false, score: 0 }
  ],
  quiz: {
    quizTitle: "Quiz",
    questionIndex: 1,
    totalQuestions: 10,
    questionType: "free-text",
    questionText: "Who is this?",
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
  fairPlay: {
    questionKey: "q1",
    requiredParticipantIds: ["host"],
    submittedParticipantIds: ["host"],
    allRequiredSubmitted: true,
    originalSubmitStatus: "ready",
    lockReason: null
  },
  sourceWindow: { status: "connected", url: null, title: null, lastSeenAt: null, message: null },
  sourceMirror: { kind: "disconnected", url: null, title: null, lastSeenAt: null, message: null },
  hostExtensionConnected: true,
  chatMessageCount: 0
};

describe("SubmissionPanel", () => {
  it("marks disconnected participants separately from pending participants", () => {
    render(<SubmissionPanel state={state} />);

    expect(screen.getByText("Host 제출함")).toBeInTheDocument();
    expect(screen.getByText("Mina 접속 끊김")).toBeInTheDocument();
  });
});
