import type { DamageType, EnemyKind, Tower } from "../types";
import type { ImitationBehavior, TowerActionEvent } from "./towerActions";
import type { BossState } from "./bossState";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";

export type TowerVolleyAction = { type: "volley"; tower: TowerState; hitCount: number; copyRevision?: number; behavior?: ImitationBehavior };
export type TowerShockAction = { type: "shock"; tower: TowerState; x: number; y: number; rangeX: number; rangeY: number; damage: number; damageType: DamageType };
export type TowerSpellMortarAction = { type: "spellMortar"; tower: TowerState; targetX: number; targetY: number; damage: number; damageType: DamageType };

export type EnemyAttackAction = {
  type: "enemyShot" | "enemyLaser" | "enemyMortar"; enemy: EnemyState; time: number; hitCount: number;
};

export type BossAttackAction =
  | { type: "bossReinforcements"; boss: BossState; kind: EnemyKind; lanes: readonly number[]; icosahedron?: boolean }
  | { type: "companionLaser" | "companionMortar"; boss: BossState; companion: EnemyState; hitCount: number }
  | { type: "bossDeathLaser"; boss: BossState; laneRadius: number; hitCount: number }
  | { type: "bossDeathMortar"; boss: BossState; target: TowerState };

export type BattleAction =
  | BossAttackAction
  | EnemyAttackAction
  | { type: "imitation"; tower: Tower; behavior: ImitationBehavior; event: TowerActionEvent }
  | TowerVolleyAction
  | { type: "targetedEffect"; tower: TowerState }
  | TowerShockAction
  | TowerSpellMortarAction;

export type ScheduleBattleAction = (delay: number, action: BattleAction) => void;
export interface ScheduledBattleAction { at: number; action: BattleAction }

export class BattleActionQueue {
  private pending: ScheduledBattleAction[] = [];

  schedule(now: number, delay: number, action: BattleAction) {
    this.pending.push({ at: now + Math.max(0, delay), action });
  }

  update(now: number, execute: (action: BattleAction) => void) {
    if (this.pending.length === 0) return;
    const ready: ScheduledBattleAction[] = [];
    let writeIndex = 0;
    for (const entry of this.pending) {
      if (entry.at <= now) ready.push(entry);
      else this.pending[writeIndex++] = entry;
    }
    this.pending.length = writeIndex;
    ready.sort((a, b) => a.at - b.at);
    for (const entry of ready) execute(entry.action);
  }

  snapshot() { return this.pending.slice(); }
  delayTowerActions(towers: readonly TowerState[], durationMs: number) {
    const paused = new Set(towers);
    for (const entry of this.pending) {
      if ("tower" in entry.action && paused.has(entry.action.tower)) entry.at += durationMs;
    }
  }
  restore(entries: ScheduledBattleAction[]) { this.pending = entries.slice(); }
}
