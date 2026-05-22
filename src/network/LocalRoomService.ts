import { createInitialRoom, generateRoomCode, getNextUnfoundKeyIndex, isValidKeyCount, readyPatch } from "../simulation/rules";
import type { RoomService } from "./RoomService";
import { RoomServiceError } from "./RoomService";
import type { PlayerRole, RoomPatch, RoomState, TreasureKey, Vector3 } from "../simulation/types";

const STORAGE_KEY = "treasure-hunt.rooms";
const CHANNEL_NAME = "treasure-hunt.rooms";

export class LocalRoomService implements RoomService {
  readonly kind = "local" as const;
  private readonly channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

  async createRoom(keyCount: number): Promise<RoomState> {
    if (!isValidKeyCount(keyCount)) {
      throw new RoomServiceError("Anahtar sayısı 1 ile 5 arasında olmalı.");
    }

    const rooms = this.readRooms();
    let code = generateRoomCode();

    while (rooms.some((room) => room.code === code)) {
      code = generateRoomCode();
    }

    const room = createInitialRoom(code, keyCount);
    this.writeRooms([...rooms, room]);
    this.broadcast(room.id);
    return room;
  }

  async joinRoom(code: string): Promise<RoomState> {
    const normalized = code.trim().toUpperCase();
    const room = this.readRooms().find((candidate) => candidate.code === normalized);

    if (!room) {
      throw new RoomServiceError("Bu oda kodu bulunamadı.");
    }

    return room;
  }

  async getRoom(roomId: string): Promise<RoomState> {
    return this.requireRoom(roomId);
  }

  async setReady(roomId: string, role: PlayerRole, ready: boolean): Promise<void> {
    await this.updateRoom(roomId, readyPatch(role, ready));
  }

  async updateRoom(roomId: string, patch: RoomPatch): Promise<void> {
    const rooms = this.readRooms();
    const index = rooms.findIndex((room) => room.id === roomId);

    if (index === -1) {
      throw new RoomServiceError("Oda bulunamadı.");
    }

    rooms[index] = {
      ...rooms[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };

    this.writeRooms(rooms);
    this.broadcast(roomId);
  }

  async addKey(roomId: string, key: Omit<TreasureKey, "id" | "found">): Promise<void> {
    const room = this.requireRoom(roomId);
    const existing = room.keys.filter((candidate) => candidate.index !== key.index);
    const nextKey: TreasureKey = {
      ...key,
      id: crypto.randomUUID(),
      found: false
    };

    await this.replaceRoom({
      ...room,
      keys: [...existing, nextKey].sort((a, b) => a.index - b.index)
    });
  }

  async markKeyFound(roomId: string, keyIndex: number): Promise<void> {
    const room = this.requireRoom(roomId);
    const nextRoom: RoomState = {
      ...room,
      keys: room.keys.map((key) => (key.index === keyIndex ? { ...key, found: true } : key))
    };
    const nextIndex = getNextUnfoundKeyIndex(nextRoom);

    await this.replaceRoom({
      ...nextRoom,
      activeKeyIndex: nextIndex ?? room.activeKeyIndex,
      phase: nextIndex ? "seeking" : "treasure"
    });
  }

  async setTreasurePosition(roomId: string, position: Vector3): Promise<void> {
    await this.updateRoom(roomId, { treasurePosition: position });
  }

  subscribe(roomId: string, onChange: (room: RoomState) => void): () => void {
    const handleMessage = (event: MessageEvent<string>) => {
      if (event.data === roomId) {
        onChange(this.requireRoom(roomId));
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        onChange(this.requireRoom(roomId));
      }
    };

    this.channel?.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);

    return () => {
      this.channel?.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
    };
  }

  private async replaceRoom(room: RoomState): Promise<void> {
    const rooms = this.readRooms();
    const index = rooms.findIndex((candidate) => candidate.id === room.id);

    if (index === -1) {
      throw new RoomServiceError("Oda bulunamadı.");
    }

    rooms[index] = {
      ...room,
      updatedAt: new Date().toISOString()
    };
    this.writeRooms(rooms);
    this.broadcast(room.id);
  }

  private requireRoom(roomId: string): RoomState {
    const room = this.readRooms().find((candidate) => candidate.id === roomId);

    if (!room) {
      throw new RoomServiceError("Oda bulunamadı.");
    }

    return room;
  }

  private readRooms(): RoomState[] {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    try {
      return JSON.parse(raw) as RoomState[];
    } catch {
      return [];
    }
  }

  private writeRooms(rooms: RoomState[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  }

  private broadcast(roomId: string): void {
    this.channel?.postMessage(roomId);
  }
}
