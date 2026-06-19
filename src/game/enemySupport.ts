import Phaser from "phaser";
import { BOARD_X, CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import { makeHealParticles, makeShiftEffect } from "../render/combatEffects";
import type { CubeBoss, Enemy, SkillState } from "../types";
import { enemyFamily, enemyIsBossCompanion, enemyRank } from "../registry/enemies";
import { enemyIgnoresLeaderRestrictedMechanics, enemyIsHighFlying, syncEnemyVisualScale } from "./enemyBehaviors";
import { createEnemySkillRegistry, enemySkillDefinitionsForFamily, type EnemySkillRuntime } from "./enemySkillRegistry";
import { gainSkillSp, getEnemySkillState, isSkillReady, spendSkillSp } from "./skillState";
import { applyStatusEffect, hasStatusEffect, hasUnexpiredStatusEffect, syncEnemyBodyPosition } from "./statusEffects";
import { bossPartDistanceSqToPoint } from "./targeting";
import { setPositionIfChanged, setVisibleIfChanged } from "./visualGuards";

const HEX_ARMOR_RADIUS = CELL_WIDTH * 1.4;
const HEX_ARMOR_RANK_ONE_BONUS = 50;
const HEX_ARMOR_BONUS_PER_EXTRA_RANK = 30;
const HEX_SPELL_BULWARK_RANK_ONE_MAGIC_RESISTANCE_BONUS = 40;
const HEX_SPELL_BULWARK_MAGIC_RESISTANCE_BONUS_PER_EXTRA_RANK = 10;
const HEX_AURA_ARMOR_FLAG = 1;
const HEX_AURA_MAGIC_RESISTANCE_FLAG = 2;
const HEX_HEAL_SKILL_MAX = 20;
const HEX_HEAL_SKILL_COST = 20;
const HEX_HEAL_SKILL_REGEN_PER_SECOND = 1;
const HEX_HEAL_RATIO = 0.3;
const CHARGING_HEX_SPEED_MULTIPLIER = 1.5;
const LEADER_SPEED_MULTIPLIER = 1.5;
const HEART_LEAD_SKILL_MAX = 5;
const HEART_LEAD_SKILL_COST = 5;
const HEART_LEAD_REGEN_PER_SECOND = 1;
const HEART_LEAD_COLUMN_SPAN = 5;
const HEART_LEAD_LANE_RADIUS = 2;
const ANGEL_WINGS_SKILL_MAX = 15;
const ANGEL_WINGS_SKILL_COST = 15;
const ANGEL_WINGS_REGEN_PER_SECOND = 1;
const ANGEL_WINGS_DURATION = 3_000;
const ANGEL_WINGS_RANGE_X = CELL_WIDTH * 1.5;
const ANGEL_WINGS_RANGE_Y = CELL_HEIGHT * 1.5;
const ARCHANGEL_ASCENSION_SKILL_MAX = 15;
const ARCHANGEL_ASCENSION_SKILL_COST = 15;
const ARCHANGEL_ASCENSION_REGEN_PER_SECOND = 1;
const ARCHANGEL_ASCENSION_DURATION = 6_000;
const ARCHANGEL_ASCENSION_RADIUS = CELL_WIDTH * 2.5;
const ANGEL_WINGS_SPEED_MULTIPLIER = 2;
const HEX_ARMOR_RADIUS_SQ = HEX_ARMOR_RADIUS * HEX_ARMOR_RADIUS;
const ARCHANGEL_ASCENSION_RADIUS_SQ = ARCHANGEL_ASCENSION_RADIUS * ARCHANGEL_ASCENSION_RADIUS;
const HEX_ARMOR_LANE_RADIUS = Math.ceil(HEX_ARMOR_RADIUS / CELL_HEIGHT);

export interface EnemySupportBonuses {
  armor: number;
  magicResistance: number;
  speedMultiplier: number;
}

const NO_ENEMY_SUPPORT_BONUSES: EnemySupportBonuses = {
  armor: 0,
  magicResistance: 0,
  speedMultiplier: 1
};

export interface EnemySupportSources {
  enemies: Enemy[];
  hexagons: Enemy[];
  hexagonLaneMask: number;
  magicResistanceLaneMask: number;
  chargingHexLaneMask: number;
  leaderLaneMask: number;
  hexagonsByLane: Enemy[][];
  magicResistanceByLane: Enemy[][];
  chargingHexByLane: Enemy[][];
  leadersByLane: Enemy[][];
}

interface HeartLeadCaster {
  caster: Enemy;
  skill: SkillState;
}

interface HeartLeadPlan extends HeartLeadCaster {
  targets: Enemy[];
}

interface EnemyPosition {
  x: number;
  y: number;
  lane: number;
}

const enemySkillRegistry = createEnemySkillRegistry({
  updateHexHeal,
  updateAngelWings,
  updateArchangelAscension,
  updateHeartLead
});
const activeEnemyBuffer: Enemy[] = [];
const heartLeadReadyCastersBuffer: HeartLeadCaster[] = [];
const heartLeadReadyCastersPool: HeartLeadCaster[] = [];
const heartLeadPlansBuffer: HeartLeadPlan[] = [];
const heartLeadPlansPool: HeartLeadPlan[] = [];
const heartLeadTargetsPool: Enemy[][] = [];
const heartLeadSingleTargetsBuffer: Enemy[] = [];
const heartLeadClaimedTargetsBuffer = new Set<Enemy>();
const heartLeadSingleClaimedTargetsBuffer = new Set<Enemy>();
const heartLeadPositionMapBuffer = new Map<Enemy, EnemyPosition>();
const heartLeadPositionPool: EnemyPosition[] = [];
const nearbyHexArmorSourcesBuffer: Enemy[] = [];
let defensiveAuraIconsMayBeVisible = false;
const enemySupportSourcesBuffer: EnemySupportSources = {
  enemies: [],
  hexagons: [],
  hexagonLaneMask: 0,
  magicResistanceLaneMask: 0,
  chargingHexLaneMask: 0,
  leaderLaneMask: 0,
  hexagonsByLane: enemyLaneBuckets(),
  magicResistanceByLane: enemyLaneBuckets(),
  chargingHexByLane: enemyLaneBuckets(),
  leadersByLane: enemyLaneBuckets()
};

export function hexArmorBonus(enemies: Enemy[], target: Enemy) {
  return enemySupportBonuses(enemies, target, { includeDefense: true }).armor;
}

export function hexMagicResistanceBonus(enemies: Enemy[], target: Enemy) {
  return enemySupportBonuses(enemies, target, { includeDefense: true }).magicResistance;
}

export function enemySupportBonuses(
  enemies: Enemy[],
  target: Enemy,
  options: { includeDefense?: boolean; includeMovement?: boolean; sources?: EnemySupportSources } = {}
): EnemySupportBonuses {
  const includeDefense = options.includeDefense ?? false;
  const includeMovement = options.includeMovement ?? false;
  if (options.sources) {
    return enemySupportBonusesFromSources(options.sources, target, includeDefense, includeMovement);
  }

  let armor = 0;
  let magicResistance = 0;
  let hasChargingHexBuff = false;
  let hasLeaderBuff = false;

  for (const enemy of enemies) {
    if (enemyIsHighFlying(enemy)) {
      continue;
    }

    let family: ReturnType<typeof enemyFamily> | undefined;
    if (includeDefense) {
      const isInArmorAuraRange = distanceSq(enemy.x, enemy.y, target.x, target.y) <= HEX_ARMOR_RADIUS_SQ;
      const isInMagicResistanceLane = enemy.lane === target.lane;
      if (isInArmorAuraRange || isInMagicResistanceLane) {
        family = enemyFamily(enemy.kind);
        if (isInArmorAuraRange && family === "hexagon") {
          armor += hexArmorAuraBonus(enemy);
        }
        if (isInMagicResistanceLane && family === "hexSpellBulwark") {
          magicResistance += hexMagicResistanceAuraBonus(enemy);
        }
      }
    }

    if (includeMovement && enemy.lane === target.lane && enemy.x < target.x) {
      family ??= enemyFamily(enemy.kind);
      if (family === "chargingHexagon") {
        hasChargingHexBuff = true;
      } else if (family === "heart") {
        hasLeaderBuff = true;
      }
    }
  }

  if (armor === 0 && magicResistance === 0 && !hasChargingHexBuff && !hasLeaderBuff) {
    return NO_ENEMY_SUPPORT_BONUSES;
  }

  return {
    armor,
    magicResistance,
    speedMultiplier: hasChargingHexBuff || hasLeaderBuff
      ? Math.max(CHARGING_HEX_SPEED_MULTIPLIER, LEADER_SPEED_MULTIPLIER)
      : 1
  };
}

function enemySupportBonusesFromSources(
  sources: EnemySupportSources,
  target: Enemy,
  includeDefense: boolean,
  includeMovement: boolean
): EnemySupportBonuses {
  const lane = target.lane;
  const laneIsValid = lane >= 0 && lane < LANES;
  const laneMask = laneIsValid ? 1 << lane : 0;
  const hasMagicResistanceLaneSources = (sources.magicResistanceLaneMask & laneMask) !== 0;
  const hasChargingHexLaneSources = (sources.chargingHexLaneMask & laneMask) !== 0;
  const hasLeaderLaneSources = (sources.leaderLaneMask & laneMask) !== 0;
  const laneMagicResistanceSources = hasMagicResistanceLaneSources ? sources.magicResistanceByLane[lane] : undefined;
  const laneChargingHexSources = hasChargingHexLaneSources ? sources.chargingHexByLane[lane] : undefined;
  const laneLeaderSources = hasLeaderLaneSources ? sources.leadersByLane[lane] : undefined;
  const hasDefenseSources =
    includeDefense &&
    (sources.hexagons.length > 0 || hasMagicResistanceLaneSources);
  const hasMovementSources =
    includeMovement &&
    (hasChargingHexLaneSources || hasLeaderLaneSources);
  if (!hasDefenseSources && !hasMovementSources) {
    return NO_ENEMY_SUPPORT_BONUSES;
  }

  let armor = 0;
  let magicResistance = 0;
  if (hasDefenseSources) {
    for (const enemy of nearbyHexArmorSources(sources, target)) {
      if (distanceSq(enemy.x, enemy.y, target.x, target.y) <= HEX_ARMOR_RADIUS_SQ && supportSourceIsActive(enemy)) {
        armor += hexArmorAuraBonus(enemy);
      }
    }
    for (const enemy of laneMagicResistanceSources ?? []) {
      if (supportSourceIsActive(enemy)) {
        magicResistance += hexMagicResistanceAuraBonus(enemy);
      }
    }
  }

  let hasChargingHexBuff = false;
  let hasLeaderBuff = false;
  if (hasMovementSources) {
    hasChargingHexBuff = hasActiveSupportBehind(laneChargingHexSources, target);
    hasLeaderBuff = hasActiveSupportBehind(laneLeaderSources, target);
  }

  if (armor === 0 && magicResistance === 0 && !hasChargingHexBuff && !hasLeaderBuff) {
    return NO_ENEMY_SUPPORT_BONUSES;
  }

  return {
    armor,
    magicResistance,
    speedMultiplier: hasChargingHexBuff || hasLeaderBuff
      ? Math.max(CHARGING_HEX_SPEED_MULTIPLIER, LEADER_SPEED_MULTIPLIER)
      : 1
  };
}

function hasActiveSupportBehind(supportSources: Enemy[] | undefined, target: Enemy) {
  if (!supportSources) {
    return false;
  }

  for (const enemy of supportSources) {
    if (enemy.x < target.x && supportSourceIsActive(enemy)) {
      return true;
    }
  }
  return false;
}

function supportSourceIsActive(enemy: Enemy) {
  return enemy.inPlay && !enemyIsHighFlying(enemy);
}

export function hexBossArmorBonus(enemies: Enemy[], boss: CubeBoss | null) {
  if (!boss) {
    return 0;
  }

  let bonus = 0;
  for (const enemy of enemies) {
    if (!enemyIsHighFlying(enemy) && isHexagon(enemy) && bossBodyInRadius(boss, enemy.x, enemy.y, HEX_ARMOR_RADIUS_SQ)) {
      bonus += hexArmorAuraBonus(enemy);
    }
  }
  return bonus;
}

function bossBodyInRadius(boss: CubeBoss, x: number, y: number, radiusSq: number) {
  return bossPartDistanceSqToPoint(boss, x, y) <= radiusSq;
}

export function syncHexArmorAuras(enemies: Enemy[], time: number, sources = enemySupportSources(enemies)) {
  if (sources.hexagons.length === 0 && sources.magicResistanceLaneMask === 0) {
    if (!defensiveAuraIconsMayBeVisible) {
      return;
    }

    for (const enemy of enemies) {
      setVisibleIfChanged(enemy.armorIcon, false);
      setVisibleIfChanged(enemy.magicResistanceIcon, false);
    }
    defensiveAuraIconsMayBeVisible = false;
    return;
  }

  const iconY = -38 + Math.sin(time / 110) * 2;
  let anyIconVisible = false;
  for (const enemy of enemies) {
    const auraFlags = hexAuraFlags(sources, enemy);
    const hasArmorBonus = (auraFlags & HEX_AURA_ARMOR_FLAG) !== 0;
    const hasMagicResistanceBonus = (auraFlags & HEX_AURA_MAGIC_RESISTANCE_FLAG) !== 0;
    anyIconVisible = anyIconVisible || hasArmorBonus || hasMagicResistanceBonus;

    setVisibleIfChanged(enemy.armorIcon, hasArmorBonus);
    setVisibleIfChanged(enemy.magicResistanceIcon, hasMagicResistanceBonus);
    if (hasArmorBonus) {
      setPositionIfChanged(enemy.armorIcon, hasMagicResistanceBonus ? -10 : 0, iconY);
    }
    if (hasMagicResistanceBonus) {
      setPositionIfChanged(enemy.magicResistanceIcon, hasArmorBonus ? 10 : 0, iconY);
    }
  }
  defensiveAuraIconsMayBeVisible = anyIconVisible;
}

export function chargingHexSpeedMultiplier(enemies: Enemy[], target: Enemy) {
  let hasChargingHexBuff = false;
  let hasLeaderBuff = false;
  for (const enemy of enemies) {
    if (enemyIsHighFlying(enemy) || enemy.lane !== target.lane || enemy.x >= target.x) {
      continue;
    }

    const family = enemyFamily(enemy.kind);
    if (family === "chargingHexagon") {
      hasChargingHexBuff = true;
    } else if (family === "heart") {
      hasLeaderBuff = true;
    }

    if (hasChargingHexBuff && hasLeaderBuff) {
      break;
    }
  }

  return hasChargingHexBuff || hasLeaderBuff
    ? Math.max(CHARGING_HEX_SPEED_MULTIPLIER, LEADER_SPEED_MULTIPLIER)
    : 1;
}

export function updateEnemySkills(runtime: EnemySkillRuntime, seconds: number, time: number) {
  const activeHeartEnemies = activeEnemyBuffer;
  activeHeartEnemies.length = 0;

  try {
    for (const enemy of runtime.enemies) {
      if (enemyIsHighFlying(enemy)) {
        continue;
      }

      const family = enemyFamily(enemy.kind);
      const definitions = enemySkillDefinitionsForFamily(enemySkillRegistry, family);
      if (family !== "heart" && definitions.length === 0) {
        continue;
      }

      if (hasUnexpiredStatusEffect(enemy, "frozen", time)) {
        continue;
      }

      if (family === "heart") {
        activeHeartEnemies.push(enemy);
        continue;
      }

      for (const definition of definitions) {
        definition.update(enemy, getEnemySkillState(enemy, definition.stateKey), seconds, time, runtime);
      }
    }
    if (activeHeartEnemies.length > 0) {
      updateHeartLeads(runtime.scene, runtime.enemies, activeHeartEnemies, seconds);
    }
  } finally {
    activeHeartEnemies.length = 0;
  }
}

function hexArmorAuraBonus(enemy: Enemy) {
  return HEX_ARMOR_RANK_ONE_BONUS + Math.max(0, enemyRank(enemy.kind) - 1) * HEX_ARMOR_BONUS_PER_EXTRA_RANK;
}

function hexMagicResistanceAuraBonus(enemy: Enemy) {
  return (
    HEX_SPELL_BULWARK_RANK_ONE_MAGIC_RESISTANCE_BONUS +
    Math.max(0, enemyRank(enemy.kind) - 1) * HEX_SPELL_BULWARK_MAGIC_RESISTANCE_BONUS_PER_EXTRA_RANK
  );
}

export function enemySupportSources(enemies: Enemy[]): EnemySupportSources {
  // Reused per call; consume synchronously before requesting another support view.
  const sources = enemySupportSourcesBuffer;
  sources.enemies = enemies;
  sources.hexagons.length = 0;
  clearEnemyLaneBuckets(sources.hexagonsByLane, sources.hexagonLaneMask);
  clearEnemyLaneBuckets(sources.magicResistanceByLane, sources.magicResistanceLaneMask);
  clearEnemyLaneBuckets(sources.chargingHexByLane, sources.chargingHexLaneMask);
  clearEnemyLaneBuckets(sources.leadersByLane, sources.leaderLaneMask);
  sources.hexagonLaneMask = 0;
  sources.magicResistanceLaneMask = 0;
  sources.chargingHexLaneMask = 0;
  sources.leaderLaneMask = 0;

  let hexagonLaneMask = 0;
  let magicResistanceLaneMask = 0;
  let chargingHexLaneMask = 0;
  let leaderLaneMask = 0;
  for (const enemy of enemies) {
    if (enemyIsHighFlying(enemy)) {
      continue;
    }

    const family = enemyFamily(enemy.kind);
    if (family === "hexagon") {
      sources.hexagons.push(enemy);
      if (enemy.lane >= 0 && enemy.lane < LANES) {
        hexagonLaneMask |= 1 << enemy.lane;
        sources.hexagonsByLane[enemy.lane].push(enemy);
      }
    } else if (family === "hexSpellBulwark" && enemy.lane >= 0 && enemy.lane < LANES) {
      magicResistanceLaneMask |= 1 << enemy.lane;
      sources.magicResistanceByLane[enemy.lane].push(enemy);
    } else if (family === "chargingHexagon" && enemy.lane >= 0 && enemy.lane < LANES) {
      chargingHexLaneMask |= 1 << enemy.lane;
      sources.chargingHexByLane[enemy.lane].push(enemy);
    } else if (family === "heart" && enemy.lane >= 0 && enemy.lane < LANES) {
      leaderLaneMask |= 1 << enemy.lane;
      sources.leadersByLane[enemy.lane].push(enemy);
    }
  }
  sources.hexagonLaneMask = hexagonLaneMask;
  sources.magicResistanceLaneMask = magicResistanceLaneMask;
  sources.chargingHexLaneMask = chargingHexLaneMask;
  sources.leaderLaneMask = leaderLaneMask;
  return sources;
}

function enemyLaneBuckets() {
  const lanes: Enemy[][] = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    lanes.push([]);
  }
  return lanes;
}

