import Phaser from "phaser";
import { BOARD_X, CELL_WIDTH, COLUMNS, LANES, palette } from "../config";
import { getCardDefinition } from "../registry/cards";
import { enemyIsBossCompanion } from "../registry/enemies";
import {
  damageEffectColor,
  damageEffectTextColor,
  makeEnemyHitShards,
  makeHitShards,
  makeReflectFlash,
  makeShellBurst,
  makeShiftEffect,
  makeSpellMortarImpact,
  makeStasisEffect
} from "../render/combatEffects";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower } from "../types";
import {
  createMortarProjectile,
  createReflectedProjectile,
  isEnemyProjectileOutOfBounds,
  isTowerProjectileOutOfBounds
} from "./projectiles";
import { enemyIsBurrowed, enemyIsHighFlying } from "./enemyBehaviors";
import { forEachInitial, forEachSnapshot } from "./iteration";
import { movementSpeedMultiplier, slowAuraSources } from "./slowAura";
import { enemyIsSolarBomb } from "./solarBomb";
import { applyStatusEffect } from "./statusEffects";
import {
  bossPartAtPoint,
  bossPartDistanceSqToPoint,
  bossPartInRadius,
  bossPartInRect,
  gridCellKey,
  pointInTowerBounds
} from "./targeting";
import { towerDamageType, towerFacingDirection } from "./towers";

export interface ProjectileRuntime {
  scene: Phaser.Scene;
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  enemies: Enemy[];
  towers: Tower[];
  occupied: Map<string, Tower>;
  battleTime: number;
  getBoss: () => CubeBoss | null;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType, sourceTower?: Tower) => void;
  damageBoss: (damage: number, damageType: DamageType, targetPart?: CubeBoss) => void;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
}

const enemyMortarHitTowersBuffer: Tower[] = [];
const enemyMortarReflectorsBuffer: Tower[] = [];
const bossRadiusFalloffResult: { falloff: number; part: CubeBoss | undefined } = { falloff: 0, part: undefined };
type DirectProjectileTargets = Enemy[][];
type EnemyProjectileTransientTargets = Tower[][];
const directProjectileTargetBuffers: DirectProjectileTargets = Array.from({ length: LANES }, () => []);
const enemyProjectileTransientTargetBuffers: EnemyProjectileTransientTargets = Array.from({ length: LANES }, () => []);
const emptyEnemyProjectileTransientTargets: EnemyProjectileTransientTargets = Array.from({ length: LANES }, () => []);

