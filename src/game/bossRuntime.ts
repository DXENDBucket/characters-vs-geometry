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
  isDodecahedronBoss,
  isSmallStellatedDodecahedronBoss,
  isTetrahedronBoss,
  isBossSkillReady,
  spendBossSkill,
  updateCubeBossMotion
} from "../bosses/cubeBoss";
import {
  makeBossHasteTrail,
  makeCubeCollapse,
  makeDodecahedronCollapse,
  makeEnemyHitShards,
  makeEnemyInvincibleFlash,
  makeEnemyLaserEffect,
  makeSmallStellatedDodecahedronCollapse,
  makeTetrahedronCollapse
} from "../render/combatEffects";
import { syncDodecahedronCompanionShape } from "../render/unitShapes";
import type { BossCompanionActionPhase, BossSkill, CubeBoss, DamageType, Enemy, MortarProjectile, Tower } from "../types";
import { createBossSkillRegistry, runRegisteredBossSkills } from "./bossSkillRegistry";
import { enemyAttackMultiplier } from "./combatStats";
import { applyEnemyPromotion, enemyIsHighFlying, findPromotionTargets, promotedKind } from "./enemyBehaviors";
import { spawnEnemyAt } from "./enemyRuntime";
import { createMortarProjectile } from "./projectiles";
import { makeWingPulse, triggerAngelWings } from "./enemySupport";
import { applyStatusEffect, hasStatusEffect } from "./statusEffects";
import { bossRect, towerRect } from "./targeting";
import { isTrapArmed } from "./towers";
import { setBossBaseArmor, towerFinalStats } from "./unitStats";
import { volleyInterval } from "./upgrades";
import { getEnemyDefinition, enemyRank } from "../registry/enemies";

const DODECAHEDRON_COMPANION_KIND: Enemy["kind"] = "dodecahedronCompanion";
const DODECAHEDRON_COMPANION_COUNT = 3;
const DODECAHEDRON_COMPANION_ORBIT_RADIUS = CELL_WIDTH * 1.95;
const DODECAHEDRON_COMPANION_ORBIT_SPEED = 0.55;
const DODECAHEDRON_COMPANION_ARMOR_BREAK = 1_800;
const DODECAHEDRON_COMPANION_ATTACK_DELAYS: Record<BossCompanionActionPhase, number> = {
  laser: 20_000,
  mortar: 30_000,
  wings: 30_000
};
const DODECAHEDRON_COMPANION_LASER_FIRE_RATE = 4_000;
const DODECAHEDRON_COMPANION_MORTAR_FIRE_RATE = 15_000;
const DODECAHEDRON_COMPANION_MOTION_HOLD = 47_000;
const DODECAHEDRON_COMPANION_MOTION_TRANSITION = 1_000;
const DODECAHEDRON_COMPANION_MOTION_CYCLE = DODECAHEDRON_COMPANION_MOTION_HOLD * 2 + DODECAHEDRON_COMPANION_MOTION_TRANSITION * 2;
const DODECAHEDRON_COMPANION_FORMATION_LANE_OFFSETS = [0, -2, 2] as const;
const DODECAHEDRON_COMPANION_DEATH_INVINCIBLE_DURATION = 10_000;
const DODECAHEDRON_COMPANION_DEATH_LASER_SHOTS = 7;
const DODECAHEDRON_COMPANION_DEATH_MORTAR_TARGETS = 4;
const DODECAHEDRON_BOSS_ENDLESS_WINGS_DURATION = 7_000;
const DODECAHEDRON_BOSS_ENDLESS_WINGS_SPEED_MULTIPLIER = 2;

export interface BossRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  mortarProjectiles: MortarProjectile[];
  getBoss: () => CubeBoss | null;
  wave: number;
  battleTime: number;
  finalDamageReduction: number;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  triggerTrapTower: (tower: Tower, target: Enemy | "boss") => void;
  triggerShockTower: (tower: Tower) => void;
  runWhenBattleActive: (action: () => void) => void;
  endGame: () => void;
}

