import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const popupHtml = readFileSync(join(process.cwd(), "src", "popup.html"), "utf8");

describe("popup markup", () => {
  it("does not ask hosts to type the host code manually", () => {
    expect(popupHtml).not.toContain('id="host-code"');
    expect(popupHtml).not.toContain('name="hostCode"');
    expect(popupHtml).toContain("방장 화면에서 자동 저장된 연결 정보");
  });
});