export function updateTowerProjectiles(runtime: ProjectileRuntime, seconds: number) {
  if (runtime.projectiles.length === 0) {
    return;
  }

  const slowSources = slowAuraSources(runtime.towers);
  let directTargets: DirectProjectileTargets | undefined;
  const getDirectTargets = () => {
    directTargets ??= buildDirectProjectileTargets(runtime.enemies);
    return directTargets;
  };
  const invalidateDirectTargetsIfNeeded = (enemy: Enemy, previousEnemyCount: number) => {
    if (!enemy.inPlay || runtime.enemies.length !== previousEnemyCount) {
      directTargets = undefined;
    }
  };

  forEachInitial(runtime.projectiles, (projectile) => {
    if (projectile.type === "chevron") {
      updateHomingProjectile(runtime, projectile, seconds);
    }

    const speedMultiplier = movementSpeedMultiplier(runtime.towers, projectile.x, projectile.y, slowSources);
    const nextX = projectile.x + projectile.vx * seconds * speedMultiplier;
    const reachedLimitX = projectile.limitDirection < 0 ? nextX <= projectile.maxX : nextX >= projectile.maxX;
    projectile.x = reachedLimitX ? projectile.maxX : nextX;
    projectile.y += projectile.vy * seconds * speedMultiplier;
    projectile.body.setPosition(projectile.x, projectile.y);

    const hit =
      projectile.type === "chevron"
        ? getHomingProjectileHit(projectile)
        : findDirectProjectileHit(getDirectTargets(), projectile);
    const hitBoss =
      !hit && projectile.type !== "chevron"
        ? bossPartAtPoint(runtime.getBoss(), projectile.x, projectile.y)
        : undefined;

    if (!hit && !hitBoss) {
      if (isTowerProjectileOutOfBounds(projectile, reachedLimitX)) {
        removeProjectile(runtime.projectiles, projectile);
      }
      return;
    }

    if (projectile.type === "bolt" || projectile.type === "star" || projectile.type === "dollar" || projectile.type === "chevron") {
      if (hit) {
        makeHitShards(runtime.scene, hit.x, hit.y, projectile.damageType);
        const previousEnemyCount = runtime.enemies.length;
        runtime.damageEnemy(hit, projectile.damage, projectile.damageType, projectile.sourceTower);
        invalidateDirectTargetsIfNeeded(hit, previousEnemyCount);
        if (hit.inPlay) {
          applyProjectileDebuff(runtime.scene, projectile, hit, runtime.battleTime);
        }
      } else {
        makeHitShards(runtime.scene, projectile.x, projectile.y, projectile.damageType);
        runtime.damageBoss(projectile.damage, projectile.damageType, hitBoss);
      }
    } else {
      const burstX = hit ? hit.x : projectile.x;
      const burstY = hit ? hit.y : projectile.y;
      makeShellBurst(runtime.scene, burstX, burstY, projectile.splashRadius, projectile.damageType);
      forEachSnapshot(runtime.enemies, (enemy) => {
        const dx = enemy.x - burstX;
        const dy = enemy.y - burstY;
        const falloff = radiusFalloffFromDistanceSq(dx * dx + dy * dy, projectile.splashRadius);
        if (falloff <= 0 || enemyIsHighFlying(enemy)) {
          return;
        }

        const previousEnemyCount = runtime.enemies.length;
        runtime.damageEnemy(enemy, projectile.damage * falloff, projectile.damageType, projectile.sourceTower);
        invalidateDirectTargetsIfNeeded(enemy, previousEnemyCount);
        if (enemy.inPlay) {
          applyProjectileDebuff(runtime.scene, projectile, enemy, runtime.battleTime);
        }
      });
      const bossFalloff = bossRadiusFalloff(runtime.getBoss(), burstX, burstY, projectile.splashRadius);
      if (bossFalloff.falloff > 0) {
        runtime.damageBoss(projectile.damage * bossFalloff.falloff, projectile.damageType, bossFalloff.part);
      }
    }

    removeProjectile(runtime.projectiles, projectile);
  });
}

export function updateEnemyProjectiles(runtime: ProjectileRuntime, seconds: number) {
  if (runtime.enemyProjectiles.length === 0) {
    return;
  }

  const slowSources = slowAuraSources(runtime.towers);
  const transientTargets =
    runtime.towers.length === runtime.occupied.size
      ? emptyEnemyProjectileTransientTargets
      : buildEnemyProjectileTransientTargets(runtime.towers);
  forEachInitial(runtime.enemyProjectiles, (projectile) => {
    projectile.x += projectile.vx * seconds * movementSpeedMultiplier(runtime.towers, projectile.x, projectile.y, slowSources);
    projectile.body.setPosition(projectile.x, projectile.y);

    const hit = findEnemyProjectileHitTower(runtime.occupied, projectile, transientTargets);

    if (hit) {
      if (hit.type === "N") {
        const previousX = projectile.x;
        shiftEnemyProjectile(projectile, hit);
        makeShiftEffect(runtime.scene, previousX, projectile.y, projectile.x, projectile.y);
        projectile.body.setPosition(projectile.x, projectile.y);
        damageShiftTowerSelf(runtime, hit);
        if (isEnemyProjectileOutOfBounds(projectile)) {
          removeEnemyProjectile(runtime.enemyProjectiles, projectile);
        }
        return;
      }

      makeEnemyHitShards(runtime.scene, projectile.x, projectile.y);
      const reflectsProjectile = hit.reflectProjectiles;
      runtime.damageTower(hit, projectile.damage, projectile.damageType);
      if (reflectsProjectile) {
        runtime.projectiles.push(
          createReflectedProjectile(runtime.scene, projectile, towerDamageType(hit, projectile.damageType, runtime.battleTime), hit)
        );
        makeReflectFlash(runtime.scene, projectile.x, projectile.y);
      }
      removeEnemyProjectile(runtime.enemyProjectiles, projectile);
      return;
    }

    if (isEnemyProjectileOutOfBounds(projectile)) {
      removeEnemyProjectile(runtime.enemyProjectiles, projectile);
    }
  });
}

