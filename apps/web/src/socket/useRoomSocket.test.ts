import { describe, expect, it } from "vitest";
import { normalizeRoomCode, shouldReturnToLobbyOnState } from "./useRoomSocket";

describe("room socket helpers", () => {
  it("normalizes room codes before joining", () => {
    expect(normalizeRoomCode(" abc123 ")).toBe("ABC123");
  });

  it("returns to the lobby when the room is expired", () => {
    expect(shouldReturnToLobbyOnState({ phase: "expired" })).toBe(true);
    expect(shouldReturnToLobbyOnState({ phase: "playing" })).toBe(false);
  });
});