function clearEnemyLaneBuckets(buckets: Enemy[][], laneMask: number) {
  if (laneMask === 0) {
    return;
  }

  for (let lane = 0; lane < LANES; lane += 1) {
    if ((laneMask & (1 << lane)) !== 0) {
      buckets[lane].length = 0;
    }
  }
}

function hexAuraFlags(sources: EnemySupportSources, target: Enemy) {
  const laneMask = target.lane >= 0 && target.lane < LANES ? 1 << target.lane : 0;
  if (sources.hexagons.length === 0 && (sources.magicResistanceLaneMask & laneMask) === 0) {
    return 0;
  }

  if (enemyIsHighFlying(target)) {
    return 0;
  }

  let flags = 0;
  for (const enemy of nearbyHexArmorSources(sources, target)) {
    if (distanceSq(enemy.x, enemy.y, target.x, target.y) <= HEX_ARMOR_RADIUS_SQ) {
      flags |= HEX_AURA_ARMOR_FLAG;
      break;
    }
  }

  if ((sources.magicResistanceLaneMask & laneMask) !== 0) {
    flags |= HEX_AURA_MAGIC_RESISTANCE_FLAG;
  }

  return flags;
}

function nearbyHexArmorSources(sources: EnemySupportSources, target: Enemy) {
  if (target.lane < 0 || target.lane >= LANES || sources.hexagonLaneMask === 0) {
    return sources.hexagons;
  }

  const minLane = Math.max(0, target.lane - HEX_ARMOR_LANE_RADIUS);
  const maxLane = Math.min(LANES - 1, target.lane + HEX_ARMOR_LANE_RADIUS);
  if (minLane === 0 && maxLane === LANES - 1) {
    return sources.hexagons;
  }

  nearbyHexArmorSourcesBuffer.length = 0;
  for (let lane = minLane; lane <= maxLane; lane += 1) {
    if ((sources.hexagonLaneMask & (1 << lane)) === 0) {
      continue;
    }

    const laneSources = sources.hexagonsByLane[lane];
    for (const enemy of laneSources) {
      nearbyHexArmorSourcesBuffer.push(enemy);
    }
  }
  return nearbyHexArmorSourcesBuffer;
}

