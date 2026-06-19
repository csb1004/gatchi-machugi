import { Copy, Download, ExternalLink, Link2, ShieldCheck } from "lucide-react";
import type { RoomState } from "@gatchi/shared";

function lockLabel(status: RoomState["fairPlay"]["originalSubmitStatus"]) {
  const labels: Record<RoomState["fairPlay"]["originalSubmitStatus"], string> = {
    idle: "대기 중",
    locked: "원본 제출 잠금",
    ready: "원본 제출 가능",
    submitting: "원본 제출 중",
    "result-opened": "결과 확인 완료",
    unsupported: "지원되지 않는 문제"
  };
  return labels[status];
}

function sourceLabel(status: RoomState["sourceWindow"]["status"]) {
  const labels: Record<RoomState["sourceWindow"]["status"], string> = {
    connected: "원본 창 연결됨",
    disconnected: "원본 창 필요",
    unsupported: "원본 창 지원 불가"
  };
  return labels[status];
}

export function HostWorkspace({
  state,
  extensionReleaseUrl,
  extensionSyncLabel,
  onResendPairing
}: {
  state: RoomState;
  extensionReleaseUrl: string;
  extensionSyncLabel: string;
  onResendPairing: () => void;
}) {
  const submittedCount = state.fairPlay.submittedParticipantIds.length;
  const requiredCount =
    state.fairPlay.requiredParticipantIds.length || state.participants.filter((participant) => participant.connected).length;
  const sourceConnected = state.sourceWindow.status === "connected";
  const sourceTitle = state.sourceWindow.title ?? "마추기아이오 원본 창을 열어주세요.";
  const sourceDetail = state.sourceWindow.message ?? state.sourceWindow.url ?? "문제를 선택하면 우리 화면에 표시됩니다.";

  return (
    <section className="host-workspace" aria-label="방장 진행 화면">
      <div className="host-workspace-bar">
        <div>
          <p className="eyebrow">{state.roomCode}</p>
          <h2>방장 화면</h2>
        </div>
        <div className="host-workspace-status">
          <span className={state.hostExtensionConnected ? "host-badge online" : "host-badge"}>
            <Link2 size={15} />
            {state.hostExtensionConnected ? "확장 연결됨" : "확장 프로그램 연결 필요"}
          </span>
          <span className={sourceConnected ? "host-badge online" : "host-badge"}>{sourceLabel(state.sourceWindow.status)}</span>
          <span className="host-badge">
            <ShieldCheck size={15} />
            {lockLabel(state.fairPlay.originalSubmitStatus)}
          </span>
          <strong>
            {submittedCount} / {requiredCount}명 제출
          </strong>
        </div>
      </div>

      <div className="host-source-panel">
        <span className={sourceConnected ? "host-badge online" : "host-badge"}>{sourceLabel(state.sourceWindow.status)}</span>
        <strong>{sourceTitle}</strong>
        <span>{sourceDetail}</span>
        <a className="setup-link" href="https://machugi.io/" target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          마추기아이오 열기
        </a>
      </div>

      <div className="host-workspace-footer">
        <span>{state.fairPlay.lockReason ?? extensionSyncLabel}</span>
        <button type="button" onClick={onResendPairing}>
          <Copy size={16} />
          확장 프로그램에 저장
        </button>
        {!state.hostExtensionConnected ? (
          <a className="setup-link" href={extensionReleaseUrl} target="_blank" rel="noreferrer">
            <Download size={16} />
            확장 프로그램 다운로드
          </a>
        ) : null}
      </div>
    </section>
  );
}
