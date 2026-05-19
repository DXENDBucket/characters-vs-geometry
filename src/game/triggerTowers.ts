import Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH } from "../config";
import { makeShockPulse, makeTrapBurst } from "../render/combatEffects";
import type { CardDefinition, CardId, CubeBoss, DamageType, Enemy, Tower } from "../types";
import { applyStatusEffect } from "./statusEffects";
import { isBossInRect } from "./targeting";
import { getShockCount, getTriggerDebuffDuration, getTrapDamage } from "./towers";

export interface TriggerTowerRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  boss: CubeBoss | null;
  battleTime: number;
  gameOver: boolean;
  getDefinition: (id: CardId) => CardDefinition;
  removeTower: (tower: Tower) => void;
  damageEnemy: (enemy: Enemy, damage: number, damageType: DamageType) => void;
  damageBoss: (damage: number, damageType: DamageType) => void;
  runWhenBattleActive: (action: () => void) => void;
}

export function triggerShockTower(runtime: TriggerTowerRuntime, tower: Tower) {
  const definition = runtime.getDefinition(tower.type);
  const interval = definition.triggerInterval ?? 50;
  const damage = tower.type === "l" ? getTrapDamage(tower, definition) : definition.triggerDamage ?? 100;
  const damageType = definition.triggerDamageType ?? "physical";
  const rangeX = definition.triggerRangeX ?? CELL_WIDTH;
  const rangeY = definition.triggerRangeY ?? CELL_HEIGHT;
  const x = tower.x;
  const y = tower.y;
  const area = triggerEffectArea(x, y, rangeX, rangeY);

  runtime.removeTower(tower);

  if (definition.triggerDebuff) {
    makeShockPulse(runtime.scene, area.x, area.y, area.rangeX, area.rangeY, damageType);
    for (const enemy of [...runtime.enemies]) {
      if (Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY) {
        applyStatusEffect(enemy, definition.triggerDebuff, getTriggerDebuffDuration(tower, definition), runtime.battleTime);
      }
    }
    return;
  }

  const count = getShockCount(tower, definition);
  for (let index = 0; index < count; index += 1) {
    runtime.scene.time.delayedCall(index * interval, () => {
      runtime.runWhenBattleActive(() => {
        if (runtime.gameOver) {
          return;
        }

        makeShockPulse(runtime.scene, area.x, area.y, area.rangeX, area.rangeY, damageType);
        for (const enemy of [...runtime.enemies]) {
          if (Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY) {
            runtime.damageEnemy(enemy, damage, damageType);
          }
        }
        if (isBossInRect(runtime.boss, area.left, area.top, area.width, area.height)) {
          runtime.damageBoss(damage, damageType);
        }
      });
    });
  }
}

export function triggerTrapTower(runtime: TriggerTowerRuntime, tower: Tower, target: Enemy | "boss") {
  const definition = runtime.getDefinition(tower.type);
  const damage = getTrapDamage(tower, definition);
  const damageType = definition.triggerDamageType ?? "magic";
  const x = tower.x;
  const y = tower.y;

  runtime.removeTower(tower);
  makeTrapBurst(runtime.scene, x, y, damageType);
  if (target === "boss") {
    runtime.damageBoss(damage, damageType);
    return;
  }

  runtime.damageEnemy(target, damage, damageType);
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
