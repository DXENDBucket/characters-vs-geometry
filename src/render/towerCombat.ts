import type Phaser from "phaser";
import type { CubeBoss, Enemy, Tower } from "../types";
import type { CardBehaviorRuntime, CombatRuntime } from "../game/combatRuntime";
import type { TowerCombatRuntime, TowerAttackRuntime } from "../game/towerCombatRuntime";
import type { TowerCombatPresentation } from "../game/towerCombatPresentation";
import type { TowerActionEvent, TowerActionDataEvent } from "../game/towerActions";
import type { TowerState } from "../game/towerState";
import { createTowerProjectile, createHomingTowerProjectile, createMortarProjectile } from "../game/projectiles";
import { syncHealthBar } from "./towerHealth";
import { syncEnemyPositionVisual } from "./enemyStatus";
import { makeArcWaveEffect, makeHealParticles, makeHitShards, makeShiftEffect, makeSlashEffect,
  makeSunderEffect, makeTowerLaserEffect } from "./combatEffects";

const presentations = new WeakMap<Phaser.Scene, TowerCombatPresentation>();
export function towerCombatPresentation(scene: Phaser.Scene) {
  let presentation = presentations.get(scene);
  if (!presentation) {
    presentation = {
      health: tower => syncHealthBar(tower as Tower),
      heal: (x, y) => makeHealParticles(scene, x, y),
      hit: (x, y, type) => makeHitShards(scene, x, y, type),
      laser: (x, y, endX) => makeTowerLaserEffect(scene, x, y, endX),
      sunder: (x, y) => makeSunderEffect(scene, x, y),
      slash: (x, y, type) => makeSlashEffect(scene, x, y, type),
      arc: (x, y, type, direction) => makeArcWaveEffect(scene, x, y, type, direction),
      shift: (x, y, toX, toY) => makeShiftEffect(scene, x, y, toX, toY),
      enemyPosition: enemy => syncEnemyPositionVisual(enemy as Enemy),
      enemyDepth: (enemy, depth) => { (enemy as Enemy).body.setDepth(depth); }
    };
    presentations.set(scene, presentation);
  }
  return presentation;
}

const runtimes = new WeakMap<CardBehaviorRuntime, TowerCombatRuntime>();
export function towerCombatRuntime(live: CardBehaviorRuntime): TowerCombatRuntime {
  let runtime = runtimes.get(live);
  if (!runtime) {
    runtime = {
      get towers() { return live.towers; }, get enemies() { return live.enemies; },
      get boss() { return live.boss; }, get occupied() { return live.occupied; },
      get battleTime() { return live.battleTime; },
      get projectiles() { return live.projectiles; }, get mortarProjectiles() { return live.mortarProjectiles; },
      get isCellDeployable() { return live.isCellDeployable; },
      presentation: towerCombatPresentation(live.scene),
      createProjectile: spec => createTowerProjectile(live.scene, spec),
      createHomingProjectile: spec => createHomingTowerProjectile(live.scene, spec),
      createMortar: spec => createMortarProjectile(live.scene, spec),
      damageTower: (tower, amount, type) => live.damageTower(tower as Tower, amount, type),
      damageEnemy: (enemy, amount, type, source) => live.damageEnemy(enemy as Enemy, amount, type, source as Tower | undefined),
      damageBoss: (amount, type, part) => live.damageBoss(amount, type, part as CubeBoss | undefined),
      storeBlockedEnemies: (tower, definition) => live.storeBlockedEnemies(tower as Tower, definition),
      gainChars: (amount, x, y) => live.gainChars(amount, x, y),
      spawnTower: (id, lane, column, level, direction) => live.spawnTower(id, lane, column, level, direction)
    };
    runtimes.set(live, runtime);
  }
  return runtime;
}

const attacks = new WeakMap<CombatRuntime, TowerAttackRuntime>();
export function towerAttackRuntime(live: CombatRuntime): TowerAttackRuntime {
  let runtime = attacks.get(live);
  if (!runtime) {
    runtime = Object.assign(towerCombatRuntime(live), {
      getDefinition: (id: Parameters<CombatRuntime["getDefinition"]>[0]) => live.getDefinition(id),
      scheduleBattleAction: (delay: number, action: Parameters<TowerAttackRuntime["scheduleBattleAction"]>[1]) =>
        live.scheduleBattleAction(delay, action),
      onTowerAction: (tower: TowerState, event: TowerActionDataEvent) => live.onTowerAction?.(tower as Tower, event as TowerActionEvent)
    });
    attacks.set(live, runtime);
  }
  return runtime;
}
