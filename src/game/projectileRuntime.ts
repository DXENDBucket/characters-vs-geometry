import Phaser from "phaser";
import { CELL_WIDTH, palette } from "../config";
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
import { movementSpeedMultiplier } from "./slowAura";
import { applyStatusEffect } from "./statusEffects";
import { isBossInRadius, isBossInRect, isPointInBossHitbox, towerRect } from "./targeting";

export interface ProjectileRuntime {
  scene: Phaser.Scene;
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  enemies: Enemy[];
  towers: Tower[];
  battleTime: number;
  getBoss: () => CubeBoss | null;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType) => void;
  damageBoss: (damage: number, damageType: DamageType) => void;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
}

export function updateTowerProjectiles(runtime: ProjectileRuntime, seconds: number) {
  for (const projectile of [...runtime.projectiles]) {
    const speedMultiplier = movementSpeedMultiplier(runtime.towers, projectile.x, projectile.y);
    const nextX = projectile.x + projectile.vx * seconds * speedMultiplier;
    const reachedMaxX = nextX >= projectile.maxX;
    projectile.x = reachedMaxX ? projectile.maxX : nextX;
    projectile.y += projectile.vy * seconds * speedMultiplier;
    projectile.body.setPosition(projectile.x, projectile.y);

    const hit = runtime.enemies.find((enemy) => {
      return Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) < enemyProjectileHitRadius(enemy);
    });
    const hitBoss = isPointInBossHitbox(runtime.getBoss(), projectile.x, projectile.y);

    if (!hit && !hitBoss) {
      if (isTowerProjectileOutOfBounds(projectile, reachedMaxX)) {
        removeProjectile(runtime.projectiles, projectile);
      }
      continue;
    }

    if (projectile.type === "bolt" || projectile.type === "star" || projectile.type === "dollar") {
      if (hit) {
        makeHitShards(runtime.scene, hit.x, hit.y, projectile.damageType);
        runtime.damageEnemy(hit, projectile.damage, projectile.damageType);
        if (runtime.enemies.includes(hit)) {
          applyProjectileDebuff(runtime.scene, projectile, hit, runtime.battleTime);
        }
      } else {
        makeHitShards(runtime.scene, projectile.x, projectile.y, projectile.damageType);
        runtime.damageBoss(projectile.damage, projectile.damageType);
      }
    } else {
      const burstX = hit ? hit.x : projectile.x;
      const burstY = hit ? hit.y : projectile.y;
      makeShellBurst(runtime.scene, burstX, burstY, projectile.splashRadius, projectile.damageType);
      for (const enemy of [...runtime.enemies]) {
        const dx = enemy.x - burstX;
        const dy = enemy.y - burstY;
        if (Math.hypot(dx, dy) <= projectile.splashRadius) {
          runtime.damageEnemy(enemy, projectile.damage, projectile.damageType);
          if (runtime.enemies.includes(enemy)) {
            applyProjectileDebuff(runtime.scene, projectile, enemy, runtime.battleTime);
          }
        }
      }
      if (isBossInRadius(runtime.getBoss(), burstX, burstY, projectile.splashRadius)) {
        runtime.damageBoss(projectile.damage, projectile.damageType);
      }
    }

    removeProjectile(runtime.projectiles, projectile);
  }
}

export function updateEnemyProjectiles(runtime: ProjectileRuntime, seconds: number) {
  for (const projectile of [...runtime.enemyProjectiles]) {
    projectile.x += projectile.vx * seconds * movementSpeedMultiplier(runtime.towers, projectile.x, projectile.y);
    projectile.body.setPosition(projectile.x, projectile.y);

    const hit = runtime.towers
      .filter((tower) => tower.lane === projectile.sourceLane)
      .find((tower) => towerRect(tower).contains(projectile.x, projectile.y));

    if (hit) {
      if (hit.type === "N") {
        shiftEnemyProjectile(projectile, hit);
        makeShiftEffect(runtime.scene, projectile.x + projectileShiftDistance(hit), projectile.y, projectile.x, projectile.y);
        projectile.body.setPosition(projectile.x, projectile.y);
        if (isEnemyProjectileOutOfBounds(projectile)) {
          removeEnemyProjectile(runtime.enemyProjectiles, projectile);
        }
        continue;
      }

      makeEnemyHitShards(runtime.scene, projectile.x, projectile.y);
      const reflectsProjectile = hit.reflectProjectiles;
      runtime.damageTower(hit, projectile.damage, projectile.damageType);
      if (reflectsProjectile) {
        runtime.projectiles.push(createReflectedProjectile(runtime.scene, projectile));
        makeReflectFlash(runtime.scene, projectile.x, projectile.y);
      }
      removeEnemyProjectile(runtime.enemyProjectiles, projectile);
      continue;
    }

    if (isEnemyProjectileOutOfBounds(projectile)) {
      removeEnemyProjectile(runtime.enemyProjectiles, projectile);
    }
  }
}

