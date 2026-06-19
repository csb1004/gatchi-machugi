import type { PairHostRequestMessage, PairHostResponse, PairingSettings, StoredPairingSettings } from "./socketClient.js";
import type { QuizCommandPayload, QuizState } from "@gatchi/shared";
import { CONTENT_COMMAND_MESSAGE, CONTENT_STATE_MESSAGE } from "./messages.js";
import {
  MachugiSocketClient,
  PAIRING_REQUEST_TYPE,
  PAIRING_STORAGE_KEY,
  buildPairPayload,
  normalizeServerUrl
} from "./socketClient.js";

const socketClient = new MachugiSocketClient();
let pairedRoomCode: string | null = null;
let pairedTabId: number | null = null;

function isPairHostRequestMessage(message: unknown): message is PairHostRequestMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === PAIRING_REQUEST_TYPE &&
    "payload" in message
  );
}

function toStoredPairingSettings(payload: PairingSettings): StoredPairingSettings {
  const pairPayload = buildPairPayload(payload);

  return {
    serverUrl: normalizeServerUrl(payload.serverUrl),
    roomCode: pairPayload.roomCode
  };
}

async function savePairingSettings(settings: StoredPairingSettings): Promise<void> {
  await new Promise((resolve, reject) => {
    chrome.storage.local.set({ [PAIRING_STORAGE_KEY]: settings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(undefined);
    });
  });
}

function isMachugiUrl(url: string | undefined): boolean {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname;
    return hostname === "machugi.io" || hostname.endsWith(".machugi.io");
  } catch {
    return false;
  }
}

async function activeMachugiTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id && isMachugiUrl(tab.url) ? tab.id : null;
}

function registerPairedBridge(roomCode: string, tabId: number) {
  pairedRoomCode = roomCode;
  pairedTabId = tabId;
  socketClient.onQuizCommand((command) => {
    void sendCommandToPairedMachugiTab(command);
  });
}

async function pairHost(payload: PairingSettings): Promise<PairHostResponse> {
  const settings = toStoredPairingSettings(payload);

  try {
    const tabId = await activeMachugiTabId();
    if (!tabId) {
      throw new Error("연결 전에 마추기아이오 방장 탭을 열어주세요.");
    }

    const pairResult = await socketClient.connectAndPair(payload);
    registerPairedBridge(pairResult.roomCode, tabId);
    await savePairingSettings(settings);
    return {
      ok: true,
      data: {
        roomCode: pairResult.roomCode
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "방장 확장 프로그램 연결에 실패했습니다."
    };
  }
}

async function sendCommandToPairedMachugiTab(command: QuizCommandPayload): Promise<void> {
  if (!pairedTabId) return;

  await chrome.tabs.sendMessage(pairedTabId, {
    type: CONTENT_COMMAND_MESSAGE,
    command: command.command,
    values: command.values
  });
}

async function forwardQuizState(quiz: QuizState): Promise<void> {
  if (!pairedRoomCode) return;

  try {
    await socketClient.sendExtensionState({
      roomCode: pairedRoomCode,
      quiz
    });
  } catch (error) {
    console.error("마추기 상태 전달에 실패했습니다.", error);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === CONTENT_STATE_MESSAGE
  ) {
    if (sender.tab?.id === pairedTabId) {
      void forwardQuizState((message as unknown as { payload: QuizState }).payload);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "연결되지 않은 마추기아이오 탭입니다." });
    }
    return true;
  }

  if (!isPairHostRequestMessage(message)) {
    return false;
  }

  void pairHost(message.payload).then(sendResponse);
  return true;
});
