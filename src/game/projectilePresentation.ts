import type { DamageType } from "../types";
import type { ProjectileState, EnemyProjectileState, MortarProjectileState } from "./projectileState";

export type ProjectileDisplayState = ProjectileState | EnemyProjectileState | MortarProjectileState;
export interface MortarImpactStyle {
  color: number;
  marker: "shell" | "text";
  markerText?: string;
  markerTextColor?: string;
  shape?: "circle" | "rectangle";
}

// Presentation is write-only: no combat decision reads a renderer's state or return value.
export interface ProjectilePresentation {
  position(projectile: ProjectileDisplayState): void;
  rotation(projectile: ProjectileState | EnemyProjectileState, angle: number): void;
  mortarPosition(projectile: MortarProjectileState): void;
  remove(projectile: ProjectileDisplayState): void;
  hit(x: number, y: number, damageType: DamageType): void;
  enemyHit(x: number, y: number): void;
  burst(x: number, y: number, radius: number, damageType: DamageType): void;
  ionImpact(x: number, y: number, radius: number, color: number): void;
  shift(fromX: number, fromY: number, toX: number, toY: number): void;
  mortarImpact(x: number, y: number, rangeX: number, rangeY: number, style: MortarImpactStyle): void;
  reflect(x: number, y: number): void;
  stasis(x: number, y: number): void;
}

const noop = () => {};
export const NO_PROJECTILE_PRESENTATION: Readonly<ProjectilePresentation> = Object.freeze({
  position: noop, rotation: noop, mortarPosition: noop, remove: noop, hit: noop, enemyHit: noop,
  burst: noop, ionImpact: noop, shift: noop, mortarImpact: noop, reflect: noop, stasis: noop
});
