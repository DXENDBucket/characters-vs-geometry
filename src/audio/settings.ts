export interface AudioSettings {
  master: number;
  ui: number;
  battle: number;
  music: number;
  muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = { master: .5, ui: .55, battle: .65, music: .16, muted: false };

export function normalizeAudioSettings(value: unknown): AudioSettings {
  const input = value && typeof value === "object" ? value as Partial<AudioSettings> : {};
  const volume = (key: "master" | "ui" | "battle" | "music") => typeof input[key] === "number" && Number.isFinite(input[key])
    ? Math.max(0, Math.min(1, input[key]!)) : DEFAULT_AUDIO_SETTINGS[key];
  return { master: volume("master"), ui: volume("ui"), battle: volume("battle"), music: volume("music"), muted: input.muted === true };
}

export function validAudioSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) => key === "muted" ? typeof item === "boolean"
    : ["master", "ui", "battle", "music"].includes(key) && typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1);
}
