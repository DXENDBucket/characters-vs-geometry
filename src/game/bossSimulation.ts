import * as battleMath from "./battleMath";
import { invalidateEnemyRoster } from "./enemyRoster";
import { DEL_DELETE_STACK, DEL_FORMAT, DEL_ECHO_HITBOX_CELLS } from "../data/delBoss";
import { ENDLESS_WINGS_EFFECT } from "../data/bossAbilities";
import { bossSkillRecoverySeconds, chargeBossSkill, isBossSkillReady, spendBossSkill, grantBossSkillSp } from "./bossSkillRules";
import { advanceDelLaneSweep, startDelLaneSweep } from "./delLaneSweep";
import { advanceDelSweep, delSweepActive, startDelSweep } from "./delSweep";
import { towerAreaTargets, towerDamageReceiver } from "./towerOccupancy";
import { towerBehaviorType } from "./towerIdentity";
import { bossMovementDirection } from "./rules/reversal";
import { isShockTower } from "./towerRules";
import { redirectOrientedTarget } from "./orientationRules";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  BOSS_HITBOX_HEIGHT,
  BOSS_HITBOX_WIDTH,
  BOSS_COPY_WARNING_DURATION,
  CELL_HEIGHT,
  CELL_WIDTH,
  COLUMNS,
  CUBE_BOSS_CONTACT_DAMAGE,
  CUBE_BOSS_CONTACT_INTERVAL,
  LANES,
  TETRAHEDRON_BOSS_CHARGE_DURATION
} from "../config";
import {
  advanceBossPosition, bossAdvanceSpawnPoints, isDodecahedronBoss, isIcosahedronBoss, isOctahedronBoss,
  isTetrahedronBoss, syncBossBaseStats
} from "./bossRules";
import type { BossCompanionActionPhase, BossSkill, PendingBossCopy } from "../types";
import type { BossState as CubeBoss } from "./bossState";
import type { EnemyState as Enemy } from "./enemyState";
import type { TowerState as Tower } from "./towerState";
import type { BossSimulationRuntime as BossRuntime } from "./bossSimulationRuntime";
import { createBossSkillRegistry, runRegisteredBossSkills } from "./bossSkillRegistry";
import { enemyAttackMultiplier } from "./combatStats";
import { applyEnemyPromotion, findPromotionTargets } from "./enemyPromotionRules";
import { enemyIsHighFlying } from "./enemyCombatRules";
import { cubePromotionKind, tetrahedronChargeSpeedAtRank, dodecahedronAttacksAtRank } from "../bosses/bossRanks";
import type { BossAttackAction } from "./battleActions";
import { enemyKindAtRank } from "./enemyIdentity";
import { forEachSnapshot } from "./iteration";
import { SOLAR_BOMB_KIND } from "./enemyIdentity";
import { triggerAngelWings } from "./enemySkillExecution";
import { applyStatusEffect, hasStatusEffect } from "./statusEffects";
import { activeStatusSpeedMultiplier } from "./rules/statusEffectRules";
import { latestPlacedTower, latestPlacedTowers } from "./towerTargeting";
import { bossBounds, findLocalBossPart as findBossPart, forEachLocalBossPart as forEachBossPart,
  pointInBounds, type RectBounds } from "./unitGeometry";
import { isTrapArmed } from "./towerRules";
import { towerFinalStats } from "./unitStatRules";
import { volleyInterval } from "./upgrades";
import { repeatHits, volleyHitsAt, volleyTimingCount } from "./volley";
import { getEnemyDefinition, enemyRank, enemyFamily } from "../registry/enemies";

const DODECAHEDRON_COMPANION_KIND: Enemy["kind"] = "dodecahedronCompanion";
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
const ICOSAHEDRON_COMPANION_COUNT = 7;
const ICOSAHEDRON_COMPANION_ORBIT_RADIUS = CELL_WIDTH * 3.05;
const ICOSAHEDRON_COMPANION_DEATH_LASER_SHOTS = 15;
const ICOSAHEDRON_COMPANION_DEATH_LASER_DURATION = 10_000;
const ICOSAHEDRON_COMPANION_DEATH_LASER_LANE_RADIUS = 2;
const ICOSAHEDRON_COMPANION_DEATH_MORTAR_TARGETS = 6;
const ALL_BOARD_LANES: readonly number[] = (() => {
  const lanes: number[] = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    lanes.push(lane);
  }
  return lanes;
})();
interface BossScratch {
  companions: Enemy[];
  contactTowers: Tower[];
  laser: { endX: number; targets: Tower[] };
}
const workspaces = new WeakMap<BossRuntime, BossScratch>();
function scratch(runtime: BossRuntime) {
  let state = workspaces.get(runtime);
  if (!state) {
    state = { companions: [], contactTowers: [], laser: { endX: BOARD_X, targets: [] } };
    workspaces.set(runtime, state);
  }
  return state;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
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
const ICOSAHEDRON_FINAL_PHASE_INDEX = 3;
const ICOSAHEDRON_FINAL_REINFORCEMENTS: Array<{
  delay: number;
  kind: Enemy["kind"];
  lanes: readonly number[];
}> = [
  { delay: 0, kind: "hexSpellBulwark3", lanes: allBoardLanes() },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY, kind: "burrowArrow3", lanes: OCTAHEDRON_BURROW_REINFORCEMENT_LANES },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 2, kind: "heart3", lanes: OCTAHEDRON_HEART_REINFORCEMENT_LANES },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 3, kind: "slopeTriangle3", lanes: allBoardLanes() },
  { delay: OCTAHEDRON_REINFORCEMENT_DELAY * 4, kind: "archangelHeptagon3", lanes: allBoardLanes() }
];

