import Phaser from "phaser";
import {
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  CELL_HEIGHT,
  CELL_WIDTH,
  COLUMNS,
  CUBE_BOSS_CONTACT_DAMAGE,
  CUBE_BOSS_CONTACT_INTERVAL,
  LANES,
  TETRAHEDRON_BOSS_CHARGE_DURATION,
  TETRAHEDRON_BOSS_CHARGE_SUPPRESSION_SP_GAIN,
  TETRAHEDRON_BOSS_DESPERATION_CHARGE_SP_GAIN,
  TETRAHEDRON_BOSS_HASTE_MULTIPLIER,
  TETRAHEDRON_BOSS_IMPACT_CHARGE_SP_GAIN,
  TETRAHEDRON_BOSS_SUPPRESSION_IMPACT_SP_GAIN
} from "../config";
import {
  bossAdvanceSpawnPoints,
  chargeBossSkill,
  isBossSkillReady,
  spendBossSkill,
  updateCubeBossMotion
} from "../bosses/cubeBoss";
import { makeBossHasteTrail, makeCubeCollapse, makeTetrahedronCollapse } from "../render/combatEffects";
import type { BossSkill, CubeBoss, DamageType, Enemy, Tower } from "../types";
import { applyEnemyPromotion, findPromotionTargets, promotedKind } from "./enemyBehaviors";
import { spawnEnemyAt } from "./enemyRuntime";
import { applyStatusEffect } from "./statusEffects";
import { bossRect, towerRect } from "./targeting";
import { isTrapArmed } from "./towers";

export interface BossRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  getBoss: () => CubeBoss | null;
  wave: number;
  battleTime: number;
  finalDamageReduction: number;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  triggerTrapTower: (tower: Tower, target: Enemy | "boss") => void;
  triggerShockTower: (tower: Tower) => void;
  endGame: () => void;
}

export function updateBossRuntime(runtime: BossRuntime, seconds: number) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  updateCubeBossMotion(boss, seconds, bossMovementMultiplier(boss, runtime.battleTime), runtime.battleTime);
  updateBossHasteVisual(runtime, boss);
  triggerTetrahedronHalfHpBurst(runtime, boss);
  triggerTetrahedronCriticalSummon(runtime, boss);
  updateBossSkills(runtime, boss, seconds);
  triggerFunctionalTowersTouchingBoss(runtime, boss);
  if (!runtime.getBoss()) {
    return;
  }
  damageBossTouchingTowers(runtime, boss, seconds);

  if (bossRect(boss).left <= BOARD_X - 20) {
    runtime.endGame();
  }
}

function bossMovementMultiplier(boss: CubeBoss, time: number) {
  return boss.kind === "tetrahedron" && time < boss.bossHasteUntil ? TETRAHEDRON_BOSS_HASTE_MULTIPLIER : 1;
}

function updateBossHasteVisual(runtime: BossRuntime, boss: CubeBoss) {
  if (boss.kind !== "tetrahedron" || runtime.battleTime >= boss.bossHasteUntil) {
    return;
  }

  if (runtime.battleTime < boss.nextBossHasteTrailAt) {
    return;
  }

  makeBossHasteTrail(runtime.scene, boss.x, boss.y);
  boss.nextBossHasteTrailAt = runtime.battleTime + 100;
}

function triggerFunctionalTowersTouchingBoss(runtime: BossRuntime, boss: CubeBoss) {
  const rect = bossRect(boss);
  for (const tower of [...runtime.towers]) {
    if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, towerRect(tower))) {
      continue;
    }

    if (tower.type === "G" && isTrapArmed(tower, runtime.battleTime)) {
      runtime.triggerTrapTower(tower, "boss");
      if (!runtime.getBoss()) {
        return;
      }
      continue;
    }

    if (tower.type === "F") {
      runtime.triggerShockTower(tower);
    }
  }
}

function damageBossTouchingTowers(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  boss.contactAttackBuffer += seconds;
  if (boss.contactAttackBuffer < CUBE_BOSS_CONTACT_INTERVAL) {
    return;
  }

  const rect = bossRect(boss);
  while (boss.contactAttackBuffer >= CUBE_BOSS_CONTACT_INTERVAL) {
    const targets = runtime.towers.filter((tower) => {
      return Phaser.Geom.Intersects.RectangleToRectangle(rect, towerRect(tower));
    });

    for (const tower of targets) {
      makeBossCollapse(runtime, boss, tower.x, tower.y, tower);
      runtime.damageTower(tower, CUBE_BOSS_CONTACT_DAMAGE, "physical");
    }

    boss.contactAttackBuffer -= CUBE_BOSS_CONTACT_INTERVAL;
  }
}

