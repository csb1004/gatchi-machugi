import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";

describe("AdminPage", () => {
  beforeEach(() => {
    let closed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/admin/rooms" && !closed) {
          return new Response(
            JSON.stringify([
              {
                roomCode: "ABC123",
                title: "마추기 방",
                quizTitle: "포켓몬",
                participantCount: 2,
                phase: "playing",
                visibility: "public",
                hostExtensionConnected: true,
                sourceWindowStatus: "connected"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url === "/api/admin/rooms/ABC123/close" && init?.method === "POST") {
          closed = true;
          return new Response(JSON.stringify({ ok: true, roomCode: "ABC123" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        if (url === "/api/admin/rooms") {
          return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
        }

        return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("lists rooms and force closes one with the admin token", async () => {
    localStorage.setItem("gatchi-admin-token", "secret");
    render(<AdminPage />);

    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("마추기 방")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("관리자 토큰"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "ABC123 닫기" }));

    await waitFor(() => expect(screen.getByText("열려 있는 방이 없습니다.")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/rooms/ABC123/close",
      expect.objectContaining({
        method: "POST",
        headers: { "x-admin-token": "secret" }
      })
    );
  });
});
