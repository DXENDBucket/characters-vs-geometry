import type { TowerState } from "./towerState";
import { towerHasSkillBehavior } from "./towerIdentity";
import { TOWER_SKILLS } from "../data/towerAbilities";
import { inFriendlyRange } from "./towerTopology";

export function redirectOrientedTarget<T extends TowerState>(towers: T[], target: T | undefined, time: number) {
  if (!target?.inPlay) return target;
  let redirect: T | undefined;
  for (const tower of towers) {
    if (!tower.inPlay || tower.transient || !towerHasSkillBehavior(tower, "o") || time >= (tower.skills.orientation?.activeUntil ?? 0)) continue;
    // Already redirected attacks stay locked instead of bouncing between overlapping o towers.
    if (tower === target) return target;
    if (!inFriendlyRange(tower, target, TOWER_SKILLS.o.range.shape.right, TOWER_SKILLS.o.range.shape.cutCorners)) continue;
    if (!redirect || tower.skills.orientation.activeUntil > redirect.skills.orientation.activeUntil ||
      (tower.skills.orientation.activeUntil === redirect.skills.orientation.activeUntil && tower.placedOrder > redirect.placedOrder)) {
      redirect = tower;
    }
  }
  return redirect ?? target;
}