function updateHexHeal(enemy: Enemy, state: SkillState, seconds: number, _time: number, runtime: EnemySkillRuntime) {
  gainSkillSp(state, seconds * HEX_HEAL_SKILL_REGEN_PER_SECOND, HEX_HEAL_SKILL_MAX);
  tryUseHexHeal(runtime.scene, runtime.enemies, enemy, state);
}

function updateAngelWings(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (time < state.activeUntil) {
    return;
  }

  gainSkillSp(state, seconds * ANGEL_WINGS_REGEN_PER_SECOND * skillRegenMultiplier(state), ANGEL_WINGS_SKILL_MAX);
  if (isSkillReady(state, ANGEL_WINGS_SKILL_MAX)) {
    triggerAngelWings(runtime.scene, runtime.enemies, enemy, time, state);
  }
}

function updateArchangelAscension(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (time < state.activeUntil) {
    return;
  }

  gainSkillSp(state, seconds * ARCHANGEL_ASCENSION_REGEN_PER_SECOND * skillRegenMultiplier(state), ARCHANGEL_ASCENSION_SKILL_MAX);
  if (isSkillReady(state, ARCHANGEL_ASCENSION_SKILL_MAX)) {
    triggerArchangelAscension(runtime.scene, runtime.enemies, enemy, time, state);
  }
}

