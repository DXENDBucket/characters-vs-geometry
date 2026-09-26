import { BASE_INTEGRITY, BOARD_X, BOARD_WIDTH, COLUMNS, CUBE_BOSS_STATS, NATURAL_PRODUCE_AMOUNT,
  NATURAL_PRODUCE_INTERVAL, STARTING_CHARS } from "../config";
import type { CardDefinition, CardId, DifficultyConfig, EdgeTower, LevelConfig, WaveTracker } from "../types";
import type { BossState } from "./bossState";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";
import type { EnemyProjectileState, MortarProjectileState, ProjectileState } from "./projectileState";
import { BATTLE_STEP_MS, type BattleRandom } from "./battleSimulation";
import { syncBossBaseStats } from "./bossRules";
import { BattleEconomy } from "./battleEconomy";
import { enemiesWithPassengers, enemyIsActive } from "./enemyContainerRules";
import { towerBehaviorType } from "./towerIdentity";
import { getProductionAmount } from "./towerRules";
import { TimedCellSeals } from "./timedCellSeals";
import { waveScheduleAction } from "./waves";
import { spawnBattleWave, spawnPeriodicEnemies, type EnemySpawnOptions } from "./waveSpawner";
import { BattleEntityIds } from "./battleEntityIds";
import { BattleEntityIndex } from "./battleEntityGraph";
import { BattleLoadout } from "./battleLoadout";
import { getEnemyDefinition } from "../registry/enemies";
import type { TutorialController, TutorialEnemySpawn } from "./tutorial";
import { createTutorialInteraction } from "./tutorialInteraction";
import { copyTutorialCheckpoint, type TutorialCheckpoint } from "./tutorialState";
import { createBattleLifecycle, restoredBattleLifecycle, type BattleLifecycleState, type BattleResult } from "./battleLifecycle";

export interface BattleEntities {
  tower: TowerState;
  enemy: EnemyState;
  boss: BossState;
  projectile: ProjectileState;
  enemyProjectile: EnemyProjectileState;
  mortar: MortarProjectileState;
}

export interface BattleWorldOptions {
  levelId: string;
  level: LevelConfig;
  difficulty: DifficultyConfig;
  unlimitedFirepower: boolean;
}

export interface BattleWorldProgress {
  bossPhaseIndex: number;
  bossPhaseStartedAt: number;
  bossHomePosition: { x: number; y: number } | null;
  levelElapsed: number;
  battleTime: number;
  cardTime: number;
  nextNaturalProduceAt: number;
  chars: number;
  baseIntegrity: number;
  wave: number;
  waveTracker: WaveTracker | null;
  enemiesDefeated: number;
  towerOrder: number;
}

export interface BattleWaveSystems {
  storedEnemyCount(): number;
  earliestStoredWave(): number;
  completedWaves(waves: number): void;
  completeLevel(): void;
  spawnEnemy(options: EnemySpawnOptions): number;
  sealColumn(column: number): void;
  waveStarted(wave: number, isFlag: boolean): void;
}

// Required system ports preserve the one real simulation path during incremental extraction.
// No defaults silently omit combat when a host forgets to attach a system.
export interface BattleWorldSystems<E extends BattleEntities = BattleEntities> extends BattleWaveSystems {
  updateNullification(time: number, periodic: LevelConfig["periodicTowerNullification"]): void;
  eraseSealedCell(lane: number, column: number): boolean;
  updateLevelAuras(): void;
  sealsChanged(): void;
  syncCopiedTowers(): void;
  updateActions(time: number): void;
  updateTowerSkills(seconds: number, time: number): void;
  updateTowerPush(time: number): void;
  updateTopology(): void;
  syncMirrors(): void;
  updateLevelAurasIfNeeded(): void;
  cardCooldownMultiplier(): number;
  updatePlayerCardClocks?(delta: number): void;
  gainChars(amount: number, x: number, y: number, source?: E["tower"]): void;
  hasTimedProducers: boolean;
  getDefinition(id: CardId): CardDefinition;
  routeProduction(tower: E["tower"]): boolean;
  updateArmingTowers(time: number): void;
  updateStorage(): void;
  updateBoss(seconds: number): void;
  beginProjectileMotion(): void;
  updateEnemies(time: number, seconds: number): void;
  updateTowerAttacks(time: number): void;
  updateCircuit(): void;
  updateTowerProjectiles(seconds: number): void;
  finishProjectileMotion(): void;
  updateEnemyProjectiles(seconds: number): void;
  updateMortarProjectiles(seconds: number): void;
  autoUpgrade(): void;
}

