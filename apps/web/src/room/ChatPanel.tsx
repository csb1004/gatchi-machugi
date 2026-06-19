import { MessageSquare } from "lucide-react";
import { useState } from "react";
import type { ChatMessagePayload } from "@gatchi/shared";

export function ChatPanel({
  messages,
  onSendMessage
}: {
  messages: ChatMessagePayload[];
  onSendMessage: (text: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <section className="side-panel" aria-label="채팅">
      <div className="section-heading">
        <h2>채팅</h2>
        <MessageSquare size={18} aria-hidden="true" />
      </div>
      <div className="chat-list">
        {messages.length === 0 ? (
          <div className="chat-empty">아직 채팅 메시지가 없습니다.</div>
        ) : (
          messages.map((message) => (
            <p key={message.id}>
              <strong>{message.nickname}</strong>
              {message.text}
            </p>
          ))
        )}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          onSendMessage(text);
          setText("");
        }}
      >
        <label>
          채팅 메시지
          <input value={text} onChange={(event) => setText(event.target.value)} maxLength={500} />
        </label>
        <button type="submit">전송</button>
      </form>
    </section>
  );
}
