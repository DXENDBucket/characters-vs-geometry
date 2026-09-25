import { CELL_HEIGHT, FLYING_DISPLAY_OFFSET_Y, palette } from "../config";
import type { Enemy } from "../types";
import { enemyFamily } from "../registry/enemies";
import { hasStatusEffectName } from "../game/rules/statusEffectRules";
import { enemyStatusRevision } from "../game/statusEffects";
import { syncPassengerVisuals } from "../game/enemyContainers";
import { syncPassengerPositionState } from "../game/enemyContainerRules";
import { setPositionIfChanged, setScaleIfChanged, setVisibleIfChanged } from "../game/visualGuards";
import { syncEnemyFacingVisual } from "./enemyFacing";

const BURROW_DISPLAY_OFFSET_Y = CELL_HEIGHT * 0.55;
interface StatusVisualCache { at: number; x: number; y: number; revision: number; reversed?: boolean }
const caches = new WeakMap<Enemy, StatusVisualCache>();

function visualCache(enemy: Enemy) {
  let cache = caches.get(enemy);
  if (!cache) {
    cache = { at: NaN, x: NaN, y: NaN, revision: -1 };
    caches.set(enemy, cache);
  }
  return cache;
}

export function syncEnemyBodyPosition(enemy: Enemy) {
  syncPassengerPositionState(enemy);
  syncEnemyPositionVisual(enemy);
}

export function syncEnemyPositionVisual(enemy: Enemy) {
  setPositionIfChanged(enemy.body, enemy.x, enemy.y + enemyDisplayOffsetY(enemy));
  syncPassengerVisuals(enemy);
  invalidateStatusVisuals(enemy);
}

export function syncEnemyStatusVisuals(enemy: Enemy, time: number) {
  const cache = visualCache(enemy);
  const revision = enemyStatusRevision(enemy);
  if (cache.at === time && cache.x === enemy.x && cache.y === enemy.y && cache.revision === revision) {
    return;
  }

  const reversed = hasStatusEffectName(enemy, "reversed");
  if (cache.reversed !== reversed) {
    cache.reversed = reversed;
    syncEnemyFacingVisual(enemy);
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
  setPositionIfChanged(enemy.body, enemy.x, enemy.y + enemyDisplayOffsetY(enemy, airborneActive, time));
  syncPassengerVisuals(enemy);
  cache.at = time;
  cache.x = enemy.x;
  cache.y = enemy.y;
  cache.revision = revision;
}

function invalidateStatusVisuals(enemy: Enemy) {
  visualCache(enemy).at = Number.NaN;
}

function enemyDisplayOffsetY(
  enemy: Enemy,
  airborneActive = hasAirborneStatusName(enemy),
  time = 0
) {
  if (enemy.parenthesisCarrier) return enemy.parenthesisCarrier.body.y - enemy.y;
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
