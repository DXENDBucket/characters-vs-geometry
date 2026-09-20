import Phaser from "phaser";
import type { TowerActionListener } from "./towerActions";
import { towerBehaviorType } from "./towerIdentity";
import type { BattleAction, ScheduleBattleAction } from "./battleActions";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH } from "../config";
import { makeFreezePulse, makeReversalPulse, makeShockPulse, makeTrapBurst } from "../render/combatEffects";
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, Tower } from "../types";
import { enemyIsBurrowed, enemyIsHighFlying } from "./enemyBehaviors";
import { forEachSnapshot } from "./iteration";
import { applyStatusEffect } from "./statusEffects";
import { bossPartDistanceSqToPoint, bossPartInRect, forEachBossPart } from "./targeting";
import { getShockCount, getTriggerDebuffDuration, towerDamageType } from "./towers";
import { towerAttackAmount } from "./unitStats";

export interface TriggerTowerRuntime {
  onTowerAction?: TowerActionListener;
  scheduleBattleAction?: ScheduleBattleAction;
  scene: Phaser.Scene;
  enemies: Enemy[];
  boss: CubeBoss | null;
  battleTime: number;
  gameOver: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  removeTower: (tower: Tower) => void;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType, sourceTower?: Tower) => boolean;
  damageBoss: (damage: number, damageType: DamageType, targetPart?: CubeBoss) => boolean;
  runWhenBattleActive: (action: () => void) => void;
}

const SHOCK_TOWER_IDS = new Set<CardId>(["F", "f", "i", "l", "r"]);

export function isShockTower(tower: Tower | undefined): tower is Tower {
  return tower !== undefined && SHOCK_TOWER_IDS.has(towerBehaviorType(tower));
}

export function triggerShockTower(runtime: TriggerTowerRuntime, tower: Tower) {
  if (!tower.inPlay) return;
  runtime.onTowerAction?.(tower, { kind: "shock" });
  const definition = runtime.getDefinition(towerBehaviorType(tower));
  const interval = definition.triggerInterval ?? 50;
  const damage = towerAttackAmount(tower, definition);
  const damageType = towerDamageType(tower, definition.damageType ?? "physical", runtime.battleTime);
  const rangeX = definition.triggerRangeX ?? CELL_WIDTH;
  const rangeY = definition.triggerRangeY ?? CELL_HEIGHT;
  const triggerShape = definition.triggerShape ?? "rect";
  const x = tower.x;
  const y = tower.y;
  const area = triggerEffectArea(x, y, rangeX, rangeY);
  const debuffDuration = getTriggerDebuffDuration(tower, definition);

  runtime.removeTower(tower);

  const triggerDebuff = definition.triggerDebuff;
  if (triggerDebuff) {
    if (triggerDebuff === "frozen") {
      makeFreezePulse(runtime.scene, x, y, rangeX);
    } else if (triggerDebuff === "reversed") {
      makeReversalPulse(runtime.scene, x, y, rangeX);
    } else {
      makeShockPulse(runtime.scene, area.x, area.y, area.rangeX, area.rangeY, damageType);
    }
    forEachSnapshot(runtime.enemies, (enemy) => {
      if (!canApplyTriggerDebuff(enemy, triggerDebuff, x, y, rangeX, rangeY, triggerShape)) {
        return;
      }

      if (triggerDebuff === "reversed" && (!runtime.damageEnemy(enemy, damage, damageType, tower) || !enemy.inPlay)) {
        return;
      }
      applyStatusEffect(enemy, triggerDebuff, debuffDuration, runtime.battleTime);
    });
    if (triggerDebuff === "reversed") {
      forEachBossPart(runtime.boss, (part) => {
        if (
          bossPartDistanceSqToPoint(part, x, y) <= rangeX * rangeX &&
          runtime.damageBoss(damage, damageType, part) && part.hp > 0
        ) {
          applyStatusEffect(part, "reversed", debuffDuration, runtime.battleTime);
        }
      });
    }
    return;
  }

  const count = getShockCount(tower, definition);
  for (let index = 0; index < count; index += 1) {
    if (runtime.scheduleBattleAction) {
      runtime.scheduleBattleAction(index * interval, { type: "shock", tower, x, y, rangeX, rangeY, damage, damageType });
      continue;
    }
    runtime.scene.time.delayedCall(index * interval, () => {
      runtime.runWhenBattleActive(() => {
        executeShockPulse(runtime, { type: "shock", tower, x, y, rangeX, rangeY, damage, damageType });
      });
    });
  }
}

export function executeShockPulse(runtime: TriggerTowerRuntime, action: Extract<BattleAction, { type: "shock" }>) {
  if (runtime.gameOver) return;
  const { tower, x, y, rangeX, rangeY, damage, damageType } = action;
  const area = triggerEffectArea(x, y, rangeX, rangeY);
  makeShockPulse(runtime.scene, area.x, area.y, area.rangeX, area.rangeY, damageType);
  forEachSnapshot(runtime.enemies, enemy => {
    if (!enemyIsHighFlying(enemy) && Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY) {
      runtime.damageEnemy(enemy, damage, damageType, tower);
    }
  });
  const part = bossPartInRect(runtime.boss, area.left, area.top, area.width, area.height);
  if (part) runtime.damageBoss(damage, damageType, part);
}

export function triggerTrapTower(runtime: TriggerTowerRuntime, tower: Tower, target: Enemy | CubeBoss | "boss") {
  if (!tower.inPlay) return;
  runtime.onTowerAction?.(tower, { kind: "trap", target });
  const definition = runtime.getDefinition(towerBehaviorType(tower));
  const damage = towerAttackAmount(tower, definition);
  const damageType = towerDamageType(tower, definition.damageType ?? "magic", runtime.battleTime);
  const x = tower.x;
  const y = tower.y;

  runtime.removeTower(tower);
  makeTrapBurst(runtime.scene, x, y, damageType);
  if (target === "boss") {
    runtime.damageBoss(damage, damageType);
    return;
  }

  if (isBossTrapTarget(target)) {
    runtime.damageBoss(damage, damageType, target);
    return;
  }

  runtime.damageEnemy(target, damage, damageType, tower);
}

function isBossTrapTarget(target: Enemy | CubeBoss): target is CubeBoss {
  return "rank" in target;
}

function canApplyTriggerDebuff(
  enemy: Enemy,
  debuff: CardDefinition["triggerDebuff"],
  x: number,
  y: number,
  rangeX: number,
  rangeY: number,
  triggerShape: CardDefinition["triggerShape"]
) {
  if (!enemy.inPlay || (debuff === "reversed" && enemyIsBurrowed(enemy))) {
    return false;
  }
  if (debuff !== "frozen" && enemyIsHighFlying(enemy)) {
    return false;
  }

  if (triggerShape === "circle") {
    return distanceSq(enemy.x, enemy.y, x, y) <= rangeX * rangeX;
  }

  return Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY;
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function triggerEffectArea(x: number, y: number, rangeX: number, rangeY: number) {
  const left = Number.isFinite(rangeX) ? x - rangeX : BOARD_X;
  const top = Number.isFinite(rangeY) ? y - rangeY : BOARD_Y;
  const width = Number.isFinite(rangeX) ? rangeX * 2 : BOARD_WIDTH;
  const height = Number.isFinite(rangeY) ? rangeY * 2 : BOARD_HEIGHT;

  return {
    x: left + width / 2,
    y: top + height / 2,
    rangeX: width / 2,
    rangeY: height / 2,
    left,
    top,
    width,
    height
  };
}