function updateHeartLead(enemy: Enemy, state: SkillState, seconds: number, _time: number, runtime: EnemySkillRuntime) {
  gainSkillSp(state, seconds * HEART_LEAD_REGEN_PER_SECOND, HEART_LEAD_SKILL_MAX);
  if (!isSkillReady(state, HEART_LEAD_SKILL_MAX)) {
    return;
  }

  tryUseHeartLead(runtime.scene, runtime.enemies, enemy, state);
}

function updateHeartLeads(scene: Phaser.Scene, enemies: Enemy[], activeHeartEnemies: Enemy[], seconds: number) {
  const readyCasters = heartLeadReadyCastersBuffer;
  const leadPlans = heartLeadPlansBuffer;
  const claimedTargets = heartLeadClaimedTargetsBuffer;
  readyCasters.length = 0;
  leadPlans.length = 0;
  claimedTargets.clear();

  try {
    for (const caster of activeHeartEnemies) {
      const skill = getEnemySkillState(caster, "lead");
      gainSkillSp(skill, seconds * HEART_LEAD_REGEN_PER_SECOND, HEART_LEAD_SKILL_MAX);
      if (!isSkillReady(skill, HEART_LEAD_SKILL_MAX)) {
        continue;
      }

      readyCasters.push(heartLeadReadyCaster(readyCasters.length, caster, skill));
    }

    if (readyCasters.length === 0) {
      return;
    }

    const originalPositions = enemyPositionMap(enemies);
    for (const { caster, skill } of readyCasters) {
      const targets = heartLeadTargets(
        enemies,
        caster,
        originalPositions,
        claimedTargets,
        heartLeadTargetsPool[leadPlans.length] ?? createHeartLeadTargetBuffer(leadPlans.length)
      );
      if (targets.length === 0) {
        continue;
      }

      for (const target of targets) {
        claimedTargets.add(target);
      }
      leadPlans.push(heartLeadPlan(leadPlans.length, caster, skill, targets));
    }

    for (const plan of leadPlans) {
      spendSkillSp(plan.skill, HEART_LEAD_SKILL_COST);
      for (const target of plan.targets) {
        const previousY = target.y;
        target.lane = plan.caster.lane;
        target.y = plan.caster.y;
        syncEnemyBodyPosition(target);
        makeShiftEffect(scene, target.x, previousY, target.x, target.y);
      }
    }
  } finally {
    readyCasters.length = 0;
    for (const plan of leadPlans) {
      plan.targets.length = 0;
    }
    leadPlans.length = 0;
    claimedTargets.clear();
    heartLeadPositionMapBuffer.clear();
  }
}