const bossSkillRegistry = createBossSkillRegistry<BossRuntime>({
  cube: [
    {
      skillKey: "promotion2",
      canUse: (runtime, boss) => canUsePromotionSkill(runtime, boss, 2),
      use: (runtime, boss) => usePromotionSkill(runtime, boss, 2)
    },
    {
      skillKey: "promotion",
      canUse: (runtime, boss) => canUsePromotionSkill(runtime, boss, 1),
      use: (runtime, boss) => usePromotionSkill(runtime, boss, 1)
    },
    {
      skillKey: "advance",
      use: (runtime, boss) => summonBossAdvanceMinions(runtime, boss)
    }
  ],
  tetrahedron: [
    {
      skillKey: "charge",
      chargeSeconds: tetrahedronSkillChargeSeconds,
      use: (runtime, boss) => {
        boss.chargeExpiresAt = runtime.battleTime + TETRAHEDRON_BOSS_CHARGE_DURATION;
        gainBossSkillSp(boss.skills.suppression, TETRAHEDRON_BOSS_CHARGE_SUPPRESSION_SP_GAIN);
      }
    },
    {
      skillKey: "impact",
      chargeSeconds: tetrahedronSkillChargeSeconds,
      use: (runtime, boss) => {
        summonTetrahedronImpactMinions(runtime, boss);
        gainBossSkillSp(boss.skills.charge, TETRAHEDRON_BOSS_IMPACT_CHARGE_SP_GAIN);
      }
    },
    {
      skillKey: "suppression",
      chargeSeconds: tetrahedronSkillChargeSeconds,
      use: (runtime, boss) => {
        summonTetrahedronSuppressionMinions(runtime, boss);
        gainBossSkillSp(boss.skills.impact, TETRAHEDRON_BOSS_SUPPRESSION_IMPACT_SP_GAIN);
      }
    },
    {
      skillKey: "desperation",
      chargeSeconds: tetrahedronSkillChargeSeconds,
      use: (runtime, boss) => {
        empowerEnemiesTouchingBoss(runtime, boss);
        gainBossSkillSp(boss.skills.charge, TETRAHEDRON_BOSS_DESPERATION_CHARGE_SP_GAIN);
      }
    }
  ]
});

export function updateBossRuntime(runtime: BossRuntime, seconds: number) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  updateCubeBossMotion(boss, seconds, bossMovementMultiplier(boss, runtime.battleTime), runtime.battleTime);
  updateDodecahedronCompanions(runtime, boss, seconds);
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

function updateDodecahedronCompanions(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  if (!isDodecahedronBoss(boss)) {
    return;
  }

  initializeDodecahedronCompanions(runtime, boss);
  const companions = runtime.enemies.filter((enemy) => enemy.kind === DODECAHEDRON_COMPANION_KIND);
  for (const companion of companions) {
    companion.bossOrbitAngle =
      (companion.bossOrbitAngle ?? Math.PI) + DODECAHEDRON_COMPANION_ORBIT_SPEED * seconds;
    syncDodecahedronCompanionPosition(companion, boss, runtime.battleTime);
    syncDodecahedronCompanionShape(companion.shape, boss, hasStatusEffect(companion, "invincible", runtime.battleTime));
    updateDodecahedronCompanionAction(runtime, companion);
  }

  handleDodecahedronCompanionDeaths(runtime, boss, companions);
  if (boss.companionsInitialized && !boss.companionArmorReduced && companions.length === 0) {
    boss.companionArmorReduced = true;
    setBossBaseArmor(boss, boss.baseStats.armor - DODECAHEDRON_COMPANION_ARMOR_BREAK);
  }
  updateDodecahedronEndlessWings(runtime, boss, seconds, companions);
}

