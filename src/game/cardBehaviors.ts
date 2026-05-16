import Phaser from "phaser";
import { CELL_WIDTH } from "../config";
import { makeHealParticles, makeShiftEffect, makeSlashEffect } from "../render/combatEffects";
import type { CardDefinition, CardId, Tower } from "../types";
import {
  getProjectilePattern,
  muzzleFaceOffsets,
  type MuzzlePoint,
  type ProjectilePatternConfig
} from "./cardAttackConfigs";
import type { CardBehaviorRuntime, CardReadinessRuntime } from "./combatRuntime";
import { createTowerProjectile, type TowerProjectileSpec } from "./projectiles";
import {
  attackRangeRight,
  bossRect,
  canAttackBoss,
  getAttackTarget,
  getBlockedEnemies,
  getHealTarget,
  getShiftTargets,
  hasAttackTarget
} from "./targeting";
import { syncTowerHpBar } from "./towers";

export interface CardBehavior {
  canUse: (
    tower: Tower,
    definition: CardDefinition,
    time: number,
    runtime: CardReadinessRuntime
  ) => boolean;
  execute: (tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) => void;
}

export const idleCardBehavior: CardBehavior = {
  canUse: () => false,
  execute: () => undefined
};

export const projectileCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.damage && hasAttackTarget(tower, definition, runtime.enemies, runtime.boss));
  },
  execute: (tower, definition, runtime) => {
    for (const spec of towerProjectileSpecs(tower, definition)) {
      runtime.projectiles.push(createTowerProjectile(runtime.scene, spec));
    }
  }
};

export const healingCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.healAmount && getHealTarget(tower, definition, runtime.occupied));
  },
  execute: fireHealingPulse
};

export const shiftCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime) => {
    return cooldownReady(tower, time) && getShiftTargets(tower, runtime.enemies).length > 0;
  },
  execute: fireShiftPulse
};

export const blockedPushCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime) => {
    return cooldownReady(tower, time) && getBlockedEnemies(tower, runtime.towers, runtime.enemies).length > 0;
  },
  execute: fireBlockedPushPulse
};

export const slowAuraCardBehavior: CardBehavior = {
  canUse: (tower, definition, time) => {
    return cooldownReady(tower, time) && Boolean(definition.selfDamage);
  },
  execute: (tower, definition, runtime) => {
    runtime.damageTower(tower, definition.selfDamage ?? 700, definition.selfDamageType ?? "true");
  }
};

export const slashCardBehavior: CardBehavior = {
  canUse: (tower, definition, time, runtime) => {
    return cooldownReady(tower, time) && Boolean(definition.damage && hasAttackTarget(tower, definition, runtime.enemies, runtime.boss));
  },
  execute: fireSlash
};

export const cardBehaviorsById: Record<CardId, CardBehavior> = {
  A: projectileCardBehavior,
  B: idleCardBehavior,
  C: projectileCardBehavior,
  c: idleCardBehavior,
  D: idleCardBehavior,
  O: idleCardBehavior,
  R: idleCardBehavior,
  X: idleCardBehavior,
  E: projectileCardBehavior,
  M: projectileCardBehavior,
  W: projectileCardBehavior,
  F: idleCardBehavior,
  G: idleCardBehavior,
  H: healingCardBehavior,
  I: projectileCardBehavior,
  Q: projectileCardBehavior,
  J: projectileCardBehavior,
  K: slashCardBehavior,
  L: shiftCardBehavior,
  N: blockedPushCardBehavior,
  T: slowAuraCardBehavior,
  P: healingCardBehavior,
  Y: idleCardBehavior
};

function cooldownReady(tower: Tower, time: number) {
  return time >= tower.lastFire + tower.fireRate;
}

function fireHealingPulse(
  tower: Tower,
  definition: CardDefinition,
  runtime: Pick<CardBehaviorRuntime, "scene" | "occupied">
) {
  const target = getHealTarget(tower, definition, runtime.occupied);
  if (!target) {
    return;
  }

  healTower(runtime.scene, target, definition.healAmount ?? 60);
}

