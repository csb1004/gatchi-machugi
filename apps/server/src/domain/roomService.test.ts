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

  it("locks answer changes after original submission authorization", async () => {
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
    service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" });

    expect(() => service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "blue archive" })).toThrow(
      "Submissions are locked for original submission"
    );
  });

  it("returns to ready when the host extension reports original submission failure", async () => {
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

    const recovered = service.failOriginalSubmission({
      roomCode,
      questionKey,
      reason: "원본 사이트에 답을 자동 제출하지 못했습니다."
    });

    expect(recovered.fairPlay).toMatchObject({
      submittedParticipantIds: [hostParticipantId, player.participant.id],
      allRequiredSubmitted: true,
      originalSubmitStatus: "ready",
      lockReason: "원본 사이트에 답을 자동 제출하지 못했습니다."
    });
    expect(() => service.requestOriginalSubmission({ roomCode, questionKey })).not.toThrow();
  });

  it("stores source-window connection state without resetting the current round", async () => {
    const service = new RoomService();
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the game",
        questionType: "free-text"
      }
    });
    const questionKey = service.getState(roomCode).fairPlay.questionKey;

    const state = service.updateSourceWindow({
      roomCode,
      sourceWindow: {
        status: "connected",
        url: "https://machugi.io/quiz/123",
        title: "Quiz",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        message: null
      }
    });

    expect(state.sourceWindow.status).toBe("connected");
    expect(state.sourceWindow.url).toBe("https://machugi.io/quiz/123");
    expect(state.fairPlay.questionKey).toBe(questionKey);
  });

  it("starts rooms with a disconnected source mirror", async () => {
    const service = new RoomService();
    const created = await service.createRoom({
      title: "마추기 방",
      hostNickname: "Host",
      visibility: "public"
    });

    expect(created.state.sourceMirror).toEqual({
      kind: "disconnected",
      url: null,
      title: null,
      lastSeenAt: null,
      message: "원본 탭을 연결해 주세요."
    });
  });

  it("updates quiz and phase when mirror state becomes playable", async () => {
    const service = new RoomService();
    const created = await service.createRoom({
      title: "마추기 방",
      hostNickname: "Host",
      visibility: "public"
    });

    const quiz = {
      ...created.state.quiz,
      quizTitle: "Pokemon",
      questionIndex: 1,
      totalQuestions: 10,
      questionType: "free-text" as const,
      questionText: "Who is this?"
    };

    const state = service.updateSourceMirror({
      roomCode: created.roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/1",
        title: "Pokemon",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        quiz
      }
    });

    expect(state.sourceMirror.kind).toBe("playing");
    expect(state.quiz.questionText).toBe("Who is this?");
    expect(state.phase).toBe("playing");
    expect(state.fairPlay.originalSubmitStatus).toBe("locked");
  });

  it("removes answer data from playable mirror states before the original result is opened", async () => {
    const service = new RoomService();
    const created = await service.createRoom({
      title: "Mirror room",
      hostNickname: "Host",
      visibility: "public"
    });

    const state = service.updateSourceMirror({
      roomCode: created.roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/1",
        title: "Pokemon",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        quiz: {
          ...created.state.quiz,
          quizTitle: "Pokemon",
          questionIndex: 1,
          totalQuestions: 10,
          questionType: "free-text",
          questionText: "Who is this?",
          resultMessage: "오답!",
          answerCandidates: ["Pikachu"]
        }
      }
    });

    expect(state.sourceMirror.kind).toBe("playing");
    if (state.sourceMirror.kind !== "playing") throw new Error("expected playing mirror");
    expect(state.sourceMirror.quiz.resultMessage).toBeNull();
    expect(state.sourceMirror.quiz.answerCandidates).toEqual([]);
    expect(state.quiz.resultMessage).toBeNull();
    expect(state.quiz.answerCandidates).toEqual([]);
    expect(JSON.stringify(state)).not.toContain("Pikachu");
  });

  it("resets the round when only multiple-choice choices change", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Pick the game",
        questionType: "multiple-choice",
        choices: [
          { id: "a", label: "Blue Archive" },
          { id: "b", label: "Arknights" }
        ]
      }
    });
    const firstQuestionKey = service.getState(roomCode).fairPlay.questionKey;
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "a" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "b" });

    const reset = service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        choices: [
          { id: "c", label: "Nikke" },
          { id: "d", label: "Uma Musume" }
        ]
      }
    });

    expect(reset.submissions).toEqual([]);
    expect(reset.fairPlay.questionKey).not.toBe(firstQuestionKey);
    expect(reset.fairPlay).toMatchObject({
      requiredParticipantIds: [hostParticipantId, player.participant.id],
      submittedParticipantIds: [],
      allRequiredSubmitted: false,
      originalSubmitStatus: "locked"
    });
  });

  it("refreshes fair play readiness when a required participant disconnects", async () => {
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

    const refreshed = service.disconnectParticipant({ roomCode, participantId: player.participant.id });

    expect(refreshed.fairPlay).toMatchObject({
      requiredParticipantIds: [hostParticipantId],
      submittedParticipantIds: [hostParticipantId],
      allRequiredSubmitted: true,
      originalSubmitStatus: "ready"
    });
  });

  it("locks fair play again when a disconnected required participant rejoins before original submission", async () => {
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
    service.disconnectParticipant({ roomCode, participantId: player.participant.id });
    expect(service.getState(roomCode).fairPlay.originalSubmitStatus).toBe("ready");

    const rejoined = service.joinParticipant({
      roomCode,
      nickname: "Mina",
      participantId: player.participant.id
    });

    expect(rejoined.state.fairPlay).toMatchObject({
      requiredParticipantIds: [hostParticipantId, player.participant.id],
      submittedParticipantIds: [hostParticipantId],
      allRequiredSubmitted: false,
      originalSubmitStatus: "locked"
    });

    const ready = service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
    expect(ready.fairPlay).toMatchObject({
      submittedParticipantIds: [hostParticipantId, player.participant.id],
      allRequiredSubmitted: true,
      originalSubmitStatus: "ready"
    });
  });

  it("locks fair play when a new participant joins an active question before original submission", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });

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
    expect(service.getState(roomCode).fairPlay.originalSubmitStatus).toBe("ready");

    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    expect(player.state.fairPlay).toMatchObject({
      requiredParticipantIds: [hostParticipantId, player.participant.id],
      submittedParticipantIds: [hostParticipantId],
      allRequiredSubmitted: false,
      originalSubmitStatus: "locked"
    });
  });

  it("locks fair play when the host extension reconnects the host during an active question", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId, hostCode } = await service.createRoom({
      title: "Room",
      visibility: "private",
      hostNickname: "Host"
    });
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
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "wrong" });
    service.disconnectParticipant({ roomCode, participantId: hostParticipantId });
    expect(service.getState(roomCode).fairPlay.originalSubmitStatus).toBe("ready");

    const reconnected = service.joinHostExtension({ roomCode, hostCode });

    expect(reconnected.state.fairPlay).toMatchObject({
      requiredParticipantIds: [hostParticipantId, player.participant.id],
      submittedParticipantIds: [player.participant.id],
      allRequiredSubmitted: false,
      originalSubmitStatus: "locked"
    });
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

  it("accepts the host submitted answer as an alias when the original site marks it correct", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the character",
        questionType: "free-text"
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "미샤" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "미샤" });
    const questionKey = service.getState(roomCode).fairPlay.questionKey ?? "";
    service.requestOriginalSubmission({ roomCode, questionKey });

    const revealed = service.applyOriginalResult({
      roomCode,
      questionKey,
      quiz: {
        ...service.getState(roomCode).quiz,
        resultMessage: "정답!",
        answerCandidates: ["레그워크 샤르 미하일"],
        canGoNext: true
      }
    });

    expect(revealed.revealedSubmissions.find((submission) => submission.participantId === hostParticipantId)?.correct).toBe(true);
    expect(revealed.revealedSubmissions.find((submission) => submission.participantId === player.participant.id)?.correct).toBe(true);
  });

  it("does not accept the host submitted answer as an alias when the original site marks it wrong", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateQuizState({
      roomCode,
      quiz: {
        ...service.getState(roomCode).quiz,
        questionIndex: 1,
        questionText: "Name the character",
        questionType: "free-text"
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "미샤" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "미샤" });
    const questionKey = service.getState(roomCode).fairPlay.questionKey ?? "";
    service.requestOriginalSubmission({ roomCode, questionKey });

    const revealed = service.applyOriginalResult({
      roomCode,
      questionKey,
      quiz: {
        ...service.getState(roomCode).quiz,
        resultMessage: "오답!",
        answerCandidates: ["레그워크 샤르 미하일"],
        canGoNext: true
      }
    });

    expect(revealed.revealedSubmissions.find((submission) => submission.participantId === hostParticipantId)?.correct).toBe(false);
    expect(revealed.revealedSubmissions.find((submission) => submission.participantId === player.participant.id)?.correct).toBe(false);
  });

  it("applies a source mirror result as the original result while original submission is pending", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });

    service.updateSourceWindow({
      roomCode,
      sourceWindow: {
        status: "connected",
        url: "https://machugi.io/quiz/123",
        title: "Machugi",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        message: null
      }
    });
    const playingQuiz = {
      ...service.getState(roomCode).quiz,
      quizTitle: "Pokemon",
      questionIndex: 1,
      totalQuestions: 10,
      questionText: "Who is this?",
      questionType: "free-text" as const
    };
    service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/123/play",
        title: "Pokemon",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        quiz: playingQuiz
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "diancie" });
    service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" });

    const revealed = service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "result",
        url: "https://machugi.io/quiz/123/play",
        title: "Pokemon",
        lastSeenAt: "2026-06-19T00:00:01.000Z",
        quiz: {
          ...playingQuiz,
          resultMessage: "정답!",
          answerCandidates: ["디안시", "diancie"],
          canGoNext: true
        }
      }
    });

    expect(revealed.phase).toBe("revealed");
    expect(revealed.fairPlay.originalSubmitStatus).toBe("result-opened");
    expect(revealed.revealedSubmissions).toEqual([
      { participantId: hostParticipantId, submitted: true, skipped: false, rawAnswer: "diancie", correct: true }
    ]);
  });

  it("keeps first-screen submissions when the original result screen swaps the blurred image for the answer image", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    service.updateSourceWindow({
      roomCode,
      sourceWindow: {
        status: "connected",
        url: "https://machugi.io/quiz/123",
        title: "Machugi",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        message: null
      }
    });
    const playingQuiz = {
      ...service.getState(roomCode).quiz,
      quizTitle: "눈 맞추기",
      questionIndex: 3,
      totalQuestions: 10,
      questionText: null,
      questionType: "free-text" as const,
      imageUrl: "https://images.machugi.io/blurred-eye.png"
    };
    service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/123/play",
        title: "눈 맞추기",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        quiz: playingQuiz
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "은랑" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "은랑" });
    service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" });

    const revealed = service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "result",
        url: "https://machugi.io/quiz/123/play",
        title: "눈 맞추기",
        lastSeenAt: "2026-06-19T00:00:01.000Z",
        quiz: {
          ...playingQuiz,
          imageUrl: "https://images.machugi.io/revealed-eye.png",
          resultMessage: "정답!",
          answerCandidates: ["은랑"],
          canGoNext: true
        }
      }
    });

    expect(revealed.phase).toBe("revealed");
    expect(revealed.fairPlay.originalSubmitStatus).toBe("result-opened");
    expect(revealed.submissions).toEqual([
      { participantId: hostParticipantId, submitted: true, skipped: false },
      { participantId: player.participant.id, submitted: true, skipped: false }
    ]);
    expect(revealed.revealedSubmissions).toEqual([
      { participantId: hostParticipantId, submitted: true, skipped: false, rawAnswer: "은랑", correct: true },
      { participantId: player.participant.id, submitted: true, skipped: false, rawAnswer: "은랑", correct: true }
    ]);
  });

  it("keeps first-screen submissions while waiting when the answer screen is misread as another playing screen", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });
    const player = service.joinParticipant({ roomCode, nickname: "Mina" });

    const playingQuiz = {
      ...service.getState(roomCode).quiz,
      quizTitle: "눈 맞추기",
      questionIndex: 3,
      totalQuestions: 10,
      questionText: null,
      questionType: "free-text" as const,
      imageUrl: "https://images.machugi.io/blurred-eye.png"
    };
    service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/123/play",
        title: "눈 맞추기",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        quiz: playingQuiz
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "은랑" });
    service.submitAnswer({ roomCode, participantId: player.participant.id, rawAnswer: "은랑" });
    service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" });

    const waiting = service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/123/play",
        title: "눈 맞추기",
        lastSeenAt: "2026-06-19T00:00:01.000Z",
        quiz: {
          ...playingQuiz,
          imageUrl: "https://images.machugi.io/revealed-eye.png",
          canGoNext: true
        }
      }
    });

    expect(waiting.phase).toBe("playing");
    expect(waiting.fairPlay.originalSubmitStatus).toBe("submitting");
    expect(waiting.sourceMirror.kind).toBe("loading");
    expect(waiting.submissions).toEqual([
      { participantId: hostParticipantId, submitted: true, skipped: false },
      { participantId: player.participant.id, submitted: true, skipped: false }
    ]);
  });

  it("applies original result even when the source mirror classifies it as playing", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });

    const playingQuiz = {
      ...service.getState(roomCode).quiz,
      quizTitle: "Pokemon",
      questionIndex: 1,
      totalQuestions: 10,
      questionText: "Who is this?",
      questionType: "free-text" as const
    };
    service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/123/play",
        title: "Pokemon",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        quiz: playingQuiz
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "diancie" });
    service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" });

    const revealed = service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/123/play",
        title: "Pokemon",
        lastSeenAt: "2026-06-19T00:00:01.000Z",
        quiz: {
          ...playingQuiz,
          resultMessage: "정답!",
          answerCandidates: ["디안시", "diancie"],
          canGoNext: true
        }
      }
    });

    expect(revealed.phase).toBe("revealed");
    expect(revealed.fairPlay.originalSubmitStatus).toBe("result-opened");
    expect(revealed.revealedSubmissions).toEqual([
      { participantId: hostParticipantId, submitted: true, skipped: false, rawAnswer: "diancie", correct: true }
    ]);
  });

  it("applies original result when the answer screen replaces the question text with the accepted answer", async () => {
    const service = new RoomService();
    const { roomCode, hostParticipantId } = await service.createRoom({ title: "Room", visibility: "private", hostNickname: "Host" });

    const playingQuiz = {
      ...service.getState(roomCode).quiz,
      quizTitle: "Character Quiz",
      questionIndex: 4,
      totalQuestions: 10,
      questionText: "Who is this?",
      questionType: "free-text" as const
    };
    service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "playing",
        url: "https://machugi.io/quiz/123/play",
        title: "Character Quiz",
        lastSeenAt: "2026-06-19T00:00:00.000Z",
        quiz: playingQuiz
      }
    });
    service.submitAnswer({ roomCode, participantId: hostParticipantId, rawAnswer: "은랑" });
    service.requestOriginalSubmission({ roomCode, questionKey: service.getState(roomCode).fairPlay.questionKey ?? "" });

    const revealed = service.updateSourceMirror({
      roomCode,
      sourceMirror: {
        kind: "result",
        url: "https://machugi.io/quiz/123/play",
        title: "Character Quiz",
        lastSeenAt: "2026-06-19T00:00:01.000Z",
        quiz: {
          ...playingQuiz,
          questionText: "은랑",
          resultMessage: "정답!",
          answerCandidates: ["은랑"],
          canGoNext: true
        }
      }
    });

    expect(revealed.phase).toBe("revealed");
    expect(revealed.revealedSubmissions).toEqual([
      { participantId: hostParticipantId, submitted: true, skipped: false, rawAnswer: "은랑", correct: true }
    ]);
  });

  it("does not require late participants after original submission starts", async () => {
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

    const late = service.joinParticipant({ roomCode, nickname: "Late" });

    expect(late.participant.connected).toBe(true);
    expect(late.state.fairPlay.requiredParticipantIds).toEqual([hostParticipantId, player.participant.id]);
    expect(() => service.submitAnswer({ roomCode, participantId: late.participant.id, rawAnswer: "blue archive" })).toThrow(
      "Submissions are locked for original submission"
    );

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
    expect(revealed.revealedSubmissions.map((submission) => submission.participantId)).toEqual([
      hostParticipantId,
      player.participant.id
    ]);
  });

  it("does not mutate original result state when reveal readiness fails", async () => {
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
    const questionKey = service.getState(roomCode).fairPlay.questionKey ?? "";
    service.getState(roomCode).fairPlay.originalSubmitStatus = "submitting";
    const previousQuiz = service.getState(roomCode).quiz;
    const previousLockReason = service.getState(roomCode).fairPlay.lockReason;

    expect(() =>
      service.applyOriginalResult({
        roomCode,
        questionKey,
        quiz: {
          ...previousQuiz,
          resultMessage: "correct",
          answerCandidates: ["blue archive"],
          canGoNext: true
        }
      })
    ).toThrow("All active participants must submit or be skipped before reveal");

    const state = service.getState(roomCode);
    expect(state.quiz.resultMessage).toBeNull();
    expect(state.quiz.answerCandidates).toEqual([]);
    expect(state.quiz.canGoNext).toBe(false);
    expect(state.fairPlay.originalSubmitStatus).toBe("submitting");
    expect(state.fairPlay.lockReason).toBe(previousLockReason);
    expect(state.revealedSubmissions).toEqual([]);
    expect(state.participants.find((participant) => participant.id === player.participant.id)?.connected).toBe(true);
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

  it("rejects original results for a changed quiz identity", async () => {
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

    expect(() =>
      service.applyOriginalResult({
        roomCode,
        questionKey,
        quiz: {
          ...service.getState(roomCode).quiz,
          questionIndex: 2,
          resultMessage: "correct",
          answerCandidates: ["blue archive"],
          canGoNext: true
        }
      })
    ).toThrow("Original result does not match current question");
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
