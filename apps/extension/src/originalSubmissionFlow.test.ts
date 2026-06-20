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
  it("retries the host answer when the original site is still not graded after submission", async () => {
    const sendOriginalResult = vi.fn<(result: OriginalResultPayload) => void>();
    const sendOriginalFailure = vi.fn();
    const showLockNotice = vi.fn();
    const sendState = vi.fn();
    const delay = vi.fn(() => Promise.resolve());
    const submitOriginalAnswer = vi.fn(() => ({ ok: true as const, method: "text" as const }));
    const extractQuizState = vi
      .fn<() => QuizState>()
      .mockReturnValueOnce(playingQuiz)
      .mockReturnValueOnce(playingQuiz)
      .mockReturnValueOnce(resultQuiz);

    await reportOriginalResultWhenReady(payload, {
      delay,
      extractQuizState,
      sendState,
      submitOriginalAnswer,
      sendOriginalResult,
      sendOriginalFailure,
      showLockNotice,
      maxAttempts: 4,
      maxFollowupSubmissions: 2
    });

    expect(submitOriginalAnswer).toHaveBeenCalledWith("Choice A");
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