export function updateMortarProjectiles(runtime: ProjectileRuntime, seconds: number) {
  if (runtime.mortarProjectiles.length === 0) {
    return;
  }

  const slowSources = slowAuraSources(runtime.towers);
  forEachInitial(runtime.mortarProjectiles, (projectile) => {
    syncMortarTarget(runtime, projectile);
    const speedMultiplier = movementSpeedMultiplier(runtime.towers, projectile.x, projectile.y, slowSources);
    projectile.progress = Math.min(1, projectile.progress + (seconds * 1000 * speedMultiplier) / projectile.duration);
    positionMortarProjectile(projectile);

    if (projectile.progress < 1) {
      return;
    }

    if (projectile.owner === "enemy") {
      detonateEnemyMortar(runtime, projectile);
    } else {
      detonateTowerMortar(runtime, projectile);
    }
    removeMortarProjectile(runtime.mortarProjectiles, projectile);
  });
}

function shiftEnemyProjectile(projectile: EnemyProjectile, tower: Tower) {
  projectile.x += projectileShiftDirection(tower) * projectileShiftDistance(tower);
}

function projectileShiftDistance(tower: Tower) {
  const definition = getCardDefinition(tower.type);
  return (definition.shiftCells ?? 4) * CELL_WIDTH;
}

function projectileShiftDirection(tower: Tower) {
  return -towerFacingDirection(tower);
}

function removeProjectile(projectiles: Projectile[], projectile: Projectile) {
  Phaser.Utils.Array.Remove(projectiles, projectile);
  projectile.body.destroy();
}

function enemyProjectileHitRadius(enemy: Enemy) {
  return enemyIsBossCompanion(enemy.kind) ? CELL_WIDTH * 0.475 : 22;
}

function canEnemyBeDirectlyHit(enemy: Enemy) {
  return enemy.inPlay && !enemyIsBurrowed(enemy) && !enemyIsHighFlying(enemy);
}

function updateHomingProjectile(runtime: ProjectileRuntime, projectile: Projectile, seconds: number) {
  const target = resolveHomingTarget(runtime, projectile);
  const currentSpeed = projectile.speed ?? Math.hypot(projectile.vx, projectile.vy);
  const maxSpeed = projectile.maxSpeed ?? currentSpeed;
  const acceleration = projectile.acceleration ?? 0;
  const nextSpeed = Math.min(maxSpeed, currentSpeed + acceleration * seconds);
  projectile.speed = nextSpeed;

  if (target) {
    const angle = Math.atan2(target.y - projectile.y, target.x - projectile.x);
    projectile.vx = Math.cos(angle) * nextSpeed;
    projectile.vy = Math.sin(angle) * nextSpeed;
    projectile.body.rotation = angle;
    return;
  }

  if (currentSpeed <= 0) {
    projectile.vx = nextSpeed;
    projectile.vy = 0;
  } else {
    const speedScale = nextSpeed / currentSpeed;
    projectile.vx *= speedScale;
    projectile.vy *= speedScale;
  }
  projectile.body.rotation = Math.atan2(projectile.vy, projectile.vx);
}

