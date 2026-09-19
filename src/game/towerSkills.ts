import Phaser from "phaser";
import type { BattleAction, ScheduleBattleAction } from "./battleActions";
import { changeTowerHealth } from "./towerHealth";
import { activateOrientation, orientationIsReady } from "./orientation";
import { activateGathering, gatheringIsReady } from "./gathering";
import {
  CELL_WIDTH,
  CLOCK_TOWER_SKILL_DURATION,
  CLOCK_TOWER_SKILL_MAX,
  GUARDIAN_TOWER_HEAL_RATIO,
  GUARDIAN_TOWER_SKILL_COST,
  GUARDIAN_TOWER_SKILL_MAX,
  SPELL_MORTAR_AOE_RANGE_X,
  SPELL_MORTAR_AOE_RANGE_Y,
  SPELL_MORTAR_SHOT_COUNT,
  SPELL_MORTAR_SHOT_INTERVAL,
  SPELL_MORTAR_SKILL_COST,
  SPELL_MORTAR_SKILL_MAX,
  palette
} from "../config";
import { makeHealParticles, makeSpellMortarImpact, makeSpellMortarShot } from "../render/combatEffects";
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, SkillState, Tower } from "../types";
import { enemyIsHighFlying } from "./enemyBehaviors";
import { forEachSnapshot } from "./iteration";
import { gainSkillSp, getTowerSkillState, resetSkillCharge, spendSkillSp } from "./skillState";
import { createTowerSkillRegistry, type TowerSkillDefinition } from "./towerSkillRegistry";
import { bossPartInRect } from "./targeting";
import {
  effectiveTowerLevel,
  setTowerFlyingUntil,
  syncTowerFlyingVisual,
  towerDamageType
} from "./towers";
import { towerAttackAmount, towerFinalStats } from "./unitStats";

const AIR_PATROL_SKILL_MAX = 10;
const AIR_PATROL_SKILL_COST = 10;
const AIR_PATROL_SKILL_DURATION = 6_000;

export interface TowerSkillRuntime {
  scheduleBattleAction?: ScheduleBattleAction;
  towers: Tower[];
  enemies: Enemy[];
  boss: CubeBoss | null;
  battleTime: number;
  gameOver: boolean;
  battlePaused: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType, sourceTower?: Tower) => void;
  damageBoss: (damage: number, damageType: DamageType, targetPart?: CubeBoss) => void;
  runWhenBattleActive: (action: () => void) => void;
  onTargetingChanged: () => void;
}

export interface SpellMortarFlight {
  source: Tower;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  damage: number;
  damageType: DamageType;
  progress: number;
}

