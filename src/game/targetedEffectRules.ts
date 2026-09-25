import { deploymentCardId } from "./cardIdentity";
import { isParenthesisTower } from "./towerOccupancy";
import type { TowerActionDataListener } from "./towerActions";
import type { ScheduleBattleAction } from "./battleActions";
import { applyTowerTrueDamageState } from "./towerAttachmentRules";
import type { CardDefinition, CardId } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { BattleCardState } from "./battleLoadout";
import type { TowerExtractionPool } from "./towerExtraction";
import { upgradeTowerLevel, syncTowerDerivedStats } from "./towerUpgradeRules";
import { effectiveTowerLevel, towerFacingDirection } from "./towerRules";
import { inheritBattleOwner } from "./battleOwnership";

export type TargetedEffectCardResult = "handled" | "cooldown" | "empty" | "noChars";

export interface TargetedEffectRuntime<T extends Tower = Tower> {
  onTowerAction?: TowerActionDataListener;
  scheduleBattleAction: ScheduleBattleAction;
  towers: T[];
  cardStates: readonly BattleCardState[];
  battleTime: number;
  unlimitedFirepower?: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  cardTimeFor: (id: CardId) => number;
  getChars: () => number;
  spendChars: (amount: number) => void;
  nextTowerOrder: () => number;
  removeTower: (tower: T) => void;
  runMirrorGroupEvent?: (tower: T, action: (tower: T) => void) => void;
  canLink?: (first: T, second: T) => boolean;
  updateLevelAuras: () => void;
  createTower(definition: CardDefinition, lane: number, column: number, time: number, order: number,
    options: { transient: true; turnTargetId: string }): T;
  extraction: TowerExtractionPool;
}

export interface TargetedEffectPresentation {
  attachment(tower: Tower): void;
  turned(tower: Tower): void;
  trueDamage(tower: Tower, time: number): void;
  pulse(tower: Tower): void;
  placed(tower: Tower): void;
  level(tower: Tower): void;
  health(tower: Tower): void;
  upgraded(tower: Tower): void;
  cards(): void;
}
export const NO_TARGETED_EFFECT_PRESENTATION: TargetedEffectPresentation = Object.freeze({
  attachment() {}, turned() {}, trueDamage() {}, pulse() {}, placed() {},
  level() {}, health() {}, upgraded() {}, cards() {}
});

interface TargetedEffectDefinition {
  apply: <T extends Tower>(runtime: TargetedEffectRuntime<T>, target: T, level: number, presentation: TargetedEffectPresentation) => void;
  refundCooldownByLevel?: boolean;
}

const targetedEffectDefinitions: Partial<Record<CardId, TargetedEffectDefinition>> = {
  "!": {
    refundCooldownByLevel: true,
    apply: (_runtime, target, _level, presentation) => {
      target.continuousAttack = true;
      presentation.attachment(target);
      presentation.pulse(target);
    }
  },
  b: {
    refundCooldownByLevel: true,
    apply: (_runtime, target, _level, presentation) => {
      target.facingDirection = target.facingDirection === -1 ? 1 : -1;
      presentation.turned(target);
    }
  },
  t: {
    refundCooldownByLevel: true,
    apply: (runtime, target, level, presentation) => {
      applyTowerTrueDamageState(target, runtime.battleTime, level);
      presentation.trueDamage(target, runtime.battleTime);
      presentation.pulse(target);
    }
  },
  y: {
    apply: (runtime, target, level, presentation) => {
      runtime.extraction.extract(target, runtime.getDefinition(target.type).cost, level);
      presentation.pulse(target);
      runtime.removeTower(target);
      presentation.cards();
    }
  }
};

export function isTargetedEffectCardId(id: CardId) {
  return Boolean(targetedEffectDefinitions[deploymentCardId(id)]);
}

export class TargetedEffectSimulation<T extends Tower = Tower> {
  constructor(private readonly runtime: () => TargetedEffectRuntime<T>, public presentation: TargetedEffectPresentation = NO_TARGETED_EFFECT_PRESENTATION) {}

  canHandle(id: CardId) {
    return isTargetedEffectCardId(id);
  }

  imitate(id: CardId, target: T, level: number) {
    targetedEffectDefinitions[id]?.apply(this.runtime(), target, level, this.presentation);
  }

  deploymentTargets(lane: number, column: number, target?: T): T[] {
    const eligible = (tower: T) => tower.inPlay && !tower.transient && !tower.nullified;
    const runtime = this.runtime();
    if (!runtime.unlimitedFirepower) return target && eligible(target) ? [target] : [];
    const cells = new Map<number, T>();
    for (const tower of runtime.towers) {
      if (tower.column !== column || !eligible(tower)) continue;
      const current = cells.get(tower.lane);
      if (!current || isParenthesisTower(current)) cells.set(tower.lane, tower);
    }
    if (target && eligible(target) && target.column === column && target.lane === lane) cells.set(lane, target);
    return [...cells.values()].sort((a, b) => a.lane - b.lane);
  }

