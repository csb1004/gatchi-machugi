import { describe, expect, it, vi } from "vitest";
import { runMachugiCommand, submitOriginalAnswer, submitOriginalAnswerDetailed } from "./commands";

describe("runMachugiCommand", () => {
  it("starts a machugi quiz by clicking the first solve-count button", () => {
    document.body.innerHTML = `
      <button class="Button_button__AA3bX">10개 풀기</button>
      <button class="Button_button__AA3bX">20개 풀기</button>
    `;
    const firstButton = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(firstButton, "click");

    expect(runMachugiCommand("start", document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("advances a machugi playing screen by clicking the icon-only next button", () => {
    document.body.innerHTML = `
      <button class="ant-btn CommonButton_root__6p8FJ NextButton_root__MHkxh">
        <img src="https://assets.machugi.io/public/icon/ic_arrow_white.png" alt="다음 버튼 아이콘">
      </button>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(runMachugiCommand("next", document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("advances by clicking a generic arrow-only next button", () => {
    document.body.innerHTML = `<button type="button">›</button>`;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(runMachugiCommand("next", document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("focuses the search box when configuring from the main page", () => {
    document.body.innerHTML = `<input aria-label="검색창" type="search">`;
    const input = document.querySelector("input") as HTMLInputElement;
    const focus = vi.spyOn(input, "focus");

    expect(runMachugiCommand("configure", document)).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe("submitOriginalAnswer", () => {
  it("fills a free-text answer and clicks the original submit button", () => {
    document.body.innerHTML = `
      <form class="QuizDetailPlaying_root__abc">
        <input type="text" />
        <button type="button">제출</button>
      </form>
    `;
    const input = document.querySelector("input") as HTMLInputElement;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(submitOriginalAnswer("팅비드", document)).toBe(true);
    expect(input.value).toBe("팅비드");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("fills a search-typed quiz answer input without treating it as the site search box", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <input type="search" placeholder="정답을 입력하세요" />
        <button class="NextButton_root__MHkxh" type="button">›</button>
      </div>
    `;
    const input = document.querySelector("input") as HTMLInputElement;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(submitOriginalAnswer("미샤", document)).toBe(true);
    expect(input.value).toBe("미샤");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("fills a contenteditable quiz answer input", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <div contenteditable="true" role="textbox"></div>
        <button class="NextButton_root__MHkxh" type="button">›</button>
      </div>
    `;
    const input = document.querySelector("[contenteditable='true']") as HTMLElement;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(submitOriginalAnswer("레그워크 샤르 미하일", document)).toBe(true);
    expect(input.textContent).toBe("레그워크 샤르 미하일");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("clicks a matching O/X or choice answer when there is no text input", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <button>O</button>
        <button>X</button>
      </div>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(submitOriginalAnswer(" o ", document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("clicks a matching machugi multiple-choice button", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <div class="QuizDetailAnswerMultipleChoice_questionChoiceContainer__aRzUN">
          <div class="Button_root__Lkq_P Button_containerLarge__f8qmK">
            <button class="Button_button__AA3bX Button_rectangle__kpD4n Button_colorPurple__mWYQA Button_sizeLarge__v5dm1">
              <span class="Button_text__w5EbU Button_textWhite__95AYV">가능</span>
            </button>
          </div>
          <div class="Button_root__Lkq_P Button_containerLarge__f8qmK">
            <button class="Button_button__AA3bX Button_rectangle__kpD4n Button_colorPurple__mWYQA Button_sizeLarge__v5dm1">
              <span class="Button_text__w5EbU Button_textWhite__95AYV">불가능</span>
            </button>
          </div>
        </div>
      </div>
    `;
    const button = document.querySelectorAll("button")[1] as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(submitOriginalAnswer("불 가능", document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does not fill a follow-up text input after clicking a matching choice", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__abc">
        <button type="button">Choice A</button>
      </div>
    `;
    const choice = document.querySelector("button") as HTMLButtonElement;
    let submitClicks = 0;
    choice.addEventListener("click", () => {
      const root = document.querySelector(".QuizDetailPlaying_root__abc");
      const input = document.createElement("input");
      input.type = "text";
      const submit = document.createElement("button");
      submit.className = "NextButton_root__MHkxh";
      submit.type = "button";
      submit.textContent = "Submit";
      submit.addEventListener("click", () => {
        submitClicks += 1;
      });
      root?.append(input, submit);
    });

    const result = submitOriginalAnswerDetailed("Choice A", document);
    const input = document.querySelector("input") as HTMLInputElement;
    const submit = document.querySelector(".NextButton_root__MHkxh") as HTMLButtonElement;

    expect(result).toEqual({ ok: true, method: "choice" });
    expect(input.value).toBe("");
    expect(submit).toBeTruthy();
    expect(submitClicks).toBe(0);
  });
});
