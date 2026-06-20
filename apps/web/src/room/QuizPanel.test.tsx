import "@testing-library/jest-dom/vitest";
import type { QuizState } from "@gatchi/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuizPanel } from "./QuizPanel";

const youtubeUrl = "https://www.youtube-nocookie.com/embed/seoefKzVDOk?start=0.5&end=141";

const baseQuiz: QuizState = {
  quizTitle: "Pokemon",
  questionIndex: null,
  totalQuestions: null,
  questionType: "image",
  questionText: null,
  imageUrl: "https://images.machugi.io/question-image",
  audioUrl: null,
  videoUrl: null,
  choices: [],
  timerSecondsRemaining: null,
  canGoNext: true,
  canGoPrevious: false,
  resultMessage: null,
  answerCandidates: []
};

describe("QuizPanel", () => {
  it("does not show the waiting fallback when an image question is present", () => {
    render(<QuizPanel quiz={baseQuiz} />);

    expect(document.querySelector("img")).toHaveAttribute("src", "https://images.machugi.io/question-image");
    expect(screen.queryByText("원본 탭에서 문제를 준비하는 중입니다.")).not.toBeInTheDocument();
  });

  it("shows answer candidates from the original result screen", () => {
    render(<QuizPanel quiz={{ ...baseQuiz, resultMessage: "오답!", answerCandidates: ["이브이"] }} />);

    expect(screen.getByText("오답!")).toBeInTheDocument();
    expect(screen.getByText("정답")).toBeInTheDocument();
    expect(screen.getByText("이브이")).toBeInTheDocument();
  });

  it("hides YouTube video during audio questions behind an audio-only control", () => {
    render(
      <QuizPanel
        quiz={{
          ...baseQuiz,
          questionType: "audio",
          imageUrl: null,
          audioUrl: youtubeUrl
        }}
      />
    );

    expect(screen.getByRole("button", { name: "재생" })).toBeInTheDocument();
    expect(document.querySelector(".youtube-audio-frame")?.getAttribute("src")).toContain("youtube-nocookie.com/embed/seoefKzVDOk");
    expect(document.querySelector(".question-embed")).not.toBeInTheDocument();
    expect(document.querySelector("audio")).not.toBeInTheDocument();
  });

  it("enables the YouTube player API for hidden audio playback", () => {
    render(
      <QuizPanel
        quiz={{
          ...baseQuiz,
          questionType: "audio",
          imageUrl: null,
          audioUrl: youtubeUrl
        }}
      />
    );

    const src = document.querySelector(".youtube-audio-frame")?.getAttribute("src") ?? "";
    expect(src).toContain("enablejsapi=1");
    expect(src).toContain("playsinline=1");
  });

  it("shows audio playback as a progress bar without explanatory copy", () => {
    render(
      <QuizPanel
        quiz={{
          ...baseQuiz,
          questionType: "audio",
          imageUrl: null,
          audioUrl: "https://www.youtube-nocookie.com/embed/seoefKzVDOk?start=10&end=15"
        }}
      />
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "5");
    expect(screen.getByText("0:00 / 0:05")).toBeInTheDocument();
    expect(screen.queryByText("음원 문제")).not.toBeInTheDocument();
    expect(screen.queryByText("영상은 가리고 소리만 재생합니다.")).not.toBeInTheDocument();
  });

  it("lets listeners replay a timed audio clip after it reaches the end", () => {
    vi.useFakeTimers();
    try {
      render(
        <QuizPanel
          quiz={{
            ...baseQuiz,
            questionType: "audio",
            imageUrl: null,
            audioUrl: "https://www.youtube-nocookie.com/embed/seoefKzVDOk?start=10&end=15"
          }}
        />
      );

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "재생" }));
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByRole("button", { name: "다시 듣기" })).toBeInTheDocument();
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "다시 듣기" }));
      });

      expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
      expect(screen.getByText("0:00 / 0:05")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves multiple-choice answers to the answer panel instead of duplicating them", () => {
    render(
      <QuizPanel
        quiz={{
          ...baseQuiz,
          questionType: "multiple-choice",
          choices: [
            { id: "1", label: "불가능" },
            { id: "2", label: "가능" }
          ]
        }}
      />
    );

    expect(document.querySelector(".choice-grid")).not.toBeInTheDocument();
  });

  it("shows the YouTube embed on audio result screens", () => {
    render(
      <QuizPanel
        quiz={{
          ...baseQuiz,
          questionType: "audio",
          imageUrl: null,
          audioUrl: youtubeUrl,
          resultMessage: "정답!",
          answerCandidates: ["Song title"]
        }}
      />
    );

    expect(screen.getByTitle("정답 음원").getAttribute("src")).toContain("youtube-nocookie.com/embed/seoefKzVDOk");
    expect(screen.queryByRole("button", { name: "재생" })).not.toBeInTheDocument();
  });
});
