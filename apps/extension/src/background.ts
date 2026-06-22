import type {
  AppPairingSettingsPayload,
  OriginalFailurePayload,
  OriginalResultPayload,
  OriginalSubmitAllowedPayload,
  OriginalSubmitRequestPayload,
  QuizCommandPayload,
  QuizState,
  RoomState,
  SourceMirrorActionFailurePayload,
  SourceMirrorActionPayload,
  SourceMirrorState,
  SourceWindowState
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
  CONTENT_REQUEST_STATE_MESSAGE,
  CONTENT_SOURCE_ACTION_FAILURE_MESSAGE,
  CONTENT_SOURCE_ACTION_MESSAGE,
  CONTENT_SOURCE_MIRROR_MESSAGE,
  CONTENT_STATE_MESSAGE,
  USE_CURRENT_TAB_AS_SOURCE_MESSAGE
} from "./messages.js";
import { normalizePairingSettingsForStorage } from "./pairingSettings.js";
import type { PairHostRequestMessage, PairHostResponse, PairingSettings, StoredPairingSettings } from "./socketClient.js";
import { MachugiSocketClient, PAIRING_REQUEST_TYPE, PAIRING_STORAGE_KEY } from "./socketClient.js";

interface MachugiFrameTarget {
  tabId: number;
  frameId: number;
}

interface RuntimeMessage {
  type?: unknown;
  href?: unknown;
  title?: unknown;
  payload?: unknown;
}

type SourceResponse = { ok: true } | { ok: false; error: string };

const SOURCE_CLOSED_MESSAGE = "마추기아이오 원본 창이 닫혔습니다.";
const UNPAIRED_SOURCE_MESSAGE = "먼저 확장 프로그램을 방에 연결해주세요.";
const NOT_MACHUGI_TAB_MESSAGE = "현재 탭이 마추기아이오가 아닙니다.";
const UNBOUND_SOURCE_MESSAGE = "연결되지 않은 마추기아이오 원본 창입니다.";
const ORIGINAL_SOURCE_DISCONNECTED_MESSAGE = "원본 창이 연결되어 있지 않아 자동 제출하지 못했습니다. 원본 창을 다시 연결한 뒤 재시도해주세요.";

const socketClient = new MachugiSocketClient();
let pairedRoomCode: string | null = null;
let pairedAppTabId: number | null = null;
let pairedMachugiFrame: MachugiFrameTarget | null = null;
let latestRoomState: RoomState | null = null;
let unregisterBridgeHandlers: Array<() => void> = [];

const installScriptTargets = [
  {
    matches: ["https://machugi.io/*", "https://*.machugi.io/*"],
    files: ["contentScript.js"],
    allFrames: true
  },
  {
    matches: ["https://*.up.railway.app/*", "https://*.railway.app/*", "http://localhost/*", "http://127.0.0.1/*"],
    files: ["appBridge.js"],
    allFrames: false
  }
] satisfies Array<{ matches: string[]; files: string[]; allFrames: boolean }>;

function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  return typeof message === "object" && message !== null && "type" in message;
}

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

function isQuizState(value: unknown): value is QuizState {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as QuizState).choices) &&
    Array.isArray((value as QuizState).answerCandidates)
  );
}

function isSourceMirrorState(value: unknown): value is SourceMirrorState {
  return typeof value === "object" && value !== null && "kind" in value;
}

function isMachugiUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.hostname === "machugi.io" || parsed.hostname.endsWith(".machugi.io");
  } catch {
    return false;
  }
}

function targetFromSender(sender: chrome.runtime.MessageSender): MachugiFrameTarget | null {
  if (typeof sender.tab?.id !== "number" || typeof sender.frameId !== "number") return null;
  return {
    tabId: sender.tab.id,
    frameId: sender.frameId
  };
}

function isSameTarget(left: MachugiFrameTarget, right: MachugiFrameTarget): boolean {
  return left.tabId === right.tabId && left.frameId === right.frameId;
}

function hasActiveQuizEvidence(quiz: QuizState): boolean {
  return Boolean(
    quiz.questionIndex !== null ||
      quiz.questionText ||
      quiz.imageUrl ||
      quiz.audioUrl ||
      quiz.videoUrl ||
      quiz.choices.length > 0 ||
      quiz.resultMessage ||
      quiz.answerCandidates.length > 0
  );
}

