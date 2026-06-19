import type { QuizCommandName } from "@gatchi/shared";

const commandSelectors: Partial<Record<QuizCommandName, string[]>> = {
  next: ["[data-command='next']", "button[aria-label*='next' i]", "button[class*='NextButton_root']"],
  previous: ["[data-command='previous']", "button[aria-label*='previous' i]"],
  start: ["[data-command='start']", "button[aria-label*='start' i]"],
  skip: ["[data-command='skip']", "button[aria-label*='skip' i]", "button[class*='NextButton_root']"],
  reset: ["[data-command='reset']", "button[aria-label*='reset' i]"],
  "reveal-original-answer": ["[data-command='reveal']", "button[aria-label*='answer' i]"]
};

function clickElement(element: HTMLElement): true {
  element.click();
  return true;
}

function clickButtonByText(root: Document, pattern: RegExp): boolean {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((element) => pattern.test(element.textContent?.trim() ?? ""));
  return button ? clickElement(button) : false;
}

function configureMachugi(root: Document): boolean {
  const input = root.querySelector<HTMLInputElement>("input[aria-label='검색창'], input[type='search'], input[placeholder*='검색']");
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

export function runMachugiCommand(command: QuizCommandName, root: Document = document): boolean {
  if (command === "configure") {
    return configureMachugi(root);
  }

  const navigationResult = runNavigationCommand(command, root);
  if (navigationResult !== null) {
    return navigationResult;
  }

  if (command === "start" && clickButtonByText(root, /\d+\s*개\s*풀기|시작|플레이|도전/)) {
    return true;
  }

  for (const selector of commandSelectors[command] ?? []) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
      return clickElement(element);
    }
  }

  return false;
}
