import type { Tower } from "../types";
import { syncTowerOccupancy } from "./towerOccupancy";

export interface NullifiedTowers {
  startedAt: number;
  expiresAt: number;
  towers: Tower[];
}

interface NullificationRuntime {
  towers: Tower[];
  occupied: Map<string, Tower>;
  suspended: (towers: readonly Tower[], durationMs: number) => void;
  changed: () => void;
}

/** Temporary absence, never removal: no death, erasure or mirror cascade events. */
export class TowerNullificationController {
  private state?: NullifiedTowers;
  private readonly cells = new Set<string>();
  constructor(private readonly runtime: () => NullificationRuntime) {}

  snapshot() { return this.state; }
  isOccupied(lane: number, column: number) { return this.cells.has(`${lane}:${column}`); }

  start(time: number, durationMs: number) {
    if (this.state) return false;
    const runtime = this.runtime();
    const towers = runtime.towers.filter(tower => tower.inPlay);
    this.state = { startedAt: time, expiresAt: time + durationMs, towers };
    for (const tower of towers) {
      this.cells.add(`${tower.lane}:${tower.column}`);
      tower.nullified = true;
      tower.inPlay = false;
      tower.body.setVisible(false);
      pauseTowerTimers(tower, time, durationMs);
    }
    let write = 0;
    for (const tower of runtime.towers) if (!tower.nullified) runtime.towers[write++] = tower;
    runtime.towers.length = write;
    syncTowerOccupancy(runtime.towers, runtime.occupied);
    runtime.suspended(towers, durationMs);
    runtime.changed();
    return true;
  }

  update(time: number) {
    if (!this.state || time < this.state.expiresAt) return;
    const runtime = this.runtime();
    for (const tower of this.state.towers) {
      delete tower.nullified;
      tower.inPlay = true;
      tower.body.setVisible(true);
      runtime.towers.push(tower);
    }
    runtime.towers.sort((a, b) => a.placedOrder - b.placedOrder);
    this.state = undefined;
    this.cells.clear();
    syncTowerOccupancy(runtime.towers, runtime.occupied);
    runtime.changed();
  }

  restore(state?: NullifiedTowers) {
    this.state = state;
    this.cells.clear();
    for (const tower of state?.towers ?? []) {
      tower.nullified = true;
      tower.inPlay = false;
      tower.body.setVisible(false);
      this.cells.add(`${tower.lane}:${tower.column}`);
    }
  }
}

function pauseTowerTimers(tower: Tower, time: number, durationMs: number) {
  tower.lastFire += durationMs;
  for (const key of ["nextProduceAt", "armedAt", "trueDamageUntil", "flyingUntil", "nextInterceptionAt"] as const) {
    const value = tower[key];
    if (value !== undefined && value > time && Number.isFinite(value)) tower[key] = value + durationMs;
  }
  if (tower.healingUpdatedAt !== undefined) tower.healingUpdatedAt += durationMs;
  for (const skill of Object.values(tower.skills)) if (skill.activeUntil > time) skill.activeUntil += durationMs;
  for (const effect of tower.statusEffects) if (effect.expiresAt > time) effect.expiresAt += durationMs;
  for (const [type, until] of Object.entries(tower.routedSkills ?? {})) {
    if (until! > time) tower.routedSkills![type as keyof NonNullable<Tower["routedSkills"]>] = until! + durationMs;
  }
  if (tower.projectileBank) tower.projectileBank.nextAt += durationMs;
  if (tower.projectileNode?.processing) tower.projectileNode.processing.completeAt += durationMs;
  if (tower.moveVisual) tower.moveVisual.startedAt += durationMs;
}