function isOpenedByCurrentSource(sender: chrome.runtime.MessageSender): boolean {
  return Boolean(
    pairedMachugiFrame && typeof sender.tab?.openerTabId === "number" && sender.tab.openerTabId === pairedMachugiFrame.tabId
  );
}

function shouldBindReadySource(sender: chrome.runtime.MessageSender): boolean {
  const target = targetFromSender(sender);
  if (!target) return false;
  if (!pairedMachugiFrame) return sender.tab?.active === true;
  return isSameTarget(target, pairedMachugiFrame) || isOpenedByCurrentSource(sender);
}

function shouldAcceptQuizSource(sender: chrome.runtime.MessageSender, quiz: QuizState): boolean {
  const target = targetFromSender(sender);
  if (!target) return false;
  if (!pairedMachugiFrame) return sender.tab?.active === true || hasActiveQuizEvidence(quiz);
  if (isSameTarget(target, pairedMachugiFrame)) return true;
  return isOpenedByCurrentSource(sender) && hasActiveQuizEvidence(quiz);
}

function shouldAcceptOriginalEvent(sender: chrome.runtime.MessageSender): boolean {
  const target = targetFromSender(sender);
  if (!target) return false;
  return !pairedMachugiFrame || isSameTarget(target, pairedMachugiFrame);
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

function sourceWindowFromMetadata(message: RuntimeMessage, sender: chrome.runtime.MessageSender): SourceWindowState {
  const url = typeof message.href === "string" ? message.href : sender.url ?? sender.tab?.url ?? null;
  const title = typeof message.title === "string" ? message.title : sender.tab?.title ?? null;

  return {
    status: "connected",
    url,
    title,
    lastSeenAt: new Date().toISOString(),
    message: null
  };
}

function bindMachugiFrame(sender: chrome.runtime.MessageSender): boolean {
  const target = targetFromSender(sender);
  if (!target) return false;

  pairedMachugiFrame = target;
  return true;
}

async function forwardSourceWindow(sourceWindow: SourceWindowState): Promise<void> {
  if (!pairedRoomCode) return;

  try {
    await socketClient.sendSourceWindow({
      roomCode: pairedRoomCode,
      sourceWindow
    });
  } catch (error) {
    console.error("마추기아이오 원본 창 상태 전달에 실패했습니다.", error);
  }
}

async function forwardSourceMirror(sourceMirror: SourceMirrorState): Promise<void> {
  if (!pairedRoomCode) return;

  try {
    await socketClient.sendSourceMirror({
      roomCode: pairedRoomCode,
      sourceMirror
    });
  } catch (error) {
    console.error("원본 미러 상태 전달에 실패했습니다.", error);
  }
}

async function forwardSourceActionFailure(payload: SourceMirrorActionFailurePayload): Promise<void> {
  try {
    await socketClient.sendSourceActionFailure(payload);
  } catch (error) {
    console.error("원본 미러 동작 실패 전달에 실패했습니다.", error);
  }
}

async function announceSourceWindow(message: RuntimeMessage, sender: chrome.runtime.MessageSender): Promise<void> {
  await forwardSourceWindow(sourceWindowFromMetadata(message, sender));
}

async function forwardDisconnectedSourceWindow(message: string): Promise<void> {
  await forwardSourceWindow({
    status: "disconnected",
    url: null,
    title: null,
    lastSeenAt: new Date().toISOString(),
    message
  });
}

function rememberRoomState(state: RoomState | undefined): void {
  if (!state) return;
  if (pairedRoomCode && state.roomCode !== pairedRoomCode) return;
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
    socketClient.onSourceAction((payload) => {
      void sendSourceActionToPairedMachugiFrame(payload);
    }),
    socketClient.onOriginalSubmitAllowed((payload) => {
      void sendOriginalSubmitToPairedMachugiFrame(payload);
    }),
    socketClient.onRoomState((state) => {
      rememberRoomState(state);
    })
  ];
  void requestStateFromPairedMachugiFrame().catch((error) => {
    console.error("연결된 원본 창에서 문제 상태를 요청하지 못했습니다.", error);
  });
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

async function sendMessageToPairedMachugiFrame(message: unknown): Promise<boolean> {
  const target = pairedMachugiFrame;
  if (!target) return false;

  return await new Promise<boolean>((resolve, reject) => {
    chrome.tabs.sendMessage(target.tabId, message, { frameId: target.frameId }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(true);
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

function focusTab(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { active: true }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

async function sendSourceActionToPairedMachugiFrame(payload: SourceMirrorActionPayload): Promise<void> {
  if (payload.action.name === "focusOriginalTab") {
    const target = pairedMachugiFrame;
    if (!target) {
      await forwardSourceActionFailure({
        ...payload,
        reason: ORIGINAL_SOURCE_DISCONNECTED_MESSAGE
      });
      return;
    }

    await focusTab(target.tabId).catch((error) => {
      void forwardSourceActionFailure({
        ...payload,
        reason: error instanceof Error ? error.message : "원본 탭을 열 수 없습니다."
      });
    });
    return;
  }

  const delivered = await sendMessageToPairedMachugiFrame({
    type: CONTENT_SOURCE_ACTION_MESSAGE,
    payload
  }).catch((error) => {
    console.error("원본 창에 미러 동작을 전달하지 못했습니다.", error);
    return false;
  });

  if (delivered) return;

  await forwardSourceActionFailure({
    ...payload,
    reason: ORIGINAL_SOURCE_DISCONNECTED_MESSAGE
  });
}

async function sendFairPlayStateToPairedMachugiFrame(state: RoomState): Promise<void> {
  await sendMessageToPairedMachugiFrame({
    type: CONTENT_FAIR_PLAY_MESSAGE,
    payload: state
  });
}

async function sendOriginalSubmitToPairedMachugiFrame(payload: OriginalSubmitAllowedPayload): Promise<void> {
  const delivered = await sendMessageToPairedMachugiFrame({
    type: CONTENT_ORIGINAL_SUBMIT_MESSAGE,
    payload
  }).catch((error) => {
    console.error("원본 창에 자동 제출 명령을 전달하지 못했습니다.", error);
    return false;
  });

  if (delivered) return;

  pairedMachugiFrame = null;
  await forwardDisconnectedSourceWindow(ORIGINAL_SOURCE_DISCONNECTED_MESSAGE);
  await forwardOriginalFailure({
    roomCode: payload.roomCode,
    questionKey: payload.questionKey,
    reason: ORIGINAL_SOURCE_DISCONNECTED_MESSAGE
  });
}

async function requestStateFromPairedMachugiFrame(): Promise<boolean> {
  return await sendMessageToPairedMachugiFrame({
    type: CONTENT_REQUEST_STATE_MESSAGE
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

function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(tabs[0] ?? null);
    });
  });
}

async function useCurrentTabAsSource(): Promise<SourceResponse> {
  if (!pairedRoomCode) {
    return { ok: false, error: UNPAIRED_SOURCE_MESSAGE };
  }

  const tab = await queryActiveTab();
  if (typeof tab?.id !== "number" || !isMachugiUrl(tab.url)) {
    return { ok: false, error: NOT_MACHUGI_TAB_MESSAGE };
  }

  const previousTarget = pairedMachugiFrame;
  pairedMachugiFrame = {
    tabId: tab.id,
    frameId: 0
  };

  const contentScriptReady = await requestStateFromPairedMachugiFrame().catch((error) => {
    console.error("현재 원본 창에서 문제 상태를 요청하지 못했습니다.", error);
    return false;
  });

  if (!contentScriptReady) {
    pairedMachugiFrame = previousTarget;
    await forwardDisconnectedSourceWindow("현재 마추기아이오 탭에서 확장 프로그램 콘텐츠 스크립트를 찾지 못했습니다.");
    return { ok: false, error: "현재 마추기아이오 탭을 새로고침한 뒤 다시 시도해주세요." };
  }

  await forwardSourceWindow({
    status: "connected",
    url: tab.url ?? null,
    title: tab.title ?? null,
    lastSeenAt: new Date().toISOString(),
    message: null
  });

  if (latestRoomState) {
    void sendFairPlayStateToPairedMachugiFrame(latestRoomState);
  }

  return { ok: true };
}

function queryTabsByUrl(url: string[]): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(tabs);
    });
  });
}

