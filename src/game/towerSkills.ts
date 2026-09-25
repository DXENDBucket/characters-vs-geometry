import Phaser from "phaser";
import { inFriendlyRange } from "./towerTopology";
import { isNumberTower, numberTowerActionLevel, towerBehaviorType, withTowerActionContext } from "./towerIdentity";
import type { TowerActionEvent, TowerActionListener } from "./towerActions";
import type { BattleAction, ScheduleBattleAction } from "./battleActions";
import type { BattlePoint, BattleOperationResult } from "./battleOperations";
import { changeTowerHealth } from "./towerHealth";
import { activateOrientation, orientationIsReady } from "./orientation";
import { activateGathering, gatheringIsReady } from "./gathering";
import {
  CELL_WIDTH,
  AIR_PATROL_SKILL_MAX,
  AIR_PATROL_SKILL_DURATION,
  CLOCK_TOWER_SKILL_DURATION,
  CLOCK_TOWER_SKILL_MAX,
  GUARDIAN_TOWER_HEAL_RATIO,
  GUARDIAN_TOWER_SKILL_MAX,
  SPELL_MORTAR_AOE_RANGE_X,
  SPELL_MORTAR_AOE_RANGE_Y,
  SPELL_MORTAR_SHOT_COUNT,
  SPELL_MORTAR_SHOT_INTERVAL,
  SPELL_MORTAR_SKILL_MAX,
  palette
} from "../config";
import { makeHealParticles, makeSpellMortarImpact, makeSpellMortarShot } from "../render/combatEffects";
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, SkillState, Tower } from "../types";
import { enemyIsHighFlying } from "./enemyCombatRules";
import { forEachSnapshot } from "./iteration";
import { getTowerSkillState } from "./skillState";
import { TOWER_SKILLS } from "../data/towerAbilities";
import { chargeTowerSkill, resetTowerSkillCharge, spendTowerSkill, towerSkillIsReady } from "./towerSkillRules";
import { createTowerSkillRegistry, type TowerSkillActivation, type TowerSkillDefinition } from "./towerSkillRegistry";
import { bossPartInRect } from "./unitGeometry";
import { syncTowerFlyingVisual, syncNumberSkillRange } from "./towers";
import { effectiveTowerLevel, setTowerFlyingUntil, towerDamageType } from "./towerRules";
import { towerAttackAmount, towerFinalStats, withTowerBehavior } from "./unitStats";

