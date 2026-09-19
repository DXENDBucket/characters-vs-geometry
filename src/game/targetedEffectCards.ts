import type Phaser from "phaser";
import type { ScheduleBattleAction } from "./battleActions";
import { palette } from "../config";
import type { CardDefinition, CardId, CardState, Tower } from "../types";
import type { TowerExtractionPool } from "./towerExtraction";
import {
  applyTowerTrueDamage,
  applyTowerUpgradeStats,
  createTower,
  effectiveTowerLevel,
  setTowerFacing,
  syncTowerLevelText,
  toggleTowerFacing,
  towerFacingDirection,
  upgradeTowerLevel
} from "./towers";

export type TargetedEffectCardResult = "handled" | "cooldown" | "empty" | "noChars";

export interface TargetedEffectCardRuntime {
  scheduleBattleAction?: ScheduleBattleAction;
  scene: Phaser.Scene;
  towers: Tower[];
  cardStates: CardState[];
  battleTime: number;
  getDefinition: (id: CardId) => CardDefinition;
  cardTimeFor: (id: CardId) => number;
  getChars: () => number;
  spendChars: (amount: number) => void;
  nextTowerOrder: () => number;
  removeTower: (tower: Tower) => void;
  runMirrorGroupEvent?: (tower: Tower, action: (tower: Tower) => void) => void;
  runWhenBattleActive: (action: () => void) => void;
  updateLevelAuras: () => void;
  updateCards: () => void;
  extraction: TowerExtractionPool;
}

interface TargetedEffectDefinition {
  apply: (runtime: TargetedEffectCardRuntime, target: Tower, level: number) => void;
  refundCooldownByLevel?: boolean;
}

const targetedEffectDefinitions: Partial<Record<CardId, TargetedEffectDefinition>> = {
  b: {
    refundCooldownByLevel: true,
    apply: (runtime, target) => {
      toggleTowerFacing(target);
      makeTurnCardPulse(runtime.scene, target);
    }
  },
  t: {
    refundCooldownByLevel: true,
    apply: (runtime, target, level) => {
      applyTowerTrueDamage(target, runtime.battleTime, level);
      makeTargetedEffectPulse(runtime.scene, target);
    }
  },
  y: {
    apply: (runtime, target, level) => {
      runtime.extraction.extract(target, runtime.getDefinition(target.type).cost, level);
      makeTargetedEffectPulse(runtime.scene, target);
      runtime.removeTower(target);
      runtime.updateCards();
    }
  }
};

export function isTargetedEffectCardId(id: CardId) {
  return Boolean(targetedEffectDefinitions[id]);
}

export class TargetedEffectCardController {
  constructor(private readonly runtime: () => TargetedEffectCardRuntime) {}

  canHandle(id: CardId) {
    return Boolean(targetedEffectDefinitions[id]);
  }

  use(definition: CardDefinition, lane: number, column: number, target?: Tower): TargetedEffectCardResult {
    const runtime = this.runtime();
    const cardState = runtime.cardStates.find((card) => card.definition.id === definition.id);
    if (!cardState || runtime.cardTimeFor(definition.id) < cardState.readyAt) {
      return "cooldown";
    }

    const batch = runtime.extraction.plan(definition);
    if (runtime.getChars() < batch.cost) {
      return "noChars";
    }

    if (!target?.inPlay) {
      return "empty";
    }

    const pendingEffectCard = this.findPendingEffectCard(runtime, definition.id, lane, column);
    if (pendingEffectCard) {
      this.upgradePendingEffectCard(pendingEffectCard, definition, batch.levels);
    } else {
      this.placePendingEffectCard(definition, lane, column, target, { level: batch.levels });
    }

    runtime.spendChars(batch.cost);
    runtime.extraction.consume(batch);
    cardState.readyAt = runtime.cardTimeFor(definition.id) + definition.cooldown;
    runtime.updateCards();
    return "handled";
  }

  createMirroredEffect(source: Tower, target: Tower) {
    const runtime = this.runtime();
    const definition = runtime.getDefinition(source.type);
    if (!this.canHandle(definition.id) || !source.inPlay || !target.inPlay) {
      return null;
    }

    const pendingEffectCard = this.findPendingEffectCard(runtime, definition.id, target.lane, target.column);
    if (pendingEffectCard) {
      this.raisePendingEffectCardLevel(pendingEffectCard, definition, source.level);
      return pendingEffectCard;
    }

    return this.placePendingEffectCard(definition, target.lane, target.column, target, {
      level: source.level,
      facingDirection: towerFacingDirection(source),
      mirroredEffect: true
    });
  }

