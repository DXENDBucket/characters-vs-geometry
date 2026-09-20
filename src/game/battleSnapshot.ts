import type Phaser from "phaser";
import type { CubeBoss, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower } from "../types";
import { createCubeBoss, updateCubeBossMotion } from "../bosses/cubeBoss";
import { rankedBossFamily } from "../bosses/bossRanks";
import { getCardDefinition } from "../registry/cards";
import { towerBehaviorType } from "./towerIdentity";
import { syncTowerFormVisual } from "./towers";
import { createEnemy } from "./enemyFactory";
import { createTower, syncTowerFacingVisual, syncTowerFlyingVisual, syncTowerHpBar, syncTowerLevelText, syncTowerTrueDamageVisual } from "./towers";
import { createMortarProjectile, createTowerProjectile, restoreEnemyProjectile } from "./projectiles";
import { syncEnemyFacingVisual, syncEnemyVisualScale } from "./enemyBehaviors";
import { statusMultipliers, syncEnemyBodyPosition } from "./statusEffects";
import { decodeSaveGraph, encodeSaveGraph, type GraphNode, type NodeKind, type SaveGraph } from "./saveGraph";
import type { BattleSaveState } from "./battleSaveState";
import { containedEnemies, syncPassengerPositions } from "./enemyContainers";
import { projectileVisualScale } from "./projectileIntegrity";

const towerVisuals = new Set<string>(["body", "border", "label", "facingIcon", "autoUpgradeBorder", "trueDamageBorder",
  "flyingHalo", "hpFill", "negativeHpBack", "negativeHpFill", "rangeBorder", "levelText"] satisfies (keyof Tower)[]);
const enemyVisuals = new Set<string>(["body", "shape", "statusBorder", "frozenBorder", "powerIcon", "sunderIcon",
  "armorIcon", "magicResistanceIcon", "flyingHalo", "statusMultiplierCache"] satisfies (keyof Enemy)[]);
const shotVisuals = new Set(["body"]);
const bossVisuals = new Set<string>(["body", "frame", "labelText"] satisfies (keyof CubeBoss)[]);

export function captureBattleSnapshot(state: BattleSaveState) {
  return encodeSaveGraph(state, object => {
    const value = object as Record<string, unknown>;
    if (typeof value.id === "string" && value.id.startsWith("tower:")) return { kind: "tower", omit: towerVisuals };
    if ("kind" in value && "waveNumber" in value) return { kind: "enemy", omit: enemyVisuals };
    if ("advanceMinionKind" in value && "rank" in value) {
      if (!rankedBossFamily(value.kind) && value.kind !== "icosahedron") throw new Error("Unsupported boss save");
      return { kind: "boss", omit: bossVisuals };
    }
    if ("body" in value) {
      const kind: NodeKind = "owner" in value ? "mortar" : "sourceLane" in value ? "enemyProjectile" : "projectile";
      return { kind, omit: shotVisuals };
    }
    if (!Array.isArray(object) && Object.getPrototypeOf(object) !== Object.prototype) throw new Error("Non-data object in save");
    return { kind: Array.isArray(object) ? "array" : "object" };
  });
}

