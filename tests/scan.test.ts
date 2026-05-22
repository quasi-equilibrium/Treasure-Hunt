import { describe, expect, it } from "vitest";
import { ScanEstimator } from "../src/simulation/scan";

describe("ScanEstimator", () => {
  it("does not complete from a few instant samples", () => {
    const scan = new ScanEstimator();
    scan.reset(1_000);

    for (let i = 0; i < 3; i += 1) {
      scan.addSample({ heading: i * 20, pitch: i * 5, timestamp: 1_000 + i * 300 });
    }

    const progress = scan.getProgress();

    expect(progress.canComplete).toBe(false);
    expect(progress.progress).toBeLessThan(100);
  });

  it("requires duration, coverage, and motion before completion", () => {
    const scan = new ScanEstimator();
    scan.forceComplete(25_000);

    const progress = scan.getProgress();

    expect(progress.canComplete).toBe(true);
    expect(progress.progress).toBe(100);
  });
});
