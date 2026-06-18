import { describe, expect, it } from "vitest";
import { RoomService } from "./roomService.js";

describe("RoomService", () => {
  it("creates a room with a public room code and one-time host token", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const created = await service.createRoom({ title: "Friday quiz", visibility: "public" });

    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.hostToken.length).toBeGreaterThanOrEqual(32);
    expect(created.state.settings.title).toBe("Friday quiz");
    expect(created.state.settings.visibility).toBe("public");
  });

  it("adds numeric suffixes for duplicate nicknames", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode } = await service.createRoom({ title: "Room", visibility: "private" });

    const first = service.joinParticipant({ roomCode, nickname: "Mina" });
    const second = service.joinParticipant({ roomCode, nickname: "Mina" });

    expect(first.participant.nickname).toBe("Mina");
    expect(second.participant.nickname).toBe("Mina#2");
  });

  it("verifies host token before granting host access", async () => {
    const service = new RoomService({ hostTokenPepper: "pepper" });
    const { roomCode, hostToken } = await service.createRoom({ title: "Room", visibility: "private" });

    await expect(service.verifyHost({ roomCode, hostToken })).resolves.toBe(true);
    await expect(service.verifyHost({ roomCode, hostToken: "wrong" })).resolves.toBe(false);
  });
});