function initializeDodecahedronCompanions(runtime: BossRuntime, boss: CubeBoss) {
  if (boss.companionsInitialized) {
    return;
  }

  boss.companionsInitialized = true;
  const waveNumber = runtime.wave || 0;
  for (let index = 0; index < DODECAHEDRON_COMPANION_COUNT; index += 1) {
    const angle = Math.PI + (Math.PI * 2 * index) / DODECAHEDRON_COMPANION_COUNT;
    spawnEnemyAt(runtime, {
      kind: DODECAHEDRON_COMPANION_KIND,
      waveNumber,
      time: runtime.battleTime,
      lane: Math.floor(LANES / 2),
      x: boss.x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    const companion = runtime.enemies[runtime.enemies.length - 1];
    companion.bossOrbitAngle = angle;
    companion.bossOrbitRadius = DODECAHEDRON_COMPANION_ORBIT_RADIUS;
    companion.bossCompanionIndex = index;
    companion.bossCompanionActionPhase = "laser";
    companion.bossCompanionNextActionAt = runtime.battleTime + DODECAHEDRON_COMPANION_ATTACK_DELAYS.laser;
    companion.body.setDepth(87);
    syncDodecahedronCompanionPosition(companion, boss, runtime.battleTime);
    syncDodecahedronCompanionShape(companion.shape, boss);
  }
}

function syncDodecahedronCompanionPosition(companion: Enemy, boss: CubeBoss, battleTime: number) {
  const position = dodecahedronCompanionPosition(companion, boss, battleTime);
  companion.x = position.x;
  companion.y = position.y;
  companion.lane = Phaser.Math.Clamp(Math.round((companion.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
  companion.body.setPosition(companion.x, companion.y);
}

function dodecahedronCompanionPosition(companion: Enemy, boss: CubeBoss, battleTime: number) {
  const orbit = dodecahedronCompanionOrbitPosition(companion, boss);
  const formation = dodecahedronCompanionFormationPosition(companion, boss);
  const cycle = battleTime % DODECAHEDRON_COMPANION_MOTION_CYCLE;

  if (cycle < DODECAHEDRON_COMPANION_MOTION_HOLD) {
    return orbit;
  }

  if (cycle < DODECAHEDRON_COMPANION_MOTION_HOLD + DODECAHEDRON_COMPANION_MOTION_TRANSITION) {
    const progress = (cycle - DODECAHEDRON_COMPANION_MOTION_HOLD) / DODECAHEDRON_COMPANION_MOTION_TRANSITION;
    return lerpPoint(orbit, formation, progress);
  }

  const formationEnd = DODECAHEDRON_COMPANION_MOTION_HOLD * 2 + DODECAHEDRON_COMPANION_MOTION_TRANSITION;
  if (cycle < formationEnd) {
    return formation;
  }

  const progress = (cycle - formationEnd) / DODECAHEDRON_COMPANION_MOTION_TRANSITION;
  return lerpPoint(formation, orbit, progress);
}

function dodecahedronCompanionOrbitPosition(companion: Enemy, boss: CubeBoss) {
  const angle = companion.bossOrbitAngle ?? Math.PI;
  const radius = companion.bossOrbitRadius ?? DODECAHEDRON_COMPANION_ORBIT_RADIUS;
  return {
    x: boss.x + Math.cos(angle) * radius,
    y: boss.y + Math.sin(angle) * radius
  };
}

function dodecahedronCompanionFormationPosition(companion: Enemy, boss: CubeBoss) {
  const index = companion.bossCompanionIndex ?? 0;
  const bossLane = Phaser.Math.Clamp(Math.round((boss.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
  const offset = DODECAHEDRON_COMPANION_FORMATION_LANE_OFFSETS[index] ?? 0;
  const lane = Phaser.Math.Clamp(bossLane + offset, 0, LANES - 1);
  return {
    x: bossRect(boss).left - CELL_WIDTH / 2,
    y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
  };
}

function lerpPoint(from: { x: number; y: number }, to: { x: number; y: number }, progress: number) {
  const clamped = Phaser.Math.Clamp(progress, 0, 1);
  return {
    x: Phaser.Math.Linear(from.x, to.x, clamped),
    y: Phaser.Math.Linear(from.y, to.y, clamped)
  };
}

function updateDodecahedronCompanionAction(runtime: BossRuntime, companion: Enemy) {
  const nextActionAt = companion.bossCompanionNextActionAt ?? runtime.battleTime + DODECAHEDRON_COMPANION_ATTACK_DELAYS.laser;
  if (runtime.battleTime < nextActionAt) {
    companion.bossCompanionNextActionAt = nextActionAt;
    return;
  }

  const phase = companion.bossCompanionActionPhase ?? "laser";
  if (phase === "laser") {
    fireDodecahedronCompanionLaserVolley(runtime, companion);
  } else if (phase === "mortar") {
    fireDodecahedronCompanionMortarVolley(runtime, companion);
  } else {
    triggerAngelWings(runtime.scene, runtime.enemies, companion, runtime.battleTime);
  }

  const nextPhase = nextDodecahedronCompanionActionPhase(phase);
  companion.bossCompanionActionPhase = nextPhase;
  companion.bossCompanionNextActionAt =
    runtime.battleTime + DODECAHEDRON_COMPANION_ATTACK_DELAYS[nextPhase];
}

function nextDodecahedronCompanionActionPhase(phase: BossCompanionActionPhase): BossCompanionActionPhase {
  if (phase === "laser") {
    return "mortar";
  }

  if (phase === "mortar") {
    return "wings";
  }

  return "laser";
}

function fireDodecahedronCompanionLaserVolley(runtime: BossRuntime, companion: Enemy) {
  const shots = 4 * enemyRank(companion.kind);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_LASER_FIRE_RATE, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireDodecahedronCompanionLaser(runtime, companion));
    });
  }
}

function fireDodecahedronCompanionLaser(runtime: BossRuntime, companion: Enemy) {
  if (!runtime.enemies.includes(companion)) {
    return;
  }

  const definition = getEnemyDefinition("shootingPentagon");
  const targets = runtime.towers
    .filter((tower) => tower.lane === companion.lane && tower.x < companion.x)
    .sort((a, b) => b.x - a.x);
  const stoppingTarget = targets.find((tower) => towerFinalStats(tower).magicResistance > 0);
  const hitTargets = stoppingTarget ? targets.filter((tower) => tower.x >= stoppingTarget.x) : targets;
  const endX = stoppingTarget?.x ?? BOARD_X;

  makeEnemyLaserEffect(runtime.scene, companion.x - 24, companion.y, endX);
  for (const tower of hitTargets) {
    makeEnemyHitShards(runtime.scene, tower.x, tower.y);
    runtime.damageTower(
      tower,
      definition.damage * enemyAttackMultiplier(companion, runtime.battleTime),
      definition.damageType
    );
  }
}

function fireDodecahedronCompanionMortarVolley(runtime: BossRuntime, companion: Enemy) {
  const target = findDodecahedronCompanionMortarTarget(runtime);
  if (!target) {
    return;
  }

  const shots = 2 * enemyRank(companion.kind);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_MORTAR_FIRE_RATE, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireDodecahedronCompanionMortar(runtime, companion));
    });
  }
}

