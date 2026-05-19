import Phaser from "phaser";
import { CELL_HEIGHT, CELL_WIDTH } from "../config";
import { makeHealParticles } from "../render/combatEffects";
import type { CubeBoss, Enemy, SkillState } from "../types";
import { enemyFamily } from "../registry/enemies";
import { enemyScaleFromHp } from "./enemyBehaviors";
import { createEnemySkillRegistry, enemySkillDefinitions, type EnemySkillRuntime } from "./enemySkillRegistry";
import { updateRegisteredSkills } from "./skillRegistry";
import { gainSkillSp, getEnemySkillState, isSkillReady, spendSkillSp } from "./skillState";
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

const enemySkillRegistry = createEnemySkillRegistry({
  updateHexHeal,
  updateAngelWings
});

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

export function chargingHexSpeedMultiplier(enemies: Enemy[], target: Enemy) {
  return enemies.some((enemy) => {
    return enemyFamily(enemy.kind) === "chargingHexagon" && enemy.lane === target.lane && enemy.x < target.x;
  })
    ? CHARGING_HEX_SPEED_MULTIPLIER
    : 1;
}

export function updateEnemySkills(runtime: EnemySkillRuntime, seconds: number, time: number) {
  updateRegisteredSkills(
    [...runtime.enemies],
    (enemy) => enemySkillDefinitions(enemySkillRegistry, enemy),
    runtime,
    seconds,
    time
  );
}

function updateHexHeal(enemy: Enemy, state: SkillState, seconds: number, _time: number, runtime: EnemySkillRuntime) {
  gainSkillSp(state, seconds * HEX_HEAL_SKILL_REGEN_PER_SECOND, HEX_HEAL_SKILL_MAX);
  tryUseHexHeal(runtime.scene, runtime.enemies, enemy, state);
}

function updateAngelWings(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (time < state.activeUntil) {
    return;
  }

  gainSkillSp(state, seconds * ANGEL_WINGS_REGEN_PER_SECOND, ANGEL_WINGS_SKILL_MAX);
  if (isSkillReady(state, ANGEL_WINGS_SKILL_MAX)) {
    triggerAngelWings(runtime.scene, runtime.enemies, enemy, time, state);
  }
}

function tryUseHexHeal(scene: Phaser.Scene, enemies: Enemy[], healer: Enemy, skill: SkillState) {
  if (!isSkillReady(skill, HEX_HEAL_SKILL_MAX)) {
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

  spendSkillSp(skill, HEX_HEAL_SKILL_COST);
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

export function triggerAngelWings(
  scene: Phaser.Scene,
  enemies: Enemy[],
  caster: Enemy,
  time: number,
  skill = getEnemySkillState(caster, "wings")
) {
  spendSkillSp(skill, ANGEL_WINGS_SKILL_COST);
  skill.activeUntil = time + ANGEL_WINGS_DURATION;
  for (const target of enemies) {
    if (Math.abs(target.x - caster.x) > ANGEL_WINGS_RANGE_X || Math.abs(target.y - caster.y) > ANGEL_WINGS_RANGE_Y) {
      continue;
    }

    applyStatusEffect(target, "flying", ANGEL_WINGS_DURATION, time, ANGEL_WINGS_SPEED_MULTIPLIER, true);
    makeWingPulse(scene, target.x, target.y);
  }
}

export function makeWingPulse(scene: Phaser.Scene, x: number, y: number) {
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
