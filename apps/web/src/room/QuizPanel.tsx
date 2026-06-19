import type { QuizState } from "@gatchi/shared";

export function QuizPanel({ quiz }: { quiz: QuizState }) {
  return (
    <section className="quiz-panel" aria-label="퀴즈">
      <div className="section-heading">
        <h2>{quiz.quizTitle ?? "퀴즈 대기 중"}</h2>
        <span>{quiz.questionIndex && quiz.totalQuestions ? `${quiz.questionIndex} / ${quiz.totalQuestions}` : quiz.questionType}</span>
      </div>

      <div className="question-stage">
        {quiz.imageUrl ? <img src={quiz.imageUrl} alt="" /> : null}
        {quiz.audioUrl ? <audio src={quiz.audioUrl} controls /> : null}
        {quiz.videoUrl ? <video src={quiz.videoUrl} controls /> : null}
        <p>{quiz.questionText ?? "아직 방장 확장 프로그램에서 문제를 보내지 않았습니다."}</p>
      </div>

      {quiz.choices.length > 0 ? (
        <div className="choice-grid">
          {quiz.choices.map((choice) => (
            <span key={choice.id}>{choice.label}</span>
          ))}
        </div>
      ) : null}

      {quiz.resultMessage ? <p className="result-message">{quiz.resultMessage}</p> : null}
    </section>
  );
}
