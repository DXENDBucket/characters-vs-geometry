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
