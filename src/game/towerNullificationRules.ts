import type { LevelConfig } from "../types";
import type { TowerState as Tower } from "./towerState";
import { syncTowerOccupancy } from "./towerOccupancy";

export interface NullifiedTowers<T extends Tower = Tower> {
  startedAt: number;
  expiresAt: number;
  towers: T[];
}

export interface NullificationRuntime<T extends Tower = Tower> {
  towers: T[];
  occupied: Map<string, T>;
  suspended: (towers: readonly T[], durationMs: number) => void;
  changed: () => void;
}

export interface NullificationPresentation { visible(tower: Tower, visible: boolean): void }
export const NO_NULLIFICATION_PRESENTATION: NullificationPresentation = Object.freeze({ visible() {} });

/** Temporary absence, never removal: no death, erasure or mirror cascade events. */
export class TowerNullificationSimulation<T extends Tower = Tower> {
  private state?: NullifiedTowers<T>;
  private readonly cells = new Set<string>();
  constructor(private readonly runtime: () => NullificationRuntime<T>, public presentation: NullificationPresentation = NO_NULLIFICATION_PRESENTATION) {}

  snapshot() { return this.state; }
  isOccupied(lane: number, column: number) { return this.cells.has(`${lane}:${column}`); }

  start(time: number, durationMs: number, targets?: readonly T[]) {
    if (this.state && !targets) return false;
    const runtime = this.runtime();
    const selected = targets && new Set(targets);
    const towers = runtime.towers.filter(tower => tower.inPlay && (!selected || selected.has(tower)));
    if (!towers.length) return false;
    if (this.state) {
      this.state.towers.push(...towers);
      this.state.expiresAt = Math.max(this.state.expiresAt, time + durationMs);
    } else this.state = { startedAt: time, expiresAt: time + durationMs, towers: [...towers] };
    for (const tower of towers) {
      this.cells.add(`${tower.lane}:${tower.column}`);
      tower.nullified = true;
      tower.nullifiedUntil = time + durationMs;
      tower.inPlay = false;
      this.presentation.visible(tower, false);
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

  update(time: number, periodic?: LevelConfig["periodicTowerNullification"]) {
    this.recover(time);
    if (!periodic) return;
    const due: T[] = [];
    for (const tower of this.runtime().towers) {
      if (!tower.inPlay || tower.transient) continue;
      tower.nextNullificationAt ??= (tower.deployedAt ?? time) + (periodic.initialDelayMs ?? periodic.intervalMs);
      if (time < tower.nextNullificationAt) continue;
      // Keep the deployment-anchored cadence, including time spent in NUL.
      tower.nextNullificationAt += (Math.floor((time - tower.nextNullificationAt) / periodic.intervalMs) + 1) * periodic.intervalMs;
      due.push(tower);
    }
    if (due.length) this.start(time, periodic.durationMs, due);
  }

  private recover(time: number) {
    if (!this.state) return;
    const expired = this.state.towers.filter(tower => time >= (tower.nullifiedUntil ?? this.state!.expiresAt));
    if (!expired.length) return;
    const runtime = this.runtime();
    for (const tower of expired) {
      delete tower.nullified;
      delete tower.nullifiedUntil;
      tower.inPlay = true;
      this.presentation.visible(tower, true);
      runtime.towers.push(tower);
    }
    runtime.towers.sort((a, b) => a.placedOrder - b.placedOrder);
    this.state.towers = this.state.towers.filter(tower => tower.nullified);
    if (!this.state.towers.length) this.state = undefined;
    this.cells.clear();
    for (const tower of this.state?.towers ?? []) this.cells.add(`${tower.lane}:${tower.column}`);
    syncTowerOccupancy(runtime.towers, runtime.occupied);
    runtime.changed();
  }

  restore(state?: NullifiedTowers<T>) {
    this.state = state;
    this.cells.clear();
    for (const tower of state?.towers ?? []) {
      tower.nullifiedUntil ??= state!.expiresAt;
      tower.nullified = true;
      tower.inPlay = false;
      this.presentation.visible(tower, false);
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
