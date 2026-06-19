export const APP_PAIRING_SETTINGS_MESSAGE = "gatchi:extension-pairing-settings";
export const APP_PAIRING_SETTINGS_ACK_MESSAGE = "gatchi:extension-pairing-settings:ack";

export interface AppPairingSettingsPayload {
  serverUrl: string;
  roomCode: string;
  hostCode: string;
}
