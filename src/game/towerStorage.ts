import { CELL_WIDTH } from "../config";
import { makeShiftEffect } from "../render/combatEffects";
import type { CardDefinition, Enemy, Tower } from "../types";
import type { CombatRuntime } from "./combatRuntime";
import { expireReversalEffect } from "./rules/reversal";
import { statusMultipliers, syncEnemyBodyPosition } from "./statusEffects";
import { getBlockedEnemies } from "./targeting";
import { towerFacingDirection } from "./towers";

export const ENEMY_STORAGE_DURATION = 5_000;

type StorageRuntime = Pick<CombatRuntime, "scene" | "enemies" | "towers" | "occupied" | "battleTime" | "damageTower">;

interface StoredEnemy {
  enemy: Enemy;
  carrier: Tower;
  releaseAt: number;
}

export class TowerStorageController {
  private readonly stored: StoredEnemy[] = [];

  constructor(private readonly runtime: () => StorageRuntime) {}

  get count() {
    return this.stored.length;
  }

  get earliestWaveNumber() {
    return this.stored.reduce((wave, entry) => Math.min(wave, entry.enemy.waveNumber), Infinity);
  }

  storeBlockedEnemies(tower: Tower, definition: CardDefinition) {
    if (!tower.inPlay) {
      return;
    }
    const runtime = this.runtime();
    const targets = getBlockedEnemies(tower, runtime.towers, runtime.enemies, runtime.occupied);
    let captured = 0;
    for (const enemy of targets) {
      const index = runtime.enemies.indexOf(enemy);
      if (!enemy.inPlay || index < 0) {
        continue;
      }
      runtime.enemies.splice(index, 1);
      enemy.inPlay = false;
      enemy.blockedByTowerId = undefined;
      enemy.blockedSince = undefined;
      enemy.body.setVisible(false);
      this.stored.push({ enemy, carrier: tower, releaseAt: runtime.battleTime + ENEMY_STORAGE_DURATION });
      makeShiftEffect(runtime.scene, enemy.x, enemy.y, tower.x, tower.y);
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
      if (entry.releaseAt > runtime.battleTime) {
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
      enemy.body.setVisible(true);
      enemy.body.setDepth(60 + enemy.lane);
      statusMultipliers(enemy, runtime.battleTime);
      syncEnemyBodyPosition(enemy);
      runtime.enemies.push(enemy);
      makeShiftEffect(runtime.scene, carrier.x, carrier.y, enemy.x, enemy.y);
    }
  }

  clear() {
    for (const { enemy } of this.stored) {
      destroyStoredEnemy(enemy);
    }
    this.stored.length = 0;
  }
}

function destroyStoredEnemy(enemy: Enemy) {
  for (const cargo of enemy.burrowCargo ?? []) {
    destroyStoredEnemy(cargo);
  }
  enemy.burrowCargo = [];
  enemy.inPlay = false;
  enemy.body.destroy();
}
