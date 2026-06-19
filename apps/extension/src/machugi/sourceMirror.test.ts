import { describe, expect, it } from "vitest";
import { extractSourceMirrorState } from "./sourceMirror";

function setDocument(url: string, body: string, title = "마추기 아이오"): Document {
  history.replaceState(null, "", url);
  document.title = title;
  document.body.innerHTML = body;
  return document;
}

describe("extractSourceMirrorState", () => {
  it("extracts the home search state", () => {
    const root = setDocument("/", `<input type="search" value="pokemon" aria-label="검색">`);

    expect(extractSourceMirrorState(root)).toMatchObject({
      kind: "home",
      query: "pokemon"
    });
  });

  it("extracts visible quiz search results", () => {
    const root = setDocument(
      "/search?q=pokemon",
      `
      <input type="search" value="pokemon" aria-label="검색">
      <a class="QuizCard_root__abc" href="/quiz/123">
        <img src="/thumb.png" alt="">
        <strong>포켓몬 실루엣 맞추기</strong>
        <p>20문제</p>
      </a>
    `,
      "검색 - 마추기 아이오"
    );

    const state = extractSourceMirrorState(root);
    expect(state.kind).toBe("searchResults");
    if (state.kind !== "searchResults") throw new Error("expected searchResults");
    expect(state.query).toBe("pokemon");
    expect(state.results).toEqual([
      expect.objectContaining({
        title: "포켓몬 실루엣 맞추기",
        href: new URL("/quiz/123", document.location.href).toString(),
        thumbnailUrl: new URL("/thumb.png", document.location.href).toString()
      })
    ]);
  });

  it("delegates active question pages to QuizState", () => {
    const root = setDocument(
      "/quiz/123/play",
      `
      <div class="QuizDetailPlaying_root__abc">
        <p data-question-text>Who is this?</p>
        <input type="text">
      </div>
    `,
      "Pokemon - 마추기 아이오"
    );

    const state = extractSourceMirrorState(root);
    expect(state.kind).toBe("playing");
    if (state.kind !== "playing") throw new Error("expected playing");
    expect(state.quiz.questionText).toBe("Who is this?");
  });
});
