import type Phaser from "phaser";
import type { CubeBoss, DamageType, Enemy, EnemyProjectile, MortarProjectile, Projectile, Tower, WaveTracker } from "../types";
import type { UnitLifecycleRuntime } from "../game/unitLifecycle";
import type { UnitLifecyclePresentation } from "../game/unitLifecyclePresentation";
import type { TowerActionListener } from "../game/towerActions";
import { CELL_WIDTH, CELL_HEIGHT } from "../config";
import { syncCubeBossVisual } from "../bosses/cubeBoss";
import { spawnEnemyAt } from "../game/enemyRuntime";
import { syncEnemyVisualScale } from "../game/enemyBehaviors";
import { syncSolarBombVisual } from "../game/solarBomb";
import { enemyReleasePresentation } from "./enemyRelease";
import { syncHealthBar } from "./towerHealth";
import { syncEnemyPositionVisual } from "./enemyStatus";
import { syncChevronVisual } from "./chevronLeader";
import { syncDelSweepWarning } from "./delSweepWarning";
import { makeBossHitFlash, makeBossInvincibleFlash, makeEnemyInvincibleFlash, makeShockPulse } from "./combatEffects";

export interface LiveUnitLifecycleRuntime {
  enemyHpMultiplier?: () => number;
  onTowerAction?: TowerActionListener;
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  enemyProjectiles: EnemyProjectile[];
  mortarProjectiles: MortarProjectile[];
  occupied: Map<string, Tower>;
  getBoss: () => CubeBoss | null;
  setBoss: (boss: CubeBoss | null) => void;
  getWaveTracker: () => WaveTracker | null;
  bossPhaseIndex: number;
  battleTime: number;
  finalDamageReduction: number;
  onEnemyDefeated: () => void;
  onTowerDamaged: (tower: Tower) => void;
  absorbTowerDamage?: (tower: Tower, damage: number, damageType: DamageType) => number;
  onTowerRemoved?: (tower: Tower) => void;
  onBossDefeated?: (boss: CubeBoss) => boolean;
  endLevel: () => void;
}


export function createUnitLifecyclePresentation(scene: Phaser.Scene): UnitLifecyclePresentation {
  return {
    ...enemyReleasePresentation,
    towerHealth: tower => syncHealthBar(tower as Tower),
    enemyPosition: enemy => syncEnemyPositionVisual(enemy as Enemy),
    enemyScale: enemy => syncEnemyVisualScale(enemy as Enemy),
    enemyForm: enemy => syncChevronVisual(enemy as Enemy),
    solarBomb: enemy => syncSolarBombVisual(enemy as Enemy),
    enemyInvincible: enemy => makeEnemyInvincibleFlash(scene, enemy.x, enemy.y),
    bossHit: (boss, type) => makeBossHitFlash(scene, boss.x, boss.y, type, boss.hitboxWidth, boss.hitboxHeight),
    bossInvincible: boss => makeBossInvincibleFlash(scene, boss.x, boss.y, boss.hitboxWidth, boss.hitboxHeight),
    bossSweepStarted: (boss, time) => {
      syncCubeBossVisual(boss as CubeBoss, time);
      syncDelSweepWarning(boss as CubeBoss, time);
    },
    removeBoss: (parts, animate) => {
      const bodies = parts.map(part => (part as CubeBoss).body);
      if (!animate) { for (const body of bodies) body.destroy(); return; }
      scene.tweens.add({ targets: bodies, alpha: 0, scale: .82, duration: 260, ease: "Quad.easeOut",
        onComplete: () => bodies.forEach(body => body.destroy()) });
    },
    removeEnemy: (enemy, animate) => {
      const body = (enemy as Enemy).body;
      if (animate) scene.tweens.add({ targets: body, alpha: 0, duration: 140, onComplete: () => body.destroy() });
      else body.destroy();
    },
    removeTower: tower => {
      const body = (tower as Tower).body;
      scene.tweens.add({ targets: body, alpha: 0, y: tower.y + 8, duration: 130, onComplete: () => body.destroy() });
    },
    removeProjectile: projectile => (projectile as Projectile | EnemyProjectile | MortarProjectile).body.destroy(),
    slowAuraPulse: tower => makeShockPulse(scene, tower.x, tower.y, CELL_WIDTH * 2.5, CELL_HEIGHT * 2.5)
  };
}

const adapters = new WeakMap<LiveUnitLifecycleRuntime, UnitLifecycleRuntime>();

// Only live factories/restoration enter here. The rules never require a display object.
export function unitLifecycleSimulationRuntime(live: LiveUnitLifecycleRuntime): UnitLifecycleRuntime {
  let adapter = adapters.get(live);
  if (adapter) return adapter;
  adapter = {
    get enemies() { return live.enemies; },
    get towers() { return live.towers; },
    get projectiles() { return live.projectiles; },
    get enemyProjectiles() { return live.enemyProjectiles; },
    get mortarProjectiles() { return live.mortarProjectiles; },
    get occupied() { return live.occupied; },
    get bossPhaseIndex() { return live.bossPhaseIndex; },
    get battleTime() { return live.battleTime; },
    get finalDamageReduction() { return live.finalDamageReduction; },
    getBoss: () => live.getBoss(),
    setBoss: boss => live.setBoss(boss as CubeBoss | null),
    getWaveTracker: () => live.getWaveTracker(),
    spawnEnemy: options => { spawnEnemyAt(live, options); },
    onDetonation: tower => live.onTowerAction?.(tower as Tower, { kind: "detonation" }) ?? false,
    onEnemyDefeated: () => live.onEnemyDefeated(),
    onTowerDamaged: tower => live.onTowerDamaged(tower as Tower),
    absorbTowerDamage: (tower, damage, type) => live.absorbTowerDamage?.(tower as Tower, damage, type) ?? damage,
    onTowerRemoved: tower => live.onTowerRemoved?.(tower as Tower),
    onBossDefeated: boss => live.onBossDefeated?.(boss as CubeBoss) ?? false,
    endLevel: () => live.endLevel(),
    presentation: createUnitLifecyclePresentation(live.scene)
  };
  adapters.set(live, adapter);
  return adapter;
}
