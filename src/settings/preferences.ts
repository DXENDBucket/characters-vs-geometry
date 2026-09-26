import { normalizeAudioSettings, type AudioSettings } from "../audio/settings";
import { clampDifficulty } from "../config";

const STORAGE_KEY = "characters-vs-geometry-preferences";

interface StoredPreferences {
  debugMode?: boolean;
  audio?: AudioSettings;
  difficulty?: number;
}

let cachedPreferences: StoredPreferences | null = null;

export function reloadPreferences() { cachedPreferences = null; }

export function getSelectedDifficulty() { return clampDifficulty(preferences().difficulty); }

export function setSelectedDifficulty(difficulty: number) {
  const value = clampDifficulty(Number.isFinite(difficulty) ? difficulty : undefined);
  if (getSelectedDifficulty() !== value) writePreferences({ ...preferences(), difficulty: value });
}

export function isDebugModeEnabled() {
  return preferences().debugMode === true;
}

export function setDebugModeEnabled(enabled: boolean) {
  writePreferences({ ...preferences(), debugMode: enabled });
}

export function getAudioSettings() { return normalizeAudioSettings(preferences().audio); }

export function setAudioSettings(patch: Partial<AudioSettings>) {
  writePreferences({ ...preferences(), audio: normalizeAudioSettings({ ...getAudioSettings(), ...patch }) });
}

function writePreferences(next: StoredPreferences) {
  cachedPreferences = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the setting active for the current session when storage is unavailable.
  }
}

function preferences() {
  cachedPreferences ??= readPreferences();
  return cachedPreferences;
}

function readPreferences(): StoredPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as StoredPreferences | null;
    return parsed && typeof parsed === "object"
      ? { debugMode: parsed.debugMode === true, audio: normalizeAudioSettings(parsed.audio),
        difficulty: Number.isFinite(parsed.difficulty) ? clampDifficulty(parsed.difficulty) : undefined }
      : {};
  } catch {
    return {};
  }
}
