import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SourceMirrorState } from "@gatchi/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceMirrorView } from "./SourceMirrorView";

const home: SourceMirrorState = {
  kind: "home",
  url: "https://machugi.io/",
  title: "마추기 아이오",
  lastSeenAt: "2026-06-19T00:00:00.000Z",
  query: ""
};

const results: SourceMirrorState = {
  kind: "searchResults",
  url: "https://machugi.io/search?q=pokemon",
  title: "검색",
  lastSeenAt: "2026-06-19T00:00:00.000Z",
  query: "pokemon",
  results: [
    {
      id: "https://machugi.io/quiz/123",
      title: "포켓몬 실루엣 맞추기",
      href: "https://machugi.io/quiz/123",
      thumbnailUrl: null,
      description: "20문제",
      meta: ["20문제"]
    }
  ]
};

const quizDetail: SourceMirrorState = {
  kind: "quizDetail",
  url: "https://machugi.io/quiz/123",
  title: "포켓몬 실루엣 맞추기",
  lastSeenAt: "2026-06-19T00:00:00.000Z",
  quiz: {
    title: "포켓몬 실루엣 맞추기",
    href: "https://machugi.io/quiz/123",
    thumbnailUrl: null,
    description: "포켓몬 이름을 맞춥니다.",
    meta: []
  },
  settings: {
    timerSeconds: null,
    questionCount: 10,
    availableTimers: [3, 5, 10],
    availableQuestionCounts: [10, 20]
  }
};

afterEach(() => {
  vi.useRealTimers();
});

describe("SourceMirrorView", () => {
  it("lets the host search from the mirrored home view", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={home} isHost onAction={onAction} />);

    fireEvent.change(screen.getByLabelText("검색어"), { target: { value: "pokemon" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(onAction).toHaveBeenCalledWith({ name: "search", query: "pokemon" });
  });

  it("shows search results and lets only the host select them", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "포켓몬 실루엣 맞추기 선택" }));

    expect(onAction).toHaveBeenCalledWith({
      name: "selectResult",
      resultId: "https://machugi.io/quiz/123",
      href: "https://machugi.io/quiz/123"
    });
  });

  it("lets the host search again from the results view", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    fireEvent.change(screen.getByLabelText("검색어"), { target: { value: "anime" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(onAction).toHaveBeenCalledWith({ name: "search", query: "anime" });
  });

  it("asks the host extension for more results when the mirrored result list reaches the bottom", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    const list = screen.getByRole("region", { name: "검색 결과 목록" });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 800 });
    Object.defineProperty(list, "scrollTop", { configurable: true, value: 500 });
    fireEvent.scroll(list);

    expect(onAction).toHaveBeenCalledWith({ name: "loadMoreResults" });
  });

  it("does not ask for more results when only the surrounding page reaches the bottom", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 400 });
    fireEvent.scroll(window);

    expect(onAction).not.toHaveBeenCalledWith({ name: "loadMoreResults" });
  });

  it("allows another bottom-scroll load request after the search query changes", () => {
    const onAction = vi.fn();
    const { rerender } = render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    const scrollToBottom = () => {
      const list = screen.getByRole("region", { name: "검색 결과 목록" });
      Object.defineProperty(list, "clientHeight", { configurable: true, value: 300 });
      Object.defineProperty(list, "scrollHeight", { configurable: true, value: 800 });
      Object.defineProperty(list, "scrollTop", { configurable: true, value: 500 });
      fireEvent.scroll(list);
    };

    scrollToBottom();
    rerender(<SourceMirrorView state={{ ...results, query: "anime" }} isHost onAction={onAction} />);
    scrollToBottom();

    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenNthCalledWith(1, { name: "loadMoreResults" });
    expect(onAction).toHaveBeenNthCalledWith(2, { name: "loadMoreResults" });
  });

  it("allows retrying a bottom-scroll load request after the previous request has time to settle", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    const scrollToBottom = () => {
      const list = screen.getByRole("region", { name: "검색 결과 목록" });
      Object.defineProperty(list, "clientHeight", { configurable: true, value: 300 });
      Object.defineProperty(list, "scrollHeight", { configurable: true, value: 800 });
      Object.defineProperty(list, "scrollTop", { configurable: true, value: 500 });
      fireEvent.scroll(list);
    };

    scrollToBottom();
    scrollToBottom();
    expect(onAction).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1500);
    scrollToBottom();

    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it("shows a host home button on the mirrored quiz setup screen", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={quizDetail} isHost onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "홈 화면" }));

    expect(onAction).toHaveBeenCalledWith({ name: "focusHome" });
  });

  it("shows host navigation controls during a mirrored quiz", () => {
    const onAction = vi.fn();
    render(
      <SourceMirrorView
        isHost
        onAction={onAction}
        state={{
          kind: "result",
          url: "https://machugi.io/quiz/123/play",
          title: "Pokemon",
          lastSeenAt: "2026-06-19T00:00:00.000Z",
          quiz: {
            quizTitle: "Pokemon",
            questionIndex: 1,
            totalQuestions: 10,
            questionType: "image",
            questionText: null,
            imageUrl: "https://images.machugi.io/question.png",
            audioUrl: null,
            videoUrl: null,
            choices: [],
            timerSecondsRemaining: null,
            canGoNext: true,
            canGoPrevious: false,
            resultMessage: "오답!",
            answerCandidates: ["디안시"]
          }
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "홈 화면" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 문제" }));

    expect(onAction).toHaveBeenCalledWith({ name: "focusHome" });
    expect(onAction).toHaveBeenCalledWith({ name: "next" });
  });

  it("renders participant results as read-only", () => {
    render(<SourceMirrorView state={results} isHost={false} onAction={() => undefined} />);

    expect(screen.getByText("포켓몬 실루엣 맞추기")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "포켓몬 실루엣 맞추기 선택" })).not.toBeInTheDocument();
  });

  it("shows Korean fallback actions for unsupported host states", () => {
    render(
      <SourceMirrorView
        isHost
        onAction={() => undefined}
        state={{
          kind: "unsupported",
          url: "https://machugi.io/unknown",
          title: "Unknown",
          lastSeenAt: "2026-06-19T00:00:00.000Z",
          reason: "원본 사이트의 현재 화면을 읽을 수 없습니다."
        }}
      />
    );

    expect(screen.getByText("이 화면은 아직 읽을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /다시 읽기/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /원본 탭 열기/ })).toBeInTheDocument();
  });
});
