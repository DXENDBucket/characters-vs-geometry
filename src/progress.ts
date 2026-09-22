import { CARD_SLOT_COUNT, CUBE_BOSS_STATS, DIFFICULTY_MIN, DIFFICULTY_MAX } from "./config";
import { imitatedCardId } from "./game/cardIdentity";
import { isLoadoutCardId } from "./game/cardEligibility";
import { chapterDefinitions, chapterIdForLevelId, getChapterDefinition, levelNodesForChapter } from "./data/chapters";
import { chapterGroups, groupForChapter } from "./data/chapterGroups";
import { cardUnlockRequirement, cardUnlockRequirements } from "./data/cardUnlocks";
import { CARD_SLOT_UNLOCK_CHAPTER_IDS, INITIAL_CARD_SLOT_COUNT } from "./data/cardSlotUnlocks";
import { getLevelConfig, levelNodes } from "./data/levels";
import { isEnemyKind } from "./game/enemyIdentity";
import { clearSurvivalSaves } from "./survivalSaves";
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
  bestBossRanks: Record<string, number>;
  flawlessDifficulties: Record<string, number[]>;
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

export function reloadProgress() { cachedProgress = null; }

export function isLevelCompleted(levelId: string) {
  return progress().completedLevelIds.includes(levelId);
}

export function bestFlawlessDifficulty(levelId: string): number | undefined {
  const difficulties = progress().flawlessDifficulties[levelId];
  return difficulties?.length ? Math.max(...difficulties) : undefined;
}

export function flawlessSummaryForChapters(chapterIds: readonly string[]) {
  const nodes = chapterIds.flatMap(id => levelNodesForChapter(id)).filter(node => !getLevelConfig(node.id).survival);
  const difficulties = nodes.map(node => bestFlawlessDifficulty(node.id)).filter((value): value is number => value !== undefined);
  return {
    count: difficulties.length,
    total: nodes.length,
    // A chapter's rating is the difficulty reached by every operation, not its best single clear.
    difficulty: nodes.length > 0 && difficulties.length === nodes.length ? Math.min(...difficulties) : undefined
  };
}

export function isLevelUnlocked(levelId: string) {
  const state = progress();
  if (!levelNodes.some(node => node.id === levelId)) return false;
  const chapter = getChapterDefinition(chapterIdForLevelId(levelId));
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
      getLevelConfig(levelId).bossEndless ||
      !Number.isSafeInteger(count) || count <= bestWaveForLevel(levelId)) return;
  const state = progress();
  writeProgress({ ...state, bestWaves: { ...state.bestWaves, [levelId]: count } });
}

export function bestBossRankForLevel(levelId: string) {
  return progress().bestBossRanks[levelId] ?? 0;
}

export function recordDefeatedBossRank(levelId: string, rank: number) {
  if (!getLevelConfig(levelId).bossEndless || !Number.isSafeInteger(rank) || rank <= bestBossRankForLevel(levelId)) return;
  const state = progress();
  writeProgress({ ...state, bestBossRanks: { ...state.bestBossRanks, [levelId]: rank } });
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

export function isCardUnlocked(id: CardId): boolean {
  const target = imitatedCardId(id);
  if (target) return isLoadoutCardId(id) && isCardUnlocked("?") && isCardUnlocked(target);
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

export function completeLevel(levelId: string, result?: { difficulty: number; flawless: boolean }) {
  if (!knownLevelIds.has(levelId)) {
    return [];
  }

  const state = progress();
  const flawless = result?.flawless === true && Number.isInteger(result.difficulty) &&
    result.difficulty >= DIFFICULTY_MIN && result.difficulty <= DIFFICULTY_MAX;
  const previousDifficulties = state.flawlessDifficulties[levelId] ?? [];
  const newFlawless = flawless && !previousDifficulties.includes(result!.difficulty);
  if (state.completedLevelIds.includes(levelId) && !newFlawless) {
    return [];
  }

  const newlyUnlockedCards = allCardIds.filter(
    (id) => cardUnlockRequirement(id) === levelId && !isCardUnlocked(id)
  );

  writeProgress({
    ...state,
    flawlessDifficulties: newFlawless ? {
      ...state.flawlessDifficulties,
      [levelId]: [...previousDifficulties, result!.difficulty].sort((a, b) => a - b)
    } : state.flawlessDifficulties,
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
  clearSurvivalSaves();
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
  return { version: SAVE_VERSION, completedLevelIds: [], allCardsUnlocked: false, seenEnemyKinds: [], seenBossKinds: [], bestWaves: {}, bestBossRanks: {}, flawlessDifficulties: {} };
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
      completed.add("0-5");
    }
    return {
      version: SAVE_VERSION,
      completedLevelIds: levelNodes.map((node) => node.id).filter((id) => completed.has(id)),
      allCardsUnlocked: parsed.allCardsUnlocked === true,
      flawlessDifficulties: Object.fromEntries(completableNodes.filter(node => completed.has(node.id)).flatMap(node => {
        const values = parsed.flawlessDifficulties?.[node.id];
        const valid = Array.isArray(values) ? [...new Set(values.filter(value => Number.isInteger(value) &&
          value >= DIFFICULTY_MIN && value <= DIFFICULTY_MAX))].sort((a, b) => a - b) : [];
        return valid.length ? [[node.id, valid]] : [];
      })),
      seenEnemyKinds: Array.isArray(parsed.seenEnemyKinds) ? [...new Set(parsed.seenEnemyKinds.filter(isEnemyKind))] : [],
      seenBossKinds: validStoredKinds(parsed.seenBossKinds, CUBE_BOSS_STATS),
      bestWaves: Object.fromEntries(levelNodes.filter(node => getLevelConfig(node.id).survival).map(node => {
        const value = parsed.bestWaves?.[node.id];
        return [node.id, typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0];
      })),
      bestBossRanks: Object.fromEntries(levelNodes.filter(node => getLevelConfig(node.id).bossEndless).map(node => {
        const value = parsed.bestBossRanks?.[node.id];
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
