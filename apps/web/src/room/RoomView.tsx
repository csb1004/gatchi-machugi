import { LogOut, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessagePayload, RoomState, SourceMirrorAction } from "@gatchi/shared";
import { AnswerPanel } from "./AnswerPanel";
import { ChatPanel } from "./ChatPanel";
import { Scoreboard } from "./Scoreboard";
import { SubmissionPanel } from "./SubmissionPanel";
import { SourceMirrorView } from "../sourceMirror/SourceMirrorView";

function isKeyboardCommandTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
}

function PersonalResultPanel({
  state,
  participantId
}: {
  state: RoomState;
  participantId: string;
}) {
  const result = state.revealedSubmissions.find((submission) => submission.participantId === participantId);
  if (state.phase !== "revealed" || !result) return null;

  const acceptedAnswers = state.quiz.answerCandidates.join(", ");
  const resultText = result.skipped ? "미제출" : result.correct ? "정답" : "오답";
  const rawAnswerText = result.skipped ? "입력하지 않음" : result.rawAnswer || "-";

  return (
    <section className={`personal-result ${result.correct ? "correct" : "incorrect"}`} aria-label="내 결과">
      <div className="section-heading">
        <h2>내 결과</h2>
        <strong>{resultText}</strong>
      </div>
      <p>내 답: {rawAnswerText}</p>
      {acceptedAnswers ? <p>정답: {acceptedAnswers}</p> : null}
    </section>
  );
}

function answerTextForResult(result: RoomState["revealedSubmissions"][number]): string {
  if (result.skipped) return "입력하지 않음";
  return result.rawAnswer || "-";
}

function resultLabel(result: RoomState["revealedSubmissions"][number]): string {
  if (result.skipped) return "미제출";
  return result.correct ? "정답" : "오답";
}

function hasResultEvidence(quiz: RoomState["quiz"]): boolean {
  return Boolean(quiz.resultMessage || quiz.answerCandidates.length > 0);
}

function hasDisplayedResult(state: RoomState): boolean {
  if (hasResultEvidence(state.quiz)) return true;
  if (state.sourceMirror.kind !== "playing" && state.sourceMirror.kind !== "result") return false;
  return hasResultEvidence(state.sourceMirror.quiz);
}

function displayedCanGoNext(state: RoomState): boolean {
  if (state.sourceMirror.kind === "playing" || state.sourceMirror.kind === "result") {
    return state.sourceMirror.quiz.canGoNext;
  }

  return state.quiz.canGoNext;
}

