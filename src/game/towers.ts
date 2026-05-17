import Phaser from "phaser";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, palette } from "../config";
import { createUnitBorder } from "../render/unitShapes";
import type { CardDefinition, CardId, CardState, Tower } from "../types";
import {
  effectiveUpgradeCountForLevel,
  effectiveUpgradeDelta,
  isMaxHpUpgradeable,
  maxHpGainForEffectiveUpgrades,
  scaledByEffectiveUpgrades
} from "./upgrades";

export function createTower(
  scene: Phaser.Scene,
  definition: CardDefinition,
  lane: number,
  column: number,
  battleTime: number,
  placedOrder: number
): Tower {
  const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
  const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const body = scene.add.container(x, y).setDepth(20 + lane);
  const border = createUnitBorder(scene, definition.category, 24, definition.category === "defense" ? 3 : 2);
  const rangeBorder = definition.id === "T" ? createSlowAuraRangeBorder(scene) : null;
  const autoUpgradeBorder = createAutoUpgradeBorder(scene);
  const label = scene.add
    .text(0, -3, definition.id, {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "34px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const hpBack = scene.add.rectangle(0, 31, 42, 4, palette.dim, 1);
  const hpFill = scene.add.rectangle(-21, 31, 42, 4, palette.white, 1).setOrigin(0, 0.5);
  const levelText = scene.add
    .text(0, 17, "1", {
      color: "#8c8c8c",
      fontFamily: "monospace",
      fontSize: "12px",
      fontStyle: "700"
    })
    .setOrigin(0.5);

  body.add([...(rangeBorder ? [rangeBorder] : []), autoUpgradeBorder, border, label, levelText, hpBack, hpFill]);
  if (definition.id === "G" || definition.id === "c" || definition.id === "S") {
    border.setVisible(false);
  }

  return {
    id: `${lane}:${column}:${battleTime}`,
    type: definition.id,
    lane,
    column,
    x,
    y,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    baseMaxHp: definition.maxHp,
    armor: definition.armor ?? 0,
    magicResistance: definition.magicResistance ?? 0,
    fireRate: definition.fireRate ?? Number.POSITIVE_INFINITY,
    lastFire: -Number.POSITIVE_INFINITY,
    level: 1,
    levelBonus: 0,
    nextProduceAt: definition.produceEvery ? battleTime + definition.produceEvery : Number.POSITIVE_INFINITY,
    armedAt: definition.armTime ? battleTime + definition.armTime : 0,
    skillSp: 0,
    skillSpBuffer: 0,
    skillActiveUntil: 0,
    autoUpgrade: false,
    reflectProjectiles: Boolean(definition.reflectProjectiles),
    placedOrder,
    body,
    border,
    autoUpgradeBorder,
    hpFill,
    levelText
  };
}

export function upgradeTowerLevel(tower: Tower) {
  const previousLevel = tower.level;
  tower.level += 1;
  syncTowerLevelText(tower);
  tower.levelText.setAlpha(1);
  return effectiveUpgradeDelta(previousLevel, tower.level);
}

export function applyTowerUpgradeStats(
  tower: Tower,
  definition: CardDefinition,
  gainedEffectiveUpgrades: number,
  battleTime: number
) {
  syncTowerDerivedStats(tower, gainedEffectiveUpgrades > 0);

  if (tower.type === "G") {
    resetTrapArming(tower, definition, battleTime);
  }
}

export function syncTowerDerivedStats(tower: Tower, healMaxHpIncrease = false) {
  if (!isMaxHpUpgradeable(tower.type)) {
    return;
  }

  const previousMaxHp = tower.maxHp;
  const effectiveUpgrades = effectiveUpgradeCountForLevel(effectiveTowerLevel(tower));
  tower.maxHp = tower.baseMaxHp + maxHpGainForEffectiveUpgrades(tower.baseMaxHp, effectiveUpgrades);
  if (healMaxHpIncrease && tower.maxHp > previousMaxHp) {
    tower.hp = Math.min(tower.maxHp, tower.hp + tower.maxHp - previousMaxHp);
  } else {
    tower.hp = Math.min(tower.hp, tower.maxHp);
  }
  syncTowerHpBar(tower);
}

export function syncTowerHpBar(tower: Tower) {
  tower.hpFill.width = 42 * Phaser.Math.Clamp(tower.hp / tower.maxHp, 0, 1);
}

export function effectiveTowerLevel(tower: Tower) {
  return Math.max(1, tower.level + tower.levelBonus);
}

export function syncTowerLevelText(tower: Tower) {
  if (tower.levelBonus > 0) {
    tower.levelText.setText(`${tower.level}+${tower.levelBonus}`);
    tower.levelText.setFontSize(10);
    tower.levelText.setColor("#9fdcff");
    return;
  }

  tower.levelText.setText(`${tower.level}`);
  tower.levelText.setFontSize(12);
  tower.levelText.setColor("#8c8c8c");
}

export function getProductionAmount(tower: Tower, definition: CardDefinition) {
  return scaledByEffectiveUpgrades(definition.produceAmount ?? 0, effectiveTowerLevel(tower));
}

export function getHitProductionAmount(tower: Tower, definition: CardDefinition) {
  return scaledByEffectiveUpgrades(definition.hitProduceAmount ?? 0, effectiveTowerLevel(tower));
}

export function getShockCount(tower: Tower, definition: CardDefinition) {
  if (tower.type === "l") {
    return 1;
  }

  return scaledByEffectiveUpgrades(definition.triggerCount ?? 10, effectiveTowerLevel(tower));
}

export function getTriggerDebuffDuration(tower: Tower, definition: CardDefinition) {
  return scaledByEffectiveUpgrades(definition.triggerDebuffDuration ?? 0, effectiveTowerLevel(tower));
}

export function getTrapDamage(tower: Tower, definition: CardDefinition) {
  return scaledByEffectiveUpgrades(definition.triggerDamage ?? 1_500, effectiveTowerLevel(tower));
}

export function getSpellMortarDamage(tower: Tower, definition: CardDefinition) {
  return scaledByEffectiveUpgrades(definition.damage ?? 8_000, effectiveTowerLevel(tower));
}

export function isTrapArmed(tower: Tower, time: number) {
  return tower.type === "G" && time >= tower.armedAt;
}

export function setTowerAutoUpgradeState(tower: Tower, enabled: boolean, active = true) {
  tower.autoUpgrade = enabled;
  syncTowerAutoUpgradeVisual(tower, active);
}

export function syncTowerAutoUpgradeVisual(tower: Tower, active: boolean) {
  tower.autoUpgradeBorder.setVisible(tower.autoUpgrade);
  tower.autoUpgradeBorder.setAlpha(active ? 0.95 : 0.28);
}

export function findAutoUpgradeTarget(towers: Tower[], cardId: CardId) {
  return towers
    .filter((tower) => tower.autoUpgrade && tower.type === cardId)
    .sort((a, b) => a.level - b.level || a.placedOrder - b.placedOrder)[0];
}

export function isCardReadyForAutoUpgrade(cardState: CardState, cardTime: number) {
  return cardTime >= cardState.readyAt;
}

function createAutoUpgradeBorder(scene: Phaser.Scene) {
  const border = scene.add.graphics();
  border.lineStyle(2, palette.green, 0.95);
  border.strokeCircle(0, 0, 31);
  border.setVisible(false);
  return border;
}

function createSlowAuraRangeBorder(scene: Phaser.Scene) {
  const border = scene.add.graphics();
  const inner = CELL_WIDTH * 1.5;
  const outer = CELL_WIDTH * 2.5;

  border.lineStyle(2, palette.time, 0.86);
  border.beginPath();
  border.moveTo(-inner, -outer);
  border.lineTo(inner, -outer);
  border.lineTo(inner, -inner);
  border.lineTo(outer, -inner);
  border.lineTo(outer, inner);
  border.lineTo(inner, inner);
  border.lineTo(inner, outer);
  border.lineTo(-inner, outer);
  border.lineTo(-inner, inner);
  border.lineTo(-outer, inner);
  border.lineTo(-outer, -inner);
  border.lineTo(-inner, -inner);
  border.closePath();
  border.strokePath();
  return border;
}

function resetTrapArming(tower: Tower, definition: CardDefinition, battleTime: number) {
  tower.armedAt = battleTime + (definition.armTime ?? 15_000);
  tower.border.setVisible(false);
}
