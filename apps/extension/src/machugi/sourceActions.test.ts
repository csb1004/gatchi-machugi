import { describe, expect, it, vi } from "vitest";
import { runSourceMirrorAction } from "./sourceActions";

describe("runSourceMirrorAction", () => {
  it("fills and submits the search input", () => {
    document.body.innerHTML = `
      <form>
        <input type="search" aria-label="검색">
        <button type="submit">검색</button>
      </form>
    `;
    const form = document.querySelector("form") as HTMLFormElement;
    const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => undefined);

    expect(runSourceMirrorAction({ name: "search", query: "pokemon" }, document)).toEqual({ ok: true });
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("pokemon");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("opens a selected quiz result in the current source tab", () => {
    history.replaceState(null, "", "/search");
    document.body.innerHTML = `<a href="/quiz/123" target="_blank" rel="noopener noreferrer">포켓몬 이름 맞추기</a>`;
    const anchor = document.querySelector("a") as HTMLAnchorElement;
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);

    expect(
      runSourceMirrorAction(
        {
          name: "selectResult",
          resultId: new URL("/quiz/123", document.location.href).toString(),
          href: new URL("/quiz/123", document.location.href).toString()
        },
        document
      )
    ).toEqual({ ok: true });
    expect(anchor.getAttribute("target")).toBeNull();
    expect(anchor.rel).toBe("");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("reports an actionable failure when a control is missing", () => {
    document.body.innerHTML = `<main></main>`;

    expect(runSourceMirrorAction({ name: "search", query: "pokemon" }, document)).toEqual({
      ok: false,
      reason: "검색창을 찾을 수 없습니다."
    });
  });

  it("loads the next batch of search results by scrolling the source page", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2400
    });

    expect(runSourceMirrorAction({ name: "loadMoreResults" }, document)).toEqual({ ok: true });
    expect(scrollTo).toHaveBeenCalledWith({ top: 2400, behavior: "auto" });
  });

  it("also scrolls the largest scrollable source container when loading more results", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    document.body.innerHTML = `
      <main data-testid="scroll-root">
        <section style="height: 1200px"></section>
      </main>
    `;
    const scrollRoot = document.querySelector("[data-testid='scroll-root']") as HTMLElement;
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, value: 1600 });
    Object.defineProperty(scrollRoot, "scrollTop", { configurable: true, writable: true, value: 0 });

    expect(runSourceMirrorAction({ name: "loadMoreResults" }, document)).toEqual({ ok: true });
    expect(scrollTo).toHaveBeenCalled();
    expect(scrollRoot.scrollTop).toBe(1600);
  });
});
