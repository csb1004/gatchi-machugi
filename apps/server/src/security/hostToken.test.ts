import { describe, expect, it } from "vitest";
import { createHostToken, hashHostToken, verifyHostToken } from "./hostToken.js";

describe("host token security", () => {
  it("creates a one-time plaintext token and stores only a hash", async () => {
    const token = createHostToken();
    const hash = await hashHostToken(token, "pepper");

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hash).not.toContain(token);
    await expect(verifyHostToken(token, hash, "pepper")).resolves.toBe(true);
    await expect(verifyHostToken("wrong", hash, "pepper")).resolves.toBe(false);
  });
});
