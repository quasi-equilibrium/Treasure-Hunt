import type { Vector3 } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function signedAngleDelta(from: number, to: number): number {
  const delta = normalizeDegrees(to) - normalizeDegrees(from);
  return ((delta + 540) % 360) - 180;
}

export function distance3d(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function horizontalDistance(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function bearingTo(from: Vector3, to: Vector3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return normalizeDegrees((Math.atan2(dx, dz) * 180) / Math.PI);
}

export function proximityPercent(distanceMeters: number, farMeters = 8, nearMeters = 0.45): number {
  const normalized = 1 - (distanceMeters - nearMeters) / (farMeters - nearMeters);
  return Math.round(clamp(normalized, 0, 1) * 100);
}

export function relativeDirectionLabel(deltaDegrees: number): string {
  const delta = signedAngleDelta(0, deltaDegrees);

  if (Math.abs(delta) <= 18) {
    return "Düz ilerle";
  }

  if (Math.abs(delta) >= 155) {
    return "Arkanda";
  }

  return delta > 0 ? "Sağa dön" : "Sola dön";
}
