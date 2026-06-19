import { describe, expect, it } from "vitest";
import { allRequiredSubmitted, createQuestionKey, requiredParticipantIds, submittedParticipantIds } from "./fairPlay.js";
import type { Participant, SubmissionStatus } from "./models.js";

const participants: Participant[] = [
  { id: "host", nickname: "Host", role: "host", connected: true, score: 0 },
  { id: "mina", nickname: "Mina", role: "player", connected: true, score: 0 },
  { id: "off", nickname: "Offline", role: "player", connected: false, score: 0 }
];

describe("fairPlay helpers", () => {
  it("creates a stable key from the visible question identity", () => {
    const first = createQuestionKey({
      quizTitle: "Quiz",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "image",
      questionText: null,
      imageUrl: "https://example.com/a.png",
      audioUrl: null,
      videoUrl: null,
      choices: [],
      timerSecondsRemaining: null,
      canGoNext: false,
      canGoPrevious: false,
      resultMessage: null,
      answerCandidates: []
    });

    const second = createQuestionKey({
      quizTitle: "Quiz",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "image",
      questionText: null,
      imageUrl: "https://example.com/a.png",
      audioUrl: null,
      videoUrl: null,
      choices: [],
      timerSecondsRemaining: 18,
      canGoNext: true,
      canGoPrevious: false,
      resultMessage: "wrong",
      answerCandidates: ["answer"]
    });

    expect(first).toBe(second);
  });

  it("requires only connected participants and recognizes all submitted", () => {
    const required = requiredParticipantIds(participants);
    const statuses: SubmissionStatus[] = [
      { participantId: "host", submitted: true, skipped: false },
      { participantId: "mina", submitted: true, skipped: false }
    ];

    expect(required).toEqual(["host", "mina"]);
    expect(submittedParticipantIds(statuses)).toEqual(["host", "mina"]);
    expect(allRequiredSubmitted(required, statuses)).toBe(true);
    expect(allRequiredSubmitted(required, statuses.slice(0, 1))).toBe(false);
  });
});
