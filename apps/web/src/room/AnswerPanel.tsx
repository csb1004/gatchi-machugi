import { Send } from "lucide-react";
import { useState } from "react";
import type { QuizState } from "@gatchi/shared";

export function AnswerPanel({
  disabled,
  quiz,
  onSubmitAnswer
}: {
  disabled: boolean;
  quiz: QuizState;
  onSubmitAnswer: (rawAnswer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const canSubmit = !disabled && answer.trim().length > 0;

  return (
    <section className="answer-panel" aria-label="답변">
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
        type="button"
        disabled={!canSubmit}
        onClick={() => {
          onSubmitAnswer(answer);
          setAnswer("");
        }}
      >
        <Send size={18} />
        제출
      </button>
    </section>
  );
}
