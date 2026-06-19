import { Home, Play } from "lucide-react";
import type { MirrorQuizResult, SourceMirrorAction } from "@gatchi/shared";

export function MirrorGameEndView(props: {
  summaryText: string;
  percentileText: string | null;
  results: MirrorQuizResult[];
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
  onHome: () => void;
}) {
  return (
    <section className="mirror-game-end" aria-label="게임 종료 화면">
      <div className="game-end-summary">
        <p>{props.summaryText}</p>
        {props.percentileText ? <strong>{props.percentileText}</strong> : null}
        {props.isHost ? (
          <div className="mirror-host-actions">
            <button type="button" onClick={() => props.onAction({ name: "startQuiz" })}>
              <Play size={17} />
              이어 풀기
            </button>
            <button type="button" onClick={props.onHome}>
              <Home size={17} />
              홈 화면
            </button>
          </div>
        ) : null}
      </div>

      {props.results.length > 0 ? (
        <div className="game-end-recommendations">
          <div className="section-heading">
            <h2>추천 퀴즈</h2>
            <span>{props.results.length}개</span>
          </div>
          <div className="mirror-result-grid compact">
            {props.results.map((result) => {
              const card = (
                <>
                  {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" /> : <div className="mirror-thumb-empty" />}
                  <span className="mirror-result-text">
                    <strong>{result.title}</strong>
                    {result.description ? <small>{result.description}</small> : null}
                  </span>
                </>
              );

              return props.isHost ? (
                <button
                  className="mirror-result-card"
                  type="button"
                  key={result.id}
                  aria-label={`${result.title} 선택`}
                  onClick={() => props.onAction({ name: "selectResult", resultId: result.id, href: result.href })}
                >
                  {card}
                </button>
              ) : (
                <article className="mirror-result-card read-only" key={result.id}>
                  {card}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
