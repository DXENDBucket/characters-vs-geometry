import { chapterDefinitions, levelNodesForChapter } from "./data/chapters";
import { cardUnlockRequirement, cardUnlockRequirements } from "./data/cardUnlocks";
import { levelNodes } from "./data/levels";
import type { CardId } from "./types";

const STORAGE_KEY = "characters-vs-geometry-progress-v1";
const SAVE_VERSION = 1;

interface StoredProgress {
  version: typeof SAVE_VERSION;
  completedLevelIds: string[];
  allCardsUnlocked: boolean;
}

export interface ProgressSummary {
  completedLevels: number;
  totalLevels: number;
  unlockedLevels: number;
  unlockedCards: number;
  totalCards: number;
  allCardsUnlocked: boolean;
}

const knownLevelIds = new Set(levelNodes.map((node) => node.id));
const allCardIds = Object.keys(cardUnlockRequirements) as CardId[];
let cachedProgress: StoredProgress | null = null;

export function isLevelCompleted(levelId: string) {
  return progress().completedLevelIds.includes(levelId);
}

export function isLevelUnlocked(levelId: string) {
  const state = progress();
  const index = levelNodes.findIndex((node) => node.id === levelId);
  return index === 0 || (index > 0 && state.completedLevelIds.includes(levelNodes[index - 1].id));
}

export function isChapterUnlocked(chapterId: string) {
  const chapter = chapterDefinitions.find((definition) => definition.id === chapterId);
  if (!chapter) {
    return false;
  }
  if (chapter.id === "0") {
    return true;
  }

  const nodes = levelNodesForChapter(chapter.id);
  return nodes.length > 0 && isLevelUnlocked(nodes[0].id);
}

export function isChapterCompleted(chapterId: string) {
  const nodes = levelNodesForChapter(chapterId);
  return nodes.length > 0 && nodes.every((node) => isLevelCompleted(node.id));
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
  writeProgress({ ...state, completedLevelIds: levelNodes.map((node) => node.id) });
}

export function unlockAllCards() {
  const state = progress();
  writeProgress({ ...state, allCardsUnlocked: true });
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
    totalLevels: levelNodes.length,
    unlockedLevels: levelNodes.filter((node) => isLevelUnlocked(node.id)).length,
    unlockedCards: allCardIds.filter((id) => isCardUnlocked(id)).length,
    totalCards: allCardIds.length,
    allCardsUnlocked: state.allCardsUnlocked
  };
}

function progress() {
  cachedProgress ??= readProgress();
  return cachedProgress;
}

function emptyProgress(): StoredProgress {
  return { version: SAVE_VERSION, completedLevelIds: [], allCardsUnlocked: false };
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
    return {
      version: SAVE_VERSION,
      completedLevelIds: levelNodes.map((node) => node.id).filter((id) => completed.has(id)),
      allCardsUnlocked: parsed.allCardsUnlocked === true
    };
  } catch {
    return emptyProgress();
  }
}

function writeProgress(state: StoredProgress) {
  cachedProgress = state;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the in-memory state usable even if persistence is blocked.
  }
}
