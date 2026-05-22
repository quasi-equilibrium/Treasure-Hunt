export type PlayerRole = "hider" | "seeker";

export type GamePhase =
  | "lobby"
  | "safety"
  | "scanning"
  | "hiding"
  | "seeking"
  | "treasure"
  | "finished";

export type Winner = PlayerRole | null;

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface CalibrationState {
  originHeading: number;
  originPosition: Vector3;
  calibratedAt: string;
}

export interface TreasureKey {
  id: string;
  index: number;
  label: string;
  position: Vector3;
  found: boolean;
}

export interface RoomState {
  id: string;
  code: string;
  phase: GamePhase;
  keyCount: number;
  hiderReady: boolean;
  seekerReady: boolean;
  activeKeyIndex: number;
  keys: TreasureKey[];
  winner: Winner;
  countdownStartsAt: string | null;
  hideEndsAt: string | null;
  seekEndsAt: string | null;
  treasurePosition: Vector3 | null;
  calibration: CalibrationState | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomPatch {
  phase?: GamePhase;
  keyCount?: number;
  hiderReady?: boolean;
  seekerReady?: boolean;
  activeKeyIndex?: number;
  winner?: Winner;
  countdownStartsAt?: string | null;
  hideEndsAt?: string | null;
  seekEndsAt?: string | null;
  treasurePosition?: Vector3 | null;
  calibration?: CalibrationState | null;
}

export interface ScanSample {
  heading: number;
  pitch: number;
  timestamp: number;
}
