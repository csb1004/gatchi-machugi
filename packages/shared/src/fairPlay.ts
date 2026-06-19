import type { Participant, QuizState, SubmissionStatus } from "./models.js";

export function createQuestionKey(quiz: QuizState): string | null {
  const visibleIdentity = [
    quiz.quizTitle,
    quiz.questionIndex,
    quiz.totalQuestions,
    quiz.questionType,
    quiz.questionText,
    quiz.imageUrl,
    quiz.audioUrl,
    quiz.videoUrl,
    quiz.choices.map((choice) => `${choice.id}:${choice.label}`).join("|")
  ];

  if (visibleIdentity.every((value) => value === null || value === "")) {
    return null;
  }

  return JSON.stringify(visibleIdentity);
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
