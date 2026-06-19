import { ExternalLink, RefreshCw } from "lucide-react";
import type { SourceMirrorAction } from "@gatchi/shared";

export function MirrorUnsupportedView(props: {
  title: string;
  message: string;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  return (
    <section className="mirror-unsupported" aria-label={props.title}>
      <h2>{props.title}</h2>
      <p>{props.message}</p>
      {props.isHost ? (
        <div className="mirror-fallback-actions">
          <button type="button" onClick={() => props.onAction({ name: "refreshSource" })}>
            <RefreshCw size={18} />
            다시 읽기
          </button>
          <button type="button" onClick={() => props.onAction({ name: "focusOriginalTab" })}>
            <ExternalLink size={18} />
            원본 탭 열기
          </button>
        </div>
      ) : null}
    </section>
  );
}
