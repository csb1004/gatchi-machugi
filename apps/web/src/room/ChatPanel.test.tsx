import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessagePayload } from "@gatchi/shared";
import { describe, expect, it } from "vitest";
import { ChatPanel } from "./ChatPanel";

const messages: ChatMessagePayload[] = Array.from({ length: 12 }, (_, index) => ({
  id: `m${index}`,
  roomCode: "ABC123",
  participantId: `p${index}`,
  nickname: `참가자 ${index + 1}`,
  text: `메시지 ${index + 1}`,
  createdAt: "2026-06-19T00:00:00.000Z"
}));

describe("ChatPanel", () => {
  it("renders messages inside a dedicated scrollable log", () => {
    render(<ChatPanel messages={messages} onSendMessage={() => undefined} />);

    const log = screen.getByRole("log", { name: "채팅 메시지 목록" });

    expect(log).toHaveClass("chat-list");
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("메시지 12")).toBeInTheDocument();
  });
});
