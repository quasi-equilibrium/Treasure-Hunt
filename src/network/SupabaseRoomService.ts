import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createInitialRoom, generateRoomCode, getNextUnfoundKeyIndex, isValidKeyCount, readyPatch } from "../simulation/rules";
import type { PlayerRole, RoomPatch, RoomState, TreasureKey, Vector3 } from "../simulation/types";
import type { RoomService } from "./RoomService";
import { RoomServiceError } from "./RoomService";

interface RoomRecord {
  id: string;
  code: string;
  phase: RoomState["phase"];
  key_count: number;
  hider_ready: boolean;
  seeker_ready: boolean;
  active_key_index: number;
  winner: RoomState["winner"];
  countdown_starts_at: string | null;
  hide_ends_at: string | null;
  seek_ends_at: string | null;
  treasure_position: Vector3 | null;
  calibration: RoomState["calibration"];
  created_at: string;
  updated_at: string;
}

interface KeyRecord {
  id: string;
  room_id: string;
  key_index: number;
  label: string;
  position: Vector3;
  found: boolean;
}

export class SupabaseRoomService implements RoomService {
  readonly kind = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  async createRoom(keyCount: number): Promise<RoomState> {
    if (!isValidKeyCount(keyCount)) {
      throw new RoomServiceError("Anahtar sayısı 1 ile 5 arasında olmalı.");
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const draft = createInitialRoom(generateRoomCode(), keyCount);
      const { data, error } = await this.client
        .from("rooms")
        .insert({
          id: draft.id,
          code: draft.code,
          phase: draft.phase,
          key_count: draft.keyCount,
          hider_ready: draft.hiderReady,
          seeker_ready: draft.seekerReady,
          active_key_index: draft.activeKeyIndex
        })
        .select()
        .single<RoomRecord>();

      if (!error && data) {
        return this.toRoomState(data, []);
      }

      if (!error?.message.toLowerCase().includes("duplicate")) {
        throw new RoomServiceError(error?.message ?? "Oda oluşturulamadı.");
      }
    }

    throw new RoomServiceError("Benzersiz oda kodu üretilemedi.");
  }

  async joinRoom(code: string): Promise<RoomState> {
    const { data, error } = await this.client
      .from("rooms")
      .select()
      .eq("code", code.trim().toUpperCase())
      .single<RoomRecord>();

    if (error || !data) {
      throw new RoomServiceError("Bu oda kodu bulunamadı.");
    }

    return this.getRoom(data.id);
  }

  async getRoom(roomId: string): Promise<RoomState> {
    const [{ data: room, error: roomError }, { data: keys, error: keysError }] = await Promise.all([
      this.client.from("rooms").select().eq("id", roomId).single<RoomRecord>(),
      this.client.from("keys").select().eq("room_id", roomId).order("key_index", { ascending: true }).returns<KeyRecord[]>()
    ]);

    if (roomError || !room) {
      throw new RoomServiceError("Oda bulunamadı.");
    }

    if (keysError) {
      throw new RoomServiceError(keysError.message);
    }

    return this.toRoomState(room, keys ?? []);
  }

  async setReady(roomId: string, role: PlayerRole, ready: boolean): Promise<void> {
    await this.updateRoom(roomId, readyPatch(role, ready));
  }

  async updateRoom(roomId: string, patch: RoomPatch): Promise<void> {
    const { error } = await this.client.from("rooms").update(this.toRoomPatchRecord(patch)).eq("id", roomId);

    if (error) {
      throw new RoomServiceError(error.message);
    }
  }

  async addKey(roomId: string, key: Omit<TreasureKey, "id" | "found">): Promise<void> {
    const { error } = await this.client.from("keys").upsert(
      {
        room_id: roomId,
        key_index: key.index,
        label: key.label,
        position: key.position,
        found: false
      },
      { onConflict: "room_id,key_index" }
    );

    if (error) {
      throw new RoomServiceError(error.message);
    }
  }

  async markKeyFound(roomId: string, keyIndex: number): Promise<void> {
    const { error } = await this.client
      .from("keys")
      .update({ found: true })
      .eq("room_id", roomId)
      .eq("key_index", keyIndex);

    if (error) {
      throw new RoomServiceError(error.message);
    }

    const room = await this.getRoom(roomId);
    const nextIndex = getNextUnfoundKeyIndex(room);

    await this.updateRoom(roomId, {
      activeKeyIndex: nextIndex ?? room.activeKeyIndex,
      phase: nextIndex ? "seeking" : "treasure"
    });
  }

  async setTreasurePosition(roomId: string, position: Vector3): Promise<void> {
    await this.updateRoom(roomId, { treasurePosition: position });
  }

  subscribe(roomId: string, onChange: (room: RoomState) => void): () => void {
    const emit = () => {
      void this.getRoom(roomId).then(onChange).catch((error) => {
        console.error(error);
      });
    };

    const channel = this.client
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, emit)
      .on("postgres_changes", { event: "*", schema: "public", table: "keys", filter: `room_id=eq.${roomId}` }, emit)
      .subscribe();

    return () => {
      void this.client.removeChannel(channel);
    };
  }

  private toRoomState(record: RoomRecord, keys: KeyRecord[]): RoomState {
    return {
      id: record.id,
      code: record.code,
      phase: record.phase,
      keyCount: record.key_count,
      hiderReady: record.hider_ready,
      seekerReady: record.seeker_ready,
      activeKeyIndex: record.active_key_index,
      keys: keys.map((key) => ({
        id: key.id,
        index: key.key_index,
        label: key.label,
        position: key.position,
        found: key.found
      })),
      winner: record.winner,
      countdownStartsAt: record.countdown_starts_at,
      hideEndsAt: record.hide_ends_at,
      seekEndsAt: record.seek_ends_at,
      treasurePosition: record.treasure_position,
      calibration: record.calibration,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    };
  }

  private toRoomPatchRecord(patch: RoomPatch): Partial<RoomRecord> {
    return {
      phase: patch.phase,
      key_count: patch.keyCount,
      hider_ready: patch.hiderReady,
      seeker_ready: patch.seekerReady,
      active_key_index: patch.activeKeyIndex,
      winner: patch.winner,
      countdown_starts_at: patch.countdownStartsAt,
      hide_ends_at: patch.hideEndsAt,
      seek_ends_at: patch.seekEndsAt,
      treasure_position: patch.treasurePosition,
      calibration: patch.calibration
    };
  }
}
