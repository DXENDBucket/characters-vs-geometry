import type Phaser from "phaser";
import { CELL_WIDTH, palette } from "../config";
import { towerBehaviorType } from "./towerIdentity";
import type { TowerActionEvent, TowerActionListener } from "./towerActions";
import type { ScheduleBattleAction, TowerSpellMortarAction } from "./battleActions";
import type { BattlePoint } from "./battleOperations";
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, Tower } from "../types";
import { TOWER_SKILLS } from "../data/towerAbilities";
import type { TowerSkillActivation } from "./towerSkillRegistry";
import { TowerSkillSimulation, type TowerSkillSimulationRuntime, type SpellMortarFlight } from "./towerSkillSimulation";
import { createTowerSkillRuntime, createTowerSkillPresentation } from "../render/towerSkills";
export type { SpellMortarFlight } from "./towerSkillSimulation";

export interface TowerSkillRuntime {
  onTowerAction?: TowerActionListener;
  imitateTowerPush?: (tower: Tower, laneOffset: number, columnOffset: number) => void;
  scheduleBattleAction: ScheduleBattleAction;
  towers: Tower[];
  enemies: Enemy[];
  boss: CubeBoss | null;
  battleTime: number;
  gameOver: boolean;
  battlePaused: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType, sourceTower?: Tower) => void;
  damageBoss: (damage: number, damageType: DamageType, targetPart?: CubeBoss) => void;
  onTargetingChanged: () => void;
  prepareSkillTargeting: () => void;
  beginTowerPush: (tower: Tower) => void;
}


export class TowerSkillController {
  private spellMortarTargetingTowers: Tower[] = [];
  private spellMortarTargetingTowerSet = new Set<Tower>();
  private spellMortarReticle: Phaser.GameObjects.Container | null = null;
  readonly simulation: TowerSkillSimulation;
  readonly simulationRuntime: TowerSkillSimulationRuntime;
  constructor(private readonly scene: Phaser.Scene, private readonly runtime: () => TowerSkillRuntime) {
    this.simulationRuntime = createTowerSkillRuntime(runtime, createTowerSkillPresentation(scene, {
      beforeTowerUpdates: () => this.syncSpellMortarTargetingTowers(),
      isMortarSelected: tower => this.spellMortarTargetingTowerSet.has(tower as Tower),
      resetMortar: state => {
        const tower = state as Tower;
        if (!this.spellMortarTargetingTowerSet.delete(tower)) return;
        const index = this.spellMortarTargetingTowers.indexOf(tower);
        if (index >= 0) this.spellMortarTargetingTowers.splice(index, 1);
        if (this.spellMortarTargetingTowers.length === 0) this.destroySpellMortarReticle();
      }
    }));
    this.simulation = new TowerSkillSimulation(() => this.simulationRuntime);
  }

  update(seconds: number, time: number) { return this.simulation.update(seconds, time); }
  imitateSkill(tower: Tower, event: Extract<TowerActionEvent, { kind: "skill" }>) { return this.simulation.imitateSkill(tower, event); }
  cardCooldownMultiplier() { return this.simulation.cardCooldownMultiplier(); }
  isClockTowerReady(tower: Tower) { return this.simulation.isClockTowerReady(tower); }
  requiresManualSkillTarget(tower: Tower) { return this.simulation.requiresManualSkillTarget(tower); }
  activateManualSkills(towers: Tower[], skill: CardId, point: BattlePoint | null) { return this.simulation.activateManualSkills(towers, skill, point); }
  activateClockTower(tower: Tower) { return this.simulation.activateClockTower(tower); }
  isAirPatrolReady(tower: Tower) { return this.simulation.isAirPatrolReady(tower); }
  isOrientationReady(tower: Tower) { return this.simulation.isOrientationReady(tower); }
  isGatheringReady(tower: Tower) { return this.simulation.isGatheringReady(tower); }
  activateGatheringTower(tower: Tower) { return this.simulation.activateGatheringTower(tower); }
  activateOrientationTower(tower: Tower) { return this.simulation.activateOrientationTower(tower); }
  activateAirPatrolTower(tower: Tower) { return this.simulation.activateAirPatrolTower(tower); }
  isSpellMortarReady(tower: Tower) { return this.simulation.isSpellMortarReady(tower); }
  resetTowerSkill(tower: Tower) { return this.simulation.resetTowerSkill(tower); }
  launchSpellMortar(action: TowerSpellMortarAction) { return this.simulation.launchSpellMortar(action); }
  snapshotFlights() { return this.simulation.snapshotFlights(); }
  restoreSpellMortarFlight(flight: SpellMortarFlight) { return this.simulation.restoreSpellMortarFlight(flight); }

