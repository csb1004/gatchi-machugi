import { describe, expect, it } from "vitest";
import { extractQuizState } from "./extractor";

describe("extractQuizState", () => {
  it("extracts text question and choices from stable data attributes", () => {
    document.body.innerHTML = `
      <main data-machugi-root>
        <h1 data-quiz-title>Pokemon Quiz</h1>
        <div data-question-index>2</div>
        <div data-question-total>10</div>
        <p data-question-text>Who is this?</p>
        <button data-choice>Bulbasaur</button>
        <button data-choice>Squirtle</button>
      </main>
    `;

    const state = extractQuizState(document);
    expect(state.quizTitle).toBe("Pokemon Quiz");
    expect(state.questionIndex).toBe(2);
    expect(state.totalQuestions).toBe(10);
    expect(state.questionType).toBe("multiple-choice");
    expect(state.choices.map((choice) => choice.label)).toEqual(["Bulbasaur", "Squirtle"]);
  });

  it("extracts the active image question from machugi.io playing markup", () => {
    document.title = "포켓몬 이름 맞추기 (1~9세대) - 마추기 아이오";
    document.body.innerHTML = `
      <main>
        <img class="PageLayout_mainIcon__vBzU6" src="https://assets.machugi.io/public/main.png" alt="">
        <div class="QuizDetailPlaying_root__k7OA0">
          <img class="ImageQuizDisplay_root__YvVai" src="https://images.machugi.io/question-image" alt="">
          <div class="QuizDetailAnswerFreeResponse_questionInputContainer__UGgOR">
            <input class="ant-input QuizDetailAnswerFreeResponse_questionInput__7urV0" type="text" value="">
            <button type="button" class="ant-btn CommonButton_root__6p8FJ NextButton_root__MHkxh"></button>
          </div>
        </div>
      </main>
    `;

    const state = extractQuizState(document);
    expect(state.quizTitle).toBe("포켓몬 이름 맞추기 (1~9세대)");
    expect(state.questionType).toBe("image");
    expect(state.imageUrl).toBe("https://images.machugi.io/question-image");
    expect(state.canGoNext).toBe(true);
    expect(state.answerCandidates).toEqual([]);
  });

  it("extracts cropped image questions from machugi.io crop markup", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__k7OA0">
        <img class="CropQuizDisplay_root__z88f2" src="https://images.machugi.io/cropped-food.jpeg" alt="">
        <div class="QuizDetailAnswerFreeResponse_questionInputContainer__UGgOR">
          <input class="ant-input QuizDetailAnswerFreeResponse_questionInput__7urV0" type="text" value="">
          <button type="button" class="ant-btn CommonButton_root__6p8FJ NextButton_root__MHkxh"></button>
        </div>
      </div>
    `;

    const state = extractQuizState(document);
    expect(state.questionType).toBe("image");
    expect(state.imageUrl).toBe("https://images.machugi.io/cropped-food.jpeg");
  });

  it("extracts YouTube iframe audio questions as playable audio media", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__k7OA0">
        <iframe
          class="MusicDurationEditor_hide__kwrcw"
          title="YouTube video player"
          src="https://www.youtube-nocookie.com/embed/seoefKzVDOk?start=0.5&end=141"
        ></iframe>
        <div class="QuizDetailAnswerFreeResponse_questionInputContainer__UGgOR">
          <input class="ant-input QuizDetailAnswerFreeResponse_questionInput__7urV0" type="text" value="">
          <button type="button" class="ant-btn CommonButton_root__6p8FJ NextButton_root__MHkxh"></button>
        </div>
      </div>
    `;

    const state = extractQuizState(document);
    expect(state.questionType).toBe("audio");
    expect(state.audioUrl).toBe("https://www.youtube-nocookie.com/embed/seoefKzVDOk?start=0.5&end=141");
  });

  it("extracts machugi multiple-choice buttons without treating the container as a choice", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__k7OA0">
        <img class="ImageQuizDisplay_root__YvVai" src="https://images.machugi.io/question-image" alt="">
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

    const state = extractQuizState(document);
    expect(state.questionType).toBe("multiple-choice");
    expect(state.choices.map((choice) => choice.label)).toEqual(["가능", "불가능"]);
  });

  it("extracts result feedback and the original answer from machugi.io result markup", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__k7OA0">
        <img class="ImageQuizDisplay_root__YvVai" src="https://images.machugi.io/question-image" alt="">
        <div class="QuizDetailAnswerResult_questionResultContainer__NRItV">
          <article class="ant-typography QuizDetailAnswerResult_questionResultCorrectLabel__JFCE7">오답!</article>
          <article class="ant-typography QuizDetailAnswerResult_questionResultAnswer__KzzLh">배바닐라</article>
        </div>
        <button type="button" class="ant-btn CommonButton_root__6p8FJ NextButton_root__MHkxh"></button>
      </div>
    `;

    const state = extractQuizState(document);
    expect(state.resultMessage).toBe("오답!");
    expect(state.answerCandidates).toEqual(["배바닐라"]);
  });

  it("extracts actual Korean result feedback when audio result screens hide the answer text", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__k7OA0">
        <iframe
          class="MusicDurationEditor_hide__kwrcw"
          title="YouTube video player"
          src="https://www.youtube-nocookie.com/embed/seoefKzVDOk?start=0.5&end=141"
        ></iframe>
        <div class="QuizDetailAnswerResult_questionResultContainer__NRItV">
          <article class="ant-typography QuizDetailAnswerResult_questionResultCorrectLabel__JFCE7">정답!</article>
        </div>
        <button type="button" class="ant-btn CommonButton_root__6p8FJ NextButton_root__MHkxh"></button>
      </div>
    `;

    const state = extractQuizState(document);
    expect(state.questionType).toBe("audio");
    expect(state.resultMessage).toBe("정답!");
    expect(state.answerCandidates).toEqual([]);
    expect(state.canGoNext).toBe(true);
  });

  it("extracts result feedback and answer from generic visible result markup", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__k7OA0">
        <img class="ImageQuizDisplay_root__YvVai" src="https://images.machugi.io/question-image" alt="">
        <section>
          <p>오답!</p>
          <strong>디안시</strong>
          <button type="button">›</button>
        </section>
      </div>
    `;

    const state = extractQuizState(document);
    expect(state.resultMessage).toBe("오답!");
    expect(state.answerCandidates).toEqual(["디안시"]);
    expect(state.canGoNext).toBe(true);
  });

  it("extracts an answer when the result label is nested next to an icon", () => {
    document.body.innerHTML = `
      <div class="QuizDetailPlaying_root__k7OA0">
        <img class="ImageQuizDisplay_root__YvVai" src="https://images.machugi.io/revealed-image" alt="">
        <section>
          <div>
            <span aria-hidden="true">✓</span>
            <span>정답!</span>
          </div>
          <h2>은랑</h2>
          <button type="button">›</button>
        </section>
      </div>
    `;

    const state = extractQuizState(document);
    expect(state.resultMessage).toBe("정답!");
    expect(state.answerCandidates).toEqual(["은랑"]);
  });
});
