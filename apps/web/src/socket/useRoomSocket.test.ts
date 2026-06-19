import { describe, expect, it } from "vitest";
import { normalizeRoomCode } from "./useRoomSocket";

describe("room socket helpers", () => {
  it("normalizes room codes before joining", () => {
    expect(normalizeRoomCode(" abc123 ")).toBe("ABC123");
  });
});
