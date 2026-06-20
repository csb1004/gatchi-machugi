import type { OriginalResultPayload, OriginalSubmitAllowedPayload, QuizState } from "@gatchi/shared";
import { describe, expect, it, vi } from "vitest";
import { reportOriginalResultWhenReady } from "./originalSubmissionFlow";

const payload: OriginalSubmitAllowedPayload = {
  roomCode: "ABC123",
  questionKey: "q1",
  hostRawAnswer: "Choice A"
};

const playingQuiz: QuizState = {
  quizTitle: "Quiz",
  questionIndex: 1,
  totalQuestions: 10,
  questionType: "multiple-choice",
  questionText: "Pick one",
  imageUrl: null,
  audioUrl: null,
  videoUrl: null,
  choices: [{ id: "1", label: "Choice A" }],
  timerSecondsRemaining: null,
  canGoNext: false,
  canGoPrevious: false,
  resultMessage: null,
  answerCandidates: []
};

const resultQuiz: QuizState = {
  ...playingQuiz,
  choices: [],
  resultMessage: "정답!",
  answerCandidates: ["Choice A"],
  canGoNext: true
};

describe("reportOriginalResultWhenReady", () => {
  it("waits for the result without submitting the host answer into follow-up inputs again", async () => {
    const sendOriginalResult = vi.fn<(result: OriginalResultPayload) => void>();
    const sendOriginalFailure = vi.fn();
    const showLockNotice = vi.fn();
    const sendState = vi.fn();
    const delay = vi.fn(() => Promise.resolve());
    const extractQuizState = vi
      .fn<() => QuizState>()
      .mockReturnValueOnce(playingQuiz)
      .mockReturnValueOnce(playingQuiz)
      .mockReturnValueOnce(resultQuiz);

    await reportOriginalResultWhenReady(payload, {
      delay,
      extractQuizState,
      sendState,
      sendOriginalResult,
      sendOriginalFailure,
      showLockNotice,
      maxAttempts: 4
    });

    expect(sendOriginalResult).toHaveBeenCalledWith({
      roomCode: "ABC123",
      questionKey: "q1",
      quiz: resultQuiz
    });
    expect(sendOriginalFailure).not.toHaveBeenCalled();
    expect(showLockNotice).not.toHaveBeenCalled();
    expect(sendState).toHaveBeenCalledTimes(3);
  });
});
