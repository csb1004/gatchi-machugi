import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExtensionSetup } from "./ExtensionSetup";
import { HostControls } from "./HostControls";

describe("HostControls", () => {
  it("disables quiz commands until the extension is connected", () => {
    render(<HostControls extensionConnected={false} onCommand={() => undefined} />);

    expect(screen.getByRole("button", { name: /검색 화면/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /다음/ })).toBeDisabled();
    expect(screen.getByText("확장 연결 대기")).toBeInTheDocument();
  });

  it("shows GitHub release and load unpacked instructions", () => {
    render(<ExtensionSetup releaseUrl="https://github.com/OWNER/REPO/releases" />);

    expect(screen.getByText("GitHub Releases에서 확장 프로그램 zip을 내려받습니다.")).toBeInTheDocument();
    expect(screen.getByText("chrome://extensions를 열고 개발자 모드를 켭니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub Releases/ })).toHaveAttribute("href", "https://github.com/OWNER/REPO/releases");
  });
});
