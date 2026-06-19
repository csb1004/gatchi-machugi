import { describe, expect, it, vi } from "vitest";
import { buildPairPayload, MachugiSocketClient, normalizeServerUrl, NOT_CONNECTED_MESSAGE } from "./socketClient.js";

describe("buildPairPayload", () => {
  it("trims and uppercases the room code and host code", () => {
    expect(
      buildPairPayload({
        roomCode: "  ab12cd  ",
        hostCode: "  #c04h  "
      })
    ).toEqual({
      roomCode: "AB12CD",
      hostCode: "#C04H"
    });
  });
});

describe("normalizeServerUrl", () => {
  it("rejects the original machugi.io quiz site as the app server", () => {
    expect(() => normalizeServerUrl("https://machugi.io/")).toThrow("가치 마추기 서버 URL");
  });

  it("normalizes the app server URL", () => {
    expect(normalizeServerUrl(" https://gatchi-machugi.up.railway.app/ ")).toBe("https://gatchi-machugi.up.railway.app");
  });
});

describe("MachugiSocketClient", () => {
  it("exposes original submission methods that require a connected socket", () => {
    const client = new MachugiSocketClient();

    expect(() => client.onOriginalSubmitAllowed(vi.fn())).toThrow(NOT_CONNECTED_MESSAGE);
    expect(() => client.onRoomState(vi.fn())).toThrow(NOT_CONNECTED_MESSAGE);
    expect(() => client.onSourceAction(vi.fn())).toThrow(NOT_CONNECTED_MESSAGE);
    expect(() =>
      client.sendSourceWindow({
        roomCode: "ABC123",
        sourceWindow: {
          status: "connected",
          url: "https://machugi.io/",
          title: "Machugi",
          lastSeenAt: "2026-06-19T00:00:00.000Z",
          message: null
        }
      })
    ).toThrow(NOT_CONNECTED_MESSAGE);
    expect(() =>
      client.sendSourceMirror({
        roomCode: "ABC123",
        sourceMirror: {
          kind: "home",
          url: "https://machugi.io/",
          title: "Machugi",
          lastSeenAt: "2026-06-19T00:00:00.000Z",
          query: ""
        }
      })
    ).toThrow(NOT_CONNECTED_MESSAGE);
    expect(() =>
      client.sendSourceActionFailure({
        roomCode: "ABC123",
        actionId: "act-1",
        action: { name: "search", query: "pokemon" },
        reason: "검색창을 찾을 수 없습니다."
      })
    ).toThrow(NOT_CONNECTED_MESSAGE);
    expect(() => client.requestOriginalSubmit({ roomCode: "ABC123", questionKey: "q1" })).toThrow(NOT_CONNECTED_MESSAGE);
    expect(() =>
      client.sendOriginalResult({
        roomCode: "ABC123",
        questionKey: "q1",
        quiz: {
          quizTitle: "Quiz",
          questionIndex: 1,
          totalQuestions: 10,
          questionType: "free-text",
          questionText: "Name the game",
          imageUrl: null,
          audioUrl: null,
          videoUrl: null,
          choices: [],
          timerSecondsRemaining: null,
          canGoNext: true,
          canGoPrevious: false,
          resultMessage: "correct",
          answerCandidates: ["blue archive"]
        }
      })
    ).toThrow(NOT_CONNECTED_MESSAGE);
    expect(() =>
      client.sendOriginalFailure({
        roomCode: "ABC123",
        questionKey: "q1",
        reason: "원본 사이트에 답을 자동 제출하지 못했습니다."
      })
    ).toThrow(NOT_CONNECTED_MESSAGE);
  });
});
