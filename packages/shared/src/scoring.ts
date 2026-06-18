import { normalizeAnswer } from "./normalize.js";

export interface ScoringSubmission {
  participantId: string;
  rawAnswer: string;
  skipped: boolean;
}

export interface ScoreSubmissionsInput {
  answerCandidates: string[];
  aliases: string[];
  submissions: ScoringSubmission[];
}

export interface ScoreSubmissionsResult {
  correctParticipantIds: string[];
  incorrectParticipantIds: string[];
  skippedParticipantIds: string[];
}

export function scoreSubmissions(input: ScoreSubmissionsInput): ScoreSubmissionsResult {
  const accepted = new Set([...input.answerCandidates, ...input.aliases].map(normalizeAnswer).filter(Boolean));
  const result: ScoreSubmissionsResult = {
    correctParticipantIds: [],
    incorrectParticipantIds: [],
    skippedParticipantIds: []
  };

  for (const submission of input.submissions) {
    if (submission.skipped) {
      result.skippedParticipantIds.push(submission.participantId);
      continue;
    }

    if (accepted.has(normalizeAnswer(submission.rawAnswer))) {
      result.correctParticipantIds.push(submission.participantId);
    } else {
      result.incorrectParticipantIds.push(submission.participantId);
    }
  }

  return result;
}
