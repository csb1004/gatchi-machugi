import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { SourceMirrorAction } from "@gatchi/shared";
import { activeCategoryId, MirrorCategoryNav } from "./MirrorCategoryNav";

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
    if (!props.isHost) return;

    const trimmed = query.trim();
    const categoryId = activeCategoryId(props.currentUrl);
    props.onAction(
      trimmed
        ? categoryId
          ? { name: "search", query: trimmed, categoryId }
          : { name: "search", query: trimmed }
        : { name: "focusHome" }
    );
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
        <button type="button" disabled={!props.isHost} onClick={submit}>
          <Search size={18} />
          검색
        </button>
      </div>
      <MirrorCategoryNav
        currentUrl={props.currentUrl}
        homeQuery={props.initialQuery}
        isHost={props.isHost}
        onAction={props.onAction}
      />
    </>
  );
}
