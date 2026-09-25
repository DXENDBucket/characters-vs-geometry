import type Phaser from "phaser";
import type { Tower, Enemy, CubeBoss } from "../types";
import type { TowerState } from "../game/towerState";
import type { TowerActionEvent } from "../game/towerActions";
import type { TowerSkillRuntime } from "../game/towerSkills";
import type { SpellMortarFlight, TowerSkillSimulationRuntime } from "../game/towerSkillSimulation";
import type { TowerSkillPresentation } from "../game/towerSkillPresentation";
import { syncTowerFlyingPositionVisual, syncNumberSkillRange } from "../game/towers";
import { syncHealthBar } from "./towerHealth";
import { TOWER_SKILL_INDICATORS } from "./towerSkillIndicators";
import { makeHealParticles, makeSpellMortarImpact, makeSpellMortarShot } from "./combatEffects";

export interface TowerSkillViewHooks {
  beforeTowerUpdates(): void;
  isMortarSelected(tower: TowerState): boolean;
  resetMortar(tower: TowerState): void;
}
export function createTowerSkillPresentation(scene: Phaser.Scene, hooks?: TowerSkillViewHooks): TowerSkillPresentation {
  const flights = new WeakMap<SpellMortarFlight, ReturnType<typeof makeSpellMortarShot>>();
  return {
    ...TOWER_SKILL_INDICATORS,
    health: tower => syncHealthBar(tower as Tower),
    heal: (x, y) => makeHealParticles(scene, x, y),
    borderVisible: (state, visible) => {
      const tower = state as Tower;
      if (tower.border.visible !== visible) tower.border.setVisible(visible);
    },
    flying: (tower, time) => syncTowerFlyingPositionVisual(tower as Tower, time),
    numberRange: (tower, time) => syncNumberSkillRange(scene, tower as Tower, time),
    beginTowerUpdates: () => hooks?.beforeTowerUpdates(),
    mortarReady: (tower, time) => {
      if (hooks?.isMortarSelected(tower)) (tower as Tower).border.setAlpha(0.35 + Math.sin(time / 70) * 0.32 + 0.32);
    },
    mortarReset: tower => hooks?.resetMortar(tower),
    flightCreated: flight => { flights.set(flight, makeSpellMortarShot(scene,
      flight.fromX, flight.fromY, flight.targetX, flight.targetY, flight.progress)); },
    flightMoved: flight => flights.get(flight)?.position(flight.progress),
    flightRemoved: flight => { flights.get(flight)?.destroy(); flights.delete(flight); },
    mortarImpact: (x, y, rx, ry) => makeSpellMortarImpact(scene, x, y, rx, ry)
  };
}

export function createTowerSkillRuntime(live: () => TowerSkillRuntime, presentation: TowerSkillPresentation): TowerSkillSimulationRuntime {
  return {
    presentation,
    get towers() { return live().towers; }, get enemies() { return live().enemies; }, get boss() { return live().boss; },
    get battleTime() { return live().battleTime; }, get gameOver() { return live().gameOver; }, get battlePaused() { return live().battlePaused; },
    onTowerAction: (tower, event) => live().onTowerAction?.(tower as Tower, event as TowerActionEvent),
    imitateTowerPush: (tower, lane, column) => live().imitateTowerPush?.(tower as Tower, lane, column),
    scheduleBattleAction: (delay, action) => live().scheduleBattleAction(delay, action),
    getDefinition: id => live().getDefinition(id),
    damageEnemy: (enemy, damage, type, source) => live().damageEnemy(enemy as Enemy, damage, type, source as Tower | undefined),
    damageBoss: (damage, type, part) => live().damageBoss(damage, type, part as CubeBoss | undefined)
  };
}
