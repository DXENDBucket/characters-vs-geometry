import type Phaser from "phaser";
import type { Tower, Enemy, CubeBoss, Projectile, EnemyProjectile, MortarProjectile } from "../types";
import { BattleRuntime, type BattleFactories, type BattleRuntimeObservers } from "../game/battleRuntime";
import type { BattleWorld } from "../game/battleWorld";
import type { BattleSession } from "../game/battleSession";
import type { TowerDeploymentSimulation } from "../game/towerDeploymentRules";
import type { TowerMirrorSimulation } from "../game/towerMirrorRules";
import type { TargetedEffectSimulation } from "../game/targetedEffectRules";
import type { TowerBoardSimulation } from "../game/towerBoard";
import type { TowerShifterSimulation } from "../game/towerShifterRules";
import type { TowerPushSimulation } from "../game/towerPushRules";
import type { TowerStorageSimulation } from "../game/towerStorageRules";
import type { TowerNullificationSimulation } from "../game/towerNullificationRules";
import type { BattleEncounter } from "../game/battleEncounter";
import type { BattlefieldCells } from "../game/battlefieldCells";
import { createTower, syncTowerLevelText, syncTowerAutoUpgradeVisual } from "../game/towers";
import { createEnemyVisual } from "../game/enemyFactory";
import { createEnemyState } from "../game/enemyState";
import { createCubeBoss } from "../bosses/cubeBoss";
import { createTowerProjectile, createHomingTowerProjectile, createMortarProjectile, restoreEnemyProjectile } from "../game/projectiles";
import { deploymentPresentation } from "./towerDeployment";
import { mirrorPresentation } from "./towerMirrors";
import { targetedEffectPresentation } from "./targetedEffects";
import { circuitPresentation } from "./projectileCircuit";
import { towerBoardPresentation } from "./towerBoard";
import { towerStoragePresentation } from "./towerStorage";
import { makeTowerPipelineShield } from "./combatEffects";
import type { CombatRuntime } from "../game/combatRuntime";
import type { BossRuntime } from "../game/bossRuntime";
import type { TriggerTowerRuntime } from "../game/triggerTowers";
import type { LiveUnitLifecycleRuntime } from "./unitLifecycle";
import type { LiveProjectileRuntime } from "./projectileRuntime";
import { bindTowerAttackRuntime } from "./towerCombat";
import { bindEnemySimulationRuntime } from "./enemySimulation";
import { bindBossSimulationRuntime } from "./bossSimulation";
import { bindTriggerTowerRuntime } from "./triggerTowers";
import { bindUnitLifecycleRuntime } from "./unitLifecycle";
import { bindProjectileRuntime } from "./projectileRuntime";
import { endlessEnemyHpMultiplier } from "../game/endlessEnvironment";

type LiveEntities = { tower: Tower; enemy: Enemy; boss: CubeBoss; projectile: Projectile;
  enemyProjectile: EnemyProjectile; mortar: MortarProjectile };
export type LiveBattleRuntime = BattleRuntime & {
  deployment: TowerDeploymentSimulation<Tower>; mirrors: TowerMirrorSimulation<Tower>;
  targetedEffects: TargetedEffectSimulation<Tower>; board: TowerBoardSimulation<Tower>;
  shifter: TowerShifterSimulation<Tower>; push: TowerPushSimulation<Tower>;
  storage: TowerStorageSimulation<Enemy, Tower>; nullification: TowerNullificationSimulation<Tower>;
  encounter: BattleEncounter<LiveEntities>; cells: BattlefieldCells<Tower>;
};

export function createLiveBattleRuntime(scene: Phaser.Scene, world: BattleWorld<LiveEntities>, session: BattleSession,
  observers: BattleRuntimeObservers): LiveBattleRuntime {
  // Every entity is created by the live factories below or restored by the live snapshot adapter.
  // The rule graph only sees its data fields; preserve display types at this single boundary.
  return new BattleRuntime(world, session, liveBattleFactories(scene, () => session.random.next()), observers) as unknown as LiveBattleRuntime;
}