export function restoreBattleSnapshot(scene: Phaser.Scene, graph: SaveGraph): BattleSaveState {
  const towers: Tower[] = [];
  const enemies: Enemy[] = [];
  const bosses: CubeBoss[] = [];
  const shots: Array<Projectile | EnemyProjectile | MortarProjectile> = [];
  const bodies: Phaser.GameObjects.GameObject[] = [];
  try {
    const state = decodeSaveGraph<BattleSaveState>(graph, (node: GraphNode) => {
      // References are connected in a second pass; factories only need primitive placement fields.
      if (node.kind === "boss") {
        const data = node.data as unknown as CubeBoss;
        const boss = createCubeBoss(scene, data.kind, 0, { rank: data.rank, x: data.x, y: data.y });
        bosses.push(boss); bodies.push(boss.body);
        return boss;
      }
      if (node.kind === "tower") {
        const data = node.data as unknown as Tower;
        const tower = createTower(scene, getCardDefinition(data.type), data.lane, data.column, 0, data.placedOrder);
        towers.push(tower); bodies.push(tower.body);
        return tower;
      }
      if (node.kind === "enemy") {
        const data = node.data as unknown as Enemy;
        const enemy = createEnemy(scene, { kind: data.kind, lane: data.lane, x: data.x, time: 0,
          waveNumber: data.waveNumber, waveWeight: data.weight, finalDamageReduction: data.finalDamageReduction });
        enemies.push(enemy); bodies.push(enemy.body);
        return enemy;
      }
      if (node.kind === "mortar") {
        const data = node.data as unknown as MortarProjectile;
        const projectile = createMortarProjectile(scene, { owner: data.owner, fromX: data.fromX, fromY: data.fromY,
          targetX: data.targetX, targetY: data.targetY, damage: data.damage, damageType: data.damageType,
          rangeX: data.rangeX, rangeY: data.rangeY, marker: data.marker, markerText: data.markerText, markerTextColor: data.markerTextColor });
        bodies.push(projectile.body); shots.push(projectile);
        return projectile;
      }
      const data = node.data as unknown as Projectile;
      if (node.kind === "enemyProjectile") {
        const projectile = restoreEnemyProjectile(scene, node.data as unknown as Omit<EnemyProjectile, "body">);
        bodies.push(projectile.body); shots.push(projectile);
        return projectile;
      }
      const projectile = createTowerProjectile(scene, { type: data.type,
        x: data.x, y: data.y, lane: data.lane, speed: 0, damage: data.damage, damageType: data.damageType,
        splashRadius: 0, angleDegrees: Math.atan2(data.vy ?? 0, data.vx) * 180 / Math.PI, maxX: Infinity });
      bodies.push(projectile.body); shots.push(projectile);
      return projectile;
    });
    if (!Array.isArray(state.towers) || !Array.isArray(state.enemies) || !Number.isFinite(state.battleTime) || state.baseIntegrity <= 0) {
      throw new Error("Invalid battle state");
    }
    for (const tower of towers) {
      if (tower.type === "@") syncTowerFormVisual(scene, tower, getCardDefinition(towerBehaviorType(tower)), state.battleTime);
      tower.body.setVisible(tower.inPlay);
      syncTowerFacingVisual(tower); syncTowerFlyingVisual(tower, state.battleTime);
      syncTowerLevelText(tower); syncTowerHpBar(tower); syncTowerTrueDamageVisual(tower, state.battleTime);
      if (!tower.inPlay) tower.body.destroy();
    }
    for (const boss of bosses) {
      if (boss !== state.boss && !state.boss?.octahedronCopies?.includes(boss)) boss.body.destroy();
      else {
        if (boss !== state.boss) boss.body.setDepth(87);
        updateCubeBossMotion(boss, 0, 0, state.battleTime);
      }
    }
    const storedEnemies = new Set(state.storage.map(entry => entry.enemy));
    const retainCargo = (enemy: Enemy) => {
      for (const cargo of containedEnemies(enemy)) {
        if (!storedEnemies.has(cargo)) { storedEnemies.add(cargo); retainCargo(cargo); }
      }
    };
    for (const enemy of [...state.enemies, ...storedEnemies]) retainCargo(enemy);
    for (const enemy of enemies) {
      statusMultipliers(enemy, state.battleTime);
      syncEnemyFacingVisual(enemy); syncEnemyVisualScale(enemy); syncEnemyBodyPosition(enemy);
      enemy.body.setVisible(enemy.inPlay);
      if (!enemy.inPlay && !storedEnemies.has(enemy)) enemy.body.destroy();
    }
    for (const enemy of state.enemies) syncPassengerPositions(enemy);
    const activeShots = new Set<Projectile | EnemyProjectile | MortarProjectile>([...state.projectiles, ...state.enemyProjectiles, ...state.mortarProjectiles]);
    // Stored reflection events retain projectile data, not a projectile on the field.
    for (const projectile of shots) if (!activeShots.has(projectile)) projectile.body.destroy();
    for (const projectile of activeShots) {
      projectile.body.setPosition(projectile.x, projectile.y);
      projectile.body.setScale(projectileVisualScale(projectile));
    }
    for (const projectile of state.mortarProjectiles) {
      projectile.body.rotation = projectile.progress * Math.PI * 1.4;
      projectile.body.setScale(projectileVisualScale(projectile) * (1 + Math.sin(projectile.progress * Math.PI) * 0.26));
    }
    return state;
  } catch (error) {
    for (const body of bodies) body.destroy();
    throw error;
  }
}
