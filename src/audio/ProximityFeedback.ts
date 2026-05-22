import { clamp } from "../simulation/math";

export class ProximityFeedback {
  private context: AudioContext | null = null;
  private timer: number | null = null;
  private running = false;
  private proximity = 0;

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.context = this.context ?? new AudioContext();
    await this.context.resume();
    this.running = true;
    this.schedule();
  }

  setProximity(value: number): void {
    this.proximity = clamp(value, 0, 100);
  }

  pulseNow(value = this.proximity): void {
    const proximity = clamp(value, 0, 100);

    if (proximity <= 3) {
      navigator.vibrate?.(0);
      return;
    }

    const pulse = Math.round(35 + proximity * 1.45);
    const pause = Math.round(clamp(180 - proximity * 1.2, 35, 180));
    navigator.vibrate?.([pulse, pause, pulse]);
  }

  stop(): void {
    this.running = false;

    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    navigator.vibrate?.(0);
  }

  private schedule(): void {
    if (!this.running) {
      return;
    }

    this.playBeep();
    const interval = 720 - this.proximity * 5.4;

    this.pulseNow();
    this.timer = window.setTimeout(() => this.schedule(), clamp(interval, 160, 900));
  }

  private playBeep(): void {
    if (!this.context || this.proximity <= 5) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520 + this.proximity * 4, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  }
}
