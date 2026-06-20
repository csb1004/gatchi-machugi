import {
  allRequiredSubmitted,
  createOriginalResultCompatibilityKey,
  createQuestionKey,
  normalizeAnswer,
  requiredParticipantIds,
  scoreSubmissions,
  submittedParticipantIds,
  type ChatMessagePayload,
  type OriginalSubmitAllowedPayload,
  type Participant,
  type QuizState,
  type RevealedSubmission,
  type RoomSettings,
  type RoomState,
  type RoomVisibility,
  type SourceMirrorState,
  type SourceWindowState,
  createDisconnectedSourceMirror,
  quizFromSourceMirror
} from "@gatchi/shared";
import { customAlphabet, nanoid } from "nanoid";

const createRoomCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);
const createParticipantCodeValue = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 4);
const originalSubmissionLockReason = "모든 참가자가 제출해야 원본 정답 제출이 가능합니다.";

function hasOriginalResult(quiz: QuizState): boolean {
  return quiz.resultMessage !== null || quiz.answerCandidates.length > 0;
}

function isCorrectOriginalResult(quiz: QuizState): boolean {
  const message = normalizeAnswer(quiz.resultMessage ?? "");
  return message.includes("정답") || message.includes("correct");
}

interface StoredRoom {
  hostParticipantId: string;
  participantCodes: Map<string, string>;
  state: RoomState;
  aliases: string[];
  rawSubmissions: Map<string, { rawAnswer: string; skipped: boolean }>;
  chatMessages: ChatMessagePayload[];
  expiresAt: Date;
}

export interface CreateRoomInput {
  title: string;
  hostNickname: string;
  visibility: RoomVisibility;
}

export interface CreateRoomResult {
  roomCode: string;
  hostParticipantId: string;
  hostCode: string;
  state: RoomState;
}

export class RoomService {
  private rooms = new Map<string, StoredRoom>();

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    const roomCode = this.uniqueRoomCode();
    const state = this.emptyState(roomCode, input);
    const participantCodes = new Map<string, string>();
    const hostParticipant: Participant = {
      id: nanoid(12),
      nickname: this.uniqueNickname([], input.hostNickname.trim() || "Host"),
      role: "host",
      connected: true,
      score: 0
    };
    const hostCode = this.uniqueParticipantCode(participantCodes);
    participantCodes.set(hostParticipant.id, hostCode);
    state.participants.push(hostParticipant);

