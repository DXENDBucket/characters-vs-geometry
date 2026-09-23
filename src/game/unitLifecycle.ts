import Phaser from "phaser";
import { syncTowerTopology } from "./towerTopology";
import type { TowerActionListener } from "./towerActions";
import { towerBehaviorType } from "./towerIdentity";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  TETRAHEDRON_BOSS_HASTE_DURATION,
  TETRAHEDRON_BOSS_HASTE_MULTIPLIER,
  TETRAHEDRON_BOSS_INVINCIBLE_DURATION
} from "../config";
import { isIcosahedronBoss, isTetrahedronBoss } from "../bosses/cubeBoss";
import { makeBossHitFlash, makeBossInvincibleFlash, makeEnemyInvincibleFlash, makeShockPulse } from "../render/combatEffects";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower, WaveTracker } from "../types";
import { bossFinalStats, enemyDefenseStats } from "./combatStats";
import { calculateDamage } from "./damage";
import { changeEnemyHealth, detachEnemyHealth } from "./enemyHealth";
import { updateChevronPhase } from "./chevronLeader";
import { syncChevronVisual } from "../render/chevronLeader";
import { destroyContainedEnemies } from "./enemyContainers";
import { releaseParenthesisPassengers } from "./parenthesisEnemies";
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
import { addFrozenPhysicalDamage, applyStatusEffect, hasStatusEffect, syncEnemyBodyPosition } from "./statusEffects";
import { forEachBossPart, gridCellKey } from "./targeting";
import { changeTowerHealth, syncHealthBar, syncTowerHealthNetworks, towerHealthDepleted } from "./towerHealth";
import { syncUnyieldingAuras } from "./towerAuras";
import { towerFinalStats } from "./unitStats";
import { syncTowerOccupancy, towerDamageReceiver } from "./towerOccupancy";

export interface UnitLifecycleRuntime {
  enemyHpMultiplier?: () => number;
  onTowerAction?: TowerActionListener;
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
  absorbTowerDamage?: (tower: Tower, damage: number, damageType: DamageType) => number;
  onTowerRemoved?: (tower: Tower) => void;
  onBossDefeated?: (boss: CubeBoss) => boolean;
  endLevel: () => void;
}

const ICOSAHEDRON_FINAL_LOCK_DURATION = 15_000;
const settlingHealth = new WeakSet<Tower[]>();

export function settleTowerHealth(runtime: UnitLifecycleRuntime) {
  if (settlingHealth.has(runtime.towers) || !runtime.towers.some(tower =>
    towerBehaviorType(tower) === "g" || (tower.unyieldingRatio ?? 0) > 0 || tower.hp <= 0
  )) return false;
  settlingHealth.add(runtime.towers);
  let removed = false;
  try {
    // Losing one aura can kill another source. Resolve the whole cascade before returning.
    while (true) {
      syncUnyieldingAuras(runtime.towers);
      const defeated = new Set<Tower>();
      for (const tower of runtime.towers) {
        if (tower.inPlay && towerHealthDepleted(tower)) {
          for (const member of tower.healthPool?.members ?? [tower]) defeated.add(member);
        }
        syncHealthBar(tower);
      }
      if (defeated.size === 0) break;
      removed = true;
      for (const tower of defeated) removeTower(runtime, tower);
    }
  } finally {
    settlingHealth.delete(runtime.towers);
  }
  return removed;
}

export function damageTower(runtime: UnitLifecycleRuntime, tower: Tower, damage: number, damageType: DamageType) {
  if (!tower.inPlay) {
    return;
  }

  tower = towerDamageReceiver(tower);
  const stats = towerFinalStats(tower);
  const mitigatedDamage = calculateDamage(damage, damageType, stats.armor, stats.magicResistance);
  const actualDamage = damageType !== "true"
    ? runtime.absorbTowerDamage?.(tower, mitigatedDamage, damageType) ?? mitigatedDamage : mitigatedDamage;
  changeTowerHealth(tower, -actualDamage);
  const defeated = towerHealthDepleted(tower) ? [...(tower.healthPool?.members ?? [tower])] : undefined;
  runtime.onTowerDamaged(tower);
  if (defeated) {
    for (const member of defeated) removeTower(runtime, member);
  }
}

