import { HIDING_SECONDS, MAX_KEYS, MIN_KEYS, ROOM_CODE_LENGTH, SEEKING_SECONDS } from "./constants";
import type { GamePhase, PlayerRole, RoomPatch, RoomState, TreasureKey } from "./types";

export function isValidKeyCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_KEYS && count <= MAX_KEYS;
}

export function generateRoomCode(): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);

  return (100 + (value[0] % 900)).toString().padStart(ROOM_CODE_LENGTH, "0");
}

export function createInitialRoom(code: string, keyCount: number): RoomState {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    code,
    phase: "lobby",
    keyCount,
    hiderReady: false,
    seekerReady: false,
    activeKeyIndex: 1,
    keys: [],
    winner: null,
    countdownStartsAt: null,
    hideEndsAt: null,
    seekEndsAt: null,
    treasurePosition: null,
    calibration: null,
    createdAt: now,
    updatedAt: now
  };
}

export function readyPatch(role: PlayerRole, ready: boolean): RoomPatch {
  return role === "hider" ? { hiderReady: ready } : { seekerReady: ready };
}

export function bothPlayersReady(room: RoomState): boolean {
  return room.hiderReady && room.seekerReady;
}

export function getPhaseAfterReady(room: RoomState): GamePhase {
  return bothPlayersReady(room) ? "safety" : "lobby";
}

export function buildHidingPatch(now = new Date()): RoomPatch {
  return {
    phase: "hiding",
    hideEndsAt: new Date(now.getTime() + HIDING_SECONDS * 1000).toISOString()
  };
}

export function buildSeekingPatch(now = new Date()): RoomPatch {
  return {
    phase: "seeking",
    activeKeyIndex: 1,
    seekEndsAt: new Date(now.getTime() + SEEKING_SECONDS * 1000).toISOString()
  };
}

export function getActiveKey(room: RoomState): TreasureKey | null {
  return room.keys.find((key) => key.index === room.activeKeyIndex && !key.found) ?? null;
}

export function getNextUnfoundKeyIndex(room: RoomState): number | null {
  const next = [...room.keys]
    .sort((a, b) => a.index - b.index)
    .find((key) => key.index > room.activeKeyIndex && !key.found);

  return next?.index ?? null;
}

export function isHidingComplete(room: RoomState): boolean {
  return room.keys.length >= room.keyCount && Boolean(room.treasurePosition);
}

export function getRemainingMs(endIso: string | null, now = Date.now()): number {
  if (!endIso) {
    return 0;
  }

  return Math.max(new Date(endIso).getTime() - now, 0);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
