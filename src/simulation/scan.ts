import { SCAN_REQUIRED_PROGRESS } from "./constants";
import { clamp, signedAngleDelta } from "./math";
import type { ScanSample } from "./types";

export interface ScanProgress {
  progress: number;
  coverage: number;
  motionScore: number;
  elapsedMs: number;
  sampleCount: number;
  canComplete: boolean;
  status: string;
}

export class ScanEstimator {
  private readonly samples: ScanSample[] = [];
  private startedAt = performance.now();

  reset(startedAt = performance.now()): void {
    this.samples.length = 0;
    this.startedAt = startedAt;
  }

  forceComplete(now = performance.now()): void {
    this.reset(now - 22_000);

    for (let i = 0; i < 18; i += 1) {
      this.addSample({
        heading: (i * 23) % 360,
        pitch: -28 + (i % 7) * 10,
        timestamp: this.startedAt + i * 1250
      });
    }
  }

  addSample(sample: ScanSample): ScanProgress {
    if (!Number.isFinite(sample.heading) || !Number.isFinite(sample.pitch)) {
      return this.getProgress();
    }

    this.samples.push(sample);

    if (this.samples.length > 160) {
      this.samples.shift();
    }

    return this.getProgress();
  }

  getProgress(): ScanProgress {
    const newestSampleAt = this.samples.at(-1)?.timestamp ?? performance.now();
    const elapsedMs = Math.max(performance.now(), newestSampleAt) - this.startedAt;
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
      headings.add(Math.floor(sample.heading / 24));
    }

    const coverage = clamp((headings.size / 12) * 100, 0, 100);
    const timeScore = clamp((elapsedMs / 18_000) * 100, 0, 100);
    const movementScore = clamp((motionScore / 240) * 100, 0, 100);
    const weightedProgress = Math.floor(coverage * 0.48 + movementScore * 0.34 + timeScore * 0.18);
    const criticalCap = Math.floor(Math.min(coverage * 1.12, movementScore * 1.16, timeScore * 1.08, 100));
    const sampleCount = this.samples.length;
    const canComplete = sampleCount >= 12 && elapsedMs >= 18_000 && coverage >= 72 && movementScore >= 68;
    const progress = canComplete ? 100 : Math.min(weightedProgress, criticalCap, 98);
    const status = getScanStatus({ sampleCount, elapsedMs, coverage, movementScore, canComplete });

    return {
      progress: clamp(progress, 0, SCAN_REQUIRED_PROGRESS),
      coverage,
      motionScore: movementScore,
      elapsedMs,
      sampleCount,
      canComplete,
      status
    };
  }

  isComplete(): boolean {
    return this.getProgress().canComplete;
  }
}

function getScanStatus(progress: {
  sampleCount: number;
  elapsedMs: number;
  coverage: number;
  movementScore: number;
  canComplete: boolean;
}): string {
  if (progress.canComplete) {
    return "Tarama yeterli. Tamamlandı diyebilirsin.";
  }

  if (progress.sampleCount < 4) {
    return "Telefonu yavaşça kaldır ve odaya doğru çevir.";
  }

  if (progress.elapsedMs < 18_000) {
    return "Biraz daha devam et; hızlıca dolmaz.";
  }

  if (progress.coverage < 72) {
    return "Daha fazla yöne dön; oda çevresini kapsa.";
  }

  if (progress.movementScore < 68) {
    return "Telefonu farklı açılarla hareket ettir.";
  }

  return "Tarama ölçümü devam ediyor.";
}