  private placePendingEffectCard(
    definition: CardDefinition,
    lane: number,
    column: number,
    target: Tower,
    options: { level?: number; facingDirection?: -1 | 1; mirroredEffect?: boolean } = {}
  ) {
    const runtime = this.runtime();
    const effectCard = createTower(
      runtime.scene,
      definition,
      lane,
      column,
      runtime.battleTime,
      runtime.nextTowerOrder(),
      { transient: true, turnTargetId: target.id }
    );

    effectCard.level = Math.max(1, Math.floor(options.level ?? effectCard.level));
    effectCard.mirroredEffect = Boolean(options.mirroredEffect);
    setTowerFacing(effectCard, options.facingDirection ?? towerFacingDirection(target));
    syncTowerLevelText(effectCard);
    effectCard.body.setDepth(45 + lane);
    runtime.towers.push(effectCard);
    runtime.updateLevelAuras();
    if (runtime.scheduleBattleAction) {
      runtime.scheduleBattleAction(0, { type: "targetedEffect", tower: effectCard });
    } else runtime.scene.time.delayedCall(0, () => {
      runtime.runWhenBattleActive(() => this.resolvePendingEffectCard(effectCard));
    });
    return effectCard;
  }

  private upgradePendingEffectCard(tower: Tower, definition: CardDefinition, levels = 1) {
    const runtime = this.runtime();
    const gainedEffectiveUpgrades = upgradeTowerLevel(tower, levels);
    applyTowerUpgradeStats(tower, definition, gainedEffectiveUpgrades, runtime.battleTime);
    runtime.updateLevelAuras();
    runtime.scene.tweens.add({
      targets: tower.body,
      scale: 1.08,
      yoyo: true,
      duration: 90,
      ease: "Quad.easeOut"
    });
  }

  private raisePendingEffectCardLevel(tower: Tower, definition: CardDefinition, level: number) {
    while (tower.level < level) {
      this.upgradePendingEffectCard(tower, definition);
    }
  }

  resolvePendingEffectCard(effectCard: Tower) {
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

  private resolveSinglePendingEffectCard(effectCard: Tower) {
    const runtime = this.runtime();
    if (!effectCard.inPlay) {
      return;
    }

    const definition = runtime.getDefinition(effectCard.type);
    const level = effectiveTowerLevel(effectCard);
    const target = runtime.towers.find((tower) => tower.id === effectCard.turnTargetId);
    if (target?.inPlay) {
      targetedEffectDefinitions[effectCard.type]?.apply(runtime, target, level);
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
      runtime.updateCards();
    }
  }

  private findPendingEffectCard(runtime: TargetedEffectCardRuntime, type: CardId, lane: number, column: number) {
    return runtime.towers.find((tower) => {
      return tower.transient && tower.type === type && tower.lane === lane && tower.column === column;
    });
  }
}

function makeTurnCardPulse(scene: Phaser.Scene, tower: Tower) {
  const ring = scene.add.circle(tower.x, tower.y, 24, palette.black, 0).setStrokeStyle(2, palette.gold, 0.95);
  ring.setDepth(108);
  const marker = scene.add
    .text(tower.x - 36, tower.y - 4, tower.facingDirection === -1 ? "<" : ">", {
      color: "#ffd75a",
      fontFamily: "monospace",
      fontSize: "24px",
      fontStyle: "700"
    })
    .setOrigin(0.5)
    .setDepth(109);

  scene.tweens.add({
    targets: ring,
    scale: 1.75,
    alpha: 0,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
  });
  scene.tweens.add({
    targets: marker,
    alpha: 0,
    y: marker.y - 12,
    duration: 300,
    ease: "Quad.easeOut",
    onComplete: () => marker.destroy()
  });
}

function makeTargetedEffectPulse(scene: Phaser.Scene, tower: Tower) {
  const ring = scene.add.circle(tower.x, tower.y, 36, palette.black, 0).setStrokeStyle(2, palette.gold, 0.95);
  ring.setDepth(108);
  scene.tweens.add({
    targets: ring,
    scale: 1.35,
    alpha: 0,
    duration: 320,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
  });
}
