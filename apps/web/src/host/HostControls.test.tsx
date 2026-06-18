import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExtensionSetup } from "./ExtensionSetup";
import { HostControls } from "./HostControls";

describe("HostControls", () => {
  it("disables quiz commands until the extension is connected", () => {
    render(<HostControls extensionConnected={false} onCommand={() => undefined} />);

    expect(screen.getByRole("button", { name: /Search/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });

  it("shows GitHub release and load unpacked instructions", () => {
    render(<ExtensionSetup releaseUrl="https://github.com/OWNER/REPO/releases" />);

    expect(screen.getByText("Download the extension zip from GitHub Releases.")).toBeInTheDocument();
    expect(screen.getByText("Open chrome://extensions and enable Developer Mode.")).toBeInTheDocument();
    expect(screen.getByText("Click Load unpacked and choose the extracted folder.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub Releases/ })).toHaveAttribute("href", "https://github.com/OWNER/REPO/releases");
  });
});
