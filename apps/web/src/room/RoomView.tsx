import { LogOut, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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

  return (
    <section className={`personal-result ${result.correct ? "correct" : "incorrect"}`} aria-label="내 결과">
      <div className="section-heading">
        <h2>내 결과</h2>
        <strong>{resultText}</strong>
      </div>
      <p>내 답: {result.rawAnswer || "-"}</p>
      {acceptedAnswers ? <p>정답: {acceptedAnswers}</p> : null}
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
  const currentParticipant = props.state.participants.find((participant) => participant.id === props.currentParticipantId);
  const currentSubmission = props.state.submissions.find((submission) => submission.participantId === props.currentParticipantId);
  const sourceConnected = props.state.sourceWindow.status === "connected";
  const isHost = currentParticipant?.role === "host";
  const answerLocked =
    props.state.phase !== "playing" ||
    props.state.fairPlay.allRequiredSubmitted ||
    props.state.fairPlay.originalSubmitStatus === "ready" ||
    props.state.fairPlay.originalSubmitStatus === "submitting";

  useEffect(() => {
    if (!isHost || props.state.phase !== "revealed" || !props.state.quiz.canGoNext) return;

    function handleHostEnter(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.defaultPrevented || isKeyboardCommandTarget(event.target)) return;
      event.preventDefault();
      props.onSourceAction({ name: "next" });
    }

    document.addEventListener("keydown", handleHostEnter);
    return () => document.removeEventListener("keydown", handleHostEnter);
  }, [isHost, props.onSourceAction, props.state.phase, props.state.quiz.canGoNext]);

  return (
    <section className="room-layout" aria-label={`방 ${props.state.roomCode}`}>
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
        <HostAliasPanel isHost={Boolean(isHost)} state={props.state} onAddAlias={props.onAddAlias} />
        <AnswerPanel
          disabled={!currentParticipant?.connected || answerLocked}
          submitted={Boolean(currentSubmission)}
          quiz={props.state.quiz}
          resetKey={props.state.fairPlay.questionKey}
          onSubmitAnswer={props.onSubmitAnswer}
        />
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
