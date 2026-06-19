import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows public rooms, room code entry, and nickname gate", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Gatchi Machugi" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Create room" })).toBeInTheDocument();
    expect(screen.getByLabelText("Room name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create room" })).toBeDisabled();
    expect(screen.getByLabelText("Nickname")).toBeInTheDocument();
    expect(screen.getByLabelText("Room code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join room" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "Public rooms" })).toBeInTheDocument();
  });
});
