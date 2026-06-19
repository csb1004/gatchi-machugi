import type { MirrorQuizResult, MirrorQuizSettings, MirrorQuizSummary, SourceMirrorState } from "@gatchi/shared";
import { extractQuizState } from "./extractor";

const searchInputSelector = [
  "input[type='search']",
  "input[placeholder*='검색']",
  "input[aria-label*='검색']",
  "input[name*='search' i]"
].join(", ");
const resultSelector = [
  "a[class*='QuizMainCard_link'][href*='/quiz/']",
  "a[href^='/quiz/']",
  "a[href*='machugi.io/quiz/']",
  "article a[href*='/quiz/']"
].join(", ");
const playingSelector = "[class*='QuizDetailPlaying'], [data-question-text], [data-question-image], audio, video";
const resultFeedbackSelector = "[class*='QuizDetailAnswerResult'], [role='alert'], [data-result-message]";
const detailReadySelector = "[class*='QuizDetailReady_mainContainer'], [class*='QuizDetailReady_title'], [class*='QuizDetailReadyButtonGroup']";
const gameEndSummaryPattern = /\d+\s*개\s*맞히셨습니다/;
const gameEndPercentilePattern = /상위\s*\d+\s*%/;

function now(): string {
  return new Date().toISOString();
}

function absoluteUrl(value: string | null | undefined, root: Document): string | null {
  if (!value) return null;

  try {
    return new URL(value, root.location.href).toString();
  } catch {
    return value;
  }
}

function currentQuery(root: Document): string {
  const input = root.querySelector<HTMLInputElement>(searchInputSelector);
  if (input?.value) return input.value.trim();

  try {
    const params = new URL(root.location.href).searchParams;
    return (params.get("keyword") ?? params.get("q") ?? "").trim();
  } catch {
    return "";
  }
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function directText(element: Element): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent?.trim() ?? "")
    .join(" ")
    .trim();
}

function firstMatchingText(root: ParentNode, pattern: RegExp): string | null {
  const elements = Array.from(root.querySelectorAll("*"));
  for (const element of elements) {
    const directValue = compactText(directText(element));
    if (directValue && pattern.test(directValue)) return directValue;

    if (element.children.length > 0) continue;
    const value = compactText(element.textContent);
    if (pattern.test(value)) return value;
  }
  return null;
}

function firstText(root: Element, selectors: string[]): string {
  for (const selector of selectors) {
    const text = compactText(root.querySelector(selector)?.textContent);
    if (text) return text;
  }
  return "";
}

function titleFromImage(anchor: HTMLAnchorElement): string {
  const alt = compactText(anchor.querySelector<HTMLImageElement>("img")?.getAttribute("alt"));
  return alt.replace(/\s*썸네일\s*$/i, "");
}

function fallbackTitle(anchor: HTMLAnchorElement): string {
  const fullText = compactText(anchor.textContent);
  const withoutBadges = fullText
    .replace(/\b\d+(?:\.\d+)?[KMB]?\b/g, " ")
    .replace(/주관식|객관식|OX|O\/X/g, " ");
  return compactText(withoutBadges).slice(0, 80);
}

function resultTitle(anchor: HTMLAnchorElement): string {
  return (
    firstText(anchor, [
      "[class*='QuizMainCard_title']",
      "[class*='title']",
      "strong",
      "h1",
      "h2",
      "h3"
    ]) ||
    titleFromImage(anchor) ||
    fallbackTitle(anchor)
  ).slice(0, 100);
}

function resultDescription(anchor: HTMLAnchorElement, title: string): string | null {
  const description = firstText(anchor, [
    "[class*='QuizMainCard_description']",
    "[class*='description']",
    "p"
  ]);

  if (!description || description === title) return null;
  return description.slice(0, 140);
}

function resultMeta(anchor: HTMLAnchorElement): string[] {
  const hits = firstText(anchor, ["[class*='QuizMainCard_hits']"]);
  const questionType = firstText(anchor, ["[class*='QuestionTypeBadge']", "[class*='badge']"]);
  return [hits, questionType].filter(Boolean).slice(0, 2);
}

function extractResults(root: Document): MirrorQuizResult[] {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>(resultSelector));
  const seen = new Set<string>();
  const results: MirrorQuizResult[] = [];

  for (const anchor of anchors) {
    const href = absoluteUrl(anchor.getAttribute("href"), root);
    const title = resultTitle(anchor);
    const id = href || title;
    if (!id || !title || seen.has(id)) continue;

    const image = anchor.querySelector<HTMLImageElement>("img");
    seen.add(id);
    results.push({
      id,
      title,
      href,
      thumbnailUrl: absoluteUrl(image?.currentSrc || image?.getAttribute("src"), root),
      description: resultDescription(anchor, title),
      meta: resultMeta(anchor)
    });
  }

  return results;
}

export function countSourceMirrorResults(root: Document = document): number {
  return extractResults(root).length;
}

