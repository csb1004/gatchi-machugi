import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { QuizState } from "@gatchi/shared";

export function AnswerPanel({
  disabled,
  submitted = false,
  quiz,
  resetKey,
  onSubmitAnswer
}: {
  disabled: boolean;
  submitted?: boolean;
  quiz: QuizState;
  resetKey?: string | null;
  onSubmitAnswer: (rawAnswer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [choiceSnapshot, setChoiceSnapshot] = useState(quiz.choices);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleChoices = quiz.choices.length > 0 ? quiz.choices : choiceSnapshot;
  const hasChoices = visibleChoices.length > 0;
  const canSubmit = !disabled && answer.trim().length > 0;
  const submitLabel = submitted ? (disabled ? "제출 완료" : "수정") : "제출";
  const submittedAnswer = submitted || hasChoices ? answer.trim() : "";

  useEffect(() => {
    setAnswer("");
    setChoiceSnapshot(quiz.choices);
  }, [resetKey]);

  useEffect(() => {
    if (quiz.choices.length > 0) setChoiceSnapshot(quiz.choices);
  }, [quiz.choices]);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled, resetKey]);

  function submitAnswer() {
    if (!canSubmit) return;
    onSubmitAnswer(answer);
  }

  function submitChoice(choiceLabel: string) {
    if (disabled) return;
    setAnswer(choiceLabel);
    onSubmitAnswer(choiceLabel);
  }

  if (hasChoices) {
    return (
      <form className="answer-panel choice-answer-panel" aria-label="답변">
        <div className="choice-answer-grid" role="group" aria-label="선택지">
          {visibleChoices.map((choice) => (
            <button
              key={choice.id}
              className={`choice-answer-button${answer === choice.label ? " selected" : ""}`}
              type="button"
              disabled={disabled}
              onClick={() => submitChoice(choice.label)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        {submittedAnswer ? <p className="submitted-answer">제출한 답: {submittedAnswer}</p> : null}
      </form>
    );
  }

  return (
    <form
      className="answer-panel"
      aria-label="답변"
      onSubmit={(event) => {
        event.preventDefault();
        submitAnswer();
      }}
    >
      <label>
        답변
        <input
          ref={inputRef}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={disabled}
          placeholder={quiz.questionType === "ox" ? "O / X" : ""}
        />
      </label>
      <button
        className={`primary-button answer-submit-button${submitted && !disabled ? " is-editing" : ""}`}
        type="submit"
        disabled={!canSubmit}
      >
        <Send size={18} />
        {submitLabel}
      </button>
      {submittedAnswer ? <p className="submitted-answer">제출한 답: {submittedAnswer}</p> : null}
    </form>
  );
}
