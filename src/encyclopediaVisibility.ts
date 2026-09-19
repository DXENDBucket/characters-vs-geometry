import type { EncyclopediaEntry } from "./encyclopedia";
import { chapterGroups } from "./data/chapterGroups";
import { discoveredEnemies, isCardUnlocked } from "./progress";
import { enemyFamily } from "./registry/enemies";
import type { BossKind } from "./types";

const BOSS_ICONS: Record<BossKind, NonNullable<EncyclopediaEntry["icon"]>> = {
  cube: "cube",
  cube2: "cube",
  tetrahedron: "tetrahedron",
  tetrahedron2: "tetrahedron",
  dodecahedron: "dodecahedron",
  dodecahedron2: "dodecahedron",
  smallStellatedDodecahedron: "smallStellatedDodecahedron",
  octahedron: "octahedron",
  octahedron2: "octahedron",
  icosahedron: "icosahedron"
};

export function bossEncyclopediaIcon(kind: BossKind) {
  return BOSS_ICONS[kind];
}

// Reused enemies retain their origin group, including in endless operations.
export function enemyEncyclopediaGroup(entry: EncyclopediaEntry) {
  return entry.chapterGroupId ?? "main";
}

export function visibleEnemyEncyclopediaGroups(entries: EncyclopediaEntry[]) {
  const groups = new Set(entries.map(enemyEncyclopediaGroup));
  return chapterGroups.filter(group => groups.has(group.id));
}

export function visibleEncyclopediaEntries(entries: EncyclopediaEntry[]) {
  const known = discoveredEnemies();
  const families = new Set([...known.enemies].map(enemyFamily));
  const bosses = new Set([...known.bosses].map(bossEncyclopediaIcon));
  return entries.filter((entry) => {
    if (entry.card) return isCardUnlocked(entry.card.id);
    if (entry.enemyKind) return families.has(enemyFamily(entry.enemyKind));
    if (entry.icon) return bosses.has(entry.icon);
    return true;
  });
}
