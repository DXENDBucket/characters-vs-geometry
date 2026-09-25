import { removeEnemyFromField } from "./enemyRoster";
import { syncPassengerPositionState } from "./enemyContainerRules";
import { syncTowerTopology } from "./towerTopology";
import { towerBehaviorType } from "./towerIdentity";
import {
  TETRAHEDRON_BOSS_HASTE_DURATION,
  TETRAHEDRON_BOSS_HASTE_MULTIPLIER,
  TETRAHEDRON_BOSS_INVINCIBLE_DURATION
} from "../config";
import { advanceBossPosition, isIcosahedronBoss, isTetrahedronBoss } from "./bossRules";
import { startDelSweep, delSweepActive } from "./delSweep";
import { startDelLaneSweep, delLaneSweepInvincible } from "./delLaneSweep";
import type { DamageType, WaveTracker } from "../types";
import type { BossState as CubeBoss } from "./bossState";
import type { EnemyState as Enemy } from "./enemyState";
import type { TowerState as Tower } from "./towerState";
import type { ProjectileState as Projectile, EnemyProjectileState as EnemyProjectile, MortarProjectileState as MortarProjectile } from "./projectileState";
import type { UnitLifecyclePresentation } from "./unitLifecyclePresentation";
import type { EnemySpawnOptions } from "./waveSpawner";
import { bossFinalStats, enemyDefenseStats } from "./combatStats";
import { calculateDamage } from "./damage";
import { changeEnemyHealth, detachEnemyHealth } from "./enemyHealth";
import { updateChevronPhase } from "./chevronLeader";
import { destroyContainedEnemies, releaseParenthesisPassengers, releaseBurrowCargo } from "./enemyReleaseRules";
import { enemyIsHighFlying } from "./enemyCombatRules";
import { spawnSplitEnemies } from "./enemySplitRules";
import { isPointInSlowAura } from "./slowAura";
import {
  bounceSolarBombFromPoint,
  depleteSolarBomb,
  solarBombDamageMultiplier,
  solarBombIsDepleted
} from "./solarBombRules";
import { enemyIsSolarBomb } from "./enemyIdentity";
import { addFrozenPhysicalDamage, applyStatusEffect, hasStatusEffect } from "./statusEffects";
import { bossParts, secondaryBossParts, forEachBossPart } from "./unitGeometry";
import { changeTowerHealth, syncTowerHealthNetworks, towerHealthDepleted } from "./towerHealthRules";
import { syncUnyieldingAuras } from "./towerAuras";
import { towerFinalStats } from "./unitStatRules";
import { syncTowerOccupancy, towerDamageReceiver } from "./towerOccupancy";

const gridCellKey = (lane: number, column: number) => `${lane}:${column}`;

export interface UnitLifecycleRuntime {
  presentation: UnitLifecyclePresentation;
  spawnEnemy: (options: EnemySpawnOptions) => void;
  onDetonation?: (tower: Tower) => boolean;
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
        runtime.presentation.towerHealth(tower);
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
  changeTowerHealth(tower, -actualDamage, runtime.presentation.towerHealth);
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
  if (damagedPart !== boss && !secondaryBossParts(boss).includes(damagedPart)) return false;
  if (damagedPart.invincibleUntil > runtime.battleTime) {
    if (!delSweepActive(damagedPart) && !delLaneSweepInvincible(damagedPart)) {
      runtime.presentation.bossInvincible(damagedPart);
    }
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
    runtime.presentation.bossHit(damagedPart, damageType);
    runtime.presentation.bossInvincible(damagedPart);
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
    runtime.presentation.bossHit(damagedPart, damageType);
    runtime.presentation.bossInvincible(damagedPart);
    return true;
  }

