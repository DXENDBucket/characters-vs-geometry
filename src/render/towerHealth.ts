import type { Tower } from "../types";
import { towerMinimumHealth } from "../game/towerHealthRules";
const ratio = (hp: number, maxHp: number) => maxHp > 0 ? Math.min(1, hp / maxHp) : 0;

export function syncHealthBar(tower: Tower) {
  const pool = tower.healthPool;
  const hp = pool?.hp ?? tower.hp;
  const maxHp = pool?.maxHp ?? tower.finalStats.maxHp;
  const capacity = -towerMinimumHealth(tower);
  const total = maxHp + capacity;
  const reserveWidth = total > 0 ? 42 * capacity / total : 0;
  const normalWidth = 42 - reserveWidth;
  const width = normalWidth * Math.max(0, ratio(hp, maxHp));
  if (tower.hpFill.width !== width) tower.hpFill.width = width;
  tower.hpFill.x = -21 + reserveWidth;
  if (tower.negativeHpBack && tower.negativeHpFill) {
    const remaining = capacity > 0 ? Math.max(0, Math.min(1, (capacity + Math.min(0, hp)) / capacity)) : 0;
    tower.negativeHpBack.setPosition(-21, tower.hpFill.y).setVisible(capacity > 0);
    tower.negativeHpFill.setPosition(-21, tower.hpFill.y).setVisible(capacity > 0);
    tower.negativeHpBack.width = reserveWidth;
    tower.negativeHpFill.width = reserveWidth * remaining;
  }
}
