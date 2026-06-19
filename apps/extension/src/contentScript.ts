import type { QuizCommandName } from "@gatchi/shared";
import { runMachugiCommand } from "./machugi/commands";
import { extractQuizState } from "./machugi/extractor";

const CONTENT_STATE_MESSAGE = "machugi-state";
const CONTENT_COMMAND_MESSAGE = "machugi-command";
const CONTENT_REQUEST_STATE_MESSAGE = "machugi-request-state";
const CONTENT_FRAME_READY_MESSAGE = "machugi-frame-ready";

const contentWindow = window as Window & { __gatchiMachugiContentScriptInstalled?: boolean };

function sendState() {
  chrome.runtime.sendMessage({
    type: CONTENT_STATE_MESSAGE,
    payload: extractQuizState(document)
  });
}

if (!contentWindow.__gatchiMachugiContentScriptInstalled) {
  contentWindow.__gatchiMachugiContentScriptInstalled = true;

  chrome.runtime.sendMessage({ type: CONTENT_FRAME_READY_MESSAGE, href: window.location.href });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (typeof message !== "object" || message === null || !("type" in message)) {
      return false;
    }

    const messageType = (message as { type?: unknown }).type;

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
