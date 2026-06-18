import type { QuizCommandName } from "@gatchi/shared";

const commandSelectors: Partial<Record<QuizCommandName, string[]>> = {
  next: ["[data-command='next']", "button[aria-label*='next' i]"],
  previous: ["[data-command='previous']", "button[aria-label*='previous' i]"],
  start: ["[data-command='start']", "button[aria-label*='start' i]"],
  skip: ["[data-command='skip']", "button[aria-label*='skip' i]"],
  reset: ["[data-command='reset']", "button[aria-label*='reset' i]"],
  "reveal-original-answer": ["[data-command='reveal']", "button[aria-label*='answer' i]"]
};

export function runMachugiCommand(command: QuizCommandName, root: Document = document): boolean {
  for (const selector of commandSelectors[command] ?? []) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
      element.click();
      return true;
    }
  }

  return false;
}
