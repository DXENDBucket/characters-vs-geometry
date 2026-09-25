import { CELL_HEIGHT, CELL_WIDTH, CUBE_BOSS_STATS, TETRAHEDRON_BOSS_HASTE_MULTIPLIER } from "../config";
import { DEL_ECHO_HITBOX_CELLS } from "../data/delBoss";
import { rankedBossFamily } from "../bosses/bossRanks";
import { getCardDefinition } from "../registry/cardDefinitions";
import { createTowerState, type TowerState } from "./towerState";
import { createEnemyState, type EnemyState } from "./enemyState";
import { createBossState, type BossState } from "./bossState";
import { createMortarProjectileState, createTowerProjectileState, type MortarProjectileState, type ProjectileState } from "./projectileState";
import { createConfiguredBossSkill } from "./bossSkillRules";
import { refreshStatusEffect } from "./rules/statusEffectRules";
import { syncPassengerPositionState } from "./enemyContainerRules";
import { statusMultipliers } from "./statusEffects";
import { migrateAttackStats } from "./attackStatsMigration";
import { restoreBattleEntityIds } from "./battleEntityGraph";
import { restoredBattleLifecycle } from "./battleLifecycle";
import { decodeSaveGraph, type GraphNode, type SaveGraph } from "./saveGraph";
import type { BattleSaveData } from "./battleSaveState";
import { atan2 } from "./battleMath";

// Factories need only primitive construction fields. Reference wiring remains the codec's job.
export function snapshotPrimitiveData<T>(node: GraphNode): T {
  return Object.fromEntries(Object.entries(node.data).flatMap(([key, value]) => {
    if (value !== null && typeof value === "object") return "number" in value ? [[key, Number(value.number)]] : [];
    return [[key, value]];
  })) as T;
}

function createDataNode(node: GraphNode): object {
  if (node.kind === "tower") {
    const data = snapshotPrimitiveData<TowerState>(node);
    return createTowerState(getCardDefinition(data.type), data.lane, data.column, 0, data.placedOrder);
  }
  if (node.kind === "enemy") {
    const data = snapshotPrimitiveData<EnemyState>(node);
    return createEnemyState({ kind: data.kind, lane: data.lane, x: data.x, time: 0,
      waveNumber: data.waveNumber, waveWeight: data.weight, finalDamageReduction: data.finalDamageReduction }, () => 0.5);
  }
  if (node.kind === "boss") {
    const data = snapshotPrimitiveData<BossState>(node);
    return createBossState(data.kind, 0, { rank: data.rank, x: data.x, y: data.y });
  }
  if (node.kind === "mortar") {
    const data = snapshotPrimitiveData<MortarProjectileState>(node);
    return createMortarProjectileState({ owner: data.owner, fromX: data.fromX, fromY: data.fromY,
      targetX: data.targetX, targetY: data.targetY, damage: data.damage, damageType: data.damageType,
      rangeX: data.rangeX, rangeY: data.rangeY, marker: data.marker, markerText: data.markerText, markerTextColor: data.markerTextColor });
  }
  if (node.kind === "enemyProjectile") return {};
  const data = snapshotPrimitiveData<ProjectileState>(node);
  return createTowerProjectileState({ type: data.type, x: data.x, y: data.y, lane: data.lane,
    speed: 0, damage: data.damage, damageType: data.damageType, splashRadius: 0,
    angleDegrees: atan2(data.vy ?? 0, data.vx) * 180 / Math.PI, maxX: Infinity });
}

// Decodes an already-validated checkpoint. Live hydration supplies display factories;
// both paths run the same defaults, migration and logical status/seat repair.
export function restoreBattleData(graph: SaveGraph, create?: (node: GraphNode) => object): BattleSaveData {
  const towers: TowerState[] = [], enemies: EnemyState[] = [], bosses: BossState[] = [];
  const state = decodeSaveGraph<BattleSaveData>(graph, node => {
    const defaults = createDataNode(node);
    const value = create ? Object.assign(create(node), defaults) : defaults;
    if (node.kind === "tower") towers.push(value as TowerState);
    if (node.kind === "enemy") enemies.push(value as EnemyState);
    if (node.kind === "boss") bosses.push(value as BossState);
    return value;
  });
  if (!Array.isArray(state.towers) || !Array.isArray(state.enemies)) throw new Error("Invalid battle state");
  restoredBattleLifecycle(state.lifecycle, state.battleTime, state.baseIntegrity);
  restoreBattleEntityIds(state);
  migrateAttackStats(state.simulation?.version, towers, enemies);
  for (const boss of bosses) {
    if (boss.kind === "del") {
      const size = boss.delEcho ? DEL_ECHO_HITBOX_CELLS : CUBE_BOSS_STATS.del.hitboxCells!;
      boss.hitboxWidth = CELL_WIDTH * size; boss.hitboxHeight = CELL_HEIGHT * size;
      if (!boss.delEcho) boss.skills.deleteFormat ??= createConfiguredBossSkill("deleteFormat");
    }
    if (rankedBossFamily(boss.kind) === "tetrahedron" && boss.bossHasteUntil > state.battleTime) {
      refreshStatusEffect(boss, "haste", boss.bossHasteUntil, TETRAHEDRON_BOSS_HASTE_MULTIPLIER);
    }
    boss.bossHasteUntil = 0;
  }
  for (const enemy of enemies) statusMultipliers(enemy, state.battleTime);
  for (const enemy of state.enemies) syncPassengerPositionState(enemy);
  return state;
}
