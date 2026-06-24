import { ArrowRight, Home, Minus, Plus, SkipForward } from "lucide-react";
import { useRef } from "react";
import {
  clampImageScale,
  DEFAULT_IMAGE_SCALE,
  IMAGE_SCALE_MAX,
  IMAGE_SCALE_MIN,
  IMAGE_SCALE_STEP,
  type SourceMirrorAction,
  type SourceMirrorState
} from "@gatchi/shared";
import { QuizPanel } from "../room/QuizPanel";
import { MirrorGameEndView } from "./MirrorGameEndView";
import { MirrorResultsView } from "./MirrorResultsView";
import { MirrorSearchView } from "./MirrorSearchView";
import { MirrorSetupView } from "./MirrorSetupView";
import { MirrorUnsupportedView } from "./MirrorUnsupportedView";

function ImageScaleControl({
  imageScale,
  onImageScaleChange
}: {
  imageScale: number;
  onImageScaleChange: (imageScale: number) => void;
}) {
  const normalizedImageScale = clampImageScale(imageScale);
  const percent = Math.round(normalizedImageScale * 100);

  function adjust(delta: number) {
    onImageScaleChange(clampImageScale(normalizedImageScale + delta));
  }

  return (
    <div className="mirror-image-scale-control" aria-label="이미지 크기">
      <button
        type="button"
        aria-label="이미지 작게"
        title="이미지 작게"
        disabled={normalizedImageScale <= IMAGE_SCALE_MIN}
        onClick={() => adjust(-IMAGE_SCALE_STEP)}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <span>{percent}%</span>
      <button
        type="button"
        aria-label="이미지 크게"
        title="이미지 크게"
        disabled={normalizedImageScale >= IMAGE_SCALE_MAX}
        onClick={() => adjust(IMAGE_SCALE_STEP)}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function SourceMirrorView(props: {
  state: SourceMirrorState;
  isHost: boolean;
  onAction: (action: SourceMirrorAction) => void;
  imageScale?: number | undefined;
  onImageScaleChange?: ((imageScale: number) => void) | undefined;
}) {
  const lastSearchQuery = useRef("");
  if (props.state.kind === "home" || props.state.kind === "searchResults") {
    lastSearchQuery.current = props.state.query.trim();
  }

  function sendAction(action: SourceMirrorAction) {
    if (action.name === "search") lastSearchQuery.current = action.query.trim();
    if (action.name === "openCategory" && action.query) lastSearchQuery.current = action.query.trim();
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
    return <MirrorSearchView currentUrl={props.state.url} initialQuery={props.state.query} isHost={props.isHost} onAction={sendAction} />;
  }

  if (props.state.kind === "searchResults") {
    return (
      <MirrorResultsView
        currentUrl={props.state.url}
        query={props.state.query}
        results={props.state.results}
        isHost={props.isHost}
        onAction={sendAction}
      />
    );
  }

  if (props.state.kind === "quizDetail") {
    return <MirrorSetupView quiz={props.state.quiz} settings={props.state.settings} isHost={props.isHost} onAction={sendSetupAction} />;
  }

  if (props.state.kind === "gameEnd") {
    return (
      <MirrorGameEndView
        message={props.state.message}
        isHost={props.isHost}
        onHome={() => sendAction({ name: "focusHome" })}
      />
    );
  }

  if (props.state.kind === "playing" || props.state.kind === "result") {
    const imageScale = clampImageScale(props.imageScale ?? DEFAULT_IMAGE_SCALE);
    const showImageScaleControl = props.isHost && Boolean(props.state.quiz.imageUrl) && Boolean(props.onImageScaleChange);

    return (
      <section className="mirror-playable" aria-label="마추기 진행 화면">
        {props.isHost ? (
          <div className="mirror-host-actions mirror-host-actions-split" aria-label="방장 진행 조작">
            <button type="button" onClick={focusHome}>
              <Home size={17} />
              홈 화면
            </button>
            <div className="mirror-host-primary-actions">
              {showImageScaleControl && props.onImageScaleChange ? (
                <ImageScaleControl imageScale={imageScale} onImageScaleChange={props.onImageScaleChange} />
              ) : null}
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
          </div>
        ) : null}
        <QuizPanel quiz={props.state.quiz} imageScale={imageScale} />
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
