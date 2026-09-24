import type { EncyclopediaEntry } from "./encyclopedia";
import { chapterGroups } from "./data/chapterGroups";
import { discoveredEnemies, isCardUnlocked } from "./progress";
import { enemyFamily } from "./registry/enemies";
import { bossEncyclopediaIcon, enemyEncyclopediaGroup } from "./enemyEncyclopediaCatalog";

export { bossEncyclopediaIcon, enemyEncyclopediaGroup } from "./enemyEncyclopediaCatalog";

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
