import type { QuizCommandName } from "@gatchi/shared";
import { runMachugiCommand } from "./machugi/commands";
import { extractQuizState } from "./machugi/extractor";
import { CONTENT_COMMAND_MESSAGE, CONTENT_STATE_MESSAGE } from "./messages";

function sendState() {
  chrome.runtime.sendMessage({
    type: CONTENT_STATE_MESSAGE,
    payload: extractQuizState(document)
  });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === CONTENT_COMMAND_MESSAGE
  ) {
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

sendState();
