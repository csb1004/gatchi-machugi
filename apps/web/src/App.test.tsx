import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/rooms" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              roomCode: "ABC123",
              hostParticipantId: "host-1",
              hostCode: "#H0ST"
            }),
            { status: 201, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      })
    );
    window.history.replaceState(null, "", originalPath);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", originalPath);
    localStorage.clear();
  });

  it("shows public rooms, room code entry, and nickname gate", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "가치 마추기" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "방 만들기" })).toBeInTheDocument();
    expect(screen.getByLabelText("방장 닉네임")).toBeInTheDocument();
    expect(screen.getByLabelText("방 이름")).toBeInTheDocument();
    expect(screen.getByText("방 코드는 방을 만들면 자동으로 생성됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "방 만들기" })).toBeDisabled();
    expect(screen.getByText("방장 화면에서 마추기아이오 원본 화면을 열고 퀴즈를 고릅니다.")).toBeInTheDocument();
    expect(screen.getByText("확장을 새로 설치하거나 업데이트했다면 방장 화면을 새로고침한 뒤 다시 저장합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub Releases에서 확장 프로그램 받기" })).toHaveAttribute(
      "href",
      "https://github.com/csb1004/gatchi-machugi/releases"
    );
    expect(screen.getByLabelText("닉네임")).toBeInTheDocument();
    expect(screen.getByLabelText("방 코드")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "방 입장" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "공개방" })).toBeInTheDocument();
  });

  it("prefills the room code from a room URL", () => {
    window.history.replaceState(null, "", "/rooms/abc123");

    render(<App />);

    expect(screen.getByLabelText("방 코드")).toHaveValue("ABC123");
  });

  it("moves the address bar to the created room URL", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("방장 닉네임"), { target: { value: "상범" } });
    fireEvent.click(screen.getByRole("button", { name: "방 만들기" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/rooms/ABC123");
    });
  });
});
