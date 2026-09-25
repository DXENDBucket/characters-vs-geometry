import type { BossKind } from "../types";
import type { BossState, CreateBossOptions } from "./bossState";
import type { EnemyState } from "./enemyState";
import type { BattleEntities, BattleWorld } from "./battleWorld";
import type { BossSimulationRuntime } from "./bossSimulationRuntime";
import { initializeDodecahedronCompanions, initializeOctahedronSolarBombs } from "./bossSimulation";
import { isDodecahedronBoss, isOctahedronBoss, syncBossBaseStats } from "./bossRules";
import { applyBossPhaseSkillState } from "./bossSkillRules";
import { enemyIsBossCompanion } from "../registry/enemies";
import { forEachSnapshot } from "./iteration";
import { removeBoss, removeEnemy, type UnitLifecycleRuntime } from "./unitLifecycle";
import { detachEnemyHealth } from "./enemyHealth";
import { destroyContainedEnemies } from "./enemyReleaseRules";
import { clearEnemyField } from "./enemyRoster";

export interface BattleEncounterPresentation {
  clearedEnemies(enemies: readonly EnemyState[]): void;
  removeContained(enemy: EnemyState): void;
  resetBoss(boss: BossState, removedCopies: readonly BossState[]): void;
  phaseChanged(phase: number, total: number): void;
  changed(): void;
  breach(): void;
}
export const NO_BATTLE_ENCOUNTER_PRESENTATION: BattleEncounterPresentation = Object.freeze({
  clearedEnemies() {}, removeContained() {}, resetBoss() {}, phaseChanged() {}, changed() {}, breach() {}
});

export interface BattleEncounterRuntime<E extends BattleEntities = BattleEntities> {
  world: BattleWorld<E>;
  bossRuntime(): BossSimulationRuntime;
  lifecycle(): UnitLifecycleRuntime;
  createBoss(kind: BossKind, reduction: number, options: CreateBossOptions): E["boss"];
  clearStorage(): void;
  bossSeen(kind: BossKind): void;
  defeatedBoss(rank: number): void;
  endGame(): void;
}

export class BattleEncounter<E extends BattleEntities = BattleEntities> {
  constructor(private readonly runtime: BattleEncounterRuntime<E>,
    public presentation: BattleEncounterPresentation = NO_BATTLE_ENCOUNTER_PRESENTATION) {}

  spawnBoss(rank?: number) {
    const { world } = this.runtime, { level, difficulty, unlimitedFirepower } = world.options;
    if (!level.bossKind) return;
    const boss = world.boss = this.runtime.createBoss(level.bossKind, difficulty.finalDamageReduction, { rank });
    this.runtime.bossSeen(level.bossKind);
    world.bossHomePosition = { x: boss.x, y: boss.y };
    if (level.bossEndless && isDodecahedronBoss(boss)) initializeDodecahedronCompanions(this.runtime.bossRuntime(), boss);
    if (level.bossEndless && isOctahedronBoss(boss)) initializeOctahedronSolarBombs(this.runtime.bossRuntime(), boss);
    if (world.currentBossPhaseConfig()) {
      world.applyBossPhaseStats(boss);
      applyBossPhaseSkillState(boss, world.bossPhaseIndex);
    } else if (unlimitedFirepower) {
      boss.baseStats.maxHp *= 10;
      syncBossBaseStats(boss);
      boss.hp = boss.finalStats.maxHp;
    }
  }

  bossDefeated(boss: BossState) {
    const { world } = this.runtime, level = world.options.level;
    if (level.bossEndless) {
      this.runtime.defeatedBoss(boss.rank);
      if (isOctahedronBoss(boss)) forEachSnapshot(world.enemies, enemy => {
        if (enemy.kind === "solarBomb") removeEnemy(this.runtime.lifecycle(), enemy, false);
      });
      if (isDodecahedronBoss(boss)) forEachSnapshot(world.enemies, enemy => {
        if (enemyIsBossCompanion(enemy.kind)) removeEnemy(this.runtime.lifecycle(), enemy, false);
      });
      removeBoss(this.runtime.lifecycle(), false);
      this.spawnBoss(boss.rank + 1);
      this.presentation.changed();
      return true;
    }
    const phases = level.bossPhases;
    if (!phases || !world.beginNextBossPhase()) return false;
    this.clearPhaseEnemies();
    this.resetBoss(boss);
    world.applyBossPhaseStats(boss);
    applyBossPhaseSkillState(boss, world.bossPhaseIndex);
    this.presentation.phaseChanged(world.bossPhaseIndex + 1, phases.length);
    this.presentation.changed();
    return true;
  }

  clearPhaseEnemies() {
    this.runtime.clearStorage();
    const enemies: EnemyState[] = [];
    forEachSnapshot(this.runtime.world.enemies, enemy => {
      detachEnemyHealth(enemy);
      enemy.inPlay = false;
      enemies.push(enemy);
      destroyContainedEnemies(enemy, cargo => this.presentation.removeContained(cargo));
    });
    clearEnemyField(this.runtime.world.enemies);
    this.presentation.clearedEnemies(enemies);
  }

  resetBoss(boss: BossState) {
    const copies = boss.octahedronCopies ?? [];
    this.runtime.world.resetBossForPhase(boss);
    this.presentation.resetBoss(boss, copies);
  }

  enemyReachedBase(enemy: EnemyState) {
    const { world } = this.runtime;
    world.registerBreach();
    removeEnemy(this.runtime.lifecycle(), enemy, false);
    this.presentation.breach();
    if (world.baseIntegrity <= 0) {
      this.runtime.endGame();
      return true;
    }
    return false;
  }
}
