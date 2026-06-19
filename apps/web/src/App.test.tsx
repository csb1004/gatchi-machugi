import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows public rooms, room code entry, and nickname gate", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "가치 마추기" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "방 만들기" })).toBeInTheDocument();
    expect(screen.getByLabelText("방장 닉네임")).toBeInTheDocument();
    expect(screen.getByLabelText("방 이름")).toBeInTheDocument();
    expect(screen.getByText("방 코드는 방을 만들면 자동으로 생성됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "방 만들기" })).toBeDisabled();
    expect(screen.getByText("퀴즈를 진행할 브라우저 탭에서 machugi.io를 엽니다.")).toBeInTheDocument();
    expect(screen.getByText("확장 프로그램을 새로 설치하거나 업데이트했다면 방장 화면을 새로고침한 뒤 다시 저장합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub Releases에서 확장 프로그램 받기" })).toHaveAttribute(
      "href",
      "https://github.com/csb1004/gatchi-machugi/releases"
    );
    expect(screen.getByLabelText("닉네임")).toBeInTheDocument();
    expect(screen.getByLabelText("방 코드")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "방 입장" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "공개방" })).toBeInTheDocument();
  });
});
