import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Scoreboard } from "./Scoreboard";

describe("Scoreboard", () => {
  it("shows only connected participants", () => {
    render(
      <Scoreboard
        participants={[
          { id: "host", nickname: "Host", role: "host", connected: true, score: 2 },
          { id: "p1", nickname: "Mina", role: "player", connected: false, score: 5 }
        ]}
      />
    );

    expect(screen.getByText("Host")).toBeInTheDocument();
    expect(screen.queryByText("Mina")).not.toBeInTheDocument();
  });
});
