import { CELL_HEIGHT, FLYING_DISPLAY_OFFSET_Y, palette } from "../config";
import { enemyFamily } from "../registry/enemies";
import type { Enemy, StatusEffectName } from "../types";

const STATUS_SPEED_MULTIPLIERS: Record<StatusEffectName, number> = {
  stasis: 1 / 2,
  haste: 2,
  power: 1,
  flying: 1,
  invincible: 1,
  highFlying: 1,
  sunder: 1,
  frozen: 0
};
const STATUS_ATTACK_MULTIPLIERS: Partial<Record<StatusEffectName, number>> = {
  power: 1.3
};
const STATUS_ARMOR_MULTIPLIERS: Partial<Record<StatusEffectName, number>> = {
  sunder: 0.65
};
const BURROW_DISPLAY_OFFSET_Y = CELL_HEIGHT * 0.55;

export interface StatusMultipliers {
  speed: number;
  attack: number;
  armor: number;
}

type VisibleTarget = {
  visible: boolean;
  setVisible(visible: boolean): unknown;
};

type ScaleTarget = {
  scaleX: number;
  scaleY: number;
  setScale(x: number, y?: number): unknown;
};

export function applyStatusEffect(
  enemy: Enemy,
  name: StatusEffectName,
  duration: number,
  time: number,
  speedMultiplier?: number,
  showHalo = false
) {
  if (enemyFamily(enemy.kind) === "archangelHeptagon" && name === "flying") {
    applyStatusEffect(enemy, "highFlying", duration, time, speedMultiplier, false);
    return;
  }

  const expiresAt = time + duration;
  const existing = statusEffectByName(enemy, name);
  if (existing) {
    existing.expiresAt = name === "sunder" ? expiresAt : Math.max(existing.expiresAt, expiresAt);
    existing.speedMultiplier = Math.max(
      existing.speedMultiplier ?? STATUS_SPEED_MULTIPLIERS[name],
      speedMultiplier ?? STATUS_SPEED_MULTIPLIERS[name]
    );
    existing.showHalo = existing.showHalo || showHalo;
    if (name === "frozen") {
      existing.physicalDamageTaken = 0;
    }
    invalidateStatusVisuals(enemy);
    return;
  }

  enemy.statusEffects.push({ name, expiresAt, speedMultiplier, showHalo, physicalDamageTaken: name === "frozen" ? 0 : undefined });
  invalidateStatusVisuals(enemy);
}

export function statusSpeedMultiplier(enemy: Enemy, time: number) {
  return statusMultipliers(enemy, time).speed;
}

export function statusAttackMultiplier(enemy: Enemy, time: number) {
  return statusMultipliers(enemy, time).attack;
}

export function statusArmorMultiplier(enemy: Enemy, time: number) {
  return statusMultipliers(enemy, time).armor;
}

export function statusMultipliers(enemy: Enemy, time: number): StatusMultipliers {
  const removedExpired = removeExpiredStatusEffects(enemy, time);
  const multipliers = enemy.statusMultiplierCache;
  if (enemy.statusEffects.length === 0) {
    multipliers.speed = 1;
    multipliers.attack = 1;
    multipliers.armor = 1;
    if (removedExpired) {
      syncStatusVisuals(enemy, time);
    }
    return multipliers;
  }

  syncStatusVisuals(enemy, time);
  let speed = 1;
  let attack = 1;
  let armor = 1;
  for (const effect of enemy.statusEffects) {
    speed *= effect.speedMultiplier ?? STATUS_SPEED_MULTIPLIERS[effect.name];
    attack *= STATUS_ATTACK_MULTIPLIERS[effect.name] ?? 1;
    armor *= STATUS_ARMOR_MULTIPLIERS[effect.name] ?? 1;
  }
  multipliers.speed = speed;
  multipliers.attack = attack;
  multipliers.armor = armor;
  return multipliers;
}

export function hasStatusEffect(enemy: Enemy, name: StatusEffectName, time: number) {
  const removedExpired = removeExpiredStatusEffects(enemy, time);
  if (enemy.statusEffects.length > 0 || removedExpired) {
    syncStatusVisuals(enemy, time);
  }
  return hasStatusEffectName(enemy, name);
}

