import Phaser from "phaser";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  TETRAHEDRON_BOSS_HASTE_DURATION,
  TETRAHEDRON_BOSS_INVINCIBLE_DURATION
} from "../config";
import { isTetrahedronBoss } from "../bosses/cubeBoss";
import { makeBossHitFlash, makeBossInvincibleFlash, makeEnemyInvincibleFlash, makeShockPulse } from "../render/combatEffects";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower, WaveTracker } from "../types";
import { calculateDamage } from "./damage";
import { syncEnemyVisualScale } from "./enemyBehaviors";
import { releaseBurrowCargo, spawnSplitEnemies } from "./enemyRuntime";
import { hexArmorBonus, hexBossArmorBonus } from "./enemySupport";
import { isPointInSlowAura } from "./slowAura";
import { hasStatusEffect } from "./statusEffects";
import { gridCellKey } from "./targeting";
import { syncTowerHpBar } from "./towers";

export interface UnitLifecycleRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  occupied: Map<string, Tower>;
  getBoss: () => CubeBoss | null;
  setBoss: (boss: CubeBoss | null) => void;
  getWaveTracker: () => WaveTracker | null;
  battleTime: number;
  finalDamageReduction: number;
  onEnemyDefeated: () => void;
  onTowerDamaged: (tower: Tower) => void;
  endLevel: () => void;
}

export function damageTower(runtime: UnitLifecycleRuntime, tower: Tower, damage: number, damageType: DamageType) {
  if (!runtime.towers.includes(tower)) {
    return;
  }

  const actualDamage = calculateDamage(damage, damageType, tower.armor, tower.magicResistance);
  tower.hp -= actualDamage;
  runtime.onTowerDamaged(tower);
  syncTowerHpBar(tower);

  if (tower.hp <= 0) {
    if (tower.type === "T") {
      removeTower(runtime, tower);
      detonateSlowAuraTower(runtime, tower);
      return;
    }

    removeTower(runtime, tower);
  }
}

export function damageBoss(runtime: UnitLifecycleRuntime, damage: number, damageType: DamageType) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  if (boss.invincibleUntil > runtime.battleTime) {
    makeBossInvincibleFlash(runtime.scene, boss.x, boss.y);
    return;
  }

  const actualDamage =
    calculateDamage(damage, damageType, boss.armor + hexBossArmorBonus(runtime.enemies, boss), boss.magicResistance) *
    (1 - boss.finalDamageReduction);
  const nextHp = boss.hp - actualDamage;
  if (shouldTriggerTetrahedronCritical(boss, nextHp)) {
    boss.criticalHpTriggered = true;
    boss.pendingCriticalSummon = true;
    boss.invincibleUntil = runtime.battleTime + TETRAHEDRON_BOSS_INVINCIBLE_DURATION;
    boss.bossHasteUntil = runtime.battleTime + TETRAHEDRON_BOSS_HASTE_DURATION;
    boss.nextBossHasteTrailAt = runtime.battleTime;
    boss.hp = nextHp <= 0 ? 1 : boss.maxHp * 0.1;
    makeBossHitFlash(runtime.scene, boss.x, boss.y, damageType);
    makeBossInvincibleFlash(runtime.scene, boss.x, boss.y);
    return;
  }

  boss.hp = nextHp;
  makeBossHitFlash(runtime.scene, boss.x, boss.y, damageType);

  if (boss.hp <= 0) {
    boss.hp = 0;
    removeBoss(runtime);
    runtime.endLevel();
  }
}

function shouldTriggerTetrahedronCritical(boss: CubeBoss, nextHp: number) {
  return isTetrahedronBoss(boss) && !boss.criticalHpTriggered && nextHp <= boss.maxHp * 0.1;
}

export function damageEnemy(runtime: UnitLifecycleRuntime, enemy: Enemy, damage: number, damageType: DamageType) {
  if (!runtime.enemies.includes(enemy)) {
    return;
  }

  if (hasStatusEffect(enemy, "invincible", runtime.battleTime)) {
    makeEnemyInvincibleFlash(runtime.scene, enemy.x, enemy.y);
    return;
  }

  const actualDamage =
    calculateDamage(damage, damageType, enemy.armor + hexArmorBonus(runtime.enemies, enemy), enemy.magicResistance) *
    (1 - enemy.finalDamageReduction);
  enemy.hp -= actualDamage;
  syncEnemyVisualScale(enemy);

  if (enemy.hp <= 0) {
    const waveTracker = runtime.getWaveTracker();
    if (waveTracker?.number === enemy.waveNumber) {
      waveTracker.defeatedWeight += enemy.weight;
    }

    runtime.onEnemyDefeated();
    releaseBurrowCargo(runtime, enemy);
    spawnSplitEnemies(runtime, enemy, runtime.battleTime, runtime.finalDamageReduction);
    removeEnemy(runtime, enemy, true);
  }
}

export function removeBoss(runtime: UnitLifecycleRuntime) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  runtime.setBoss(null);
  runtime.scene.tweens.add({
    targets: boss.body,
    alpha: 0,
    scale: 0.82,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => boss.body.destroy()
  });
}

export function removeEnemy(runtime: UnitLifecycleRuntime, enemy: Enemy, animate: boolean) {
  Phaser.Utils.Array.Remove(runtime.enemies, enemy);
  for (const cargo of enemy.burrowCargo ?? []) {
    if (!runtime.enemies.includes(cargo)) {
      cargo.body.destroy();
    }
  }
  enemy.burrowCargo = [];
  if (animate) {
    runtime.scene.tweens.add({
      targets: enemy.body,
      alpha: 0,
      duration: 140,
      onComplete: () => enemy.body.destroy()
    });
    return;
  }

  enemy.body.destroy();
}

export function removeTower(runtime: UnitLifecycleRuntime, tower: Tower) {
  Phaser.Utils.Array.Remove(runtime.towers, tower);
  if (!tower.transient) {
    runtime.occupied.delete(gridCellKey(tower.lane, tower.column));
  }
  runtime.scene.tweens.add({
    targets: tower.body,
    alpha: 0,
    y: tower.y + 8,
    duration: 130,
    onComplete: () => tower.body.destroy()
  });
}

function detonateSlowAuraTower(runtime: UnitLifecycleRuntime, tower: Tower) {
  makeShockPulse(runtime.scene, tower.x, tower.y, CELL_WIDTH * 2.5, CELL_HEIGHT * 2.5);
  clearProjectilesInSlowAura(runtime.projectiles, tower);
  clearProjectilesInSlowAura(runtime.enemyProjectiles, tower);
  clearProjectilesInSlowAura(runtime.mortarProjectiles, tower);
}

function clearProjectilesInSlowAura<T extends { x: number; y: number; body: Phaser.GameObjects.GameObject }>(
  projectiles: T[],
  tower: Tower
) {
  for (const projectile of [...projectiles]) {
    if (!isPointInSlowAura(tower, projectile.x, projectile.y)) {
      continue;
    }

    Phaser.Utils.Array.Remove(projectiles, projectile);
    projectile.body.destroy();
  }
}
