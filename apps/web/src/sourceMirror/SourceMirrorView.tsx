import { ArrowRight, Home, SkipForward } from "lucide-react";
import { useRef } from "react";
import type { SourceMirrorAction, SourceMirrorState } from "@gatchi/shared";
import { QuizPanel } from "../room/QuizPanel";
import { MirrorGameEndView } from "./MirrorGameEndView";
import { MirrorResultsView } from "./MirrorResultsView";
import { MirrorSearchView } from "./MirrorSearchView";
import { MirrorSetupView } from "./MirrorSetupView";
import { MirrorUnsupportedView } from "./MirrorUnsupportedView";

export function SourceMirrorView(props: {
  state: SourceMirrorState;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  const lastSearchQuery = useRef("");
  if (props.state.kind === "home" || props.state.kind === "searchResults") {
    lastSearchQuery.current = props.state.query.trim();
  }

  function sendAction(action: SourceMirrorAction) {
    if (action.name === "search") lastSearchQuery.current = action.query.trim();
    props.onAction(action);
  }

  function focusHome() {
    const query = lastSearchQuery.current.trim();
    sendAction(query ? { name: "focusHome", query } : { name: "focusHome" });
  }

  function sendSetupAction(action: SourceMirrorAction) {
    if (action.name === "focusHome") {
      focusHome();
      return;
    }

    sendAction(action);
  }

  if (props.state.kind === "home") {
    return <MirrorSearchView initialQuery={props.state.query} isHost={props.isHost} onAction={sendAction} />;
  }

  if (props.state.kind === "searchResults") {
    return <MirrorResultsView query={props.state.query} results={props.state.results} isHost={props.isHost} onAction={sendAction} />;
  }

  if (props.state.kind === "quizDetail") {
    return <MirrorSetupView quiz={props.state.quiz} settings={props.state.settings} isHost={props.isHost} onAction={sendSetupAction} />;
  }

  if (props.state.kind === "gameEnd") {
    return (
      <MirrorGameEndView
        summaryText={props.state.summaryText}
        percentileText={props.state.percentileText}
        results={props.state.results}
        isHost={props.isHost}
        onAction={sendAction}
        onHome={focusHome}
      />
    );
  }

  if (props.state.kind === "playing" || props.state.kind === "result") {
    return (
      <section className="mirror-playable" aria-label="마추기 진행 화면">
        {props.isHost ? (
          <div className="mirror-host-actions" aria-label="방장 진행 조작">
            <button type="button" onClick={focusHome}>
              <Home size={17} />
              홈 화면
            </button>
            {props.state.kind === "playing" ? (
              <button type="button" onClick={() => sendAction({ name: "skip" })}>
                <SkipForward size={17} />
                건너뛰기
              </button>
            ) : null}
            <button type="button" disabled={!props.state.quiz.canGoNext} onClick={() => sendAction({ name: "next" })}>
              <ArrowRight size={17} />
              다음 문제
            </button>
          </div>
        ) : null}
        <QuizPanel quiz={props.state.quiz} />
      </section>
    );
  }

  if (props.state.kind === "loading") {
    return (
      <MirrorUnsupportedView
        title="원본 탭과 동기화 중"
        message={props.state.message ?? "잠시만 기다려 주세요."}
        isHost={props.isHost}
        onAction={props.onAction}
      />
    );
  }

  if (props.state.kind === "unsupported") {
    return <MirrorUnsupportedView title="이 화면은 아직 읽을 수 없습니다" message={props.state.reason} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "error") {
    return <MirrorUnsupportedView title="원본 화면 오류" message={props.state.message} isHost={props.isHost} onAction={props.onAction} />;
  }

  return (
    <MirrorUnsupportedView
      title="원본 탭을 연결해 주세요"
      message={props.state.message ?? "방장 확장 프로그램에서 마추기 아이오 탭을 연결해 주세요."}
      isHost={props.isHost}
      onAction={props.onAction}
    />
  );
}