function tryUseHexHeal(scene: Phaser.Scene, enemies: Enemy[], healer: Enemy, skill: SkillState) {
  if (!isSkillReady(skill, HEX_HEAL_SKILL_MAX)) {
    return;
  }

  let target: Enemy | undefined;
  let targetHpRatio = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (
      enemyIsHighFlying(enemy) ||
      enemy.hp >= enemy.baseStats.maxHp ||
      distanceSq(enemy.x, enemy.y, healer.x, healer.y) > HEX_ARMOR_RADIUS_SQ
    ) {
      continue;
    }

    const hpRatio = enemy.hp / enemy.baseStats.maxHp;
    if (hpRatio < targetHpRatio) {
      target = enemy;
      targetHpRatio = hpRatio;
    }
  }
  if (!target) {
    return;
  }

  spendSkillSp(skill, HEX_HEAL_SKILL_COST);
  const previousHp = target.hp;
  target.hp = Math.min(target.baseStats.maxHp, target.hp + healer.baseStats.maxHp * HEX_HEAL_RATIO);
  if (target.hp <= previousHp) {
    return;
  }

  syncEnemyVisualScale(target);
  makeHealParticles(scene, target.x, target.y);
}

function heartLeadReadyCaster(index: number, caster: Enemy, skill: SkillState) {
  const readyCaster = heartLeadReadyCastersPool[index] ?? createHeartLeadReadyCaster(index, caster, skill);
  readyCaster.caster = caster;
  readyCaster.skill = skill;
  return readyCaster;
}

