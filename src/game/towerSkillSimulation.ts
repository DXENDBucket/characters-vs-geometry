import * as battleMath from "./battleMath";
import { inFriendlyRange } from "./towerTopology";
import { isNumberTower, numberTowerActionLevel, towerBehaviorType, withTowerActionContext } from "./towerIdentity";
import type { TowerActionDataEvent as TowerActionEvent, TowerActionDataListener } from "./towerActions";
import type { TowerSpellMortarAction } from "./battleActions";
import type { BattlePoint, BattleOperationResult } from "./battleOperations";
import type { TowerSkillPresentation } from "./towerSkillPresentation";
import { changeTowerHealth } from "./towerHealthRules";
import { activateOrientation, orientationIsReady } from "./orientationSkillRules";
import { activateGathering, gatheringIsReady } from "./gatheringSkillRules";
import {
  AIR_PATROL_SKILL_MAX, AIR_PATROL_SKILL_DURATION, CLOCK_TOWER_SKILL_DURATION, CLOCK_TOWER_SKILL_MAX,
  GUARDIAN_TOWER_HEAL_RATIO, GUARDIAN_TOWER_SKILL_MAX, SPELL_MORTAR_AOE_RANGE_X, SPELL_MORTAR_AOE_RANGE_Y,
  SPELL_MORTAR_SHOT_COUNT, SPELL_MORTAR_SHOT_INTERVAL, SPELL_MORTAR_SKILL_MAX
} from "../config";
import type { CardDefinition, CardId, DamageType, SkillState } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { EnemyState as Enemy } from "./enemyState";
import type { BossState as CubeBoss } from "./bossState";
import { enemyIsHighFlying } from "./enemyCombatRules";
import { forEachSnapshot } from "./iteration";
import { getTowerSkillState } from "./skillState";
import { TOWER_SKILLS } from "../data/towerAbilities";
import { chargeTowerSkill, resetTowerSkillCharge, spendTowerSkill, towerSkillIsReady } from "./towerSkillRules";
import { createTowerSkillRegistry, type TowerSkillDefinition } from "./towerSkillRegistry";
import { bossPartInRect } from "./unitGeometry";
import { effectiveTowerLevel, setTowerFlyingUntil, towerDamageType, settleTowerMoveVisual } from "./towerRules";
import { towerAttackAmount, towerFinalStats, withTowerBehavior } from "./unitStatRules";

export interface TowerSkillSimulationRuntime {
  presentation: TowerSkillPresentation;
  onTowerAction?: TowerActionDataListener;
  imitateTowerPush?: (tower: Tower, laneOffset: number, columnOffset: number) => void;
  scheduleBattleAction(delay: number, action: TowerSpellMortarAction): void;
  towers: Tower[];
  enemies: Enemy[];
  boss: CubeBoss | null;
  battleTime: number;
  gameOver: boolean;
  battlePaused: boolean;
  getDefinition(id: CardId): CardDefinition;
  damageEnemy(enemy: Enemy, damage: number, type: DamageType, source?: Tower): void;
  damageBoss(damage: number, type: DamageType, part?: CubeBoss): void;
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
export class TowerSkillSimulation {
  private readonly spellMortarFlights = new Set<SpellMortarFlight>();
  private readonly guardianHealTargetsBuffer: Tower[] = [];
  private cachedCardCooldownMultiplier = 1;
  private readonly skillDefinitions: Partial<Record<CardId, TowerSkillDefinition>>;