function triggerTetrahedronHalfHpBurst(runtime: BossRuntime, boss: CubeBoss) {
  if (boss.kind !== "tetrahedron" || boss.halfHpTriggered || boss.hp > boss.maxHp * 0.5) {
    return;
  }

  boss.halfHpTriggered = true;
  const charge = boss.skills.charge;
  if (charge) {
    charge.sp = charge.maxSp;
  }

  const waveNumber = runtime.wave || 0;
  for (let column = COLUMNS - 2; column < COLUMNS; column += 1) {
    const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
    for (let lane = 0; lane < LANES; lane += 1) {
      const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      spawnEnemyAt(runtime, {
        kind: "invertedTriangle",
        waveNumber,
        time: runtime.battleTime,
        lane,
        x,
        waveWeight: 0,
        finalDamageReduction: runtime.finalDamageReduction
      });
      makeTetrahedronCollapse(runtime.scene, x, y);
    }
  }
}

function triggerTetrahedronCriticalSummon(runtime: BossRuntime, boss: CubeBoss) {
  if (boss.kind !== "tetrahedron" || !boss.pendingCriticalSummon) {
    return;
  }

  boss.pendingCriticalSummon = false;
  const waveNumber = runtime.wave || 0;
  for (let column = COLUMNS - 5; column < COLUMNS; column += 1) {
    const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
    for (let lane = 0; lane < LANES; lane += 1) {
      const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      spawnEnemyAt(runtime, {
        kind: "invertedTriangle",
        waveNumber,
        time: runtime.battleTime,
        lane,
        x,
        waveWeight: 0,
        finalDamageReduction: runtime.finalDamageReduction
      });
      makeTetrahedronCollapse(runtime.scene, x, y);
    }
  }
}

function updateBossSkills(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  if (!boss.hasSkills) {
    return;
  }

  if (boss.kind === "tetrahedron") {
    updateTetrahedronSkills(runtime, boss, seconds);
    return;
  }

  chargeBossSkill(boss.skills.promotion, seconds);
  chargeBossSkill(boss.skills.advance, seconds);
  if (boss.skills.promotion2) {
    chargeBossSkill(boss.skills.promotion2, seconds);
    tryUsePromotionSkill(runtime, boss, boss.skills.promotion2, 2);
  }
  tryUsePromotionSkill(runtime, boss, boss.skills.promotion, 1);
  tryUseAdvanceSkill(runtime, boss);
}

function updateTetrahedronSkills(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  const charge = boss.skills.charge;
  const impact = boss.skills.impact;
  const suppression = boss.skills.suppression;
  const desperation = boss.skills.desperation;
  if (!charge || !impact || !suppression || !desperation) {
    return;
  }

  const naturalSkillSeconds = seconds * tetrahedronNaturalSkillRegenMultiplier(boss);
  chargeBossSkill(charge, naturalSkillSeconds);
  chargeBossSkill(impact, naturalSkillSeconds);
  chargeBossSkill(suppression, naturalSkillSeconds);
  if (boss.hp <= boss.maxHp * 0.5) {
    chargeBossSkill(desperation, naturalSkillSeconds);
  }

  const useCharge = isBossSkillReady(charge);
  const useImpact = isBossSkillReady(impact);
  const useSuppression = isBossSkillReady(suppression);
  const useDesperation = isBossSkillReady(desperation);

  if (useCharge) {
    spendBossSkill(charge);
  }
  if (useImpact) {
    spendBossSkill(impact);
  }
  if (useSuppression) {
    spendBossSkill(suppression);
  }
  if (useDesperation) {
    spendBossSkill(desperation);
  }

  if (useCharge) {
    boss.chargeExpiresAt = runtime.battleTime + TETRAHEDRON_BOSS_CHARGE_DURATION;
    gainBossSkillSp(suppression, TETRAHEDRON_BOSS_CHARGE_SUPPRESSION_SP_GAIN);
  }

  if (useImpact) {
    summonTetrahedronImpactMinions(runtime, boss);
    gainBossSkillSp(charge, TETRAHEDRON_BOSS_IMPACT_CHARGE_SP_GAIN);
  }

  if (useSuppression) {
    summonTetrahedronSuppressionMinions(runtime);
    gainBossSkillSp(impact, TETRAHEDRON_BOSS_SUPPRESSION_IMPACT_SP_GAIN);
  }

  if (useDesperation) {
    empowerEnemiesTouchingBoss(runtime, boss);
    gainBossSkillSp(charge, TETRAHEDRON_BOSS_DESPERATION_CHARGE_SP_GAIN);
  }

  if (runtime.battleTime >= boss.chargeExpiresAt) {
    return;
  }

  for (const enemy of runtime.enemies) {
    applyStatusEffect(enemy, "haste", boss.chargeExpiresAt - runtime.battleTime, runtime.battleTime);
  }
}

