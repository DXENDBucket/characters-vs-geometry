import Phaser from "phaser";
import {
  makeEnemyHitShards,
  makeHitShards,
  makeShellBurst
} from "../render/combatEffects";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, Projectile, Tower } from "../types";
import { isEnemyProjectileOutOfBounds, isTowerProjectileOutOfBounds } from "./projectiles";
import { movementSpeedMultiplier } from "./slowAura";
import { isBossInRadius, isPointInBossHitbox, towerRect } from "./targeting";

export interface ProjectileRuntime {
  scene: Phaser.Scene;
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  enemies: Enemy[];
  towers: Tower[];
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

    const hit = runtime.enemies.find(
      (enemy) => Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) < 22
    );
    const hitBoss = isPointInBossHitbox(runtime.getBoss(), projectile.x, projectile.y);

    if (!hit && !hitBoss) {
      if (isTowerProjectileOutOfBounds(projectile, reachedMaxX)) {
        removeProjectile(runtime.projectiles, projectile);
      }
      continue;
    }

    if (projectile.type === "bolt" || projectile.type === "star") {
      if (hit) {
        makeHitShards(runtime.scene, hit.x, hit.y, projectile.damageType);
        runtime.damageEnemy(hit, projectile.damage, projectile.damageType);
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
      makeEnemyHitShards(runtime.scene, projectile.x, projectile.y);
      runtime.damageTower(hit, projectile.damage, projectile.damageType);
      removeEnemyProjectile(runtime.enemyProjectiles, projectile);
      continue;
    }

    if (isEnemyProjectileOutOfBounds(projectile)) {
      removeEnemyProjectile(runtime.enemyProjectiles, projectile);
    }
  }
}

function removeProjectile(projectiles: Projectile[], projectile: Projectile) {
  Phaser.Utils.Array.Remove(projectiles, projectile);
  projectile.body.destroy();
}

function removeEnemyProjectile(projectiles: EnemyProjectile[], projectile: EnemyProjectile) {
  Phaser.Utils.Array.Remove(projectiles, projectile);
  projectile.body.destroy();
}