  constructor(private readonly runtime: () => TowerSkillSimulationRuntime) {
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
      isAirPatrolReady: tower => this.isAirPatrolReady(tower),
      activateAirPatrolTower: tower => this.activateAirPatrolTower(tower)
    }, () => this.runtime().presentation);
  }

  update(seconds: number, time: number) {
    for (const flight of this.spellMortarFlights) {
      flight.progress = Math.min(1, flight.progress + seconds * 1000 / 3240);
      this.runtime().presentation.flightMoved(flight);
      if (flight.progress >= 1) {
        this.spellMortarFlights.delete(flight);
        this.runtime().presentation.flightRemoved(flight);
        this.detonateSpellMortar(flight.targetX, flight.targetY, flight.damage, flight.damageType, flight.source);
      }
    }
    this.runtime().presentation.beginTowerUpdates();
    let activeClockLevelSum = 0;
    for (const tower of this.runtime().towers) {
      for (const [type, until] of Object.entries(tower.routedSkills ?? {})) {
        if (time >= until!) delete tower.routedSkills![type as CardId];
      }
      if (tower.moveVisual) this.syncFlying(tower, time);
      // Finish active imitations even if a numeric operator loses its operands.
      if (isNumberTower(tower) || tower.imitatedSkills?.length) {
        this.runtime().presentation.numberRange(tower, time);
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
          if (state.activeUntil <= time) { state.activeUntil = 0; this.runtime().presentation.borderVisible(tower, true); this.runtime().presentation.borderAlpha(tower, 1); }
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
    definition.manual.activate?.([tower], { x: tower.x, y: tower.y, allReady: false }, this.runtime().battleTime);
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

  // Local pickers must not initialize or mutate authoritative skill state.
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

  activateManualSkills(towers: Tower[], skill: CardId, point: BattlePoint | null): BattleOperationResult {
    const definition = this.skillDefinitions[skill], manual = definition?.manual;
    if (!manual || !towers.length || new Set(towers).size !== towers.length ||
        (towers.length > 1 && !manual.supportsGroup) || skill === "#" ||
        (manual.requiresTarget ? skill !== "S" || !point : point !== null)) return "invalid";
    if (towers.some(tower => towerBehaviorType(tower) !== skill)) return "stale";
    if (towers.some(tower => !this.manualSkillReady(tower, definition))) return "cooldown";
    // Validate the entire group before spending any member's SP. No local selection is read or cleared.
    if (point) for (const tower of towers) this.fireSpellMortar(tower, point.x, point.y);
    else manual.activate?.(towers, { x: towers[0].x, y: towers[0].y, allReady: false }, this.runtime().battleTime);
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
    this.runtime().presentation.borderVisible(tower, true);
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
    if (activateGathering(tower, this.runtime().battleTime, this.runtime().presentation)) this.routeActiveSkill(tower);
  }

  activateOrientationTower(tower: Tower) {
    if (activateOrientation(tower, this.runtime().battleTime, this.runtime().presentation)) this.routeActiveSkill(tower);
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
    this.runtime().presentation.borderVisible(tower, true);
    this.runtime().presentation.borderAlpha(tower, 1);
    this.syncFlying(tower, runtime.battleTime);
  }

  isSpellMortarReady(tower: Tower) {
    const runtime = this.runtime();
    const state = getTowerSkillState(tower, "spellMortar");
    return towerBehaviorType(tower) === "S" && towerSkillIsReady("S", state, runtime.battleTime);
  }

  resetTowerSkill(tower: Tower) {
    if (tower.routedSkills) delete tower.routedSkills[towerBehaviorType(tower)];
    const definition = this.skillDefinitions[towerBehaviorType(tower)];
    if (!definition?.reset) {
      return;
    }
    definition.reset(tower, getTowerSkillState(tower, definition.stateKey), undefined);
  }

  private updateClockTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (time < state.activeUntil) {
      this.runtime().presentation.borderVisible(tower, true);
      this.runtime().presentation.borderAlpha(tower, 0.35 + battleMath.sin(time / 70) * 0.32 + 0.32);
      return;
    }

    this.runtime().presentation.borderAlpha(tower, 1);
    if (state.sp >= CLOCK_TOWER_SKILL_MAX) {
      this.runtime().presentation.borderVisible(tower, true);
      return;
    }

    this.runtime().presentation.borderVisible(tower, false);
    chargeTowerSkill("c", state, seconds, time);
    if (state.sp >= CLOCK_TOWER_SKILL_MAX) {
      this.runtime().presentation.borderVisible(tower, true);
    }
  }

  private updateGuardianTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (state.sp < GUARDIAN_TOWER_SKILL_MAX) {
      this.runtime().presentation.borderAlpha(tower, 1);
      chargeTowerSkill("h", state, seconds, time);
    }

    if (state.sp < GUARDIAN_TOWER_SKILL_MAX) {
      return;
    }

    const targets = this.guardianHealTargets(tower);
    if (targets.length === 0) {
      this.runtime().presentation.borderAlpha(tower, 0.62 + battleMath.sin(time / 90) * 0.28);
      return;
    }

    this.triggerGuardianSkill(tower, state, targets);
  }

  private updateAirPatrolTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (time < state.activeUntil) {
      if (tower.routedSkills?.w) return;
      setTowerFlyingUntil(tower, state.activeUntil);
      this.runtime().presentation.borderVisible(tower, true);
      this.runtime().presentation.borderAlpha(tower, 1);
      this.syncFlying(tower, time);
      return;
    }

    if (tower.flyingUntil > 0) {
      setTowerFlyingUntil(tower, 0);
      this.syncFlying(tower, time);
    }

    if (state.sp < AIR_PATROL_SKILL_MAX) {
      this.runtime().presentation.borderAlpha(tower, 1);
      chargeTowerSkill("w", state, seconds, time);
    }

    if (state.sp >= AIR_PATROL_SKILL_MAX) {
      this.runtime().presentation.borderVisible(tower, true);
      this.runtime().presentation.borderAlpha(tower, 0.62 + battleMath.sin(time / 90) * 0.28);
      return;
    }

    this.runtime().presentation.borderVisible(tower, true);
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
    this.runtime().presentation.borderAlpha(tower, 1);
    if (this.runtime().onTowerAction?.(tower, { kind: "skill" })) { targets.length = 0; return; }

    const amount = Math.round(towerFinalStats(tower).maxHp * GUARDIAN_TOWER_HEAL_RATIO);
    try {
      for (const target of targets) {
        this.healTower(target, amount);
      }
    } finally {
      targets.length = 0;
    }
  }

  private updateSpellMortarTower(tower: Tower, state: SkillState, seconds: number, time: number) {
    if (time < state.activeUntil) {
      this.runtime().presentation.borderVisible(tower, true);
      this.runtime().presentation.borderAlpha(tower, 0.35 + battleMath.sin(time / 70) * 0.32 + 0.32);
      return;
    }

    this.runtime().presentation.borderAlpha(tower, 1);
    if (state.sp >= SPELL_MORTAR_SKILL_MAX) {
      this.runtime().presentation.borderVisible(tower, true);
      this.runtime().presentation.mortarReady(tower, time);
      return;
    }

    this.runtime().presentation.borderVisible(tower, false);
    chargeTowerSkill("S", state, seconds, time);
    if (state.sp >= SPELL_MORTAR_SKILL_MAX) {
      this.runtime().presentation.borderVisible(tower, true);
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
    this.runtime().presentation.borderVisible(tower, true);

    if (runtime.onTowerAction?.(tower, { kind: "skill", x: targetX, y: targetY })) return;

    for (let shotIndex = 0; shotIndex < SPELL_MORTAR_SHOT_COUNT; shotIndex += 1) {
      runtime.scheduleBattleAction(shotIndex * SPELL_MORTAR_SHOT_INTERVAL,
        { type: "spellMortar", tower, targetX, targetY, damage, damageType });
    }
  }

  launchSpellMortar(action: TowerSpellMortarAction) {
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

  restoreFlights(flights: readonly SpellMortarFlight[]) {
    for (const flight of this.spellMortarFlights) this.runtime().presentation.flightRemoved(flight);
    this.spellMortarFlights.clear();
    for (const flight of flights) this.restoreSpellMortarFlight(flight);
  }

  snapshotFlights(): SpellMortarFlight[] {
    return [...this.spellMortarFlights.keys()].map(flight => ({ ...flight }));
  }

  restoreSpellMortarFlight(flight: SpellMortarFlight) {
    this.spellMortarFlights.add(flight);
    this.runtime().presentation.flightCreated(flight);
  }

  private detonateSpellMortar(x: number, y: number, damage: number, damageType: DamageType, sourceTower: Tower) {
    const runtime = this.runtime();
    if (runtime.gameOver) {
      return;
    }

    this.runtime().presentation.mortarImpact(x, y, SPELL_MORTAR_AOE_RANGE_X, SPELL_MORTAR_AOE_RANGE_Y);
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

  private resetClockTower(tower: Tower, state: SkillState) {
    resetTowerSkillCharge("c", state);
    this.runtime().presentation.borderVisible(tower, false);
    this.runtime().presentation.borderAlpha(tower, 1);
  }

  private resetSpellMortarTower(tower: Tower, state: SkillState) {
    resetTowerSkillCharge("S", state);
    this.runtime().presentation.borderVisible(tower, false);
    this.runtime().presentation.borderAlpha(tower, 1);
    this.runtime().presentation.mortarReset(tower);
  }

  private resetAirPatrolTower(tower: Tower, state: SkillState) {
    resetTowerSkillCharge("w", state);
    setTowerFlyingUntil(tower, 0);
    this.syncFlying(tower, 0);
    this.runtime().presentation.borderVisible(tower, true);
    this.runtime().presentation.borderAlpha(tower, 1);
  }

  private syncFlying(tower: Tower, time: number) {
    settleTowerMoveVisual(tower, time);
    this.runtime().presentation.flying(tower, time);
  }

  private healTower(tower: Tower, amount: number) {
    const presentation = this.runtime().presentation;
    if (changeTowerHealth(tower, amount, presentation.health) > 0) presentation.heal(tower.x, tower.y);
  }
}