export function liveBattleFactories(scene: Phaser.Scene, random: () => number): BattleFactories {
  return {
    tower: (...args) => createTower(scene, ...args),
    enemy: options => createEnemyVisual(scene, createEnemyState(options, random), options.time),
    boss: (...args) => createCubeBoss(scene, ...args),
    projectile: spec => createTowerProjectile(scene, spec),
    homingProjectile: spec => createHomingTowerProjectile(scene, spec),
    mortar: spec => createMortarProjectile(scene, spec),
    enemyProjectile: state => restoreEnemyProjectile(scene, state)
  };
}

export interface LiveBattlePorts { combat: CombatRuntime; boss: BossRuntime; trigger: TriggerTowerRuntime }

// Existing content/render adapters and diagnostics keep their live interface, but all
// callbacks and rule instances now belong to the shared runtime, never a second simulation.
export function attachCombatPresentation(scene: Phaser.Scene, runtime: BattleRuntime): LiveBattlePorts {
  const adapt = (source: object, extra: object) => Object.defineProperties({ scene, ...extra }, Object.getOwnPropertyDescriptors(source));
  const enemyHpMultiplier = () => endlessEnemyHpMultiplier(runtime.world.options.level, runtime.world.wave);
  const combat = adapt(runtime.combat, {
    enemyHpMultiplier, projectileMotion: runtime.projectileMotion,
    triggerTrapTower: (tower: Tower, target: Enemy | CubeBoss | "boss") => runtime.triggerTrapTower(tower, target),
    triggerShockTower: (tower: Tower) => runtime.triggerShockTower(tower),
    onEnemyReachedBase: (enemy: Enemy) => runtime.encounter.enemyReachedBase(enemy)
  }) as unknown as CombatRuntime;
  const boss = adapt(runtime.boss, { enemyHpMultiplier }) as unknown as BossRuntime;
  const trigger = adapt(runtime.triggers, {}) as unknown as TriggerTowerRuntime;
  const lifecycle = adapt(runtime.lifecycle, { enemyHpMultiplier, onTowerAction: runtime.routeTowerAction }) as unknown as LiveUnitLifecycleRuntime;
  const projectiles = adapt(runtime.projectiles, { onTowerAction: runtime.routeTowerAction }) as unknown as LiveProjectileRuntime;
  bindTowerAttackRuntime(combat, runtime.combat); bindEnemySimulationRuntime(combat, runtime.enemies);
  bindBossSimulationRuntime(boss, runtime.boss); bindTriggerTowerRuntime(trigger, runtime.triggers);
  bindUnitLifecycleRuntime(lifecycle, runtime.lifecycle); bindProjectileRuntime(projectiles, runtime.projectiles);
  return { combat, boss, trigger };
}

export function attachBoardPresentation(scene: Phaser.Scene, runtime: BattleRuntime, hooks: {
  updateCards(): void; onFeedback(kind: "deploy" | "upgrade"): void;
}) {
  const live = () => ({ scene, ...hooks });
  runtime.deployment.presentation = deploymentPresentation(live);
  runtime.mirrors.presentation = mirrorPresentation(live);
  runtime.targetedEffects.presentation = targetedEffectPresentation(live);
  runtime.board.presentation = towerBoardPresentation(scene);
  runtime.storage.presentation = towerStoragePresentation(() => scene);
  runtime.nullification.presentation = { visible: (tower, visible) => { (tower as Tower).body.setVisible(visible); } };
  runtime.circuit.presentation = circuitPresentation(() => ({
    shielded: (tower, type) => makeTowerPipelineShield(scene, tower, type),
    changed: tower => { syncTowerLevelText(tower); syncTowerAutoUpgradeVisual(tower, runtime.players.get(tower.ownerId).auto.autoUpgradeEnabled); },
    intercepted: (tower, target) => {
      const flash = scene.add.graphics().setDepth(121);
      flash.lineStyle(2, 0x8ce4ba, .85).lineBetween(tower.x, tower.y, target.x, target.y);
      flash.strokeCircle(target.x, target.y, 10);
      scene.tweens.add({ targets: flash, alpha: 0, duration: 160, onComplete: () => flash.destroy() });
    }
  }));
}
