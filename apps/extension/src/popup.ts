import type { PairHostResponse, PairingSettings, StoredPairingSettings } from "./socketClient.js";
import { PAIRING_REQUEST_TYPE, PAIRING_STORAGE_KEY } from "./socketClient.js";

type PairFormElements = {
  form: HTMLFormElement;
  serverUrl: HTMLInputElement;
  roomCode: HTMLInputElement;
  hostCode: HTMLInputElement;
  submitButton: HTMLButtonElement;
  status: HTMLOutputElement;
};

async function readStoredPairing(): Promise<StoredPairingSettings | null> {
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

async function sendPairRequest(payload: PairingSettings): Promise<PairHostResponse> {
  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: PAIRING_REQUEST_TYPE, payload }, (response: PairHostResponse | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response) {
        reject(new Error("백그라운드 서비스 워커가 응답하지 않았습니다."));
        return;
      }

      resolve(response);
    });
  });
}

function getElements(): PairFormElements {
  return {
    form: document.querySelector("#pair-form") as HTMLFormElement,
    serverUrl: document.querySelector("#server-url") as HTMLInputElement,
    roomCode: document.querySelector("#room-code") as HTMLInputElement,
    hostCode: document.querySelector("#host-code") as HTMLInputElement,
    submitButton: document.querySelector("#pair-button") as HTMLButtonElement,
    status: document.querySelector("#status") as HTMLOutputElement
  };
}

function setStatus(elements: PairFormElements, message: string, state: "idle" | "error" | "success" = "idle") {
  elements.status.textContent = message;
  elements.status.dataset.state = state;
}

function localizeError(message: string) {
  const translations: Record<string, string> = {
    "Invalid host code": "방장 코드가 올바르지 않습니다.",
    "Invalid host pair payload": "방장 연결 정보가 올바르지 않습니다.",
    "Failed to pair host": "방장 연결에 실패했습니다.",
    "Room not found": "방을 찾을 수 없습니다.",
    "Host authorization required": "방장 권한이 필요합니다."
  };

  return translations[message] ?? message;
}

function fillForm(elements: PairFormElements, stored: StoredPairingSettings | null) {
  if (!stored) return;

  elements.serverUrl.value = stored.serverUrl;
  elements.roomCode.value = stored.roomCode;
}

async function handleSubmit(elements: PairFormElements) {
  const payload: PairingSettings = {
    serverUrl: elements.serverUrl.value,
    roomCode: elements.roomCode.value,
    hostCode: elements.hostCode.value
  };

  elements.submitButton.disabled = true;
  setStatus(elements, "방장 권한으로 연결하는 중...");

  try {
    const response = await sendPairRequest(payload);
    if (!response.ok) {
      setStatus(elements, localizeError(response.error), "error");
      return;
    }

    elements.roomCode.value = response.data.roomCode;
    setStatus(elements, `${response.data.roomCode} 방에 연결되었습니다.`, "success");
  } catch (error) {
    setStatus(elements, localizeError(error instanceof Error ? error.message : "연결에 실패했습니다."), "error");
  } finally {
    elements.submitButton.disabled = false;
  }
}

async function init() {
  const elements = getElements();
  fillForm(elements, await readStoredPairing());

  elements.roomCode.addEventListener("input", () => {
    elements.roomCode.value = elements.roomCode.value.toUpperCase();
  });
  elements.hostCode.addEventListener("input", () => {
    elements.hostCode.value = elements.hostCode.value.toUpperCase();
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSubmit(elements);
  });
}

void init();
