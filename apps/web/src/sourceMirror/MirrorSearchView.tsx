import { Search } from "lucide-react";
import { useState } from "react";
import type { SourceMirrorAction } from "@gatchi/shared";

export function MirrorSearchView(props: {
  initialQuery: string;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  const [query, setQuery] = useState(props.initialQuery);

  function submit() {
    const trimmed = query.trim();
    if (!trimmed || !props.isHost) return;
    props.onAction({ name: "search", query: trimmed });
  }

  return (
    <section className="mirror-search" aria-label="마추기 검색">
      <div className="mirror-search-bar">
        <label>
          검색어
          <input
            value={query}
            disabled={!props.isHost}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        </label>
        <button type="button" disabled={!props.isHost || !query.trim()} onClick={submit}>
          <Search size={18} />
          검색
        </button>
      </div>
      {!props.isHost ? <p className="mirror-note">방장이 퀴즈를 검색하는 중입니다.</p> : null}
    </section>
  );
}
