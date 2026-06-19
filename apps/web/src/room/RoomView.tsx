import type { ChatMessagePayload, RoomState, SourceMirrorAction } from "@gatchi/shared";
import { AnswerPanel } from "./AnswerPanel";
import { ChatPanel } from "./ChatPanel";
import { Scoreboard } from "./Scoreboard";
import { SubmissionPanel } from "./SubmissionPanel";
import { SourceMirrorView } from "../sourceMirror/SourceMirrorView";

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

export function RoomView(props: {
  state: RoomState;
  currentParticipantId: string;
  chatMessages?: ChatMessagePayload[];
  onSubmitAnswer: (rawAnswer: string) => void;
  onSendChat?: (text: string) => void;
  onSourceAction: (action: SourceMirrorAction) => void;
}) {
  const currentParticipant = props.state.participants.find((participant) => participant.id === props.currentParticipantId);
  const currentSubmission = props.state.submissions.find((submission) => submission.participantId === props.currentParticipantId);
  const sourceConnected = props.state.sourceWindow.status === "connected";
  const isHost = currentParticipant?.role === "host";

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
          </div>
        </header>
        <SourceMirrorView state={props.state.sourceMirror} isHost={Boolean(isHost)} onAction={props.onSourceAction} />
        <PersonalResultPanel state={props.state} participantId={props.currentParticipantId} />
        <AnswerPanel
          disabled={!currentParticipant?.connected || props.state.phase === "revealed"}
          submitted={Boolean(currentSubmission)}
          quiz={props.state.quiz}
          onSubmitAnswer={props.onSubmitAnswer}
        />
      </div>
      <aside className="room-side" aria-label="방 활동">
        <SubmissionPanel state={props.state} />
        <Scoreboard participants={props.state.participants} />
        <ChatPanel
          roomCode={props.state.roomCode}
          messages={props.chatMessages ?? []}
          onSendMessage={props.onSendChat ?? (() => undefined)}
        />
      </aside>
    </section>
  );
}