function createHeartLeadReadyCaster(index: number, caster: Enemy, skill: SkillState) {
  const readyCaster: HeartLeadCaster = { caster, skill };
  heartLeadReadyCastersPool[index] = readyCaster;
  return readyCaster;
}

function heartLeadPlan(index: number, caster: Enemy, skill: SkillState, targets: Enemy[]) {
  const plan = heartLeadPlansPool[index] ?? createHeartLeadPlan(index, caster, skill, targets);
  plan.caster = caster;
  plan.skill = skill;
  plan.targets = targets;
  return plan;
}

function createHeartLeadPlan(index: number, caster: Enemy, skill: SkillState, targets: Enemy[]) {
  const plan: HeartLeadPlan = { caster, skill, targets };
  heartLeadPlansPool[index] = plan;
  return plan;
}

function isHexagon(enemy: Enemy) {
  return enemyFamily(enemy.kind) === "hexagon";
}

function tryUseHeartLead(scene: Phaser.Scene, enemies: Enemy[], caster: Enemy, skill: SkillState) {
  const originalPositions = enemyPositionMap(enemies);
  const claimedTargets = heartLeadSingleClaimedTargetsBuffer;
  const targets = heartLeadTargets(enemies, caster, originalPositions, claimedTargets, heartLeadSingleTargetsBuffer);

  try {
    if (targets.length === 0) {
      return;
    }

    spendSkillSp(skill, HEART_LEAD_SKILL_COST);
    for (const target of targets) {
      const previousY = target.y;
      target.lane = caster.lane;
      target.y = caster.y;
      syncEnemyBodyPosition(target);
      makeShiftEffect(scene, target.x, previousY, target.x, target.y);
    }
  } finally {
    targets.length = 0;
    claimedTargets.clear();
    heartLeadPositionMapBuffer.clear();
  }
}

