import type { PairHostResponse, PairingSettings, StoredPairingSettings } from "./socketClient.js";
import { PAIRING_REQUEST_TYPE, PAIRING_STORAGE_KEY } from "./socketClient.js";

type PairFormElements = {
  form: HTMLFormElement;
  serverUrl: HTMLInputElement;
  roomCode: HTMLInputElement;
  hostToken: HTMLInputElement;
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
        reject(new Error("No response from background service worker"));
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
    hostToken: document.querySelector("#host-token") as HTMLInputElement,
    submitButton: document.querySelector("#pair-button") as HTMLButtonElement,
    status: document.querySelector("#status") as HTMLOutputElement
  };
}

function setStatus(elements: PairFormElements, message: string, state: "idle" | "error" | "success" = "idle") {
  elements.status.textContent = message;
  elements.status.dataset.state = state;
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
    hostToken: elements.hostToken.value
  };

  elements.submitButton.disabled = true;
  setStatus(elements, "Pairing with host room...");

  try {
    const response = await sendPairRequest(payload);
    if (!response.ok) {
      setStatus(elements, response.error, "error");
      return;
    }

    elements.roomCode.value = response.data.roomCode;
    setStatus(elements, `Paired room ${response.data.roomCode}.`, "success");
  } catch (error) {
    setStatus(elements, error instanceof Error ? error.message : "Pairing failed", "error");
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

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSubmit(elements);
  });
}

void init();