  use(definition: CardDefinition, lane: number, column: number, target?: T): TargetedEffectCardResult {
    const runtime = this.runtime();
    const cardState = runtime.cardStates.find((card) => card.definition.id === definition.id);
    if (!cardState || runtime.cardTimeFor(definition.id) < cardState.readyAt) {
      return "cooldown";
    }

    const batch = runtime.extraction.plan(definition);
    if (runtime.getChars() < batch.cost) {
      return "noChars";
    }

    const targets = this.deploymentTargets(lane, column, target);
    if (targets.length === 0) {
      return "empty";
    }

    for (const recipient of targets) {
      const pendingEffectCard = this.findPendingEffectCard(runtime, definition.id, recipient.lane, column);
      if (pendingEffectCard) {
        this.upgradePendingEffectCard(pendingEffectCard, batch.levels);
      } else {
        this.placePendingEffectCard(definition, recipient.lane, column, recipient, { level: batch.levels });
      }
    }

    runtime.spendChars(batch.cost);
    runtime.extraction.consume(batch);
    cardState.readyAt = runtime.cardTimeFor(definition.id) + definition.cooldown;
    this.presentation.cards();
    return "handled";
  }

  createMirroredEffect(source: T, target: T) {
    const runtime = this.runtime();
    const definition = runtime.getDefinition(source.type);
    if (!this.canHandle(definition.id) || !source.inPlay || !target.inPlay || runtime.canLink?.(source, target) === false) {
      return null;
    }

    const pendingEffectCard = this.findPendingEffectCard(runtime, definition.id, target.lane, target.column);
    if (pendingEffectCard) {
      if (runtime.canLink?.(source, pendingEffectCard) === false) return null;
      this.raisePendingEffectCardLevel(pendingEffectCard, source.level);
      return pendingEffectCard;
    }

    return this.placePendingEffectCard(definition, target.lane, target.column, target, {
      level: source.level,
      facingDirection: towerFacingDirection(source),
      mirroredEffect: true,
      owner: source
    });
  }

  private placePendingEffectCard(
    definition: CardDefinition,
    lane: number,
    column: number,
    target: T,
    options: { level?: number; facingDirection?: -1 | 1; mirroredEffect?: boolean; owner?: T } = {}
  ) {
    const runtime = this.runtime();
    const effectCard = runtime.createTower(
      definition,
      lane,
      column,
      runtime.battleTime,
      runtime.nextTowerOrder(),
      { transient: true, turnTargetId: target.id }
    );

    if (options.owner) inheritBattleOwner(effectCard, options.owner);
    effectCard.level = Math.max(1, Math.floor(options.level ?? effectCard.level));
    effectCard.mirroredEffect = Boolean(options.mirroredEffect);
    effectCard.facingDirection = options.facingDirection ?? towerFacingDirection(target);
    this.presentation.placed(effectCard);
    runtime.towers.push(effectCard);
    runtime.updateLevelAuras();
    runtime.scheduleBattleAction(0, { type: "targetedEffect", tower: effectCard });
    return effectCard;
  }

  private upgradePendingEffectCard(tower: T, levels = 1) {
    const runtime = this.runtime();
    const gained = upgradeTowerLevel(tower, levels, this.presentation);
    syncTowerDerivedStats(tower, gained > 0, undefined, undefined, this.presentation);
    runtime.updateLevelAuras();
    this.presentation.upgraded(tower);
  }

  private raisePendingEffectCardLevel(tower: T, level: number) {
    while (tower.level < level) {
      this.upgradePendingEffectCard(tower);
    }
  }

  resolvePendingEffectCard(effectCard: T) {
    const runtime = this.runtime();
    if (!effectCard.inPlay) {
      return;
    }

    if (runtime.runMirrorGroupEvent && effectCard.mirrorGroupId) {
      runtime.runMirrorGroupEvent(effectCard, (member) => this.resolveSinglePendingEffectCard(member));
      runtime.updateLevelAuras();
      return;
    }

    this.resolveSinglePendingEffectCard(effectCard);
    runtime.updateLevelAuras();
  }

  private resolveSinglePendingEffectCard(effectCard: T) {
    const runtime = this.runtime();
    if (!effectCard.inPlay) {
      return;
    }

    const definition = runtime.getDefinition(effectCard.sourceCardId ?? effectCard.type);
    const level = effectiveTowerLevel(effectCard);
    const target = runtime.towers.find((tower) => tower.id === effectCard.turnTargetId);
    if (target?.inPlay) {
      if (!runtime.onTowerAction?.(effectCard, { kind: "targeted" })) targetedEffectDefinitions[effectCard.type]?.apply(runtime, target, level, this.presentation);
    }

    runtime.removeTower(effectCard);

    const cardState = effectCard.mirroredEffect
      ? undefined
      : runtime.cardStates.find((card) => card.definition.id === definition.id);
    if (cardState && targetedEffectDefinitions[effectCard.type]?.refundCooldownByLevel) {
      cardState.readyAt = Math.min(
        cardState.readyAt,
        runtime.cardTimeFor(definition.id) + definition.cooldown / level
      );
      this.presentation.cards();
    }
  }

  private findPendingEffectCard(runtime: TargetedEffectRuntime<T>, type: CardId, lane: number, column: number) {
    return runtime.towers.find((tower) => {
      return tower.inPlay && tower.transient && (tower.sourceCardId ?? tower.type) === type && tower.lane === lane && tower.column === column;
    });
  }
}