export function hasUnexpiredStatusEffect(enemy: Enemy, name: StatusEffectName, time: number) {
  removeExpiredStatusEffects(enemy, time);
  return hasStatusEffectName(enemy, name);
}

export function hasStatusEffectName(enemy: Enemy, name: StatusEffectName) {
  return Boolean(statusEffectByName(enemy, name));
}

export function removeStatusEffect(enemy: Enemy, name: StatusEffectName) {
  let writeIndex = 0;
  let removed = false;
  for (let readIndex = 0; readIndex < enemy.statusEffects.length; readIndex += 1) {
    const effect = enemy.statusEffects[readIndex];
    if (effect.name === name) {
      removed = true;
      continue;
    }

    if (writeIndex !== readIndex) {
      enemy.statusEffects[writeIndex] = effect;
    }
    writeIndex += 1;
  }
  enemy.statusEffects.length = writeIndex;
  if (removed) {
    invalidateStatusVisuals(enemy);
  }
}

export function addFrozenPhysicalDamage(enemy: Enemy, damage: number, time: number) {
  removeExpiredStatusEffects(enemy, time);
  const frozen = statusEffectByName(enemy, "frozen");
  if (!frozen) {
    syncStatusVisuals(enemy, time);
    return false;
  }

  frozen.physicalDamageTaken = (frozen.physicalDamageTaken ?? 0) + damage;
  if (frozen.physicalDamageTaken >= enemy.maxHp * 0.5) {
    removeStatusEffect(enemy, "frozen");
    syncStatusVisuals(enemy, time);
    return true;
  }

  syncStatusVisuals(enemy, time);
  return false;
}

export function isEnemyFlying(enemy: Enemy, time: number) {
  return hasStatusEffect(enemy, "flying", time);
}

export function syncEnemyBodyPosition(enemy: Enemy) {
  enemy.body.setPosition(enemy.x, enemy.y + enemyDisplayOffsetY(enemy));
  invalidateStatusVisuals(enemy);
}

function removeExpiredStatusEffects(enemy: Enemy, time: number) {
  const initialLength = enemy.statusEffects.length;
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < enemy.statusEffects.length; readIndex += 1) {
    const effect = enemy.statusEffects[readIndex];
    if (effect.expiresAt <= time) {
      continue;
    }

    if (writeIndex !== readIndex) {
      enemy.statusEffects[writeIndex] = effect;
    }
    writeIndex += 1;
  }

  if (writeIndex < enemy.statusEffects.length) {
    enemy.statusEffects.length = writeIndex;
  }
  if (writeIndex !== initialLength) {
    invalidateStatusVisuals(enemy);
  }
  return writeIndex !== initialLength;
}

function statusEffectByName(enemy: Enemy, name: StatusEffectName) {
  for (const effect of enemy.statusEffects) {
    if (effect.name === name) {
      return effect;
    }
  }
  return undefined;
}

