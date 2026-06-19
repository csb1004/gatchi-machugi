import { describe, expect, it } from "vitest";
import { normalizePairingSettingsForStorage } from "./pairingSettings.js";

describe("normalizePairingSettingsForStorage", () => {
  it("keeps the host code so the popup can connect without asking the host to type it", () => {
    expect(
      normalizePairingSettingsForStorage({
        serverUrl: " https://gatchi-machugi.up.railway.app/ ",
        roomCode: " ab12cd ",
        hostCode: " c04h "
      })
    ).toEqual({
      serverUrl: "https://gatchi-machugi.up.railway.app",
      roomCode: "AB12CD",
      hostCode: "#C04H"
    });
  });
});
