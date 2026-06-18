import { describe, expect, it } from "vitest";
import { buildPairPayload } from "./socketClient.js";

describe("buildPairPayload", () => {
  it("trims and uppercases the room code while preserving the host token", () => {
    expect(
      buildPairPayload({
        roomCode: "  ab12cd  ",
        hostToken: "  secret-token  "
      })
    ).toEqual({
      roomCode: "AB12CD",
      hostToken: "  secret-token  "
    });
  });
});
