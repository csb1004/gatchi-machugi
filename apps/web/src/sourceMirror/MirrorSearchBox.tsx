import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { SourceMirrorAction } from "@gatchi/shared";
import { MirrorCategoryNav } from "./MirrorCategoryNav";

export function MirrorSearchBox(props: {
  initialQuery: string;
  currentUrl: string;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  const [query, setQuery] = useState(props.initialQuery);

  useEffect(() => {
    setQuery(props.initialQuery);
  }, [props.initialQuery]);

  function submit() {
    const trimmed = query.trim();
    if (!trimmed || !props.isHost) return;
    props.onAction({ name: "search", query: trimmed });
  }

  return (
    <>
      <div className="mirror-search-bar">
        <label>
          검색어
          <input
            value={query}
            disabled={!props.isHost}
            placeholder="검색어를 입력하세요"
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
      <MirrorCategoryNav currentUrl={props.currentUrl} isHost={props.isHost} onAction={props.onAction} />
    </>
  );
}
