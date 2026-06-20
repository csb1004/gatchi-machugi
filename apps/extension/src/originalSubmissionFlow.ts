import type { OriginalFailurePayload, OriginalResultPayload, OriginalSubmitAllowedPayload, QuizState } from "@gatchi/shared";

export interface OriginalResultReporterOptions {
  delay: (ms: number) => Promise<void>;
  extractQuizState: () => QuizState;
  sendState: () => void;
  sendOriginalResult: (payload: OriginalResultPayload) => void;
  sendOriginalFailure: (payload: OriginalFailurePayload) => void;
  showLockNotice: (message: string) => void;
  maxAttempts?: number;
}

function hasOriginalResult(quiz: QuizState): boolean {
  return quiz.resultMessage !== null || quiz.answerCandidates.length > 0;
}

export async function reportOriginalResultWhenReady(
  payload: OriginalSubmitAllowedPayload,
  options: OriginalResultReporterOptions
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 24;

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
  }

  const reason = "원본 결과를 아직 읽지 못했습니다. 다시 시도해주세요.";
  options.sendOriginalFailure({
    roomCode: payload.roomCode,
    questionKey: payload.questionKey,
    reason
  });
  options.showLockNotice(reason);
}
