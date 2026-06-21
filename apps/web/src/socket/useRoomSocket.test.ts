import { describe, expect, it } from "vitest";
import { roomCodeFromPath, roomPath, shouldReturnToLobbyOnState } from "./useRoomSocket";

describe("room socket helpers", () => {
  it("normalizes room codes before joining", () => {
    expect(roomCodeFromPath("/rooms/abc123")).toBe("ABC123");
    expect(roomCodeFromPath("/")).toBe(null);
  });

  it("ignores malformed encoded room URL segments", () => {
    expect(roomCodeFromPath("/rooms/%")).toBe(null);
  });

  it("builds stable room URLs from room codes", () => {
    expect(roomPath(" abc123 ")).toBe("/rooms/ABC123");
  });

  it("returns to the lobby when the room is expired", () => {
    expect(shouldReturnToLobbyOnState({ phase: "expired" })).toBe(true);
    expect(shouldReturnToLobbyOnState({ phase: "playing" })).toBe(false);
  });
});
