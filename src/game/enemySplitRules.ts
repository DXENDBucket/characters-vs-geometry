import { LANES } from "../config";
import type { EnemyKind } from "../types";
import type { EnemyState as Enemy } from "./enemyState";
import type { EnemySpawnOptions } from "./waveSpawner";
import { enemyFamily, enemyKindAtRank, enemyRank, enemyIsSiegeRam, enemySplitSpawnKind } from "../registry/enemies";
import { enemyFacingDirection } from "./rules/reversal";

const SPLIT_SPAWN_LANES: number[][] = [];
for (let lane = 0; lane < LANES; lane += 1) {
  const lanes: number[] = [];
  for (let candidate = lane - 1; candidate <= lane + 1; candidate += 1) {
    if (candidate >= 0 && candidate < LANES) {
      lanes.push(candidate);
    }
  }
  SPLIT_SPAWN_LANES.push(lanes);
}

export function spawnSplitEnemies(
  spawnEnemy: (options: EnemySpawnOptions) => void,
  enemy: Enemy,
  battleTime: number,
  finalDamageReduction: number
) {
  const family = enemyFamily(enemy.kind);
  if (family === "hexMace") {
    spawnHexMaceSplit(spawnEnemy, enemy, battleTime);
    return;
  }

  if (family === "angelPentagonRam") {
    spawnAngelPentagonRamSplit(spawnEnemy, enemy, battleTime);
    return;
  }

  if (enemyIsSiegeRam(enemy.kind)) {
    spawnSiegeRamTriangles(spawnEnemy, enemy, battleTime);
    return;
  }

  const spawnKind = splitSpawnKind(enemy.kind);
  if (!spawnKind) {
    return;
  }

  for (const lane of splitSpawnLanes(enemy.lane)) {
    spawnEnemy({
      kind: spawnKind,
      waveNumber: enemy.waveNumber,
      time: battleTime,
      lane,
      x: enemy.x,
      waveWeight: 0,
      finalDamageReduction
    });
  }
}

function spawnSiegeRamTriangles(spawnEnemy: (options: EnemySpawnOptions) => void, enemy: Enemy, time: number) {
  const spawnKind = enemyKindAtRank("triangle", enemyRank(enemy.kind));
  const direction = enemyFacingDirection(enemy);
  const offsets = [-18, 18];
  for (const offset of offsets) {
    spawnEnemy({
      kind: spawnKind,
      waveNumber: enemy.waveNumber,
      time,
      lane: enemy.lane,
      x: enemy.x + offset,
      waveWeight: 0,
      finalDamageReduction: enemy.baseStats.finalDamageReduction,
      movementDirection: direction
    });
  }
}

function spawnAngelPentagonRamSplit(spawnEnemy: (options: EnemySpawnOptions) => void, enemy: Enemy, time: number) {
  const rank = enemyRank(enemy.kind);
  const direction = enemyFacingDirection(enemy);
  const spawns: Array<{ kind: EnemyKind; offset: number }> = [
    { kind: enemyKindAtRank("angelPentagon", rank), offset: direction * 18 },
    { kind: enemyKindAtRank("pentagon", rank), offset: -direction * 18 }
  ];
  for (const spawn of spawns) {
    spawnEnemy({
      kind: spawn.kind,
      waveNumber: enemy.waveNumber,
      time,
      lane: enemy.lane,
      x: enemy.x + spawn.offset,
      waveWeight: 0,
      finalDamageReduction: enemy.baseStats.finalDamageReduction,
      movementDirection: direction
    });
  }
}

function spawnHexMaceSplit(spawnEnemy: (options: EnemySpawnOptions) => void, enemy: Enemy, time: number) {
  const rank = enemyRank(enemy.kind);
  const direction = enemyFacingDirection(enemy);
  const spawns: Array<{ kind: EnemyKind; offset: number }> = [
    { kind: enemyKindAtRank("chargingHexagon", rank), offset: direction * 18 },
    { kind: enemyKindAtRank("hexagon", rank), offset: -direction * 18 }
  ];
  for (const spawn of spawns) {
    spawnEnemy({
      kind: spawn.kind,
      waveNumber: enemy.waveNumber,
      time,
      lane: enemy.lane,
      x: enemy.x + spawn.offset,
      waveWeight: 0,
      finalDamageReduction: enemy.baseStats.finalDamageReduction,
      movementDirection: direction
    });
  }
}

export function splitSpawnKind(kind: EnemyKind) {
  return enemySplitSpawnKind(kind);
}

export function splitSpawnLanes(lane: number) {
  return SPLIT_SPAWN_LANES[lane] ?? [];
}
