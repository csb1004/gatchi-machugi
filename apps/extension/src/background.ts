import type { PairHostRequestMessage, PairHostResponse, PairingSettings, StoredPairingSettings } from "./socketClient.js";
import {
  MachugiSocketClient,
  PAIRING_REQUEST_TYPE,
  PAIRING_STORAGE_KEY,
  buildPairPayload,
  normalizeServerUrl
} from "./socketClient.js";

const socketClient = new MachugiSocketClient();

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
    roomCode: pairPayload.roomCode,
    hostToken: pairPayload.hostToken
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

async function readPairingSettings(): Promise<StoredPairingSettings | null> {
  return await new Promise((resolve, reject) => {
    chrome.storage.local.get(PAIRING_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve((result[PAIRING_STORAGE_KEY] as StoredPairingSettings | undefined) ?? null);
    });
  });
}

async function pairHost(payload: PairingSettings): Promise<PairHostResponse> {
  const settings = toStoredPairingSettings(payload);

  try {
    const pairResult = await socketClient.connectAndPair(settings);
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
      error: error instanceof Error ? error.message : "Failed to pair host extension"
    };
  }
}

async function reconnectSavedPairing() {
  try {
    const savedSettings = await readPairingSettings();
    if (!savedSettings) return;

    await socketClient.connectAndPair(savedSettings);
  } catch (error) {
    console.error("Failed to restore saved pairing", error);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isPairHostRequestMessage(message)) {
    return false;
  }

  void pairHost(message.payload).then(sendResponse);
  return true;
});

chrome.runtime.onStartup.addListener(() => {
  void reconnectSavedPairing();
});

chrome.runtime.onInstalled.addListener(() => {
  void reconnectSavedPairing();
});
