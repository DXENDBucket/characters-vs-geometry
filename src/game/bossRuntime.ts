import Phaser from "phaser";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  BOSS_HITBOX_HEIGHT,
  BOSS_HITBOX_WIDTH,
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
  bossRank,
  chargeBossSkill,
  createCubeBoss,
  isDodecahedronBoss,
  isIcosahedronBoss,
  isOctahedronBoss,
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
  makeIcosahedronCollapse,
  makeOctahedronCollapse,
  makeSmallStellatedDodecahedronCollapse,
  makeTetrahedronCollapse
} from "../render/combatEffects";
import { syncDodecahedronCompanionShape } from "../render/unitShapes";
import type { BossCompanionActionPhase, BossSkill, CubeBoss, DamageType, Enemy, MortarProjectile, Tower } from "../types";
import { createBossSkillRegistry, runRegisteredBossSkills } from "./bossSkillRegistry";
import { enemyAttackMultiplier } from "./combatStats";
import { applyEnemyPromotion, enemyIsHighFlying, findPromotionTargets, promotedKind } from "./enemyBehaviors";
import { spawnEnemyAt } from "./enemyRuntime";
import { forEachSnapshot } from "./iteration";
import { createMortarProjectile } from "./projectiles";
import { SOLAR_BOMB_KIND } from "./solarBomb";
import { makeWingPulse, triggerAngelWings } from "./enemySupport";
import { applyStatusEffect, hasStatusEffect } from "./statusEffects";
import {
  bossBounds,
  findBossPart,
  forEachBossPart,
  latestPlacedTower,
  latestPlacedTowers,
  pointInBounds,
  type RectBounds
} from "./targeting";
import { isTrapArmed } from "./towers";
import { towerFinalStats } from "./unitStats";
import { volleyInterval } from "./upgrades";
import { getEnemyDefinition, enemyRank } from "../registry/enemies";

const DODECAHEDRON_COMPANION_KIND: Enemy["kind"] = "dodecahedronCompanion";
const DODECAHEDRON_COMPANION2_KIND: Enemy["kind"] = "dodecahedronCompanion2";
const DODECAHEDRON_COMPANION_COUNT = 3;
const DODECAHEDRON_COMPANION_ORBIT_RADIUS = CELL_WIDTH * 1.95;
const DODECAHEDRON_COMPANION_ORBIT_SPEED = 0.55;
const DODECAHEDRON_COMPANION_ATTACK_DELAYS: Record<BossCompanionActionPhase, number> = {
  laser: 20_000,
  mortar: 30_000,
  wings: 30_000
};
const DODECAHEDRON_COMPANION_LASER_INTERVAL = 4_000;
const DODECAHEDRON_COMPANION_MORTAR_INTERVAL = 15_000;
const DODECAHEDRON_COMPANION_MOTION_HOLD = 47_000;
const DODECAHEDRON_COMPANION_MOTION_TRANSITION = 1_000;
const DODECAHEDRON_COMPANION_MOTION_CYCLE = DODECAHEDRON_COMPANION_MOTION_HOLD * 2 + DODECAHEDRON_COMPANION_MOTION_TRANSITION * 2;
const DODECAHEDRON_COMPANION_FORMATION_LANE_OFFSETS = [0, -2, 2] as const;
const DODECAHEDRON_COMPANION_DEATH_INVINCIBLE_DURATION = 10_000;
const DODECAHEDRON_COMPANION_DEATH_LASER_SHOTS = 7;
const ALL_BOARD_LANES: readonly number[] = (() => {
  const lanes: number[] = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    lanes.push(lane);
  }
  return lanes;
})();
const DODECAHEDRON_COMPANION_DEATH_MORTAR_TARGETS = 4;
const DODECAHEDRON_BOSS_ENDLESS_WINGS_DURATION = 7_000;
const DODECAHEDRON_BOSS_ENDLESS_WINGS_SPEED_MULTIPLIER = 2;
const dodecahedronCompanionBuffer: Enemy[] = [];
const bossContactTowerBuffer: Tower[] = [];
const OCTAHEDRON_SOLAR_BOMB_LANES = [1, 5] as const;
const OCTAHEDRON_REINFORCEMENT_DELAY = 500;
const OCTAHEDRON_HEART_REINFORCEMENT_LANES = [1, 3, 5] as const;
const OCTAHEDRON_BURROW_REINFORCEMENT_LANES = [1, 3, 5] as const;
const OCTAHEDRON_REINFORCEMENTS: Array<{
  delay: number;
  kind: Enemy["kind"];
  lanes: readonly number[];
}> = [
  { delay: 0, kind: "hexSpellBulwark", lanes: allBoardLanes() },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY, kind: "burrowArrow", lanes: OCTAHEDRON_BURROW_REINFORCEMENT_LANES },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 2, kind: "heart", lanes: OCTAHEDRON_HEART_REINFORCEMENT_LANES },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 3, kind: "slopeTriangle", lanes: allBoardLanes() },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 4, kind: "archangelHeptagon", lanes: allBoardLanes() }
];
const OCTAHEDRON2_REINFORCEMENTS: Array<{
  delay: number;
  kind: Enemy["kind"];
  lanes: readonly number[];
}> = [
  { delay: 0, kind: "hexSpellBulwark2", lanes: allBoardLanes() },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY, kind: "burrowArrow2", lanes: OCTAHEDRON_BURROW_REINFORCEMENT_LANES },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 2, kind: "heart2", lanes: OCTAHEDRON_HEART_REINFORCEMENT_LANES },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 3, kind: "slopeTriangle2", lanes: allBoardLanes() },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 4, kind: "archangelHeptagon2", lanes: allBoardLanes() }
];

