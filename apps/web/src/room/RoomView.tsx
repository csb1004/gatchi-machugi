import type { RoomState } from "@gatchi/shared";
import type { ChatMessagePayload } from "@gatchi/shared";
import { AnswerPanel } from "./AnswerPanel";
import { ChatPanel } from "./ChatPanel";
import { QuizPanel } from "./QuizPanel";
import { Scoreboard } from "./Scoreboard";
import { SubmissionPanel } from "./SubmissionPanel";

export function RoomView(props: {
  state: RoomState;
  currentParticipantId: string;
  chatMessages?: ChatMessagePayload[];
  onSubmitAnswer: (rawAnswer: string) => void;
  onSendChat?: (text: string) => void;
}) {
  const currentParticipant = props.state.participants.find((participant) => participant.id === props.currentParticipantId);

  return (
    <section className="room-layout" aria-label={`방 ${props.state.roomCode}`}>
      <div className="room-main">
        <header className="room-titlebar">
          <div>
            <p className="eyebrow">{props.state.roomCode}</p>
            <h1>{props.state.settings.title}</h1>
          </div>
          <span className={props.state.hostExtensionConnected ? "host-badge online" : "host-badge"}>
            방장 확장 {props.state.hostExtensionConnected ? "연결됨" : "연결 안 됨"}
          </span>
        </header>
        <QuizPanel quiz={props.state.quiz} />
        <AnswerPanel
          disabled={!currentParticipant?.connected || props.state.phase === "revealed"}
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