const bossSkillRegistry = createBossSkillRegistry<BossRuntime>({
  del: [{
    skillKey: "deleteFormat",
    chargeSeconds: (_runtime, boss, skill, seconds) => bossSkillRecoverySeconds(boss, skill, seconds),
    canUse: (runtime, boss, skill) => !boss.deleteFormatReadyAt && runtime.battleTime >= skill.activeUntil,
    use: (runtime, boss, skill) => {
      boss.deleteFormatReadyAt = runtime.battleTime + DEL_FORMAT.warningMs;
      skill.activeUntil = boss.deleteFormatReadyAt + DEL_FORMAT.durationMs;
    }
  }, {
    skillKey: "deleteStack",
    canUse: runtime => runtime.towers.some(tower => tower.inPlay),
    use: (runtime, boss, skill) => {
      boss.deleteStackPending = true;
      skill.activeUntil = runtime.battleTime + DEL_DELETE_STACK.glitchMs;
    }
  }],
  cube: [
    {
      skillKey: "promotion",
      canUse: (runtime, boss) => canUsePromotionSkill(runtime, boss),
      use: (runtime, boss) => usePromotionSkill(runtime, boss)
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
        grantBossSkillSp(boss, "charge");
      }
    },
    {
      skillKey: "impact",
      chargeSeconds: tetrahedronSkillChargeSeconds,
      use: (runtime, boss) => {
        summonTetrahedronImpactMinions(runtime, boss);
        grantBossSkillSp(boss, "impact");
      }
    },
    {
      skillKey: "suppression",
      chargeSeconds: tetrahedronSkillChargeSeconds,
      use: (runtime, boss) => {
        summonTetrahedronSuppressionMinions(runtime, boss);
        grantBossSkillSp(boss, "suppression");
      }
    },
    {
      skillKey: "desperation",
      chargeSeconds: tetrahedronSkillChargeSeconds,
      use: (runtime, boss) => {
        empowerEnemiesTouchingBoss(runtime, boss);
        grantBossSkillSp(boss, "desperation");
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

const independentRuntimes = new WeakMap<BossRuntime, WeakMap<CubeBoss, BossRuntime>>();

export function updateBossRuntime(runtime: BossRuntime, seconds: number) {
  const root = runtime.getBoss();
  if (root?.independentBosses?.length) {
    let runtimes = independentRuntimes.get(runtime);
    if (!runtimes) { runtimes = new WeakMap(); independentRuntimes.set(runtime, runtimes); }
    for (const boss of [root, ...root.independentBosses]) {
      let local = runtimes.get(boss);
      if (!local) {
        local = Object.create(runtime) as BossRuntime;
        local.getBoss = () => {
          const current = runtime.getBoss();
          return current === boss || current?.independentBosses?.includes(boss) ? boss : null;
        };
        runtimes.set(boss, local);
      }
      updateSingleBossRuntime(local, seconds);
    }
  } else updateSingleBossRuntime(runtime, seconds);
}

function updateSingleBossRuntime(runtime: BossRuntime, seconds: number) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  if (boss.kind === "del" && boss.deleteFormatReadyAt !== undefined && runtime.battleTime >= boss.deleteFormatReadyAt) {
    delete boss.deleteFormatReadyAt;
    runtime.nullifyTowers(DEL_FORMAT.durationMs);
  }

  if (boss.kind === "del" && boss.deleteStackPending && runtime.battleTime >= boss.skills.deleteStack!.activeUntil) {
    boss.deleteStackPending = false;
    const target = latestPlacedTower(runtime.towers.filter(tower => tower.inPlay));
    if (target) runtime.warnCellSeal(target.lane, target.column, DEL_DELETE_STACK.warningMs, DEL_DELETE_STACK.sealMs, 0);
  }

  initializeOctahedronSolarBombs(runtime, boss);
  startDelSweep(boss, runtime.battleTime);
  startDelLaneSweep(boss, runtime.battleTime);
  if (boss.delLaneSweep && boss.delLaneSweep.phase !== "complete") advanceDelLaneSweep(boss, runtime.battleTime, {
    removeEcho: part => runtime.presentation.removeEcho(part),
    createEcho: (x, y) => {
      const echo = runtime.createBoss("del", runtime.finalDamageReduction, { x, y });
      echo.delEcho = true;
      echo.hasSkills = false;
      echo.hitboxWidth = CELL_WIDTH * DEL_ECHO_HITBOX_CELLS;
      echo.hitboxHeight = CELL_HEIGHT * DEL_ECHO_HITBOX_CELLS;
      echo.invincibleUntil = Infinity;
      runtime.presentation.bossDepth(echo, 87);
      return echo;
    },
    sealCell: runtime.sealCell,
    summon: (lane, kind) => {
      runtime.spawnEnemy({ kind, lane,
        x: BOARD_X + BOARD_WIDTH + CELL_WIDTH / 2, time: runtime.battleTime,
        waveNumber: runtime.wave || 0, waveWeight: 0, finalDamageReduction: runtime.finalDamageReduction });
    }
  });
  updateBossPartsMotion(runtime, boss, seconds);
  runtime.presentation.sweepWarning(boss, runtime.battleTime);
  triggerOctahedronSplits(runtime, boss);
  triggerIcosahedronFinalSplits(runtime, boss);
  syncOctahedronSharedHp(boss);
  updateDodecahedronCompanions(runtime, boss, seconds);
  updateIcosahedronCompanions(runtime, boss, seconds);
  updateBossHasteVisual(runtime, boss);
  triggerTetrahedronHalfHpBurst(runtime, boss);
  triggerTetrahedronCriticalSummon(runtime, boss);
  triggerIcosahedronFinalFatalSummon(runtime, boss);
  updatePendingBossCopies(runtime, boss);
  runtime.presentation.copyWarnings(boss, runtime.battleTime);
  updateBossSkills(runtime, boss, seconds);
  const removedByFunctionalTower = findBossPart(boss, (part) => {
    triggerFunctionalTowersTouchingBoss(runtime, part);
    return runtime.getBoss() !== boss;
  });
  if (removedByFunctionalTower || runtime.getBoss() !== boss) {
    return;
  }

  const removedByContactDamage = findBossPart(boss, (part) => {
    damageBossTouchingTowers(runtime, part, seconds);
    return runtime.getBoss() !== boss;
  });
  if (removedByContactDamage || runtime.getBoss() !== boss) {
    return;
  }

  if (findBossPart(boss, bossPartReachesBase)) {
    runtime.endGame();
  }
}

function updateBossPartsMotion(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  if (advanceDelSweep(boss, runtime.battleTime, runtime.sealCell)) {
    advanceBossPosition(boss, 0, 0, runtime.battleTime);
    runtime.presentation.motion(boss, 0, runtime.battleTime);
    return;
  }
  forEachBossPart(boss, (part) => {
    const elapsed = part.delEcho ? 0 : seconds;
    advanceBossPosition(part, elapsed, bossMovementMultiplier(part, runtime.battleTime), runtime.battleTime);
    runtime.presentation.motion(part, elapsed, runtime.battleTime);
  });
}

function bossPartReachesBase(boss: CubeBoss) {
  if (delSweepActive(boss) || boss.delEcho) return false;
  return (boss.movementAxis ?? "x") === "x" && bossMovementDirection(boss) < 0 && bossBounds(boss).left <= BOARD_X - 20;
}

function triggerOctahedronSplits(runtime: BossRuntime, boss: CubeBoss) {
  if (!isOctahedronBoss(boss)) {
    return;
  }

  if (!boss.octahedronSpawn75Triggered && boss.hp <= boss.maxHp * 0.75) {
    boss.octahedronSpawn75Triggered = true;
    scheduleBossCopy(runtime, boss, {
      x: BOARD_X + BOSS_HITBOX_WIDTH / 2,
      y: BOARD_Y + BOARD_HEIGHT / 2,
      movementAxis: "x",
      movementDirection: 1
    });
  }

  if (!boss.octahedronSpawn50Triggered && boss.hp <= boss.maxHp * 0.5) {
    boss.octahedronSpawn50Triggered = true;
    scheduleBossCopy(runtime, boss, {
      x: BOARD_X + 7.5 * CELL_WIDTH,
      y: BOARD_Y + BOSS_HITBOX_HEIGHT / 2,
      movementAxis: "y",
      movementDirection: 1
    });
  }

  if (!boss.octahedronSpawn25Triggered && boss.hp <= boss.maxHp * 0.25) {
    boss.octahedronSpawn25Triggered = true;
    scheduleBossCopy(runtime, boss, {
      x: BOARD_X + 4.5 * CELL_WIDTH,
      y: BOARD_Y + BOARD_HEIGHT - BOSS_HITBOX_HEIGHT / 2,
      movementAxis: "y",
      movementDirection: -1,
      triggerReinforcements: true
    });
  }
}

function triggerIcosahedronFinalSplits(runtime: BossRuntime, boss: CubeBoss) {
  if (!isIcosahedronFinalPhase(runtime, boss)) {
    return;
  }

  if (!boss.octahedronSpawn75Triggered && boss.hp <= boss.maxHp * 0.75) {
    boss.octahedronSpawn75Triggered = true;
    scheduleBossCopy(runtime, boss, {
      x: BOARD_X + boss.hitboxWidth / 2,
      y: BOARD_Y + BOARD_HEIGHT / 2,
      movementAxis: "x",
      movementDirection: 1
    });
  }

  if (!boss.octahedronSpawn50Triggered && boss.hp <= boss.maxHp * 0.5) {
    boss.octahedronSpawn50Triggered = true;
    scheduleBossCopy(runtime, boss, {
      x: BOARD_X + 7.5 * CELL_WIDTH,
      y: BOARD_Y + boss.hitboxHeight / 2,
      movementAxis: "y",
      movementDirection: 1
    });
  }

  if (!boss.octahedronSpawn25Triggered && boss.hp <= boss.maxHp * 0.25) {
    boss.octahedronSpawn25Triggered = true;
    scheduleBossCopy(runtime, boss, {
      x: BOARD_X + 4.5 * CELL_WIDTH,
      y: BOARD_Y + BOARD_HEIGHT - boss.hitboxHeight / 2,
      movementAxis: "y",
      movementDirection: -1,
      triggerReinforcements: true
    });
  }
}

function scheduleBossCopy(runtime: BossRuntime, boss: CubeBoss,
  options: Omit<PendingBossCopy, "startedAt" | "readyAt" | "phaseIndex">) {
  boss.pendingCopies ??= [];
  boss.pendingCopies.push({ ...options, startedAt: runtime.battleTime,
    readyAt: runtime.battleTime + BOSS_COPY_WARNING_DURATION, phaseIndex: runtime.bossPhaseIndex });
  if (isOctahedronBoss(boss)) grantOctahedronInvincibility(boss);
}

function updatePendingBossCopies(runtime: BossRuntime, boss: CubeBoss) {
  if (!boss.pendingCopies?.length) return;
  const ready = boss.pendingCopies.filter(spawn => spawn.readyAt <= runtime.battleTime && spawn.phaseIndex === runtime.bossPhaseIndex);
  boss.pendingCopies = boss.pendingCopies.filter(spawn => spawn.readyAt > runtime.battleTime && spawn.phaseIndex === runtime.bossPhaseIndex);
  if (boss.hp <= 0) { boss.pendingCopies = []; return; }
  for (const spawn of ready) {
    if (isOctahedronBoss(boss)) spawnOctahedronCopy(runtime, boss, spawn);
    else if (isIcosahedronFinalPhase(runtime, boss)) {
      spawnIcosahedronFinalCopy(runtime, boss, spawn);
      if (spawn.triggerReinforcements) scheduleIcosahedronFinalReinforcements(runtime, boss);
    }
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
  const copy = runtime.createBoss(boss.kind, runtime.finalDamageReduction, { ...options, rank: boss.rank });
  if (boss.maxHp !== copy.maxHp) {
    copy.baseStats.maxHp = boss.maxHp;
    copy.maxHp = boss.maxHp;
    copy.finalStats.maxHp = boss.maxHp;
  }
  copy.hp = boss.hp;
  runtime.presentation.bossDepth(copy, 87);
  copy.octahedronCopies = undefined;
  boss.octahedronCopies ??= [];
  boss.octahedronCopies.push(copy);
  copy.invincibleUntil = Number.POSITIVE_INFINITY;
  spawnOctahedronSolarBombs(runtime);
  if (options.triggerReinforcements) {
    scheduleOctahedronReinforcements(runtime, boss);
  }
  runtime.presentation.collapse("octahedron", options.x, options.y);
}

function spawnIcosahedronFinalCopy(
  runtime: BossRuntime,
  boss: CubeBoss,
  options: {
    x: number;
    y: number;
    movementAxis: "x" | "y";
    movementDirection: -1 | 1;
    invincibleUntil?: number;
  }
) {
  const copy = runtime.createBoss(boss.kind, runtime.finalDamageReduction, options);
  copy.baseStats = { ...boss.baseStats };
  syncBossBaseStats(copy);
  copy.hp = boss.hp;
  runtime.presentation.bossDepth(copy, 87);
  copy.invincibleUntil = Math.max(options.invincibleUntil ?? 0, boss.invincibleUntil);
  copy.octahedronCopies = undefined;
  copy.companionsInitialized = true;
  boss.octahedronCopies ??= [];
  boss.octahedronCopies.push(copy);
  runtime.presentation.collapse("icosahedron", options.x, options.y);
  return copy;
}

function syncOctahedronSharedHp(boss: CubeBoss) {
  for (const copy of boss.octahedronCopies ?? []) {
    copy.hp = boss.hp;
    copy.maxHp = boss.maxHp;
  }
}

function triggerIcosahedronFinalFatalSummon(runtime: BossRuntime, boss: CubeBoss) {
  if (!isIcosahedronFinalPhase(runtime, boss) || !boss.pendingCriticalSummon) {
    return;
  }

  boss.pendingCriticalSummon = false;
  const invincibleUntil = boss.invincibleUntil;
  scheduleBossCopy(runtime, boss, {
    x: BOARD_X + 1.5 * CELL_WIDTH,
    y: BOARD_Y + 2.5 * CELL_HEIGHT,
    movementAxis: "y",
    movementDirection: 1,
    invincibleUntil
  });
  forEachBossPart(boss, (part) => {
    part.invincibleUntil = invincibleUntil;
  });
}

export function initializeOctahedronSolarBombs(runtime: BossRuntime, boss: CubeBoss) {
  if (!isOctahedronBoss(boss) || boss.octahedronSolarBombsInitialized) {
    return;
  }

  boss.octahedronSolarBombsInitialized = true;
  triggerOctahedronInvincibilityCycle(runtime, boss);
}

function triggerOctahedronInvincibilityCycle(runtime: BossRuntime, boss: CubeBoss) {
  grantOctahedronInvincibility(boss);
  spawnOctahedronSolarBombs(runtime);
}

function grantOctahedronInvincibility(boss: CubeBoss) {
  forEachBossPart(boss, (part) => {
    part.invincibleUntil = Number.POSITIVE_INFINITY;
  });
}

function spawnOctahedronSolarBombs(runtime: BossRuntime) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + (COLUMNS - 0.5) * CELL_WIDTH;
  for (const lane of OCTAHEDRON_SOLAR_BOMB_LANES) {
    runtime.spawnEnemy({
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
  for (const wave of OCTAHEDRON_REINFORCEMENTS) {
    scheduleBossAttack(runtime, wave.delay, { type: "bossReinforcements", boss,
      kind: enemyKindAtRank(enemyFamily(wave.kind), boss.rank), lanes: wave.lanes });
  }
}

function scheduleIcosahedronFinalReinforcements(runtime: BossRuntime, boss: CubeBoss) {
  for (const wave of ICOSAHEDRON_FINAL_REINFORCEMENTS) {
    scheduleBossAttack(runtime, wave.delay, { type: "bossReinforcements", boss,
      kind: wave.kind, lanes: wave.lanes, icosahedron: true });
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
    runtime.spawnEnemy({
      kind,
      waveNumber,
      time,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    runtime.presentation.collapse("octahedron", x, y);
  }
}

function spawnIcosahedronFinalReinforcementWave(
  runtime: BossRuntime,
  kind: Enemy["kind"],
  lanes: readonly number[],
  time: number
) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + BOARD_WIDTH + 46;
  for (const lane of lanes) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    runtime.spawnEnemy({
      kind,
      waveNumber,
      time,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    runtime.presentation.collapse("icosahedron", x, y);
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
  const companions = collectDodecahedronCompanions(runtime);
  for (const companion of companions) {
    if (hasStatusEffect(companion, "frozen", runtime.battleTime)) {
      continue;
    }

    companion.bossOrbitAngle =
      (companion.bossOrbitAngle ?? Math.PI) + DODECAHEDRON_COMPANION_ORBIT_SPEED * seconds;
    syncDodecahedronCompanionPosition(companion, boss, runtime.battleTime);
    runtime.presentation.companionPosition(companion);
    runtime.presentation.companionShape(companion, boss, hasStatusEffect(companion, "invincible", runtime.battleTime));
    updateDodecahedronCompanionAction(runtime, companion);
  }

  handleDodecahedronCompanionDeaths(runtime, boss, companions);
  updateDodecahedronEndlessWings(runtime, boss, seconds, companions);
}

function updateIcosahedronCompanions(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  if (!isIcosahedronBoss(boss) || runtime.bossPhaseIndex !== 2) {
    return;
  }

  initializeIcosahedronCompanions(runtime, boss);
  const companions = collectDodecahedronCompanions(runtime);
  for (const companion of companions) {
    if (hasStatusEffect(companion, "frozen", runtime.battleTime)) {
      continue;
    }

    companion.bossOrbitAngle =
      (companion.bossOrbitAngle ?? Math.PI) + DODECAHEDRON_COMPANION_ORBIT_SPEED * seconds;
    syncIcosahedronCompanionPosition(companion, boss, runtime.battleTime);
    runtime.presentation.companionPosition(companion);
    runtime.presentation.companionShape(
      companion,
      boss,
      hasStatusEffect(companion, "invincible", runtime.battleTime),
      "icosahedron"
    );
    updateDodecahedronCompanionAction(runtime, companion);
  }

  handleIcosahedronCompanionDeaths(runtime, boss, companions);
  updateDodecahedronEndlessWings(runtime, boss, seconds, companions);
}

function collectDodecahedronCompanions(runtime: BossRuntime) {
  const companions = scratch(runtime).companions;
  companions.length = 0;
  for (const enemy of runtime.enemies) {
    if (enemy.inPlay && enemyIsDodecahedronCompanion(enemy)) {
      companions.push(enemy);
    }
  }
  return companions;
}

export function initializeDodecahedronCompanions(runtime: BossRuntime, boss: CubeBoss) {
  if (boss.companionsInitialized) {
    return;
  }

  boss.companionsInitialized = true;
  const waveNumber = runtime.wave || 0;
  const companionKind = dodecahedronCompanionKindForBoss(boss);
  for (let index = 0; index < DODECAHEDRON_COMPANION_COUNT; index += 1) {
    const angle = Math.PI + (Math.PI * 2 * index) / DODECAHEDRON_COMPANION_COUNT;
    runtime.spawnEnemy({
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
    runtime.presentation.companionDepth(companion, 87);
    syncDodecahedronCompanionPosition(companion, boss, runtime.battleTime);
    runtime.presentation.companionPosition(companion);
    runtime.presentation.companionShape(companion, boss);
  }
}

function initializeIcosahedronCompanions(runtime: BossRuntime, boss: CubeBoss) {
  if (boss.companionsInitialized) {
    return;
  }

  boss.companionsInitialized = true;
  boss.companionDeathsHandled = 0;
  const waveNumber = runtime.wave || 0;
  for (let index = 0; index < ICOSAHEDRON_COMPANION_COUNT; index += 1) {
    const angle = Math.PI + (Math.PI * 2 * index) / ICOSAHEDRON_COMPANION_COUNT;
    runtime.spawnEnemy({
      kind: DODECAHEDRON_COMPANION_KIND,
      waveNumber,
      time: runtime.battleTime,
      lane: index,
      x: boss.x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    const companion = runtime.enemies[runtime.enemies.length - 1];
    companion.bossOrbitAngle = angle;
    companion.bossOrbitRadius = ICOSAHEDRON_COMPANION_ORBIT_RADIUS;
    companion.bossCompanionIndex = index;
    companion.bossCompanionActionPhase = "laser";
    companion.bossCompanionNextActionAt = runtime.battleTime + DODECAHEDRON_COMPANION_ATTACK_DELAYS.laser;
    runtime.presentation.companionDepth(companion, 87);
    syncIcosahedronCompanionPosition(companion, boss, runtime.battleTime);
    runtime.presentation.companionPosition(companion);
    runtime.presentation.companionShape(companion, boss, false, "icosahedron");
  }
}

function dodecahedronCompanionKindForBoss(boss: CubeBoss): Enemy["kind"] {
  return enemyKindAtRank("dodecahedronCompanion", boss.rank);
}

function enemyIsDodecahedronCompanion(enemy: Enemy) {
  return enemyFamily(enemy.kind) === "dodecahedronCompanion";
}

function syncDodecahedronCompanionPosition(companion: Enemy, boss: CubeBoss, battleTime: number) {
  const position = dodecahedronCompanionPosition(companion, boss, battleTime);
  companion.x = position.x;
  companion.y = position.y;
  companion.lane = clamp(Math.round((companion.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
}

function syncIcosahedronCompanionPosition(companion: Enemy, boss: CubeBoss, battleTime: number) {
  const position = icosahedronCompanionPosition(companion, boss, battleTime);
  companion.x = position.x;
  companion.y = position.y;
  companion.lane = clamp(Math.round((companion.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
}

function dodecahedronCompanionPosition(companion: Enemy, boss: CubeBoss, battleTime: number) {
  const orbit = dodecahedronCompanionOrbitPosition(companion, boss);
  const formation = dodecahedronCompanionFormationPosition(companion, boss);
  return companionCyclePosition(orbit, formation, battleTime);
}

function icosahedronCompanionPosition(companion: Enemy, boss: CubeBoss, battleTime: number) {
  const orbit = dodecahedronCompanionOrbitPosition(companion, boss);
  const formation = icosahedronCompanionFormationPosition(companion, boss);
  return companionCyclePosition(orbit, formation, battleTime);
}

function companionCyclePosition(
  orbit: { x: number; y: number },
  formation: { x: number; y: number },
  battleTime: number
) {
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
    x: boss.x + battleMath.cos(angle) * radius,
    y: boss.y + battleMath.sin(angle) * radius
  };
}

function dodecahedronCompanionFormationPosition(companion: Enemy, boss: CubeBoss) {
  const index = companion.bossCompanionIndex ?? 0;
  const bossLane = clamp(Math.round((boss.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
  const offset = DODECAHEDRON_COMPANION_FORMATION_LANE_OFFSETS[index] ?? 0;
  const lane = clamp(bossLane + offset, 0, LANES - 1);
  return {
    x: bossBounds(boss).left - CELL_WIDTH / 2,
    y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
  };
}

function icosahedronCompanionFormationPosition(companion: Enemy, boss: CubeBoss) {
  const lane = clamp(companion.bossCompanionIndex ?? 0, 0, LANES - 1);
  return {
    x: bossBounds(boss).left - CELL_WIDTH / 2,
    y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
  };
}

function lerpPoint(from: { x: number; y: number }, to: { x: number; y: number }, progress: number) {
  const clamped = clamp(progress, 0, 1);
  return {
    x: (to.x - from.x) * clamped + from.x,
    y: (to.y - from.y) * clamped + from.y
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
    triggerAngelWings(runtime.presentation, runtime.enemies, companion, runtime.battleTime);
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
  const totalHits = dodecahedronAttacksAtRank(enemyRank(companion.kind)).companionLaserHits;
  const shots = volleyTimingCount(totalHits);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_LASER_INTERVAL, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    const hitCount = volleyHitsAt(totalHits, shotIndex);
    scheduleBossAttack(runtime, shotIndex * interval, { type: "companionLaser", boss: runtime.getBoss()!, companion, hitCount });
  }
}

function fireDodecahedronCompanionLaser(runtime: BossRuntime, companion: Enemy, hitCount: number) {
  if (!companion.inPlay) {
    return;
  }

  const definition = getEnemyDefinition("shootingPentagon");
  const laserPath = leftwardDodecahedronLaserPath(runtime, companion.lane, companion.x);

  runtime.presentation.laser(companion.x - 24, companion.y, laserPath.endX);
  try {
    for (const tower of laserPath.targets) {
      runtime.presentation.hit(tower.x, tower.y);
      repeatHits(hitCount, () => runtime.damageTower(
        tower,
        definition.damage * enemyAttackMultiplier(companion, runtime.battleTime),
        definition.damageType
      ));
    }
  } finally {
    laserPath.targets.length = 0;
  }
}

function fireDodecahedronCompanionMortarVolley(runtime: BossRuntime, companion: Enemy) {
  const target = findDodecahedronCompanionMortarTarget(runtime);
  if (!target) {
    return;
  }

  const totalHits = dodecahedronAttacksAtRank(enemyRank(companion.kind)).companionMortarHits;
  const shots = volleyTimingCount(totalHits);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_MORTAR_INTERVAL, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    const hitCount = volleyHitsAt(totalHits, shotIndex);
    scheduleBossAttack(runtime, shotIndex * interval, { type: "companionMortar", boss: runtime.getBoss()!, companion, hitCount });
  }
}

function fireDodecahedronCompanionMortar(runtime: BossRuntime, companion: Enemy, hitCount: number) {
  if (!companion.inPlay) {
    return;
  }

  const target = findDodecahedronCompanionMortarTarget(runtime);
  if (!target) {
    return;
  }

  const definition = getEnemyDefinition("pentagon");
  runtime.mortarProjectiles.push(
    runtime.createMortar({
      owner: "enemy",
      fromX: companion.x,
      hitCount,
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
  return redirectOrientedTarget(runtime.towers, latestPlacedTower(runtime.towers), runtime.battleTime);
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
  grantCompanionDeathInvincibility(runtime, livingCompanions);

  if (deathNumber === 1) {
    fireDodecahedronDeathLaserVolley(runtime, boss);
  } else if (deathNumber === 2) {
    fireDodecahedronDeathMortars(runtime, boss);
  }
}

function handleIcosahedronCompanionDeaths(runtime: BossRuntime, boss: CubeBoss, livingCompanions: Enemy[]) {
  const deadCount = ICOSAHEDRON_COMPANION_COUNT - livingCompanions.length;
  while (boss.companionDeathsHandled < deadCount) {
    boss.companionDeathsHandled += 1;
    triggerIcosahedronCompanionDeath(runtime, boss, boss.companionDeathsHandled, livingCompanions);
  }
}

function triggerIcosahedronCompanionDeath(
  runtime: BossRuntime,
  boss: CubeBoss,
  deathNumber: number,
  livingCompanions: Enemy[]
) {
  grantCompanionDeathInvincibility(runtime, livingCompanions);

  if (deathNumber % 2 === 1) {
    fireIcosahedronDeathLaserVolley(runtime, boss);
  } else {
    fireIcosahedronDeathMortars(runtime, boss);
  }
}

function grantCompanionDeathInvincibility(runtime: BossRuntime, livingCompanions: Enemy[]) {
  for (const companion of livingCompanions) {
    applyStatusEffect(
      companion,
      "invincible",
      DODECAHEDRON_COMPANION_DEATH_INVINCIBLE_DURATION,
      runtime.battleTime
    );
    runtime.presentation.invincible(companion.x, companion.y);
  }
}

function fireDodecahedronDeathLaserVolley(runtime: BossRuntime, boss: CubeBoss) {
  const shots = dodecahedronDeathLaserShots(boss);
  fireBossDeathLaserVolley(runtime, boss, shots, DODECAHEDRON_COMPANION_LASER_INTERVAL, 1);
}

function fireIcosahedronDeathLaserVolley(runtime: BossRuntime, boss: CubeBoss) {
  fireBossDeathLaserVolley(
    runtime,
    boss,
    ICOSAHEDRON_COMPANION_DEATH_LASER_SHOTS,
    ICOSAHEDRON_COMPANION_DEATH_LASER_DURATION,
    ICOSAHEDRON_COMPANION_DEATH_LASER_LANE_RADIUS
  );
}

function fireBossDeathLaserVolley(
  runtime: BossRuntime,
  boss: CubeBoss,
  totalHits: number,
  duration: number,
  laneRadius: number
) {
  const shots = volleyTimingCount(totalHits);
  const interval = volleyInterval(duration, shots);
  for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
    const hitCount = volleyHitsAt(totalHits, shotIndex);
    scheduleBossAttack(runtime, shotIndex * interval, { type: "bossDeathLaser", boss, laneRadius, hitCount });
  }
}

function dodecahedronDeathLaserShots(boss: CubeBoss) {
  return dodecahedronAttacksAtRank(boss.rank).deathLaserHits;
}

function fireBossDeathLasers(runtime: BossRuntime, boss: CubeBoss, laneRadius: number, hitCount: number) {
  if (runtime.getBoss() !== boss) {
    return;
  }

  const centerLane = bossLane(boss);
  const fromX = bossBounds(boss).left;
  const startLane = Math.max(0, centerLane - laneRadius);
  const endLane = Math.min(LANES - 1, centerLane + laneRadius);
  for (let lane = startLane; lane <= endLane; lane += 1) {
    fireDodecahedronLaserInLane(runtime, fromX, lane, hitCount);
  }
}

function fireDodecahedronLaserInLane(runtime: BossRuntime, fromX: number, lane: number, hitCount: number) {
  const definition = getEnemyDefinition("shootingPentagon");
  const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const laserPath = leftwardDodecahedronLaserPath(runtime, lane, fromX);

  runtime.presentation.laser(fromX, y, laserPath.endX);
  try {
    for (const tower of laserPath.targets) {
      runtime.presentation.hit(tower.x, tower.y);
      repeatHits(hitCount, () => runtime.damageTower(tower, definition.damage, definition.damageType));
    }
  } finally {
    laserPath.targets.length = 0;
  }
}

function leftwardDodecahedronLaserPath(runtime: BossRuntime, lane: number, fromX: number) {
  const towers = runtime.towers, path = scratch(runtime).laser;
  const stoppingX = leftwardLaserStoppingX(towers, lane, fromX);
  const targets = path.targets;
  targets.length = 0;
  for (const tower of towerAreaTargets(towers)) {
    if (tower.lane !== lane || tower.x >= fromX || (stoppingX !== undefined && tower.x < stoppingX)) {
      continue;
    }

    insertTowerByDescendingX(targets, tower);
  }

  path.endX = stoppingX ?? BOARD_X;
  return path;
}

function leftwardLaserStoppingX(towers: Tower[], lane: number, fromX: number) {
  let stoppingX: number | undefined;
  for (const tower of towers) {
    if (tower.lane !== lane || tower.x >= fromX || towerFinalStats(towerDamageReceiver(tower)).magicResistance <= 0) {
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
  const shots = volleyTimingCount(targetCount);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_MORTAR_INTERVAL, shots);
  targets.forEach((target, index) => {
    scheduleBossAttack(runtime, (index % shots) * interval, { type: "bossDeathMortar", boss, target });
  });
}

function dodecahedronDeathMortarTargetCount(boss: CubeBoss) {
  return dodecahedronAttacksAtRank(boss.rank).deathMortarTargets;
}

function fireIcosahedronDeathMortars(runtime: BossRuntime, boss: CubeBoss) {
  const targetCount = ICOSAHEDRON_COMPANION_DEATH_MORTAR_TARGETS;
  const targets = findDodecahedronPentagonTargets(runtime, targetCount);
  const shots = volleyTimingCount(targetCount);
  const interval = volleyInterval(DODECAHEDRON_COMPANION_MORTAR_INTERVAL, shots);
  targets.forEach((target, index) => {
    scheduleBossAttack(runtime, (index % shots) * interval, { type: "bossDeathMortar", boss, target });
  });
}

function fireDodecahedronBossMortar(runtime: BossRuntime, boss: CubeBoss, target: Tower) {
  target = redirectOrientedTarget(runtime.towers, target, runtime.battleTime)!;
  if (runtime.getBoss() !== boss || !target.inPlay) {
    return;
  }

  const definition = getEnemyDefinition("pentagon");
  runtime.mortarProjectiles.push(
    runtime.createMortar({
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

function scheduleBossAttack(runtime: BossRuntime, delay: number, action: BossAttackAction) {
  runtime.scheduleBattleAction(delay, action);
}

export function executeBossAttack(runtime: BossRuntime, action: BossAttackAction) {
  if (runtime.getBoss() !== action.boss) return;
  switch (action.type) {
    case "bossReinforcements":
      (action.icosahedron ? spawnIcosahedronFinalReinforcementWave : spawnOctahedronReinforcementWave)(
        runtime, action.kind, action.lanes, runtime.battleTime); break;
    case "companionLaser": fireDodecahedronCompanionLaser(runtime, action.companion, action.hitCount); break;
    case "companionMortar": fireDodecahedronCompanionMortar(runtime, action.companion, action.hitCount); break;
    case "bossDeathLaser": fireBossDeathLasers(runtime, action.boss, action.laneRadius, action.hitCount); break;
    case "bossDeathMortar": fireDodecahedronBossMortar(runtime, action.boss, action.target); break;
  }
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
      ENDLESS_WINGS_EFFECT.duration,
      runtime.battleTime,
      ENDLESS_WINGS_EFFECT.speedMultiplier,
      true
    );
    runtime.presentation.wings(target.x, target.y);
  }
}

function bossLane(boss: CubeBoss) {
  return clamp(Math.round((boss.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
}

function bossMovementMultiplier(boss: CubeBoss, time: number) {
  return activeStatusSpeedMultiplier(boss, time);
}

function updateBossHasteVisual(runtime: BossRuntime, boss: CubeBoss) {
  if (bossMovementMultiplier(boss, runtime.battleTime) <= 1) {
    return;
  }

  if (runtime.battleTime < boss.nextBossHasteTrailAt) {
    return;
  }

  runtime.presentation.haste(boss.x, boss.y);
  boss.nextBossHasteTrailAt = runtime.battleTime + 100;
}

function triggerFunctionalTowersTouchingBoss(runtime: BossRuntime, boss: CubeBoss) {
  const rootBoss = runtime.getBoss();
  const bounds = bossBounds(boss);
  forEachSnapshot(runtime.towers, (tower) => {
    if (runtime.getBoss() !== rootBoss) return false;
    if (!towerIntersectsBossBounds(tower, bounds)) {
      return;
    }

    if (towerBehaviorType(tower) === "G" && isTrapArmed(tower, runtime.battleTime)) {
      runtime.triggerTrapTower(tower, boss);
      if (runtime.getBoss() !== rootBoss) {
        return false;
      }
      return;
    }

    if (isShockTower(tower)) {
      runtime.triggerShockTower(tower);
    }
  });
}

function damageBossTouchingTowers(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  const rootBoss = runtime.getBoss();
  boss.contactAttackBuffer += seconds;
  if (boss.contactAttackBuffer < CUBE_BOSS_CONTACT_INTERVAL) {
    return;
  }

  while (boss.contactAttackBuffer >= CUBE_BOSS_CONTACT_INTERVAL) {
    const targets = scratch(runtime).contactTowers;
    targets.length = 0;
    const bounds = bossBounds(boss);
    try {
      for (const tower of towerAreaTargets(runtime.towers)) {
        if (towerIntersectsBossBounds(tower, bounds)) {
          targets.push(tower);
        }
      }

      for (const tower of targets) {
        runtime.presentation.collapse(boss.kind, tower.x, tower.y, tower);
        runtime.damageTower(tower, CUBE_BOSS_CONTACT_DAMAGE, "physical");
        if (runtime.getBoss() !== rootBoss) return;
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
      runtime.spawnEnemy({
        kind: tetrahedronInvertedKind(runtime, boss),
        waveNumber,
        time: runtime.battleTime,
        lane,
        x,
        waveWeight: 0,
        finalDamageReduction: runtime.finalDamageReduction
      });
      runtime.presentation.collapse("tetrahedron", x, y);
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
      runtime.spawnEnemy({
        kind: tetrahedronInvertedKind(runtime, boss),
        waveNumber,
        time: runtime.battleTime,
        lane,
        x,
        waveWeight: 0,
        finalDamageReduction: runtime.finalDamageReduction
      });
      runtime.presentation.collapse("tetrahedron", x, y);
    }
  }
}

function updateBossSkills(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  if (!boss.hasSkills) {
    return;
  }

  if (boss.kind === "del") {
    runRegisteredBossSkills(runtime, boss, bossSkillRegistry.del, seconds);
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
  return bossSkillRecoverySeconds(boss, skill, seconds);
}

function bossUsesTetrahedronKit(runtime: BossRuntime, boss: CubeBoss) {
  return isTetrahedronBoss(boss) || isIcosahedronTetrahedronPhase(runtime, boss);
}

function isIcosahedronTetrahedronPhase(runtime: BossRuntime, boss: CubeBoss) {
  return isIcosahedronBoss(boss) && runtime.bossPhaseIndex === 1;
}

function isIcosahedronFinalPhase(runtime: BossRuntime, boss: CubeBoss) {
  return isIcosahedronBoss(boss) && runtime.bossPhaseIndex === ICOSAHEDRON_FINAL_PHASE_INDEX;
}

function tetrahedronChargeSpeedMultiplier(runtime: BossRuntime, boss: CubeBoss) {
  return isIcosahedronTetrahedronPhase(runtime, boss) ? 2.5 : tetrahedronChargeSpeedAtRank(boss.rank);
}

function tetrahedronInvertedKind(runtime: BossRuntime, boss: CubeBoss): Enemy["kind"] {
  if (isIcosahedronTetrahedronPhase(runtime, boss)) {
    return "invertedTriangle3";
  }
  return enemyKindAtRank("invertedTriangle", boss.rank);
}

function tetrahedronShootingKind(runtime: BossRuntime, boss: CubeBoss): Enemy["kind"] {
  if (isIcosahedronTetrahedronPhase(runtime, boss)) {
    return "shootingTriangle3";
  }
  return enemyKindAtRank("shootingTriangle", boss.rank);
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
      runtime.spawnEnemy({
        kind: tetrahedronInvertedKind(runtime, boss),
        waveNumber,
        time: runtime.battleTime,
        lane: point.lane,
        x,
        waveWeight: 0,
        finalDamageReduction: runtime.finalDamageReduction
      });
      runtime.presentation.collapse("tetrahedron", x, point.y);
    }
  }
}

function summonTetrahedronSuppressionMinions(runtime: BossRuntime, boss: CubeBoss) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + BOARD_WIDTH + 46;
  for (let lane = 0; lane < LANES; lane += 1) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    runtime.spawnEnemy({
      kind: tetrahedronShootingKind(runtime, boss),
      waveNumber,
      time: runtime.battleTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    runtime.presentation.collapse("tetrahedron", x, y);
  }
}

function canUsePromotionSkill(runtime: BossRuntime, boss: CubeBoss) {
  const targets = findPromotionTargets(boss, runtime.enemies, boss.rank, 3);
  return targets.length >= 3;
}

function usePromotionSkill(runtime: BossRuntime, boss: CubeBoss) {
  for (const target of findPromotionTargets(boss, runtime.enemies, boss.rank, 3)) {
    promoteEnemy(runtime, target, boss.rank);
  }
}

function promoteEnemy(runtime: BossRuntime, enemy: Enemy, maxRank: number) {
  const nextKind = cubePromotionKind(enemy.kind, maxRank);
  if (!nextKind || !enemy.inPlay) {
    return;
  }

  runtime.onEnemyPromotion(nextKind);
  applyEnemyPromotion(enemy, nextKind, runtime.battleTime, runtime.random);
  runtime.presentation.promoted(enemy);
  invalidateEnemyRoster(runtime.enemies);
  runtime.presentation.collapse("cube", enemy.x, enemy.y, enemy);
}

function summonBossAdvanceMinions(runtime: BossRuntime, boss: CubeBoss) {
  const waveNumber = runtime.wave || 0;
  for (const point of bossAdvanceSpawnPoints(boss)) {
    runtime.spawnEnemy({
      kind: boss.advanceMinionKind,
      waveNumber,
      time: runtime.battleTime,
      lane: point.lane,
      x: point.x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    runtime.presentation.collapse("cube", point.x, point.y);
  }
}

function summonIcosahedronUltimateAdvance(runtime: BossRuntime, boss: CubeBoss) {
  const waveNumber = runtime.wave || 0;
  const bounds = bossBounds(boss);
  const direction = bossMovementDirection(boss);
  const frontX = direction < 0 ? bounds.left - CELL_WIDTH / 2 : bounds.right + CELL_WIDTH / 2;
  const rearX = frontX - direction * CELL_WIDTH;

  for (const x of [frontX, rearX]) {
    for (let lane = 0; lane < LANES; lane += 1) {
      const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
      runtime.spawnEnemy({
        kind: "square3",
        waveNumber,
        time: runtime.battleTime,
        lane,
        x,
        waveWeight: 0,
        finalDamageReduction: runtime.finalDamageReduction
      });
      runtime.presentation.collapse("icosahedron", x, y);
    }
  }
}

function summonIcosahedronHearts(runtime: BossRuntime, _boss: CubeBoss, lanes: readonly number[]) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + BOARD_WIDTH - CELL_WIDTH / 2;
  for (const lane of lanes) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    runtime.spawnEnemy({
      kind: "heart3",
      waveNumber,
      time: runtime.battleTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    runtime.presentation.collapse("icosahedron", x, y);
  }
}

function summonIcosahedronSlopeTriangles(runtime: BossRuntime) {
  const waveNumber = runtime.wave || 0;
  const x = BOARD_X + BOARD_WIDTH - CELL_WIDTH / 2;
  for (let lane = 0; lane < LANES; lane += 1) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    runtime.spawnEnemy({
      kind: "slopeTriangle3",
      waveNumber,
      time: runtime.battleTime,
      lane,
      x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    runtime.presentation.collapse("icosahedron", x, y);
  }
}
