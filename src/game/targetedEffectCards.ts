import type Phaser from "phaser";
import { palette } from "../config";
import type { CardDefinition, CardId, CardState, Tower } from "../types";
import {
  applyTowerTrueDamage,
  applyTowerUpgradeStats,
  createTower,
  effectiveTowerLevel,
  toggleTowerFacing,
  upgradeTowerLevel
} from "./towers";

export type TargetedEffectCardResult = "handled" | "cooldown" | "empty" | "noChars";

export interface TargetedEffectCardRuntime {
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
  runWhenBattleActive: (action: () => void) => void;
  updateLevelAuras: () => void;
  updateCards: () => void;
}

interface TargetedEffectDefinition {
  apply: (runtime: TargetedEffectCardRuntime, target: Tower, level: number) => void;
}

const targetedEffectDefinitions: Partial<Record<CardId, TargetedEffectDefinition>> = {
  b: {
    apply: (runtime, target) => {
      toggleTowerFacing(target);
      makeTurnCardPulse(runtime.scene, target);
    }
  },
  t: {
    apply: (runtime, target, level) => {
      applyTowerTrueDamage(target, runtime.battleTime, level);
      makeTrueDamagePulse(runtime.scene, target);
    }
  }
};

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

    if (runtime.getChars() < definition.cost) {
      return "noChars";
    }

    if (!target) {
      return "empty";
    }

    const pendingEffectCard = this.findPendingEffectCard(definition.id, lane, column);
    if (pendingEffectCard) {
      this.upgradePendingEffectCard(pendingEffectCard, definition);
    } else {
      this.placePendingEffectCard(definition, lane, column, target);
    }

    runtime.spendChars(definition.cost);
    cardState.readyAt = runtime.cardTimeFor(definition.id) + definition.cooldown;
    runtime.updateCards();
    return "handled";
  }

  private placePendingEffectCard(definition: CardDefinition, lane: number, column: number, target: Tower) {
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

    effectCard.body.setDepth(45 + lane);
    runtime.towers.push(effectCard);
    runtime.updateLevelAuras();
    runtime.scene.time.delayedCall(0, () => {
      runtime.runWhenBattleActive(() => this.resolvePendingEffectCard(effectCard));
    });
  }

  private upgradePendingEffectCard(tower: Tower, definition: CardDefinition) {
    const runtime = this.runtime();
    const gainedEffectiveUpgrades = upgradeTowerLevel(tower);
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

  private resolvePendingEffectCard(effectCard: Tower) {
    const runtime = this.runtime();
    if (!effectCard.inPlay) {
      return;
    }

    const definition = runtime.getDefinition(effectCard.type);
    const level = effectiveTowerLevel(effectCard);
    const target = runtime.towers.find((tower) => tower.id === effectCard.turnTargetId);
    if (target) {
      targetedEffectDefinitions[effectCard.type]?.apply(runtime, target, level);
    }

    runtime.removeTower(effectCard);
    runtime.updateLevelAuras();

    const cardState = runtime.cardStates.find((card) => card.definition.id === definition.id);
    if (cardState) {
      cardState.readyAt = Math.min(
        cardState.readyAt,
        runtime.cardTimeFor(definition.id) + definition.cooldown / level
      );
      runtime.updateCards();
    }
  }

  private findPendingEffectCard(type: CardId, lane: number, column: number) {
    return this.runtime().towers.find((tower) => {
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

function makeTrueDamagePulse(scene: Phaser.Scene, tower: Tower) {
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
