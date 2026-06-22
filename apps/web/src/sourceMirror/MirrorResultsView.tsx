import type { MirrorQuizResult, SourceMirrorAction } from "@gatchi/shared";
import { useCallback, useEffect, useRef, type UIEvent } from "react";
import { MirrorCategoryNav } from "./MirrorCategoryNav";
import { MirrorSearchBox } from "./MirrorSearchBox";

const LOAD_MORE_RETRY_DELAY_MS = 1200;

export function MirrorResultsView(props: {
  currentUrl: string;
  query: string;
  results: MirrorQuizResult[];
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  const requestedAtCount = useRef<number | null>(null);
  const retryTimer = useRef<number | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimer.current === null) return;
    window.clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  useEffect(() => {
    if (requestedAtCount.current !== null && props.results.length > requestedAtCount.current) {
      requestedAtCount.current = null;
      clearRetryTimer();
    }
  }, [clearRetryTimer, props.results.length]);

  useEffect(() => {
    requestedAtCount.current = null;
    clearRetryTimer();
  }, [clearRetryTimer, props.query]);

  useEffect(() => clearRetryTimer, [clearRetryTimer]);

  const requestMoreResults = useCallback(() => {
    if (!props.isHost || requestedAtCount.current === props.results.length) return;

    const requestedCount = props.results.length;
    requestedAtCount.current = requestedCount;
    clearRetryTimer();
    retryTimer.current = window.setTimeout(() => {
      if (requestedAtCount.current === requestedCount) {
        requestedAtCount.current = null;
      }
      retryTimer.current = null;
    }, LOAD_MORE_RETRY_DELAY_MS);
    props.onAction({ name: "loadMoreResults" });
  }, [clearRetryTimer, props.isHost, props.onAction, props.results.length]);

  function handleResultScroll(event: UIEvent<HTMLDivElement>) {
    if (!props.isHost) return;

    const list = event.currentTarget;
    const reachedBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
    if (!reachedBottom) return;

    requestMoreResults();
  }

  return (
    <section className="mirror-results" aria-label="검색 결과">
      <MirrorCategoryNav currentUrl={props.currentUrl} isHost={props.isHost} onAction={props.onAction} />
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