function enemyPositionMap(enemies: Enemy[]) {
  const positions = heartLeadPositionMapBuffer;
  positions.clear();
  for (let index = 0; index < enemies.length; index += 1) {
    const enemy = enemies[index];
    const position = heartLeadPositionPool[index] ?? createEnemyPositionBuffer(index);
    position.x = enemy.x;
    position.y = enemy.y;
    position.lane = enemy.lane;
    positions.set(enemy, position);
  }
  return positions;
}

function heartLeadTargets(
  enemies: Enemy[],
  caster: Enemy,
  originalPositions: Map<Enemy, EnemyPosition>,
  claimedTargets: Set<Enemy>,
  targets: Enemy[]
) {
  targets.length = 0;
  const casterPosition = originalPositions.get(caster);
  if (!casterPosition) {
    return targets;
  }

  const casterColumn = Math.floor((casterPosition.x - BOARD_X) / CELL_WIDTH);
  const left = BOARD_X + casterColumn * CELL_WIDTH;
  const right = left + HEART_LEAD_COLUMN_SPAN * CELL_WIDTH;
  for (const enemy of enemies) {
    const position = originalPositions.get(enemy);
    if (
      position !== undefined &&
      enemy !== caster &&
      !claimedTargets.has(enemy) &&
      isOrdinaryLeadTarget(enemy) &&
      position.x >= left &&
      position.x < right &&
      Math.abs(position.lane - casterPosition.lane) <= HEART_LEAD_LANE_RADIUS &&
      position.lane !== casterPosition.lane
    ) {
      targets.push(enemy);
    }
  }
  return targets;
}

