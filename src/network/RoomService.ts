import type { PlayerRole, RoomPatch, RoomState, TreasureKey, Vector3 } from "../simulation/types";

export interface RoomService {
  readonly kind: "supabase" | "local";
  createRoom(keyCount: number): Promise<RoomState>;
  joinRoom(code: string): Promise<RoomState>;
  getRoom(roomId: string): Promise<RoomState>;
  setReady(roomId: string, role: PlayerRole, ready: boolean): Promise<void>;
  updateRoom(roomId: string, patch: RoomPatch): Promise<void>;
  addKey(roomId: string, key: Omit<TreasureKey, "id" | "found">): Promise<void>;
  markKeyFound(roomId: string, keyIndex: number): Promise<void>;
  setTreasurePosition(roomId: string, position: Vector3): Promise<void>;
  subscribe(roomId: string, onChange: (room: RoomState) => void): () => void;
}

export class RoomServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoomServiceError";
  }
}