function fireDodecahedronCompanionMortar(runtime: BossRuntime, companion: Enemy) {
  if (!runtime.enemies.includes(companion)) {
    return;
  }

  const target = findDodecahedronCompanionMortarTarget(runtime);
  if (!target) {
    return;
  }

  const definition = getEnemyDefinition("pentagon");
  runtime.mortarProjectiles.push(
    createMortarProjectile(runtime.scene, {
      owner: "enemy",
      fromX: companion.x,
      fromY: companion.y,
      targetX: target.x,
      targetY: target.y,
      damage: definition.damage * enemyAttackMultiplier(companion, runtime.battleTime),
      damageType: definition.damageType,
      rangeX: CELL_WIDTH * 1.5,
      rangeY: CELL_HEIGHT * 1.5,
      marker: "text",
      markerText: "#",
      markerTextColor: "#ff6464",
      sourceEnemy: companion,
      targetTower: target
    })
  );
}

function findDodecahedronCompanionMortarTarget(runtime: BossRuntime) {
  return [...runtime.towers].sort((a, b) => b.level - a.level || b.placedOrder - a.placedOrder)[0];
}

function handleDodecahedronCompanionDeaths(runtime: BossRuntime, boss: CubeBoss, livingCompanions: Enemy[]) {
  const deadCount = DODECAHEDRON_COMPANION_COUNT - livingCompanions.length;
  while (boss.companionDeathsHandled < deadCount) {
    boss.companionDeathsHandled += 1;
    triggerDodecahedronCompanionDeath(runtime, boss, boss.companionDeathsHandled, livingCompanions);
  }
}

function triggerDodecahedronCompanionDeath(
  runtime: BossRuntime,
  boss: CubeBoss,
  deathNumber: number,
  livingCompanions: Enemy[]
) {
  for (const companion of livingCompanions) {
    applyStatusEffect(
      companion,
      "invincible",
      DODECAHEDRON_COMPANION_DEATH_INVINCIBLE_DURATION,
      runtime.battleTime
    );
    makeEnemyInvincibleFlash(runtime.scene, companion.x, companion.y);
  }

  if (deathNumber === 1) {
    fireDodecahedronDeathLaserVolley(runtime, boss);
  } else if (deathNumber === 2) {
    fireDodecahedronDeathMortars(runtime, boss);
  }
}

