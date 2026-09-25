import { ENEMY_AURAS } from "../data/enemyAbilities";
import { enemySupportCandidates } from "./enemySupportIndex";
import { enemyIsActive } from "./enemyContainerRules";
import { CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import type { BossState as CubeBoss } from "./bossState";
import type { EnemyState as Enemy } from "./enemyState";
import { enemyFamily, enemyRank } from "../registry/enemies";
import { enemyIsHighFlying } from "./enemyCombatRules";
import { bossPartDistanceSqToPoint } from "./unitGeometry";

const HEX_ARMOR_RADIUS = CELL_WIDTH * ENEMY_AURAS.armor.range.shape.radius;
const HEX_ARMOR_RANK_ONE_BONUS = ENEMY_AURAS.armor.base;
const HEX_ARMOR_BONUS_PER_EXTRA_RANK = ENEMY_AURAS.armor.perRank;
const HEX_SPELL_BULWARK_RANK_ONE_MAGIC_RESISTANCE_BONUS = ENEMY_AURAS.resistance.base;
const HEX_SPELL_BULWARK_MAGIC_RESISTANCE_BONUS_PER_EXTRA_RANK = ENEMY_AURAS.resistance.perRank;
export const HEX_AURA_ARMOR_FLAG = 1;
export const HEX_AURA_MAGIC_RESISTANCE_FLAG = 2;
const CHARGING_HEX_SPEED_MULTIPLIER = ENEMY_AURAS.advance.speedMultiplier;
const LEADER_SPEED_MULTIPLIER = ENEMY_AURAS.advance.speedMultiplier;
const HEX_ARMOR_RADIUS_SQ = HEX_ARMOR_RADIUS * HEX_ARMOR_RADIUS;
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

const supportViews = new WeakMap<Enemy[], EnemySupportSources>();
const nearbyBuffers = new WeakMap<EnemySupportSources, Enemy[]>();

function supportView(enemies: Enemy[]) {
  let sources = supportViews.get(enemies);
  if (!sources) {
    sources = { enemies, hexagons: [], hexagonLaneMask: 0, magicResistanceLaneMask: 0,
      chargingHexLaneMask: 0, leaderLaneMask: 0, hexagonsByLane: enemyLaneBuckets(),
      magicResistanceByLane: enemyLaneBuckets(), chargingHexByLane: enemyLaneBuckets(), leadersByLane: enemyLaneBuckets() };
    supportViews.set(enemies, sources);
    nearbyBuffers.set(sources, []);
  }
  return sources;
}

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

  for (const enemy of enemySupportCandidates(enemies)) {
    if (!supportSourceIsActive(enemy)) {
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
  return enemyIsActive(enemy) && !enemyIsHighFlying(enemy);
}

export function hexBossArmorBonus(enemies: Enemy[], boss: CubeBoss | null) {
  if (!boss) {
    return 0;
  }

  let bonus = 0;
  for (const enemy of enemySupportCandidates(enemies)) {
    if (!enemyIsHighFlying(enemy) && isHexagon(enemy) && bossBodyInRadius(boss, enemy.x, enemy.y, HEX_ARMOR_RADIUS_SQ)) {
      bonus += hexArmorAuraBonus(enemy);
    }
  }
  return bonus;
}

function bossBodyInRadius(boss: CubeBoss, x: number, y: number, radiusSq: number) {
  return bossPartDistanceSqToPoint(boss, x, y) <= radiusSq;
}

export function chargingHexSpeedMultiplier(enemies: Enemy[], target: Enemy) {
  let hasChargingHexBuff = false;
  let hasLeaderBuff = false;
  for (const enemy of enemySupportCandidates(enemies)) {
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
  // Reused within one roster. Another battle cannot overwrite this view.
  const sources = supportView(enemies);
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
  for (const enemy of enemySupportCandidates(enemies)) {
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

export function hexAuraFlags(sources: EnemySupportSources, target: Enemy) {
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

  let nearby = nearbyBuffers.get(sources);
  if (!nearby) { nearby = []; nearbyBuffers.set(sources, nearby); }
  nearby.length = 0;
  for (let lane = minLane; lane <= maxLane; lane += 1) {
    if ((sources.hexagonLaneMask & (1 << lane)) === 0) {
      continue;
    }

    const laneSources = sources.hexagonsByLane[lane];
    for (const enemy of laneSources) {
      nearby.push(enemy);
    }
  }
  return nearby;
}

function isHexagon(enemy: Enemy) {
  return enemyFamily(enemy.kind) === "hexagon";
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
