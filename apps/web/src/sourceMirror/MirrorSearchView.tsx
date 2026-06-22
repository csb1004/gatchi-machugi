import type { SourceMirrorAction } from "@gatchi/shared";
import { MirrorSearchBox } from "./MirrorSearchBox";

export function MirrorSearchView(props: {
  initialQuery: string;
  currentUrl: string;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  return (
    <section className="mirror-search" aria-label="마추기 검색">
      <MirrorSearchBox
        currentUrl={props.currentUrl}
        initialQuery={props.initialQuery}
        isHost={props.isHost}
        onAction={props.onAction}
      />
      {!props.isHost ? <p className="mirror-note">방장이 퀴즈를 검색하는 중입니다.</p> : null}
    </section>
  );
}
