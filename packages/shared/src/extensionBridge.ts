export const APP_PAIRING_SETTINGS_MESSAGE = "gatchi:extension-pairing-settings";
export const APP_PAIRING_SETTINGS_ACK_MESSAGE = "gatchi:extension-pairing-settings:ack";
export const APP_EXTENSION_STATUS_MESSAGE = "gatchi:extension-status";

export interface AppPairingSettingsPayload {
  serverUrl: string;
  roomCode: string;
  hostCode: string;
}

export interface AppExtensionStatusPayload {
  status: "settings-saved" | "paired" | "machugi-frame-ready" | "machugi-frame-missing" | "error";
  roomCode?: string;
  message?: string;
}
