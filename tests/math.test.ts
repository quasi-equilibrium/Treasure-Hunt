import { describe, expect, it } from "vitest";
import { bearingTo, horizontalDistance, proximityPercent, signedAngleDelta } from "../src/simulation/math";

describe("navigation math", () => {
  it("computes horizontal distance", () => {
    expect(horizontalDistance({ x: 0, y: 4, z: 0 }, { x: 3, y: 0, z: 4 })).toBe(5);
  });

  it("computes bearing in local room coordinates", () => {
    expect(bearingTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBe(0);
    expect(bearingTo({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(90);
  });

  it("normalizes signed angle deltas", () => {
    expect(signedAngleDelta(350, 10)).toBe(20);
    expect(signedAngleDelta(10, 350)).toBe(-20);
  });

  it("turns distance into proximity percentage", () => {
    expect(proximityPercent(0.45)).toBe(100);
    expect(proximityPercent(8)).toBe(0);
  });
});
