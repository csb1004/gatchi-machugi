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
});
