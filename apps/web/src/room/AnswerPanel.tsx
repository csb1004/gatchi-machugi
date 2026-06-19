import { Send } from "lucide-react";
import { useState } from "react";
import type { QuizState } from "@gatchi/shared";

export function AnswerPanel({
  disabled,
  submitted = false,
  quiz,
  onSubmitAnswer
}: {
  disabled: boolean;
  submitted?: boolean;
  quiz: QuizState;
  onSubmitAnswer: (rawAnswer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const canSubmit = !disabled && !submitted && answer.trim().length > 0;

  return (
    <section className="answer-panel" aria-label="답변">
      <label>
        답변
        <input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={disabled || submitted}
          placeholder={quiz.questionType === "ox" ? "O / X" : ""}
        />
      </label>
      <button
        className="primary-button"
        type="button"
        disabled={!canSubmit}
        onClick={() => {
          onSubmitAnswer(answer);
          setAnswer("");
        }}
      >
        <Send size={18} />
        {submitted ? "제출 완료" : "제출"}
      </button>
    </section>
  );
}
