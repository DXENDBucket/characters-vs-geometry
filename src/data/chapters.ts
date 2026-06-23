import { levelNodes } from "./levels";
import type { LevelNode } from "../types";

export interface ChapterDefinition {
  id: string;
  labelKey: string;
  x: number;
  y: number;
  unlocked: boolean;
  levelPrefix: string;
  parentId?: string;
}

export const chapterDefinitions: ChapterDefinition[] = [
  { id: "0", labelKey: "chapter.0", x: 180, y: 290, unlocked: true, levelPrefix: "0-" },
  { id: "1", labelKey: "chapter.1", x: 520, y: 430, unlocked: true, levelPrefix: "1-", parentId: "0" },
  { id: "2", labelKey: "chapter.2", x: 860, y: 290, unlocked: true, levelPrefix: "2-", parentId: "1" },
  { id: "3", labelKey: "chapter.3", x: 1200, y: 430, unlocked: true, levelPrefix: "3-", parentId: "2" },
  { id: "4", labelKey: "chapter.4", x: 1540, y: 290, unlocked: true, levelPrefix: "4-", parentId: "3" },
  { id: "5", labelKey: "chapter.5", x: 1880, y: 430, unlocked: true, levelPrefix: "5-", parentId: "4" }
];

export function defaultChapterId() {
  return chapterDefinitions.find((chapter) => chapter.unlocked)?.id ?? chapterDefinitions[0].id;
}

export function getChapterDefinition(chapterId: string) {
  return chapterDefinitions.find((chapter) => chapter.id === chapterId) ?? chapterDefinitions[0];
}

export function chapterIdForLevelId(levelId: string) {
  return (
    chapterDefinitions.find((chapter) => levelId.startsWith(chapter.levelPrefix))?.id ??
    defaultChapterId()
  );
}

export function levelNodesForChapter(chapterId: string, nodes: LevelNode[] = levelNodes) {
  const chapter = getChapterDefinition(chapterId);
  return nodes.filter((node) => node.id.startsWith(chapter.levelPrefix));
}
