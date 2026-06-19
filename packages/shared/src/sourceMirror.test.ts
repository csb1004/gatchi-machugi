import { describe, expect, it } from "vitest";
import { createDisconnectedSourceMirror, isPlayableSourceMirror, quizFromSourceMirror } from "./sourceMirror.js";
import type { SourceMirrorState } from "./sourceMirror.js";

const quiz = {
  quizTitle: "Pokemon",
  questionIndex: 1,
  totalQuestions: 10,
  questionType: "free-text" as const,
  questionText: "Who is this?",
  imageUrl: null,
  audioUrl: null,
  videoUrl: null,
  choices: [],
  timerSecondsRemaining: null,
  canGoNext: true,
  canGoPrevious: false,
  resultMessage: null,
  answerCandidates: []
};

describe("source mirror helpers", () => {
  it("creates a disconnected mirror state with a readable message", () => {
    expect(createDisconnectedSourceMirror("원본 탭을 연결해 주세요.")).toEqual({
      kind: "disconnected",
      url: null,
      title: null,
      lastSeenAt: null,
      message: "원본 탭을 연결해 주세요."
    });
  });

  it("returns quiz state only for playing and result mirror states", () => {
    const playing: SourceMirrorState = {
      kind: "playing",
      url: "https://machugi.io/quiz/1",
      title: "Pokemon",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      quiz
    };
    const home: SourceMirrorState = {
      kind: "home",
      url: "https://machugi.io/",
      title: "마추기 아이오",
      lastSeenAt: "2026-06-19T00:00:00.000Z",
      query: ""
    };

    expect(isPlayableSourceMirror(playing)).toBe(true);
    expect(quizFromSourceMirror(playing)).toEqual(quiz);
    expect(isPlayableSourceMirror(home)).toBe(false);
    expect(quizFromSourceMirror(home)).toBeNull();
  });
});
