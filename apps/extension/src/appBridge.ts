const APP_PAIRING_SETTINGS_MESSAGE = "gatchi:extension-pairing-settings";
const APP_PAIRING_SETTINGS_ACK_MESSAGE = "gatchi:extension-pairing-settings:ack";

interface AppPairingSettingsPayload {
  serverUrl: string;
  roomCode: string;
  hostCode: string;
}

const appWindow = window as Window & { __gatchiAppBridgeInstalled?: boolean };

function isPairingSettingsMessage(message: unknown): message is { type: typeof APP_PAIRING_SETTINGS_MESSAGE; payload: AppPairingSettingsPayload } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: unknown }).type === APP_PAIRING_SETTINGS_MESSAGE &&
    "payload" in message
  );
}

if (!appWindow.__gatchiAppBridgeInstalled) {
  appWindow.__gatchiAppBridgeInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin || !isPairingSettingsMessage(event.data)) {
      return;
    }

    chrome.runtime.sendMessage(event.data, (response: { ok: boolean; error?: string } | undefined) => {
      const error = chrome.runtime.lastError?.message ?? response?.error;
      window.postMessage(
        {
          type: APP_PAIRING_SETTINGS_ACK_MESSAGE,
          ok: !error && response?.ok === true,
          error
        },
        event.origin
      );
    });
  });
}
