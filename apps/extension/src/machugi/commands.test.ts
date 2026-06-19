import { describe, expect, it, vi } from "vitest";
import { runMachugiCommand } from "./commands";

describe("runMachugiCommand", () => {
  it("starts a machugi quiz by clicking the first solve-count button", () => {
    document.body.innerHTML = `
      <button class="Button_button__AA3bX">10개 풀기</button>
      <button class="Button_button__AA3bX">20개 풀기</button>
    `;
    const firstButton = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(firstButton, "click");

    expect(runMachugiCommand("start", document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("advances a machugi playing screen by clicking the icon-only next button", () => {
    document.body.innerHTML = `
      <button class="ant-btn CommonButton_root__6p8FJ NextButton_root__MHkxh">
        <img src="https://assets.machugi.io/public/icon/ic_arrow_white.png" alt="undefined 버튼 아이콘">
      </button>
    `;
    const button = document.querySelector("button") as HTMLButtonElement;
    const click = vi.spyOn(button, "click");

    expect(runMachugiCommand("next", document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("focuses the search box when configuring from the main page", () => {
    document.body.innerHTML = `<input aria-label="검색창" type="search">`;
    const input = document.querySelector("input") as HTMLInputElement;
    const focus = vi.spyOn(input, "focus");

    expect(runMachugiCommand("configure", document)).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
