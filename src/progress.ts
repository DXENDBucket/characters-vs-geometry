import { CARD_SLOT_COUNT, CUBE_BOSS_STATS } from "./config";
import { chapterDefinitions, levelNodesForChapter } from "./data/chapters";
import { chapterGroups, groupForChapter } from "./data/chapterGroups";
import { cardUnlockRequirement, cardUnlockRequirements } from "./data/cardUnlocks";
import { CARD_SLOT_UNLOCK_CHAPTER_IDS, INITIAL_CARD_SLOT_COUNT } from "./data/cardSlotUnlocks";
import { getLevelConfig, levelNodes } from "./data/levels";
import { isEnemyKind } from "./game/enemyIdentity";
import type { BossKind, CardId, EnemyKind } from "./types";

const STORAGE_KEY = "characters-vs-geometry-progress-v1";
const SAVE_VERSION = 1;

interface StoredProgress {
  version: typeof SAVE_VERSION;
  completedLevelIds: string[];
  allCardsUnlocked: boolean;
  seenEnemyKinds: EnemyKind[];
  seenBossKinds: BossKind[];
  bestWaves: Record<string, number>;
}

export interface ProgressSummary {
  completedLevels: number;
  totalLevels: number;
  unlockedLevels: number;
  unlockedCards: number;
  totalCards: number;
  unlockedCardSlots: number;
  totalCardSlots: number;
  allCardsUnlocked: boolean;
}

const completableNodes = levelNodes.filter(node => !getLevelConfig(node.id).survival);
const knownLevelIds = new Set(completableNodes.map((node) => node.id));
const allCardIds = Object.keys(cardUnlockRequirements) as CardId[];
let cachedProgress: StoredProgress | null = null;

export function isLevelCompleted(levelId: string) {
  return progress().completedLevelIds.includes(levelId);
}

export function isLevelUnlocked(levelId: string) {
  const state = progress();
  if (!levelNodes.some(node => node.id === levelId)) return false;
  const chapter = chapterDefinitions.find(chapter => levelId.startsWith(chapter.levelPrefix));
  if (chapter && !isChapterGroupUnlocked(groupForChapter(chapter.id).id)) return false;
  const level = getLevelConfig(levelId);
  if (level.unlockAfter) return state.completedLevelIds.includes(level.unlockAfter);
  if (level.survival) return true;
  const index = completableNodes.findIndex((node) => node.id === levelId);
  return index === 0 || (index > 0 && state.completedLevelIds.includes(completableNodes[index - 1].id));
}

export function isChapterGroupUnlocked(groupId: string) {
  const group = chapterGroups.find(group => group.id === groupId);
  return !!group && (!group.unlockAfter || isLevelCompleted(group.unlockAfter));
}

export function bestWaveForLevel(levelId: string) {
  return progress().bestWaves[levelId] ?? 0;
}

export function recordCompletedWaves(levelId: string, count: number) {
  if (!levelNodes.some(node => node.id === levelId) || !getLevelConfig(levelId).survival ||
      !Number.isSafeInteger(count) || count <= bestWaveForLevel(levelId)) return;
  const state = progress();
  writeProgress({ ...state, bestWaves: { ...state.bestWaves, [levelId]: count } });
}

export function isChapterUnlocked(chapterId: string) {
  const chapter = chapterDefinitions.find((definition) => definition.id === chapterId);
  if (!chapter) {
    return false;
  }
  if (!isChapterGroupUnlocked(groupForChapter(chapter.id).id)) return false;
  if (chapter.id === "0" || chapter.survival) {
    return true;
  }

  const nodes = levelNodesForChapter(chapter.id);
  return nodes.length > 0 && isLevelUnlocked(nodes[0].id);
}

export function isChapterCompleted(chapterId: string) {
  return chapterCompletedInState(progress(), chapterId);
}

export function completedLevelCountForChapter(chapterId: string) {
  return levelNodesForChapter(chapterId).filter((node) => isLevelCompleted(node.id)).length;
}

export function isCardUnlocked(id: CardId) {
  const state = progress();
  if (state.allCardsUnlocked) {
    return true;
  }

  const requiredLevelId = cardUnlockRequirement(id);
  return requiredLevelId === null || state.completedLevelIds.includes(requiredLevelId);
}

export function unlockedCardSlotCount() {
  const state = progress();
  const chapterSlots = CARD_SLOT_UNLOCK_CHAPTER_IDS.filter((chapterId) =>
    chapterCompletedInState(state, chapterId)
  ).length;
  return Math.min(CARD_SLOT_COUNT, INITIAL_CARD_SLOT_COUNT + chapterSlots);
}

