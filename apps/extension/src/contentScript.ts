import type { OriginalSubmitAllowedPayload, QuizCommandName, QuizState, RoomState } from "@gatchi/shared";
import { runMachugiCommand, submitOriginalAnswer } from "./machugi/commands";
import { extractQuizState } from "./machugi/extractor";
import { createOriginalSubmissionLock, type OriginalSubmissionLockController } from "./machugi/lock";

const CONTENT_STATE_MESSAGE = "machugi-state";
const CONTENT_COMMAND_MESSAGE = "machugi-command";
const CONTENT_REQUEST_STATE_MESSAGE = "machugi-request-state";
const CONTENT_FRAME_READY_MESSAGE = "machugi-frame-ready";
const CONTENT_FAIR_PLAY_MESSAGE = "machugi-fair-play";
const CONTENT_ORIGINAL_REQUEST_SUBMIT_MESSAGE = "machugi-original-request-submit";
const CONTENT_ORIGINAL_SUBMIT_MESSAGE = "machugi-original-submit";
const CONTENT_ORIGINAL_RESULT_MESSAGE = "machugi-original-result";

const contentWindow = window as Window & { __gatchiMachugiContentScriptInstalled?: boolean };

let originalSubmissionLock: OriginalSubmissionLockController | null = null;

function sendState() {
  chrome.runtime.sendMessage({
    type: CONTENT_STATE_MESSAGE,
    payload: extractQuizState(document)
  });
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

  showLockNotice("원본 결과를 아직 읽지 못했습니다. 결과가 표시되면 다시 시도해주세요.");
}

async function handleOriginalSubmitAllowed(payload: OriginalSubmitAllowedPayload) {
  const submitted = originalSubmissionLock?.runWithOriginalSubmitBypass(() => submitOriginalAnswer(payload.hostRawAnswer, document)) ?? false;

  if (!submitted) {
    showLockNotice("원본 사이트에 답을 자동 제출하지 못했습니다.");
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

  chrome.runtime.sendMessage({ type: CONTENT_FRAME_READY_MESSAGE, href: window.location.href });

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