function executeScriptInTab(details: chrome.scripting.ScriptInjection<unknown[], unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(details, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

async function injectContentScriptsIntoExistingTabs(): Promise<void> {
  await Promise.all(
    installScriptTargets.map(async ({ matches, files, allFrames }) => {
      const tabs = await queryTabsByUrl(matches).catch(() => []);
      await Promise.all(
        tabs.map(async (tab) => {
          if (typeof tab.id !== "number") return;

          await executeScriptInTab({
            target: { tabId: tab.id, allFrames },
            files
          }).catch((error) => {
            console.debug("Content script injection skipped.", error);
          });
        })
      );
    })
  );
}

chrome.runtime.onInstalled.addListener(() => {
  void injectContentScriptsIntoExistingTabs();
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isRuntimeMessage(message)) {
    const messageType = message.type;

    if (messageType === USE_CURRENT_TAB_AS_SOURCE_MESSAGE) {
      void useCurrentTabAsSource()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "원본 창 연결에 실패했습니다." }));
      return true;
    }

    if (messageType === CONTENT_FRAME_READY_MESSAGE) {
      const bound = shouldBindReadySource(sender) && bindMachugiFrame(sender);
      if (bound) {
        void announceSourceWindow(message, sender);
        if (latestRoomState) {
          void sendFairPlayStateToPairedMachugiFrame(latestRoomState);
        }
      }

      sendResponse({ ok: bound });
      return true;
    }

    if (messageType === CONTENT_STATE_MESSAGE) {
      if (!isQuizState(message.payload)) {
        sendResponse({ ok: false, error: "올바른 문제 상태가 아닙니다." });
        return true;
      }

      if (shouldAcceptQuizSource(sender, message.payload) && bindMachugiFrame(sender)) {
        void announceSourceWindow(message, sender);
        void forwardQuizState(message.payload);
        if (latestRoomState) {
          void sendFairPlayStateToPairedMachugiFrame(latestRoomState);
        }
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: UNBOUND_SOURCE_MESSAGE });
      }
      return true;
    }

    if (messageType === CONTENT_SOURCE_MIRROR_MESSAGE) {
      if (!isSourceMirrorState(message.payload)) {
        sendResponse({ ok: false, error: "올바른 원본 미러 상태가 아닙니다." });
        return true;
      }

      if (shouldAcceptOriginalEvent(sender) && bindMachugiFrame(sender)) {
        void announceSourceWindow(message, sender);
        void forwardSourceMirror(message.payload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: UNBOUND_SOURCE_MESSAGE });
      }
      return true;
    }

    if (messageType === CONTENT_SOURCE_ACTION_FAILURE_MESSAGE) {
      if (shouldAcceptOriginalEvent(sender)) {
        void forwardSourceActionFailure(message.payload as SourceMirrorActionFailurePayload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: UNBOUND_SOURCE_MESSAGE });
      }
      return true;
    }

    if (messageType === CONTENT_ORIGINAL_REQUEST_SUBMIT_MESSAGE) {
      if (shouldAcceptOriginalEvent(sender) && bindMachugiFrame(sender)) {
        void requestOriginalSubmit(message.payload as OriginalSubmitRequestPayload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: UNBOUND_SOURCE_MESSAGE });
      }
      return true;
    }

    if (messageType === CONTENT_ORIGINAL_RESULT_MESSAGE) {
      if (shouldAcceptOriginalEvent(sender) && bindMachugiFrame(sender)) {
        void forwardOriginalResult(message.payload as OriginalResultPayload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: UNBOUND_SOURCE_MESSAGE });
      }
      return true;
    }

    if (messageType === CONTENT_ORIGINAL_FAILURE_MESSAGE) {
      if (shouldAcceptOriginalEvent(sender) && bindMachugiFrame(sender)) {
        void forwardOriginalFailure(message.payload as OriginalFailurePayload);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: UNBOUND_SOURCE_MESSAGE });
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

chrome.tabs.onRemoved.addListener((tabId) => {
  if (pairedMachugiFrame?.tabId !== tabId) return;

  pairedMachugiFrame = null;
  void forwardDisconnectedSourceWindow(SOURCE_CLOSED_MESSAGE);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (pairedMachugiFrame?.tabId !== tabId || !("url" in changeInfo) || isMachugiUrl(changeInfo.url)) return;

  pairedMachugiFrame = null;
  void forwardDisconnectedSourceWindow("원본 창이 마추기아이오를 벗어났습니다.");
});
