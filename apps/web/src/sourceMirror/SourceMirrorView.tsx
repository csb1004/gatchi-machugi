import type { SourceMirrorAction, SourceMirrorState } from "@gatchi/shared";
import { QuizPanel } from "../room/QuizPanel";
import { MirrorResultsView } from "./MirrorResultsView";
import { MirrorSearchView } from "./MirrorSearchView";
import { MirrorSetupView } from "./MirrorSetupView";
import { MirrorUnsupportedView } from "./MirrorUnsupportedView";

export function SourceMirrorView(props: {
  state: SourceMirrorState;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
}) {
  if (props.state.kind === "home") {
    return <MirrorSearchView initialQuery={props.state.query} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "searchResults") {
    return <MirrorResultsView query={props.state.query} results={props.state.results} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "quizDetail") {
    return <MirrorSetupView quiz={props.state.quiz} settings={props.state.settings} isHost={props.isHost} onAction={props.onAction} />;
  }

  if (props.state.kind === "playing" || props.state.kind === "result") {
    return <QuizPanel quiz={props.state.quiz} />;
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