function fireDodecahedronDeathLaserVolley(runtime: BossRuntime, boss: CubeBoss) {
  const interval = volleyInterval(DODECAHEDRON_COMPANION_LASER_FIRE_RATE, DODECAHEDRON_COMPANION_DEATH_LASER_SHOTS);
  for (let shotIndex = 0; shotIndex < DODECAHEDRON_COMPANION_DEATH_LASER_SHOTS; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireDodecahedronDeathLasers(runtime, boss));
    });
  }
}

function fireDodecahedronDeathLasers(runtime: BossRuntime, boss: CubeBoss) {
  if (runtime.getBoss() !== boss) {
    return;
  }

  const centerLane = bossLane(boss);
  const lanes = [centerLane - 1, centerLane, centerLane + 1].filter((lane) => lane >= 0 && lane < LANES);
  const fromX = bossRect(boss).left;
  for (const lane of lanes) {
    fireDodecahedronLaserInLane(runtime, fromX, lane);
  }
}

function fireDodecahedronLaserInLane(runtime: BossRuntime, fromX: number, lane: number) {
  const definition = getEnemyDefinition("shootingPentagon");
  const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const targets = runtime.towers
    .filter((tower) => tower.lane === lane && tower.x < fromX)
    .sort((a, b) => b.x - a.x);
  const stoppingTarget = targets.find((tower) => towerFinalStats(tower).magicResistance > 0);
  const hitTargets = stoppingTarget ? targets.filter((tower) => tower.x >= stoppingTarget.x) : targets;
  const endX = stoppingTarget?.x ?? BOARD_X;

  makeEnemyLaserEffect(runtime.scene, fromX, y, endX);
  for (const tower of hitTargets) {
    makeEnemyHitShards(runtime.scene, tower.x, tower.y);
    runtime.damageTower(tower, definition.damage, definition.damageType);
  }
}

function fireDodecahedronDeathMortars(runtime: BossRuntime, boss: CubeBoss) {
  const targets = findDodecahedronPentagonTargets(runtime, DODECAHEDRON_COMPANION_DEATH_MORTAR_TARGETS);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_MORTAR_FIRE_RATE, DODECAHEDRON_COMPANION_DEATH_MORTAR_TARGETS);
  targets.forEach((target, index) => {
    runtime.scene.time.delayedCall(index * interval, () => {
      runtime.runWhenBattleActive(() => fireDodecahedronBossMortar(runtime, boss, target));
    });
  });
}

function fireDodecahedronBossMortar(runtime: BossRuntime, boss: CubeBoss, target: Tower) {
  if (runtime.getBoss() !== boss || !runtime.towers.includes(target)) {
    return;
  }

  const definition = getEnemyDefinition("pentagon");
  runtime.mortarProjectiles.push(
    createMortarProjectile(runtime.scene, {
      owner: "enemy",
      fromX: bossRect(boss).left,
      fromY: boss.y,
      targetX: target.x,
      targetY: target.y,
      damage: definition.damage,
      damageType: definition.damageType,
      rangeX: CELL_WIDTH * 1.5,
      rangeY: CELL_HEIGHT * 1.5,
      marker: "text",
      markerText: "#",
      markerTextColor: "#ff6464",
      targetTower: target
    })
  );
}

function findDodecahedronPentagonTargets(runtime: BossRuntime, count: number) {
  return [...runtime.towers].sort((a, b) => b.level - a.level || b.placedOrder - a.placedOrder).slice(0, count);
}

function updateDodecahedronEndlessWings(
  runtime: BossRuntime,
  boss: CubeBoss,
  seconds: number,
  livingCompanions: Enemy[]
) {
  const skill = boss.skills.endlessWings;
  if (!skill || livingCompanions.length > 0) {
    return;
  }

  chargeBossSkill(skill, seconds);
  if (!isBossSkillReady(skill)) {
    return;
  }

  const rect = bossRect(boss);
  const targets = runtime.enemies.filter((enemy) => {
    return rect.contains(enemy.x, enemy.y) && !enemyIsHighFlying(enemy) && !hasStatusEffect(enemy, "flying", runtime.battleTime);
  });
  if (targets.length === 0) {
    return;
  }

  spendBossSkill(skill);
  for (const target of targets) {
    applyStatusEffect(
      target,
      "flying",
      DODECAHEDRON_BOSS_ENDLESS_WINGS_DURATION,
      runtime.battleTime,
      DODECAHEDRON_BOSS_ENDLESS_WINGS_SPEED_MULTIPLIER,
      true
    );
    makeWingPulse(runtime.scene, target.x, target.y);
  }
}

