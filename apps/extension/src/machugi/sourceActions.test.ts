import { describe, expect, it, vi } from "vitest";
import { createHomeUrl, runSourceMirrorAction } from "./sourceActions";

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

  it("submits a dot answer for host skip through the original-submit lock bypass", () => {
    let bypassed = false;
    document.body.innerHTML = `
      <form>
        <input type="text" aria-label="답변">
        <button type="button">제출</button>
      </form>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(
      runSourceMirrorAction({ name: "skip" }, document, {
        runWithOriginalSubmitBypass(action) {
          bypassed = true;
          return action();
        }
      })
    ).toEqual({ ok: true });
    expect(bypassed).toBe(true);
    expect((document.querySelector("input") as HTMLInputElement).value).toBe(".");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("uses the host answer when host skip includes one", () => {
    document.body.innerHTML = `
      <form>
        <input type="text" aria-label="답변">
        <button type="button">제출</button>
      </form>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(runSourceMirrorAction({ name: "skip", rawAnswer: "misha" }, document)).toEqual({ ok: true });
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("misha");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("builds a home URL that restores the last search query", () => {
    expect(createHomeUrl("pokemon")).toBe("https://machugi.io/?keyword=pokemon");
    expect(createHomeUrl("")).toBe("https://machugi.io/");
  });
});