export class BattleWorld<E extends BattleEntities = BattleEntities> implements BattleWorldProgress {
  readonly entityIds = new BattleEntityIds();
  readonly loadout: BattleLoadout;
  readonly economy: BattleEconomy;
  tutorial: TutorialController | null = null;
  tutorialInteraction = createTutorialInteraction();

  indexEntities(state: unknown) { return new BattleEntityIndex<E>(state); }
  towers: E["tower"][] = [];
  enemies: E["enemy"][] = [];
  boss: E["boss"] | null = null;
  projectiles: E["projectile"][] = [];
  enemyProjectiles: E["enemyProjectile"][] = [];
  mortarProjectiles: E["mortar"][] = [];
  edgeTowers: EdgeTower[] = [];
  occupied = new Map<string, E["tower"]>();
  sealedCells = new Set<string>();
  timedCellSeals = new TimedCellSeals();
  bossPhaseIndex = 0;
  bossPhaseStartedAt = 0;
  bossHomePosition: { x: number; y: number } | null = null;
  levelElapsed = 0;
  battleTime = 0;
  cardTime = 0;
  nextNaturalProduceAt = NATURAL_PRODUCE_INTERVAL;
  get chars() { return this.economy.totalChars; }
  set chars(value: number) { this.economy.sharedBalance = value; }
  baseIntegrity = BASE_INTEGRITY;
  wave = 0;
  waveTracker: WaveTracker | null = null;
  enemiesDefeated = 0;
  towerOrder = 0;
  private lifecycle: BattleLifecycleState;
  readonly options: BattleWorldOptions;
  private stepping = false;

  constructor(options: BattleWorldOptions, readonly random: BattleRandom, cards: readonly CardDefinition[] = []) {
    this.loadout = new BattleLoadout(cards);
    this.options = structuredClone(options);
    this.economy = new BattleEconomy(options.level.startingChars ?? (options.levelId.startsWith("1-") ? 300 : STARTING_CHARS));
    this.lifecycle = createBattleLifecycle(!options.unlimitedFirepower);
  }

  get gameOver() { return this.lifecycle.result !== null; }
  get flawlessRun() { return this.lifecycle.flawlessEligible; }
  get result() { return this.lifecycle.result; }
  lifecycleSnapshot() { return this.lifecycle; }

  invalidateFlawless() {
    if (!this.gameOver && this.flawlessRun) this.lifecycle = createBattleLifecycle(false);
  }

  finish(outcome: BattleResult["outcome"]) {
    if (this.gameOver) return false;
    this.lifecycle = Object.freeze({ ...this.lifecycle, result: Object.freeze({ outcome, endedAt: this.battleTime,
      flawless: outcome === "victory" && this.flawlessRun && this.baseIntegrity >= BASE_INTEGRITY && !this.options.level.survival }) });
    return true;
  }

  validateLifecycle(value: unknown, battleTime: number, baseIntegrity: number) {
    const state = restoredBattleLifecycle(value, battleTime, baseIntegrity);
    if ((this.options.unlimitedFirepower && state.flawlessEligible) || (this.options.level.survival && state.result?.flawless)) {
      throw new Error("Battle lifecycle differs from configuration");
    }
    return state;
  }

  restoreLifecycle(value: unknown, battleTime: number, baseIntegrity: number) {
    this.lifecycle = this.validateLifecycle(value, battleTime, baseIntegrity);
  }