function bossLane(boss: CubeBoss) {
  return Phaser.Math.Clamp(Math.round((boss.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
}

function bossMovementMultiplier(boss: CubeBoss, time: number) {
  return isTetrahedronBoss(boss) && time < boss.bossHasteUntil ? TETRAHEDRON_BOSS_HASTE_MULTIPLIER : 1;
}

function updateBossHasteVisual(runtime: BossRuntime, boss: CubeBoss) {
  if (!isTetrahedronBoss(boss) || runtime.battleTime >= boss.bossHasteUntil) {
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

    if (tower.type === "F" || tower.type === "f" || tower.type === "l") {
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
  if (!isTetrahedronBoss(boss) || boss.halfHpTriggered || boss.hp > boss.maxHp * 0.5) {
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
        kind: tetrahedronInvertedKind(boss),
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
  if (!isTetrahedronBoss(boss) || !boss.pendingCriticalSummon) {
    return;
  }

  boss.pendingCriticalSummon = false;
  const waveNumber = runtime.wave || 0;
  for (let column = COLUMNS - 5; column < COLUMNS; column += 1) {
    const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
    for (let lane = 0; lane < LANES; lane += 1) {
      const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      spawnEnemyAt(runtime, {
        kind: tetrahedronInvertedKind(boss),
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

  if (isTetrahedronBoss(boss)) {
    updateTetrahedronSkills(runtime, boss, seconds);
    return;
  }

  runRegisteredBossSkills(runtime, boss, bossSkillRegistry.cube, seconds);
}

function updateTetrahedronSkills(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  runRegisteredBossSkills(runtime, boss, bossSkillRegistry.tetrahedron, seconds);

  if (runtime.battleTime >= boss.chargeExpiresAt) {
    return;
  }

  for (const enemy of runtime.enemies) {
    applyStatusEffect(
      enemy,
      "haste",
      boss.chargeExpiresAt - runtime.battleTime,
      runtime.battleTime,
      tetrahedronChargeSpeedMultiplier(boss)
    );
  }
}

function tetrahedronSkillChargeSeconds(_runtime: BossRuntime, boss: CubeBoss, skill: BossSkill, seconds: number) {
  if (skill.name === "desperation" && boss.hp > boss.maxHp * 0.5) {
    return 0;
  }

  return seconds * tetrahedronNaturalSkillRegenMultiplier(boss);
}

function tetrahedronNaturalSkillRegenMultiplier(boss: CubeBoss) {
  return boss.criticalHpTriggered ? 2 : 1;
}

function tetrahedronChargeSpeedMultiplier(boss: CubeBoss) {
  return boss.rank >= 2 ? 2.5 : 2;
}

function tetrahedronInvertedKind(boss: CubeBoss): Enemy["kind"] {
  return boss.rank >= 2 ? "invertedTriangle2" : "invertedTriangle";
}

function tetrahedronShootingKind(boss: CubeBoss): Enemy["kind"] {
  return boss.rank >= 2 ? "shootingTriangle2" : "shootingTriangle";
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
        kind: tetrahedronInvertedKind(boss),
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

function summonTetrahedronSuppressionMinions(runtime: BossRuntime, boss: CubeBoss) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + BOARD_WIDTH + 46;
  for (let lane = 0; lane < LANES; lane += 1) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    spawnEnemyAt(runtime, {
      kind: tetrahedronShootingKind(boss),
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

function canUsePromotionSkill(runtime: BossRuntime, boss: CubeBoss, fromRank: number) {
  const targets = findPromotionTargets(boss, runtime.enemies, fromRank, 3);
  return targets.length >= 3;
}

function usePromotionSkill(runtime: BossRuntime, boss: CubeBoss, fromRank: number) {
  for (const target of findPromotionTargets(boss, runtime.enemies, fromRank, 3)) {
    promoteEnemy(runtime, target);
  }
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
  if (isTetrahedronBoss(boss)) {
    makeTetrahedronCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
    return;
  }

  if (isDodecahedronBoss(boss)) {
    makeDodecahedronCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
    return;
  }

  if (isSmallStellatedDodecahedronBoss(boss)) {
    makeSmallStellatedDodecahedronCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
    return;
  }

  makeCubeCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
}
