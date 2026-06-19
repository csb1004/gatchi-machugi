import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SourceMirrorState } from "@gatchi/shared";
import { describe, expect, it, vi } from "vitest";
import { SourceMirrorView } from "./SourceMirrorView";

const home: SourceMirrorState = {
  kind: "home",
  url: "https://machugi.io/",
  title: "마추기 아이오",
  lastSeenAt: "2026-06-19T00:00:00.000Z",
  query: ""
};

const results: SourceMirrorState = {
  kind: "searchResults",
  url: "https://machugi.io/search?q=pokemon",
  title: "검색",
  lastSeenAt: "2026-06-19T00:00:00.000Z",
  query: "pokemon",
  results: [
    {
      id: "https://machugi.io/quiz/123",
      title: "포켓몬 실루엣 맞추기",
      href: "https://machugi.io/quiz/123",
      thumbnailUrl: null,
      description: "20문제",
      meta: ["20문제"]
    }
  ]
};

describe("SourceMirrorView", () => {
  it("lets the host search from the mirrored home view", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={home} isHost onAction={onAction} />);

    fireEvent.change(screen.getByLabelText("검색어"), { target: { value: "pokemon" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(onAction).toHaveBeenCalledWith({ name: "search", query: "pokemon" });
  });

  it("shows search results and lets only the host select them", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "포켓몬 실루엣 맞추기 선택" }));

    expect(onAction).toHaveBeenCalledWith({
      name: "selectResult",
      resultId: "https://machugi.io/quiz/123",
      href: "https://machugi.io/quiz/123"
    });
  });

  it("lets the host search again from the results view", () => {
    const onAction = vi.fn();
    render(<SourceMirrorView state={results} isHost onAction={onAction} />);

    fireEvent.change(screen.getByLabelText("검색어"), { target: { value: "anime" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(onAction).toHaveBeenCalledWith({ name: "search", query: "anime" });
  });

  it("renders participant results as read-only", () => {
    render(<SourceMirrorView state={results} isHost={false} onAction={() => undefined} />);

    expect(screen.getByText("포켓몬 실루엣 맞추기")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "포켓몬 실루엣 맞추기 선택" })).not.toBeInTheDocument();
  });

  it("shows Korean fallback actions for unsupported host states", () => {
    render(
      <SourceMirrorView
        isHost
        onAction={() => undefined}
        state={{
          kind: "unsupported",
          url: "https://machugi.io/unknown",
          title: "Unknown",
          lastSeenAt: "2026-06-19T00:00:00.000Z",
          reason: "원본 사이트의 현재 화면을 읽을 수 없습니다."
        }}
      />
    );

    expect(screen.getByText("이 화면은 아직 읽을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /다시 읽기/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /원본 탭 열기/ })).toBeInTheDocument();
  });
});
