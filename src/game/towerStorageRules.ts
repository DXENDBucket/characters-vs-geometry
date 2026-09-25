import { CELL_WIDTH } from "../config";
import { addEnemyToField, removeEnemyAt } from "./enemyRoster";
import type { CardDefinition, DamageType } from "../types";
import type { EnemyState as Enemy } from "./enemyState";
import type { TowerState as Tower } from "./towerState";
import { expireReversalEffect } from "./rules/reversal";
import { statusMultipliers } from "./statusEffects";
import { getBlockedEnemies } from "./towerTargeting";
import { towerFacingDirection } from "./towerRules";
import { detachEnemyHealth } from "./enemyHealth";
import { destroyContainedEnemies } from "./enemyReleaseRules";
import { enemyCanBeLoaded, syncPassengerPositionState } from "./enemyContainerRules";

export const ENEMY_STORAGE_DURATION = 5_000;

export interface StorageRuntime<E extends Enemy = Enemy, T extends Tower = Tower> {
  enemies: E[];
  towers: T[];
  occupied: Map<string, T>;
  battleTime: number;
  damageTower(tower: T, damage: number, type: DamageType): void;
}
export interface StoragePresentation {
  visible(enemy: Enemy, visible: boolean): void;
  released(enemy: Enemy): void;
  shift(fromX: number, fromY: number, toX: number, toY: number): void;
  remove(enemy: Enemy): void;
}
export const NO_STORAGE_PRESENTATION: StoragePresentation = Object.freeze({
  visible() {}, released() {}, shift() {}, remove() {}
});

export interface StoredEnemy<E extends Enemy = Enemy, T extends Tower = Tower> {
  enemy: E;
  carrier: T;
  releaseAt: number;
}

export class TowerStorageSimulation<E extends Enemy = Enemy, T extends Tower = Tower> {
  private readonly stored: StoredEnemy<E, T>[] = [];

  constructor(private readonly runtime: () => StorageRuntime<E, T>, public presentation: StoragePresentation = NO_STORAGE_PRESENTATION) {}

  snapshot() { return this.stored.slice(); }
  delayCarriers(towers: readonly T[], durationMs: number) {
    const paused = new Set(towers);
    for (const entry of this.stored) if (paused.has(entry.carrier)) entry.releaseAt += durationMs;
  }
  restore(entries: StoredEnemy<E, T>[]) { this.stored.splice(0, this.stored.length, ...entries); }

  get count() {
    return this.stored.length;
  }

  get earliestWaveNumber() {
    return this.stored.reduce((wave, entry) => Math.min(wave, entry.enemy.waveNumber), Infinity);
  }

  storeBlockedEnemies(tower: T, definition: CardDefinition) {
    if (!tower.inPlay) {
      return;
    }
    const runtime = this.runtime();
    const targets = getBlockedEnemies(tower, runtime.towers, runtime.enemies, runtime.occupied);
    let captured = 0;
    for (const enemy of targets) {
      const index = runtime.enemies.indexOf(enemy);
      if (!enemy.inPlay || index < 0 || !enemyCanBeLoaded(enemy)) {
        continue;
      }
      detachEnemyHealth(enemy);
      removeEnemyAt(runtime.enemies, index);
      enemy.inPlay = false;
      enemy.blockedByTowerId = undefined;
      enemy.blockedSince = undefined;
      this.presentation.visible(enemy, false);
      this.stored.push({ enemy, carrier: tower, releaseAt: runtime.battleTime + ENEMY_STORAGE_DURATION });
      this.presentation.shift(enemy.x, enemy.y, tower.x, tower.y);
      captured += 1;
    }
    for (let index = 0; index < captured && tower.inPlay; index += 1) {
      runtime.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
    }
  }

  update() {
    if (this.stored.length === 0) {
      return;
    }
    const runtime = this.runtime();
    for (let index = 0; index < this.stored.length;) {
      const entry = this.stored[index];
      if (entry.carrier.nullified || entry.releaseAt > runtime.battleTime) {
        index += 1;
        continue;
      }
      this.stored.splice(index, 1);
      const { enemy, carrier } = entry;
      // A removed tower retains its last grid position; removal never loses its cargo.
      expireReversalEffect(carrier, runtime.battleTime);
      enemy.x = carrier.x - towerFacingDirection(carrier) * CELL_WIDTH;
      enemy.y = carrier.y;
      enemy.lane = carrier.lane;
      enemy.blockedByTowerId = undefined;
      enemy.blockedSince = undefined;
      enemy.inPlay = true;
      statusMultipliers(enemy, runtime.battleTime);
      syncPassengerPositionState(enemy);
      this.presentation.released(enemy);
      addEnemyToField(runtime.enemies, enemy);
      this.presentation.shift(carrier.x, carrier.y, enemy.x, enemy.y);
    }
  }

  clear() {
    for (const { enemy } of this.stored) {
      destroyContainedEnemies(enemy, cargo => this.presentation.remove(cargo));
      enemy.inPlay = false;
      this.presentation.remove(enemy);
    }
    this.stored.length = 0;
  }
}
