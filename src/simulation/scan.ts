import { SCAN_REQUIRED_PROGRESS } from "./constants";
import { clamp, signedAngleDelta } from "./math";
import type { ScanSample } from "./types";

export interface ScanProgress {
  progress: number;
  coverage: number;
  motionScore: number;
  elapsedMs: number;
}

export class ScanEstimator {
  private readonly samples: ScanSample[] = [];
  private readonly startedAt = performance.now();

  addSample(sample: ScanSample): ScanProgress {
    this.samples.push(sample);

    if (this.samples.length > 160) {
      this.samples.shift();
    }

    return this.getProgress();
  }

  getProgress(): ScanProgress {
    const elapsedMs = performance.now() - this.startedAt;
    const headings = new Set<number>();
    let motionScore = 0;

    for (let i = 1; i < this.samples.length; i += 1) {
      const previous = this.samples[i - 1];
      const current = this.samples[i];
      const headingDelta = Math.abs(signedAngleDelta(previous.heading, current.heading));
      const pitchDelta = Math.abs(current.pitch - previous.pitch);
      motionScore += clamp(headingDelta + pitchDelta * 0.5, 0, 20);
    }

    for (const sample of this.samples) {
      headings.add(Math.floor(sample.heading / 30));
    }

    const coverage = clamp((headings.size / 12) * 100, 0, 100);
    const timeScore = clamp((elapsedMs / 18_000) * 100, 0, 100);
    const movementScore = clamp((motionScore / 180) * 100, 0, 100);
    const progress = Math.floor(coverage * 0.45 + movementScore * 0.35 + timeScore * 0.2);

    return {
      progress: clamp(progress, 0, SCAN_REQUIRED_PROGRESS),
      coverage,
      motionScore: movementScore,
      elapsedMs
    };
  }

  isComplete(): boolean {
    return this.getProgress().progress >= SCAN_REQUIRED_PROGRESS;
  }
}
