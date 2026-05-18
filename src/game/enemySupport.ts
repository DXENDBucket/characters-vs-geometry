import Phaser from "phaser";
import { CELL_HEIGHT, CELL_WIDTH } from "../config";
import { makeHealParticles } from "../render/combatEffects";
import type { CubeBoss, Enemy } from "../types";
import { enemyFamily } from "../registry/enemies";
import { enemyScaleFromHp } from "./enemyBehaviors";
import { applyStatusEffect } from "./statusEffects";
import { isBossInRadius } from "./targeting";

const HEX_ARMOR_RADIUS = CELL_WIDTH * 1.4;
const HEX_ARMOR_BONUS = 80;
const HEX_HEAL_SKILL_MAX = 20;
const HEX_HEAL_SKILL_COST = 20;
const HEX_HEAL_SKILL_REGEN_PER_SECOND = 1;
const HEX_HEAL_RATIO = 0.3;
const CHARGING_HEX_SPEED_MULTIPLIER = 1.5;
const ANGEL_WINGS_SKILL_MAX = 15;
const ANGEL_WINGS_SKILL_COST = 15;
const ANGEL_WINGS_REGEN_PER_SECOND = 1;
const ANGEL_WINGS_DURATION = 3_000;
const ANGEL_WINGS_RANGE_X = CELL_WIDTH * 1.5;
const ANGEL_WINGS_RANGE_Y = CELL_HEIGHT * 1.5;
const ANGEL_WINGS_SPEED_MULTIPLIER = 2;

export function hexArmorBonus(enemies: Enemy[], target: Enemy) {
  return hexArmorStacks(enemies, target) * HEX_ARMOR_BONUS;
}

export function hexBossArmorBonus(enemies: Enemy[], boss: CubeBoss | null) {
  if (!boss) {
    return 0;
  }

  return (
    enemies.filter((enemy) => isHexagon(enemy) && isBossInRadius(boss, enemy.x, enemy.y, HEX_ARMOR_RADIUS)).length *
    HEX_ARMOR_BONUS
  );
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

export function updateAngelPentagons(scene: Phaser.Scene, enemies: Enemy[], seconds: number, time: number) {
  for (const enemy of enemies) {
    if (!isAngelPentagon(enemy)) {
      continue;
    }

    if (time < enemy.skillActiveUntil) {
      continue;
    }

    enemy.skillSp = Math.min(ANGEL_WINGS_SKILL_MAX, enemy.skillSp + seconds * ANGEL_WINGS_REGEN_PER_SECOND);
    if (enemy.skillSp >= ANGEL_WINGS_SKILL_MAX) {
      triggerAngelWings(scene, enemies, enemy, time);
    }
  }
}

export function chargingHexSpeedMultiplier(enemies: Enemy[], target: Enemy) {
  return enemies.some((enemy) => {
    return enemyFamily(enemy.kind) === "chargingHexagon" && enemy.lane === target.lane && enemy.x < target.x;
  })
    ? CHARGING_HEX_SPEED_MULTIPLIER
    : 1;
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

function isAngelPentagon(enemy: Enemy) {
  return enemyFamily(enemy.kind) === "angelPentagon";
}

function triggerAngelWings(scene: Phaser.Scene, enemies: Enemy[], caster: Enemy, time: number) {
  caster.skillSp = Math.max(0, caster.skillSp - ANGEL_WINGS_SKILL_COST);
  caster.skillActiveUntil = time + ANGEL_WINGS_DURATION;
  for (const target of enemies) {
    if (Math.abs(target.x - caster.x) > ANGEL_WINGS_RANGE_X || Math.abs(target.y - caster.y) > ANGEL_WINGS_RANGE_Y) {
      continue;
    }

    applyStatusEffect(target, "flying", ANGEL_WINGS_DURATION, time, ANGEL_WINGS_SPEED_MULTIPLIER, true);
    makeWingPulse(scene, target.x, target.y);
  }
}

function makeWingPulse(scene: Phaser.Scene, x: number, y: number) {
  const halo = scene.add.ellipse(x, y - 28, 34, 10, 0x000000, 0).setStrokeStyle(2, 0xf5f5f5, 0.9).setDepth(109);
  const lift = scene.add.graphics().setDepth(108);
  lift.lineStyle(2, 0xf5f5f5, 0.65);
  lift.lineBetween(x - 18, y - 8, x - 34, y - 22);
  lift.lineBetween(x + 18, y - 8, x + 34, y - 22);
  scene.tweens.add({
    targets: [halo, lift],
    y: "-=18",
    alpha: 0,
    duration: 320,
    ease: "Quad.easeOut",
    onComplete: () => {
      halo.destroy();
      lift.destroy();
    }
  });
}
