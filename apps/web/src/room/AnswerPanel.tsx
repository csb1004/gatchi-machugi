import { Send } from "lucide-react";
import { useEffect, useState } from "react";
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
  const canSubmit = !disabled && answer.trim().length > 0;
  const submitLabel = submitted ? (disabled ? "제출 완료" : "수정") : "제출";

  useEffect(() => {
    setAnswer("");
  }, [resetKey]);

  function submitAnswer() {
    if (!canSubmit) return;
    onSubmitAnswer(answer);
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
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={disabled}
          placeholder={quiz.questionType === "ox" ? "O / X" : ""}
        />
      </label>
      <button
        className="primary-button"
        type="submit"
        disabled={!canSubmit}
      >
        <Send size={18} />
        {submitLabel}
      </button>
    </form>
  );
}
