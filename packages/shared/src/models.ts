export type RoomVisibility = "public" | "private";
export type RoomPhase = "lobby" | "searching" | "ready" | "playing" | "revealed" | "ended" | "expired";
export type ParticipantRole = "host" | "player";
export type QuestionType = "unknown" | "text" | "image" | "audio" | "video" | "ox" | "multiple-choice" | "free-text";
export type SubmissionVisibility = "status-only" | "hidden";

export interface PublicRoomSummary {
  roomCode: string;
  title: string;
  quizTitle: string | null;
  participantCount: number;
  phase: RoomPhase;
  visibility: RoomVisibility;
}

export interface Participant {
  id: string;
  nickname: string;
  role: ParticipantRole;
  connected: boolean;
  score: number;
}

export interface QuizChoice {
  id: string;
  label: string;
}

export interface QuizState {
  quizTitle: string | null;
  questionIndex: number | null;
  totalQuestions: number | null;
  questionType: QuestionType;
  questionText: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  choices: QuizChoice[];
  timerSecondsRemaining: number | null;
  canGoNext: boolean;
  canGoPrevious: boolean;
  resultMessage: string | null;
  answerCandidates: string[];
}

export type SourceWindowStatus = "disconnected" | "connected" | "unsupported";

export interface SourceWindowState {
  status: SourceWindowStatus;
  url: string | null;
  title: string | null;
  lastSeenAt: string | null;
  message: string | null;
}

export interface RoomSettings {
  visibility: RoomVisibility;
  submissionVisibility: SubmissionVisibility;
  timerSeconds: number | null;
  title: string;
}

export interface SubmissionStatus {
  participantId: string;
  submitted: boolean;
  skipped: boolean;
}

export interface RevealedSubmission extends SubmissionStatus {
  rawAnswer: string;
  correct: boolean;
}

export type OriginalSubmitStatus = "idle" | "locked" | "ready" | "submitting" | "result-opened" | "unsupported";

export interface FairPlayState {
  questionKey: string | null;
  requiredParticipantIds: string[];
  submittedParticipantIds: string[];
  allRequiredSubmitted: boolean;
  originalSubmitStatus: OriginalSubmitStatus;
  lockReason: string | null;
}

export interface RoomState {
  roomCode: string;
  phase: RoomPhase;
  settings: RoomSettings;
  participants: Participant[];
  quiz: QuizState;
  submissions: SubmissionStatus[];
  revealedSubmissions: RevealedSubmission[];
  fairPlay: FairPlayState;
  sourceWindow: SourceWindowState;
  hostExtensionConnected: boolean;
  chatMessageCount: number;
}
