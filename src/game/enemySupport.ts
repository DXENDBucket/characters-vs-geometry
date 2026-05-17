import Phaser from "phaser";
import { CELL_WIDTH } from "../config";
import { makeHealParticles } from "../render/combatEffects";
import type { Enemy } from "../types";
import { enemyFamily } from "../registry/enemies";
import { enemyScaleFromHp } from "./enemyBehaviors";

const HEX_ARMOR_RADIUS = CELL_WIDTH * 1.4;
const HEX_ARMOR_BONUS = 200;
const HEX_HEAL_SKILL_MAX = 20;
const HEX_HEAL_SKILL_COST = 20;
const HEX_HEAL_SKILL_REGEN_PER_SECOND = 1;
const HEX_HEAL_RATIO = 0.3;

export function hexArmorBonus(enemies: Enemy[], target: Enemy) {
  return hexArmorStacks(enemies, target) * HEX_ARMOR_BONUS;
}

export function syncHexArmorAuras(enemies: Enemy[], time: number) {
  for (const enemy of enemies) {
    const stacks = hexArmorStacks(enemies, enemy);
    enemy.armorIcon.setVisible(stacks > 0);
    if (stacks > 0) {
      enemy.armorIcon.setY(-38 + Math.sin(time / 110) * 2);
    }
  }
}

export function updateHexHealers(scene: Phaser.Scene, enemies: Enemy[], seconds: number) {
  for (const enemy of enemies) {
    if (isHexagon(enemy)) {
      enemy.skillSp = Math.min(HEX_HEAL_SKILL_MAX, enemy.skillSp + seconds * HEX_HEAL_SKILL_REGEN_PER_SECOND);
    }
    tryUseHexHeal(scene, enemies, enemy);
  }
}

function tryUseHexHeal(scene: Phaser.Scene, enemies: Enemy[], healer: Enemy) {
  if (!isHexagon(healer) || healer.skillSp < HEX_HEAL_SKILL_MAX) {
    return;
  }

  const target = enemies
    .filter((enemy) => {
      return enemy.hp < enemy.maxHp && Math.hypot(enemy.x - healer.x, enemy.y - healer.y) <= HEX_ARMOR_RADIUS;
    })
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (!target) {
    return;
  }

  healer.skillSp = Math.max(0, healer.skillSp - HEX_HEAL_SKILL_COST);
  const previousHp = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + healer.maxHp * HEX_HEAL_RATIO);
  if (target.hp <= previousHp) {
    return;
  }

  target.shape.setScale(enemyScaleFromHp(target.hp / target.maxHp));
  makeHealParticles(scene, target.x, target.y);
}

function hexArmorStacks(enemies: Enemy[], target: Enemy) {
  return enemies.filter((enemy) => isHexagon(enemy) && Math.hypot(enemy.x - target.x, enemy.y - target.y) <= HEX_ARMOR_RADIUS).length;
}

function isHexagon(enemy: Enemy) {
  return enemyFamily(enemy.kind) === "hexagon";
}
