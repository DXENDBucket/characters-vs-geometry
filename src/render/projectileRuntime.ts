import type Phaser from "phaser";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower } from "../types";
import type { TowerActionListener } from "../game/towerActions";
import type { ProjectileRuntime } from "../game/projectileRuntime";
import type { ProjectileMotionFrame } from "../game/projectileMotion";
import type { SlowAuraSources } from "../game/slowAura";
import type { ProjectilePresentation, ProjectileDisplayState } from "../game/projectilePresentation";
import { createTowerProjectile, createMortarProjectile } from "../game/projectiles";
import { projectileVisualScale } from "../game/projectileIntegrity";
import { updateProjectileTrail } from "./projectileTrail";
import { makeHitShards, makeEnemyHitShards, makeShellBurst, makeIonImpact, makeShiftEffect,
  makeSpellMortarImpact, makeReflectFlash, makeStasisEffect } from "./combatEffects";

export interface LiveProjectileRuntime {
  scene: Phaser.Scene;
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  enemies: Enemy[];
  towers: Tower[];
  occupied: Map<string, Tower>;
  battleTime: number;
  getBoss(): CubeBoss | null;
  damageEnemy(enemy: Enemy, damage: number, damageType: DamageType, source?: Tower): void;
  damageBoss(damage: number, damageType: DamageType, part?: CubeBoss): void;
  damageTower(tower: Tower, damage: number, damageType: DamageType): void;
  routeProjectile?: (projectile: Projectile) => boolean;
  interceptProjectile?: (projectile: EnemyProjectile | MortarProjectile, from: { x: number; y: number }) => boolean;
  onTowerAction?: TowerActionListener;
  projectileMotion?: ProjectileMotionFrame;
  slowAuraSources?: SlowAuraSources;
}

type LiveShot = Projectile | EnemyProjectile | MortarProjectile;
const bodyOf = (projectile: ProjectileDisplayState) => (projectile as LiveShot).body;

export function createProjectilePresentation(scene: Phaser.Scene): ProjectilePresentation {
  return {
    position: projectile => { bodyOf(projectile).setPosition(projectile.x, projectile.y); },
    rotation: (projectile, angle) => { bodyOf(projectile).rotation = angle; },
    mortarPosition: projectile => {
      const body = bodyOf(projectile), progress = projectile.progress;
      body.setPosition(projectile.x, projectile.y);
      body.rotation = progress * Math.PI * 1.4;
      body.setScale(projectileVisualScale(projectile) * (1 + Math.sin(progress * Math.PI) * 0.26));
      updateProjectileTrail(body, projectile.x, projectile.y, progress * projectile.duration);
    },
    remove: projectile => { bodyOf(projectile).destroy(); },
    hit: (x, y, type) => { makeHitShards(scene, x, y, type); },
    enemyHit: (x, y) => { makeEnemyHitShards(scene, x, y); },
    burst: (x, y, radius, type) => { makeShellBurst(scene, x, y, radius, type); },
    ionImpact: (x, y, radius, color) => { makeIonImpact(scene, x, y, radius, color); },
    shift: (x, y, toX, toY) => { makeShiftEffect(scene, x, y, toX, toY); },
    mortarImpact: (x, y, rangeX, rangeY, style) => { makeSpellMortarImpact(scene, x, y, rangeX, rangeY, style); },
    reflect: (x, y) => { makeReflectFlash(scene, x, y); },
    stasis: (x, y) => { makeStasisEffect(scene, x, y); }
  };
}

const adapters = new WeakMap<LiveProjectileRuntime, ProjectileRuntime>();

// Every entity in this adapter comes from the live factories or restored live graph.
// The simulation only sees data; display casts are confined to this boundary.
export function bindProjectileRuntime(live: LiveProjectileRuntime, runtime: ProjectileRuntime) {
  runtime.presentation = projectileSimulationRuntime(live).presentation;
  adapters.set(live, runtime);
}

export function projectileSimulationRuntime(live: LiveProjectileRuntime): ProjectileRuntime {
  let adapter = adapters.get(live);
  if (adapter) return adapter;
  adapter = {
    get projectiles() { return live.projectiles; },
    get enemyProjectiles() { return live.enemyProjectiles; },
    get mortarProjectiles() { return live.mortarProjectiles; },
    get enemies() { return live.enemies; },
    get towers() { return live.towers; },
    get occupied() { return live.occupied; },
    get battleTime() { return live.battleTime; },
    get projectileMotion() { return live.projectileMotion; },
    get slowAuraSources() { return live.slowAuraSources; },
    set slowAuraSources(value) { live.slowAuraSources = value; },
    getBoss: () => live.getBoss(),
    damageEnemy: (enemy, damage, type, source) => live.damageEnemy(enemy as Enemy, damage, type, source as Tower | undefined),
    damageBoss: (damage, type, part) => live.damageBoss(damage, type, part as CubeBoss | undefined),
    damageTower: (tower, damage, type) => live.damageTower(tower as Tower, damage, type),
    routeProjectile: projectile => live.routeProjectile?.(projectile as Projectile) ?? false,
    interceptProjectile: (projectile, from) => live.interceptProjectile?.(projectile as EnemyProjectile | MortarProjectile, from) ?? false,
    onReflection: (tower, projectile) => live.onTowerAction?.(tower as Tower, { kind: "reflection", projectile: projectile as EnemyProjectile | MortarProjectile }),
    createProjectile: spec => createTowerProjectile(live.scene, spec),
    createMortar: spec => createMortarProjectile(live.scene, spec),
    presentation: createProjectilePresentation(live.scene)
  };
  adapters.set(live, adapter);
  return adapter;
}