  boss.hp = nextHp;
  if (startDelSweep(boss, runtime.battleTime) || startDelLaneSweep(boss, runtime.battleTime)) {
    advanceBossPosition(boss, 0, 0, runtime.battleTime);
    runtime.presentation.bossSweepStarted(boss, runtime.battleTime);
  }
  syncBossCopyHp(boss);
  runtime.presentation.bossHit(damagedPart, damageType);

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
    syncPassengerPositionState(enemy);
    runtime.presentation.enemyPosition(enemy);
  }

  if (enemyIsHighFlying(enemy)) {
    return false;
  }

  if (solarBombIsDepleted(enemy)) {
    runtime.presentation.enemyInvincible(enemy);
    runtime.presentation.solarBomb(enemy);
    return false;
  }

  if (hasStatusEffect(enemy, "invincible", runtime.battleTime)) {
    runtime.presentation.enemyInvincible(enemy);
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
    syncPassengerPositionState(enemy);
    runtime.presentation.enemyPosition(enemy);
  }
  changeEnemyHealth(enemy, -actualDamage);
  if (updateChevronPhase(enemy)) runtime.presentation.enemyForm(enemy);
  if (enemyIsSolarBomb(enemy) && enemy.hp <= 0) {
    depleteSolarBomb(enemy);
    runtime.presentation.solarBomb(enemy);
    syncPassengerPositionState(enemy);
    runtime.presentation.enemyPosition(enemy);
    return true;
  }

  runtime.presentation.solarBomb(enemy);
  const affected = enemy.healthPool?.members ?? [enemy];
  for (const member of affected) runtime.presentation.enemyScale(member);

  if (enemy.hp <= 0) {
    // Snapshot before removals detach members and destroy the shared pool.
    for (const member of [...affected]) {
      if (!member.inPlay) continue;
      const waveTracker = runtime.getWaveTracker();
      if (waveTracker?.number === member.waveNumber) {
        waveTracker.defeatedWeight += member.weight;
      }
      runtime.onEnemyDefeated();
      releaseParenthesisPassengers(member, runtime.enemies, runtime.battleTime, runtime.presentation);
      releaseBurrowCargo(runtime, member);
      spawnSplitEnemies(runtime.spawnEnemy, member, runtime.battleTime, runtime.finalDamageReduction);
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

  const parts = bossParts(boss);
  runtime.setBoss(null);
  runtime.presentation.removeBoss(parts, animate);
}

export function removeEnemy(runtime: UnitLifecycleRuntime, enemy: Enemy, animate: boolean) {
  detachEnemyHealth(enemy);
  enemy.inPlay = false;
  removeEnemyFromField(runtime.enemies, enemy);
  destroyContainedEnemies(enemy, cargo => runtime.presentation.removeEnemy(cargo, false));
  runtime.presentation.removeEnemy(enemy, animate);
}

export function removeTower(runtime: UnitLifecycleRuntime, tower: Tower) {
  if (!tower.inPlay) {
    return;
  }

  if (towerBehaviorType(tower) === "T") {
    if (!runtime.onDetonation?.(tower)) detonateSlowAuraTower(runtime, tower);
  }

  const index = runtime.towers.indexOf(tower);
  if (index !== -1) runtime.towers.splice(index, 1);
  tower.inPlay = false;
  delete tower.parenthesisGuard; delete tower.parenthesisInner;
  syncTowerOccupancy(runtime.towers, runtime.occupied);
  if (!tower.transient && runtime.occupied.get(gridCellKey(tower.lane, tower.column)) === tower) {
    runtime.occupied.delete(gridCellKey(tower.lane, tower.column));
  }
  if (tower.type === "&") syncTowerTopology(runtime.towers);
  syncTowerHealthNetworks(runtime.towers, runtime.presentation.towerHealth);
  runtime.onTowerRemoved?.(tower);
  settleTowerHealth(runtime);
  runtime.presentation.removeTower(tower);
}

export function detonateSlowAuraTower(runtime: UnitLifecycleRuntime, tower: Tower) {
  runtime.presentation.slowAuraPulse(tower);
  clearProjectilesInSlowAura(runtime, runtime.projectiles, tower);
  clearProjectilesInSlowAura(runtime, runtime.enemyProjectiles, tower);
  clearProjectilesInSlowAura(runtime, runtime.mortarProjectiles, tower);
}

function clearProjectilesInSlowAura<T extends { x: number; y: number }>(
  runtime: UnitLifecycleRuntime,
  projectiles: T[],
  tower: Tower
) {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < projectiles.length; readIndex += 1) {
    const projectile = projectiles[readIndex];
    if (isPointInSlowAura(tower, projectile.x, projectile.y)) {
      runtime.presentation.removeProjectile(projectile);
      continue;
    }

    projectiles[writeIndex] = projectile;
    writeIndex += 1;
  }
  projectiles.length = writeIndex;
}