export interface BossRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  mortarProjectiles: MortarProjectile[];
  getBoss: () => CubeBoss | null;
  wave: number;
  bossPhaseIndex: number;
  battleTime: number;
  finalDamageReduction: number;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  triggerTrapTower: (tower: Tower, target: Enemy | CubeBoss | "boss") => void;
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
  ],
  icosahedron: [
    {
      skillKey: "ultimateAdvance",
      chargeSeconds: (runtime, _boss, _skill, seconds) => (runtime.bossPhaseIndex === 0 ? seconds : 0),
      canUse: (runtime) => runtime.bossPhaseIndex === 0,
      use: (runtime, boss) => summonIcosahedronUltimateAdvance(runtime, boss)
    },
    {
      skillKey: "heartbeatAlpha",
      chargeSeconds: (runtime, _boss, _skill, seconds) => (runtime.bossPhaseIndex === 0 ? seconds : 0),
      canUse: (runtime) => runtime.bossPhaseIndex === 0,
      use: (runtime, boss) => summonIcosahedronHearts(runtime, boss, [1, 3, 5])
    },
    {
      skillKey: "heartbeatBeta",
      chargeSeconds: (runtime, _boss, _skill, seconds) => (runtime.bossPhaseIndex === 0 ? seconds : 0),
      canUse: (runtime) => runtime.bossPhaseIndex === 0,
      use: (runtime, boss) => summonIcosahedronHearts(runtime, boss, [0, 2, 4, 6])
    },
    {
      skillKey: "leap",
      chargeSeconds: (runtime, _boss, _skill, seconds) => (runtime.bossPhaseIndex === 1 ? seconds : 0),
      canUse: (runtime) => runtime.bossPhaseIndex === 1,
      use: (runtime) => summonIcosahedronSlopeTriangles(runtime)
    }
  ]
});

export function updateBossRuntime(runtime: BossRuntime, seconds: number) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  initializeOctahedronSolarBombs(runtime, boss);
  updateBossPartsMotion(runtime, boss, seconds);
  triggerOctahedronSplits(runtime, boss);
  syncOctahedronSharedHp(boss);
  updateDodecahedronCompanions(runtime, boss, seconds);
  updateBossHasteVisual(runtime, boss);
  triggerTetrahedronHalfHpBurst(runtime, boss);
  triggerTetrahedronCriticalSummon(runtime, boss);
  updateBossSkills(runtime, boss, seconds);
  const removedByFunctionalTower = findBossPart(boss, (part) => {
    triggerFunctionalTowersTouchingBoss(runtime, part);
    return !runtime.getBoss();
  });
  if (removedByFunctionalTower || !runtime.getBoss()) {
    return;
  }

  const removedByContactDamage = findBossPart(boss, (part) => {
    damageBossTouchingTowers(runtime, part, seconds);
    return !runtime.getBoss();
  });
  if (removedByContactDamage || !runtime.getBoss()) {
    return;
  }

  if (findBossPart(boss, bossPartReachesBase)) {
    runtime.endGame();
  }
}

