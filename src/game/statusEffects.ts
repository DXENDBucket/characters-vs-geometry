import { CELL_HEIGHT, FLYING_DISPLAY_OFFSET_Y, palette } from "../config";
import type { Enemy, StatusEffectName } from "../types";

const STATUS_SPEED_MULTIPLIERS: Record<StatusEffectName, number> = {
  stasis: 1 / 3,
  haste: 2,
  power: 1,
  flying: 1,
  invincible: 1,
  highFlying: 1
};
const STATUS_ATTACK_MULTIPLIERS: Partial<Record<StatusEffectName, number>> = {
  power: 1.3
};
const BURROW_DISPLAY_OFFSET_Y = CELL_HEIGHT * 0.55;

export function applyStatusEffect(
  enemy: Enemy,
  name: StatusEffectName,
  duration: number,
  time: number,
  speedMultiplier?: number,
  showHalo = false
) {
  if (enemy.kind === "archangelHeptagon" && name === "flying") {
    applyStatusEffect(enemy, "highFlying", duration, time, speedMultiplier, false);
    return;
  }

  const expiresAt = time + duration;
  const existing = enemy.statusEffects.find((effect) => effect.name === name);
  if (existing) {
    existing.expiresAt = Math.max(existing.expiresAt, expiresAt);
    existing.speedMultiplier = Math.max(
      existing.speedMultiplier ?? STATUS_SPEED_MULTIPLIERS[name],
      speedMultiplier ?? STATUS_SPEED_MULTIPLIERS[name]
    );
    existing.showHalo = existing.showHalo || showHalo;
    return;
  }

  enemy.statusEffects.push({ name, expiresAt, speedMultiplier, showHalo });
}

export function statusSpeedMultiplier(enemy: Enemy, time: number) {
  removeExpiredStatusEffects(enemy, time);
  syncStatusVisuals(enemy, time);
  return enemy.statusEffects.reduce((multiplier, effect) => {
    return multiplier * (effect.speedMultiplier ?? STATUS_SPEED_MULTIPLIERS[effect.name]);
  }, 1);
}

export function statusAttackMultiplier(enemy: Enemy, time: number) {
  removeExpiredStatusEffects(enemy, time);
  syncStatusVisuals(enemy, time);
  return enemy.statusEffects.reduce((multiplier, effect) => {
    return multiplier * (STATUS_ATTACK_MULTIPLIERS[effect.name] ?? 1);
  }, 1);
}

export function hasStatusEffect(enemy: Enemy, name: StatusEffectName, time: number) {
  removeExpiredStatusEffects(enemy, time);
  syncStatusVisuals(enemy, time);
  return enemy.statusEffects.some((effect) => effect.name === name);
}

export function removeStatusEffect(enemy: Enemy, name: StatusEffectName) {
  enemy.statusEffects = enemy.statusEffects.filter((effect) => effect.name !== name);
}

export function isEnemyFlying(enemy: Enemy, time: number) {
  return hasStatusEffect(enemy, "flying", time);
}

export function syncEnemyBodyPosition(enemy: Enemy) {
  enemy.body.setPosition(enemy.x, enemy.y + enemyDisplayOffsetY(enemy));
}

function removeExpiredStatusEffects(enemy: Enemy, time: number) {
  enemy.statusEffects = enemy.statusEffects.filter((effect) => effect.expiresAt > time);
}

function syncStatusVisuals(enemy: Enemy, time: number) {
  const stasisActive = enemy.statusEffects.some((effect) => effect.name === "stasis");
  const powerActive = enemy.statusEffects.some((effect) => effect.name === "power");
  const flyingActive = enemy.statusEffects.some((effect) => effect.name === "flying");
  const angelFlyingActive = enemy.statusEffects.some((effect) => effect.name === "flying" && effect.showHalo);
  const highFlyingActive = enemy.statusEffects.some((effect) => effect.name === "highFlying");
  const archangelActive = enemy.kind === "archangelHeptagon";
  const airborneActive = flyingActive || highFlyingActive;
  const haloActive = !archangelActive && (angelFlyingActive || highFlyingActive);
  enemy.statusBorder.setVisible(stasisActive);
  enemy.powerIcon.setVisible(powerActive);
  enemy.flyingHalo.setVisible(haloActive);
  syncArchangelHalos(enemy, highFlyingActive);
  if (stasisActive) {
    enemy.statusBorder.setStrokeStyle(2, palette.magic, 0.92);
    enemy.statusBorder.setScale(1 + Math.sin(time / 80) * 0.04);
  }
  if (powerActive) {
    enemy.powerIcon.setY(-38 + Math.sin(time / 120) * 2);
  }
  if (haloActive) {
    enemy.flyingHalo.setStrokeStyle(2, highFlyingActive ? palette.gold : palette.white, 0.94);
    enemy.flyingHalo.setY(-42 + Math.sin(time / 110) * 2);
    enemy.flyingHalo.setScale(1 + Math.sin(time / 150) * 0.05, 1);
  }
  enemy.body.setPosition(enemy.x, enemy.y + enemyDisplayOffsetY(enemy, airborneActive, time));
}

function enemyDisplayOffsetY(
  enemy: Enemy,
  airborneActive = enemy.statusEffects.some((effect) => effect.name === "flying" || effect.name === "highFlying"),
  time = 0
) {
  const flyingOffset = airborneActive ? FLYING_DISPLAY_OFFSET_Y + Math.sin(time / 130) * 2 : 0;
  const burrowOffset = enemy.burrowed ? BURROW_DISPLAY_OFFSET_Y : 0;
  return flyingOffset + burrowOffset;
}

type HaloVisual = {
  setStrokeStyle(lineWidth: number, color: number, alpha?: number): unknown;
};

type ShapeDataStore = {
  getData(key: string): unknown;
};

function syncArchangelHalos(enemy: Enemy, highFlyingActive: boolean) {
  if (enemy.kind !== "archangelHeptagon") {
    return;
  }

  const halos = (enemy.shape as unknown as ShapeDataStore).getData("archangelHalos") as HaloVisual[] | undefined;
  const [outerHalo, innerHalo] = halos ?? [];
  const color = highFlyingActive ? palette.gold : palette.white;
  outerHalo?.setStrokeStyle(2, color, highFlyingActive ? 0.94 : 0.86);
  innerHalo?.setStrokeStyle(2, color, 0.95);
}