  step(systems: BattleWorldSystems<E>) {
    if (this.stepping) throw new Error("Battle world is already stepping");
    if (this.gameOver) return;
    this.stepping = true;
    try {
      const delta = BATTLE_STEP_MS, seconds = delta / 1000;
      this.levelElapsed += delta;
      this.battleTime += delta;
      systems.updateNullification(this.battleTime, this.options.level.periodicTowerNullification);
      if (this.timedCellSeals.update(this.battleTime, (lane, column) => {
        if (systems.eraseSealedCell(lane, column)) systems.updateLevelAuras();
      })) systems.sealsChanged();
      systems.syncCopiedTowers();
      systems.updateActions(this.battleTime);
      systems.updateTowerSkills(seconds, this.battleTime);
      systems.updateTowerPush(this.battleTime);
      systems.updateTopology();
      systems.syncMirrors();
      systems.updateLevelAurasIfNeeded();
      this.cardTime += delta * systems.cardCooldownMultiplier();
      systems.updatePlayerCardClocks?.(delta);
      this.updateNaturalProduction(systems);
      if (systems.hasTimedProducers) this.updateProducers(systems);
      systems.updateArmingTowers(this.battleTime);
      systems.updateStorage();
      systems.updateBoss(seconds);
      systems.beginProjectileMotion();
      systems.updateEnemies(this.battleTime, seconds);
      systems.updateTowerAttacks(this.battleTime);
      systems.updateCircuit();
      systems.updateTowerProjectiles(seconds);
      systems.finishProjectileMotion();
      systems.updateEnemyProjectiles(seconds);
      systems.updateMortarProjectiles(seconds);
      this.tutorial?.update();
      if (!this.tutorial || this.tutorial.usesWaveSchedule) this.updateWaveSchedule(this.levelElapsed, this.battleTime, systems);
      const level = this.options.level;
      if (!this.gameOver && level.periodicEnemySpawns && (level.totalWaves === undefined || this.wave < level.totalWaves)) {
        spawnPeriodicEnemies(this.options.level, this.battleTime - delta, this.battleTime,
          this.wave, this.options.difficulty.finalDamageReduction, options => systems.spawnEnemy(options));
      }
      systems.autoUpgrade();
    } finally { this.stepping = false; }
  }

  effectiveChars(actorId?: string) { return this.economy.available(actorId); }

  gainChars(amount: number, actorId?: string) { return this.economy.gain(amount, actorId); }

  spendChars(amount: number, actorId?: string) { this.economy.spend(amount, actorId); }

  nextTowerOrder() { return this.towerOrder++; }

  registerBreach() {
    if (this.gameOver) return this.result!.outcome === "defeat";
    this.invalidateFlawless();
    this.baseIntegrity = Math.max(0, this.baseIntegrity - 1);
    return this.baseIntegrity <= 0;
  }

  private updateNaturalProduction(systems: Pick<BattleWorldSystems<E>, "gainChars">) {
    while (this.levelElapsed >= this.nextNaturalProduceAt) {
      this.nextNaturalProduceAt += NATURAL_PRODUCE_INTERVAL;
      systems.gainChars(NATURAL_PRODUCE_AMOUNT, 172, 96);
    }
  }

  private updateProducers(systems: BattleWorldSystems<E>) {
    for (const tower of this.towers) {
      if (this.battleTime < tower.nextProduceAt) continue;
      const definition = systems.getDefinition(towerBehaviorType(tower));
      if (!definition.produceEvery || !definition.produceAmount) continue;
      while (this.battleTime >= tower.nextProduceAt) {
        const amount = getProductionAmount(tower, definition);
        tower.nextProduceAt += definition.produceEvery;
        if (!systems.routeProduction(tower)) systems.gainChars(amount, tower.x, tower.y - 28, tower);
      }
    }
  }