function resolveHomingTarget(runtime: ProjectileRuntime, projectile: Projectile) {
  const currentTarget = projectile.targetEnemy;
  if (currentTarget?.inPlay && canEnemyBeDirectlyHit(currentTarget)) {
    return currentTarget;
  }

  const nextTarget = closestDirectlyHittableEnemyTo(runtime.enemies, projectile.x, projectile.y);
  projectile.targetEnemy = nextTarget;
  return nextTarget;
}

function getHomingProjectileHit(projectile: Projectile) {
  const target = projectile.targetEnemy;
  if (!target || !canEnemyBeDirectlyHit(target)) {
    return undefined;
  }

  return projectileHitsEnemy(projectile.x, projectile.y, target) ? target : undefined;
}

function buildDirectProjectileTargets(enemies: Enemy[]): DirectProjectileTargets {
  for (const targets of directProjectileTargetBuffers) {
    targets.length = 0;
  }

  for (const enemy of enemies) {
    if (!canEnemyBeDirectlyHit(enemy)) {
      continue;
    }

    if (enemyCanOverlapEveryDirectProjectileLane(enemy)) {
      for (const targets of directProjectileTargetBuffers) {
        targets.push(enemy);
      }
      continue;
    }

    const laneTargets = directProjectileTargetBuffers[enemy.lane];
    if (laneTargets) {
      laneTargets.push(enemy);
    }
  }

  return directProjectileTargetBuffers;
}

function findDirectProjectileHit(targets: DirectProjectileTargets, projectile: Projectile) {
  for (const enemy of targets[projectile.lane] ?? []) {
    if (canEnemyBeDirectlyHit(enemy) && projectileHitsEnemy(projectile.x, projectile.y, enemy)) {
      return enemy;
    }
  }
  return undefined;
}

function enemyCanOverlapEveryDirectProjectileLane(enemy: Enemy) {
  return enemyIsSolarBomb(enemy) || enemyIsBossCompanion(enemy.kind);
}

function closestDirectlyHittableEnemyTo(enemies: Enemy[], x: number, y: number) {
  let closest: Enemy | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (!canEnemyBeDirectlyHit(enemy)) {
      continue;
    }

    const distance = distanceSq(enemy.x, enemy.y, x, y);
    if (distance < closestDistance) {
      closest = enemy;
      closestDistance = distance;
    }
  }
  return closest;
}

function projectileHitsEnemy(x: number, y: number, enemy: Enemy) {
  const radius = enemyProjectileHitRadius(enemy);
  return distanceSq(enemy.x, enemy.y, x, y) < radius * radius;
}

function buildEnemyProjectileTransientTargets(towers: Tower[]): EnemyProjectileTransientTargets {
  for (const targets of enemyProjectileTransientTargetBuffers) {
    targets.length = 0;
  }

  for (const tower of towers) {
    if (tower.transient && tower.inPlay) {
      enemyProjectileTransientTargetBuffers[tower.lane]?.push(tower);
    }
  }

  return enemyProjectileTransientTargetBuffers;
}

function findEnemyProjectileHitTower(
  occupied: Map<string, Tower>,
  projectile: EnemyProjectile,
  transientTargets: EnemyProjectileTransientTargets
) {
  const column = Math.floor((projectile.x - BOARD_X) / CELL_WIDTH);
  const tower = firstPointHitOccupiedTower(occupied, projectile.sourceLane, column, projectile.x, projectile.y);
  if (tower) {
    return tower;
  }

  for (const candidate of transientTargets[projectile.sourceLane] ?? []) {
    if (candidate.inPlay && pointInTowerBounds(candidate, projectile.x, projectile.y)) {
      return candidate;
    }
  }

  return undefined;
}

