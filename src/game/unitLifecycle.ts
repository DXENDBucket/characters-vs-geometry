import Phaser from "phaser";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  TETRAHEDRON_BOSS_HASTE_DURATION,
  TETRAHEDRON_BOSS_INVINCIBLE_DURATION
} from "../config";
import { isIcosahedronBoss, isTetrahedronBoss } from "../bosses/cubeBoss";
import { makeBossHitFlash, makeBossInvincibleFlash, makeEnemyInvincibleFlash, makeShockPulse } from "../render/combatEffects";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower, WaveTracker } from "../types";
import { bossFinalStats, enemyDefenseStats } from "./combatStats";
import { calculateDamage } from "./damage";
import { enemyIsHighFlying, syncEnemyVisualScale } from "./enemyBehaviors";
import { releaseBurrowCargo, spawnSplitEnemies } from "./enemyRuntime";
import { isPointInSlowAura } from "./slowAura";
import {
  bounceSolarBombFromPoint,
  depleteSolarBomb,
  enemyIsSolarBomb,
  solarBombDamageMultiplier,
  solarBombIsDepleted,
  syncSolarBombVisual
} from "./solarBomb";
import { addFrozenPhysicalDamage, hasStatusEffect, syncEnemyBodyPosition } from "./statusEffects";
import { gridCellKey } from "./targeting";
import { syncTowerHpBar } from "./towers";
import { towerFinalStats } from "./unitStats";

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
  bossPhaseIndex: number;
  battleTime: number;
  finalDamageReduction: number;
  onEnemyDefeated: () => void;
  onTowerDamaged: (tower: Tower) => void;
  onTowerRemoved?: (tower: Tower) => void;
  onBossDefeated?: (boss: CubeBoss) => boolean;
  endLevel: () => void;
}

export function damageTower(runtime: UnitLifecycleRuntime, tower: Tower, damage: number, damageType: DamageType) {
  if (!runtime.towers.includes(tower)) {
    return;
  }

  const stats = towerFinalStats(tower);
  const actualDamage = calculateDamage(damage, damageType, stats.armor, stats.magicResistance);
  tower.hp -= actualDamage;
  runtime.onTowerDamaged(tower);
  syncTowerHpBar(tower);

  if (tower.hp <= 0) {
    removeTower(runtime, tower);
  }
}

export function damageBoss(
  runtime: UnitLifecycleRuntime,
  damage: number,
  damageType: DamageType,
  targetPart?: CubeBoss
) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  const damagedPart = targetPart ?? boss;
  if (damagedPart.invincibleUntil > runtime.battleTime) {
    makeBossInvincibleFlash(runtime.scene, damagedPart.x, damagedPart.y, damagedPart.hitboxWidth, damagedPart.hitboxHeight);
    return;
  }

  const stats = bossFinalStats(damagedPart, runtime.enemies, boss);
  const actualDamage =
    calculateDamage(damage, damageType, stats.armor, stats.magicResistance) *
    (1 - stats.finalDamageReduction);
  const nextHp = boss.hp - actualDamage;
  if (shouldTriggerTetrahedronCritical(runtime, boss, nextHp)) {
    boss.criticalHpTriggered = true;
    boss.pendingCriticalSummon = true;
    boss.invincibleUntil = runtime.battleTime + TETRAHEDRON_BOSS_INVINCIBLE_DURATION;
    boss.bossHasteUntil = runtime.battleTime + TETRAHEDRON_BOSS_HASTE_DURATION;
    boss.nextBossHasteTrailAt = runtime.battleTime;
    boss.hp = nextHp <= 0 ? 1 : boss.maxHp * 0.1;
    syncBossCopyHp(boss);
    makeBossHitFlash(runtime.scene, damagedPart.x, damagedPart.y, damageType, damagedPart.hitboxWidth, damagedPart.hitboxHeight);
    makeBossInvincibleFlash(runtime.scene, damagedPart.x, damagedPart.y, damagedPart.hitboxWidth, damagedPart.hitboxHeight);
    return;
  }

  boss.hp = nextHp;
  syncBossCopyHp(boss);
  makeBossHitFlash(runtime.scene, damagedPart.x, damagedPart.y, damageType, damagedPart.hitboxWidth, damagedPart.hitboxHeight);

  if (boss.hp <= 0) {
    boss.hp = 0;
    syncBossCopyHp(boss);
    if (runtime.onBossDefeated?.(boss)) {
      return;
    }
    removeBoss(runtime);
    runtime.endLevel();
  }
}

function syncBossCopyHp(boss: CubeBoss) {
  for (const copy of boss.octahedronCopies ?? []) {
    copy.hp = boss.hp;
    copy.maxHp = boss.maxHp;
  }
}

function shouldTriggerTetrahedronCritical(runtime: UnitLifecycleRuntime, boss: CubeBoss, nextHp: number) {
  const usesCriticalSummon = isTetrahedronBoss(boss) || (isIcosahedronBoss(boss) && runtime.bossPhaseIndex === 1);
  return usesCriticalSummon && !boss.criticalHpTriggered && nextHp <= boss.maxHp * 0.1;
}

export function damageEnemy(
  runtime: UnitLifecycleRuntime,
  enemy: Enemy,
  damage: number,
  damageType: DamageType,
  sourceTower?: Tower
) {
  if (!runtime.enemies.includes(enemy)) {
    return;
  }

  if (enemyIsSolarBomb(enemy) && sourceTower) {
    bounceSolarBombFromPoint(enemy, sourceTower.x, sourceTower.y);
    syncEnemyBodyPosition(enemy);
  }

  if (enemyIsHighFlying(enemy)) {
    return;
  }

  if (solarBombIsDepleted(enemy)) {
    makeEnemyInvincibleFlash(runtime.scene, enemy.x, enemy.y);
    syncSolarBombVisual(enemy);
    return;
  }

  if (hasStatusEffect(enemy, "invincible", runtime.battleTime)) {
    makeEnemyInvincibleFlash(runtime.scene, enemy.x, enemy.y);
    return;
  }

  const stats = enemyDefenseStats(enemy, runtime.enemies, runtime.battleTime);
  const actualDamage =
    calculateDamage(damage, damageType, stats.armor, stats.magicResistance) *
    solarBombDamageMultiplier(enemy, damageType) *
    (1 - stats.finalDamageReduction);
  if (
    damageType === "physical" &&
    hasStatusEffect(enemy, "frozen", runtime.battleTime) &&
    addFrozenPhysicalDamage(enemy, actualDamage, runtime.battleTime)
  ) {
    syncEnemyBodyPosition(enemy);
  }
  enemy.hp -= actualDamage;
  if (enemyIsSolarBomb(enemy) && enemy.hp <= 0) {
    depleteSolarBomb(enemy);
    syncEnemyBodyPosition(enemy);
    return;
  }

  syncSolarBombVisual(enemy);
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

  const bodies = [boss, ...(boss.octahedronCopies ?? [])].map((part) => part.body);
  runtime.setBoss(null);
  runtime.scene.tweens.add({
    targets: bodies,
    alpha: 0,
    scale: 0.82,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => bodies.forEach((body) => body.destroy())
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
  if (!runtime.towers.includes(tower)) {
    return;
  }

  if (tower.type === "T") {
    detonateSlowAuraTower(runtime, tower);
  }

  Phaser.Utils.Array.Remove(runtime.towers, tower);
  if (!tower.transient) {
    runtime.occupied.delete(gridCellKey(tower.lane, tower.column));
  }
  runtime.onTowerRemoved?.(tower);
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