function updateBossPartsMotion(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  forEachBossPart(boss, (part) => {
    updateCubeBossMotion(part, seconds, bossMovementMultiplier(part, runtime.battleTime), runtime.battleTime);
  });
}

function bossPartReachesBase(boss: CubeBoss) {
  return (boss.movementAxis ?? "x") === "x" && (boss.movementDirection ?? -1) < 0 && bossBounds(boss).left <= BOARD_X - 20;
}

function triggerOctahedronSplits(runtime: BossRuntime, boss: CubeBoss) {
  if (!isOctahedronBoss(boss)) {
    return;
  }

  if (!boss.octahedronSpawn75Triggered && boss.hp <= boss.maxHp * 0.75) {
    boss.octahedronSpawn75Triggered = true;
    spawnOctahedronCopy(runtime, boss, {
      x: BOARD_X + BOSS_HITBOX_WIDTH / 2,
      y: BOARD_Y + BOARD_HEIGHT / 2,
      movementAxis: "x",
      movementDirection: 1
    });
  }

  if (!boss.octahedronSpawn50Triggered && boss.hp <= boss.maxHp * 0.5) {
    boss.octahedronSpawn50Triggered = true;
    spawnOctahedronCopy(runtime, boss, {
      x: BOARD_X + 7.5 * CELL_WIDTH,
      y: BOARD_Y + BOSS_HITBOX_HEIGHT / 2,
      movementAxis: "y",
      movementDirection: 1
    });
  }

  if (!boss.octahedronSpawn25Triggered && boss.hp <= boss.maxHp * 0.25) {
    boss.octahedronSpawn25Triggered = true;
    spawnOctahedronCopy(runtime, boss, {
      x: BOARD_X + 4.5 * CELL_WIDTH,
      y: BOARD_Y + BOARD_HEIGHT - BOSS_HITBOX_HEIGHT / 2,
      movementAxis: "y",
      movementDirection: -1,
      triggerReinforcements: true
    });
  }
}

function spawnOctahedronCopy(
  runtime: BossRuntime,
  boss: CubeBoss,
  options: {
    x: number;
    y: number;
    movementAxis: "x" | "y";
    movementDirection: -1 | 1;
    triggerReinforcements?: boolean;
  }
) {
  const copy = createCubeBoss(runtime.scene, boss.kind, runtime.finalDamageReduction, options);
  if (boss.maxHp !== copy.maxHp) {
    copy.baseStats.maxHp = boss.maxHp;
    copy.maxHp = boss.maxHp;
    copy.finalStats.maxHp = boss.maxHp;
  }
  copy.hp = boss.hp;
  copy.body.setDepth(87);
  copy.octahedronCopies = undefined;
  boss.octahedronCopies ??= [];
  boss.octahedronCopies.push(copy);
  triggerOctahedronInvincibilityCycle(runtime, boss);
  if (options.triggerReinforcements) {
    scheduleOctahedronReinforcements(runtime, boss);
  }
  makeOctahedronCollapse(runtime.scene, options.x, options.y);
}

function syncOctahedronSharedHp(boss: CubeBoss) {
  for (const copy of boss.octahedronCopies ?? []) {
    copy.hp = boss.hp;
    copy.maxHp = boss.maxHp;
  }
}

function initializeOctahedronSolarBombs(runtime: BossRuntime, boss: CubeBoss) {
  if (!isOctahedronBoss(boss) || boss.octahedronSolarBombsInitialized) {
    return;
  }

  boss.octahedronSolarBombsInitialized = true;
  triggerOctahedronInvincibilityCycle(runtime, boss);
}

function triggerOctahedronInvincibilityCycle(runtime: BossRuntime, boss: CubeBoss) {
  forEachBossPart(boss, (part) => {
    part.invincibleUntil = Number.POSITIVE_INFINITY;
  });

  spawnOctahedronSolarBombs(runtime);
}