  currentBossPhaseConfig() { return this.options.level.bossPhases?.[this.bossPhaseIndex]; }

  activeLevelConfig(): LevelConfig {
    const level = this.options.level, phase = this.currentBossPhaseConfig();
    return phase ? { ...level, enemyKinds: phase.enemyKinds,
      waveWeightCap: phase.waveWeightCap ?? level.waveWeightCap, totalWaves: undefined, endless: true } : level;
  }

  currentPhaseElapsed(levelElapsed: number) { return Math.max(0, levelElapsed - this.bossPhaseStartedAt); }

  updateWaveSchedule(levelElapsed: number, gameTime: number, systems: BattleWaveSystems) {
    const level = this.activeLevelConfig();
    if (level.survival && !level.bossEndless) {
      let earliestWave = Math.min(this.wave + 1, systems.earliestStoredWave());
      for (const enemy of enemiesWithPassengers(this.enemies)) {
        if (enemyIsActive(enemy)) earliestWave = Math.min(earliestWave, enemy.waveNumber);
      }
      systems.completedWaves(Math.max(0, earliestWave - 1));
    }
    const action = waveScheduleAction(level, this.wave, this.waveTracker,
      this.enemies.length + systems.storedEnemyCount(), this.currentPhaseElapsed(levelElapsed));
    if (action === "complete") systems.completeLevel();
    else if (action === "spawn") this.spawnWave(levelElapsed, gameTime, systems);
  }

  spawnWave(levelElapsed: number, gameTime: number, systems: BattleWaveSystems) {
    const level = this.activeLevelConfig(), waveNumber = this.wave + 1;
    this.wave = waveNumber;
    this.waveTracker = spawnBattleWave({ levelConfig: level, difficultyConfig: this.options.difficulty,
      waveNumber, levelElapsed: this.currentPhaseElapsed(levelElapsed), gameTime }, this.random, spawn => systems.spawnEnemy(spawn));
    this.applyWaveStartMechanics(column => systems.sealColumn(column));
    systems.waveStarted(waveNumber, waveNumber % level.wavesPerFlag === 0);
  }

  spawnTutorialWave(spawns: TutorialEnemySpawn[], systems: BattleWaveSystems) {
    const waveNumber = ++this.wave;
    let totalWeight = 0;
    spawns.forEach((spawn, index) => {
      totalWeight += systems.spawnEnemy({ kind: spawn.kind, lane: spawn.lane, waveNumber, time: this.battleTime,
        x: spawn.x ?? BOARD_X + BOARD_WIDTH + 46 + index * 5,
        waveWeight: getEnemyDefinition(spawn.kind).weight, finalDamageReduction: 0 });
    });
    this.waveTracker = { number: waveNumber, totalWeight, defeatedWeight: 0, spawnedAt: this.levelElapsed };
    systems.waveStarted(waveNumber, waveNumber % this.options.level.wavesPerFlag === 0);
  }

  tutorialSnapshot(): TutorialCheckpoint | undefined {
    return this.tutorial ? copyTutorialCheckpoint({ state: this.tutorial.snapshot(), interaction: this.tutorialInteraction }) : undefined;
  }

  validateTutorial(value: TutorialCheckpoint | undefined) {
    if (value === undefined && !this.tutorial) return;
    if (value === undefined || !this.tutorial) throw new Error("Missing or unexpected tutorial checkpoint");
    const checkpoint = copyTutorialCheckpoint(value);
    if (checkpoint.state.kind !== this.tutorial.snapshot().kind) throw new Error("Tutorial checkpoint differs from level");
    return checkpoint;
  }

  restoreTutorial(value: TutorialCheckpoint | undefined) {
    const checkpoint = this.validateTutorial(value);
    if (!checkpoint || !this.tutorial) return;
    this.tutorial.restore(checkpoint.state);
    this.tutorialInteraction = checkpoint.interaction;
  }

