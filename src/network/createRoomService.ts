import { LocalRoomService } from "./LocalRoomService";
import type { RoomService } from "./RoomService";
import { SupabaseRoomService } from "./SupabaseRoomService";

export function createRoomService(): RoomService {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    return new SupabaseRoomService(url, anonKey);
  }

  return new LocalRoomService();
}
