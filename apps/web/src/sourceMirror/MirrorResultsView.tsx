import type { MirrorQuizResult, SourceMirrorAction } from "@gatchi/shared";
import { useEffect, useRef, type UIEvent } from "react";
import { MirrorSearchBox } from "./MirrorSearchBox";

export function MirrorResultsView(props: {
  query: string;
  results: MirrorQuizResult[];
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  const requestedAtCount = useRef<number | null>(null);

  useEffect(() => {
    if (requestedAtCount.current !== null && props.results.length > requestedAtCount.current) {
      requestedAtCount.current = null;
    }
  }, [props.results.length]);

  useEffect(() => {
    requestedAtCount.current = null;
  }, [props.query]);

  function handleResultScroll(event: UIEvent<HTMLDivElement>) {
    if (!props.isHost) return;

    const list = event.currentTarget;
    const reachedBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
    if (!reachedBottom || requestedAtCount.current === props.results.length) return;

    requestedAtCount.current = props.results.length;
    props.onAction({ name: "loadMoreResults" });
  }

  return (
    <section className="mirror-results" aria-label="검색 결과">
      <MirrorSearchBox initialQuery={props.query} isHost={props.isHost} onAction={props.onAction} />
      <div className="section-heading mirror-results-heading">
        <h2>검색 결과</h2>
        <span>{props.results.length}개</span>
      </div>
      <div className="mirror-result-scroll" role="region" aria-label="검색 결과 목록" onScroll={handleResultScroll}>
        <div className="mirror-result-grid">
          {props.results.map((result) => {
            const card = (
              <>
                {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" /> : <div className="mirror-thumb-empty" />}
                <span className="mirror-result-text">
                  <strong>{result.title}</strong>
                  {result.description ? <small>{result.description}</small> : null}
                  {result.meta.length > 0 ? (
                    <span className="mirror-result-meta">
                      {result.meta.map((meta) => (
                        <em key={meta}>{meta}</em>
                      ))}
                    </span>
                  ) : null}
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
    </section>
  );
}