function firstPointHitOccupiedTower(
  occupied: Map<string, Tower>,
  lane: number,
  column: number,
  x: number,
  y: number
) {
  const primary = occupiedTowerAtColumn(occupied, lane, column);
  const previous = occupiedTowerAtColumn(occupied, lane, column - 1);
  const primaryHit = primary && pointInTowerBounds(primary, x, y) ? primary : undefined;
  const previousHit = previous && pointInTowerBounds(previous, x, y) ? previous : undefined;
  if (!primaryHit) {
    return previousHit;
  }

  if (!previousHit) {
    return primaryHit;
  }

  return previousHit.placedOrder <= primaryHit.placedOrder ? previousHit : primaryHit;
}

function occupiedTowerAtColumn(occupied: Map<string, Tower>, lane: number, column: number) {
  return column >= 0 && column < COLUMNS ? occupied.get(gridCellKey(lane, column)) : undefined;
}

function removeEnemyProjectile(projectiles: EnemyProjectile[], projectile: EnemyProjectile) {
  Phaser.Utils.Array.Remove(projectiles, projectile);
  projectile.body.destroy();
}

function radiusFalloffFromDistanceSq(distanceSq: number, radius: number) {
  if (radius <= 0) {
    return 0;
  }

  const radiusSq = radius * radius;
  if (distanceSq > radiusSq) {
    return 0;
  }

  return 1 - Math.sqrt(distanceSq) / radius;
}

function bossRadiusFalloff(boss: CubeBoss | null, x: number, y: number, radius: number) {
  bossRadiusFalloffResult.falloff = 0;
  bossRadiusFalloffResult.part = undefined;
  if (!boss) {
    return bossRadiusFalloffResult;
  }

  updateBossRadiusFalloffResult(boss, x, y, radius);
  for (const part of boss.octahedronCopies ?? []) {
    updateBossRadiusFalloffResult(part, x, y, radius);
  }
  return bossRadiusFalloffResult;
}

function updateBossRadiusFalloffResult(part: CubeBoss, x: number, y: number, radius: number) {
  const falloff = radiusFalloffFromDistanceSq(bossPartDistanceSqToPoint(part, x, y), radius);
  if (falloff > bossRadiusFalloffResult.falloff) {
    bossRadiusFalloffResult.falloff = falloff;
    bossRadiusFalloffResult.part = part;
  }
}

function syncMortarTarget(runtime: ProjectileRuntime, projectile: MortarProjectile) {
  if (projectile.targetEnemy?.inPlay) {
    projectile.targetX = projectile.targetEnemy.x;
    projectile.targetY = projectile.targetEnemy.y;
    return;
  }

  if (projectile.targetTower?.inPlay) {
    const targetTower = projectile.targetTower;
    if (projectile.owner === "enemy" && targetTower.type === "N") {
      if (!projectile.shiftSelfDamageApplied) {
        projectile.shiftSelfDamageApplied = true;
        damageShiftTowerSelf(runtime, targetTower);
      }
      projectile.targetX = targetTower.x + projectileShiftDirection(targetTower) * projectileShiftDistance(targetTower);
      projectile.targetY = targetTower.y;
      return;
    }

    projectile.targetX = targetTower.x;
    projectile.targetY = targetTower.y;
  }
}

function damageShiftTowerSelf(runtime: ProjectileRuntime, tower: Tower) {
  const definition = getCardDefinition(tower.type);
  const damage = definition.selfDamage ?? 0;
  if (damage <= 0) {
    return;
  }

  runtime.damageTower(tower, damage, definition.selfDamageType ?? "true");
}

function positionMortarProjectile(projectile: MortarProjectile) {
  const progress = projectile.progress;
  const inverse = 1 - progress;
  const distance = Math.hypot(projectile.targetX - projectile.fromX, projectile.targetY - projectile.fromY);
  const controlX = (projectile.fromX + projectile.targetX) / 2;
  const controlY = Math.min(projectile.fromY, projectile.targetY) - 420 - distance * 0.4;

  projectile.x =
    inverse * inverse * projectile.fromX + 2 * inverse * progress * controlX + progress * progress * projectile.targetX;
  projectile.y =
    inverse * inverse * projectile.fromY + 2 * inverse * progress * controlY + progress * progress * projectile.targetY;
  projectile.body.setPosition(projectile.x, projectile.y);
  projectile.body.rotation = progress * Math.PI * 1.4;
  projectile.body.setScale(1 + Math.sin(progress * Math.PI) * 0.26);
}

