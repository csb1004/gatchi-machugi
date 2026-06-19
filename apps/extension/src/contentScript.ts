import type {
  OriginalSubmitAllowedPayload,
  QuizCommandName,
  QuizState,
  RoomState,
  SourceMirrorActionPayload,
  SourceMirrorState
} from "@gatchi/shared";
import { runMachugiCommand, submitOriginalAnswer } from "./machugi/commands";
import { extractQuizState } from "./machugi/extractor";
import { runSourceMirrorAction } from "./machugi/sourceActions";
import { countSourceMirrorResults, extractSourceMirrorState } from "./machugi/sourceMirror";
import { createOriginalSubmissionLock, type OriginalSubmissionLockController } from "./machugi/lock";

const CONTENT_STATE_MESSAGE = "machugi-state";
const CONTENT_COMMAND_MESSAGE = "machugi-command";
const CONTENT_REQUEST_STATE_MESSAGE = "machugi-request-state";
const CONTENT_FRAME_READY_MESSAGE = "machugi-frame-ready";
const CONTENT_FAIR_PLAY_MESSAGE = "machugi-fair-play";
const CONTENT_ORIGINAL_REQUEST_SUBMIT_MESSAGE = "machugi-original-request-submit";
const CONTENT_ORIGINAL_SUBMIT_MESSAGE = "machugi-original-submit";
const CONTENT_ORIGINAL_RESULT_MESSAGE = "machugi-original-result";
const CONTENT_ORIGINAL_FAILURE_MESSAGE = "machugi-original-failure";
const CONTENT_SOURCE_MIRROR_MESSAGE = "machugi-source-mirror";
const CONTENT_SOURCE_ACTION_MESSAGE = "machugi-source-action";
const CONTENT_SOURCE_ACTION_FAILURE_MESSAGE = "machugi-source-action-failure";

const contentWindow = window as Window & { __gatchiMachugiContentScriptInstalled?: boolean };

let originalSubmissionLock: OriginalSubmissionLockController | null = null;
let resultExpansionTimer: number | null = null;
let expandingResults = false;
const expandedResultKeys = new Set<string>();

function sendState() {
  chrome.runtime.sendMessage({
    type: CONTENT_STATE_MESSAGE,
    href: window.location.href,
    title: document.title,
    payload: extractQuizState(document)
  });
  sendSourceMirrorState();
}

function sourceMirrorExpansionKey(state: SourceMirrorState): string | null {
  if (state.kind !== "searchResults") return null;
  return `${state.url}::${state.query}`;
}

function scheduleResultExpansion(state: SourceMirrorState) {
  const key = sourceMirrorExpansionKey(state);
  if (!key || expandingResults || expandedResultKeys.has(key) || resultExpansionTimer !== null) return;

  resultExpansionTimer = window.setTimeout(() => {
    resultExpansionTimer = null;
    void expandSearchResults(key);
  }, 250);
}

function sendSourceMirrorState(options: { allowResultExpansion?: boolean } = {}) {
  const state = extractSourceMirrorState(document);
  chrome.runtime.sendMessage({
    type: CONTENT_SOURCE_MIRROR_MESSAGE,
    href: window.location.href,
    title: document.title,
    payload: state
  });
  if (options.allowResultExpansion ?? true) scheduleResultExpansion(state);
}

function sendOriginalSubmitRequest(payload: { roomCode: string; questionKey: string }) {
  chrome.runtime.sendMessage({
    type: CONTENT_ORIGINAL_REQUEST_SUBMIT_MESSAGE,
    payload
  });
}

function sendOriginalResult(payload: { roomCode: string; questionKey: string; quiz: QuizState }) {
  chrome.runtime.sendMessage({
    type: CONTENT_ORIGINAL_RESULT_MESSAGE,
    payload
  });
}

function sendOriginalFailure(payload: { roomCode: string; questionKey: string; reason: string }) {
  chrome.runtime.sendMessage({
    type: CONTENT_ORIGINAL_FAILURE_MESSAGE,
    payload
  });
}

