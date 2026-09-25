import { CELL_HEIGHT, CELL_WIDTH } from "../config";
import { towerHasSkillBehavior } from "./towerIdentity";
import { getCardDefinition } from "../registry/cardDefinitions";
import type { TowerState as Tower } from "./towerState";
import type { ProjectileState as Projectile, EnemyProjectileState as EnemyProjectile } from "./projectileState";
import type { ProjectileRuntime } from "./projectileRuntime";

export const GATHERING_TRANSFER_INTERVAL = 100;

export function gatheringIsActive(tower: Tower, time: number) {
  return tower.inPlay && !tower.transient && towerHasSkillBehavior(tower, "j") && time < (tower.skills.gathering?.activeUntil ?? 0);
}

export function gatherProjectile(
  runtime: Pick<ProjectileRuntime, "battleTime" | "damageTower" | "presentation">,
  sources: Tower[],
  projectile: Projectile | EnemyProjectile,
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
  if ("sourceLane" in projectile) projectile.sourceLane = source.lane;
  else projectile.lane = source.lane;
  runtime.presentation.position(projectile);
  runtime.presentation.shift(projectile.x, fromY, projectile.x, projectile.y);
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
