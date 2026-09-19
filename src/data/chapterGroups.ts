import type { CardId } from "../types";
import { chapterDefinitions } from "./chapters";

export interface ChapterGroupDefinition {
  id: string;
  labelKey: string;
  titleRows: readonly (readonly CardId[])[];
  titleSpacing?: number;
  titleRowScales?: readonly number[];
  titleRowSpacing?: number;
  backgroundSymbol?: "infinity";
  chapterIds: readonly string[];
  survival?: boolean;
  unlockAfter?: string;
}

export const chapterGroups: ChapterGroupDefinition[] = [{
  id: "main",
  labelKey: "chapterGroup.main",
  titleRows: [["M", "a", "i", "n"], ["S", "t", "o", "r", "y"]],
  chapterIds: ["0", "1", "2", "3", "4", "5"]
}, {
  id: "infinite",
  survival: true,
  unlockAfter: "1-9",
  labelKey: "chapterGroup.infinite",
  titleSpacing: 110,
  titleRowScales: [0.8, 0.62],
  titleRowSpacing: 90,
  backgroundSymbol: "infinity",
  titleRows: [["I", "n", "f", "i", "n", "i", "t", "e"], ["F", "r", "o", "n", "t"]],
  chapterIds: ["IF", "IFB"]
}];

export function getChapterGroup(id?: string) {
  return chapterGroups.find(group => group.id === id) ?? chapterGroups[0];
}

export function chaptersInGroup(id?: string) {
  const group = getChapterGroup(id);
  return chapterDefinitions.filter(chapter => group.chapterIds.includes(chapter.id));
}

export function groupForChapter(chapterId: string) {
  return chapterGroups.find(group => group.chapterIds.includes(chapterId)) ?? chapterGroups[0];
}