function tetrahedronNaturalSkillRegenMultiplier(boss: CubeBoss) {
  return boss.criticalHpTriggered ? 2 : 1;
}

function gainBossSkillSp(skill: BossSkill | undefined, amount: number) {
  if (!skill) {
    return;
  }

  skill.sp = Math.min(skill.maxSp, skill.sp + amount);
}

function empowerEnemiesTouchingBoss(runtime: BossRuntime, boss: CubeBoss) {
  const rect = bossRect(boss);
  for (const enemy of runtime.enemies) {
    if (!rect.contains(enemy.x, enemy.y)) {
      continue;
    }

    applyStatusEffect(enemy, "power", Number.POSITIVE_INFINITY, runtime.battleTime);
  }
}

function summonTetrahedronImpactMinions(runtime: BossRuntime, boss: CubeBoss) {
  const waveNumber = runtime.wave || 0;
  for (const point of bossAdvanceSpawnPoints(boss)) {
    for (const x of [point.x, point.x + CELL_WIDTH]) {
      spawnEnemyAt(runtime, {
        kind: "invertedTriangle",
        waveNumber,
        time: runtime.battleTime,
        lane: point.lane,
        x,
        waveWeight: 0,
        finalDamageReduction: runtime.finalDamageReduction
      });
      makeTetrahedronCollapse(runtime.scene, x, point.y);
    }
  }
}

function summonTetrahedronSuppressionMinions(runtime: BossRuntime) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + BOARD_WIDTH + 46;
  for (let lane = 0; lane < LANES; lane += 1) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    spawnEnemyAt(runtime, {
      kind: "shootingTriangle",
      waveNumber,
      time: runtime.battleTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    makeTetrahedronCollapse(runtime.scene, x, y);
  }
}

function tryUsePromotionSkill(
  runtime: BossRuntime,
  boss: CubeBoss,
  skill: CubeBoss["skills"]["promotion"] | NonNullable<CubeBoss["skills"]["promotion2"]>,
  fromRank: number
) {
  if (!isBossSkillReady(skill)) {
    return;
  }

  const targets = findPromotionTargets(boss, runtime.enemies, fromRank, 3);
  if (targets.length < 3) {
    return;
  }

  spendBossSkill(skill);
  for (const target of targets) {
    promoteEnemy(runtime, target);
  }
}

function tryUseAdvanceSkill(runtime: BossRuntime, boss: CubeBoss) {
  const skill = boss.skills.advance;
  if (!isBossSkillReady(skill)) {
    return;
  }

  spendBossSkill(skill);
  summonBossAdvanceMinions(runtime, boss);
}

function promoteEnemy(runtime: BossRuntime, enemy: Enemy) {
  const nextKind = promotedKind(enemy.kind);
  if (!nextKind || !runtime.enemies.includes(enemy)) {
    return;
  }

  applyEnemyPromotion(runtime.scene, enemy, nextKind, runtime.battleTime);
  makeCubeCollapse(runtime.scene, enemy.x, enemy.y, enemy, runtime.enemies, runtime.towers);
}

function summonBossAdvanceMinions(runtime: BossRuntime, boss: CubeBoss) {
  const waveNumber = runtime.wave || 0;
  for (const point of bossAdvanceSpawnPoints(boss)) {
    spawnEnemyAt(runtime, {
      kind: boss.advanceMinionKind,
      waveNumber,
      time: runtime.battleTime,
      lane: point.lane,
      x: point.x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    makeCubeCollapse(runtime.scene, point.x, point.y);
  }
}

function makeBossCollapse(
  runtime: BossRuntime,
  boss: CubeBoss,
  x: number,
  y: number,
  followTarget?: Enemy | Tower
) {
  if (boss.kind === "tetrahedron") {
    makeTetrahedronCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
    return;
  }

  makeCubeCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
}
