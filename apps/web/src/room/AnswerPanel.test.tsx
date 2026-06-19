import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnswerPanel } from "./AnswerPanel";

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
  canGoNext: false,
  canGoPrevious: false,
  resultMessage: null,
  answerCandidates: []
};

describe("AnswerPanel", () => {
  it("submits the answer with the Enter key", () => {
    const onSubmitAnswer = vi.fn();
    render(<AnswerPanel disabled={false} quiz={quiz} onSubmitAnswer={onSubmitAnswer} />);

    fireEvent.change(screen.getByRole("textbox", { name: "답변" }), { target: { value: "미샤" } });
    fireEvent.submit(screen.getByRole("form", { name: "답변" }));

    expect(onSubmitAnswer).toHaveBeenCalledWith("미샤");
  });

  it("keeps a submitted answer editable until the round locks", () => {
    const onSubmitAnswer = vi.fn();
    render(<AnswerPanel disabled={false} submitted quiz={quiz} onSubmitAnswer={onSubmitAnswer} />);

    const input = screen.getByRole("textbox", { name: "답변" });
    fireEvent.change(input, { target: { value: "미샤" } });
    const editButton = screen.getByRole("button", { name: "수정" });
    fireEvent.click(editButton);

    expect(input).not.toBeDisabled();
    expect(screen.getByText("제출한 답: 미샤")).toBeInTheDocument();
    expect(editButton).toHaveClass("is-editing");
    expect(onSubmitAnswer).toHaveBeenCalledWith("미샤");
  });

  it("focuses the answer input when a new enabled question arrives", () => {
    const { rerender } = render(
      <AnswerPanel disabled={false} quiz={quiz} resetKey="q1" onSubmitAnswer={() => undefined} />
    );
    const input = screen.getByRole("textbox", { name: "답변" });
    input.blur();

    rerender(<AnswerPanel disabled={false} quiz={quiz} resetKey="q2" onSubmitAnswer={() => undefined} />);

    expect(input).toHaveFocus();
  });

  it("submits multiple-choice answers by clicking the choice", () => {
    const onSubmitAnswer = vi.fn();
    render(
      <AnswerPanel
        disabled={false}
        quiz={{
          ...quiz,
          questionType: "multiple-choice",
          choices: [
            { id: "1", label: "가능" },
            { id: "2", label: "불가능" }
          ]
        }}
        onSubmitAnswer={onSubmitAnswer}
      />
    );

    expect(screen.queryByRole("textbox", { name: "답변" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "가능" }));

    expect(onSubmitAnswer).toHaveBeenCalledWith("가능");
    expect(screen.getByText("제출한 답: 가능")).toBeInTheDocument();
  });
});
