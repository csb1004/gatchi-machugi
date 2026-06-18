import { describe, expect, it } from "vitest";
import { scoreSubmissions } from "./scoring.js";

describe("scoreSubmissions", () => {
  it("treats whitespace-insensitive answers as equal", () => {
    const result = scoreSubmissions({
      answerCandidates: ["blue archive"],
      aliases: [],
      submissions: [
        { participantId: "p1", rawAnswer: "bluearchive", skipped: false },
        { participantId: "p2", rawAnswer: "blue  archive", skipped: false }
      ]
    });

    expect(result.correctParticipantIds).toEqual(["p1", "p2"]);
  });

  it("re-scores with host aliases", () => {
    const result = scoreSubmissions({
      answerCandidates: ["answer"],
      aliases: ["accepted alias"],
      submissions: [
        { participantId: "p1", rawAnswer: "acceptedalias", skipped: false },
        { participantId: "p2", rawAnswer: "wrong", skipped: false }
      ]
    });

    expect(result.correctParticipantIds).toEqual(["p1"]);
    expect(result.incorrectParticipantIds).toEqual(["p2"]);
  });

  it("does not score skipped submissions", () => {
    const result = scoreSubmissions({
      answerCandidates: ["answer"],
      aliases: [],
      submissions: [{ participantId: "p1", rawAnswer: "", skipped: true }]
    });

    expect(result.correctParticipantIds).toEqual([]);
    expect(result.incorrectParticipantIds).toEqual([]);
    expect(result.skippedParticipantIds).toEqual(["p1"]);
  });
});
