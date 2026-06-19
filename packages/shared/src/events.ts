import type {
  PublicRoomSummary,
  QuestionType,
  QuizState,
  RevealedSubmission,
  RoomSettings,
  RoomState,
  SourceWindowState
} from "./models.js";
import type {
  SourceMirrorActionFailurePayload,
  SourceMirrorActionPayload,
  SourceMirrorState
} from "./sourceMirror.js";

export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "room:public-list": (rooms: PublicRoomSummary[]) => void;
  "host:connected": () => void;
  "host:disconnected": () => void;
  "quiz:search-results": (results: QuizSearchResult[]) => void;
  "extension:error": (error: ExtensionErrorPayload) => void;
  "answer:revealed": (submissions: RevealedSubmission[]) => void;
  "chat:message": (message: ChatMessagePayload) => void;
  "chat:system": (message: SystemMessagePayload) => void;
  "quiz:command": (payload: QuizCommandPayload) => void;
  "source:action": (payload: SourceMirrorActionPayload) => void;
  "source:action-failure": (payload: SourceMirrorActionFailurePayload) => void;
  "original:submit-allowed": (payload: OriginalSubmitAllowedPayload) => void;
}

export interface ClientToServerEvents {
  "room:join": (payload: JoinRoomPayload, ack: Ack<JoinRoomAck>) => void;
  "host:pair": (payload: HostPairPayload, ack: Ack<HostPairAck>) => void;
  "quiz:search": (payload: QuizSearchPayload, ack: Ack<void>) => void;
  "quiz:select": (payload: QuizSelectPayload, ack: Ack<void>) => void;
  "quiz:command": (payload: QuizCommandPayload, ack: Ack<void>) => void;
  "extension:state": (payload: ExtensionStatePayload, ack: Ack<void>) => void;
  "extension:source": (payload: ExtensionSourcePayload, ack: Ack<void>) => void;
  "source:action": (payload: SourceMirrorActionPayload, ack: Ack<void>) => void;
  "source:mirror": (payload: SourceMirrorPayload, ack: Ack<void>) => void;
  "source:action-failure": (payload: SourceMirrorActionFailurePayload, ack: Ack<void>) => void;
  "answer:submit": (payload: SubmitAnswerPayload, ack: Ack<void>) => void;
  "answer:reveal": (payload: RevealAnswerPayload, ack: Ack<void>) => void;
  "answer:add-alias": (payload: AddAliasPayload, ack: Ack<void>) => void;
  "original:request-submit": (payload: OriginalSubmitRequestPayload, ack: Ack<void>) => void;
  "original:result": (payload: OriginalResultPayload, ack: Ack<void>) => void;
  "original:failure": (payload: OriginalFailurePayload, ack: Ack<void>) => void;
  "score:adjust": (payload: AdjustScorePayload, ack: Ack<void>) => void;
  "chat:send": (payload: SendChatPayload, ack: Ack<void>) => void;
  "room:update-settings": (payload: UpdateSettingsPayload, ack: Ack<void>) => void;
  "participant:kick": (payload: KickParticipantPayload, ack: Ack<void>) => void;
}

export type Ack<T> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface JoinRoomPayload {
  roomCode: string;
  nickname: string;
  participantId?: string;
  participantCode?: string;
}

export interface JoinRoomAck {
  participantId: string;
  participantCode: string;
  state: RoomState;
}

export interface HostPairPayload {
  roomCode: string;
  hostCode: string;
}

export interface HostPairAck {
  roomCode: string;
}

export interface QuizSearchPayload {
  roomCode: string;
  query: string;
}

export interface QuizSearchResult {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  description: string | null;
  problemCount: number | null;
}

export interface QuizSelectPayload {
  roomCode: string;
  quizIdOrUrl: string;
}

export type QuizCommandName = "configure" | "start" | "next" | "previous" | "skip" | "reset" | "reveal-original-answer";

export interface QuizCommandPayload {
  roomCode: string;
  command: QuizCommandName;
  values?: Record<string, string | number | boolean | null>;
}

export interface ExtensionStatePayload {
  roomCode: string;
  quiz: QuizState;
}

export interface ExtensionSourcePayload {
  roomCode: string;
  sourceWindow: SourceWindowState;
}

export interface SourceMirrorPayload {
  roomCode: string;
  sourceMirror: SourceMirrorState;
}

export interface OriginalSubmitAllowedPayload {
  roomCode: string;
  questionKey: string;
  hostRawAnswer: string;
}

export interface OriginalSubmitRequestPayload {
  roomCode: string;
  questionKey: string;
}

export interface OriginalResultPayload {
  roomCode: string;
  questionKey: string;
  quiz: QuizState;
}

export interface OriginalFailurePayload {
  roomCode: string;
  questionKey: string;
  reason: string;
}

export interface ExtensionErrorPayload {
  roomCode: string;
  stage: "search" | "select" | "command" | "extract";
  message: string;
}

export interface SubmitAnswerPayload {
  roomCode: string;
  participantId: string;
  rawAnswer: string;
}

export interface RevealAnswerPayload {
  roomCode: string;
  skippedParticipantIds: string[];
}

export interface AddAliasPayload {
  roomCode: string;
  alias: string;
}

export interface AdjustScorePayload {
  roomCode: string;
  participantId: string;
  delta: number;
  reason: string;
}

export interface SendChatPayload {
  roomCode: string;
  participantId: string;
  text: string;
}

export interface ChatMessagePayload {
  id: string;
  roomCode: string;
  participantId: string;
  nickname: string;
  text: string;
  createdAt: string;
}

export interface SystemMessagePayload {
  id: string;
  roomCode: string;
  text: string;
  createdAt: string;
}

export interface UpdateSettingsPayload {
  roomCode: string;
  settings: Partial<RoomSettings> & { forcedQuestionType?: QuestionType };
}

export interface KickParticipantPayload {
  roomCode: string;
  participantId: string;
}
