import { describe, expect, it } from "vitest";
import {
  allRequiredSubmitted,
  createOriginalResultCompatibilityKey,
  createQuestionKey,
  requiredParticipantIds,
  submittedParticipantIds
} from "./fairPlay.js";
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

  it("keeps the same key when only the answer UI changes for the same visible question", () => {
    const first = createQuestionKey(
      createQuizState({
        quizTitle: "Pokemon",
        questionIndex: 3,
        totalQuestions: 10,
        questionType: "multiple-choice",
        questionText: "Who is this?",
        imageUrl: "https://example.com/pokemon.png",
        choices: [
          { id: "1", label: "Pikachu" },
          { id: "2", label: "Eevee" }
        ]
      })
    );

    const second = createQuestionKey(
      createQuizState({
        quizTitle: "Pokemon",
        questionIndex: 3,
        totalQuestions: 10,
        questionType: "free-text",
        questionText: "Who is this?",
        imageUrl: "https://example.com/pokemon.png",
        choices: []
      })
    );

    expect(first).toBe(second);
  });

  it("returns null for a default quiz state with no active question evidence", () => {
    expect(createQuestionKey(createQuizState())).toBeNull();
  });

  it("matches original result screens by question ordinal instead of answer UI shape", () => {
    const first = createOriginalResultCompatibilityKey(
      createQuizState({
        quizTitle: "Music",
        questionIndex: 4,
        totalQuestions: 10,
        questionType: "multiple-choice",
        audioUrl: "https://example.com/question-audio",
        choices: [
          { id: "1", label: "Song A" },
          { id: "2", label: "Song B" }
        ]
      })
    );

    const second = createOriginalResultCompatibilityKey(
      createQuizState({
        quizTitle: "Music",
        questionIndex: 4,
        totalQuestions: 10,
        questionType: "free-text",
        videoUrl: "https://example.com/result-video",
        choices: []
      })
    );

    expect(first).toBe(second);
  });

  it("matches original result screens without an exposed question ordinal by quiz title", () => {
    const first = createOriginalResultCompatibilityKey(
      createQuizState({
        quizTitle: "Bonggu OST",
        questionType: "audio",
        audioUrl: "https://www.youtube-nocookie.com/embed/question-audio"
      })
    );

    const second = createOriginalResultCompatibilityKey(
      createQuizState({
        quizTitle: "Bonggu OST",
        questionType: "audio",
        audioUrl: null,
        videoUrl: "https://www.youtube-nocookie.com/embed/result-video",
        resultMessage: "오답!",
        answerCandidates: ["경원"]
      })
    );

    expect(first).toBe(second);
  });

  it("falls back to choices when there is no stable visible prompt identity", () => {
    const first = createQuestionKey(
      createQuizState({
        choices: [
          { id: "a", label: "b" },
          { id: "c", label: "d" }
        ]
      })
    );

    const second = createQuestionKey(
      createQuizState({
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