function isQuizDetailRoute(root: Document): boolean {
  try {
    return /^\/quiz\/[^/]+\/?$/.test(new URL(root.location.href).pathname);
  } catch {
    return false;
  }
}

function detailRoot(root: Document): Element {
  return (
    root.querySelector("[class*='QuizDetailReady_mainContainer']") ??
    root.querySelector("[class*='QuizDetailReady_topContainer']") ??
    root.body
  );
}

function titleFromDocumentTitle(title: string | null | undefined): string {
  return compactText(title).replace(/\s*-\s*마추기\s*아이오\s*$/i, "");
}

function extractNumberOptions(root: Element, pattern: RegExp): number[] {
  const values = new Set<number>();
  const elements = Array.from(root.querySelectorAll("button, [role='button'], [class*='Slider_markLabel'], [class*='Slider_mark']"));

  for (const element of elements) {
    const text = compactText(element.textContent);
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    values.add(Number(match[1]));
  }

  return Array.from(values).filter(Number.isFinite);
}

function extractSelectedTimerSeconds(root: Element): number | null {
  const active = root.querySelector("[class*='Slider_markActive']");
  const label = compactText(active?.textContent);
  const match = label.match(/(\d+)\s*초/);
  if (match?.[1]) return Number(match[1]);
  return null;
}

function extractQuizDetail(root: Document): Extract<SourceMirrorState, { kind: "quizDetail" }> | null {
  if (!isQuizDetailRoute(root) || !root.querySelector(detailReadySelector)) return null;

  const container = detailRoot(root);
  const thumbnail = container.querySelector<HTMLImageElement>(
    "[class*='QuizDetailReady_thumbnail'] img, img[alt*='썸네일'], img"
  );
  const title =
    firstText(container, ["[class*='QuizDetailReady_title']", "h1", "h2", "strong"]) ||
    titleFromImage((thumbnail?.closest("a") as HTMLAnchorElement | null) ?? root.createElement("a")) ||
    titleFromDocumentTitle(root.title) ||
    "마추기 퀴즈";
  const description = firstText(container, ["[class*='QuizDetailReady_description']", "p"]);
  const timerOptions = extractNumberOptions(container, /(\d+)\s*초/);
  const questionCounts = extractNumberOptions(container, /(\d+)\s*개\s*풀기/);
  const settings: MirrorQuizSettings = {
    timerSeconds: extractSelectedTimerSeconds(container),
    questionCount: null,
    availableTimers: timerOptions,
    availableQuestionCounts: questionCounts
  };
  const quiz: MirrorQuizSummary = {
    title,
    href: root.location.href,
    thumbnailUrl: absoluteUrl(thumbnail?.currentSrc || thumbnail?.getAttribute("src"), root),
    description: description || null,
    meta: []
  };

  return {
    kind: "quizDetail",
    url: root.location.href,
    title: root.title || null,
    lastSeenAt: now(),
    quiz,
    settings
  };
}

function extractGameEnd(root: Document): Extract<SourceMirrorState, { kind: "gameEnd" }> | null {
  const summaryText = firstMatchingText(root.body, gameEndSummaryPattern);
  if (!summaryText) return null;

  return {
    kind: "gameEnd",
    url: root.location.href,
    title: root.title || null,
    lastSeenAt: now(),
    summaryText,
    percentileText: firstMatchingText(root.body, gameEndPercentilePattern),
    results: extractResults(root)
  };
}

function hasPlayableEvidence(root: Document): boolean {
  return Boolean(root.querySelector(playingSelector));
}

function hasResultEvidence(root: Document, quiz: ReturnType<typeof extractQuizState>): boolean {
  return Boolean(root.querySelector(resultFeedbackSelector) || quiz.resultMessage || quiz.answerCandidates.length > 0);
}

export function extractSourceMirrorState(root: Document = document): SourceMirrorState {
  const url = root.location.href;
  const title = root.title || null;
  const lastSeenAt = now();

  if (hasPlayableEvidence(root)) {
    const quiz = extractQuizState(root);
    return {
      kind: hasResultEvidence(root, quiz) ? "result" : "playing",
      url,
      title,
      lastSeenAt,
      quiz
    };
  }

  const quizDetail = extractQuizDetail(root);
  if (quizDetail) return quizDetail;

  const gameEnd = extractGameEnd(root);
  if (gameEnd) return gameEnd;

  const query = currentQuery(root);
  const results = extractResults(root);
  if (results.length > 0) {
    return {
      kind: "searchResults",
      url,
      title,
      lastSeenAt,
      query,
      results
    };
  }

  if (root.querySelector(searchInputSelector) || new URL(url).pathname === "/") {
    return {
      kind: "home",
      url,
      title,
      lastSeenAt,
      query
    };
  }

  return {
    kind: "unsupported",
    url,
    title,
    lastSeenAt,
    reason: "원본 사이트의 현재 화면을 읽을 수 없습니다."
  };
}