function detonateEnemyMortar(runtime: ProjectileRuntime, projectile: MortarProjectile) {
  makeSpellMortarImpact(runtime.scene, projectile.targetX, projectile.targetY, projectile.rangeX, projectile.rangeY, {
    color: palette.enemyShot,
    marker: projectile.marker ?? "shell",
    markerText: projectile.markerText,
    markerTextColor: projectile.markerTextColor
  });

  const hitTowers = enemyMortarHitTowersBuffer;
  const reflectors = enemyMortarReflectorsBuffer;
  hitTowers.length = 0;
  reflectors.length = 0;
  const targetX = projectile.targetX;
  const targetY = projectile.targetY;
  const rangeX = projectile.rangeX;
  const rangeY = projectile.rangeY;

  try {
    for (const tower of runtime.towers) {
      if (Math.abs(tower.x - targetX) <= rangeX && Math.abs(tower.y - targetY) <= rangeY) {
        hitTowers.push(tower);
        if (tower.reflectProjectiles) {
          reflectors.push(tower);
        }
      }
    }

    for (const tower of hitTowers) {
      runtime.damageTower(tower, projectile.damage, projectile.damageType);
    }

    const sourceEnemy = projectile.sourceEnemy;
    if (!sourceEnemy?.inPlay) {
      return;
    }

    for (const tower of reflectors) {
      const reflectedDamageType = towerDamageType(tower, projectile.damageType, runtime.battleTime);
      runtime.mortarProjectiles.push(
        createMortarProjectile(runtime.scene, {
          owner: "tower",
          fromX: tower.x,
          fromY: tower.y,
          targetX: sourceEnemy.x,
          targetY: sourceEnemy.y,
          damage: projectile.damage,
          damageType: reflectedDamageType,
          sourceTower: tower,
          rangeX: projectile.rangeX,
          rangeY: projectile.rangeY,
          marker: projectile.marker,
          markerText: projectile.markerText,
          markerTextColor: projectile.marker === "text" ? damageEffectTextColor(reflectedDamageType) : undefined,
          targetEnemy: sourceEnemy
        })
      );
      makeReflectFlash(runtime.scene, tower.x, tower.y);
    }
  } finally {
    hitTowers.length = 0;
    reflectors.length = 0;
  }
}

function detonateTowerMortar(runtime: ProjectileRuntime, projectile: MortarProjectile) {
  makeSpellMortarImpact(runtime.scene, projectile.targetX, projectile.targetY, projectile.rangeX, projectile.rangeY, {
    color: damageEffectColor(projectile.damageType),
    marker: projectile.marker ?? "shell",
    markerText: projectile.markerText,
    markerTextColor: projectile.marker === "text" ? damageEffectTextColor(projectile.damageType) : undefined,
    shape: projectile.radialFalloff ? "circle" : "rectangle"
  });

  if (projectile.singleTarget) {
    detonateSingleTargetTowerMortar(runtime, projectile);
    return;
  }

  if (projectile.radialFalloff) {
    detonateRadialFalloffTowerMortar(runtime, projectile);
    return;
  }

  const targetX = projectile.targetX;
  const targetY = projectile.targetY;
  forEachSnapshot(runtime.enemies, (enemy) => {
    if (Math.abs(enemy.x - targetX) > projectile.rangeX || Math.abs(enemy.y - targetY) > projectile.rangeY) {
      return;
    }

    if (enemyIsHighFlying(enemy)) {
      return;
    }

    runtime.damageEnemy(enemy, projectile.damage, projectile.damageType, projectile.sourceTower);
    if (enemy.inPlay) {
      applyMortarDebuff(runtime.scene, projectile, enemy, runtime.battleTime);
    }
  });
  const bossPart = bossPartInRect(
    runtime.getBoss(),
    projectile.targetX - projectile.rangeX,
    projectile.targetY - projectile.rangeY,
    projectile.rangeX * 2,
    projectile.rangeY * 2
  );
  if (bossPart) {
    runtime.damageBoss(projectile.damage, projectile.damageType, bossPart);
  }
}

