import type { Participant, RoomState, RoomVisibility } from "@gatchi/shared";
import { customAlphabet, nanoid } from "nanoid";
import { createHostToken, hashHostToken, verifyHostToken } from "../security/hostToken.js";

const createRoomCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

interface StoredRoom {
  hostTokenHash: string;
  state: RoomState;
  aliases: string[];
  rawSubmissions: Map<string, { rawAnswer: string; skipped: boolean }>;
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

  async verifyHost(input: { roomCode: string; hostToken: string }): Promise<boolean> {
    const room = this.rooms.get(input.roomCode);
    if (!room) return false;
    return verifyHostToken(input.hostToken, room.hostTokenHash, this.options.hostTokenPepper);
  }

  getState(roomCode: string): RoomState {
    return this.requireRoom(roomCode).state;
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
