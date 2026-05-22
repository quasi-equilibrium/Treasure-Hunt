export const MAX_KEYS = 5;
export const MIN_KEYS = 1;
export const READY_COUNTDOWN_SECONDS = 5;
export const HIDING_SECONDS = 5 * 60;
export const SEEKING_SECONDS = 3 * 60;
export const SCAN_REQUIRED_PROGRESS = 100;
export const ROOM_CODE_LENGTH = 6;

export const PHASE_LABELS: Record<string, string> = {
  lobby: "Lobi",
  safety: "Güvenlik",
  scanning: "Ev Taraması",
  hiding: "Saklama",
  seeking: "Arama",
  treasure: "Hazine",
  finished: "Oyun Bitti"
};
