import { Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { QuizState } from "@gatchi/shared";

function isEmbedUrl(url: string | null): url is string {
  return Boolean(url && /(?:youtube(?:-nocookie)?\.com\/embed|youtube\.com\/watch|youtu\.be)/i.test(url));
}

function isResultQuiz(quiz: QuizState): boolean {
  return Boolean(quiz.resultMessage || quiz.answerCandidates.length > 0);
}

function youtubeApiSrc(src: string): string {
  try {
    const url = new URL(src, window.location.href);
    if (/youtu\.be$/i.test(url.hostname)) {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      if (videoId) {
        url.hostname = "www.youtube-nocookie.com";
        url.pathname = `/embed/${videoId}`;
      }
    } else if (/youtube\.com$/i.test(url.hostname) && url.pathname === "/watch") {
      const videoId = url.searchParams.get("v");
      if (videoId) {
        url.hostname = "www.youtube-nocookie.com";
        url.pathname = `/embed/${videoId}`;
        url.searchParams.delete("v");
      }
    }

    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("playsinline", "1");
    if (window.location.origin && window.location.origin !== "null") {
      url.searchParams.set("origin", window.location.origin);
    }
    return url.toString();
  } catch {
    return src;
  }
}

function YoutubeAudioOnlyPlayer({ src }: { src: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const apiSrc = useMemo(() => youtubeApiSrc(src), [src]);

  function sendCommand(command: "playVideo" | "pauseVideo") {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({
        event: "command",
        func: command,
        args: []
      }),
      "*"
    );
  }

  useEffect(() => {
    sendCommand(isPlaying ? "playVideo" : "pauseVideo");
  }, [isPlaying]);

  function togglePlayback() {
    setIsPlaying((current) => !current);
  }

  return (
    <div className="youtube-audio-only">
      <iframe
        ref={iframeRef}
        className="youtube-audio-frame"
        src={apiSrc}
        title="숨겨진 음원 플레이어"
        allow="autoplay; encrypted-media"
        onLoad={() => {
          if (isPlaying) sendCommand("playVideo");
        }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="youtube-audio-shell">
        <Volume2 size={28} aria-hidden="true" />
        <div>
          <strong>음원 문제</strong>
          <span>영상은 가리고 소리만 재생합니다.</span>
        </div>
        <button type="button" onClick={togglePlayback} aria-pressed={isPlaying}>
          {isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          {isPlaying ? "일시정지" : "재생"}
        </button>
      </div>
    </div>
  );
}

export function QuizPanel({ quiz }: { quiz: QuizState }) {
  const hasMedia = Boolean(quiz.imageUrl || quiz.audioUrl || quiz.videoUrl);
  const hasQuestionText = Boolean(quiz.questionText);
  const audioEmbedUrl = isEmbedUrl(quiz.audioUrl) ? quiz.audioUrl : null;
  const videoEmbedUrl = isEmbedUrl(quiz.videoUrl) ? quiz.videoUrl : null;
  const isResult = isResultQuiz(quiz);
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
          isResult ? (
            <iframe
              className="question-embed"
              src={youtubeApiSrc(audioEmbedUrl)}
              title="정답 음원"
              allow="autoplay; encrypted-media; picture-in-picture"
            />
          ) : (
            <YoutubeAudioOnlyPlayer src={audioEmbedUrl} />
          )
        ) : quiz.audioUrl ? (
          <audio src={quiz.audioUrl} controls />
        ) : null}
        {videoEmbedUrl ? (
          <iframe className="question-embed" src={youtubeApiSrc(videoEmbedUrl)} title="영상 문제" allow="autoplay; encrypted-media; picture-in-picture" />
        ) : quiz.videoUrl ? (
          <video src={quiz.videoUrl} controls />
        ) : null}
        {hasQuestionText || !hasMedia ? <p>{quiz.questionText ?? fallback}</p> : null}
      </div>

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
