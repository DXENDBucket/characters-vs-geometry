import type { Enemy } from "../types";
import { enemySupportSources, hexAuraFlags, HEX_AURA_ARMOR_FLAG, HEX_AURA_MAGIC_RESISTANCE_FLAG } from "../game/enemySupport";
import { enemiesWithPassengers } from "../game/enemyContainerRules";
import { setPositionIfChanged, setVisibleIfChanged } from "../game/visualGuards";

const visibleRosters = new WeakSet<Enemy[]>();

export function syncHexArmorAuras(enemies: Enemy[], time: number, sources = enemySupportSources(enemies)) {
  if (sources.hexagons.length === 0 && sources.magicResistanceLaneMask === 0) {
    if (!visibleRosters.has(enemies)) {
      return;
    }

    for (const enemy of enemies) {
      setVisibleIfChanged(enemy.armorIcon, false);
      setVisibleIfChanged(enemy.magicResistanceIcon, false);
    }
    visibleRosters.delete(enemies);
    return;
  }

  const iconY = -38 + Math.sin(time / 110) * 2;
  let anyIconVisible = false;
  for (const enemy of enemiesWithPassengers(enemies)) {
    const auraFlags = hexAuraFlags(sources, enemy);
    const hasArmorBonus = (auraFlags & HEX_AURA_ARMOR_FLAG) !== 0;
    const hasMagicResistanceBonus = (auraFlags & HEX_AURA_MAGIC_RESISTANCE_FLAG) !== 0;
    anyIconVisible = anyIconVisible || hasArmorBonus || hasMagicResistanceBonus;

    setVisibleIfChanged(enemy.armorIcon, hasArmorBonus);
    setVisibleIfChanged(enemy.magicResistanceIcon, hasMagicResistanceBonus);
    if (hasArmorBonus) {
      setPositionIfChanged(enemy.armorIcon, hasMagicResistanceBonus ? -10 : 0, iconY);
    }
    if (hasMagicResistanceBonus) {
      setPositionIfChanged(enemy.magicResistanceIcon, hasArmorBonus ? 10 : 0, iconY);
    }
  }
  if (anyIconVisible) visibleRosters.add(enemies); else visibleRosters.delete(enemies);
}