function syncStatusVisuals(enemy: Enemy, time: number) {
  const cache = enemy.statusMultiplierCache;
  if (cache.visualSyncedAt === time && cache.visualSyncedX === enemy.x && cache.visualSyncedY === enemy.y) {
    return;
  }

  let stasisActive = false;
  let frozenActive = false;
  let powerActive = false;
  let sunderActive = false;
  let flyingActive = false;
  let angelFlyingActive = false;
  let highFlyingActive = false;
  for (const effect of enemy.statusEffects) {
    if (effect.name === "stasis") {
      stasisActive = true;
    } else if (effect.name === "frozen") {
      frozenActive = true;
    } else if (effect.name === "power") {
      powerActive = true;
    } else if (effect.name === "sunder") {
      sunderActive = true;
    } else if (effect.name === "flying") {
      flyingActive = true;
      angelFlyingActive = angelFlyingActive || Boolean(effect.showHalo);
    } else if (effect.name === "highFlying") {
      highFlyingActive = true;
    }
  }
  const archangelActive = enemyFamily(enemy.kind) === "archangelHeptagon";
  const airborneActive = flyingActive || highFlyingActive;
  const haloActive = !archangelActive && (angelFlyingActive || highFlyingActive);
  setVisibleIfChanged(enemy.statusBorder, stasisActive && !frozenActive);
  setVisibleIfChanged(enemy.frozenBorder, frozenActive);
  setVisibleIfChanged(enemy.powerIcon, powerActive);
  setVisibleIfChanged(enemy.sunderIcon, sunderActive);
  setVisibleIfChanged(enemy.flyingHalo, haloActive);
  syncArchangelHalos(enemy, highFlyingActive);
  if (stasisActive) {
    enemy.statusBorder.setStrokeStyle(2, palette.magic, 0.92);
    enemy.statusBorder.setScale(1 + Math.sin(time / 80) * 0.04);
  } else {
    setScaleIfChanged(enemy.statusBorder, 1, 1);
  }
  if (frozenActive) {
    enemy.frozenBorder.setStrokeStyle(3, palette.magic, 0.96);
    enemy.frozenBorder.setScale(1 + Math.sin(time / 95) * 0.035);
  } else {
    setScaleIfChanged(enemy.frozenBorder, 1, 1);
  }
  if (powerActive) {
    enemy.powerIcon.setY(-38 + Math.sin(time / 120) * 2);
  }
  if (sunderActive) {
    enemy.sunderIcon.setY(-56 + Math.sin(time / 125) * 2);
  }
  if (haloActive) {
    enemy.flyingHalo.setStrokeStyle(2, highFlyingActive ? palette.gold : palette.white, 0.94);
    enemy.flyingHalo.setY(-42 + Math.sin(time / 110) * 2);
    enemy.flyingHalo.setScale(1 + Math.sin(time / 150) * 0.05, 1);
  }
  enemy.body.setPosition(enemy.x, enemy.y + enemyDisplayOffsetY(enemy, airborneActive, time));
  cache.visualSyncedAt = time;
  cache.visualSyncedX = enemy.x;
  cache.visualSyncedY = enemy.y;
}

function invalidateStatusVisuals(enemy: Enemy) {
  enemy.statusMultiplierCache.visualSyncedAt = Number.NaN;
}

function setVisibleIfChanged(target: VisibleTarget, visible: boolean) {
  if (target.visible !== visible) {
    target.setVisible(visible);
  }
}

function setScaleIfChanged(target: ScaleTarget, x: number, y = x) {
  if (target.scaleX !== x || target.scaleY !== y) {
    target.setScale(x, y);
  }
}

function enemyDisplayOffsetY(
  enemy: Enemy,
  airborneActive = hasAirborneStatusName(enemy),
  time = 0
) {
  const flyingOffset = airborneActive ? FLYING_DISPLAY_OFFSET_Y + Math.sin(time / 130) * 2 : 0;
  const burrowOffset = enemy.burrowed ? BURROW_DISPLAY_OFFSET_Y : 0;
  return flyingOffset + burrowOffset;
}

function hasAirborneStatusName(enemy: Enemy) {
  for (const effect of enemy.statusEffects) {
    if (effect.name === "flying" || effect.name === "highFlying") {
      return true;
    }
  }
  return false;
}

type HaloVisual = {
  setStrokeStyle(lineWidth: number, color: number, alpha?: number): unknown;
};

type ShapeDataStore = {
  getData(key: string): unknown;
};

function syncArchangelHalos(enemy: Enemy, highFlyingActive: boolean) {
  if (enemyFamily(enemy.kind) !== "archangelHeptagon") {
    return;
  }

  const halos = (enemy.shape as unknown as ShapeDataStore).getData("archangelHalos") as HaloVisual[] | undefined;
  const [outerHalo, innerHalo] = halos ?? [];
  const color = highFlyingActive ? palette.gold : palette.white;
  outerHalo?.setStrokeStyle(2, color, highFlyingActive ? 0.94 : 0.86);
  innerHalo?.setStrokeStyle(2, color, 0.95);
}
