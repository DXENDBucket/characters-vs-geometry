import type Phaser from "phaser";
import type { CubeBoss, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower } from "../types";
import { createCubeBoss, updateCubeBossMotion } from "../bosses/cubeBoss";
import { syncBossCopyWarnings } from "../render/bossCopyWarnings";
import { syncDelSweepWarning } from "../render/delSweepWarning";
import { secondaryBossParts } from "./unitGeometry";
import { getCardDefinition } from "../registry/cardDefinitions";
import { towerBehaviorType } from "./towerIdentity";
import { syncTowerFormVisual } from "./towers";
import { createEnemy } from "./enemyFactory";
import { createTower, syncTowerFacingVisual, syncTowerFlyingVisual, syncTowerHpBar, syncTowerLevelText, syncTowerTrueDamageVisual } from "./towers";
import { createMortarProjectile, createTowerProjectile, restoreEnemyProjectile } from "./projectiles";
import { syncEnemyFacingVisual, syncEnemyVisualScale } from "./enemyBehaviors";
import { syncChevronVisual } from "../render/chevronLeader";
import { syncEnemyBodyPosition, syncEnemyStatusVisuals } from "../render/enemyStatus";
import type { GraphNode, SaveGraph } from "./saveGraph";
import { restoreBattleData, snapshotPrimitiveData } from "./restoreBattleData";
import { atan2 } from "./battleMath";
import type { BattleSaveState } from "./battleSaveState";
import type { EnemyProjectileState } from "./projectileState";
import { containedEnemies, syncPassengerVisuals } from "./enemyContainers";
import { projectileVisualScale } from "./projectileIntegrity";
import { syncTowerAttachmentVisual } from "../render/towerAttachments";
import { withoutBattleEntityAllocation } from "./battleEntityIds";
import { battleRandom, isBattlePlayback, setBattlePlayback } from "./battleSimulation";

export { captureBattleSnapshot } from "./captureBattleSnapshot";

export function restoreBattleSnapshot(scene: Phaser.Scene, graph: SaveGraph): BattleSaveState {
  const towers: Tower[] = [];
  const enemies: Enemy[] = [];
  const bosses: CubeBoss[] = [];
  const shots: Array<Projectile | EnemyProjectile | MortarProjectile> = [];
  const bodies: Phaser.GameObjects.GameObject[] = [];
  const random = battleRandom(scene), randomState = random.state, playback = isBattlePlayback(scene);
  // Constructing a checkpoint must not consume live RNG or write discovery progress.
  setBattlePlayback(scene, true);
  try {
    const state = withoutBattleEntityAllocation(scene, () => restoreBattleData(graph, (node: GraphNode) => {
      // References are connected in a second pass; factories only need primitive placement fields.
      if (node.kind === "boss") {
        const data = snapshotPrimitiveData<CubeBoss>(node);
        const boss = createCubeBoss(scene, data.kind, 0, { rank: data.rank, x: data.x, y: data.y });
        bosses.push(boss); bodies.push(boss.body);
        return boss;
      }
      if (node.kind === "tower") {
        const data = snapshotPrimitiveData<Tower>(node);
        const tower = createTower(scene, getCardDefinition(data.type), data.lane, data.column, 0, data.placedOrder);
        towers.push(tower); bodies.push(tower.body);
        return tower;
      }
      if (node.kind === "enemy") {
        const data = snapshotPrimitiveData<Enemy>(node);
        const enemy = createEnemy(scene, { kind: data.kind, lane: data.lane, x: data.x, time: 0,
          waveNumber: data.waveNumber, waveWeight: data.weight, finalDamageReduction: data.finalDamageReduction });
        enemies.push(enemy); bodies.push(enemy.body);
        return enemy;
      }
      if (node.kind === "mortar") {
        const data = snapshotPrimitiveData<MortarProjectile>(node);
        const projectile = createMortarProjectile(scene, { owner: data.owner, fromX: data.fromX, fromY: data.fromY,
          targetX: data.targetX, targetY: data.targetY, damage: data.damage, damageType: data.damageType,
          rangeX: data.rangeX, rangeY: data.rangeY, marker: data.marker, markerText: data.markerText, markerTextColor: data.markerTextColor });
        bodies.push(projectile.body); shots.push(projectile);
        return projectile;
      }
      const data = snapshotPrimitiveData<Projectile>(node);
      if (node.kind === "enemyProjectile") {
        const projectile = restoreEnemyProjectile(scene, snapshotPrimitiveData<EnemyProjectileState>(node));
        bodies.push(projectile.body); shots.push(projectile);
        return projectile;
      }
      const projectile = createTowerProjectile(scene, { type: data.type,
        x: data.x, y: data.y, lane: data.lane, speed: 0, damage: data.damage, damageType: data.damageType,
        splashRadius: 0, angleDegrees: atan2(data.vy ?? 0, data.vx) * 180 / Math.PI, maxX: Infinity });
      bodies.push(projectile.body); shots.push(projectile);
      return projectile;
    })) as BattleSaveState;
    const nullified = new Set(state.nullifiedTowers?.towers ?? []);
    for (const tower of towers) {
      if (tower.type === "@") syncTowerFormVisual(scene, tower, getCardDefinition(towerBehaviorType(tower)), state.battleTime);
      tower.body.setVisible(tower.inPlay);
      syncTowerFacingVisual(tower); syncTowerFlyingVisual(tower, state.battleTime);
      syncTowerLevelText(tower); syncTowerHpBar(tower); syncTowerTrueDamageVisual(tower, state.battleTime);
      syncTowerAttachmentVisual(scene, tower);
      if (!tower.inPlay && !nullified.has(tower)) tower.body.destroy();
    }
    for (const boss of bosses) {
      if (boss !== state.boss && (!state.boss || !secondaryBossParts(state.boss).includes(boss))) boss.body.destroy();
      else {
        if (boss !== state.boss) boss.body.setDepth(87);
        updateCubeBossMotion(boss, 0, 0, state.battleTime);
        syncBossCopyWarnings(boss, state.battleTime);
        syncDelSweepWarning(boss, state.battleTime);
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
      syncEnemyStatusVisuals(enemy, state.battleTime);
      syncEnemyFacingVisual(enemy); syncEnemyVisualScale(enemy); syncEnemyBodyPosition(enemy);
      syncChevronVisual(enemy);
      enemy.body.setVisible(enemy.inPlay);
      if (!enemy.inPlay && !storedEnemies.has(enemy)) enemy.body.destroy();
    }
    for (const enemy of state.enemies) syncPassengerVisuals(enemy);
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
  } finally {
    random.state = randomState;
    setBattlePlayback(scene, playback);
  }
}
