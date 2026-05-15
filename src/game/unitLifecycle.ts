import Phaser from "phaser";
import { makeBossHitFlash } from "../render/combatEffects";
import type { CubeBoss, DamageType, Enemy, Tower, WaveTracker } from "../types";
import { calculateDamage } from "./damage";
import { enemyScaleFromHp } from "./enemyBehaviors";
import { spawnSplitEnemies } from "./enemyRuntime";
import { gridCellKey } from "./targeting";
import { syncTowerHpBar } from "./towers";

export interface UnitLifecycleRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  occupied: Map<string, Tower>;
  getBoss: () => CubeBoss | null;
  setBoss: (boss: CubeBoss | null) => void;
  getWaveTracker: () => WaveTracker | null;
  battleTime: number;
  finalDamageReduction: number;
  onEnemyDefeated: () => void;
  endLevel: () => void;
}

export function damageTower(runtime: UnitLifecycleRuntime, tower: Tower, damage: number, damageType: DamageType) {
  const actualDamage = calculateDamage(damage, damageType, tower.armor, tower.magicResistance);
  tower.hp -= actualDamage;
  syncTowerHpBar(tower);

  if (tower.hp <= 0) {
    removeTower(runtime, tower);
  }
}

export function damageBoss(runtime: UnitLifecycleRuntime, damage: number, damageType: DamageType) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  const actualDamage =
    calculateDamage(damage, damageType, boss.armor, boss.magicResistance) *
    (1 - boss.finalDamageReduction);
  boss.hp -= actualDamage;
  makeBossHitFlash(runtime.scene, boss.x, boss.y, damageType);

  if (boss.hp <= 0) {
    boss.hp = 0;
    removeBoss(runtime);
    runtime.endLevel();
  }
}

export function damageEnemy(runtime: UnitLifecycleRuntime, enemy: Enemy, damage: number, damageType: DamageType) {
  if (!runtime.enemies.includes(enemy)) {
    return;
  }

  const actualDamage =
    calculateDamage(damage, damageType, enemy.armor, enemy.magicResistance) *
    (1 - enemy.finalDamageReduction);
  enemy.hp -= actualDamage;
  const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
  enemy.shape.setScale(enemyScaleFromHp(hpRatio));

  if (enemy.hp <= 0) {
    const waveTracker = runtime.getWaveTracker();
    if (waveTracker?.number === enemy.waveNumber) {
      waveTracker.defeatedWeight += enemy.weight;
    }

    runtime.onEnemyDefeated();
    spawnSplitEnemies(runtime, enemy, runtime.battleTime, runtime.finalDamageReduction);
    removeEnemy(runtime, enemy, true);
  }
}

export function removeBoss(runtime: UnitLifecycleRuntime) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  runtime.setBoss(null);
  runtime.scene.tweens.add({
    targets: boss.body,
    alpha: 0,
    scale: 0.82,
    duration: 260,
    ease: "Quad.easeOut",
    onComplete: () => boss.body.destroy()
  });
}

export function removeEnemy(runtime: UnitLifecycleRuntime, enemy: Enemy, animate: boolean) {
  Phaser.Utils.Array.Remove(runtime.enemies, enemy);
  if (animate) {
    runtime.scene.tweens.add({
      targets: enemy.body,
      alpha: 0,
      duration: 140,
      onComplete: () => enemy.body.destroy()
    });
    return;
  }

  enemy.body.destroy();
}

export function removeTower(runtime: UnitLifecycleRuntime, tower: Tower) {
  Phaser.Utils.Array.Remove(runtime.towers, tower);
  runtime.occupied.delete(gridCellKey(tower.lane, tower.column));
  runtime.scene.tweens.add({
    targets: tower.body,
    alpha: 0,
    y: tower.y + 8,
    duration: 130,
    onComplete: () => tower.body.destroy()
  });
}
