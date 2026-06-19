import { describe, expect, it } from "vitest";
import { buildPairPayload, normalizeServerUrl } from "./socketClient.js";

describe("buildPairPayload", () => {
  it("trims and uppercases the room code and host code", () => {
    expect(
      buildPairPayload({
        roomCode: "  ab12cd  ",
        hostCode: "  #c04h  "
      })
    ).toEqual({
      roomCode: "AB12CD",
      hostCode: "#C04H"
    });
  });
});

describe("normalizeServerUrl", () => {
  it("rejects the original machugi.io quiz site as the app server", () => {
    expect(() => normalizeServerUrl("https://machugi.io/")).toThrow("가치 마추기 서버 URL");
  });

  it("normalizes the app server URL", () => {
    expect(normalizeServerUrl(" https://gatchi-machugi.up.railway.app/ ")).toBe("https://gatchi-machugi.up.railway.app");
  });
});