  applyWaveStartMechanics(sealColumn: BattleWaveSystems["sealColumn"]) {
    if (this.options.level.specialMechanic !== "rightColumnSeal" || this.wave % 4 !== 0) return;
    const column = COLUMNS - this.wave / 4;
    if (column >= 0 && column < COLUMNS) sealColumn(column);
  }

  beginNextBossPhase() {
    const phases = this.options.level.bossPhases;
    if (!phases || this.bossPhaseIndex + 1 >= phases.length) return false;
    this.bossPhaseIndex += 1;
    this.bossPhaseStartedAt = this.levelElapsed;
    this.waveTracker = null;
    return true;
  }

  resetBossForPhase(boss: BossState) {
    const home = this.bossHomePosition ?? { x: boss.x, y: boss.y };
    boss.x = home.x;
    boss.y = home.y;
    boss.movementAxis = "x";
    boss.movementDirection = -1;
    boss.contactAttackBuffer = 0;
    boss.chargeExpiresAt = 0;
    boss.halfHpTriggered = false;
    boss.criticalHpTriggered = false;
    boss.pendingCriticalSummon = false;
    boss.invincibleUntil = 0;
    boss.bossHasteUntil = 0;
    boss.companionsInitialized = false;
    boss.companionDeathsHandled = 0;
    boss.octahedronCopies = [];
    boss.pendingCopies = [];
    boss.octahedronSolarBombsInitialized = false;
    boss.octahedronSpawn75Triggered = false;
    boss.octahedronSpawn50Triggered = false;
    boss.octahedronSpawn25Triggered = false;
  }

  applyBossPhaseStats(boss: BossState) {
    const phase = this.currentBossPhaseConfig();
    if (!phase) return;
    boss.baseStats.maxHp = phase.maxHp * (this.options.unlimitedFirepower ? 10 : 1);
    const defaults = CUBE_BOSS_STATS[boss.kind];
    boss.baseStats.armor = phase.armor ?? defaults.armor;
    boss.baseStats.magicResistance = phase.magicResistance ?? defaults.magicResistance;
    boss.baseStats.speed = defaults.speed;
    boss.baseStats.finalDamageReduction = 1 - (1 - this.options.difficulty.finalDamageReduction) * (1 - (phase.finalDamageReduction ?? 0));
    syncBossBaseStats(boss);
    boss.hp = boss.finalStats.maxHp;
  }

  progressSnapshot(): BattleWorldProgress {
    return { bossPhaseIndex: this.bossPhaseIndex, bossPhaseStartedAt: this.bossPhaseStartedAt,
      bossHomePosition: this.bossHomePosition, levelElapsed: this.levelElapsed, battleTime: this.battleTime,
      cardTime: this.cardTime, nextNaturalProduceAt: this.nextNaturalProduceAt, chars: this.chars,
      baseIntegrity: this.baseIntegrity, wave: this.wave, waveTracker: this.waveTracker,
      enemiesDefeated: this.enemiesDefeated, towerOrder: this.towerOrder };
  }

  restoreProgress(state: Omit<BattleWorldProgress, "bossPhaseIndex" | "bossPhaseStartedAt" | "bossHomePosition"> &
    Partial<Pick<BattleWorldProgress, "bossPhaseIndex" | "bossPhaseStartedAt" | "bossHomePosition">>) {
    this.bossPhaseIndex = state.bossPhaseIndex ?? 0;
    this.bossPhaseStartedAt = state.bossPhaseStartedAt ?? 0;
    this.bossHomePosition = state.bossHomePosition ?? null;
    this.levelElapsed = state.levelElapsed;
    this.battleTime = state.battleTime;
    this.cardTime = state.cardTime;
    this.nextNaturalProduceAt = state.nextNaturalProduceAt;
    if (!this.economy.individual) this.chars = state.chars;
    this.baseIntegrity = state.baseIntegrity;
    this.wave = state.wave;
    this.waveTracker = state.waveTracker;
    this.enemiesDefeated = state.enemiesDefeated;
    this.towerOrder = state.towerOrder;
  }
}
