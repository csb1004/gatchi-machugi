import type { MirrorQuizResult, SourceMirrorState } from "@gatchi/shared";
import { extractQuizState } from "./extractor";

const searchInputSelector = "input[type='search'], input[aria-label*='검색'], input[name*='search' i]";
const resultSelector = "a[href*='quiz'], a[class*='QuizCard'], article a[href], [class*='QuizCard'] a[href]";
const playingSelector = "[class*='QuizDetailPlaying'], [data-question-text], [data-question-image], audio, video";
const resultFeedbackSelector = "[class*='QuizDetailAnswerResult'], [role='alert'], [data-result-message]";

function now(): string {
  return new Date().toISOString();
}

function absoluteUrl(value: string | null, root: Document): string | null {
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

function resultTitle(element: Element): string {
  const preferred = element.querySelector("strong, h1, h2, h3, [class*='Title']")?.textContent;
  return compactText(preferred || element.textContent).slice(0, 120);
}

function extractResults(root: Document): MirrorQuizResult[] {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>(resultSelector));
  const seen = new Set<string>();

  return anchors
    .map((anchor, index) => {
      const href = absoluteUrl(anchor.getAttribute("href"), root);
      const title = resultTitle(anchor);
      const id = href || `${index + 1}:${title}`;
      const image = anchor.querySelector<HTMLImageElement>("img");
      const description = compactText(anchor.querySelector("p, [class*='Description'], [class*='Meta']")?.textContent).slice(0, 160) || null;

      return {
        id,
        title,
        href,
        thumbnailUrl: absoluteUrl(image?.getAttribute("src") ?? null, root),
        description,
        meta: description ? [description] : []
      };
    })
    .filter((result) => {
      if (!result.title || seen.has(result.id)) return false;
      seen.add(result.id);
      return true;
    })
    .slice(0, 30);
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
