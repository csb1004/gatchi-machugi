import type { OriginalFailurePayload, OriginalResultPayload, OriginalSubmitAllowedPayload, QuizState } from "@gatchi/shared";
import type { OriginalAnswerSubmitResult } from "./machugi/commands";

export interface OriginalResultReporterOptions {
  delay: (ms: number) => Promise<void>;
  extractQuizState: () => QuizState;
  sendState: () => void;
  submitOriginalAnswer: (rawAnswer: string) => OriginalAnswerSubmitResult;
  sendOriginalResult: (payload: OriginalResultPayload) => void;
  sendOriginalFailure: (payload: OriginalFailurePayload) => void;
  showLockNotice: (message: string) => void;
  maxAttempts?: number;
  maxFollowupSubmissions?: number;
}

function hasOriginalResult(quiz: QuizState): boolean {
  return quiz.resultMessage !== null || quiz.answerCandidates.length > 0;
}

export async function reportOriginalResultWhenReady(
  payload: OriginalSubmitAllowedPayload,
  options: OriginalResultReporterOptions
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 24;
  const maxFollowupSubmissions = options.maxFollowupSubmissions ?? 5;
  let followupSubmissions = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await options.delay(attempt === 0 ? 350 : 250);
    const quiz = options.extractQuizState();
    options.sendState();

    if (hasOriginalResult(quiz)) {
      options.sendOriginalResult({
        roomCode: payload.roomCode,
        questionKey: payload.questionKey,
        quiz
      });
      return;
    }

    if (attempt > 0 && followupSubmissions < maxFollowupSubmissions) {
      const retry = options.submitOriginalAnswer(payload.hostRawAnswer);
      if (retry.ok) {
        followupSubmissions += 1;
      }
    }
  }

  const reason = "원본 결과를 아직 읽지 못했습니다. 다시 시도해주세요.";
  options.sendOriginalFailure({
    roomCode: payload.roomCode,
    questionKey: payload.questionKey,
    reason
  });
  options.showLockNotice(reason);
}
