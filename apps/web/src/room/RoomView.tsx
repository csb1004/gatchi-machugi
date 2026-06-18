import type { RoomState } from "@gatchi/shared";
import { AnswerPanel } from "./AnswerPanel";
import { ChatPanel } from "./ChatPanel";
import { QuizPanel } from "./QuizPanel";
import { Scoreboard } from "./Scoreboard";
import { SubmissionPanel } from "./SubmissionPanel";

export function RoomView(props: {
  state: RoomState;
  currentParticipantId: string;
  onSubmitAnswer: (rawAnswer: string) => void;
}) {
  const currentParticipant = props.state.participants.find((participant) => participant.id === props.currentParticipantId);

  return (
    <section className="room-layout" aria-label={`Room ${props.state.roomCode}`}>
      <div className="room-main">
        <header className="room-titlebar">
          <div>
            <p className="eyebrow">{props.state.roomCode}</p>
            <h1>{props.state.settings.title}</h1>
          </div>
          <span className={props.state.hostExtensionConnected ? "host-badge online" : "host-badge"}>
            Host {props.state.hostExtensionConnected ? "connected" : "offline"}
          </span>
        </header>
        <QuizPanel quiz={props.state.quiz} />
        <AnswerPanel
          disabled={!currentParticipant?.connected || props.state.phase === "revealed"}
          quiz={props.state.quiz}
          onSubmitAnswer={props.onSubmitAnswer}
        />
      </div>
      <aside className="room-side" aria-label="Room activity">
        <SubmissionPanel state={props.state} />
        <Scoreboard participants={props.state.participants} />
        <ChatPanel roomCode={props.state.roomCode} />
      </aside>
    </section>
  );
}
