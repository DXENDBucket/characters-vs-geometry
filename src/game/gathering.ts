import { CELL_HEIGHT, CELL_WIDTH } from "../config";
import { towerBehaviorType, towerHasSkillBehavior } from "./towerIdentity";
import { getCardDefinition } from "../registry/cards";
import { makeShiftEffect } from "../render/combatEffects";
import type { Projectile, SkillState, Tower } from "../types";
import type { ProjectileRuntime } from "./projectileRuntime";
import { gainSkillSp, getTowerSkillState, resetSkillCharge, spendSkillSp } from "./skillState";

export const GATHERING_MAX_SP = 10;
export const GATHERING_DURATION = 10_000;
export const GATHERING_TRANSFER_INTERVAL = 100;

export function gatheringIsActive(tower: Tower, time: number) {
  return tower.inPlay && !tower.transient && towerHasSkillBehavior(tower, "j") && time < (tower.skills.gathering?.activeUntil ?? 0);
}

export function gatheringIsReady(tower: Tower, time: number) {
  const state = getTowerSkillState(tower, "gathering");
  return tower.inPlay && towerBehaviorType(tower) === "j" && time >= state.activeUntil && state.sp >= GATHERING_MAX_SP;
}

export function activateGathering(tower: Tower, time: number) {
  if (!gatheringIsReady(tower, time)) return false;
  const state = getTowerSkillState(tower, "gathering");
  spendSkillSp(state, GATHERING_MAX_SP);
  state.activeUntil = time + GATHERING_DURATION;
  syncGatheringVisual(tower, state, time);
  return true;
}

export function updateGathering(tower: Tower, state: SkillState, seconds: number, time: number) {
  if (time >= state.activeUntil) {
    const recoverySeconds = Math.min(seconds, Math.max(0, (time - state.activeUntil) / 1_000));
    gainSkillSp(state, recoverySeconds, GATHERING_MAX_SP);
  }
  syncGatheringVisual(tower, state, time);
}

export function resetGathering(tower: Tower, state: SkillState) {
  resetSkillCharge(state);
  state.activeUntil = 0;
  syncGatheringVisual(tower, state, 0);
}

function syncGatheringVisual(tower: Tower, state: SkillState, time: number) {
  const active = time < state.activeUntil && !tower.routedSkills?.j;
  const rangeAlpha = active ? 0.9 : 0.22;
  if (tower.rangeBorder && tower.rangeBorder.alpha !== rangeAlpha) tower.rangeBorder.setAlpha(rangeAlpha);
  const borderAlpha = !active && state.sp >= GATHERING_MAX_SP ? 0.62 + Math.sin(time / 90) * 0.28 : 1;
  if (tower.border.alpha !== borderAlpha) tower.border.setAlpha(borderAlpha);
}

export function gatherProjectile(
  runtime: ProjectileRuntime,
  sources: Tower[],
  projectile: Projectile,
  previousX: number,
  previousY: number
) {
  if (runtime.battleTime - (projectile.lastGatheredAt ?? -Infinity) < GATHERING_TRANSFER_INTERVAL) return false;
  let source: Tower | undefined;
  for (const tower of sources) {
    if (!gatheringIsActive(tower, runtime.battleTime)) continue;
    for (let direction = -1; direction <= 1; direction += 2) {
      const contact = cellContact(previousX, previousY, projectile.x, projectile.y, tower.x, tower.y + direction * CELL_HEIGHT);
      if (contact !== Infinity) {
        // Resolve every candidate before moving or charging: same-frame contention cancels all pulls.
        if (source && source !== tower) return false;
        source = tower;
        break;
      }
    }
  }
  if (!source) return false;

  projectile.lastGatheredAt = runtime.battleTime;
  const fromY = projectile.y;
  projectile.y = source.y;
  projectile.lane = source.lane;
  projectile.body.setPosition(projectile.x, projectile.y);
  makeShiftEffect(runtime.scene, projectile.x, fromY, projectile.x, projectile.y);
  const definition = getCardDefinition("j");
  runtime.damageTower(source, definition.selfDamage ?? 0, definition.selfDamageType ?? "true");
  return true;
}

// Sweep the whole frame segment so fast shots cannot skip the gathering cell.
function cellContact(fromX: number, fromY: number, toX: number, toY: number, x: number, y: number) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  let enter = 0;
  let exit = 1;
  for (let axis = 0; axis < 2; axis += 1) {
    const start = axis === 0 ? fromX : fromY;
    const delta = axis === 0 ? dx : dy;
    const center = axis === 0 ? x : y;
    const half = (axis === 0 ? CELL_WIDTH : CELL_HEIGHT) / 2;
    if (delta === 0) {
      if (start < center - half || start >= center + half) return Infinity;
      continue;
    }
    const a = (center - half - start) / delta;
    const b = (center + half - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return Infinity;
  }
  return enter;
}