function createHeartLeadTargetBuffer(index: number) {
  const targets: Enemy[] = [];
  heartLeadTargetsPool[index] = targets;
  return targets;
}

function createEnemyPositionBuffer(index: number) {
  const position = { x: 0, y: 0, lane: 0 };
  heartLeadPositionPool[index] = position;
  return position;
}

function isOrdinaryLeadTarget(enemy: Enemy) {
  return !enemyIgnoresLeaderRestrictedMechanics(enemy) && !enemyIsBossCompanion(enemy.kind) && !enemyIsHighFlying(enemy);
}

function skillRegenMultiplier(state: SkillState) {
  return state.regenMultiplier ?? 1;
}

export function triggerAngelWings(
  scene: Phaser.Scene,
  enemies: Enemy[],
  caster: Enemy,
  time: number,
  skill = getEnemySkillState(caster, "wings")
) {
  triggerWingsEffect(scene, enemies, caster, time, skill, {
    cost: ANGEL_WINGS_SKILL_COST,
    duration: ANGEL_WINGS_DURATION,
    inRange: isInAngelWingsRange
  });
}

export function triggerArchangelAscension(
  scene: Phaser.Scene,
  enemies: Enemy[],
  caster: Enemy,
  time: number,
  skill = getEnemySkillState(caster, "ascension")
) {
  triggerWingsEffect(scene, enemies, caster, time, skill, {
    cost: ARCHANGEL_ASCENSION_SKILL_COST,
    duration: ARCHANGEL_ASCENSION_DURATION,
    inRange: isInArchangelAscensionRange
  });
}

function triggerWingsEffect(
  scene: Phaser.Scene,
  enemies: Enemy[],
  caster: Enemy,
  time: number,
  skill: SkillState,
  options: {
    cost: number;
    duration: number;
    inRange: (caster: Enemy, target: Enemy) => boolean;
  }
) {
  spendSkillSp(skill, options.cost);
  skill.activeUntil = time + options.duration;
  for (const target of enemies) {
    if (enemyIsHighFlying(target)) {
      continue;
    }

    if (!options.inRange(caster, target)) {
      continue;
    }

    applyStatusEffect(target, "flying", options.duration, time, ANGEL_WINGS_SPEED_MULTIPLIER, true);
    makeWingPulse(scene, target.x, target.y);
  }
}

function isInAngelWingsRange(caster: Enemy, target: Enemy) {
  return Math.abs(target.x - caster.x) <= ANGEL_WINGS_RANGE_X && Math.abs(target.y - caster.y) <= ANGEL_WINGS_RANGE_Y;
}

function isInArchangelAscensionRange(caster: Enemy, target: Enemy) {
  return distanceSq(target.x, target.y, caster.x, caster.y) <= ARCHANGEL_ASCENSION_RADIUS_SQ;
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function makeWingPulse(scene: Phaser.Scene, x: number, y: number) {
  const halo = scene.add.ellipse(x, y - 28, 34, 10, 0x000000, 0).setStrokeStyle(2, 0xf5f5f5, 0.9).setDepth(109);
  const lift = scene.add.graphics().setDepth(108);
  lift.lineStyle(2, 0xf5f5f5, 0.65);
  lift.lineBetween(x - 18, y - 8, x - 34, y - 22);
  lift.lineBetween(x + 18, y - 8, x + 34, y - 22);
  scene.tweens.add({
    targets: [halo, lift],
    y: "-=18",
    alpha: 0,
    duration: 320,
    ease: "Quad.easeOut",
    onComplete: () => {
      halo.destroy();
      lift.destroy();
    }
  });
}
