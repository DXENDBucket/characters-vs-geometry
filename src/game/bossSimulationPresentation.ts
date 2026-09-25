import type { BossKind } from "../types";
import type { BossState } from "./bossState";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";

export interface BossSimulationPresentation {
  motion(boss: BossState, seconds: number, time: number): void;
  bossDepth(boss: BossState, depth: number): void;
  removeEcho(boss: BossState): void;
  sweepWarning(boss: BossState, time: number): void;
  copyWarnings(boss: BossState, time: number): void;
  companionDepth(enemy: EnemyState, depth: number): void;
  companionPosition(enemy: EnemyState): void;
  companionShape(enemy: EnemyState, boss: BossState, invincible?: boolean, appearance?: "icosahedron"): void;
  promoted(enemy: EnemyState): void;
  collapse(kind: BossKind, x: number, y: number, follow?: EnemyState | TowerState): void;
  laser(x: number, y: number, endX: number): void;
  hit(x: number, y: number): void;
  invincible(x: number, y: number): void;
  haste(x: number, y: number): void;
  wings(x: number, y: number): void;
}
export const NO_BOSS_SIMULATION_PRESENTATION: BossSimulationPresentation = Object.freeze({
  motion() {}, bossDepth() {}, removeEcho() {}, sweepWarning() {}, copyWarnings() {},
  companionDepth() {}, companionPosition() {}, companionShape() {}, promoted() {},
  collapse() {}, laser() {}, hit() {}, invincible() {}, haste() {}, wings() {}
});
