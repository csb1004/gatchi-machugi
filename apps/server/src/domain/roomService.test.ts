import { describe, expect, it } from "vitest";
import { RoomService } from "./roomService.js";

describe("RoomService", () => {
  it("creates a room with a host participant and private host code", async () => {
    const service = new RoomService();
    const created = await service.createRoom({ title: "Friday quiz", visibility: "public", hostNickname: "Sangbeom" });

    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.hostCode).toMatch(/^#[A-Z0-9]{4}$/);
    expect(created.state.participants).toEqual([
      expect.objectContaining({
        id: created.hostParticipantId,
        nickname: "Sangbeom",
        role: "host"
      })
    ]);
    expect(JSON.stringify(created.state)).not.toContain(created.hostCode);
    expect(created.state.settings.title).toBe("Friday quiz");
    expect(created.state.settings.visibility).toBe("public");
  });

  it("adds numeric suffixes for duplicate nicknames while issuing unique participant codes", async () => {
    const service = new RoomService();
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });

    const first = service.joinParticipant({ roomCode, nickname: "Mina" });
    const second = service.joinParticipant({ roomCode, nickname: "Mina" });

    expect(first.participant.nickname).toBe("Mina");
    expect(second.participant.nickname).toBe("Mina#2");
    expect(first.participantCode).toMatch(/^#[A-Z0-9]{4}$/);
    expect(second.participantCode).toMatch(/^#[A-Z0-9]{4}$/);
    expect(second.participantCode).not.toBe(first.participantCode);
  });

  it("verifies host participant code before granting host access", async () => {
    const service = new RoomService();
    const { roomCode, hostCode } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });

    expect(service.verifyHost({ roomCode, hostCode })).toBe(true);
    expect(service.verifyHost({ roomCode, hostCode: "#NOPE" })).toBe(false);
  });

  it("keeps raw answers private before reveal while exposing only submission status", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const host = service.getState(roomCode).participants.find((participant) => participant.id === hostParticipantId);
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    if (!host) throw new Error("missing host");
    service.submitAnswer({ roomCode, participantId: host.id, rawAnswer: "blue archive" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong answer" });

    const state = service.getState(roomCode);

    expect(JSON.stringify(state)).not.toContain("rawAnswer");
    expect(state.submissions).toEqual([
      { participantId: host.id, submitted: true, skipped: false },
      { participantId: player.participant.id, submitted: true, skipped: false }
    ]);
    expect(state.revealedSubmissions).toEqual([]);
  });

  it("requires every active participant including the host to submit or be skipped before reveal", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const host = service.getState(roomCode).participants.find((participant) => participant.id === hostParticipantId);
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });
    if (!host) throw new Error("missing host");

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        answerCandidates: ["blue archive"]
      }
    });
    service.submitAnswer({ roomCode, participantId: host.id, rawAnswer: "blue archive" });

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
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const host = service.getState(roomCode).participants.find((participant) => participant.id === hostParticipantId);
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });
    if (!host) throw new Error("missing host");

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        answerCandidates: ["blue archive"]
      }
    });
    service.submitAnswer({ roomCode, participantId: host.id, rawAnswer: "bluearchive" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "acceptedalias" });
    service.revealAnswers({ roomCode, skippedParticipantIds: [] });

    const rescored = service.addAlias({ roomCode, alias: "  accepted alias  " });
    const revealedPlayer = rescored.revealedSubmissions.find((submission) => submission.participantId === player.participant.id);
    const rescoredPlayer = rescored.participants.find((participant) => participant.id === player.participant.id);

    expect(revealedPlayer?.correct).toBe(true);
    expect(rescoredPlayer?.score).toBe(1);
  });

  it("rejects answer changes after reveal", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const host = service.getState(roomCode).participants.find((participant) => participant.id === hostParticipantId);
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });
    if (!host) throw new Error("missing host");

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        answerCandidates: ["blue archive"]
      }
    });
    service.submitAnswer({ roomCode, participantId: host.id, rawAnswer: "blue archive" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
    service.revealAnswers({ roomCode, skippedParticipantIds: [] });

    expect(() => service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "blue archive" })).toThrow(
      "Submissions are closed for this question"
    );
  });

  it("locks original submission for a new active question until required players submit", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    const locked = service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        questionType: "free-text"
      }
    });

    expect(locked.fairPlay).toMatchObject({
      requiredParticipantIds: [hostParticipantId, player.participant.id],
      submittedParticipantIds: [],
      allRequiredSubmitted: false,
      originalSubmitStatus: "locked"
    });

    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "blue archive" });
    const ready = service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });

    expect(ready.fairPlay).toMatchObject({
      submittedParticipantIds: [hostParticipantId, player.participant.id],
      allRequiredSubmitted: true,
      originalSubmitStatus: "ready"
    });
  });

  it("authorizes original submission with the host raw answer only after everyone submits", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        questionType: "free-text"
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "blue archive" });

    expect(() => service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" })).toThrow(
      "Original submission is still locked"
    );

    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
    const allowed = service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" });

    expect(allowed).toEqual({
      roomCode,
      questionKey: service.getState(roomCode).fairPlay.questionKey,
      hostRawAnswer: "blue archive"
    });
    expect(service.getState(roomCode).fairPlay.originalSubmitStatus).toBe("submitting");
  });

  it("applies original result, reveals answers, and unlocks next after original submission", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        questionType: "free-text"
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "blue archive" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
    const questionKey = service.getState(roomCode).fairPlay.questionKey ?? "";
    service.requestOriginalSubmission({ roomCode, questionKey });

    const revealed = service.applyOriginalResult({
      roomCode,
      questionKey,
      quiz: {
        ...service.getState(roomCode).quiz,
        resultMessage: "correct",
        answerCandidates: ["blue archive"],
        canGoNext: true
      }
    });

    expect(revealed.phase).toBe("revealed");
    expect(revealed.fairPlay.originalSubmitStatus).toBe("result-opened");
    expect(revealed.revealedSubmissions.find((submission) => submission.participantId === hostParticipantId)?.correct).toBe(true);
    expect(revealed.revealedSubmissions.find((submission) => submission.participantId === player.participant.id)?.correct).toBe(false);
  });

  it("rejects original result before original submission authorization", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        questionType: "free-text"
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "blue archive" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
    const questionKey = service.getState(roomCode).fairPlay.questionKey ?? "";

    expect(service.getState(roomCode).fairPlay.originalSubmitStatus).toBe("ready");
    expect(() =>
      service.applyOriginalResult({
        roomCode,
        questionKey,
        quiz: {
          ...service.getState(roomCode).quiz,
          resultMessage: "correct",
          answerCandidates: ["blue archive"],
          canGoNext: true
        }
      })
    ).toThrow("Original submission has not been authorized");
  });

  it("adjusts scores, changes settings, kicks participants, and expires rooms", async () => {
    const service = new RoomService();
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "public", hostNickname: "Host" });
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
    const service = new RoomService();
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "public", hostNickname: "Host" });
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
