import type { QuizState } from "@gatchi/shared";

function text(selector: string, root: ParentNode): string | null {
  return root.querySelector(selector)?.textContent?.trim() || null;
}

function numberText(selector: string, root: ParentNode): number | null {
  const value = text(selector, root);
  if (!value) return null;

  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function attr(selector: string, attribute: string, root: ParentNode): string | null {
  return root.querySelector(selector)?.getAttribute(attribute) || null;
}

function absoluteUrl(value: string | null, root: Document): string | null {
  if (!value) return null;

  try {
    return new URL(value, root.location.href).toString();
  } catch {
    return value;
  }
}

function titleFromDocument(root: Document): string | null {
  const title = root.title.trim();
  if (!title) return null;

  return title.replace(/\s*-\s*마추기\s*아이오\s*$/, "").trim() || null;
}

function activeQuizRoot(root: Document): ParentNode {
  return root.querySelector("[class*='QuizDetailPlaying_root']") ?? root;
}

function unique(values: Array<string | null>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

const resultMessagePattern = /^(정답|오답)\s*!?$/;
const nextButtonPattern = /^(›|>|→|다음)$/i;

function directText(element: Element): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent?.trim() ?? "")
    .join(" ")
    .trim();
}

function findResultMessageElement(root: ParentNode): Element | null {
  const stable = root.querySelector("[data-result-message], [role='alert'], [class*='QuizDetailAnswerResult_questionResultCorrectLabel']");
  if (stable) return stable;

  return (
    Array.from(root.querySelectorAll("*")).find((element) => {
      const value = (directText(element) || element.textContent?.trim() || "").trim();
      return resultMessagePattern.test(value);
    }) ?? null
  );
}

function answerAfterResultMessage(element: Element | null): string | null {
  if (!element) return null;

  let candidate = element.nextElementSibling;
  while (candidate) {
    const value = candidate.textContent?.trim() ?? "";
    if (
      value &&
      !resultMessagePattern.test(value) &&
      !(candidate instanceof HTMLButtonElement) &&
      candidate.getAttribute("role") !== "button"
    ) {
      return value;
    }
    candidate = candidate.nextElementSibling;
  }

  return null;
}

function hasNextButton(root: ParentNode): boolean {
  if (root.querySelector("[data-command='next'], button[aria-label*='next' i], button[class*='NextButton_root']")) {
    return true;
  }

  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).some((button) => {
    const label = `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`.trim();
    return nextButtonPattern.test(label);
  });
}

export function extractQuizState(root: Document): QuizState {
  const quizRoot = activeQuizRoot(root);
  const choices = Array.from(quizRoot.querySelectorAll("[data-choice], button[role='option'], .choice, .answer-choice, [class*='Choice'] button"))
    .map((element, index) => ({
      id: element.getAttribute("data-choice-id") || String(index + 1),
      label: element.textContent?.trim() || ""
    }))
    .filter((choice) => choice.label.length > 0);

  const imageUrl = absoluteUrl(attr("[data-question-image], img[data-question], img[class*='ImageQuizDisplay_root']", "src", quizRoot), root);
  const audioUrl = absoluteUrl(attr("[data-question-audio], audio, [class*='AudioQuizDisplay'] audio", "src", quizRoot), root);
  const videoUrl = absoluteUrl(attr("[data-question-video], video, [class*='VideoQuizDisplay'] video", "src", quizRoot), root);
  const resultMessageElement = findResultMessageElement(quizRoot);
  const resultMessage = resultMessageElement?.textContent?.trim() || null;
  const answerCandidates = unique([
    text("[class*='QuizDetailAnswerResult_questionResultAnswer']", quizRoot),
    answerAfterResultMessage(resultMessageElement),
    ...Array.from(quizRoot.querySelectorAll("[data-answer-candidate]")).map((element) => element.textContent?.trim() ?? null)
  ]);

  return {
    quizTitle: text("[data-quiz-title], h1", root) ?? titleFromDocument(root),
    questionIndex: numberText("[data-question-index]", quizRoot),
    totalQuestions: numberText("[data-question-total]", quizRoot),
    questionType: choices.length > 0 ? "multiple-choice" : imageUrl ? "image" : audioUrl ? "audio" : videoUrl ? "video" : "free-text",
    questionText: text("[data-question-text], [data-question], [class*='TextQuizDisplay']", quizRoot),
    imageUrl,
    audioUrl,
    videoUrl,
    choices,
    timerSecondsRemaining: numberText("[data-timer], [aria-label*='timer' i]", quizRoot),
    canGoNext: hasNextButton(quizRoot),
    canGoPrevious: quizRoot.querySelector("[data-command='previous'], button[aria-label*='previous' i]") !== null,
    resultMessage,
    answerCandidates
  };
}
