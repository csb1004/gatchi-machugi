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
  const resultMessage = text("[data-result-message], [role='alert'], [class*='QuizDetailAnswerResult_questionResultCorrectLabel']", quizRoot);
  const answerCandidates = unique([
    text("[class*='QuizDetailAnswerResult_questionResultAnswer']", quizRoot),
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
    canGoNext: quizRoot.querySelector("[data-command='next'], button[aria-label*='next' i], button[class*='NextButton_root']") !== null,
    canGoPrevious: quizRoot.querySelector("[data-command='previous'], button[aria-label*='previous' i]") !== null,
    resultMessage,
    answerCandidates
  };
}