function PublicRevealPanel({
  state,
  participantId
}: {
  state: RoomState;
  participantId: string;
}) {
  if (state.phase !== "revealed") return null;

  const participantNames = new Map(state.participants.map((participant) => [participant.id, participant.nickname]));
  const currentResult = state.revealedSubmissions.find((submission) => submission.participantId === participantId);
  const otherResults = state.revealedSubmissions.filter((submission) => submission.participantId !== participantId);

  return (
    <section className="public-results" aria-label="공개 결과">
      {currentResult ? (
        <div
          className={`my-answer-highlight ${currentResult.correct ? "correct" : "incorrect"}`}
          aria-label="내 답 결과"
        >
          <div>
            <strong>내 답</strong>
            <span>{answerTextForResult(currentResult)}</span>
          </div>
          <em>{resultLabel(currentResult)}</em>
        </div>
      ) : null}

      <div className="section-heading">
        <h2>다른 플레이어가 입력한 답</h2>
        <span>{otherResults.length}명</span>
      </div>

      {otherResults.length > 0 ? (
        <div className="player-answer-list">
          {otherResults.map((result) => {
            const statusClass = result.skipped ? "skipped" : result.correct ? "correct" : "incorrect";
            return (
              <div
                key={result.participantId}
                className={`player-answer-row ${statusClass}`}
              >
                <strong>{participantNames.get(result.participantId) ?? result.participantId}</strong>
                <span>{answerTextForResult(result)}</span>
                <em>{resultLabel(result)}</em>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="player-answer-empty">다른 플레이어의 제출이 없습니다.</p>
      )}
    </section>
  );
}

function HostAliasPanel({
  isHost,
  state,
  onAddAlias
}: {
  isHost: boolean;
  state: RoomState;
  onAddAlias: ((alias: string) => void) | undefined;
}) {
  const [alias, setAlias] = useState("");
  if (!isHost || state.phase !== "revealed") return null;

  const canAdd = alias.trim().length > 0;

  return (
    <section className="answer-panel alias-panel" aria-label="정답 추가 패널">
      <label>
        추가 정답
        <input value={alias} onChange={(event) => setAlias(event.target.value)} />
      </label>
      <button
        className="primary-button"
        type="button"
        disabled={!canAdd}
        onClick={() => {
          const nextAlias = alias.trim();
          if (!nextAlias) return;
          onAddAlias?.(nextAlias);
          setAlias("");
        }}
      >
        <Plus size={18} />
        정답 추가
      </button>
    </section>
  );
}

export function RoomView(props: {
  state: RoomState;
  currentParticipantId: string;
  chatMessages?: ChatMessagePayload[];
  onSubmitAnswer: (rawAnswer: string) => void;
  onAddAlias?: (alias: string) => void;
  onSendChat?: (text: string) => void;
  onSourceAction: (action: SourceMirrorAction) => void;
  onLeaveRoom?: () => void;
}) {
  const roomLayoutRef = useRef<HTMLElement | null>(null);
  const hostEnterCatcherRef = useRef<HTMLInputElement | null>(null);
  const currentParticipant = props.state.participants.find((participant) => participant.id === props.currentParticipantId);
  const currentSubmission = props.state.submissions.find((submission) => submission.participantId === props.currentParticipantId);
  const sourceConnected = props.state.sourceWindow.status === "connected";
  const isHost = currentParticipant?.role === "host";
  const resultVisible = hasDisplayedResult(props.state);
  const canAdvanceDisplayedQuestion = displayedCanGoNext(props.state);
  const canHandleHostEnter = canAdvanceDisplayedQuestion && (props.state.phase === "revealed" || resultVisible);
  const answerLocked =
    props.state.phase !== "playing" ||
    resultVisible ||
    props.state.fairPlay.allRequiredSubmitted ||
    props.state.fairPlay.originalSubmitStatus === "ready" ||
    props.state.fairPlay.originalSubmitStatus === "submitting";
  const showAnswerPanel = props.state.phase === "playing" && !answerLocked && Boolean(currentParticipant?.connected);

  useEffect(() => {
    if (!isHost || !canHandleHostEnter) return;

    function handleHostEnter(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.defaultPrevented || isKeyboardCommandTarget(event.target)) return;
      event.preventDefault();
      props.onSourceAction({ name: "next" });
    }

    window.addEventListener("keydown", handleHostEnter, true);
    return () => window.removeEventListener("keydown", handleHostEnter, true);
  }, [canHandleHostEnter, isHost, props.onSourceAction]);

  useEffect(() => {
    if (!isHost || !canHandleHostEnter) return;

    function shouldReclaimHostFocus() {
      const activeElement = document.activeElement;
      return activeElement instanceof HTMLIFrameElement && activeElement.classList.contains("result-embed");
    }

    function focusRoomSurface() {
      const activeElement = document.activeElement;
      if (activeElement === hostEnterCatcherRef.current) return;
      if (activeElement instanceof HTMLElement && isKeyboardCommandTarget(activeElement)) return;
      if (activeElement !== document.body && !shouldReclaimHostFocus()) return;
      hostEnterCatcherRef.current?.focus({ preventScroll: true });
    }

    focusRoomSurface();
    const firstTimer = window.setTimeout(focusRoomSurface, 0);
    const secondTimer = window.setTimeout(focusRoomSurface, 250);
    const focusInterval = window.setInterval(focusRoomSurface, 400);
    const stopTimer = window.setTimeout(() => window.clearInterval(focusInterval), 2500);
    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
      window.clearInterval(focusInterval);
      window.clearTimeout(stopTimer);
    };
  }, [canHandleHostEnter, isHost]);

  return (
    <section ref={roomLayoutRef} tabIndex={-1} className="room-layout" aria-label={`방 ${props.state.roomCode}`}>
      {isHost && canHandleHostEnter ? (
        <input
          ref={hostEnterCatcherRef}
          className="host-enter-catcher"
          aria-label="방장 엔터 진행"
          readOnly
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            props.onSourceAction({ name: "next" });
          }}
        />
      ) : null}
      <div className="room-main">
        <header className="room-titlebar">
          <div>
            <p className="eyebrow">{props.state.roomCode}</p>
            <h1>{props.state.settings.title}</h1>
          </div>
          <div className="room-title-status">
            <span className={props.state.hostExtensionConnected ? "host-badge online" : "host-badge"}>
              방장 확장 {props.state.hostExtensionConnected ? "연결됨" : "연결 대기"}
            </span>
            <span className={sourceConnected ? "host-badge online" : "host-badge"}>
              원본 창 {sourceConnected ? "연결됨" : "대기"}
            </span>
            <button className="room-leave-button" type="button" onClick={props.onLeaveRoom} aria-label="방 나가기">
              <LogOut size={16} />
              방 나가기
            </button>
          </div>
        </header>
        <SourceMirrorView state={props.state.sourceMirror} isHost={Boolean(isHost)} onAction={props.onSourceAction} />
        <PersonalResultPanel state={props.state} participantId={props.currentParticipantId} />
        <PublicRevealPanel state={props.state} participantId={props.currentParticipantId} />
        <HostAliasPanel isHost={Boolean(isHost)} state={props.state} onAddAlias={props.onAddAlias} />
        {showAnswerPanel ? (
          <AnswerPanel
            disabled={false}
            submitted={Boolean(currentSubmission)}
            quiz={props.state.quiz}
            resetKey={props.state.fairPlay.questionKey}
            onSubmitAnswer={props.onSubmitAnswer}
          />
        ) : null}
      </div>
      <aside className="room-side" aria-label="방 활동">
        <SubmissionPanel state={props.state} />
        <Scoreboard participants={props.state.participants} />
        <ChatPanel
          messages={props.chatMessages ?? []}
          onSendMessage={props.onSendChat ?? (() => undefined)}
        />
      </aside>
    </section>
  );
}
