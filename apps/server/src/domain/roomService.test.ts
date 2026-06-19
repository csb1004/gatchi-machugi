import { describe, expect, it } from "vitest";
import { RoomService } from "./roomService.js";

describe("RoomService", () => {
  it("creates a room with a public room code and one-time host token", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const created = await service.createRoom({ title: "Friday quiz", visibility: "public" });

    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.hostToken.length).toBeGreaterThanOrEqual(32);
    expect(created.state.settings.title).toBe("Friday quiz");
    expect(created.state.settings.visibility).toBe("public");
  });

  it("adds numeric suffixes for duplicate nicknames", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });

    const first = service.joinParticipant({ roomCode, nickname: "Mina" });
    const second = service.joinParticipant({ roomCode, nickname: "Mina" });

    expect(first.participant.nickname).toBe("Mina");
    expect(second.participant.nickname).toBe("Mina#2");
  });

  it("verifies host token before granting host access", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode, hostToken } = await service.createRoom({ title: "Room", visibility: "private" });

    await expect(service.verifyHost({ roomCode, hostToken })).resolves.toBe(true);
    await expect(service.verifyHost({ roomCode, hostToken: "wrong" })).resolves.toBe(false);
  });

  it("keeps raw answers private before reveal while exposing only submission status", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });
    const host = service.joinHostPlayer({ roomCode, nickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.submitAnswer({ roomCode, participantId: host.participant.id, rawAnswer: "blue archive" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong answer" });

    const state = service.getState(roomCode);

    expect(JSON.stringify(state)).not.toContain("rawAnswer");
    expect(state.submissions).toEqual([
      { participantId: host.participant.id, submitted: true, skipped: false },
      { participantId: player.participant.id, submitted: true, skipped: false }
    ]);
    expect(state.revealedSubmissions).toEqual([]);
  });

  it("requires every active participant including the host to submit or be skipped before reveal", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });
    const host = service.joinHostPlayer({ roomCode, nickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        answerCandidates: ["blue archive"]
      }
    });
    service.submitAnswer({ roomCode, participantId: host.participant.id, rawAnswer: "blue archive" });

    expect(() => service.revealAnswers({ roomCode, skippedParticipantIds: [] })).toThrow(
      "All active participants must submit or be skipped before reveal"
    );

    const revealed = service.revealAnswers({ roomCode, skippedParticipantIds: [player.participant.id] });
    const skipped = revealed.revealedSubmissions.find((submission) => submission.participantId === player.participant.id);

    expect(skipped).toEqual({
      participantId: player.participant.id,
      submitted: false,
      skipped: true,
      rawAnswer: "",
      correct: false
    });
  });

  it("re-scores revealed submissions with trimmed aliases and space-insensitive matching", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });
    const host = service.joinHostPlayer({ roomCode, nickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        answerCandidates: ["blue archive"]
      }
    });
    service.submitAnswer({ roomCode, participantId: host.participant.id, rawAnswer: "bluearchive" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "acceptedalias" });
    service.revealAnswers({ roomCode, skippedParticipantIds: [] });

    const rescored = service.addAlias({ roomCode, alias: "  accepted alias  " });
    const revealedPlayer = rescored.revealedSubmissions.find((submission) => submission.participantId === player.participant.id);
    const rescoredPlayer = rescored.participants.find((participant) => participant.id === player.participant.id);

    expect(revealedPlayer?.correct).toBe(true);
    expect(rescoredPlayer?.score).toBe(1);
  });

  it("rejects answer changes after reveal", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });
    const host = service.joinHostPlayer({ roomCode, nickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        answerCandidates: ["blue archive"]
      }
    });
    service.submitAnswer({ roomCode, participantId: host.participant.id, rawAnswer: "blue archive" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
    service.revealAnswers({ roomCode, skippedParticipantIds: [] });

    expect(() => service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "blue archive" })).toThrow(
      "Submissions are closed for this question"
    );
  });

  it("adjusts scores, changes settings, kicks participants, and expires rooms", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "public" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.adjustScore({ roomCode, participantId: player.participant.id, delta: 3, reason: "manual correction" });
    expect(service.getState(roomCode).participants.find((participant) => participant.id === player.participant.id)?.score).toBe(3);

    service.updateSettings({ roomCode, settings: { visibility: "private", title: "Private Room" } });
    expect(service.getState(roomCode).settings.visibility).toBe("private");
    expect(service.getState(roomCode).settings.title).toBe("Private Room");

    service.kickParticipant({ roomCode, participantId: player.participant.id });
    expect(service.getState(roomCode).participants.find((participant) => participant.id === player.participant.id)?.connected).toBe(false);

    service.expireRoom(roomCode);
    expect(service.getState(roomCode).phase).toBe("expired");
    expect(service.listPublicRooms()).toEqual([]);
  });

  it("records chat message count for room state", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "public" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    const message = service.addChatMessage({
      roomCode,
      participantId: player.participant.id,
      text: "hello"
    });

    expect(message.text).toBe("hello");
    expect(message.nickname).toBe("Mina");
    expect(service.getState(roomCode).chatMessageCount).toBe(1);
  });
});
