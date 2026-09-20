import Phaser from "phaser";
import { topologyKey } from "./towerTopology";
import { drawLogicalTowerRange } from "../render/towerLogicalRange";
import { towerBehaviorType, towerActionContext, towerFormType, numberTowerValue, numberTowerMultiplier, numberTowerActionLevel } from "./towerIdentity";
import { syncHealthBar } from "./towerHealth";
import { facingWithEffects } from "./rules/reversal";
import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, FLYING_DISPLAY_OFFSET_Y, palette } from "../config";
import { createUnitBorder } from "../render/unitShapes";
import type { CardDefinition, CardId, CardState, SkillState, Tower } from "../types";
import { syncTowerFinalStats, towerBaseStatsFromDefinition, towerFinalStats } from "./unitStats";
import type { TowerAuraSources } from "./towerAuras";
import {
  effectiveUpgradeDelta,
  scaledByEffectiveUpgrades
} from "./upgrades";
import { setAlphaIfChanged, setPositionIfChanged, setScaleIfChanged, setVisibleIfChanged } from "./visualGuards";

const TRUE_DAMAGE_DURATION_PER_LEVEL = 12_000;
const AIR_PATROL_INITIAL_SP = 8;

export function createTower(
  scene: Phaser.Scene,
  definition: CardDefinition,
  lane: number,
  column: number,
  battleTime: number,
  placedOrder: number,
  options: { transient?: boolean; turnTargetId?: string } = {}
): Tower {
  const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
  const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
  const body = scene.add.container(x, y).setDepth(20 + lane);
  const border = createUnitBorder(scene, definition.category, 24, definition.category === "defense" ? 3 : 2);
  const rangeBorder = createRangeBorder(scene, definition);
  const autoUpgradeBorder = createAutoUpgradeBorder(scene);
  const trueDamageBorder = createTrueDamageBorder(scene);
  const flyingHalo = createTowerFlyingHalo(scene);
  const baseStats = towerBaseStatsFromDefinition(definition);
  const label = scene.add
    .text(0, -3, definition.id, {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "34px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const facingIcon = scene.add
    .text(-37, -4, "<", {
      color: "#ffd75a",
      fontFamily: "monospace",
      fontSize: "24px",
      fontStyle: "700"
    })
    .setOrigin(0.5)
    .setVisible(false);
  const hpBack = scene.add.rectangle(0, 31, 42, 4, palette.dim, 1);
  const hpFill = scene.add.rectangle(-21, 31, 42, 4, palette.white, 1).setOrigin(0, 0.5);
  const negativeHpBack = scene.add.rectangle(-21, 31, 0, 4, palette.unyielding, 0.25)
    .setOrigin(0, 0.5).setVisible(false);
  const negativeHpFill = scene.add.rectangle(-21, 31, 0, 4, palette.unyielding, 1)
    .setOrigin(0, 0.5).setVisible(false);
  const levelText = scene.add
    .text(0, 17, "1", {
      color: "#8c8c8c",
      fontFamily: "monospace",
      fontSize: "12px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  if (definition.id === "1") levelText.setVisible(false);

  body.add([
    ...(rangeBorder ? [rangeBorder] : []),
    trueDamageBorder,
    autoUpgradeBorder,
    flyingHalo,
    border,
    label,
    facingIcon,
    levelText,
    hpBack,
    hpFill,
    negativeHpBack,
    negativeHpFill
  ]);
  if (definition.id === "G" || definition.id === "c" || definition.id === "S") {
    border.setVisible(false);
  }

  const skills: Record<string, SkillState> = {};
  if (definition.id === "w") {
    skills.airPatrol = {
      sp: AIR_PATROL_INITIAL_SP,
      spBuffer: 0,
      activeUntil: 0
    };
  }

  return {
    id: `tower:${placedOrder}`,
    type: definition.id,
    lane,
    column,
    x,
    y,
    hp: baseStats.maxHp,
    baseStats,
    finalStats: { ...baseStats },
    maxHp: baseStats.maxHp,
    baseMaxHp: baseStats.maxHp,
    armor: baseStats.armor,
    magicResistance: baseStats.magicResistance,
    attackSpeed: baseStats.attackSpeed,
    lastFire: definition.category === "production" && definition.attackSpeed && definition.produceAmount
      ? battleTime
      : -Number.POSITIVE_INFINITY,
    level: 1,
    levelBonus: 0,
    mirrorLevelBonus: 0,
    nextProduceAt: definition.produceEvery ? battleTime + definition.produceEvery : Number.POSITIVE_INFINITY,
    armedAt: definition.armTime ? battleTime + definition.armTime : 0,
    skills,
    autoUpgrade: false,
    reflectProjectiles: Boolean(definition.reflectProjectiles),
    nextRepelDirection: placedOrder % 2 === 0 ? -1 : 1,
    facingDirection: 1,
    statusEffects: [],
    transient: Boolean(options.transient),
    mirroredEffect: false,
    turnTargetId: options.turnTargetId,
    placedOrder,
    inPlay: true,
    body,
    border,
    label,
    facingIcon,
    autoUpgradeBorder,
    trueDamageBorder,
    flyingHalo,
    hpFill,
    negativeHpBack,
    negativeHpFill,
    levelText,
    rangeBorder: rangeBorder ?? undefined,
    trueDamageUntil: 0,
    flyingUntil: 0
  };
}

export function towerFacingDirection(tower: Tower) {
  return facingWithEffects(tower, tower.facingDirection ?? 1);
}

export function toggleTowerFacing(tower: Tower) {
  setTowerFacing(tower, tower.facingDirection === -1 ? 1 : -1);
}

export function setTowerFacing(tower: Tower, direction: -1 | 1) {
  tower.facingDirection = direction;
  syncTowerFacingVisual(tower);
}

export function syncTowerFacingVisual(tower: Tower) {
  const reversed = towerFacingDirection(tower) === -1;
  const scaleX = reversed ? -1 : 1;
  setScaleIfChanged(tower.border, scaleX, 1);
  setScaleIfChanged(tower.label, scaleX, 1);
  setVisibleIfChanged(tower.facingIcon, reversed);
}

export function syncTowerFormVisual(scene: Phaser.Scene, tower: Tower, definition: CardDefinition, time: number) {
  const borderIndex = tower.body.getIndex(tower.border);
  tower.border.destroy();
  tower.border = createUnitBorder(scene, definition.category, 24, definition.category === "defense" ? 3 : 2);
  tower.body.addAt(tower.border, borderIndex);
  tower.rangeBorder?.destroy();
  tower.rangeBorder = createRangeBorder(scene, definition) ?? undefined;
  tower.body.setData("friendlyRange", undefined);
  tower.body.setData("numberSkillRange", undefined);
  if (tower.rangeBorder) tower.body.addAt(tower.rangeBorder, 0);
  tower.border.setVisible(definition.id !== "S" && definition.id !== "c" &&
    (definition.id !== "G" || time >= tower.armedAt));
  syncTowerFacingVisual(tower);
  syncTowerFlyingVisual(tower, time);
  syncTowerHpBar(tower);
}

export function upgradeTowerLevel(tower: Tower, levels = 1) {
  const previousLevel = tower.level;
  tower.level += Math.max(0, Math.floor(levels));
  syncTowerLevelText(tower);
  setAlphaIfChanged(tower.levelText, 1);
  return effectiveUpgradeDelta(previousLevel, tower.level);
}

export function applyTowerUpgradeStats(
  tower: Tower,
  definition: CardDefinition,
  gainedEffectiveUpgrades: number,
  battleTime: number
) {
  syncTowerDerivedStats(tower, gainedEffectiveUpgrades > 0);

  if (towerBehaviorType(tower) === "G") {
    resetTrapArming(tower, definition, battleTime);
  }
}

export function syncTowerDerivedStats(
  tower: Tower,
  healMaxHpIncrease = false,
  towers?: Tower[],
  towerAuraSources?: TowerAuraSources
) {
  syncTowerFinalStats(tower, { healMaxHpIncrease, towers, towerAuraSources });
  syncTowerHpBar(tower);
}

export function syncTowerHpBar(tower: Tower) {
  syncHealthBar(tower);
}

export function effectiveTowerLevel(tower: Tower) {
  return towerActionContext(tower)?.level ?? Math.max(1, tower.level + tower.levelBonus + tower.mirrorLevelBonus);
}

export function syncTowerLevelText(tower: Tower) {
  if (tower.type === "1") {
    const text = String(tower.level);
    tower.label.setText(text).setFontSize(Math.min(34, 48 / Math.max(1, text.length)));
    const boosted = numberTowerMultiplier(tower) > 1;
    tower.label.setY(boosted ? -7 : -3);
    tower.levelText.setVisible(boosted);
    if (boosted) {
      const level = `L${numberTowerActionLevel(tower)}`;
      tower.levelText.setY(12).setText(level).setFontSize(Math.min(10, 40 / level.length)).setColor("#9fdcff");
    }
    return;
  }
  tower.levelText.setVisible(true);
  if (towerFormType(tower) === "+") {
    const computed = tower.numberValue !== undefined;
    tower.label.setY(computed ? -7 : -3);
    tower.levelText.setY(computed ? 12 : 17);
    if (computed) {
      const multiplier = numberTowerMultiplier(tower);
      const text = multiplier > 1 ? `${numberTowerValue(tower)}x${multiplier}` : `=${numberTowerValue(tower)}`;
      tower.levelText.setText(text).setFontSize(Math.min(10, 40 / text.length)).setColor("#9fdcff");
      return;
    }
  }
  const bonus = tower.levelBonus + tower.mirrorLevelBonus;
  if (bonus > 0) {
    tower.levelText.setText(`${tower.level}+${bonus}`);
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
  if (towerBehaviorType(tower) === "l") {
    return 1;
  }

  return scaledByEffectiveUpgrades(definition.triggerCount ?? 10, effectiveTowerLevel(tower));
}

export function getTriggerDebuffDuration(tower: Tower, definition: CardDefinition) {
  if (definition.triggerDebuff === "reversed") {
    return (definition.triggerDebuffDuration ?? 0) * effectiveTowerLevel(tower);
  }
  return scaledByEffectiveUpgrades(definition.triggerDebuffDuration ?? 0, effectiveTowerLevel(tower));
}

export function isTrapArmed(tower: Tower, time: number) {
  return towerBehaviorType(tower) === "G" && time >= tower.armedAt;
}

export function setTowerAutoUpgradeState(tower: Tower, enabled: boolean, active = true) {
  tower.autoUpgrade = enabled;
  syncTowerAutoUpgradeVisual(tower, active);
}

export function syncTowerAutoUpgradeVisual(tower: Tower, active: boolean) {
  setVisibleIfChanged(tower.autoUpgradeBorder, tower.autoUpgrade);
  setAlphaIfChanged(tower.autoUpgradeBorder, active ? 0.95 : 0.28);
}

export function findAutoUpgradeTarget(towers: Tower[], cardId: CardId) {
  let target: Tower | undefined;
  for (const tower of towers) {
    if (!tower.autoUpgrade || tower.type !== cardId) {
      continue;
    }

    if (!target || tower.level < target.level || (tower.level === target.level && tower.placedOrder < target.placedOrder)) {
      target = tower;
    }
  }
  return target;
}

export function isCardReadyForAutoUpgrade(cardState: CardState, cardTime: number) {
  return cardTime >= cardState.readyAt;
}

export function applyTowerTrueDamage(tower: Tower, battleTime: number, level: number) {
  const duration = TRUE_DAMAGE_DURATION_PER_LEVEL * Math.max(1, level);
  tower.trueDamageUntil = Math.max(tower.trueDamageUntil, battleTime) + duration;
  syncTowerTrueDamageVisual(tower, battleTime);
}

export function towerDamageType(tower: Tower, damageType: CardDefinition["damageType"], battleTime: number) {
  return towerHasTrueDamage(tower, battleTime) ? "true" : damageType ?? "physical";
}

export function towerIsFlying(tower: Tower) {
  return tower.flyingUntil > 0;
}

export function setTowerFlyingUntil(tower: Tower, until: number) {
  tower.flyingUntil = until;
}

export function syncTowerFlyingVisual(tower: Tower, time: number) {
  let x = tower.x;
  let y = tower.y;
  if (tower.moveVisual) {
    const move = tower.moveVisual;
    const progress = Phaser.Math.Clamp((time - move.startedAt) / move.duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    x = move.fromX + (x - move.fromX) * eased;
    y = move.fromY + (y - move.fromY) * eased;
    if (progress >= 1) tower.moveVisual = undefined;
  }
  const active = towerIsFlying(tower);
  setVisibleIfChanged(tower.flyingHalo, active);
  if (!active) {
    setPositionIfChanged(tower.body, x, y);
    setScaleIfChanged(tower.flyingHalo, 1, 1);
    return;
  }

  tower.body.setPosition(x, y + FLYING_DISPLAY_OFFSET_Y + Math.sin(time / 130) * 2);
  tower.flyingHalo.setY(-38 + Math.sin(time / 110) * 2);
  tower.flyingHalo.setScale(1 + Math.sin(time / 150) * 0.05, 1);
}

export function syncTowerTrueDamageVisual(tower: Tower, battleTime: number) {
  const active = towerHasTrueDamage(tower, battleTime);
  if (!active && tower.trueDamageUntil > 0 && battleTime >= tower.trueDamageUntil) {
    tower.trueDamageUntil = 0;
  }
  setVisibleIfChanged(tower.trueDamageBorder, active);
  if (active) {
    tower.trueDamageBorder.setAlpha(0.72 + Math.sin(battleTime / 120) * 0.18);
  }
}

function createAutoUpgradeBorder(scene: Phaser.Scene) {
  const border = scene.add.graphics();
  border.lineStyle(2, palette.green, 0.95);
  border.strokeCircle(0, 0, 31);
  border.setVisible(false);
  return border;
}

function createTrueDamageBorder(scene: Phaser.Scene) {
  const border = scene.add.graphics();
  border.lineStyle(2, palette.gold, 0.95);
  border.strokeCircle(0, 0, 36);
  border.setVisible(false);
  return border;
}

function createTowerFlyingHalo(scene: Phaser.Scene) {
  const halo = scene.add.ellipse(0, -38, 34, 10, palette.black, 0).setStrokeStyle(2, palette.white, 0.94);
  halo.setVisible(false);
  return halo;
}

export function syncNumberSkillRange(scene: Phaser.Scene, tower: Tower, time: number) {
  const orientation = time < (tower.skills.orientation?.activeUntil ?? 0);
  const gathering = time < (tower.skills.gathering?.activeUntil ?? 0);
  const key = `${orientation}:${gathering}:${topologyKey(tower)}:${tower.lane}:${tower.column}`;
  if (tower.body.getData("numberSkillRange") === key) return;
  tower.body.setData("numberSkillRange", key);
  tower.rangeBorder?.destroy();
  tower.rangeBorder = undefined;
  if (!orientation && !gathering) return;
  const border = scene.add.graphics();
  if (orientation) drawLogicalTowerRange(border, tower, 2, true, 0xa2efb0, 0.9);
  if (gathering) drawGatheringRange(border);
  tower.rangeBorder = border;
  tower.body.addAt(border, 0);
}

export function syncFriendlyRangeVisual(tower: Tower) {
  const type = towerFormType(tower);
  if (!["e", "g", "o"].includes(type) || !tower.rangeBorder) return;
  const key = `${type}:${topologyKey(tower)}:${tower.lane}:${tower.column}`;
  if (tower.body.getData("friendlyRange") === key) return;
  tower.body.setData("friendlyRange", key);
  tower.rangeBorder.clear();
  drawLogicalTowerRange(tower.rangeBorder, tower, type === "g" ? 1 : 2, type !== "g",
    type === "o" ? 0xa2efb0 : palette.enemyShot, type === "o" ? 1 : 0.86);
}

function drawGatheringRange(border: Phaser.GameObjects.Graphics) {
  border.lineStyle(2, 0xa2efb0, 1);
  for (const direction of [-1, 1]) {
    border.strokeRect(-CELL_WIDTH / 2, (direction - 0.5) * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
  }
}

function createRangeBorder(scene: Phaser.Scene, definition: CardDefinition) {
  if (definition.id === "j") {
    const border = scene.add.graphics();
    drawGatheringRange(border);
    return border.setAlpha(0.22);
  }

  if (definition.id === "o") {
    return createNoCornerRangeBorder(scene, 0xa2efb0, 1).setAlpha(0.22);
  }

  if (definition.id === "T") {
    return createNoCornerRangeBorder(scene, palette.time, 0.86);
  }

  if (definition.id === "e") {
    return createNoCornerRangeBorder(scene, palette.enemyShot, 0.86);
  }

  if (definition.id === "g") {
    const border = scene.add.graphics();
    border.lineStyle(2, palette.enemyShot, 0.86);
    border.strokeRect(-CELL_WIDTH * 1.5, -CELL_HEIGHT * 1.5, CELL_WIDTH * 3, CELL_HEIGHT * 3);
    return border;
  }

  return null;
}

function createNoCornerRangeBorder(scene: Phaser.Scene, color: number, alpha: number) {
  const border = scene.add.graphics();
  const inner = CELL_WIDTH * 1.5;
  const outer = CELL_WIDTH * 2.5;

  border.lineStyle(2, color, alpha);
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

function towerHasTrueDamage(tower: Tower, battleTime: number) {
  return battleTime < tower.trueDamageUntil;
}

function resetTrapArming(tower: Tower, definition: CardDefinition, battleTime: number) {
  tower.armedAt = battleTime + (definition.armTime ?? 15_000);
  tower.border.setVisible(false);
}
