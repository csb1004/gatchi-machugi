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
});
