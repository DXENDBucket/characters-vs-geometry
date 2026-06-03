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
  { id: "1", labelKey: "chapter.1", x: 140, y: 390, unlocked: true, levelPrefix: "1-" },
  { id: "2", labelKey: "chapter.2", x: 400, y: 290, unlocked: true, levelPrefix: "2-", parentId: "1" },
  { id: "3", labelKey: "chapter.3", x: 660, y: 390, unlocked: true, levelPrefix: "3-", parentId: "2" },
  { id: "4", labelKey: "chapter.4", x: 900, y: 290, unlocked: true, levelPrefix: "4-", parentId: "3" },
  { id: "5", labelKey: "chapter.5", x: 1140, y: 390, unlocked: true, levelPrefix: "5-", parentId: "4" }
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