export class TowerSkillController {
  private spellMortarTargetingTowers: Tower[] = [];
  private spellMortarTargetingTowerSet = new Set<Tower>();
  private spellMortarReticle: Phaser.GameObjects.Container | null = null;
  private readonly spellMortarFlights = new Map<SpellMortarFlight, ReturnType<typeof makeSpellMortarShot>>();
  private readonly guardianHealTargetsBuffer: Tower[] = [];
  private cachedCardCooldownMultiplier = 1;
  private readonly skillDefinitions: Partial<Record<CardId, TowerSkillDefinition>>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: () => TowerSkillRuntime
  ) {
    this.skillDefinitions = createTowerSkillRegistry({
      updateClockTower: (tower, state, seconds, time) => this.updateClockTower(tower, state, seconds, time),
      resetClockTower: (tower, state) => this.resetClockTower(tower, state),
      updateGuardianTower: (tower, state, seconds, time) => this.updateGuardianTower(tower, state, seconds, time),
      updateSpellMortarTower: (tower, state, seconds, time) => this.updateSpellMortarTower(tower, state, seconds, time),
      resetSpellMortarTower: (tower, state) => this.resetSpellMortarTower(tower, state),
      updateAirPatrolTower: (tower, state, seconds, time) => this.updateAirPatrolTower(tower, state, seconds, time),
      resetAirPatrolTower: (tower, state) => this.resetAirPatrolTower(tower, state)
    });
  }

  update(seconds: number, time: number) {
    for (const [flight, visual] of this.spellMortarFlights) {
      flight.progress = Math.min(1, flight.progress + seconds * 1000 / 3240);
      visual.position(flight.progress);
      if (flight.progress >= 1) {
        this.spellMortarFlights.delete(flight);
        visual.destroy();
        this.detonateSpellMortar(flight.targetX, flight.targetY, flight.damage, flight.damageType, flight.source);
      }
    }
    this.syncSpellMortarTargetingTowers();
    let activeClockLevelSum = 0;
    for (const tower of this.runtime().towers) {
      if (tower.moveVisual) syncTowerFlyingVisual(tower, time);
      const definition = this.skillDefinitions[tower.type];
      if (!definition) {
        continue;
      }

      const state = getTowerSkillState(tower, definition.stateKey);
      definition.update(tower, state, seconds, time, undefined);
      if (tower.type === "c" && time < state.activeUntil) {
        activeClockLevelSum += effectiveTowerLevel(tower);
      }
    }
    this.cachedCardCooldownMultiplier = activeClockLevelSum + 1;
  }

  hasSpellMortarTargeting() {
    return this.spellMortarTargetingTowers.length > 0;
  }

  cardCooldownMultiplier() {
    return this.cachedCardCooldownMultiplier;
  }

  isClockTowerReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "clock");
    return tower.type === "c" && runtime.battleTime >= state.activeUntil && state.sp >= CLOCK_TOWER_SKILL_MAX;
  }

  activateReadyClockTowers() {
    for (const tower of this.runtime().towers) {
      if (this.isClockTowerReady(tower)) {
        this.activateClockTower(tower);
      }
    }
  }

  activateClockTower(tower: Tower) {
    const state = getTowerSkillState(tower, "clock");
    resetSkillCharge(state);
    state.activeUntil = this.runtime().battleTime + CLOCK_TOWER_SKILL_DURATION;
    setTowerBorderVisible(tower, true);
  }

  isAirPatrolReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "airPatrol");
    return tower.type === "w" && runtime.battleTime >= state.activeUntil && state.sp >= AIR_PATROL_SKILL_MAX;
  }

  isOrientationReady(tower: Tower) {
    return orientationIsReady(tower, this.runtime().battleTime);
  }

  isGatheringReady(tower: Tower) {
    return gatheringIsReady(tower, this.runtime().battleTime);
  }

  activateGatheringTower(tower: Tower) {
    activateGathering(tower, this.runtime().battleTime);
  }

  activateOrientationTower(tower: Tower) {
    activateOrientation(tower, this.runtime().battleTime);
  }

  activateAirPatrolTower(tower: Tower) {
    if (!this.isAirPatrolReady(tower)) {
      return;
    }

    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "airPatrol");
    spendSkillSp(state, AIR_PATROL_SKILL_COST);
    state.activeUntil = runtime.battleTime + AIR_PATROL_SKILL_DURATION;
    setTowerFlyingUntil(tower, state.activeUntil);
    setTowerBorderVisible(tower, true);
    setTowerBorderAlpha(tower, 1);
    syncTowerFlyingVisual(tower, runtime.battleTime);
  }

  isSpellMortarReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "spellMortar");
    return tower.type === "S" && runtime.battleTime >= state.activeUntil && state.sp >= SPELL_MORTAR_SKILL_MAX;
  }

  activateReadySpellMortars(x: number, y: number) {
    this.activateSpellMortarTargeting(this.runtime().towers, x, y);
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

  fireSelectedSpellMortars(targetX: number, targetY: number) {
    const towers = this.readySpellMortarTowers(this.spellMortarTargetingTowers);
    if (towers.length === 0) {
      this.cancelSpellMortarTargeting();
      return;
    }

    this.setSpellMortarTargetingTowers([]);
    this.destroySpellMortarReticle();
    for (const tower of towers) {
      this.fireSpellMortar(tower, targetX, targetY);
    }
    this.runtime().onTargetingChanged();
  }

  updateSpellMortarReticlePosition(x: number, y: number) {
    if (!this.spellMortarReticle) {
      return;
    }

    this.spellMortarReticle.setPosition(Math.round(x), Math.round(y));
  }

  resetTowerSkill(tower: Tower) {
    const definition = this.skillDefinitions[tower.type];
    if (!definition?.reset) {
      return;
    }
    definition.reset(tower, getTowerSkillState(tower, definition.stateKey), undefined);
  }

  private readySpellMortarTowers(towers: Tower[]) {
    const readyTowers: Tower[] = [];
    for (const tower of towers) {
      if (this.isSpellMortarReady(tower)) {
        readyTowers.push(tower);
      }
    }
    return readyTowers;
  }

  private updateClockTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (time < state.activeUntil) {
      setTowerBorderVisible(tower, true);
      setTowerBorderAlpha(tower, 0.35 + Math.sin(time / 70) * 0.32 + 0.32);
      return;
    }

    setTowerBorderAlpha(tower, 1);
    if (state.sp >= CLOCK_TOWER_SKILL_MAX) {
      setTowerBorderVisible(tower, true);
      return;
    }

    setTowerBorderVisible(tower, false);
    gainSkillSp(state, seconds, CLOCK_TOWER_SKILL_MAX);
    if (state.sp >= CLOCK_TOWER_SKILL_MAX) {
      setTowerBorderVisible(tower, true);
    }
  }

  private updateGuardianTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (state.sp < GUARDIAN_TOWER_SKILL_MAX) {
      setTowerBorderAlpha(tower, 1);
      gainSkillSp(state, seconds, GUARDIAN_TOWER_SKILL_MAX);
    }

    if (state.sp < GUARDIAN_TOWER_SKILL_MAX) {
      return;
    }

    const targets = this.guardianHealTargets(tower);
    if (targets.length === 0) {
      setTowerBorderAlpha(tower, 0.62 + Math.sin(time / 90) * 0.28);
      return;
    }

    this.triggerGuardianSkill(tower, state, targets);
  }

  private updateAirPatrolTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (time < state.activeUntil) {
      setTowerFlyingUntil(tower, state.activeUntil);
      setTowerBorderVisible(tower, true);
      setTowerBorderAlpha(tower, 1);
      syncTowerFlyingVisual(tower, time);
      return;
    }

    if (tower.flyingUntil > 0) {
      setTowerFlyingUntil(tower, 0);
      syncTowerFlyingVisual(tower, time);
    }

    if (state.sp < AIR_PATROL_SKILL_MAX) {
      setTowerBorderAlpha(tower, 1);
      gainSkillSp(state, seconds, AIR_PATROL_SKILL_MAX);
    }

    if (state.sp >= AIR_PATROL_SKILL_MAX) {
      setTowerBorderVisible(tower, true);
      setTowerBorderAlpha(tower, 0.62 + Math.sin(time / 90) * 0.28);
      return;
    }

    setTowerBorderVisible(tower, true);
  }

  private guardianHealTargets(tower: Tower) {
    const targets = this.guardianHealTargetsBuffer;
    targets.length = 0;
    if (tower.hp < towerFinalStats(tower).maxHp) {
      targets.push(tower);
    }

    let ally: Tower | undefined;
    let allyHpRatio = Number.POSITIVE_INFINITY;
    for (const candidate of this.runtime().towers) {
      if (candidate === tower || Math.abs(candidate.lane - tower.lane) > 1 || Math.abs(candidate.column - tower.column) > 1) {
        continue;
      }

      const maxHp = towerFinalStats(candidate).maxHp;
      if (candidate.hp >= maxHp) {
        continue;
      }

      const hpRatio = candidate.hp / maxHp;
      if (!ally || hpRatio < allyHpRatio || (hpRatio === allyHpRatio && candidate.placedOrder < ally.placedOrder)) {
        ally = candidate;
        allyHpRatio = hpRatio;
      }
    }

    if (ally) {
      targets.push(ally);
    }
    return targets;
  }

  private triggerGuardianSkill(tower: Tower, state: SkillState, targets: Tower[]) {
    state.sp = Math.max(0, state.sp - GUARDIAN_TOWER_SKILL_COST);
    state.spBuffer = 0;
    setTowerBorderAlpha(tower, 1);

    const amount = Math.round(towerFinalStats(tower).maxHp * GUARDIAN_TOWER_HEAL_RATIO);
    try {
      for (const target of targets) {
        healTower(this.scene, target, amount);
      }
    } finally {
      targets.length = 0;
    }
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

  private updateSpellMortarTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (time < state.activeUntil || this.spellMortarTargetingTowerSet.has(tower)) {
      setTowerBorderVisible(tower, true);
      setTowerBorderAlpha(tower, 0.35 + Math.sin(time / 70) * 0.32 + 0.32);
      return;
    }

    setTowerBorderAlpha(tower, 1);
    if (state.sp >= SPELL_MORTAR_SKILL_MAX) {
      setTowerBorderVisible(tower, true);
      return;
    }

    setTowerBorderVisible(tower, false);
    gainSkillSp(state, seconds, SPELL_MORTAR_SKILL_MAX);
    if (state.sp >= SPELL_MORTAR_SKILL_MAX) {
      setTowerBorderVisible(tower, true);
    }
  }

  private fireSpellMortar(tower: Tower, targetX: number, targetY: number) {
    const runtime = this.runtime();
    const definition = runtime.getDefinition(tower.type);
    const damage = towerAttackAmount(tower, definition);
    const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);
    const state = getTowerSkillState(tower, "spellMortar");
    state.sp = Math.max(0, state.sp - SPELL_MORTAR_SKILL_COST);
    state.spBuffer = 0;
    state.activeUntil = runtime.battleTime + (SPELL_MORTAR_SHOT_COUNT - 1) * SPELL_MORTAR_SHOT_INTERVAL;
    setTowerBorderVisible(tower, true);

    for (let shotIndex = 0; shotIndex < SPELL_MORTAR_SHOT_COUNT; shotIndex += 1) {
      if (runtime.scheduleBattleAction) {
        runtime.scheduleBattleAction(shotIndex * SPELL_MORTAR_SHOT_INTERVAL,
          { type: "spellMortar", tower, targetX, targetY, damage, damageType });
        continue;
      }
      this.scene.time.delayedCall(shotIndex * SPELL_MORTAR_SHOT_INTERVAL, () => {
        this.runtime().runWhenBattleActive(() => {
          this.launchSpellMortar({ type: "spellMortar", tower, targetX, targetY, damage, damageType });
        });
      });
    }
  }

  launchSpellMortar(action: Extract<BattleAction, { type: "spellMortar" }>) {
    if (this.runtime().gameOver || !action.tower.inPlay) return;
    this.restoreSpellMortarFlight({ source: action.tower, fromX: action.tower.x, fromY: action.tower.y,
      targetX: action.targetX, targetY: action.targetY, damage: action.damage, damageType: action.damageType, progress: 0 });
  }

  snapshotFlights(): SpellMortarFlight[] {
    return [...this.spellMortarFlights.keys()].map(flight => ({ ...flight }));
  }

  restoreSpellMortarFlight(flight: SpellMortarFlight) {
    this.spellMortarFlights.set(flight, makeSpellMortarShot(this.scene,
      flight.fromX, flight.fromY, flight.targetX, flight.targetY, flight.progress));
  }

  private detonateSpellMortar(x: number, y: number, damage: number, damageType: DamageType, sourceTower: Tower) {
    const runtime = this.runtime();
    if (runtime.gameOver) {
      return;
    }

    makeSpellMortarImpact(this.scene, x, y, SPELL_MORTAR_AOE_RANGE_X, SPELL_MORTAR_AOE_RANGE_Y);
    forEachSnapshot(runtime.enemies, (enemy) => {
      if (
        !enemyIsHighFlying(enemy) &&
        Math.abs(enemy.x - x) <= SPELL_MORTAR_AOE_RANGE_X &&
        Math.abs(enemy.y - y) <= SPELL_MORTAR_AOE_RANGE_Y
      ) {
        runtime.damageEnemy(enemy, damage, damageType, sourceTower);
      }
    });
    const bossPart = bossPartInRect(
      runtime.boss,
      x - SPELL_MORTAR_AOE_RANGE_X,
      y - SPELL_MORTAR_AOE_RANGE_Y,
      SPELL_MORTAR_AOE_RANGE_X * 2,
      SPELL_MORTAR_AOE_RANGE_Y * 2
    );
    if (bossPart) {
      runtime.damageBoss(damage, damageType, bossPart);
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

  private resetClockTower(tower: Tower, state: SkillState) {
    resetSkillCharge(state);
    state.activeUntil = 0;
    setTowerBorderVisible(tower, false);
    setTowerBorderAlpha(tower, 1);
  }

  private resetSpellMortarTower(tower: Tower, state: SkillState) {
    resetSkillCharge(state);
    state.activeUntil = 0;
    setTowerBorderVisible(tower, false);
    setTowerBorderAlpha(tower, 1);
    if (this.spellMortarTargetingTowerSet.delete(tower)) {
      Phaser.Utils.Array.Remove(this.spellMortarTargetingTowers, tower);
      if (this.spellMortarTargetingTowers.length === 0) {
        this.destroySpellMortarReticle();
      }
    }
  }

  private resetAirPatrolTower(tower: Tower, state: SkillState) {
    resetSkillCharge(state);
    state.activeUntil = 0;
    setTowerFlyingUntil(tower, 0);
    syncTowerFlyingVisual(tower, 0);
    setTowerBorderVisible(tower, true);
    setTowerBorderAlpha(tower, 1);
  }

  private setSpellMortarTargetingTowers(towers: Tower[]) {
    this.spellMortarTargetingTowers = towers;
    this.spellMortarTargetingTowerSet.clear();
    for (const tower of towers) {
      this.spellMortarTargetingTowerSet.add(tower);
    }
  }
}

function setTowerBorderVisible(tower: Tower, visible: boolean) {
  if (tower.border.visible !== visible) {
    tower.border.setVisible(visible);
  }
}

function setTowerBorderAlpha(tower: Tower, alpha: number) {
  if (tower.border.alpha !== alpha) {
    tower.border.setAlpha(alpha);
  }
}

function healTower(scene: Phaser.Scene, tower: Tower, amount: number) {
  if (changeTowerHealth(tower, amount) <= 0) {
    return;
  }

  makeHealParticles(scene, tower.x, tower.y);
}
