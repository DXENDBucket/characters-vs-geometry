import type { EncyclopediaEntry } from "./encyclopedia";
import { chapterGroups } from "./data/chapterGroups";
import { enemyIsLeader } from "./registry/enemies";
import type { BossKind } from "./types";

const BOSS_ICONS: Record<BossKind, NonNullable<EncyclopediaEntry["icon"]>> = {
  del: "del",
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

export const ENEMY_ENCYCLOPEDIA_ROLES = ["minion", "leader", "boss"] as const;
export type EnemyEncyclopediaRole = typeof ENEMY_ENCYCLOPEDIA_ROLES[number];

export function bossEncyclopediaIcon(kind: BossKind) {
  return BOSS_ICONS[kind];
}

// Reused enemies retain their origin group, including in endless operations.
export function enemyEncyclopediaGroup(entry: EncyclopediaEntry) {
  return entry.chapterGroupId ?? "main";
}

export function enemyEncyclopediaRole(entry: EncyclopediaEntry): EnemyEncyclopediaRole {
  if (entry.enemyKind) return enemyIsLeader(entry.enemyKind) ? "leader" : "minion";
  return "boss";
}

export function sortEnemyEncyclopediaEntries(entries: readonly EncyclopediaEntry[]) {
  const groupOrder = new Map(chapterGroups.map((group, index) => [group.id, index]));
  const groupIndex = (entry: EncyclopediaEntry) => groupOrder.get(enemyEncyclopediaGroup(entry)) ?? groupOrder.size;
  const roleIndex = (entry: EncyclopediaEntry) => ENEMY_ENCYCLOPEDIA_ROLES.indexOf(enemyEncyclopediaRole(entry));
  // Keep authored family order within each role, independent of translated titles.
  return [...entries].sort((a, b) => groupIndex(a) - groupIndex(b) || roleIndex(a) - roleIndex(b));
}

// Call after discovery and chapter-group filtering; empty sections stay hidden.
export function enemyEncyclopediaSections(entries: readonly EncyclopediaEntry[]) {
  return ENEMY_ENCYCLOPEDIA_ROLES.map(role => ({
    role,
    labelKey: `encyclopedia.role.${role}`,
    entries: entries.filter(entry => enemyEncyclopediaRole(entry) === role)
  })).filter(section => section.entries.length > 0);
}
