import type {
  AppPairingSettingsPayload,
  OriginalFailurePayload,
  OriginalResultPayload,
  OriginalSubmitAllowedPayload,
  OriginalSubmitRequestPayload,
  QuizCommandPayload,
  QuizState,
  RoomState
} from "@gatchi/shared";
import { APP_PAIRING_SETTINGS_MESSAGE } from "@gatchi/shared";
import {
  CONTENT_COMMAND_MESSAGE,
  CONTENT_FAIR_PLAY_MESSAGE,
  CONTENT_FRAME_READY_MESSAGE,
  CONTENT_ORIGINAL_FAILURE_MESSAGE,
  CONTENT_ORIGINAL_REQUEST_SUBMIT_MESSAGE,
  CONTENT_ORIGINAL_RESULT_MESSAGE,
  CONTENT_ORIGINAL_SUBMIT_MESSAGE,
  CONTENT_STATE_MESSAGE
} from "./messages.js";
import { normalizePairingSettingsForStorage } from "./pairingSettings.js";
import type { PairHostRequestMessage, PairHostResponse, PairingSettings, StoredPairingSettings } from "./socketClient.js";
import {
  MachugiSocketClient,
  PAIRING_REQUEST_TYPE,
  PAIRING_STORAGE_KEY
} from "./socketClient.js";

interface MachugiFrameTarget {
  tabId: number;
  frameId: number;
}

const socketClient = new MachugiSocketClient();
let pairedRoomCode: string | null = null;
let pairedAppTabId: number | null = null;
let pairedMachugiFrame: MachugiFrameTarget | null = null;
let latestRoomState: RoomState | null = null;
let unregisterBridgeHandlers: Array<() => void> = [];

function isPairHostRequestMessage(message: unknown): message is PairHostRequestMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === PAIRING_REQUEST_TYPE &&
    "payload" in message
  );
}

function isAppPairingSettingsMessage(message: unknown): message is { type: typeof APP_PAIRING_SETTINGS_MESSAGE; payload: AppPairingSettingsPayload } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === APP_PAIRING_SETTINGS_MESSAGE &&
    "payload" in message
  );
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

function rememberRoomState(state: RoomState | undefined): void {
  if (!state) return;
  latestRoomState = state;
  void sendFairPlayStateToPairedMachugiFrame(state);
}

function registerPairedBridge(roomCode: string, appTabId: number | null) {
  pairedRoomCode = roomCode;
  pairedAppTabId = appTabId;
  unregisterBridgeHandlers.forEach((unregister) => unregister());
  unregisterBridgeHandlers = [
    socketClient.onQuizCommand((command) => {
      void sendCommandToPairedMachugiFrame(command);
    }),
    socketClient.onOriginalSubmitAllowed((payload) => {
      void sendOriginalSubmitToPairedMachugiFrame(payload);
    }),
    socketClient.onRoomState((state) => {
      rememberRoomState(state);
    })
  ];
}

async function pairHost(payload: PairingSettings, appTabId: number | null): Promise<PairHostResponse> {
  const settings = normalizePairingSettingsForStorage(payload);

  try {
    const pairResult = await socketClient.connectAndPair(payload);
    registerPairedBridge(pairResult.roomCode, appTabId);
    rememberRoomState(pairResult.state);
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

function bindMachugiFrame(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.tab?.id || sender.frameId === undefined) return false;
  if (pairedAppTabId !== null && sender.tab.id !== pairedAppTabId) return false;

  pairedMachugiFrame = {
    tabId: sender.tab.id,
    frameId: sender.frameId
  };
  return true;
}

async function sendMessageToPairedMachugiFrame(message: unknown): Promise<void> {
  const target = pairedMachugiFrame;
  if (!target) return;

  await new Promise<void>((resolve, reject) => {
    chrome.tabs.sendMessage(target.tabId, message, { frameId: target.frameId }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

async function sendCommandToPairedMachugiFrame(command: QuizCommandPayload): Promise<void> {
  await sendMessageToPairedMachugiFrame({
    type: CONTENT_COMMAND_MESSAGE,
    command: command.command,
    values: command.values
  });
}

async function sendFairPlayStateToPairedMachugiFrame(state: RoomState): Promise<void> {
  await sendMessageToPairedMachugiFrame({
    type: CONTENT_FAIR_PLAY_MESSAGE,
    payload: state
  });
}

async function sendOriginalSubmitToPairedMachugiFrame(payload: OriginalSubmitAllowedPayload): Promise<void> {
  await sendMessageToPairedMachugiFrame({
    type: CONTENT_ORIGINAL_SUBMIT_MESSAGE,
    payload
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

async function requestOriginalSubmit(payload: OriginalSubmitRequestPayload): Promise<void> {
  try {
    await socketClient.requestOriginalSubmit(payload);
  } catch (error) {
    console.error("원본 제출 권한 요청에 실패했습니다.", error);
  }
}

async function forwardOriginalResult(payload: OriginalResultPayload): Promise<void> {
  try {
    await socketClient.sendOriginalResult(payload);
  } catch (error) {
    console.error("원본 결과 전달에 실패했습니다.", error);
  }
}

async function forwardOriginalFailure(payload: OriginalFailurePayload): Promise<void> {
  try {
    await socketClient.sendOriginalFailure(payload);
  } catch (error) {
    console.error("원본 제출 실패 전달에 실패했습니다.", error);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (typeof message === "object" && message !== null && "type" in message) {
    const messageType = (message as { type?: unknown }).type;

    if (messageType === CONTENT_FRAME_READY_MESSAGE) {
      const bound = bindMachugiFrame(sender);
      if (bound && latestRoomState) {
        void sendFairPlayStateToPairedMachugiFrame(latestRoomState);
      }
      sendResponse({ ok: bound });
      return true;
    }

    if (messageType === CONTENT_STATE_MESSAGE) {
      if (bindMachugiFrame(sender)) {
        void forwardQuizState((message as unknown as { payload: QuizState }).payload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "연결되지 않은 마추기아이오 화면입니다." });
      }
      return true;
    }

    if (messageType === CONTENT_ORIGINAL_REQUEST_SUBMIT_MESSAGE) {
      if (bindMachugiFrame(sender)) {
        void requestOriginalSubmit((message as unknown as { payload: OriginalSubmitRequestPayload }).payload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "연결되지 않은 마추기아이오 화면입니다." });
      }
      return true;
    }

    if (messageType === CONTENT_ORIGINAL_RESULT_MESSAGE) {
      if (bindMachugiFrame(sender)) {
        void forwardOriginalResult((message as unknown as { payload: OriginalResultPayload }).payload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "연결되지 않은 마추기아이오 화면입니다." });
      }
      return true;
    }

    if (messageType === CONTENT_ORIGINAL_FAILURE_MESSAGE) {
      if (bindMachugiFrame(sender)) {
        void forwardOriginalFailure((message as unknown as { payload: OriginalFailurePayload }).payload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "연결되지 않은 마추기아이오 화면입니다." });
      }
      return true;
    }
  }

  if (!isPairHostRequestMessage(message)) {
    if (isAppPairingSettingsMessage(message)) {
      void pairHost(message.payload, sender.tab?.id ?? null).then(sendResponse);
      return true;
    }

    return false;
  }

  void pairHost(message.payload, sender.tab?.id ?? null).then(sendResponse);
  return true;
});
