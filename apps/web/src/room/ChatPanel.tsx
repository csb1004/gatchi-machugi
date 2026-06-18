import { MessageSquare } from "lucide-react";

export function ChatPanel({ roomCode }: { roomCode: string }) {
  return (
    <section className="side-panel" aria-label="Chat">
      <div className="section-heading">
        <h2>Chat</h2>
        <MessageSquare size={18} aria-hidden="true" />
      </div>
      <div className="chat-empty">{roomCode}</div>
    </section>
  );
}