function spawnOctahedronSolarBombs(runtime: BossRuntime) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + (COLUMNS - 0.5) * CELL_WIDTH;
  for (const lane of OCTAHEDRON_SOLAR_BOMB_LANES) {
    spawnEnemyAt(runtime, {
      kind: SOLAR_BOMB_KIND,
      waveNumber,
      time: runtime.battleTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction,
      movementDirection: -1
    });
  }
}

function scheduleOctahedronReinforcements(runtime: BossRuntime, boss: CubeBoss) {
  const reinforcements = bossRank(boss.kind) >= 2 ? OCTAHEDRON2_REINFORCEMENTS : OCTAHEDRON_REINFORCEMENTS;
  for (const wave of reinforcements) {
    runtime.scene.time.delayedCall(wave.delay, () => {
      runtime.runWhenBattleActive(() => {
        if (runtime.getBoss() !== boss) {
          return;
        }

        spawnOctahedronReinforcementWave(runtime, wave.kind, wave.lanes, runtime.battleTime);
      });
    });
  }
}

function spawnOctahedronReinforcementWave(
  runtime: BossRuntime,
  kind: Enemy["kind"],
  lanes: readonly number[],
  time: number
) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + BOARD_WIDTH + 46;
  for (const lane of lanes) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    spawnEnemyAt(runtime, {
      kind,
      waveNumber,
      time,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    makeOctahedronCollapse(runtime.scene, x, y);
  }
}

function allBoardLanes() {
  return ALL_BOARD_LANES;
}

function updateDodecahedronCompanions(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  if (!isDodecahedronBoss(boss)) {
    return;
  }

  initializeDodecahedronCompanions(runtime, boss);
  const companions = collectDodecahedronCompanions(runtime.enemies);
  for (const companion of companions) {
    if (hasStatusEffect(companion, "frozen", runtime.battleTime)) {
      continue;
    }

    companion.bossOrbitAngle =
      (companion.bossOrbitAngle ?? Math.PI) + DODECAHEDRON_COMPANION_ORBIT_SPEED * seconds;
    syncDodecahedronCompanionPosition(companion, boss, runtime.battleTime);
    syncDodecahedronCompanionShape(companion.shape, boss, hasStatusEffect(companion, "invincible", runtime.battleTime));
    updateDodecahedronCompanionAction(runtime, companion);
  }

  handleDodecahedronCompanionDeaths(runtime, boss, companions);
  updateDodecahedronEndlessWings(runtime, boss, seconds, companions);
}

function collectDodecahedronCompanions(enemies: Enemy[]) {
  dodecahedronCompanionBuffer.length = 0;
  for (const enemy of enemies) {
    if (enemyIsDodecahedronCompanion(enemy)) {
      dodecahedronCompanionBuffer.push(enemy);
    }
  }
  return dodecahedronCompanionBuffer;
}

function initializeDodecahedronCompanions(runtime: BossRuntime, boss: CubeBoss) {
  if (boss.companionsInitialized) {
    return;
  }

  boss.companionsInitialized = true;
  const waveNumber = runtime.wave || 0;
  const companionKind = dodecahedronCompanionKindForBoss(boss);
  for (let index = 0; index < DODECAHEDRON_COMPANION_COUNT; index += 1) {
    const angle = Math.PI + (Math.PI * 2 * index) / DODECAHEDRON_COMPANION_COUNT;
    spawnEnemyAt(runtime, {
      kind: companionKind,
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

function dodecahedronCompanionKindForBoss(boss: CubeBoss): Enemy["kind"] {
  return boss.rank >= 2 ? DODECAHEDRON_COMPANION2_KIND : DODECAHEDRON_COMPANION_KIND;
}

function enemyIsDodecahedronCompanion(enemy: Enemy) {
  return enemy.kind === DODECAHEDRON_COMPANION_KIND || enemy.kind === DODECAHEDRON_COMPANION2_KIND;
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
    x: bossBounds(boss).left - CELL_WIDTH / 2,
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
  const interval = volleyInterval(DODECAHEDRON_COMPANION_LASER_INTERVAL, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireDodecahedronCompanionLaser(runtime, companion));
    });
  }
}

function fireDodecahedronCompanionLaser(runtime: BossRuntime, companion: Enemy) {
  if (!companion.inPlay) {
    return;
  }

  const definition = getEnemyDefinition("shootingPentagon");
  const laserPath = leftwardDodecahedronLaserPath(runtime.towers, companion.lane, companion.x);

  makeEnemyLaserEffect(runtime.scene, companion.x - 24, companion.y, laserPath.endX);
  for (const tower of laserPath.targets) {
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
  const interval = volleyInterval(DODECAHEDRON_COMPANION_MORTAR_INTERVAL, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireDodecahedronCompanionMortar(runtime, companion));
    });
  }
}

