import type { SourceMirrorAction } from "@gatchi/shared";
import { runMachugiCommand } from "./commands";

type ActionResult = { ok: true } | { ok: false; reason: string };

const searchInputSelector = [
  "input[type='search']",
  "input[placeholder*='검색']",
  "input[aria-label*='검색']",
  "input[name*='search' i]"
].join(", ");
const startButtonPattern = /시작|풀기|start/i;

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function absoluteUrl(value: string | null | undefined, root: Document): string | null {
  if (!value) return null;

  try {
    return new URL(value, root.location.href).toString();
  } catch {
    return value;
  }
}

function navigateCurrentTab(root: Document, href: string): ActionResult {
  const view = root.defaultView;
  if (!view) return { ok: false, reason: "원본 창을 제어할 수 없습니다." };

  view.location.assign(href);
  return { ok: true };
}

function openAnchorInCurrentTab(anchor: HTMLAnchorElement): ActionResult {
  anchor.removeAttribute("target");
  anchor.rel = "";
  anchor.click();
  return { ok: true };
}

function clickButtonByText(root: Document, pattern: RegExp): boolean {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((element) =>
    pattern.test(`${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`)
  );
  if (!button) return false;
  button.click();
  return true;
}

function clickElement(element: HTMLElement): void {
  const clickable = element.closest<HTMLElement>("[class*='Slider_mark'], button, [role='button']") ?? element;
  clickable.click();
}

function clickOptionByNumber(root: Document, value: number | null, nounPattern: RegExp): boolean {
  const expected = value === null ? /타이머\s*X|없음|무제한|none|off/i : new RegExp(`(^|\\D)${value}(\\D|$)`);
  const elements = Array.from(root.querySelectorAll<HTMLElement>("button, [role='button'], [class*='Slider_mark'], [class*='Slider_markLabel']"));
  const element = elements.find((element) => {
    const label = `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`.trim();
    return expected.test(label) && nounPattern.test(label);
  });
  if (!element) return false;
  clickElement(element);
  return true;
}

function runSearch(query: string, root: Document): ActionResult {
  const input = root.querySelector<HTMLInputElement>(searchInputSelector);
  if (!input) return { ok: false, reason: "검색창을 찾을 수 없습니다." };

  input.focus();
  setInputValue(input, query);
  const form = input.closest("form");
  if (form) {
    form.requestSubmit();
    return { ok: true };
  }

  if (clickButtonByText(root, /검색|search/i)) return { ok: true };
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return { ok: true };
}

function runSelectResult(href: string | null | undefined, resultId: string, root: Document): ActionResult {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const target = anchors.find((anchor) => {
    const absolute = absoluteUrl(anchor.getAttribute("href"), root);
    return absolute === href || absolute === resultId || anchor.textContent?.trim() === resultId;
  });

  if (target) return openAnchorInCurrentTab(target);

  const directUrl = absoluteUrl(href ?? resultId, root);
  if (directUrl?.includes("/quiz/")) return navigateCurrentTab(root, directUrl);

  return { ok: false, reason: "선택한 퀴즈를 원본 화면에서 찾을 수 없습니다." };
}

function dispatchScroll(target: EventTarget): void {
  target.dispatchEvent(new Event("scroll", { bubbles: true }));
}

function scrollElementToBottom(element: HTMLElement): boolean {
  if (element.scrollHeight <= element.clientHeight + 8) return false;

  element.scrollTo?.({ top: element.scrollHeight, behavior: "auto" });
  element.scrollTop = element.scrollHeight;
  dispatchScroll(element);
  return true;
}

function runLoadMoreResults(root: Document): ActionResult {
  const view = root.defaultView;
  if (!view) return { ok: false, reason: "원본 창을 제어할 수 없습니다." };

  const pageBottom = Math.max(root.documentElement.scrollHeight, root.body?.scrollHeight ?? 0);
  view.scrollTo({ top: pageBottom, behavior: "auto" });
  root.documentElement.scrollTop = pageBottom;
  if (root.body) root.body.scrollTop = pageBottom;
  dispatchScroll(view);

  const scrollTargets = Array.from(root.querySelectorAll<HTMLElement>("main, [class*='scroll'], [style*='overflow'], section, div, ul, ol"))
    .filter((element) => element.scrollHeight > element.clientHeight + 8)
    .sort((left, right) => right.scrollHeight - right.clientHeight - (left.scrollHeight - left.clientHeight))
    .slice(0, 5);
  scrollTargets.forEach(scrollElementToBottom);

  return { ok: true };
}

export function runSourceMirrorAction(action: SourceMirrorAction, root: Document = document): ActionResult {
  if (action.name === "focusHome") {
    return navigateCurrentTab(root, "https://machugi.io/");
  }

  if (action.name === "search") return runSearch(action.query, root);
  if (action.name === "selectResult") return runSelectResult(action.href, action.resultId, root);
  if (action.name === "loadMoreResults") return runLoadMoreResults(root);
  if (action.name === "setTimer") {
    return clickOptionByNumber(root, action.timerSeconds, /초|타이머|timer|second|x/i)
      ? { ok: true }
      : { ok: false, reason: "타이머 설정을 원본 화면에서 찾을 수 없습니다." };
  }
  if (action.name === "setQuestionCount") {
    return clickOptionByNumber(root, action.questionCount, /개|문항|문제|전체|question|count/i)
      ? { ok: true }
      : { ok: false, reason: "문항 수 설정을 원본 화면에서 찾을 수 없습니다." };
  }
  if (action.name === "startQuiz") {
    return clickButtonByText(root, startButtonPattern) || runMachugiCommand("start", root)
      ? { ok: true }
      : { ok: false, reason: "시작 버튼을 찾을 수 없습니다." };
  }
  if (action.name === "next") return runMachugiCommand("next", root) ? { ok: true } : { ok: false, reason: "다음 버튼을 찾을 수 없습니다." };
  if (action.name === "previous") {
    return runMachugiCommand("previous", root) ? { ok: true } : { ok: false, reason: "이전 화면으로 이동할 수 없습니다." };
  }
  if (action.name === "skip") return runMachugiCommand("skip", root) ? { ok: true } : { ok: false, reason: "건너뛰기 버튼을 찾을 수 없습니다." };
  if (action.name === "refreshSource") {
    root.defaultView?.location.reload();
    return { ok: true };
  }

  return { ok: false, reason: "이 동작은 현재 원본 화면에서 자동 적용할 수 없습니다." };
}
