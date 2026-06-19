import { describe, expect, it } from "vitest";
import { allRequiredSubmitted, createQuestionKey, requiredParticipantIds, submittedParticipantIds } from "./fairPlay.js";
import type { Participant, QuizState, SubmissionStatus } from "./models.js";

const participants: Participant[] = [
  { id: "host", nickname: "Host", role: "host", connected: true, score: 0 },
  { id: "mina", nickname: "Mina", role: "player", connected: true, score: 0 },
  { id: "off", nickname: "Offline", role: "player", connected: false, score: 0 }
];

function createQuizState(overrides: Partial<QuizState> = {}): QuizState {
  return {
    quizTitle: null,
    questionIndex: null,
    totalQuestions: null,
    questionType: "unknown",
    questionText: null,
    imageUrl: null,
    audioUrl: null,
    videoUrl: null,
    choices: [],
    timerSecondsRemaining: null,
    canGoNext: false,
    canGoPrevious: false,
    resultMessage: null,
    answerCandidates: [],
    ...overrides
  };
}

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

  it("returns null for a default quiz state with no active question evidence", () => {
    expect(createQuestionKey(createQuizState())).toBeNull();
  });

  it("keeps distinct choice arrays distinct when choice text contains delimiters", () => {
    const first = createQuestionKey(
      createQuizState({
        questionIndex: 1,
        choices: [
          { id: "a", label: "b" },
          { id: "c", label: "d" }
        ]
      })
    );

    const second = createQuestionKey(
      createQuizState({
        questionIndex: 1,
        choices: [{ id: "a", label: "b|c:d" }]
      })
    );

    expect(first).not.toBe(second);
  });

  it("requires only connected participants and recognizes all submitted", () => {
    const required = requiredParticipantIds(participants);
    const statuses: SubmissionStatus[] = [
      { participantId: "host", submitted: true, skipped: false },
      { participantId: "mina", submitted: true, skipped: false }
    ];
    const statusesWithSkip: SubmissionStatus[] = [
      { participantId: "host", submitted: true, skipped: false },
      { participantId: "mina", submitted: false, skipped: true }
    ];

    expect(required).toEqual(["host", "mina"]);
    expect(submittedParticipantIds(statuses)).toEqual(["host", "mina"]);
    expect(submittedParticipantIds(statusesWithSkip)).toEqual(["host", "mina"]);
    expect(allRequiredSubmitted(required, statuses)).toBe(true);
    expect(allRequiredSubmitted(required, statusesWithSkip)).toBe(true);
    expect(allRequiredSubmitted(required, statuses.slice(0, 1))).toBe(false);
  });
});