export interface TowerSkillRuntime {
  onTowerAction?: TowerActionListener;
  imitateTowerPush?: (tower: Tower, laneOffset: number, columnOffset: number) => void;
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
  prepareSkillTargeting: () => void;
  beginTowerPush: (tower: Tower) => void;
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
      onAction: tower => this.routeActiveSkill(tower),
      imitatePush: (tower, event) => this.runtime().imitateTowerPush?.(tower, event.laneOffset ?? 0, event.columnOffset ?? 0),
      imitateSpellMortar: (tower, event) => { if (event.x !== undefined && event.y !== undefined) this.fireSpellMortar(tower, event.x, event.y); },
      imitateGuardian: tower => this.triggerGuardianSkill(tower, getTowerSkillState(tower, "guardian"), this.guardianHealTargets(tower)),
      updateClockTower: (tower, state, seconds, time) => this.updateClockTower(tower, state, seconds, time),
      resetClockTower: (tower, state) => this.resetClockTower(tower, state),
      updateGuardianTower: (tower, state, seconds, time) => this.updateGuardianTower(tower, state, seconds, time),
      updateSpellMortarTower: (tower, state, seconds, time) => this.updateSpellMortarTower(tower, state, seconds, time),
      resetSpellMortarTower: (tower, state) => this.resetSpellMortarTower(tower, state),
      updateAirPatrolTower: (tower, state, seconds, time) => this.updateAirPatrolTower(tower, state, seconds, time),
      resetAirPatrolTower: (tower, state) => this.resetAirPatrolTower(tower, state),
      isClockTowerReady: tower => this.isClockTowerReady(tower),
      activateClockTower: tower => this.activateClockTower(tower),
      isSpellMortarReady: tower => this.isSpellMortarReady(tower),
      activateSpellMortars: (towers, x, y) => this.activateSpellMortarTargeting(towers, x, y),
      isAirPatrolReady: tower => this.isAirPatrolReady(tower),
      activateAirPatrolTower: tower => this.activateAirPatrolTower(tower),
      beginPush: tower => this.runtime().beginTowerPush(tower)
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
      for (const [type, until] of Object.entries(tower.routedSkills ?? {})) {
        if (time >= until!) delete tower.routedSkills![type as CardId];
      }
      if (tower.moveVisual) syncTowerFlyingVisual(tower, time);
      // Finish active imitations even if a numeric operator loses its operands.
      if (isNumberTower(tower) || tower.imitatedSkills?.length) {
        syncNumberSkillRange(this.scene, tower, time);
        for (const type of tower.imitatedSkills ?? []) {
          const skill = this.skillDefinitions[type];
          if (!skill) continue;
          const state = getTowerSkillState(tower, skill.stateKey);
          if (state.activeUntil <= 0) continue;
          const context = tower.pipelineSkillContexts?.[type];
          if (context) withTowerActionContext(tower, { type, ...context }, () => skill.update(tower, state, 0, time, undefined));
          else withTowerBehavior(tower, this.runtime().getDefinition(type), tower.imitatedSkillLevels?.[type] ?? Math.max(1, numberTowerActionLevel(tower)),
            () => skill.update(tower, state, 0, time, undefined), this.runtime().towers);
          if (type === "c" && time < state.activeUntil) activeClockLevelSum += context?.level ?? tower.imitatedSkillLevels?.c ?? 1;
          if (state.activeUntil <= time) { state.activeUntil = 0; tower.border.setVisible(true).setAlpha(1); }
        }
        continue;
      }
      const definition = this.skillDefinitions[towerBehaviorType(tower)];
      if (!definition) {
        continue;
      }

