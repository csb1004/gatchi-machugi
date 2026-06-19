import type { PairingSettings, StoredPairingSettings } from "./socketClient.js";
import { buildPairPayload, normalizeServerUrl } from "./socketClient.js";

export function normalizePairingSettingsForStorage(settings: PairingSettings): StoredPairingSettings {
  const pairPayload = buildPairPayload(settings);

  return {
    serverUrl: normalizeServerUrl(settings.serverUrl),
    roomCode: pairPayload.roomCode,
    hostCode: pairPayload.hostCode
  };
}
