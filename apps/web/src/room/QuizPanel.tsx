import type { QuizState } from "@gatchi/shared";

function isEmbedUrl(url: string | null): url is string {
  return Boolean(url && /(?:youtube(?:-nocookie)?\.com\/embed|youtu\.be)/i.test(url));
}

export function QuizPanel({ quiz }: { quiz: QuizState }) {
  const hasMedia = Boolean(quiz.imageUrl || quiz.audioUrl || quiz.videoUrl);
  const hasQuestionText = Boolean(quiz.questionText);
  const audioEmbedUrl = isEmbedUrl(quiz.audioUrl) ? quiz.audioUrl : null;
  const videoEmbedUrl = isEmbedUrl(quiz.videoUrl) ? quiz.videoUrl : null;
  const progress =
    quiz.questionIndex !== null && quiz.totalQuestions !== null ? `${quiz.questionIndex} / ${quiz.totalQuestions}` : quiz.questionType;
  const fallback = quiz.quizTitle
    ? "원본 탭에서 문제를 준비하는 중입니다."
    : "방장이 퀴즈를 선택하면 여기에 문제가 표시됩니다.";

  return (
    <section className="quiz-panel" aria-label="퀴즈">
      <div className="section-heading">
        <h2>{quiz.quizTitle ?? "퀴즈 대기 중"}</h2>
        <span>{progress}</span>
      </div>

      <div className="question-stage">
        {quiz.imageUrl ? <img src={quiz.imageUrl} alt="" /> : null}
        {audioEmbedUrl ? (
          <iframe className="question-embed" src={audioEmbedUrl} title="음원 문제" allow="autoplay; encrypted-media; picture-in-picture" />
        ) : quiz.audioUrl ? (
          <audio src={quiz.audioUrl} controls />
        ) : null}
        {videoEmbedUrl ? (
          <iframe className="question-embed" src={videoEmbedUrl} title="영상 문제" allow="autoplay; encrypted-media; picture-in-picture" />
        ) : quiz.videoUrl ? (
          <video src={quiz.videoUrl} controls />
        ) : null}
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