function fireDodecahedronCompanionMortar(runtime: BossRuntime, companion: Enemy) {
  if (!companion.inPlay) {
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
  return latestPlacedTower(runtime.towers);
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
  const shots = dodecahedronDeathLaserShots(boss);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_LASER_INTERVAL, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    runtime.scene.time.delayedCall(shotIndex * interval, () => {
      runtime.runWhenBattleActive(() => fireDodecahedronDeathLasers(runtime, boss));
    });
  }
}

function dodecahedronDeathLaserShots(boss: CubeBoss) {
  return boss.rank >= 2 ? 14 : DODECAHEDRON_COMPANION_DEATH_LASER_SHOTS;
}

function fireDodecahedronDeathLasers(runtime: BossRuntime, boss: CubeBoss) {
  if (runtime.getBoss() !== boss) {
    return;
  }

  const centerLane = bossLane(boss);
  const fromX = bossBounds(boss).left;
  const startLane = Math.max(0, centerLane - 1);
  const endLane = Math.min(LANES - 1, centerLane + 1);
  for (let lane = startLane; lane <= endLane; lane += 1) {
    fireDodecahedronLaserInLane(runtime, fromX, lane);
  }
}

function fireDodecahedronLaserInLane(runtime: BossRuntime, fromX: number, lane: number) {
  const definition = getEnemyDefinition("shootingPentagon");
  const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const laserPath = leftwardDodecahedronLaserPath(runtime.towers, lane, fromX);

  makeEnemyLaserEffect(runtime.scene, fromX, y, laserPath.endX);
  for (const tower of laserPath.targets) {
    makeEnemyHitShards(runtime.scene, tower.x, tower.y);
    runtime.damageTower(tower, definition.damage, definition.damageType);
  }
}

function leftwardDodecahedronLaserPath(towers: Tower[], lane: number, fromX: number) {
  const stoppingX = leftwardLaserStoppingX(towers, lane, fromX);
  const targets: Tower[] = [];
  for (const tower of towers) {
    if (tower.lane !== lane || tower.x >= fromX || (stoppingX !== undefined && tower.x < stoppingX)) {
      continue;
    }

    insertTowerByDescendingX(targets, tower);
  }

  return {
    endX: stoppingX ?? BOARD_X,
    targets
  };
}

function leftwardLaserStoppingX(towers: Tower[], lane: number, fromX: number) {
  let stoppingX: number | undefined;
  for (const tower of towers) {
    if (tower.lane !== lane || tower.x >= fromX || towerFinalStats(tower).magicResistance <= 0) {
      continue;
    }

    if (stoppingX === undefined || tower.x > stoppingX) {
      stoppingX = tower.x;
    }
  }
  return stoppingX;
}

function insertTowerByDescendingX(targets: Tower[], tower: Tower) {
  let index = 0;
  while (index < targets.length && targets[index].x >= tower.x) {
    index += 1;
  }
  targets.splice(index, 0, tower);
}

function fireDodecahedronDeathMortars(runtime: BossRuntime, boss: CubeBoss) {
  const targetCount = dodecahedronDeathMortarTargetCount(boss);
  const targets = findDodecahedronPentagonTargets(runtime, targetCount);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_MORTAR_INTERVAL, targetCount);
  targets.forEach((target, index) => {
    runtime.scene.time.delayedCall(index * interval, () => {
      runtime.runWhenBattleActive(() => fireDodecahedronBossMortar(runtime, boss, target));
    });
  });
}

function dodecahedronDeathMortarTargetCount(boss: CubeBoss) {
  return boss.rank >= 2 ? 6 : DODECAHEDRON_COMPANION_DEATH_MORTAR_TARGETS;
}

