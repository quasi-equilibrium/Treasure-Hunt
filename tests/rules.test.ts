import { describe, expect, it } from "vitest";
import { MAX_KEYS, MIN_KEYS } from "../src/simulation/constants";
import { createInitialRoom, formatClock, generateRoomCode, isValidKeyCount } from "../src/simulation/rules";

describe("game rules", () => {
  it("validates key count boundaries", () => {
    expect(isValidKeyCount(MIN_KEYS)).toBe(true);
    expect(isValidKeyCount(MAX_KEYS)).toBe(true);
    expect(isValidKeyCount(0)).toBe(false);
    expect(isValidKeyCount(6)).toBe(false);
  });

  it("generates six-character room codes", () => {
    expect(generateRoomCode()).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("creates a lobby room with hider and seeker not ready", () => {
    const room = createInitialRoom("ABC123", 3);

    expect(room.phase).toBe("lobby");
    expect(room.keyCount).toBe(3);
    expect(room.hiderReady).toBe(false);
    expect(room.seekerReady).toBe(false);
  });

  it("formats countdown clocks", () => {
    expect(formatClock(180_000)).toBe("3:00");
    expect(formatClock(61_000)).toBe("1:01");
    expect(formatClock(900)).toBe("0:01");
  });
});
