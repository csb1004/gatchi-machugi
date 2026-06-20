import type { Participant, QuizState, SubmissionStatus } from "./models.js";

function hasValue(value: string | null): boolean {
  return value !== null && value !== "";
}

function hasStableQuestionIdentity(quiz: QuizState): boolean {
  return (
    quiz.questionIndex !== null ||
    hasValue(quiz.questionText) ||
    hasValue(quiz.imageUrl) ||
    hasValue(quiz.audioUrl) ||
    hasValue(quiz.videoUrl)
  );
}

function promptIdentityParts(quiz: QuizState): unknown[] {
  const hasPromptIdentity =
    hasValue(quiz.questionText) ||
    hasValue(quiz.imageUrl) ||
    hasValue(quiz.audioUrl) ||
    hasValue(quiz.videoUrl);

  return [
    quiz.quizTitle,
    quiz.questionIndex,
    quiz.totalQuestions,
    quiz.questionText,
    quiz.imageUrl,
    quiz.audioUrl,
    quiz.videoUrl,
    hasPromptIdentity ? null : quiz.choices.map((choice) => [choice.id, choice.label])
  ];
}

export function createQuestionKey(quiz: QuizState): string | null {
  const stableIdentity = hasStableQuestionIdentity(quiz);
  const hasActiveQuestionEvidence = stableIdentity || quiz.choices.length > 0;

  if (!hasActiveQuestionEvidence) {
    return null;
  }

  const visibleIdentity = stableIdentity ? [
    quiz.quizTitle,
    quiz.questionIndex,
    quiz.totalQuestions,
    quiz.questionText,
    quiz.imageUrl,
    quiz.audioUrl,
    quiz.videoUrl,
    null
  ] : promptIdentityParts(quiz);

  return JSON.stringify(visibleIdentity);
}

export function createOriginalResultCompatibilityKey(quiz: QuizState): string {
  if (quiz.questionIndex !== null) {
    return JSON.stringify([quiz.quizTitle, quiz.questionIndex, quiz.totalQuestions]);
  }

  return JSON.stringify(promptIdentityParts(quiz));
}

export function requiredParticipantIds(participants: Participant[]): string[] {
  return participants.filter((participant) => participant.connected).map((participant) => participant.id);
}

export function submittedParticipantIds(submissions: SubmissionStatus[]): string[] {
  return submissions
    .filter((submission) => submission.submitted || submission.skipped)
    .map((submission) => submission.participantId);
}

export function allRequiredSubmitted(requiredIds: string[], submissions: SubmissionStatus[]): boolean {
  const submitted = new Set(submittedParticipantIds(submissions));
  return requiredIds.length > 0 && requiredIds.every((participantId) => submitted.has(participantId));
}