  manualSkillTargets(tower: Tower, allReady = false): Tower[] {
    return this.simulation.manualSkillTargets(tower, allReady) as Tower[];
  }

  beginManualSkillTargeting(towers: Tower[], input: TowerSkillActivation) {
    if (!towers.length) return false;
    const type = towerBehaviorType(towers[0]);
    if (type !== "S" && type !== "#") return false;
    const data = TOWER_SKILLS[type];
    if (!data.requiresTarget || (towers.length > 1 && type !== "S") ||
        towers.some(tower => towerBehaviorType(tower) !== type || !this.manualSkillTargets(tower).length)) return false;
    this.runtime().prepareSkillTargeting();
    if (type === "S") this.activateSpellMortarTargeting(towers, input.x, input.y);
    else this.runtime().beginTowerPush(towers[0]);
    return true;
  }

  private readySpellMortarTowers(towers: Tower[]) {
    return towers.filter(tower => towerBehaviorType(tower) === "S" && this.manualSkillTargets(tower).length > 0);
  }

  hasSpellMortarTargeting() {
    return this.spellMortarTargetingTowers.length > 0;
  }

  tryActivateManualSkill(tower: Tower, input: TowerSkillActivation) {
    const targets = this.manualSkillTargets(tower, input.allReady);
    if (!targets.length) return false;
    return this.requiresManualSkillTarget(tower) ? this.beginManualSkillTargeting(targets, input) :
      this.activateManualSkills(targets, towerBehaviorType(tower), null) === "handled";
  }

  activateSpellMortarTargeting(towers: Tower[], x: number, y: number) {
    const readyTowers = this.readySpellMortarTowers(towers);
    if (readyTowers.length === 0) {
      return;
    }

    this.setSpellMortarTargetingTowers(readyTowers);
    this.ensureSpellMortarReticle();
    this.updateSpellMortarReticlePosition(x, y);
  }

  cancelSpellMortarTargeting() {
    if (this.spellMortarTargetingTowers.length === 0) {
      return;
    }

    this.setSpellMortarTargetingTowers([]);
    this.destroySpellMortarReticle();
    this.runtime().onTargetingChanged();
  }

  selectedSpellMortars() {
    return this.readySpellMortarTowers(this.spellMortarTargetingTowers);
  }

  updateSpellMortarReticlePosition(x: number, y: number) {
    if (!this.spellMortarReticle) {
      return;
    }

    this.spellMortarReticle.setPosition(Math.round(x), Math.round(y));
  }

  private syncSpellMortarTargetingTowers() {
    if (this.spellMortarTargetingTowers.length === 0) {
      return;
    }

    for (let index = this.spellMortarTargetingTowers.length - 1; index >= 0; index -= 1) {
      const tower = this.spellMortarTargetingTowers[index];
      if (!tower.inPlay) {
        this.spellMortarTargetingTowers.splice(index, 1);
        this.spellMortarTargetingTowerSet.delete(tower);
      }
    }

    if (this.spellMortarTargetingTowers.length === 0) {
      this.destroySpellMortarReticle();
    }
  }

  private ensureSpellMortarReticle() {
    if (this.spellMortarReticle) {
      return;
    }

    const size = CELL_WIDTH * 0.75;
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(2, palette.magic, 0.9);
    graphics.strokeRect(-size / 2, -size / 2, size, size);
    graphics.lineBetween(-size / 2, 0, -size / 5, 0);
    graphics.lineBetween(size / 5, 0, size / 2, 0);
    graphics.lineBetween(0, -size / 2, 0, -size / 5);
    graphics.lineBetween(0, size / 5, 0, size / 2);
    const label = this.scene.add
      .text(0, -1, "S", {
        color: "#9fdcff",
        fontFamily: "monospace",
        fontSize: "22px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    this.spellMortarReticle = this.scene.add.container(0, 0, [graphics, label]).setDepth(160);
  }

  private destroySpellMortarReticle() {
    this.spellMortarReticle?.destroy();
    this.spellMortarReticle = null;
  }

  private setSpellMortarTargetingTowers(towers: Tower[]) {
    this.spellMortarTargetingTowers = towers;
    this.spellMortarTargetingTowerSet.clear();
    for (const tower of towers) {
      this.spellMortarTargetingTowerSet.add(tower);
    }
  }

}
