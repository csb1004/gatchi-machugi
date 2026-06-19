import type { MirrorQuizResult, SourceMirrorAction } from "@gatchi/shared";

export function MirrorResultsView(props: {
  query: string;
  results: MirrorQuizResult[];
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  return (
    <section className="mirror-results" aria-label="검색 결과">
      <div className="section-heading">
        <h2>검색 결과</h2>
        <span>{props.query}</span>
      </div>
      <div className="mirror-result-grid">
        {props.results.map((result) => {
          const card = (
            <>
              {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" /> : <div className="mirror-thumb-empty" />}
              <strong>{result.title}</strong>
              {result.description ? <small>{result.description}</small> : null}
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
    </section>
  );
}