      const state = getTowerSkillState(tower, definition.stateKey);
      definition.update(tower, state, seconds, time, undefined);
      if (tower.continuousAttack && definition.manual && !definition.manual.requiresTarget &&
          !this.runtime().battlePaused && !this.runtime().gameOver && this.manualSkillReady(tower, definition)) {
        this.activateManualSkills([tower], towerBehaviorType(tower), null);
      }
      if (towerBehaviorType(tower) === "c" && !tower.routedSkills?.c && time < state.activeUntil) {
        activeClockLevelSum += effectiveTowerLevel(tower);
      }
    }
    this.cachedCardCooldownMultiplier = activeClockLevelSum + 1;
  }

  hasSpellMortarTargeting() {
    return this.spellMortarTargetingTowers.length > 0;
  }

  imitateSkill(tower: Tower, event: Extract<TowerActionEvent, { kind: "skill" }>) {
    const type = towerBehaviorType(tower);
    const definition = this.skillDefinitions[type];
    if (!definition) return false;
    (tower.imitatedSkillLevels ??= {})[type] = effectiveTowerLevel(tower);
    tower.imitatedSkills ??= [];
    if (!tower.imitatedSkills.includes(type)) tower.imitatedSkills.push(type);
    if (definition.imitate) { definition.imitate(tower, event); return true; }
    if (!definition.manual || definition.maxSp === undefined) return false;
    const state = getTowerSkillState(tower, definition.stateKey);
    state.sp = definition.maxSp; state.spBuffer = 0; state.activeUntil = 0;
    definition.manual.activate([tower], { x: tower.x, y: tower.y, allReady: false }, this.runtime().battleTime);
    return true;
  }

  cardCooldownMultiplier() {
    return this.cachedCardCooldownMultiplier;
  }

  isClockTowerReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "clock");
    return towerBehaviorType(tower) === "c" && towerSkillIsReady("c", state, runtime.battleTime);
  }

  tryActivateManualSkill(tower: Tower, input: TowerSkillActivation) {
    const targets = this.manualSkillTargets(tower, input.allReady);
    if (!targets.length) return false;
    return this.requiresManualSkillTarget(tower) ? this.beginManualSkillTargeting(targets, input) :
      this.activateManualSkills(targets, towerBehaviorType(tower), null) === "handled";
  }

  // This query may be used by a local picker; it must not initialize battle state.
  manualSkillTargets(tower: Tower, allReady = false): Tower[] {
    const definition = this.skillDefinitions[towerBehaviorType(tower)];
    const manual = definition?.manual;
    if (!manual || !this.manualSkillReady(tower, definition)) return [];
    return allReady && manual.supportsGroup
      ? this.runtime().towers.filter(candidate => this.skillDefinitions[towerBehaviorType(candidate)] === definition &&
        this.manualSkillReady(candidate, definition)) : [tower];
  }

  requiresManualSkillTarget(tower: Tower) {
    return !!this.skillDefinitions[towerBehaviorType(tower)]?.manual?.requiresTarget;
  }

  beginManualSkillTargeting(towers: Tower[], input: TowerSkillActivation) {
    const definition = towers.length ? this.skillDefinitions[towerBehaviorType(towers[0])] : undefined;
    const manual = definition?.manual;
    if (!definition || !manual?.requiresTarget || (towers.length > 1 && !manual.supportsGroup) ||
        towers.some(tower => this.skillDefinitions[towerBehaviorType(tower)] !== definition || !this.manualSkillReady(tower, definition))) return false;
    this.runtime().prepareSkillTargeting();
    manual.activate(towers, input, this.runtime().battleTime);
    return true;
  }

  activateManualSkills(towers: Tower[], skill: CardId, point: BattlePoint | null): BattleOperationResult {
    const definition = this.skillDefinitions[skill], manual = definition?.manual;
    if (!manual || !towers.length || new Set(towers).size !== towers.length ||
        (towers.length > 1 && !manual.supportsGroup) || skill === "#" ||
        (manual.requiresTarget ? skill !== "S" || !point : point !== null)) return "invalid";
    if (towers.some(tower => towerBehaviorType(tower) !== skill)) return "stale";
    if (towers.some(tower => !this.manualSkillReady(tower, definition))) return "cooldown";
    // Validate the entire group before spending any member's SP. No local selection is read or cleared.
    if (point) for (const tower of towers) this.fireSpellMortar(tower, point.x, point.y);
    else manual.activate(towers, { x: towers[0].x, y: towers[0].y, allReady: false }, this.runtime().battleTime);
    return "handled";
  }

  private manualSkillReady(tower: Tower, definition: TowerSkillDefinition) {
    return tower.inPlay && !tower.transient && !tower.nullified && !!tower.skills[definition.stateKey] &&
      !!definition.manual?.isReady(tower, this.runtime().battleTime);
  }

  activateClockTower(tower: Tower) {
    const state = getTowerSkillState(tower, "clock");
    spendTowerSkill("c", state);
    state.activeUntil = this.runtime().battleTime + CLOCK_TOWER_SKILL_DURATION;
    this.routeActiveSkill(tower);
    setTowerBorderVisible(tower, true);
  }

  isAirPatrolReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "airPatrol");
    return towerBehaviorType(tower) === "w" && towerSkillIsReady("w", state, runtime.battleTime);
  }

  isOrientationReady(tower: Tower) {
    return orientationIsReady(tower, this.runtime().battleTime);
  }

  isGatheringReady(tower: Tower) {
    return gatheringIsReady(tower, this.runtime().battleTime);
  }

  activateGatheringTower(tower: Tower) {
    if (activateGathering(tower, this.runtime().battleTime)) this.routeActiveSkill(tower);
  }

  activateOrientationTower(tower: Tower) {
    if (activateOrientation(tower, this.runtime().battleTime)) this.routeActiveSkill(tower);
  }

  activateAirPatrolTower(tower: Tower) {
    if (!this.isAirPatrolReady(tower)) {
      return;
    }
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "airPatrol");
    spendTowerSkill("w", state);
    state.activeUntil = runtime.battleTime + AIR_PATROL_SKILL_DURATION;
    if (this.routeActiveSkill(tower)) return;
    setTowerFlyingUntil(tower, state.activeUntil);
    setTowerBorderVisible(tower, true);
    setTowerBorderAlpha(tower, 1);
    syncTowerFlyingVisual(tower, runtime.battleTime);
  }

  isSpellMortarReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "spellMortar");
    return towerBehaviorType(tower) === "S" && towerSkillIsReady("S", state, runtime.battleTime);
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

  resetTowerSkill(tower: Tower) {
    if (tower.routedSkills) delete tower.routedSkills[towerBehaviorType(tower)];
    const definition = this.skillDefinitions[towerBehaviorType(tower)];
    if (!definition?.reset) {
      return;
    }
    definition.reset(tower, getTowerSkillState(tower, definition.stateKey), undefined);
  }

  private readySpellMortarTowers(towers: Tower[]) {
    const readyTowers: Tower[] = [];
    for (const tower of towers) {
      if (towerBehaviorType(tower) === "S" && this.manualSkillReady(tower, this.skillDefinitions.S!)) {
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
    chargeTowerSkill("c", state, seconds, time);
    if (state.sp >= CLOCK_TOWER_SKILL_MAX) {
      setTowerBorderVisible(tower, true);
    }
  }

  private updateGuardianTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (state.sp < GUARDIAN_TOWER_SKILL_MAX) {
      setTowerBorderAlpha(tower, 1);
      chargeTowerSkill("h", state, seconds, time);
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
      if (tower.routedSkills?.w) return;
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
      chargeTowerSkill("w", state, seconds, time);
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
      if (candidate === tower || !inFriendlyRange(tower, candidate, TOWER_SKILLS.h.range.shape.right)) {
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
    spendTowerSkill("h", state);
    setTowerBorderAlpha(tower, 1);
    if (this.runtime().onTowerAction?.(tower, { kind: "skill" })) { targets.length = 0; return; }

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
    if (time < state.activeUntil) {
      setTowerBorderVisible(tower, true);
      setTowerBorderAlpha(tower, 0.35 + Math.sin(time / 70) * 0.32 + 0.32);
      return;
    }

    setTowerBorderAlpha(tower, 1);
    if (state.sp >= SPELL_MORTAR_SKILL_MAX) {
      setTowerBorderVisible(tower, true);
      if (this.spellMortarTargetingTowerSet.has(tower)) setTowerBorderAlpha(tower, 0.35 + Math.sin(time / 70) * 0.32 + 0.32);
      return;
    }

    setTowerBorderVisible(tower, false);
    chargeTowerSkill("S", state, seconds, time);
    if (state.sp >= SPELL_MORTAR_SKILL_MAX) {
      setTowerBorderVisible(tower, true);
    }
  }

  private fireSpellMortar(tower: Tower, targetX: number, targetY: number) {
    const runtime = this.runtime();
    const definition = runtime.getDefinition(towerBehaviorType(tower));
    const damage = towerAttackAmount(tower, definition);
    const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);
    const state = getTowerSkillState(tower, "spellMortar");
    spendTowerSkill("S", state);
    state.activeUntil = runtime.battleTime + TOWER_SKILLS.S.duration;
    setTowerBorderVisible(tower, true);

    if (runtime.onTowerAction?.(tower, { kind: "skill", x: targetX, y: targetY })) return;

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

  private routeActiveSkill(tower: Tower) {
    const type = towerBehaviorType(tower), definition = this.skillDefinitions[type];
    if (!definition || !this.runtime().onTowerAction?.(tower, { kind: "skill" })) return false;
    (tower.routedSkills ??= {})[type] = getTowerSkillState(tower, definition.stateKey).activeUntil;
    return true;
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
    resetTowerSkillCharge("c", state);
    setTowerBorderVisible(tower, false);
    setTowerBorderAlpha(tower, 1);
  }

  private resetSpellMortarTower(tower: Tower, state: SkillState) {
    resetTowerSkillCharge("S", state);
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
    resetTowerSkillCharge("w", state);
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
