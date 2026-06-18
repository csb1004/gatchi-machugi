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

export function extractQuizState(root: Document): QuizState {
  const choices = Array.from(root.querySelectorAll("[data-choice], button[role='option'], .choice, .answer-choice"))
    .map((element, index) => ({
      id: element.getAttribute("data-choice-id") || String(index + 1),
      label: element.textContent?.trim() || ""
    }))
    .filter((choice) => choice.label.length > 0);

  const imageUrl = absoluteUrl(attr("[data-question-image], img[data-question], main img", "src", root), root);
  const audioUrl = absoluteUrl(attr("[data-question-audio], audio", "src", root), root);
  const videoUrl = absoluteUrl(attr("[data-question-video], video", "src", root), root);

  return {
    quizTitle: text("[data-quiz-title], h1", root),
    questionIndex: numberText("[data-question-index]", root),
    totalQuestions: numberText("[data-question-total]", root),
    questionType: choices.length > 0 ? "multiple-choice" : imageUrl ? "image" : audioUrl ? "audio" : videoUrl ? "video" : "free-text",
    questionText: text("[data-question-text], [data-question], main p", root),
    imageUrl,
    audioUrl,
    videoUrl,
    choices,
    timerSecondsRemaining: numberText("[data-timer], [aria-label*='timer' i]", root),
    canGoNext: root.querySelector("[data-command='next'], button[aria-label*='next' i]") !== null,
    canGoPrevious: root.querySelector("[data-command='previous'], button[aria-label*='previous' i]") !== null,
    resultMessage: text("[data-result-message], [role='alert']", root),
    answerCandidates: []
  };
}
