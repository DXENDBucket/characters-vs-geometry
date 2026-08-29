const STORAGE_KEY = "characters-vs-geometry-preferences";

interface StoredPreferences {
  debugMode?: boolean;
}

let cachedPreferences: StoredPreferences | null = null;

export function isDebugModeEnabled() {
  return preferences().debugMode === true;
}

export function setDebugModeEnabled(enabled: boolean) {
  const next = { ...preferences(), debugMode: enabled };
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
      ? { debugMode: parsed.debugMode === true }
      : {};
  } catch {
    return {};
  }
}
