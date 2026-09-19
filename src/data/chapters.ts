import { levelNodes } from "./levels";
import type { LevelNode } from "../types";

export interface ChapterDefinition {
  id: string;
  labelKey: string;
  x: number;
  y: number;
  levelPrefix: string;
  parentId?: string;
  survival?: boolean;
}

export const chapterDefinitions: ChapterDefinition[] = [
  { id: "0", labelKey: "chapter.0", x: 180, y: 290, levelPrefix: "0-" },
  { id: "1", labelKey: "chapter.1", x: 520, y: 430, levelPrefix: "1-", parentId: "0" },
  { id: "2", labelKey: "chapter.2", x: 860, y: 290, levelPrefix: "2-", parentId: "1" },
  { id: "3", labelKey: "chapter.3", x: 1200, y: 430, levelPrefix: "3-", parentId: "2" },
  { id: "4", labelKey: "chapter.4", x: 1540, y: 290, levelPrefix: "4-", parentId: "3" },
  { id: "5", labelKey: "chapter.5", x: 1880, y: 430, levelPrefix: "5-", parentId: "4" },
  { id: "IF", labelKey: "chapter.IF", x: 420, y: 350, levelPrefix: "IF-", survival: true },
  { id: "IFB", labelKey: "chapter.IFB", x: 820, y: 350, levelPrefix: "IF-BE-", survival: true },
  { id: "AE", labelKey: "chapter.AE", x: 420, y: 350, levelPrefix: "AE-" }
];

export function defaultChapterId() {
  return (
    chapterDefinitions.find((chapter) =>
      levelNodes.some((node) => node.id.startsWith(chapter.levelPrefix))
    )?.id ?? chapterDefinitions[0].id
  );
}

export function getChapterDefinition(chapterId: string) {
  return chapterDefinitions.find((chapter) => chapter.id === chapterId) ?? chapterDefinitions[0];
}

export function chapterIdForLevelId(levelId: string) {
  return (
    chapterDefinitions.filter((chapter) => levelId.startsWith(chapter.levelPrefix))
      .sort((a, b) => b.levelPrefix.length - a.levelPrefix.length)[0]?.id ??
    defaultChapterId()
  );
}

export function levelNodesForChapter(chapterId: string, nodes: LevelNode[] = levelNodes) {
  const chapter = getChapterDefinition(chapterId);
  return nodes.filter((node) => chapterIdForLevelId(node.id) === chapter.id);
}