function detonateRadialFalloffTowerMortar(runtime: ProjectileRuntime, projectile: MortarProjectile) {
  const radius = projectile.rangeX;
  const targetX = projectile.targetX;
  const targetY = projectile.targetY;
  forEachSnapshot(runtime.enemies, (enemy) => {
    const dx = enemy.x - targetX;
    const dy = enemy.y - targetY;
    const falloff = radiusFalloffFromDistanceSq(dx * dx + dy * dy, radius);
    if (falloff <= 0 || enemyIsHighFlying(enemy)) {
      return;
    }

    runtime.damageEnemy(enemy, projectile.damage * falloff, projectile.damageType, projectile.sourceTower);
    if (enemy.inPlay) {
      applyMortarDebuff(runtime.scene, projectile, enemy, runtime.battleTime);
    }
  });

  const bossFalloff = bossRadiusFalloff(runtime.getBoss(), projectile.targetX, projectile.targetY, radius);
  if (bossFalloff.falloff > 0) {
    runtime.damageBoss(projectile.damage * bossFalloff.falloff, projectile.damageType, bossFalloff.part);
  }
}

function detonateSingleTargetTowerMortar(runtime: ProjectileRuntime, projectile: MortarProjectile) {
  const hitRadius = projectile.hitRadius ?? 22;
  const targetX = projectile.targetX;
  const targetY = projectile.targetY;
  let target: Enemy | undefined;
  let targetDistance = Number.POSITIVE_INFINITY;
  for (const enemy of runtime.enemies) {
    if (enemyIsBurrowed(enemy)) {
      continue;
    }

    const radius = Math.max(hitRadius, enemyProjectileHitRadius(enemy));
    const distance = distanceSq(enemy.x, enemy.y, targetX, targetY);
    if (distance > radius * radius || distance >= targetDistance || enemyIsHighFlying(enemy)) {
      continue;
    }

    target = enemy;
    targetDistance = distance;
  }

  if (target) {
    runtime.damageEnemy(target, projectile.damage, projectile.damageType, projectile.sourceTower);
    if (target.inPlay) {
      applyMortarDebuff(runtime.scene, projectile, target, runtime.battleTime);
    }
    return;
  }

  const bossPart = bossPartInRadius(runtime.getBoss(), projectile.targetX, projectile.targetY, hitRadius);
  if (bossPart) {
    runtime.damageBoss(projectile.damage, projectile.damageType, bossPart);
  }
}

function removeMortarProjectile(projectiles: MortarProjectile[], projectile: MortarProjectile) {
  Phaser.Utils.Array.Remove(projectiles, projectile);
  projectile.body.destroy();
}

function applyProjectileDebuff(scene: Phaser.Scene, projectile: Projectile, enemy: Enemy, time: number) {
  applyDebuff(scene, enemy, time, projectile.debuff, projectile.debuffDuration);
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function applyMortarDebuff(scene: Phaser.Scene, projectile: MortarProjectile, enemy: Enemy, time: number) {
  applyDebuff(scene, enemy, time, projectile.debuff, projectile.debuffDuration);
}

function applyDebuff(
  scene: Phaser.Scene,
  enemy: Enemy,
  time: number,
  debuff?: Projectile["debuff"],
  debuffDuration?: number
) {
  if (!debuff || !debuffDuration) {
    return;
  }

  applyStatusEffect(enemy, debuff, debuffDuration, time);
  if (debuff === "stasis") {
    makeStasisEffect(scene, enemy.x, enemy.y);
  }
}
