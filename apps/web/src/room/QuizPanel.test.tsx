import "@testing-library/jest-dom/vitest";
import type { QuizState } from "@gatchi/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuizPanel } from "./QuizPanel";

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
    expect(screen.queryByText("아직 방장 확장 프로그램에서 문제를 보내지 않았습니다.")).not.toBeInTheDocument();
  });
});
