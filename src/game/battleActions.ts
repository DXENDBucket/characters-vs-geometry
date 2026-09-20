import type { CubeBoss, DamageType, Enemy, EnemyKind, Tower } from "../types";
import type { ImitationBehavior, TowerActionEvent } from "./towerActions";

export type BossAttackAction =
  | { type: "bossReinforcements"; boss: CubeBoss; kind: EnemyKind; lanes: readonly number[]; icosahedron?: boolean }
  | { type: "companionLaser" | "companionMortar"; boss: CubeBoss; companion: Enemy; hitCount: number }
  | { type: "bossDeathLaser"; boss: CubeBoss; laneRadius: number; hitCount: number }
  | { type: "bossDeathMortar"; boss: CubeBoss; target: Tower };

export type BattleAction =
  | BossAttackAction
  | { type: "enemyShot" | "enemyLaser" | "enemyMortar"; enemy: Enemy; time: number; hitCount: number }
  | { type: "imitation"; tower: Tower; behavior: ImitationBehavior; event: TowerActionEvent }
  | { type: "volley"; tower: Tower; hitCount: number; copyRevision?: number; behavior?: ImitationBehavior }
  | { type: "targetedEffect"; tower: Tower }
  | { type: "shock"; tower: Tower; x: number; y: number; rangeX: number; rangeY: number; damage: number; damageType: DamageType }
  | { type: "spellMortar"; tower: Tower; targetX: number; targetY: number; damage: number; damageType: DamageType };

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
  restore(entries: ScheduledBattleAction[]) { this.pending = entries.slice(); }
}
