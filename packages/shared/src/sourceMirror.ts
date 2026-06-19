import type { QuizState } from "./models.js";

export type SourceMirrorKind =
  | "disconnected"
  | "loading"
  | "home"
  | "searchResults"
  | "quizDetail"
  | "playing"
  | "result"
  | "gameEnd"
  | "unsupported"
  | "error";

export interface MirrorQuizResult {
  id: string;
  title: string;
  href: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  meta: string[];
}

export interface MirrorQuizSummary {
  title: string;
  href: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  meta: string[];
}

export interface MirrorQuizSettings {
  timerSeconds: number | null;
  questionCount: number | null;
  availableTimers: number[];
  availableQuestionCounts: number[];
}

export type SourceMirrorState =
  | {
      kind: "disconnected";
      url: string | null;
      title: string | null;
      lastSeenAt: string | null;
      message: string | null;
    }
  | {
      kind: "loading";
      url: string | null;
      title: string | null;
      lastSeenAt: string | null;
      action: SourceMirrorActionName | null;
      message: string | null;
    }
  | {
      kind: "home";
      url: string;
      title: string | null;
      lastSeenAt: string;
      query: string;
    }
  | {
      kind: "searchResults";
      url: string;
      title: string | null;
      lastSeenAt: string;
      query: string;
      results: MirrorQuizResult[];
    }
  | {
      kind: "quizDetail";
      url: string;
      title: string | null;
      lastSeenAt: string;
      quiz: MirrorQuizSummary;
      settings: MirrorQuizSettings;
    }
  | {
      kind: "playing";
      url: string;
      title: string | null;
      lastSeenAt: string;
      quiz: QuizState;
    }
  | {
      kind: "result";
      url: string;
      title: string | null;
      lastSeenAt: string;
      quiz: QuizState;
    }
  | {
      kind: "gameEnd";
      url: string;
      title: string | null;
      lastSeenAt: string;
      summaryText: string;
      percentileText: string | null;
      results: MirrorQuizResult[];
    }
  | {
      kind: "unsupported";
      url: string;
      title: string | null;
      lastSeenAt: string;
      reason: string;
    }
  | {
      kind: "error";
      url: string | null;
      title: string | null;
      lastSeenAt: string | null;
      message: string;
    };

export type SourceMirrorActionName =
  | "focusHome"
  | "search"
  | "selectResult"
  | "setTimer"
  | "setQuestionCount"
  | "startQuiz"
  | "loadMoreResults"
  | "next"
  | "previous"
  | "skip"
  | "refreshSource"
  | "focusOriginalTab";

export type SourceMirrorAction =
  | { name: "focusHome"; query?: string }
  | { name: "search"; query: string }
  | { name: "selectResult"; resultId: string; href?: string | null }
  | { name: "setTimer"; timerSeconds: number | null }
  | { name: "setQuestionCount"; questionCount: number | null }
  | { name: "startQuiz" }
  | { name: "loadMoreResults" }
  | { name: "next" }
  | { name: "previous" }
  | { name: "skip"; rawAnswer?: string }
  | { name: "refreshSource" }
  | { name: "focusOriginalTab" };

export interface SourceMirrorActionPayload {
  roomCode: string;
  actionId: string;
  action: SourceMirrorAction;
}

export interface SourceMirrorActionFailurePayload {
  roomCode: string;
  actionId: string;
  action: SourceMirrorAction;
  reason: string;
}

export function createDisconnectedSourceMirror(message: string | null): SourceMirrorState {
  return {
    kind: "disconnected",
    url: null,
    title: null,
    lastSeenAt: null,
    message
  };
}

export function isPlayableSourceMirror(state: SourceMirrorState): state is Extract<SourceMirrorState, { kind: "playing" | "result" }> {
  return state.kind === "playing" || state.kind === "result";
}

export function quizFromSourceMirror(state: SourceMirrorState): QuizState | null {
  return isPlayableSourceMirror(state) ? state.quiz : null;
}
