import { normalizeDegrees } from "../simulation/math";
import type { Vector3 } from "../simulation/types";

export interface CompassState {
  heading: number;
  pitch: number;
  supported: boolean;
}

type CompassListener = (state: CompassState) => void;

export class DeviceSensors {
  private readonly listeners = new Set<CompassListener>();
  private cameraStream: MediaStream | null = null;
  private heading = 0;
  private pitch = 0;
  private listening = false;

  async requestCamera(): Promise<MediaStream> {
    if (this.cameraStream) {
      return this.cameraStream;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Bu tarayıcı kamera erişimini desteklemiyor.");
    }

    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    return this.cameraStream;
  }

  async requestOrientation(): Promise<void> {
    const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };

    if (typeof orientationEvent?.requestPermission === "function") {
      const permission = await orientationEvent.requestPermission();

      if (permission !== "granted") {
        throw new Error("Pusula izni verilmedi.");
      }
    }

    if (!this.listening) {
      window.addEventListener("deviceorientation", this.handleOrientation, true);
      this.listening = true;
    }
  }

  onCompass(listener: CompassListener): () => void {
    this.listeners.add(listener);
    listener(this.getCompass());

    return () => {
      this.listeners.delete(listener);
    };
  }

  getCompass(): CompassState {
    return {
      heading: this.heading,
      pitch: this.pitch,
      supported: this.listening
    };
  }

  stop(): void {
    window.removeEventListener("deviceorientation", this.handleOrientation, true);
    this.listening = false;
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
  }

  private readonly handleOrientation = (event: DeviceOrientationEvent): void => {
    const webkitHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const alpha = event.alpha ?? 0;

    this.heading = normalizeDegrees(typeof webkitHeading === "number" ? webkitHeading : 360 - alpha);
    this.pitch = event.beta ?? 0;

    const state = this.getCompass();
    this.listeners.forEach((listener) => listener(state));
  };
}

export class DeadReckoningTracker {
  private position: Vector3 = { x: 0, y: 0, z: 0 };
  private lastStepAt = 0;
  private heading = 0;
  private lastImpulse = 0;

  async requestMotionPermission(): Promise<void> {
    const motionEvent = DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };

    if (typeof motionEvent?.requestPermission === "function") {
      const permission = await motionEvent.requestPermission();

      if (permission !== "granted") {
        return;
      }
    }

    window.addEventListener("devicemotion", this.handleMotion, true);
  }

  setHeading(heading: number): void {
    this.heading = heading;
  }

  getPosition(): Vector3 {
    return this.position;
  }

  reset(position: Vector3 = { x: 0, y: 0, z: 0 }): void {
    this.position = position;
    this.lastStepAt = 0;
  }

  stop(): void {
    window.removeEventListener("devicemotion", this.handleMotion, true);
  }

  private readonly handleMotion = (event: DeviceMotionEvent): void => {
    const acceleration = event.acceleration;
    const gravityAcceleration = event.accelerationIncludingGravity;

    if (!acceleration && !gravityAcceleration) {
      return;
    }

    const linearMagnitude = acceleration
      ? Math.sqrt(Math.pow(acceleration.x ?? 0, 2) + Math.pow(acceleration.y ?? 0, 2) + Math.pow(acceleration.z ?? 0, 2))
      : 0;
    const gravityMagnitude = gravityAcceleration
      ? Math.sqrt(
          Math.pow(gravityAcceleration.x ?? 0, 2) +
            Math.pow(gravityAcceleration.y ?? 0, 2) +
            Math.pow(gravityAcceleration.z ?? 0, 2)
        )
      : 9.81;
    const impulse = Math.max(linearMagnitude, Math.abs(gravityMagnitude - 9.81));
    const now = performance.now();

    if (impulse < 1.25 || impulse <= this.lastImpulse || now - this.lastStepAt < 430) {
      this.lastImpulse = impulse;
      return;
    }

    const radians = (this.heading * Math.PI) / 180;
    this.position = {
      x: this.position.x + Math.sin(radians) * 0.42,
      y: 0,
      z: this.position.z + Math.cos(radians) * 0.42
    };
    this.lastStepAt = now;
    this.lastImpulse = impulse;
  };
}