function fireShiftPulse(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const targets = getShiftTargets(tower, runtime.enemies);
  if (targets.length === 0) {
    return;
  }

  for (const target of targets) {
    const previousY = target.y;
    target.lane = tower.lane;
    target.y = tower.y;
    target.body.setDepth(60 + target.lane);
    target.body.setPosition(target.x, target.y);
    makeShiftEffect(runtime.scene, target.x, previousY, target.x, target.y);
  }
  for (let index = 0; index < targets.length; index += 1) {
    if (!runtime.towers.includes(tower)) {
      break;
    }
    runtime.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
  }
}

function fireBlockedPushPulse(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const targets = getBlockedEnemies(tower, runtime.towers, runtime.enemies);
  if (targets.length === 0) {
    return;
  }

  const shiftDistance = (definition.shiftCells ?? 4) * CELL_WIDTH;
  for (const target of targets) {
    const previousX = target.x;
    target.x -= shiftDistance;
    target.body.setPosition(target.x, target.y);
    makeShiftEffect(runtime.scene, previousX, target.y, target.x, target.y);
  }

  for (let index = 0; index < targets.length; index += 1) {
    if (!runtime.towers.includes(tower)) {
      break;
    }
    runtime.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
  }
}

function fireSlash(tower: Tower, definition: CardDefinition, runtime: CardBehaviorRuntime) {
  const damage = definition.damage ?? 0;
  const damageType = definition.damageType ?? "physical";
  const target = getAttackTarget(tower, definition, runtime.enemies);
  if (target) {
    makeSlashEffect(runtime.scene, target.x, target.y, damageType);
    runtime.damageEnemy(target, damage, damageType);
    return;
  }

  const boss = runtime.boss;
  if (!boss || !canAttackBoss(tower, definition, boss)) {
    return;
  }

  const rect = bossRect(boss);
  const x = Phaser.Math.Clamp(tower.x + CELL_WIDTH, rect.left, rect.right);
  const y = Phaser.Math.Clamp(tower.y, rect.top, rect.bottom);
  makeSlashEffect(runtime.scene, x, y, damageType);
  runtime.damageBoss(damage, damageType);
}

function healTower(scene: Phaser.Scene, tower: Tower, amount: number) {
  const previousHp = tower.hp;
  tower.hp = Math.min(tower.maxHp, tower.hp + amount);
  if (tower.hp <= previousHp) {
    return;
  }

  syncTowerHpBar(tower);
  makeHealParticles(scene, tower.x, tower.y);
}

function towerProjectileSpecs(tower: Tower, definition: CardDefinition): TowerProjectileSpec[] {
  const pattern = getProjectilePattern(tower.type);
  if (!pattern) {
    return [];
  }

  return pattern.shots.map((shot) => {
    const muzzle = projectileMuzzlePoint(tower, shot.muzzle ?? pattern.defaultMuzzle);
    return makeProjectileSpec(
      pattern,
      muzzle.x,
      muzzle.y,
      tower.lane,
      definition,
      shot.angleDegrees,
      projectileMaxX(tower, definition, pattern)
    );
  });
}

function makeProjectileSpec(
  pattern: ProjectilePatternConfig,
  x: number,
  y: number,
  lane: number,
  definition: CardDefinition,
  angleDegrees: number,
  maxX = Number.POSITIVE_INFINITY
): TowerProjectileSpec {
  return {
    type: pattern.projectileKind,
    x,
    y,
    lane,
    speed: pattern.speed,
    damage: definition.damage ?? 0,
    damageType: definition.damageType ?? "physical",
    debuff: definition.projectileDebuff,
    debuffDuration: definition.projectileDebuffDuration,
    splashRadius: projectileSplashRadius(pattern, definition),
    angleDegrees,
    maxX
  };
}

function projectileMuzzlePoint(tower: Tower, muzzle: MuzzlePoint) {
  const faceOffset = muzzleFaceOffsets[muzzle.face];
  return {
    x: tower.x + faceOffset.x + (muzzle.offsetX ?? 0),
    y: tower.y + faceOffset.y + (muzzle.offsetY ?? 0)
  };
}

function projectileSplashRadius(pattern: ProjectilePatternConfig, definition: CardDefinition) {
  if (pattern.splashRadius === "definition") {
    return definition.splashRadius ?? CELL_WIDTH;
  }
  return pattern.splashRadius ?? 0;
}

function projectileMaxX(tower: Tower, definition: CardDefinition, pattern: ProjectilePatternConfig) {
  if (pattern.maxTravelArea) {
    return attackRangeRight(tower, definition);
  }

  return Number.POSITIVE_INFINITY;
}