    this.rooms.set(roomCode, {
      hostParticipantId: hostParticipant.id,
      participantCodes,
      state,
      aliases: [],
      rawSubmissions: new Map(),
      chatMessages: [],
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    return { roomCode, hostParticipantId: hostParticipant.id, hostCode, state };
  }

  joinParticipant(input: {
    roomCode: string;
    nickname: string;
    participantId?: string;
    participantCode?: string;
  }): { participant: Participant; participantCode: string; state: RoomState } {
    const room = this.requireRoom(input.roomCode);
    const existing = input.participantId ? room.state.participants.find((participant) => participant.id === input.participantId) : undefined;

    if (existing) {
      const participantCode = this.requireParticipantCode(room, existing.id);
      if (existing.role === "host" || input.participantCode) {
        this.requireMatchingParticipantCode(room, existing.id, input.participantCode);
      }
      existing.connected = true;
      this.refreshFairPlayRequiredParticipants(room);
      return { participant: existing, participantCode, state: room.state };
    }

    const participant: Participant = {
      id: input.participantId ?? nanoid(12),
      nickname: this.uniqueNickname(room.state.participants, input.nickname.trim() || "Player"),
      role: "player",
      connected: true,
      score: 0
    };

    const participantCode = this.uniqueParticipantCode(room.participantCodes);
    room.participantCodes.set(participant.id, participantCode);
    room.state.participants.push(participant);
    this.refreshFairPlayRequiredParticipants(room);
    return { participant, participantCode, state: room.state };
  }

  joinHostPlayer(input: { roomCode: string; nickname: string }): { participant: Participant; participantCode: string; state: RoomState } {
    const room = this.requireRoom(input.roomCode);
    const existing = room.state.participants.find((participant) => participant.role === "host");

    if (existing) {
      existing.connected = true;
      this.refreshFairPlayRequiredParticipants(room);
      return { participant: existing, participantCode: this.requireParticipantCode(room, existing.id), state: room.state };
    }

    const participant: Participant = {
      id: nanoid(12),
      nickname: this.uniqueNickname(room.state.participants, input.nickname.trim() || "Host"),
      role: "host",
      connected: true,
      score: 0
    };

    const participantCode = this.uniqueParticipantCode(room.participantCodes);
    room.hostParticipantId = participant.id;
    room.participantCodes.set(participant.id, participantCode);
    room.state.participants.push(participant);
    this.refreshFairPlayRequiredParticipants(room);
    return { participant, participantCode, state: room.state };
  }

  verifyHost(input: { roomCode: string; hostCode: string }): boolean {
    const room = this.rooms.get(input.roomCode);
    if (!room) return false;
    return this.normalizeParticipantCode(input.hostCode) === this.requireParticipantCode(room, room.hostParticipantId);
  }

  joinHostExtension(input: { roomCode: string; hostCode: string }): { participant: Participant; state: RoomState } {
    const room = this.requireRoom(input.roomCode);
    this.requireMatchingParticipantCode(room, room.hostParticipantId, input.hostCode);
    const participant = this.requireParticipant(room, room.hostParticipantId);
    participant.connected = true;
    room.state.hostExtensionConnected = true;
    this.refreshFairPlayRequiredParticipants(room);
    return { participant, state: room.state };
  }

  getState(roomCode: string): RoomState {
    return this.requireRoom(roomCode).state;
  }

  updateQuizState(input: { roomCode: string; quiz: QuizState }): RoomState {
    const room = this.requireRoom(input.roomCode);

    if (
      room.state.fairPlay.originalSubmitStatus === "submitting" &&
      room.state.fairPlay.questionKey &&
      this.matchesCurrentOriginalResult(room, input.quiz)
    ) {
      if (hasOriginalResult(input.quiz)) {
        return this.applyOriginalResult({
          roomCode: input.roomCode,
          questionKey: room.state.fairPlay.questionKey,
          quiz: input.quiz
        });
      }

      return room.state;
    }

    const previousQuiz = room.state.quiz;
    const shouldResetRound = this.shouldResetRound(previousQuiz, input.quiz);
    const quiz = shouldResetRound ? input.quiz : this.quizForContinuingRound(previousQuiz, input.quiz);

    room.state.quiz = quiz;

    if (shouldResetRound) {
      this.resetRound(room);
      room.state.phase = "playing";
    }

    return room.state;
  }

  updateSourceWindow(input: { roomCode: string; sourceWindow: SourceWindowState }): RoomState {
    const room = this.requireRoom(input.roomCode);
    room.state.sourceWindow = input.sourceWindow;
    return room.state;
  }

  updateSourceMirror(input: { roomCode: string; sourceMirror: SourceMirrorState }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const rawQuiz = quizFromSourceMirror(input.sourceMirror);
    const playableSourceMirror =
      input.sourceMirror.kind === "playing" || input.sourceMirror.kind === "result" ? input.sourceMirror : null;

    if (
      rawQuiz &&
      playableSourceMirror &&
      room.state.fairPlay.originalSubmitStatus === "submitting" &&
      room.state.fairPlay.questionKey &&
      this.matchesCurrentOriginalResult(room, rawQuiz)
    ) {
      if (hasOriginalResult(rawQuiz)) {
        const state = this.applyOriginalResult({
          roomCode: input.roomCode,
          questionKey: room.state.fairPlay.questionKey,
          quiz: rawQuiz
        });
        state.sourceMirror = {
          kind: "result",
          url: playableSourceMirror.url,
          title: playableSourceMirror.title,
          lastSeenAt: playableSourceMirror.lastSeenAt,
          quiz: rawQuiz
        };
        return state;
      }

      room.state.sourceMirror = {
        kind: "loading",
        url: playableSourceMirror.url,
        title: playableSourceMirror.title,
        lastSeenAt: playableSourceMirror.lastSeenAt,
        action: null,
        message: "정답 화면을 읽는 중입니다."
      };
      return room.state;
    }

    const sourceMirror = this.publicSourceMirror(room, input.sourceMirror);
    room.state.sourceMirror = sourceMirror;

    const quiz = quizFromSourceMirror(sourceMirror);
    if (quiz && sourceMirror.kind === "playing") {
      const state = this.updateQuizState({
        roomCode: input.roomCode,
        quiz
      });
      if (state.sourceMirror.kind === "playing") {
        state.sourceMirror = { ...state.sourceMirror, quiz: state.quiz };
      }
      return state;
    }

    if (quiz && sourceMirror.kind === "result" && room.state.fairPlay.originalSubmitStatus === "result-opened") {
      room.state.quiz = quiz;
      return room.state;
    }

    if (sourceMirror.kind === "home" || sourceMirror.kind === "searchResults" || sourceMirror.kind === "quizDetail") {
      room.state.phase = "searching";
    }

    if (sourceMirror.kind === "gameEnd") {
      room.state.phase = "ended";
    }

    return room.state;
  }

  submitAnswer(input: { roomCode: string; participantId: string; rawAnswer: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    if (room.state.phase === "revealed" || room.state.phase === "ended" || room.state.phase === "expired") {
      throw new Error("Submissions are closed for this question");
    }
    if (room.state.fairPlay.originalSubmitStatus === "submitting") {
      throw new Error("Submissions are locked for original submission");
    }

    this.requireParticipant(room, input.participantId);

    room.rawSubmissions.set(input.participantId, {
      rawAnswer: input.rawAnswer,
      skipped: false
    });
    room.state.submissions = this.publicSubmissionStatuses(room);
    this.refreshFairPlaySubmissionState(room);

    return room.state;
  }

  requestOriginalSubmission(input: { roomCode: string; questionKey: string }): OriginalSubmitAllowedPayload {
    const room = this.requireRoom(input.roomCode);

    if (!room.state.fairPlay.questionKey || input.questionKey !== room.state.fairPlay.questionKey) {
      throw new Error("Question changed before original submission");
    }

    if (room.state.fairPlay.originalSubmitStatus !== "ready") {
      throw new Error("Original submission is still locked");
    }

    const hostSubmission = room.rawSubmissions.get(room.hostParticipantId);
    if (!hostSubmission || hostSubmission.skipped) {
      throw new Error("Host answer is required before original submission");
    }

    room.state.fairPlay.originalSubmitStatus = "submitting";

    return {
      roomCode: input.roomCode,
      questionKey: input.questionKey,
      hostRawAnswer: hostSubmission.rawAnswer
    };
  }

  requestSkippedOriginalSubmission(input: { roomCode: string; questionKey: string }): OriginalSubmitAllowedPayload {
    const room = this.requireRoom(input.roomCode);

    if (!room.state.fairPlay.questionKey || input.questionKey !== room.state.fairPlay.questionKey) {
      throw new Error("Question changed before original submission");
    }

    if (room.state.fairPlay.originalSubmitStatus === "submitting") {
      throw new Error("Original submission has already started");
    }

    if (room.state.fairPlay.originalSubmitStatus === "result-opened") {
      throw new Error("Original result is already opened");
    }

    const hostRawAnswer = this.ensureHostSkipSubmission(room);
    this.skipMissingRequiredParticipants(room);
    room.state.submissions = this.publicSubmissionStatuses(room);
    room.state.fairPlay.submittedParticipantIds = submittedParticipantIds(room.state.submissions);
    room.state.fairPlay.allRequiredSubmitted = allRequiredSubmitted(room.state.fairPlay.requiredParticipantIds, room.state.submissions);
    room.state.fairPlay.originalSubmitStatus = "submitting";
    room.state.fairPlay.lockReason = null;

    return {
      roomCode: input.roomCode,
      questionKey: input.questionKey,
      hostRawAnswer
    };
  }

  applyOriginalResult(input: { roomCode: string; questionKey: string; quiz: QuizState }): RoomState {
    const room = this.requireRoom(input.roomCode);

    if (!room.state.fairPlay.questionKey || input.questionKey !== room.state.fairPlay.questionKey) {
      throw new Error("Question changed before original result");
    }

    if (room.state.fairPlay.originalSubmitStatus !== "submitting") {
      throw new Error("Original submission has not been authorized");
    }

    if (!this.matchesCurrentOriginalResult(room, input.quiz)) {
      throw new Error("Original result does not match current question");
    }

    this.requireRevealReady(room, []);

    room.state.quiz = input.quiz;
    room.state.fairPlay.originalSubmitStatus = "result-opened";
    room.state.fairPlay.lockReason = null;
    this.addHostSubmissionAliasIfAccepted(room, input.quiz);

    return this.revealAnswers({ roomCode: input.roomCode, skippedParticipantIds: [] });
  }

  failOriginalSubmission(input: { roomCode: string; questionKey: string; reason: string }): RoomState {
    const room = this.requireRoom(input.roomCode);

    if (!room.state.fairPlay.questionKey || input.questionKey !== room.state.fairPlay.questionKey) {
      throw new Error("Question changed before original submission failure");
    }

    if (room.state.fairPlay.originalSubmitStatus !== "submitting") {
      throw new Error("Original submission has not been authorized");
    }

    const submittedIds = submittedParticipantIds(room.state.submissions);
    const complete = allRequiredSubmitted(room.state.fairPlay.requiredParticipantIds, room.state.submissions);
    room.state.fairPlay.submittedParticipantIds = submittedIds;
    room.state.fairPlay.allRequiredSubmitted = complete;
    room.state.fairPlay.originalSubmitStatus = complete ? "ready" : "locked";
    room.state.fairPlay.lockReason = complete ? input.reason : originalSubmissionLockReason;
    return room.state;
  }

  revealAnswers(input: { roomCode: string; skippedParticipantIds: string[] }): RoomState {
    const room = this.requireRoom(input.roomCode);

    for (const participantId of input.skippedParticipantIds) {
      this.requireParticipant(room, participantId);
      if (!room.rawSubmissions.has(participantId)) {
        room.rawSubmissions.set(participantId, { rawAnswer: "", skipped: true });
      }
    }

    this.requireRevealReady(room, input.skippedParticipantIds);

    const previousCorrect = this.correctParticipantIds(room.state.revealedSubmissions);
    const nextRevealedSubmissions = this.revealedSubmissions(room);

    room.state.phase = "revealed";
    room.state.submissions = this.publicSubmissionStatuses(room);
    room.state.revealedSubmissions = nextRevealedSubmissions;
    this.applyRevealScoreDiff(room.state.participants, previousCorrect, this.correctParticipantIds(nextRevealedSubmissions));

    return room.state;
  }

  addAlias(input: { roomCode: string; alias: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const alias = input.alias.trim();

    if (!alias) {
      return room.state;
    }

    room.aliases.push(alias);

    if (room.state.phase === "revealed") {
      const previousCorrect = this.correctParticipantIds(room.state.revealedSubmissions);
      const nextRevealedSubmissions = this.revealedSubmissions(room);

      room.state.revealedSubmissions = nextRevealedSubmissions;
      this.applyRevealScoreDiff(room.state.participants, previousCorrect, this.correctParticipantIds(nextRevealedSubmissions));
    }

    return room.state;
  }

  addChatMessage(input: { roomCode: string; participantId: string; text: string }): ChatMessagePayload {
    const room = this.requireRoom(input.roomCode);
    const participant = this.requireParticipant(room, input.participantId);
    const text = input.text.trim();

    if (!text) {
      throw new Error("Chat message is empty");
    }

    const message: ChatMessagePayload = {
      id: nanoid(12),
      roomCode: input.roomCode,
      participantId: input.participantId,
      nickname: participant.nickname,
      text,
      createdAt: new Date().toISOString()
    };

    room.chatMessages.push(message);
    room.state.chatMessageCount = room.chatMessages.length;
    return message;
  }

  adjustScore(input: { roomCode: string; participantId: string; delta: number; reason: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const participant = this.requireParticipant(room, input.participantId);
    participant.score = Math.max(0, participant.score + input.delta);
    return room.state;
  }

  updateSettings(input: { roomCode: string; settings: Partial<RoomSettings> }): RoomState {
    const room = this.requireRoom(input.roomCode);
    room.state.settings = { ...room.state.settings, ...input.settings };
    return room.state;
  }

  kickParticipant(input: { roomCode: string; participantId: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const participant = this.requireParticipant(room, input.participantId);
    participant.connected = false;
    this.refreshFairPlayRequiredParticipants(room);
    return room.state;
  }

  disconnectParticipant(input: { roomCode: string; participantId: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const participant = this.requireParticipant(room, input.participantId);
    participant.connected = false;
    this.refreshFairPlayRequiredParticipants(room);
    return room.state;
  }

  expireRoom(roomCode: string): RoomState {
    const room = this.requireRoom(roomCode);
    room.state.phase = "expired";
    room.rawSubmissions.clear();
    room.state.submissions = [];
    room.state.revealedSubmissions = [];
    return room.state;
  }

  listPublicRooms() {
    return [...this.rooms.values()]
      .filter((room) => room.state.settings.visibility === "public" && room.state.phase !== "expired")
      .map((room) => ({
        roomCode: room.state.roomCode,
        title: room.state.settings.title,
        quizTitle: room.state.quiz.quizTitle,
        participantCount: room.state.participants.filter((participant) => participant.connected).length,
        phase: room.state.phase,
        visibility: room.state.settings.visibility
      }));
  }

  private requireRoom(roomCode: string): StoredRoom {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error("Room not found");
    return room;
  }

  private uniqueRoomCode(): string {
    let code = createRoomCode();
    while (this.rooms.has(code)) code = createRoomCode();
    return code;
  }

  private uniqueParticipantCode(participantCodes: Map<string, string>): string {
    const existing = new Set(participantCodes.values());
    let code = this.normalizeParticipantCode(createParticipantCodeValue());
    while (existing.has(code)) code = this.normalizeParticipantCode(createParticipantCodeValue());
    return code;
  }

  private normalizeParticipantCode(code: string): string {
    const normalized = code.trim().toUpperCase();
    return normalized.startsWith("#") ? normalized : `#${normalized}`;
  }

  private requireParticipantCode(room: StoredRoom, participantId: string): string {
    const participantCode = room.participantCodes.get(participantId);
    if (!participantCode) throw new Error("Participant code missing");
    return participantCode;
  }

  private requireMatchingParticipantCode(room: StoredRoom, participantId: string, participantCode: string | undefined): void {
    if (!participantCode) throw new Error("Participant code required");
    if (this.normalizeParticipantCode(participantCode) !== this.requireParticipantCode(room, participantId)) {
      throw new Error("Invalid participant code");
    }
  }

  private uniqueNickname(participants: Participant[], requested: string): string {
    const existing = new Set(participants.map((participant) => participant.nickname));
    if (!existing.has(requested)) return requested;

    let suffix = 2;
    while (existing.has(`${requested}#${suffix}`)) suffix += 1;
    return `${requested}#${suffix}`;
  }

  private requireParticipant(room: StoredRoom, participantId: string): Participant {
    const participant = room.state.participants.find((entry) => entry.id === participantId);
    if (!participant) throw new Error("Participant not found");
    return participant;
  }

  private shouldResetRound(previousQuiz: QuizState, nextQuiz: QuizState): boolean {
    if (this.isSameNoOrdinalQuestionUpdate(previousQuiz, nextQuiz)) {
      return false;
    }

    return createQuestionKey(previousQuiz) !== createQuestionKey(nextQuiz);
  }

  private isSameNoOrdinalQuestionUpdate(previousQuiz: QuizState, nextQuiz: QuizState): boolean {
    if (previousQuiz.questionIndex !== null || nextQuiz.questionIndex !== null) return false;
    if (!createQuestionKey(previousQuiz)) return false;
    if (previousQuiz.quizTitle !== nextQuiz.quizTitle) return false;
    if (previousQuiz.totalQuestions !== nextQuiz.totalQuestions) return false;
    return !this.hasNewNoOrdinalPromptEvidence(previousQuiz, nextQuiz);
  }

  private hasNewNoOrdinalPromptEvidence(previousQuiz: QuizState, nextQuiz: QuizState): boolean {
    if (nextQuiz.questionText && nextQuiz.questionText !== previousQuiz.questionText) return true;
    if (nextQuiz.imageUrl && nextQuiz.imageUrl !== previousQuiz.imageUrl) return true;
    if (nextQuiz.audioUrl && nextQuiz.audioUrl !== previousQuiz.audioUrl) return true;
    if (nextQuiz.videoUrl && nextQuiz.videoUrl !== previousQuiz.videoUrl) return true;
    if (nextQuiz.choices.length > 0 && JSON.stringify(nextQuiz.choices) !== JSON.stringify(previousQuiz.choices)) return true;
    return false;
  }

  private quizForContinuingRound(previousQuiz: QuizState, nextQuiz: QuizState): QuizState {
    if (!this.isSameNoOrdinalQuestionUpdate(previousQuiz, nextQuiz)) return nextQuiz;

    return {
      ...nextQuiz,
      questionType:
        nextQuiz.questionType === "unknown" || nextQuiz.questionType === "free-text"
          ? previousQuiz.questionType
          : nextQuiz.questionType,
      questionText: nextQuiz.questionText ?? previousQuiz.questionText,
      imageUrl: nextQuiz.imageUrl ?? previousQuiz.imageUrl,
      audioUrl: nextQuiz.audioUrl ?? previousQuiz.audioUrl,
      videoUrl: nextQuiz.videoUrl ?? previousQuiz.videoUrl,
      choices: nextQuiz.choices.length > 0 ? nextQuiz.choices : previousQuiz.choices
    };
  }

  private matchesCurrentOriginalResult(room: StoredRoom, resultQuiz: QuizState): boolean {
    if (!room.state.fairPlay.questionKey) return false;
    if (createQuestionKey(room.state.quiz) !== room.state.fairPlay.questionKey) return false;
    return createOriginalResultCompatibilityKey(room.state.quiz) === createOriginalResultCompatibilityKey(resultQuiz);
  }

  private resetRound(room: StoredRoom): void {
    room.aliases = [];
    room.rawSubmissions.clear();
    room.state.submissions = [];
    room.state.revealedSubmissions = [];
    const questionKey = createQuestionKey(room.state.quiz);
    const requiredIds = requiredParticipantIds(room.state.participants);
    room.state.fairPlay = {
      questionKey,
      requiredParticipantIds: requiredIds,
      submittedParticipantIds: [],
      allRequiredSubmitted: false,
      originalSubmitStatus: questionKey ? "locked" : "idle",
      lockReason: questionKey ? originalSubmissionLockReason : null
    };
  }

  private refreshFairPlaySubmissionState(room: StoredRoom): void {
    const submittedIds = submittedParticipantIds(room.state.submissions);
    const complete = allRequiredSubmitted(room.state.fairPlay.requiredParticipantIds, room.state.submissions);
    room.state.fairPlay.submittedParticipantIds = submittedIds;
    room.state.fairPlay.allRequiredSubmitted = complete;

    if (room.state.fairPlay.originalSubmitStatus === "locked" || room.state.fairPlay.originalSubmitStatus === "ready") {
      room.state.fairPlay.originalSubmitStatus = complete ? "ready" : "locked";
      room.state.fairPlay.lockReason = complete ? null : originalSubmissionLockReason;
    }
  }

  private refreshFairPlayRequiredParticipants(room: StoredRoom): void {
    if (
      !room.state.fairPlay.questionKey ||
      (room.state.fairPlay.originalSubmitStatus !== "locked" && room.state.fairPlay.originalSubmitStatus !== "ready")
    ) {
      return;
    }

    room.state.fairPlay.requiredParticipantIds = requiredParticipantIds(room.state.participants);
    this.refreshFairPlaySubmissionState(room);
  }

  private requireRevealReady(room: StoredRoom, skippedParticipantIds: string[]): void {
    const skippedIds = new Set(skippedParticipantIds);
    const requiredIds = room.state.fairPlay.questionKey
      ? room.state.fairPlay.requiredParticipantIds
      : requiredParticipantIds(room.state.participants);
    const missingRequiredIds = requiredIds.filter((participantId) => !room.rawSubmissions.has(participantId) && !skippedIds.has(participantId));

    if (missingRequiredIds.length > 0) {
      throw new Error("All active participants must submit or be skipped before reveal");
    }
  }

  private ensureHostSkipSubmission(room: StoredRoom): string {
    const existing = room.rawSubmissions.get(room.hostParticipantId);
    if (existing && !existing.skipped && existing.rawAnswer.trim()) {
      return existing.rawAnswer;
    }

    room.rawSubmissions.set(room.hostParticipantId, { rawAnswer: "", skipped: true });
    return ".";
  }

  private skipMissingRequiredParticipants(room: StoredRoom): void {
    for (const participantId of room.state.fairPlay.requiredParticipantIds) {
      this.requireParticipant(room, participantId);
      if (!room.rawSubmissions.has(participantId)) {
        room.rawSubmissions.set(participantId, { rawAnswer: "", skipped: true });
      }
    }
  }

  private publicSubmissionStatuses(room: StoredRoom) {
    return room.state.participants
      .filter((participant) => room.rawSubmissions.has(participant.id))
      .map((participant) => {
        const submission = room.rawSubmissions.get(participant.id);
        if (!submission) {
          throw new Error("Submission missing");
        }

        return {
          participantId: participant.id,
          submitted: !submission.skipped,
          skipped: submission.skipped
        };
      });
  }

  private revealedSubmissions(room: StoredRoom): RevealedSubmission[] {
    const submissions = room.state.participants
      .filter((participant) => room.rawSubmissions.has(participant.id))
      .map((participant) => {
        const submission = room.rawSubmissions.get(participant.id);
        if (!submission) {
          throw new Error("Submission missing");
        }

        return {
          participantId: participant.id,
          rawAnswer: submission.rawAnswer,
          skipped: submission.skipped
        };
      });
    const scored = scoreSubmissions({
      answerCandidates: room.state.quiz.answerCandidates,
      aliases: room.aliases,
      submissions
    });
    const correctParticipantIds = new Set(scored.correctParticipantIds);

    return submissions.map((submission) => ({
      participantId: submission.participantId,
      submitted: !submission.skipped,
      skipped: submission.skipped,
      rawAnswer: submission.rawAnswer,
      correct: correctParticipantIds.has(submission.participantId)
    }));
  }

  private addHostSubmissionAliasIfAccepted(room: StoredRoom, quiz: QuizState): void {
    if (!isCorrectOriginalResult(quiz)) return;

    const hostSubmission = room.rawSubmissions.get(room.hostParticipantId);
    const alias = hostSubmission?.rawAnswer.trim();
    if (!alias || hostSubmission?.skipped) return;

    const normalizedAlias = normalizeAnswer(alias);
    const acceptedAnswers = new Set([...quiz.answerCandidates, ...room.aliases].map(normalizeAnswer).filter(Boolean));
    if (acceptedAnswers.has(normalizedAlias)) return;

    room.aliases.push(alias);
  }

  private correctParticipantIds(submissions: RevealedSubmission[]): Set<string> {
    return new Set(submissions.filter((submission) => submission.correct).map((submission) => submission.participantId));
  }

  private applyRevealScoreDiff(participants: Participant[], previousCorrect: Set<string>, nextCorrect: Set<string>): void {
    for (const participant of participants) {
      const delta = Number(nextCorrect.has(participant.id)) - Number(previousCorrect.has(participant.id));
      participant.score = Math.max(0, participant.score + delta);
    }
  }

  private emptyState(roomCode: string, input: CreateRoomInput): RoomState {
    return {
      roomCode,
      phase: "lobby",
      settings: {
        title: input.title,
        visibility: input.visibility,
        submissionVisibility: "status-only",
        timerSeconds: null
      },
      participants: [],
      quiz: {
        quizTitle: null,
        questionIndex: null,
        totalQuestions: null,
        questionType: "unknown",
        questionText: null,
        imageUrl: null,
        audioUrl: null,
        videoUrl: null,
        choices: [],
        timerSecondsRemaining: null,
        canGoNext: false,
        canGoPrevious: false,
        resultMessage: null,
        answerCandidates: []
      },
      submissions: [],
      revealedSubmissions: [],
      fairPlay: {
        questionKey: null,
        requiredParticipantIds: [],
        submittedParticipantIds: [],
        allRequiredSubmitted: false,
        originalSubmitStatus: "idle",
        lockReason: null
      },
      sourceWindow: {
        status: "disconnected",
        url: null,
        title: null,
        lastSeenAt: null,
        message: null
      },
      sourceMirror: createDisconnectedSourceMirror("원본 탭을 연결해 주세요."),
      hostExtensionConnected: false,
      chatMessageCount: 0
    };
  }

  private publicSourceMirror(room: StoredRoom, sourceMirror: SourceMirrorState): SourceMirrorState {
    if (
      (sourceMirror.kind !== "playing" && sourceMirror.kind !== "result") ||
      room.state.fairPlay.originalSubmitStatus === "result-opened"
    ) {
      return sourceMirror;
    }

    const quiz = {
      ...sourceMirror.quiz,
      resultMessage: null,
      answerCandidates: []
    };

    if (sourceMirror.kind === "playing") {
      return {
        ...sourceMirror,
        quiz
      };
    }

    return {
      ...sourceMirror,
      kind: "playing",
      quiz
    };
  }
}