export function damageBoss(
  runtime: UnitLifecycleRuntime,
  damage: number,
  damageType: DamageType,
  targetPart?: CubeBoss
): boolean {
  const boss = runtime.getBoss();
  if (!boss) {
    return false;
  }

  const damagedPart = targetPart ?? boss;
  if (damagedPart !== boss && !boss.octahedronCopies?.includes(damagedPart)) return false;
  if (damagedPart.invincibleUntil > runtime.battleTime) {
    makeBossInvincibleFlash(runtime.scene, damagedPart.x, damagedPart.y, damagedPart.hitboxWidth, damagedPart.hitboxHeight);
    return false;
  }

  const stats = bossFinalStats(damagedPart, runtime.enemies, boss);
  const actualDamage =
    calculateDamage(damage, damageType, stats.armor, stats.magicResistance) *
    (1 - stats.finalDamageReduction);
  const nextHp = boss.hp - actualDamage;
  if (shouldTriggerIcosahedronFinalLock(runtime, boss, nextHp)) {
    boss.criticalHpTriggered = true;
    boss.pendingCriticalSummon = true;
    boss.hp = 1;
    forEachBossPart(boss, (part) => {
      part.invincibleUntil = runtime.battleTime + ICOSAHEDRON_FINAL_LOCK_DURATION;
    });
    syncBossCopyHp(boss);
    makeBossHitFlash(runtime.scene, damagedPart.x, damagedPart.y, damageType, damagedPart.hitboxWidth, damagedPart.hitboxHeight);
    makeBossInvincibleFlash(runtime.scene, damagedPart.x, damagedPart.y, damagedPart.hitboxWidth, damagedPart.hitboxHeight);
    return true;
  }

  if (shouldTriggerTetrahedronCritical(runtime, boss, nextHp)) {
    boss.criticalHpTriggered = true;
    boss.pendingCriticalSummon = true;
    boss.invincibleUntil = runtime.battleTime + TETRAHEDRON_BOSS_INVINCIBLE_DURATION;
    if (isTetrahedronBoss(boss)) applyStatusEffect(boss, "haste", TETRAHEDRON_BOSS_HASTE_DURATION,
      runtime.battleTime, TETRAHEDRON_BOSS_HASTE_MULTIPLIER);
    boss.nextBossHasteTrailAt = runtime.battleTime;
    boss.hp = nextHp <= 0 ? 1 : boss.maxHp * 0.1;
    syncBossCopyHp(boss);
    makeBossHitFlash(runtime.scene, damagedPart.x, damagedPart.y, damageType, damagedPart.hitboxWidth, damagedPart.hitboxHeight);
    makeBossInvincibleFlash(runtime.scene, damagedPart.x, damagedPart.y, damagedPart.hitboxWidth, damagedPart.hitboxHeight);
    return true;
  }

  boss.hp = nextHp;
  syncBossCopyHp(boss);
  makeBossHitFlash(runtime.scene, damagedPart.x, damagedPart.y, damageType, damagedPart.hitboxWidth, damagedPart.hitboxHeight);

  if (boss.hp <= 0) {
    boss.hp = 0;
    syncBossCopyHp(boss);
    if (runtime.onBossDefeated?.(boss)) {
      return true;
    }
    removeBoss(runtime);
    runtime.endLevel();
  }
  return true;
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

function shouldTriggerIcosahedronFinalLock(runtime: UnitLifecycleRuntime, boss: CubeBoss, nextHp: number) {
  return isIcosahedronBoss(boss) && runtime.bossPhaseIndex === 3 && !boss.criticalHpTriggered && nextHp <= 0;
}

export function damageEnemy(
  runtime: UnitLifecycleRuntime,
  enemy: Enemy,
  damage: number,
  damageType: DamageType,
  sourceTower?: Tower
): boolean {
  if (!enemy.inPlay) {
    return false;
  }

  if (enemyIsSolarBomb(enemy) && sourceTower) {
    bounceSolarBombFromPoint(enemy, sourceTower.x, sourceTower.y);
    syncEnemyBodyPosition(enemy);
  }

  if (enemyIsHighFlying(enemy)) {
    return false;
  }

  if (solarBombIsDepleted(enemy)) {
    makeEnemyInvincibleFlash(runtime.scene, enemy.x, enemy.y);
    syncSolarBombVisual(enemy);
    return false;
  }

  if (hasStatusEffect(enemy, "invincible", runtime.battleTime)) {
    makeEnemyInvincibleFlash(runtime.scene, enemy.x, enemy.y);
    return false;
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
  changeEnemyHealth(enemy, -actualDamage);
  if (updateChevronPhase(enemy)) syncChevronVisual(enemy);
  if (enemyIsSolarBomb(enemy) && enemy.hp <= 0) {
    depleteSolarBomb(enemy);
    syncEnemyBodyPosition(enemy);
    return true;
  }

  syncSolarBombVisual(enemy);
  const affected = enemy.healthPool?.members ?? [enemy];
  for (const member of affected) syncEnemyVisualScale(member);

  if (enemy.hp <= 0) {
    // Snapshot before removals detach members and destroy the shared pool.
    for (const member of [...affected]) {
      if (!member.inPlay) continue;
      const waveTracker = runtime.getWaveTracker();
      if (waveTracker?.number === member.waveNumber) {
        waveTracker.defeatedWeight += member.weight;
      }
      runtime.onEnemyDefeated();
      releaseParenthesisPassengers(member, runtime.enemies, runtime.battleTime);
      releaseBurrowCargo(runtime, member);
      spawnSplitEnemies(runtime, member, runtime.battleTime, runtime.finalDamageReduction);
      removeEnemy(runtime, member, true);
    }
  }
  return true;
}

export function removeBoss(runtime: UnitLifecycleRuntime, animate = true) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  const bodies = [boss, ...(boss.octahedronCopies ?? [])].map((part) => part.body);
  runtime.setBoss(null);
  if (!animate) {
    for (const body of bodies) body.destroy();
    return;
  }
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
  detachEnemyHealth(enemy);
  enemy.inPlay = false;
  Phaser.Utils.Array.Remove(runtime.enemies, enemy);
  destroyContainedEnemies(enemy);
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
  if (!tower.inPlay) {
    return;
  }

  if (towerBehaviorType(tower) === "T") {
    if (!runtime.onTowerAction?.(tower, { kind: "detonation" })) detonateSlowAuraTower(runtime, tower);
  }

  Phaser.Utils.Array.Remove(runtime.towers, tower);
  tower.inPlay = false;
  delete tower.parenthesisGuard; delete tower.parenthesisInner;
  syncTowerOccupancy(runtime.towers, runtime.occupied);
  if (!tower.transient && runtime.occupied.get(gridCellKey(tower.lane, tower.column)) === tower) {
    runtime.occupied.delete(gridCellKey(tower.lane, tower.column));
  }
  if (tower.type === "&") syncTowerTopology(runtime.towers);
  syncTowerHealthNetworks(runtime.towers);
  runtime.onTowerRemoved?.(tower);
  settleTowerHealth(runtime);
  runtime.scene.tweens.add({
    targets: tower.body,
    alpha: 0,
    y: tower.y + 8,
    duration: 130,
    onComplete: () => tower.body.destroy()
  });
}

export function detonateSlowAuraTower(runtime: UnitLifecycleRuntime, tower: Tower) {
  makeShockPulse(runtime.scene, tower.x, tower.y, CELL_WIDTH * 2.5, CELL_HEIGHT * 2.5);
  clearProjectilesInSlowAura(runtime.projectiles, tower);
  clearProjectilesInSlowAura(runtime.enemyProjectiles, tower);
  clearProjectilesInSlowAura(runtime.mortarProjectiles, tower);
}

function clearProjectilesInSlowAura<T extends { x: number; y: number; body: Phaser.GameObjects.GameObject }>(
  projectiles: T[],
  tower: Tower
) {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < projectiles.length; readIndex += 1) {
    const projectile = projectiles[readIndex];
    if (isPointInSlowAura(tower, projectile.x, projectile.y)) {
      projectile.body.destroy();
      continue;
    }

    projectiles[writeIndex] = projectile;
    writeIndex += 1;
  }
  projectiles.length = writeIndex;
}