export function completeLevel(levelId: string) {
  if (!knownLevelIds.has(levelId)) {
    return [];
  }

  const state = progress();
  if (state.completedLevelIds.includes(levelId)) {
    return [];
  }

  const newlyUnlockedCards = allCardIds.filter(
    (id) => cardUnlockRequirement(id) === levelId && !isCardUnlocked(id)
  );

  writeProgress({
    ...state,
    completedLevelIds: levelNodes
      .map((node) => node.id)
      .filter((id) => id === levelId || state.completedLevelIds.includes(id))
  });
  return newlyUnlockedCards.filter((id) => isCardUnlocked(id));
}

export function completeAllLevels() {
  const state = progress();
  writeProgress({ ...state, completedLevelIds: completableNodes.map((node) => node.id) });
}

export function unlockAllCards() {
  const state = progress();
  writeProgress({ ...state, allCardsUnlocked: true });
}

export function recordEnemySeen(kind: EnemyKind) {
  const state = progress();
  if (!state.seenEnemyKinds.includes(kind)) {
    writeProgress({ ...state, seenEnemyKinds: [...state.seenEnemyKinds, kind] });
  }
}

export function recordBossSeen(kind: BossKind) {
  const state = progress();
  if (!state.seenBossKinds.includes(kind)) {
    writeProgress({ ...state, seenBossKinds: [...state.seenBossKinds, kind] });
  }
}

export function discoveredEnemies() {
  const state = progress();
  const enemies = new Set(state.seenEnemyKinds);
  const bosses = new Set(state.seenBossKinds);
  // Include unlocked operations immediately, and infer discoveries for older saves.
  for (const node of levelNodes) {
    if (!isLevelUnlocked(node.id) && !isLevelCompleted(node.id)) continue;
    const level = getLevelConfig(node.id);
    for (const kind of level.enemyKinds) enemies.add(kind);
    for (const phase of level.bossPhases ?? []) {
      for (const kind of phase.enemyKinds) enemies.add(kind);
    }
    if (level.bossKind) bosses.add(level.bossKind);
  }
  return { enemies, bosses };
}

export function resetProgress() {
  cachedProgress = emptyProgress();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Progress still resets for the current session when storage is unavailable.
  }
}

export function getProgressSummary(): ProgressSummary {
  const state = progress();
  return {
    completedLevels: state.completedLevelIds.length,
    totalLevels: completableNodes.length,
    unlockedLevels: completableNodes.filter((node) => isLevelUnlocked(node.id)).length,
    unlockedCards: allCardIds.filter((id) => isCardUnlocked(id)).length,
    totalCards: allCardIds.length,
    unlockedCardSlots: unlockedCardSlotCount(),
    totalCardSlots: CARD_SLOT_COUNT,
    allCardsUnlocked: state.allCardsUnlocked
  };
}

function progress() {
  cachedProgress ??= readProgress();
  return cachedProgress;
}

function emptyProgress(): StoredProgress {
  return { version: SAVE_VERSION, completedLevelIds: [], allCardsUnlocked: false, seenEnemyKinds: [], seenBossKinds: [], bestWaves: {} };
}

function readProgress(): StoredProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyProgress();
    }

    const parsed = JSON.parse(raw) as Partial<StoredProgress> | null;
    if (!parsed || parsed.version !== SAVE_VERSION) {
      return emptyProgress();
    }

    const completed = new Set(
      Array.isArray(parsed.completedLevelIds)
        ? parsed.completedLevelIds.filter((id): id is string => typeof id === "string" && knownLevelIds.has(id))
        : []
    );
    // Existing saves keep their established chapter access when tutorial operations are added.
    if ([...completed].some((id) => !id.startsWith("0-"))) {
      completed.add("0-1");
      completed.add("0-2");
      completed.add("0-3");
      completed.add("0-4");
    }
    return {
      version: SAVE_VERSION,
      completedLevelIds: levelNodes.map((node) => node.id).filter((id) => completed.has(id)),
      allCardsUnlocked: parsed.allCardsUnlocked === true,
      seenEnemyKinds: Array.isArray(parsed.seenEnemyKinds) ? [...new Set(parsed.seenEnemyKinds.filter(isEnemyKind))] : [],
      seenBossKinds: validStoredKinds(parsed.seenBossKinds, CUBE_BOSS_STATS),
      bestWaves: Object.fromEntries(levelNodes.filter(node => getLevelConfig(node.id).survival).map(node => {
        const value = parsed.bestWaves?.[node.id];
        return [node.id, typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0];
      }))
    };
  } catch {
    return emptyProgress();
  }
}

function validStoredKinds<T extends string>(value: unknown, definitions: Record<T, unknown>): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((kind): kind is T =>
    typeof kind === "string" && Object.hasOwn(definitions, kind)
  ))];
}

function chapterCompletedInState(state: StoredProgress, chapterId: string) {
  const nodes = levelNodesForChapter(chapterId);
  return nodes.length > 0 && nodes.every((node) => state.completedLevelIds.includes(node.id));
}

function writeProgress(state: StoredProgress) {
  cachedProgress = state;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the in-memory state usable even if persistence is blocked.
  }
}
