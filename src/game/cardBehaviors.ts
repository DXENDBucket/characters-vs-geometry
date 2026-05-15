import Phaser from "phaser";
import { CELL_WIDTH } from "../config";
import { makeHealParticles, makeShiftEffect, makeSlashEffect } from "../render/combatEffects";
import type { CardDefinition, CardId, ProjectileKind, Tower } from "../types";
import type { CardBehaviorRuntime, CardReadinessRuntime } from "./combatRuntime";
import { createTowerProjectile, type TowerProjectileSpec } from "./projectiles";
import {
  attackRangeRight,
  bossRect,
  canAttackBoss,
  getAttackTarget,
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
    return cooldownReady(tower, time) && Boolean(definition.healAmount && getHealTarget(tower, runtime.occupied));
  },
  execute: fireHealingPulse
};

export const shiftCardBehavior: CardBehavior = {
  canUse: (tower, _definition, time, runtime) => {
    return cooldownReady(tower, time) && getShiftTargets(tower, runtime.enemies).length > 0;
  },
  execute: fireShiftPulse
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
  D: idleCardBehavior,
  X: idleCardBehavior,
  E: projectileCardBehavior,
  M: projectileCardBehavior,
  W: projectileCardBehavior,
  F: idleCardBehavior,
  G: idleCardBehavior,
  H: healingCardBehavior,
  I: projectileCardBehavior,
  J: projectileCardBehavior,
  K: slashCardBehavior,
  L: shiftCardBehavior
};

function cooldownReady(tower: Tower, time: number) {
  return time >= tower.lastFire + tower.fireRate;
}

function fireHealingPulse(
  tower: Tower,
  definition: CardDefinition,
  runtime: Pick<CardBehaviorRuntime, "scene" | "occupied">
) {
  const target = getHealTarget(tower, runtime.occupied);
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
  if (tower.type === "A") {
    return [makeProjectileSpec("bolt", tower.x + 24, tower.y, tower.lane, 540, definition, 0, 0)];
  }

  if (tower.type === "E" || tower.type === "M" || tower.type === "W") {
    return fanAnglesFor(tower.type).map((angle) =>
      makeProjectileSpec(
        "bolt",
        tower.type === "E" ? tower.x + 24 : tower.x,
        tower.y,
        tower.lane,
        540,
        definition,
        0,
        angle
      )
    );
  }

  if (tower.type === "I") {
    return [
      makeProjectileSpec(
        "star",
        tower.x + 12,
        tower.y,
        tower.lane,
        540,
        definition,
        0,
        0,
        attackRangeRight(tower, definition)
      )
    ];
  }

  if (tower.type === "C" || tower.type === "J") {
    return [
      makeProjectileSpec(
        tower.type === "J" ? "hash" : "shell",
        tower.x + 22,
        tower.y,
        tower.lane,
        390,
        definition,
        definition.splashRadius ?? CELL_WIDTH,
        0,
        tower.type === "J" ? attackRangeRight(tower, definition) : Number.POSITIVE_INFINITY
      )
    ];
  }

  return [];
}

function makeProjectileSpec(
  type: ProjectileKind,
  x: number,
  y: number,
  lane: number,
  speed: number,
  definition: CardDefinition,
  splashRadius: number,
  angleDegrees: number,
  maxX = Number.POSITIVE_INFINITY
): TowerProjectileSpec {
  return {
    type,
    x,
    y,
    lane,
    speed,
    damage: definition.damage ?? 0,
    damageType: definition.damageType ?? "physical",
    splashRadius,
    angleDegrees,
    maxX
  };
}

function fanAnglesFor(type: CardId) {
  if (type === "W") {
    return [-100, -90, -80];
  }
  if (type === "M") {
    return [80, 90, 100];
  }
  return [-10, 0, 10];
}
