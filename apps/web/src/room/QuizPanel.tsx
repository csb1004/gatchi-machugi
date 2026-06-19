import type { QuizState } from "@gatchi/shared";

export function QuizPanel({ quiz }: { quiz: QuizState }) {
  const hasMedia = Boolean(quiz.imageUrl || quiz.audioUrl || quiz.videoUrl);
  const hasQuestionText = Boolean(quiz.questionText);
  const progress =
    quiz.questionIndex !== null && quiz.totalQuestions !== null ? `${quiz.questionIndex} / ${quiz.totalQuestions}` : quiz.questionType;
  const fallback = quiz.quizTitle ? "문제를 불러오는 중입니다." : "아직 원본 창에서 문제를 읽어오지 않았습니다.";

  return (
    <section className="quiz-panel" aria-label="퀴즈">
      <div className="section-heading">
        <h2>{quiz.quizTitle ?? "퀴즈 대기 중"}</h2>
        <span>{progress}</span>
      </div>

      <div className="question-stage">
        {quiz.imageUrl ? <img src={quiz.imageUrl} alt="" /> : null}
        {quiz.audioUrl ? <audio src={quiz.audioUrl} controls /> : null}
        {quiz.videoUrl ? <video src={quiz.videoUrl} controls /> : null}
        {hasQuestionText || !hasMedia ? <p>{quiz.questionText ?? fallback}</p> : null}
      </div>

      {quiz.choices.length > 0 ? (
        <div className="choice-grid">
          {quiz.choices.map((choice) => (
            <span key={choice.id}>{choice.label}</span>
          ))}
        </div>
      ) : null}

      {quiz.resultMessage ? <p className="result-message">{quiz.resultMessage}</p> : null}

      {quiz.answerCandidates.length > 0 ? (
        <div className="answer-candidates">
          <strong>정답</strong>
          {quiz.answerCandidates.map((answer) => (
            <span key={answer}>{answer}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
