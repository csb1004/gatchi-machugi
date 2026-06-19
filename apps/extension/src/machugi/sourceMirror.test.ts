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

  it("extracts visible quiz search results without mixing title, description, and stats", () => {
    const root = setDocument(
      "/search?q=pokemon",
      `
      <input type="search" value="pokemon" aria-label="검색">
      <a class="QuizMainCard_link__abc" href="/quiz/123" target="_blank">
        <img src="/thumb.png" alt="포켓몬 이름 맞추기 썸네일">
        <span class="QuizMainCard_title__abc">포켓몬 이름 맞추기</span>
        <span class="QuizMainCard_description__abc">포켓몬스터 사진을 보고 맞춘다.</span>
        <span class="QuizMainCard_hits__abc">2.1M</span>
        <span class="QuestionTypeBadge_root__abc">주관식</span>
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
        title: "포켓몬 이름 맞추기",
        description: "포켓몬스터 사진을 보고 맞춘다.",
        meta: ["2.1M", "주관식"],
        href: new URL("/quiz/123", document.location.href).toString(),
        thumbnailUrl: new URL("/thumb.png", document.location.href).toString()
      })
    ]);
    expect(state.results[0]?.title).not.toContain("2.1M");
    expect(state.results[0]?.title).not.toContain("포켓몬스터 사진");
  });

  it("keeps all loaded search results instead of capping at the first page", () => {
    const cards = Array.from(
      { length: 75 },
      (_, index) => `
        <a class="QuizMainCard_link__abc" href="/quiz/${index}">
          <span class="QuizMainCard_title__abc">퀴즈 ${index}</span>
          <span class="QuizMainCard_description__abc">설명 ${index}</span>
        </a>
      `
    ).join("");
    const root = setDocument("/search?keyword=quiz", `<input type="search" value="quiz">${cards}`);

    const state = extractSourceMirrorState(root);
    expect(state.kind).toBe("searchResults");
    if (state.kind !== "searchResults") throw new Error("expected searchResults");
    expect(state.query).toBe("quiz");
    expect(state.results).toHaveLength(75);
  });

  it("extracts quiz detail setup pages", () => {
    const root = setDocument(
      "/quiz/ZPWUlOLUrTfyY4FyZcVL",
      `
      <div class="QuizDetailReady_mainContainer__abc">
        <div class="QuizDetailReady_thumbnailContainer__abc">
          <img src="/pokemon.png" alt="포켓몬 이름 맞추기 (1~9세대) 썸네일">
        </div>
        <article class="QuizDetailReady_title__abc">포켓몬 이름 맞추기 (1~9세대)</article>
        <article class="QuizDetailReady_description__abc">포켓몬스터 사진을 보고 맞춘다.</article>
        <div class="Slider_mark__abc Slider_markActive__abc"><div class="Slider_markLabel__abc">타이머 X</div></div>
        <div class="Slider_mark__abc"><div class="Slider_markLabel__abc">3초</div></div>
        <div class="Slider_mark__abc"><div class="Slider_markLabel__abc">5초</div></div>
        <div class="Slider_mark__abc"><div class="Slider_markLabel__abc">10초</div></div>
        <button>10개 풀기</button>
        <button>20개 풀기</button>
        <button>30개 풀기</button>
        <button>50개 풀기</button>
      </div>
    `,
      "포켓몬 이름 맞추기 (1~9세대) - 마추기 아이오"
    );

    const state = extractSourceMirrorState(root);
    expect(state.kind).toBe("quizDetail");
    if (state.kind !== "quizDetail") throw new Error("expected quizDetail");
    expect(state.quiz.title).toBe("포켓몬 이름 맞추기 (1~9세대)");
    expect(state.quiz.description).toBe("포켓몬스터 사진을 보고 맞춘다.");
    expect(state.quiz.thumbnailUrl).toBe(new URL("/pokemon.png", document.location.href).toString());
    expect(state.settings.timerSeconds).toBeNull();
    expect(state.settings.availableTimers).toEqual([3, 5, 10]);
    expect(state.settings.availableQuestionCounts).toEqual([10, 20, 30, 50]);
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

  it("treats generic visible feedback screens as result pages", () => {
    const root = setDocument(
      "/quiz/123/play",
      `
      <div class="QuizDetailPlaying_root__abc">
        <img class="ImageQuizDisplay_root__YvVai" src="/question.png" alt="">
        <section>
          <p>오답!</p>
          <strong>디안시</strong>
          <button type="button">›</button>
        </section>
      </div>
    `,
      "Pokemon - 마추기 아이오"
    );

    const state = extractSourceMirrorState(root);
    expect(state.kind).toBe("result");
    if (state.kind !== "result") throw new Error("expected result");
    expect(state.quiz.resultMessage).toBe("오답!");
    expect(state.quiz.answerCandidates).toEqual(["디안시"]);
    expect(state.quiz.canGoNext).toBe(true);
  });
});