function fireDodecahedronBossMortar(runtime: BossRuntime, boss: CubeBoss, target: Tower) {
  if (runtime.getBoss() !== boss || !target.inPlay) {
    return;
  }

  const definition = getEnemyDefinition("pentagon");
  runtime.mortarProjectiles.push(
    createMortarProjectile(runtime.scene, {
      owner: "enemy",
      fromX: bossBounds(boss).left,
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
  return latestPlacedTowers(runtime.towers, count);
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

  const bounds = bossBounds(boss);
  let spent = false;
  for (const target of runtime.enemies) {
    if (
      !pointInBounds(bounds, target.x, target.y) ||
      enemyIsHighFlying(target) ||
      hasStatusEffect(target, "flying", runtime.battleTime)
    ) {
      continue;
    }

    if (!spent) {
      spendBossSkill(skill);
      spent = true;
    }

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
  const bounds = bossBounds(boss);
  forEachSnapshot(runtime.towers, (tower) => {
    if (!towerIntersectsBossBounds(tower, bounds)) {
      return;
    }

    if (tower.type === "G" && isTrapArmed(tower, runtime.battleTime)) {
      runtime.triggerTrapTower(tower, boss);
      if (!runtime.getBoss()) {
        return false;
      }
      return;
    }

    if (tower.type === "F" || tower.type === "f" || tower.type === "i" || tower.type === "l") {
      runtime.triggerShockTower(tower);
    }
  });
}

function damageBossTouchingTowers(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  boss.contactAttackBuffer += seconds;
  if (boss.contactAttackBuffer < CUBE_BOSS_CONTACT_INTERVAL) {
    return;
  }

  while (boss.contactAttackBuffer >= CUBE_BOSS_CONTACT_INTERVAL) {
    const targets = bossContactTowerBuffer;
    targets.length = 0;
    const bounds = bossBounds(boss);
    try {
      for (const tower of runtime.towers) {
        if (towerIntersectsBossBounds(tower, bounds)) {
          targets.push(tower);
        }
      }

      for (const tower of targets) {
        makeBossCollapse(runtime, boss, tower.x, tower.y, tower);
        runtime.damageTower(tower, CUBE_BOSS_CONTACT_DAMAGE, "physical");
      }
    } finally {
      targets.length = 0;
    }

    boss.contactAttackBuffer -= CUBE_BOSS_CONTACT_INTERVAL;
  }
}

function towerIntersectsBossBounds(tower: Tower, bounds: RectBounds) {
  return (
    tower.x - CELL_WIDTH / 2 <= bounds.right &&
    tower.x + CELL_WIDTH / 2 >= bounds.left &&
    tower.y - CELL_HEIGHT / 2 <= bounds.bottom &&
    tower.y + CELL_HEIGHT / 2 >= bounds.top
  );
}

function triggerTetrahedronHalfHpBurst(runtime: BossRuntime, boss: CubeBoss) {
  if (!bossUsesTetrahedronKit(runtime, boss) || boss.halfHpTriggered || boss.hp > boss.maxHp * 0.5) {
    return;
  }

  boss.halfHpTriggered = true;
  const charge = boss.skills.charge;
  if (charge) {
    charge.sp = charge.maxSp;
  }

  const waveNumber = runtime.wave || 0;
  const columnCount = isIcosahedronTetrahedronPhase(runtime, boss) ? 5 : 2;
  for (let column = Math.max(0, COLUMNS - columnCount); column < COLUMNS; column += 1) {
    const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
    for (let lane = 0; lane < LANES; lane += 1) {
      const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      spawnEnemyAt(runtime, {
        kind: tetrahedronInvertedKind(runtime, boss),
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
  if (!bossUsesTetrahedronKit(runtime, boss) || !boss.pendingCriticalSummon) {
    return;
  }

  boss.pendingCriticalSummon = false;
  const waveNumber = runtime.wave || 0;
  const startColumn = isIcosahedronTetrahedronPhase(runtime, boss) ? 0 : COLUMNS - 5;
  for (let column = startColumn; column < COLUMNS; column += 1) {
    const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
    for (let lane = 0; lane < LANES; lane += 1) {
      const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      spawnEnemyAt(runtime, {
        kind: tetrahedronInvertedKind(runtime, boss),
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

  if (isIcosahedronBoss(boss)) {
    if (bossUsesTetrahedronKit(runtime, boss)) {
      updateTetrahedronSkills(runtime, boss, seconds);
    }
    runRegisteredBossSkills(runtime, boss, bossSkillRegistry.icosahedron, seconds);
    return;
  }

  if (bossUsesTetrahedronKit(runtime, boss)) {
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
      tetrahedronChargeSpeedMultiplier(runtime, boss)
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

function bossUsesTetrahedronKit(runtime: BossRuntime, boss: CubeBoss) {
  return isTetrahedronBoss(boss) || isIcosahedronTetrahedronPhase(runtime, boss);
}

function isIcosahedronTetrahedronPhase(runtime: BossRuntime, boss: CubeBoss) {
  return isIcosahedronBoss(boss) && runtime.bossPhaseIndex === 1;
}

function tetrahedronChargeSpeedMultiplier(runtime: BossRuntime, boss: CubeBoss) {
  return boss.rank >= 2 || isIcosahedronTetrahedronPhase(runtime, boss) ? 2.5 : 2;
}

function tetrahedronInvertedKind(runtime: BossRuntime, boss: CubeBoss): Enemy["kind"] {
  if (isIcosahedronTetrahedronPhase(runtime, boss)) {
    return "invertedTriangle3";
  }
  return boss.rank >= 2 ? "invertedTriangle2" : "invertedTriangle";
}

function tetrahedronShootingKind(runtime: BossRuntime, boss: CubeBoss): Enemy["kind"] {
  if (isIcosahedronTetrahedronPhase(runtime, boss)) {
    return "shootingTriangle3";
  }
  return boss.rank >= 2 ? "shootingTriangle2" : "shootingTriangle";
}

function gainBossSkillSp(skill: BossSkill | undefined, amount: number) {
  if (!skill) {
    return;
  }

  skill.sp = Math.min(skill.maxSp, skill.sp + amount);
}

function empowerEnemiesTouchingBoss(runtime: BossRuntime, boss: CubeBoss) {
  const bounds = bossBounds(boss);
  for (const enemy of runtime.enemies) {
    if (!pointInBounds(bounds, enemy.x, enemy.y)) {
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
        kind: tetrahedronInvertedKind(runtime, boss),
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
      kind: tetrahedronShootingKind(runtime, boss),
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
  if (!nextKind || !enemy.inPlay) {
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

function summonIcosahedronUltimateAdvance(runtime: BossRuntime, boss: CubeBoss) {
  const waveNumber = runtime.wave || 0;
  const bounds = bossBounds(boss);
  const direction = boss.movementDirection ?? -1;
  const frontX = direction < 0 ? bounds.left - CELL_WIDTH / 2 : bounds.right + CELL_WIDTH / 2;
  const rearX = frontX - direction * CELL_WIDTH;

  for (const x of [frontX, rearX]) {
    for (let lane = 0; lane < LANES; lane += 1) {
      const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      spawnEnemyAt(runtime, {
        kind: "square3",
        waveNumber,
        time: runtime.battleTime,
        lane,
        x,
        waveWeight: 0,
        finalDamageReduction: runtime.finalDamageReduction
      });
      makeIcosahedronCollapse(runtime.scene, x, y);
    }
  }
}

function summonIcosahedronHearts(runtime: BossRuntime, _boss: CubeBoss, lanes: readonly number[]) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + BOARD_WIDTH - CELL_WIDTH / 2;
  for (const lane of lanes) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    spawnEnemyAt(runtime, {
      kind: "heart3",
      waveNumber,
      time: runtime.battleTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    makeIcosahedronCollapse(runtime.scene, x, y);
  }
}

function summonIcosahedronSlopeTriangles(runtime: BossRuntime) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + CELL_WIDTH / 2;
  for (let lane = 0; lane < LANES; lane += 1) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    spawnEnemyAt(runtime, {
      kind: "slopeTriangle3",
      waveNumber,
      time: runtime.battleTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    makeIcosahedronCollapse(runtime.scene, x, y);
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

  if (isOctahedronBoss(boss)) {
    makeOctahedronCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
    return;
  }

  if (isIcosahedronBoss(boss)) {
    makeIcosahedronCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
    return;
  }

  makeCubeCollapse(runtime.scene, x, y, followTarget, runtime.enemies, runtime.towers);
}
