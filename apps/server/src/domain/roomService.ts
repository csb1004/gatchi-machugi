import {
  scoreSubmissions,
  type ChatMessagePayload,
  type Participant,
  type QuizState,
  type RevealedSubmission,
  type RoomSettings,
  type RoomState,
  type RoomVisibility
} from "@gatchi/shared";
import { customAlphabet, nanoid } from "nanoid";
import { createHostToken, hashHostToken, verifyHostToken } from "../security/hostToken.js";

const createRoomCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

interface StoredRoom {
  hostTokenHash: string;
  state: RoomState;
  aliases: string[];
  rawSubmissions: Map<string, { rawAnswer: string; skipped: boolean }>;
  chatMessages: ChatMessagePayload[];
  expiresAt: Date;
}

export interface CreateRoomInput {
  title: string;
  visibility: RoomVisibility;
}

export interface CreateRoomResult {
  roomCode: string;
  hostToken: string;
  state: RoomState;
}

export class RoomService {
  private rooms = new Map<string, StoredRoom>();

  constructor(private readonly options: { hostTokenPepper: string }) {}

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    const roomCode = this.uniqueRoomCode();
    const hostToken = createHostToken();
    const hostTokenHash = await hashHostToken(hostToken, this.options.hostTokenPepper);
    const state = this.emptyState(roomCode, input);

    this.rooms.set(roomCode, {
      hostTokenHash,
      state,
      aliases: [],
      rawSubmissions: new Map(),
      chatMessages: [],
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    return { roomCode, hostToken, state };
  }

  joinParticipant(input: { roomCode: string; nickname: string; participantId?: string }): { participant: Participant; state: RoomState } {
    const room = this.requireRoom(input.roomCode);
    const existing = input.participantId ? room.state.participants.find((participant) => participant.id === input.participantId) : undefined;

    if (existing) {
      existing.connected = true;
      return { participant: existing, state: room.state };
    }

    const participant: Participant = {
      id: input.participantId ?? nanoid(12),
      nickname: this.uniqueNickname(room.state.participants, input.nickname.trim() || "Player"),
      role: "player",
      connected: true,
      score: 0
    };

    room.state.participants.push(participant);
    return { participant, state: room.state };
  }

  joinHostPlayer(input: { roomCode: string; nickname: string }): { participant: Participant; state: RoomState } {
    const room = this.requireRoom(input.roomCode);
    const existing = room.state.participants.find((participant) => participant.role === "host");

    if (existing) {
      existing.connected = true;
      return { participant: existing, state: room.state };
    }

    const participant: Participant = {
      id: nanoid(12),
      nickname: this.uniqueNickname(room.state.participants, input.nickname.trim() || "Host"),
      role: "host",
      connected: true,
      score: 0
    };

    room.state.participants.push(participant);
    return { participant, state: room.state };
  }

  async verifyHost(input: { roomCode: string; hostToken: string }): Promise<boolean> {
    const room = this.rooms.get(input.roomCode);
    if (!room) return false;
    return verifyHostToken(input.hostToken, room.hostTokenHash, this.options.hostTokenPepper);
  }

  getState(roomCode: string): RoomState {
    return this.requireRoom(roomCode).state;
  }

  updateQuizState(input: { roomCode: string; quiz: QuizState }): RoomState {
    const room = this.requireRoom(input.roomCode);
    const shouldResetRound = this.shouldResetRound(room.state.quiz, input.quiz);

    room.state.quiz = input.quiz;

    if (shouldResetRound) {
      this.resetRound(room);
      room.state.phase = "playing";
    }

    return room.state;
  }

  submitAnswer(input: { roomCode: string; participantId: string; rawAnswer: string }): RoomState {
    const room = this.requireRoom(input.roomCode);
    this.requireParticipant(room, input.participantId);

    room.rawSubmissions.set(input.participantId, {
      rawAnswer: input.rawAnswer,
      skipped: false
    });
    room.state.submissions = this.publicSubmissionStatuses(room);

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

    const missingParticipants = room.state.participants.filter(
      (participant) => participant.connected && !room.rawSubmissions.has(participant.id)
    );
    if (missingParticipants.length > 0) {
      throw new Error("All active participants must submit or be skipped before reveal");
    }

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
    return (
      previousQuiz.questionIndex !== nextQuiz.questionIndex ||
      previousQuiz.questionText !== nextQuiz.questionText ||
      previousQuiz.questionType !== nextQuiz.questionType ||
      previousQuiz.imageUrl !== nextQuiz.imageUrl ||
      previousQuiz.audioUrl !== nextQuiz.audioUrl ||
      previousQuiz.videoUrl !== nextQuiz.videoUrl
    );
  }

  private resetRound(room: StoredRoom): void {
    room.aliases = [];
    room.rawSubmissions.clear();
    room.state.submissions = [];
    room.state.revealedSubmissions = [];
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
      hostExtensionConnected: false,
      chatMessageCount: 0
    };
  }
}
