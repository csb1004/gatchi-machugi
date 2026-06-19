import type { QuizCommandName } from "@gatchi/shared";

const commandSelectors: Partial<Record<QuizCommandName, string[]>> = {
  next: ["[data-command='next']", "button[aria-label*='다음']", "button[aria-label*='next' i]", "button[class*='NextButton_root']"],
  previous: ["[data-command='previous']", "button[aria-label*='이전']", "button[aria-label*='previous' i]"],
  start: ["[data-command='start']", "button[aria-label*='시작']", "button[aria-label*='start' i]"],
  skip: ["[data-command='skip']", "button[aria-label*='건너']", "button[aria-label*='skip' i]", "button[class*='NextButton_root']"],
  reset: ["[data-command='reset']", "button[aria-label*='다시']", "button[aria-label*='reset' i]"],
  "reveal-original-answer": ["[data-command='reveal']", "button[aria-label*='정답']", "button[aria-label*='answer' i]"]
};

const searchInputSelector = "input[aria-label='검색창'], input[type='search'], input[placeholder*='검색']";
const textAnswerSelector = "textarea, input:not([type]), input[type='text'], input[type='search'], [contenteditable='true']";
const submitTextPattern = /제출|확인|정답|입력|submit|answer/i;
const nextButtonPattern = /^(›|>|→|다음)$/i;
type TextAnswerControl = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
export type OriginalAnswerSubmitMethod = "choice" | "choice-then-text" | "text";
export type OriginalAnswerSubmitResult = { ok: true; method: OriginalAnswerSubmitMethod } | { ok: false; method: null };

function clickElement(element: HTMLElement): true {
  element.click();
  return true;
}

function normalizedAnswer(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function clickButtonByText(root: Document | ParentNode, pattern: RegExp): boolean {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((element) =>
    pattern.test(`${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`.trim())
  );
  return button ? clickElement(button) : false;
}

function activeQuizRoot(root: Document): ParentNode {
  return root.querySelector("[class*='QuizDetailPlaying_root']") ?? root;
}

function configureMachugi(root: Document): boolean {
  const input = root.querySelector<HTMLInputElement>(searchInputSelector);
  if (!input) {
    root.defaultView?.location.assign("https://machugi.io/");
    return true;
  }

  input.focus();
  input.click();
  return true;
}

function runNavigationCommand(command: QuizCommandName, root: Document): boolean | null {
  if (command === "previous") {
    root.defaultView?.history.back();
    return true;
  }

  if (command === "reset") {
    root.defaultView?.location.reload();
    return true;
  }

  return null;
}

function isSiteSearchInput(input: HTMLInputElement): boolean {
  const searchLabel = `${input.getAttribute("aria-label") ?? ""} ${input.getAttribute("placeholder") ?? ""} ${input.name ?? ""}`.trim();
  return /검색|search/i.test(searchLabel);
}

function setTextControlValue(input: TextAnswerControl, value: string): void {
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) {
    input.textContent = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const prototype = Object.getPrototypeOf(input) as HTMLInputElement | HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findTextAnswerInput(root: ParentNode): TextAnswerControl | null {
  const inputs = Array.from(root.querySelectorAll<TextAnswerControl>(textAnswerSelector));
  return (
    inputs.find((input) => {
      if (input instanceof HTMLTextAreaElement) return !input.disabled && !input.readOnly;
      if (!(input instanceof HTMLInputElement)) return input.getAttribute("contenteditable") === "true";

      if (input.disabled || input.readOnly) return false;
      const type = input.type.toLowerCase();
      if (type === "search") return !isSiteSearchInput(input);
      return type !== "hidden" && type !== "button" && type !== "submit";
    }) ?? null
  );
}

function findSubmitButton(root: ParentNode, input: TextAnswerControl | null): HTMLButtonElement | null {
  const form = input?.closest("form");
  const candidates = Array.from((form ?? root).querySelectorAll<HTMLButtonElement>("button"));
  return candidates.find((button) => {
    const label = `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`;
    const className = button.className;
    return button.type === "submit" || submitTextPattern.test(label) || className.includes("NextButton_root");
  }) ?? null;
}

function clickChoiceByAnswer(root: ParentNode, answer: string): boolean {
  const expected = normalizedAnswer(answer);
  if (!expected) return false;

  const choices = Array.from(
    root.querySelectorAll<HTMLButtonElement | HTMLElement>("[class*='Choice'] button, button[role='option'], [data-choice], button")
  );
  const choice = choices.find((element) => normalizedAnswer(element.textContent ?? "") === expected);
  return choice instanceof HTMLElement ? clickElement(choice) : false;
}

function submitTextAnswer(rawAnswer: string, root: ParentNode, input: TextAnswerControl): boolean {
  input.focus();
  setTextControlValue(input, rawAnswer);

  const submitButton = findSubmitButton(root, input);
  if (submitButton) {
    return clickElement(submitButton);
  }

  const form = input.closest("form");
  form?.requestSubmit();
  return Boolean(form);
}

export function submitOriginalAnswerDetailed(rawAnswer: string, root: Document = document): OriginalAnswerSubmitResult {
  const quizRoot = activeQuizRoot(root);

  if (clickChoiceByAnswer(quizRoot, rawAnswer)) {
    const followupInput = findTextAnswerInput(quizRoot);
    if (!followupInput) return { ok: true, method: "choice" };
    return submitTextAnswer(rawAnswer, quizRoot, followupInput)
      ? { ok: true, method: "choice-then-text" }
      : { ok: false, method: null };
  }

  const input = findTextAnswerInput(quizRoot);
  if (!input) return { ok: false, method: null };

  return submitTextAnswer(rawAnswer, quizRoot, input) ? { ok: true, method: "text" } : { ok: false, method: null };
}

export function submitOriginalAnswer(rawAnswer: string, root: Document = document): boolean {
  return submitOriginalAnswerDetailed(rawAnswer, root).ok;
}

export function runMachugiCommand(command: QuizCommandName, root: Document = document): boolean {
  if (command === "configure") {
    return configureMachugi(root);
  }

  const navigationResult = runNavigationCommand(command, root);
  if (navigationResult !== null) {
    return navigationResult;
  }

  if (command === "start" && clickButtonByText(root, /\d+\s*개\s*(풀기|시작)|플레이\s*이전/)) {
    return true;
  }

  for (const selector of commandSelectors[command] ?? []) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
      return clickElement(element);
    }
  }

  if ((command === "next" || command === "skip") && clickButtonByText(activeQuizRoot(root), nextButtonPattern)) {
    return true;
  }

  return false;
}