export function updateMortarProjectiles(runtime: ProjectileRuntime, seconds: number) {
  for (const projectile of [...runtime.mortarProjectiles]) {
    syncMortarTarget(runtime, projectile);
    const speedMultiplier = movementSpeedMultiplier(runtime.towers, projectile.x, projectile.y);
    projectile.progress = Math.min(1, projectile.progress + (seconds * 1000 * speedMultiplier) / projectile.duration);
    positionMortarProjectile(projectile);

    if (projectile.progress < 1) {
      continue;
    }

    if (projectile.owner === "enemy") {
      detonateEnemyMortar(runtime, projectile);
    } else {
      detonateTowerMortar(runtime, projectile);
    }
    removeMortarProjectile(runtime.mortarProjectiles, projectile);
  }
}

function shiftEnemyProjectile(projectile: EnemyProjectile, tower: Tower) {
  projectile.x -= projectileShiftDistance(tower);
}

function projectileShiftDistance(tower: Tower) {
  const definition = getCardDefinition(tower.type);
  return (definition.shiftCells ?? 4) * CELL_WIDTH;
}

function removeProjectile(projectiles: Projectile[], projectile: Projectile) {
  Phaser.Utils.Array.Remove(projectiles, projectile);
  projectile.body.destroy();
}

function enemyProjectileHitRadius(enemy: Enemy) {
  return enemyIsBossCompanion(enemy.kind) ? CELL_WIDTH * 0.475 : 22;
}

function removeEnemyProjectile(projectiles: EnemyProjectile[], projectile: EnemyProjectile) {
  Phaser.Utils.Array.Remove(projectiles, projectile);
  projectile.body.destroy();
}

function syncMortarTarget(runtime: ProjectileRuntime, projectile: MortarProjectile) {
  if (projectile.targetEnemy && runtime.enemies.includes(projectile.targetEnemy)) {
    projectile.targetX = projectile.targetEnemy.x;
    projectile.targetY = projectile.targetEnemy.y;
    return;
  }

  if (projectile.targetTower && runtime.towers.includes(projectile.targetTower)) {
    projectile.targetX =
      projectile.owner === "enemy" && projectile.targetTower.type === "N"
        ? projectile.targetTower.x - projectileShiftDistance(projectile.targetTower)
        : projectile.targetTower.x;
    projectile.targetY = projectile.targetTower.y;
  }
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
  const hitTowers = runtime.towers.filter((tower) => {
    return Math.abs(tower.x - projectile.targetX) <= projectile.rangeX && Math.abs(tower.y - projectile.targetY) <= projectile.rangeY;
  });
  const reflectors = hitTowers.filter((tower) => tower.reflectProjectiles);

  for (const tower of hitTowers) {
    runtime.damageTower(tower, projectile.damage, projectile.damageType);
  }

  for (const tower of reflectors) {
    if (!projectile.sourceEnemy || !runtime.enemies.includes(projectile.sourceEnemy)) {
      continue;
    }

    runtime.mortarProjectiles.push(
      createMortarProjectile(runtime.scene, {
        owner: "tower",
        fromX: tower.x,
        fromY: tower.y,
        targetX: projectile.sourceEnemy.x,
        targetY: projectile.sourceEnemy.y,
        damage: projectile.damage,
        damageType: projectile.damageType,
        rangeX: projectile.rangeX,
        rangeY: projectile.rangeY,
        marker: projectile.marker,
        markerText: projectile.markerText,
        markerTextColor: projectile.marker === "text" ? damageEffectTextColor(projectile.damageType) : undefined,
        targetEnemy: projectile.sourceEnemy
      })
    );
    makeReflectFlash(runtime.scene, tower.x, tower.y);
  }
}

function detonateTowerMortar(runtime: ProjectileRuntime, projectile: MortarProjectile) {
  makeSpellMortarImpact(runtime.scene, projectile.targetX, projectile.targetY, projectile.rangeX, projectile.rangeY, {
    color: damageEffectColor(projectile.damageType),
    marker: projectile.marker ?? "shell",
    markerText: projectile.markerText,
    markerTextColor: projectile.marker === "text" ? damageEffectTextColor(projectile.damageType) : undefined
  });
  for (const enemy of [...runtime.enemies]) {
    if (Math.abs(enemy.x - projectile.targetX) <= projectile.rangeX && Math.abs(enemy.y - projectile.targetY) <= projectile.rangeY) {
      runtime.damageEnemy(enemy, projectile.damage, projectile.damageType);
    }
  }
  if (isBossInRect(runtime.getBoss(), projectile.targetX - projectile.rangeX, projectile.targetY - projectile.rangeY, projectile.rangeX * 2, projectile.rangeY * 2)) {
    runtime.damageBoss(projectile.damage, projectile.damageType);
  }
}

function removeMortarProjectile(projectiles: MortarProjectile[], projectile: MortarProjectile) {
  Phaser.Utils.Array.Remove(projectiles, projectile);
  projectile.body.destroy();
}

function applyProjectileDebuff(scene: Phaser.Scene, projectile: Projectile, enemy: Enemy, time: number) {
  if (!projectile.debuff || !projectile.debuffDuration) {
    return;
  }

  applyStatusEffect(enemy, projectile.debuff, projectile.debuffDuration, time);
  if (projectile.debuff === "stasis") {
    makeStasisEffect(scene, enemy.x, enemy.y);
  }
}
