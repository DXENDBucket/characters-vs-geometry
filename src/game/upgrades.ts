import type { CardId } from "../types";

const VOLLEY_UPGRADEABLE_CARDS = new Set<CardId>(["A", "C", "E", "M", "W", "H", "P", "I", "J", "K"]);
const MAX_HP_UPGRADEABLE_CARDS = new Set<CardId>(["B", "D", "L", "N", "T"]);
const UPGRADE_SCALE = 0.8;

export function effectiveUpgradeCountForLevel(level: number) {
  let remainingLevels = Math.max(0, Math.floor(level) - 1);
  let effectiveUpgrades = 0;
  let levelsPerUpgrade = 1;
  let effectiveBandSize = 10;

  while (remainingLevels > 0) {
    const levelsInBand = effectiveBandSize * levelsPerUpgrade;
    const consumed = Math.min(remainingLevels, levelsInBand);
    effectiveUpgrades += Math.floor(consumed / levelsPerUpgrade);
    remainingLevels -= consumed;

    if (consumed < levelsInBand) {
      break;
    }

    levelsPerUpgrade *= 2;
    effectiveBandSize *= 2;
  }

  return effectiveUpgrades;
}

export function effectiveLevelForLevel(level: number) {
  return 1 + effectiveUpgradeCountForLevel(level);
}

export function effectiveUpgradeDelta(previousLevel: number, nextLevel: number) {
  return effectiveUpgradeCountForLevel(nextLevel) - effectiveUpgradeCountForLevel(previousLevel);
}

export function isVolleyUpgradeable(type: CardId) {
  return VOLLEY_UPGRADEABLE_CARDS.has(type);
}

export function isMaxHpUpgradeable(type: CardId) {
  return MAX_HP_UPGRADEABLE_CARDS.has(type);
}

export function volleyShotCount(type: CardId, level: number) {
  return isVolleyUpgradeable(type) ? effectiveLevelForLevel(level) : 1;
}

export function volleyInterval(fireRate: number, shots: number) {
  if (shots <= 1) {
    return 0;
  }

  const totalVolleyTime = fireRate / 5;
  return totalVolleyTime / (shots - 1);
}

export function scaledByEffectiveUpgrades(baseValue: number, level: number) {
  return Math.round(baseValue * (1 + effectiveUpgradeCountForLevel(level) * UPGRADE_SCALE));
}

export function maxHpGainForEffectiveUpgrades(baseMaxHp: number, gainedEffectiveUpgrades: number) {
  return baseMaxHp * UPGRADE_SCALE * gainedEffectiveUpgrades;
}
