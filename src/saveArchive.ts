import { levelConfigs } from "./data/levels";
import { cardDefinitions } from "./data/cards";
import { CUBE_BOSS_STATS, DIFFICULTY_MIN, DIFFICULTY_MAX } from "./config";
import { isEnemyKind } from "./game/enemyIdentity";
import { validateSurvivalSave } from "./survivalSaves";
import { isLoadoutCardId } from "./game/cardEligibility";

export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const RECOVERY_KEY = "charset-save-import-recovery-v1";
const PROGRESS_KEY = "characters-vs-geometry-progress-v1";
const LANGUAGE_KEY = "characters-vs-geometry-language";
const PREFERENCES_KEY = "characters-vs-geometry-preferences";
const BINDINGS_KEY = "characters-vs-geometry-keybindings";
const LOADOUT_KEY = "characters-vs-geometry:last-card-loadout";
const SURVIVAL_PREFIX = "charset-survival-v1:";
const keys = new Set([PROGRESS_KEY, LANGUAGE_KEY, PREFERENCES_KEY, BINDINGS_KEY, LOADOUT_KEY]);
const cards = new Set<string>(cardDefinitions.map(card => card.id));
export interface SaveArchive { format: "charset-save"; version: 1; exportedAt: string; entries: Record<string, string> }

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const knownKey = (key: string) => keys.has(key) || (key.startsWith(SURVIVAL_PREFIX) &&
  Object.hasOwn(levelConfigs, key.slice(SURVIVAL_PREFIX.length)) && levelConfigs[key.slice(SURVIVAL_PREFIX.length)].survival);
const validList = (value: unknown, check: (value: unknown) => boolean) => Array.isArray(value) && value.every(check);
const levelId = (id: unknown) => typeof id === "string" && Object.hasOwn(levelConfigs, id);

function validateEntry(key: string, raw: string) {
  if (!knownKey(key)) throw new Error("Unknown save entry");
  if (key === LANGUAGE_KEY) {
    if (raw !== "en" && raw !== "zh-CN") throw new Error("Invalid language");
    return;
  }
  const value: unknown = JSON.parse(raw);
  if (key === LOADOUT_KEY) {
    if (!validList(value, isLoadoutCardId) || (value as unknown[]).length > 10) throw new Error("Invalid loadout");
    return;
  }
  if (!object(value)) throw new Error("Invalid save entry");
  if (key === PROGRESS_KEY) {
    if (value.version !== 1 || !validList(value.completedLevelIds, levelId) || typeof value.allCardsUnlocked !== "boolean") throw new Error("Invalid progress");
    if (value.seenEnemyKinds !== undefined && !validList(value.seenEnemyKinds, isEnemyKind)) throw new Error("Invalid enemies");
    if (value.seenBossKinds !== undefined && !validList(value.seenBossKinds, kind => typeof kind === "string" && Object.hasOwn(CUBE_BOSS_STATS, kind))) throw new Error("Invalid bosses");
    if (value.flawlessDifficulties !== undefined && (!object(value.flawlessDifficulties) ||
        Object.entries(value.flawlessDifficulties).some(([id, difficulties]) => !levelId(id) || levelConfigs[id].survival ||
          !(value.completedLevelIds as string[]).includes(id) || !validList(difficulties, difficulty =>
            typeof difficulty === "number" && Number.isInteger(difficulty) && difficulty >= DIFFICULTY_MIN && difficulty <= DIFFICULTY_MAX)))) {
      throw new Error("Invalid flawless records");
    }
    for (const field of ["bestWaves", "bestBossRanks"]) {
      const records = value[field];
      if (records !== undefined && (!object(records) || Object.entries(records).some(([id, count]) =>
        !levelId(id) || !Number.isSafeInteger(count) || (count as number) < 0))) throw new Error("Invalid endless records");
    }
  } else if (key === PREFERENCES_KEY) {
    if (Object.keys(value).some(key => key !== "debugMode") || (value.debugMode !== undefined && typeof value.debugMode !== "boolean")) throw new Error("Invalid preferences");
  } else if (key === BINDINGS_KEY) {
    if (Object.entries(value).some(([action, code]) =>
      !(/^(tool:[a-zA-Z]+|slot:(10|[1-9]))$/.test(action) || action.startsWith("card:") && cards.has(action.slice(5))) ||
      typeof code !== "string" || code.length > 64)) throw new Error("Invalid controls");
  } else {
    validateSurvivalSave(value as unknown as Parameters<typeof validateSurvivalSave>[0]);
    if (value.levelId !== key.slice(SURVIVAL_PREFIX.length)) throw new Error("Mismatched battle save");
  }
}

export function parseSaveArchive(text: string): SaveArchive {
  if (text.length > MAX_ARCHIVE_BYTES || new TextEncoder().encode(text).length > MAX_ARCHIVE_BYTES) throw new Error("Save file too large");
  const value = JSON.parse(text) as SaveArchive;
  if (!object(value) || value.format !== "charset-save" || value.version !== 1 || !object(value.entries) ||
      typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error("Invalid archive");
  for (const [key, raw] of Object.entries(value.entries)) {
    if (typeof raw !== "string") throw new Error("Invalid save value");
    validateEntry(key, raw);
  }
  return value;
}

function readEntries(storage: Storage) {
  const entries: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && knownKey(key)) entries[key] = storage.getItem(key)!;
  }
  return entries;
}

function replaceEntries(storage: Storage, entries: Record<string, string>) {
  for (const key of Object.keys(readEntries(storage))) storage.removeItem(key);
  for (const [key, raw] of Object.entries(entries)) storage.setItem(key, raw);
}

export function exportSaveArchive(storage = window.localStorage) {
  const archive: SaveArchive = { format: "charset-save", version: 1, exportedAt: new Date().toISOString(), entries: readEntries(storage) };
  return JSON.stringify(archive, null, 2);
}

// Write the undo journal first. If interrupted, the next startup restores the previous profile.
export function importSaveArchive(text: string, storage = window.localStorage) {
  const archive = parseSaveArchive(text);
  recoverSaveImport(storage);
  const previous = readEntries(storage);
  storage.setItem(RECOVERY_KEY, JSON.stringify(previous));
  try {
    replaceEntries(storage, archive.entries);
    storage.removeItem(RECOVERY_KEY);
  } catch (error) {
    recoverSaveImport(storage);
    throw error;
  }
}

export function recoverSaveImport(storage = window.localStorage) {
  const raw = storage.getItem(RECOVERY_KEY);
  if (!raw) return;
  const previous: unknown = JSON.parse(raw);
  if (!object(previous) || Object.entries(previous).some(([key, value]) => !knownKey(key) || typeof value !== "string")) throw new Error("Invalid save recovery journal");
  replaceEntries(storage, previous as Record<string, string>);
  storage.removeItem(RECOVERY_KEY);
}
