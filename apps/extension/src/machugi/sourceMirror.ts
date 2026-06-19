import type { MirrorQuizResult, SourceMirrorState } from "@gatchi/shared";
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
    return new URL(root.location.href).searchParams.get("q")?.trim() ?? "";
  } catch {
    return "";
  }
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
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

  return results.slice(0, 60);
}

function hasPlayableEvidence(root: Document): boolean {
  return Boolean(root.querySelector(playingSelector));
}

function hasResultEvidence(root: Document): boolean {
  return Boolean(root.querySelector(resultFeedbackSelector));
}

export function extractSourceMirrorState(root: Document = document): SourceMirrorState {
  const url = root.location.href;
  const title = root.title || null;
  const lastSeenAt = now();

  if (hasPlayableEvidence(root)) {
    const quiz = extractQuizState(root);
    return {
      kind: hasResultEvidence(root) ? "result" : "playing",
      url,
      title,
      lastSeenAt,
      quiz
    };
  }

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