function sendSourceActionFailure(payload: SourceMirrorActionPayload, reason: string) {
  chrome.runtime.sendMessage({
    type: CONTENT_SOURCE_ACTION_FAILURE_MESSAGE,
    payload: {
      ...payload,
      reason
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function expandSearchResults(key: string) {
  if (expandingResults) return;

  expandingResults = true;
  const originalScrollY = window.scrollY;

  try {
    let stablePasses = 0;
    let previousCount = countSourceMirrorResults(document);
    let previousHeight = document.documentElement.scrollHeight;

    for (let pass = 0; pass < 24; pass += 1) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      await delay(650);

      const nextCount = countSourceMirrorResults(document);
      const nextHeight = document.documentElement.scrollHeight;
      sendSourceMirrorState({ allowResultExpansion: false });

      if (nextCount <= previousCount && nextHeight <= previousHeight) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
      }

      previousCount = nextCount;
      previousHeight = nextHeight;

      if (stablePasses >= 2) break;
    }

    expandedResultKeys.add(key);
    window.scrollTo({ top: Math.min(originalScrollY, document.documentElement.scrollHeight), behavior: "auto" });
    sendSourceMirrorState({ allowResultExpansion: false });
  } finally {
    expandingResults = false;
  }
}

function hasOriginalResult(quiz: QuizState): boolean {
  return quiz.resultMessage !== null || quiz.answerCandidates.length > 0;
}

function showLockNotice(message: string) {
  const existing = document.getElementById("gatchi-machugi-lock-notice");
  existing?.remove();

  const notice = document.createElement("div");
  notice.id = "gatchi-machugi-lock-notice";
  notice.textContent = message;
  notice.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:24px",
    "z-index:2147483647",
    "max-width:min(420px,calc(100vw - 32px))",
    "transform:translateX(-50%)",
    "padding:12px 16px",
    "border-radius:10px",
    "background:#101827",
    "color:#ffffff",
    "font:600 14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "box-shadow:0 10px 30px rgba(0,0,0,.26)",
    "text-align:center"
  ].join(";");
  document.documentElement.append(notice);
  window.setTimeout(() => notice.remove(), 2400);
}

async function reportOriginalResultWhenReady(payload: OriginalSubmitAllowedPayload) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await delay(attempt === 0 ? 350 : 250);
    const quiz = extractQuizState(document);
    sendState();

    if (hasOriginalResult(quiz)) {
      sendOriginalResult({
        roomCode: payload.roomCode,
        questionKey: payload.questionKey,
        quiz
      });
      return;
    }
  }

  const reason = "원본 결과를 아직 읽지 못했습니다. 다시 시도해주세요.";
  sendOriginalFailure({
    roomCode: payload.roomCode,
    questionKey: payload.questionKey,
    reason
  });
  showLockNotice(reason);
}

async function handleOriginalSubmitAllowed(payload: OriginalSubmitAllowedPayload) {
  const submitted = originalSubmissionLock?.runWithOriginalSubmitBypass(() => submitOriginalAnswer(payload.hostRawAnswer, document)) ?? false;

  if (!submitted) {
    const reason = "원본 사이트에 답을 자동 제출하지 못했습니다.";
    sendOriginalFailure({
      roomCode: payload.roomCode,
      questionKey: payload.questionKey,
      reason
    });
    showLockNotice(reason);
    return;
  }

  await reportOriginalResultWhenReady(payload);
}

if (!contentWindow.__gatchiMachugiContentScriptInstalled) {
  contentWindow.__gatchiMachugiContentScriptInstalled = true;

  originalSubmissionLock = createOriginalSubmissionLock(document, {
    onRequestOriginalSubmit: sendOriginalSubmitRequest,
    onLockedAttempt: showLockNotice
  });

  chrome.runtime.sendMessage({ type: CONTENT_FRAME_READY_MESSAGE, href: window.location.href, title: document.title });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (typeof message !== "object" || message === null || !("type" in message)) {
      return false;
    }

    const messageType = (message as { type?: unknown }).type;

    if (messageType === CONTENT_FAIR_PLAY_MESSAGE) {
      originalSubmissionLock?.updateRoomState((message as unknown as { payload: RoomState }).payload);
      sendResponse({ ok: true });
      return true;
    }

    if (messageType === CONTENT_ORIGINAL_SUBMIT_MESSAGE) {
      void handleOriginalSubmitAllowed((message as unknown as { payload: OriginalSubmitAllowedPayload }).payload);
      sendResponse({ ok: true });
      return true;
    }

    if (messageType === CONTENT_REQUEST_STATE_MESSAGE) {
      sendState();
      sendResponse({ ok: true });
      return true;
    }

    if (messageType === CONTENT_COMMAND_MESSAGE) {
      const command = (message as { command?: QuizCommandName }).command;
      sendResponse({ ok: command ? runMachugiCommand(command) : false });
      window.setTimeout(sendState, 250);
      return true;
    }

    if (messageType === CONTENT_SOURCE_ACTION_MESSAGE) {
      const payload = (message as unknown as { payload: SourceMirrorActionPayload }).payload;
      const result = runSourceMirrorAction(payload.action, document);
      if (!result.ok) {
        sendSourceActionFailure(payload, result.reason);
      }
      window.setTimeout(sendState, 250);
      sendResponse(result);
      return true;
    }

    return false;
  });

  const observer = new MutationObserver(() => {
    sendState();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true
  });
}

sendState();
