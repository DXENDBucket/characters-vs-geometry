import { COLUMNS, LANES } from "../config";
import { allCardDefinitions, getCardDefinition } from "../registry/cardDefinitions";
import type { BossKind, CardDefinition, CardId, EnemyKind } from "../types";
import type { BattleSession, BattleSessionRuntime } from "./battleSession";
import { createBattleControlRuntime } from "./battleControlRuntime";
import { executeBattleControl, type BattleControl, type BattleControlRuntime } from "./battleControls";
import type { SemanticBattleCommand } from "./battleAuthority";
import type { BattleWorldSystems } from "./battleWorld";
import { BattleWorld } from "./battleWorld";
import type { BattleResult } from "./battleLifecycle";
import type { BattleAction, ScheduleBattleAction } from "./battleActions";
import type { TowerActionDataListener } from "./towerActions";
import { createTowerState, type TowerState } from "./towerState";
import { createEnemyState, type CreateEnemyOptions } from "./enemyState";
import { createBossState } from "./bossState";
import { createTowerProjectileState, createHomingTowerProjectileState, createMortarProjectileState,
  type EnemyProjectileState } from "./projectileState";
import type { EnemySpawnOptions } from "./waveSpawner";
import { endlessEnemyHpMultiplier } from "./endlessEnvironment";
import { addEnemyToField } from "./enemyRoster";
import { initializeEnemyHealthLinks } from "./enemyHealth";
import { ProjectileMotionFrame } from "./projectileMotion";
import { TowerExtractionPool } from "./towerExtraction";
import { TowerDeploymentSimulation } from "./towerDeploymentRules";
import { TowerMirrorSimulation } from "./towerMirrorRules";
import { TargetedEffectSimulation } from "./targetedEffectRules";
import { ProjectileCircuitSimulation } from "./projectileCircuitRules";
import { TowerBoardSimulation } from "./towerBoard";
import { TowerShifterSimulation, type AppliedTowerMove } from "./towerShifterRules";
import { TowerPushSimulation } from "./towerPushRules";
import { TowerStorageSimulation } from "./towerStorageRules";
import { TowerNullificationSimulation } from "./towerNullificationRules";
import { TowerSkillSimulation, type TowerSkillSimulationRuntime } from "./towerSkillSimulation";
import { EdgeTowerControls } from "./edgeTowerControls";
import { BattleEncounter } from "./battleEncounter";
import { BattlefieldCells } from "./battlefieldCells";
import { battleCardTime } from "./battleLoadout";
import { deploymentCardId } from "./cardIdentity";
import { towerBehaviorType } from "./towerIdentity";
import { getHitProductionAmount } from "./towerRules";
import { syncTowerTopology, towerCell, physicalTowerCell } from "./towerTopology";
import { expireReversalEffect } from "./rules/reversal";
import { damageTower, damageEnemy, damageBoss, removeTower, settleTowerHealth,
  detonateSlowAuraTower, type UnitLifecycleRuntime } from "./unitLifecycle";
import { advanceTowerAttacks, executeTowerVolley } from "./towerCombat";
import type { TowerAttackRuntime } from "./towerCombatRuntime";
import { advanceEnemies, executeEnemyAttack } from "./enemySimulation";
import type { EnemySimulationRuntime } from "./enemySimulationRuntime";
import { updateBossRuntime, executeBossAttack } from "./bossSimulation";
import type { BossSimulationRuntime } from "./bossSimulationRuntime";
import { triggerShockTower, triggerTrapTower, executeShockPulse, type TriggerTowerRuntime } from "./triggerTowerRules";
import { updateTowerProjectiles, updateEnemyProjectiles, updateMortarProjectiles,
  reflectEnemyAttack, type ProjectileRuntime } from "./projectileRuntime";
import { emitPipelineShot, healPipelineArea, routePipelineTowerAction, type PipelineActionRuntime } from "./pipelineActionRules";
import { slowAuraSources } from "./slowAura";
import { createTutorialController } from "./tutorialRegistry";
import { NO_TOWER_COMBAT_PRESENTATION } from "./towerCombatPresentation";
import { NO_ENEMY_SIMULATION_PRESENTATION } from "./enemySimulationPresentation";
import { NO_BOSS_SIMULATION_PRESENTATION } from "./bossSimulationPresentation";
import { NO_UNIT_LIFECYCLE_PRESENTATION } from "./unitLifecyclePresentation";
import { NO_PROJECTILE_PRESENTATION } from "./projectilePresentation";
import { NO_TRIGGER_TOWER_PRESENTATION } from "./triggerTowerPresentation";
import { NO_TOWER_SKILL_PRESENTATION } from "./towerSkillPresentation";
import type { BattleSaveData } from "./battleSaveState";
import { restoreBattleEntityIds } from "./battleEntityGraph";
import { syncTowerOccupancy } from "./towerOccupancy";
import { deploymentUpgradeTargets, executeBattleOperationRules, type BattleOperationExecutionRuntime } from "./battleOperationRuntime";
import type { BattleOperation, BattlePoint } from "./battleOperations";
import { connectTowerTopology, topologyAffectedTowers } from "./towerTopology";
import { canControlBattleEntity, canLinkBattleOwners } from "./battleOwnership";

// Factories may attach display objects, but must preserve the same authoritative state.
export interface BattleFactories {
  tower: typeof createTowerState;
  enemy: (options: CreateEnemyOptions) => ReturnType<typeof createEnemyState>;
  boss: typeof createBossState;
  projectile: typeof createTowerProjectileState;
  homingProjectile: typeof createHomingTowerProjectileState;
  mortar: typeof createMortarProjectileState;
  enemyProjectile: (state: EnemyProjectileState) => EnemyProjectileState;
}
export interface BattleRuntimeObservers {
  controlChanged?(type: BattleControl["type"]): void;
  debugChars?(amount: number): void;
  debugDamage?(point: BattlePoint): void;
  cards?(): void;
  placement?(): void;
  topology?(): void;
  push?(time: number): void;
  arming?(time: number): void;
  suspended?(): void;
  nullification?(): void;
  production?(amount: number, x: number, y: number): void;
  waveStarted?(wave: number, flag: boolean): void;
  enemySeen?(kind: EnemyKind): void;
  bossSeen?(kind: BossKind): void;
  completedWaves?(waves: number): void;
  defeatedBoss?(rank: number): void;
  finished?(result: BattleResult): void;
  erased?(x: number, y: number): void;
  autoUpgrade?(tower: TowerState, active: boolean): void;
}

const HAS_TIMED_PRODUCERS = allCardDefinitions.some(card => Boolean(card.produceEvery && card.produceAmount));

function extendPorts<B extends object, T extends object>(base: B, value: T): B & T {
  return Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(base), ...Object.getOwnPropertyDescriptors(value) }) as B & T;
}

// The full rule graph is assembled once, with live getters so checkpoint roster replacement is safe.
export class BattleRuntime {
  private actingActor?: string;
  readonly extraction = new TowerExtractionPool();
  readonly projectileMotion = new ProjectileMotionFrame();
  readonly deployment: TowerDeploymentSimulation;
  readonly mirrors: TowerMirrorSimulation;
  readonly targetedEffects: TargetedEffectSimulation;
  readonly circuit: ProjectileCircuitSimulation;
  readonly board: TowerBoardSimulation;
  readonly storage: TowerStorageSimulation;
  readonly nullification: TowerNullificationSimulation;
  readonly shifter: TowerShifterSimulation;
  readonly push: TowerPushSimulation;
  readonly skills: TowerSkillSimulation;
  readonly edgeControls: EdgeTowerControls;
  readonly encounter: BattleEncounter;
  readonly cells: BattlefieldCells;
  readonly lifecycle: UnitLifecycleRuntime;
  readonly combat: TowerAttackRuntime;
  readonly enemies: EnemySimulationRuntime;
  readonly boss: BossSimulationRuntime;
  readonly projectiles: ProjectileRuntime;
  readonly triggers: TriggerTowerRuntime;
  readonly skillRuntime: TowerSkillSimulationRuntime;
  readonly systems: BattleWorldSystems;
  readonly factories: BattleFactories;
  readonly controls: BattleControlRuntime;
  readonly sessionRuntime: BattleSessionRuntime = {
    step: () => this.step(), canAdvance: () => !this.world.gameOver,
    executeCommand: command => {
      if (command.type !== "operation" && command.type !== "control") throw new Error("Legacy input requires a local input adapter");
      this.executeCommand(command);
    }
  };
  readonly schedule: ScheduleBattleAction = (delay, action) => this.session.actions.schedule(this.world.battleTime, delay, action);
  readonly routeTowerAction: TowerActionDataListener = (tower, event) =>
    routePipelineTowerAction(tower, event, this.circuit, this.combat, getCardDefinition);

  constructor(readonly world: BattleWorld, readonly session: BattleSession,
    factories: Partial<BattleFactories> = {}, readonly observers: BattleRuntimeObservers = {}) {
    if (world.random !== session.random) throw new Error("Battle world and session must share one random stream");
    world.economy.initialize(session.policy, session.participants);
    this.factories = {
      tower: createTowerState, enemy: options => createEnemyState(options, () => world.random.next()),
      boss: createBossState, projectile: createTowerProjectileState, homingProjectile: createHomingTowerProjectileState,
      mortar: createMortarProjectileState, enemyProjectile: state => state, ...factories
    };
    const rosters = {
      get towers() { return world.towers; }, get enemies() { return world.enemies; },
      get occupied() { return world.occupied; }, get boss() { return world.boss; },
      get projectiles() { return world.projectiles; }, get enemyProjectiles() { return world.enemyProjectiles; },
      get mortarProjectiles() { return world.mortarProjectiles; }, get battleTime() { return world.battleTime; }
    };
    // Keep own enumerable getters: routed actions clone ports for a single action.
    const ports = <T extends object>(value: T) => extendPorts(rosters, value);
    const createTower: BattleFactories["tower"] = (...args) => {
      const tower = world.entityIds.identify("tower", this.factories.tower(...args));
      if (session.policy.towerAccess === "owner" && this.actingActor) tower.ownerId = this.actingActor;
      return tower;
    };
    const createBoss: BattleFactories["boss"] = (...args) => world.entityIds.identify("boss", this.factories.boss(...args));
    const createProjectile: BattleFactories["projectile"] = spec => world.entityIds.identify("projectile", this.factories.projectile(spec));
    const createHomingProjectile: BattleFactories["homingProjectile"] = spec => world.entityIds.identify("projectile", this.factories.homingProjectile(spec));
    const createMortar: BattleFactories["mortar"] = spec => world.entityIds.identify("mortar", this.factories.mortar(spec));
    const damage: Pick<TowerAttackRuntime, "damageTower" | "damageEnemy" | "damageBoss"> = {
      damageTower: (...args) => damageTower(this.lifecycle, ...args),
      damageEnemy: (...args) => damageEnemy(this.lifecycle, ...args),
      damageBoss: (...args) => damageBoss(this.lifecycle, ...args)
    };
    const movement = ports({
      isCellDeployable: (lane: number, column: number) => this.cellIsDeployable(lane, column),
      onMoved: (moves: AppliedTowerMove[]) => this.towersMoved(moves),
      get cardTime() { return world.battleTime; }
    });
    const placement = ports({
      get cardStates() { return world.loadout.cards; },
      get unlimitedFirepower() { return world.options.unlimitedFirepower; },
      get autoUpgradeEnabled() { return session.controls.autoUpgradeEnabled; },
      get autoUpgradeReserveChars() { return session.controls.reserveChars; },
      extraction: this.extraction, getDefinition: getCardDefinition,
      cardTimeFor: (id: CardId) => battleCardTime(getCardDefinition(id), world),
      getChars: () => world.effectiveChars(this.actingActor), spendChars: (amount: number) => world.spendChars(amount, this.actingActor),
      nextTowerOrder: () => world.nextTowerOrder(),
      isCellDeployable: movement.isCellDeployable, createTower,
      updateLevelAuras: () => this.board.refresh()
    });
    const deploymentPorts = extendPorts(placement, {
      canAutoUpgrade: (tower: TowerState) => !world.economy.individual || tower.ownerId === this.actingActor,
      executeAutoUpgrade: (definition: CardDefinition, target: TowerState) => this.withActor(target.ownerId, () => {
        if (session.policy.towerAccess === "owner") {
          const affected = deploymentUpgradeTargets({ occupied: world.occupied, unlimitedFirepower: world.options.unlimitedFirepower,
            mirrorGroupFor: tower => this.mirrors.mirrorGroupFor(tower) }, definition.id, target);
          if ([...affected].some(tower => !canControlBattleEntity(session.policy, target.ownerId, tower))) return false;
        }
        return this.deployment.useCard(definition, target.lane, target.column) === "deployed";
      }),
      resetTowerSkill: (tower: TowerState) => this.skills.resetTowerSkill(tower),
      mirrorGroupFor: (tower: TowerState) => this.mirrors.mirrorGroupFor(tower)
    });
    this.deployment = new TowerDeploymentSimulation(() => deploymentPorts);
    const mirrorPorts = extendPorts(placement, {
      canLink: (a: TowerState, b: TowerState) => canLinkBattleOwners(session.policy, a, b),
      createTargetedEffectMirror: (source: TowerState, target: TowerState) => this.targetedEffects.createMirroredEffect(source, target)
    });
    this.mirrors = new TowerMirrorSimulation(() => mirrorPorts);
    const targetedPorts = extendPorts(placement, {
      canLink: (a: TowerState, b: TowerState) => canLinkBattleOwners(session.policy, a, b),
      scheduleBattleAction: this.schedule, onTowerAction: this.routeTowerAction,
      removeTower: (tower: TowerState) => this.removeTower(tower),
      runMirrorGroupEvent: (tower: TowerState, action: (member: TowerState) => void) => this.mirrors.runMirrorGroupEvent(tower, action)
    });
    this.targetedEffects = new TargetedEffectSimulation(() => targetedPorts);
    this.shifter = new TowerShifterSimulation(() => movement);
    const pushPorts = extendPorts(movement, {
      authorizeMoves: (source: TowerState, moves: readonly (AppliedTowerMove & { erased: boolean })[]) => {
        if (session.policy.towerAccess !== "owner") return true;
        const changes = new Map(moves.map(move => [move.tower, { lane: move.toLane, column: move.toColumn, inPlay: !move.erased }]));
        const targets = topologyAffectedTowers(world.towers, changes);
        return [...moves.map(move => move.tower), ...targets].every(target => canControlBattleEntity(session.policy, source.ownerId, target));
      },
      onTowerAction: this.routeTowerAction, eraseTower: (tower: TowerState) => this.removeTower(tower)
    });
    this.push = new TowerPushSimulation(() => pushPorts);
    const storagePorts = ports({ damageTower: damage.damageTower });
    this.storage = new TowerStorageSimulation(() => storagePorts);
    const nullificationPorts = ports({
      suspended: (towers: readonly TowerState[], duration: number) => {
        session.actions.delayTowerActions(towers, duration);
        this.storage.delayCarriers(towers, duration);
        observers.suspended?.();
      },
      changed: () => {
        syncTowerTopology(world.towers); this.board.refresh(); this.circuit.sync();
        observers.topology?.(); this.skills.update(0, world.battleTime);
        observers.placement?.(); observers.nullification?.();
      }
    });
    this.nullification = new TowerNullificationSimulation(() => nullificationPorts);
    this.skillRuntime = ports({
      ...damage, presentation: NO_TOWER_SKILL_PRESENTATION, getDefinition: getCardDefinition,
      scheduleBattleAction: this.schedule, onTowerAction: this.routeTowerAction,
      get gameOver() { return world.gameOver; }, get battlePaused() { return session.controls.paused; },
      imitateTowerPush: (tower: TowerState, dl: number, dc: number) => {
        const origin = towerCell(tower), target = physicalTowerCell(tower, { lane: origin.lane + dl, column: origin.column + dc });
        this.push.push(tower, target.lane, target.column, true);
      }
    });
    this.skills = new TowerSkillSimulation(() => this.skillRuntime);
    this.lifecycle = ports({
      presentation: NO_UNIT_LIFECYCLE_PRESENTATION,
      spawnEnemy: (options: EnemySpawnOptions) => { this.spawnEnemy(options); },
      onDetonation: (tower: TowerState) => this.routeTowerAction(tower, { kind: "detonation" }) ?? false,
      getBoss: () => world.boss, setBoss: (boss: typeof world.boss) => { world.boss = boss; },
      getWaveTracker: () => world.waveTracker,
      get bossPhaseIndex() { return world.bossPhaseIndex; }, finalDamageReduction: world.options.difficulty.finalDamageReduction,
      onEnemyDefeated: () => { world.enemiesDefeated++; },
      onTowerDamaged: (tower: TowerState) => this.towerDamaged(tower),
      absorbTowerDamage: (tower, amount, type) => this.circuit.absorbDamage(tower, amount, type),
      onTowerRemoved: (tower: TowerState) => {
        syncTowerTopology(world.towers);
        this.mirrors.handleTowerRemoved(tower, member => this.removeTower(member));
        this.circuit.sync();
      },
      onBossDefeated: boss => this.encounter.bossDefeated(boss),
      endLevel: () => this.finish("victory")
    } satisfies Omit<UnitLifecycleRuntime, keyof typeof rosters>);
    this.combat = ports({
      ...damage, presentation: NO_TOWER_COMBAT_PRESENTATION, createProjectile, createHomingProjectile, createMortar,
      isCellDeployable: movement.isCellDeployable, getDefinition: getCardDefinition,
      scheduleBattleAction: this.schedule, onTowerAction: this.routeTowerAction,
      storeBlockedEnemies: (tower, definition) => this.storage.storeBlockedEnemies(tower, definition),
      gainChars: (amount, x, y, source) => this.gainChars(amount, x, y, source),
      spawnTower: (id, lane, column, level, direction, source) => this.deployment.spawnGeneratedTower(id, lane, column, level, direction, source)
    } satisfies Omit<TowerAttackRuntime, keyof typeof rosters>);
    this.triggers = ports({
      ...damage, presentation: NO_TRIGGER_TOWER_PRESENTATION, getDefinition: getCardDefinition,
      scheduleBattleAction: this.schedule, onTowerAction: this.routeTowerAction,
      get gameOver() { return world.gameOver; }, removeTower: (tower: TowerState) => this.removeTower(tower)
    });
    this.enemies = ports({
      ...damage, presentation: NO_ENEMY_SIMULATION_PRESENTATION, projectileMotion: this.projectileMotion,
      scheduleBattleAction: this.schedule, createMortar,
      createProjectile: state => world.entityIds.identify("enemyProjectile", this.factories.enemyProjectile(state)),
      onRetaliation: (tower, target) => this.routeTowerAction(tower, { kind: "retaliation", target }) ?? false,
      triggerShockTower: tower => this.triggerShockTower(tower),
      triggerTrapTower: (tower, target) => this.triggerTrapTower(tower, target),
      onEnemyReachedBase: enemy => this.encounter.enemyReachedBase(enemy)
    } satisfies Omit<EnemySimulationRuntime, keyof typeof rosters>);
    this.boss = ports({
      ...damage, presentation: NO_BOSS_SIMULATION_PRESENTATION, random: () => world.random.next(),
      createBoss, createMortar, getBoss: () => world.boss,
      get wave() { return world.wave; }, get bossPhaseIndex() { return world.bossPhaseIndex; },
      finalDamageReduction: world.options.difficulty.finalDamageReduction,
      spawnEnemy: (options: EnemySpawnOptions) => { this.spawnEnemy(options); },
      onEnemyPromotion: (kind: EnemyKind) => observers.enemySeen?.(kind),
      scheduleBattleAction: this.schedule,
      nullifyTowers: (duration: number) => { this.nullification.start(world.battleTime, duration); },
      warnCellSeal: (lane, column, warning, duration, leadIn) => this.cells.warnCell(lane, column, warning, duration, leadIn),
      sealCell: (lane, column, duration) => this.cells.sealTimedCell(lane, column, duration),
      triggerShockTower: tower => this.triggerShockTower(tower),
      triggerTrapTower: (tower, target) => this.triggerTrapTower(tower, target),
      endGame: () => this.finish("defeat")
    } satisfies Omit<BossSimulationRuntime, keyof typeof rosters>);
    this.projectiles = ports({
      ...damage, presentation: NO_PROJECTILE_PRESENTATION, projectileMotion: this.projectileMotion,
      createProjectile, createMortar, getBoss: () => world.boss,
      routeProjectile: projectile => this.circuit.capture(projectile),
      interceptProjectile: (projectile, from) => this.circuit.intercept(projectile, from),
      onReflection: (tower, projectile) => this.routeTowerAction(tower, { kind: "reflection", projectile })
    } satisfies Omit<ProjectileRuntime, keyof typeof rosters>);
    const pipelineActions: PipelineActionRuntime = {
      combat: this.combat, trigger: this.triggers, getDefinition: getCardDefinition,
      skill: (tower, event) => this.skills.imitateSkill(tower, event),
      targeted: (type, tower, level) => this.targetedEffects.imitate(type, tower, level),
      detonate: tower => detonateSlowAuraTower(this.lifecycle, tower),
      reflect: (tower, projectile) => reflectEnemyAttack(this.projectiles, tower, projectile, true)
    };
    const circuitPorts = ports({
      get edges() { return world.edgeTowers; }, getDefinition: getCardDefinition,
      emit: ((shot, outlet) => emitPipelineShot(shot, outlet, pipelineActions)) as import("./projectileCircuitRules").CircuitRuntime["emit"],
      heal: (tower: TowerState, amount: number) => healPipelineArea(tower, amount, this.combat)
    });
    this.circuit = new ProjectileCircuitSimulation(() => circuitPorts);
    this.edgeControls = new EdgeTowerControls(() => ({
      edges: world.edgeTowers, card: world.loadout.byId.get("="),
      identify: edge => {
        if (session.policy.towerAccess === "owner" && this.actingActor) edge.ownerId = this.actingActor;
        return world.entityIds.identify("edge", edge);
      },
      time: world.battleTime, cardTime: battleCardTime(getCardDefinition("="), world),
      chars: world.effectiveChars(this.actingActor), autoEnabled: session.controls.autoUpgradeEnabled, reserve: session.controls.reserveChars,
      canAutoUpgrade: edge => !world.economy.individual || edge.ownerId === this.actingActor,
      spend: amount => world.spendChars(amount, this.actingActor), changed: () => { this.circuit.sync(); observers.cards?.(); }
    }));
    const boardPorts = ports({
      getDefinition: getCardDefinition, syncMirrorLevelBonuses: () => this.mirrors.syncMirrorLevelBonuses(),
      settleHealth: () => settleTowerHealth(this.lifecycle), syncCircuits: () => this.circuit.sync()
    });
    this.board = new TowerBoardSimulation(() => boardPorts);
    this.encounter = new BattleEncounter({
      world, bossRuntime: () => this.boss, lifecycle: () => this.lifecycle, createBoss,
      clearStorage: () => this.storage.clear(), bossSeen: kind => observers.bossSeen?.(kind),
      defeatedBoss: rank => observers.defeatedBoss?.(rank), endGame: () => this.finish("defeat")
    });
    this.cells = new BattlefieldCells({
      world, removeTower: tower => this.removeTower(tower), updateLevelAuras: () => this.board.refresh()
    });
    this.systems = {
      updateNullification: (time, periodic) => this.nullification.update(time, periodic),
      eraseSealedCell: (lane, column) => this.cells.eraseCell(lane, column),
      updateLevelAuras: () => this.board.refresh(), sealsChanged: () => observers.placement?.(),
      syncCopiedTowers: () => this.board.syncCopies(),
      updateActions: time => session.actions.update(time, action => this.executeAction(action)),
      updateTowerSkills: (seconds, time) => this.skills.update(seconds, time),
      updateTowerPush: time => observers.push?.(time), updateTopology: () => observers.topology?.(),
      syncMirrors: () => this.mirrors.syncMirrors(), updateLevelAurasIfNeeded: () => this.board.updateIfNeeded(),
      cardCooldownMultiplier: () => this.skills.cardCooldownMultiplier(),
      gainChars: (amount, x, y, source) => this.gainChars(amount, x, y, source), hasTimedProducers: HAS_TIMED_PRODUCERS,
      getDefinition: getCardDefinition, routeProduction: tower => this.routeTowerAction(tower, { kind: "production" }) ?? false,
      updateArmingTowers: time => {
        for (const tower of world.towers) if (tower.statusEffects.length) expireReversalEffect(tower, time);
        observers.arming?.(time);
      },
      updateStorage: () => this.storage.update(), updateBoss: seconds => updateBossRuntime(this.boss, seconds),
      beginProjectileMotion: () => this.projectileMotion.begin(world.projectiles),
      updateEnemies: (time, seconds) => advanceEnemies(this.enemies, time, seconds),
      updateTowerAttacks: time => advanceTowerAttacks(this.combat, time), updateCircuit: () => this.circuit.update(),
      updateTowerProjectiles: seconds => {
        this.projectiles.slowAuraSources = slowAuraSources(world.towers);
        updateTowerProjectiles(this.projectiles, seconds);
      },
      finishProjectileMotion: () => this.projectileMotion.finish(),
      updateEnemyProjectiles: seconds => updateEnemyProjectiles(this.projectiles, seconds),
      updateMortarProjectiles: seconds => {
        this.projectiles.slowAuraSources = slowAuraSources(world.towers);
        updateMortarProjectiles(this.projectiles, seconds);
      },
      autoUpgrade: () => this.autoUpgrade(), storedEnemyCount: () => this.storage.count,
      earliestStoredWave: () => this.storage.earliestWaveNumber, completedWaves: waves => observers.completedWaves?.(waves),
      completeLevel: () => this.finish("victory"), spawnEnemy: options => this.spawnEnemy(options),
      sealColumn: column => this.cells.sealColumn(column), waveStarted: (wave, flag) => observers.waveStarted?.(wave, flag)
    };
    world.tutorial = createTutorialController(world.options.level.specialMechanic, {
      getTowers: () => world.towers, getEnemies: () => world.enemies, getBattleTime: () => world.battleTime,
      getToolState: () => ({
        eraserMode: world.tutorialInteraction.tool === "erase", autoUpgradeMode: world.tutorialInteraction.tool === "autoUpgrade",
        autoUpgradeEnabled: session.controls.autoUpgradeEnabled, shifterMode: world.tutorialInteraction.tool === "shifter",
        shifterReadyRatio: this.shifter.cooldownRatio(),
        shifterSelection: world.towers.filter(tower => tower.inPlay && !tower.nullified && world.tutorialInteraction.selected.includes(tower.entityId!))
      }),
      spawnWave: spawns => world.spawnTutorialWave(spawns, this.systems), finish: () => this.finish("victory")
    });
    this.controls = createBattleControlRuntime(this, () => this.actingActor);
  }

  step() { this.world.step(this.systems); }

  operationRuntime(): BattleOperationExecutionRuntime {
    const world = this.world;
    return {
      towers: world.towers, edges: world.edgeTowers, occupied: world.occupied, cards: world.loadout.cards,
      unlimitedFirepower: world.options.unlimitedFirepower, autoUpgradeEnabled: this.session.controls.autoUpgradeEnabled,
      ended: world.gameOver, actor: id => this.session.actor(id),
      authorize: (actor, op, targets) => [...targets.towers, ...targets.edges, ...this.topologyOperationTargets(op, targets.towers)]
        .every(target => canControlBattleEntity(this.session.policy, actor.id, target)),
      deployment: this.deployment, targetedEffects: this.targetedEffects, edgeControls: this.edgeControls,
      shifter: this.shifter, skills: this.skills, push: this.push,
      topology: { connect: (tower, lane, column) => {
        if (!connectTowerTopology(tower, { lane, column }, world.towers, world.battleTime)) return false;
        this.board.refresh(); this.mirrors.syncMirrors(); this.observers.placement?.(); this.observers.topology?.();
        return true;
      } },
      triggerShockTower: tower => this.triggerShockTower(tower), mirrorGroupFor: tower => this.mirrors.mirrorGroupFor(tower),
      removeTower: tower => this.removeTower(tower), erasedAt: (x, y) => this.observers.erased?.(x, y),
      autoUpgradeChanged: (tower, active) => this.observers.autoUpgrade?.(tower, active),
      refreshPlacement: () => { this.mirrors.syncMirrors(); this.board.refresh(); },
      refreshEdges: () => { this.circuit.sync(); this.observers.cards?.(); },
      updateLevelAuras: () => this.board.refresh(), updateCards: () => this.observers.cards?.(),
      attemptAutoUpgrades: () => this.autoUpgrade()
    };
  }

  executeOperation(actorId: string, operation: BattleOperation) {
    return this.withActor(actorId, () => executeBattleOperationRules(this.operationRuntime(), actorId, operation));
  }

  private withActor<T>(actorId: string | undefined, execute: () => T): T {
    const previous = this.actingActor;
    this.actingActor = actorId;
    try { return execute(); }
    finally { this.actingActor = previous; }
  }

  private topologyOperationTargets(operation: BattleOperation, targets: readonly TowerState[]) {
    if (this.session.policy.towerAccess !== "owner") return [];
    const changes = new Map<TowerState, Partial<TowerState>>();
    if (operation.type === "topology") {
      changes.set(targets[0], { topologyTarget: operation.cell, topologyOrder: this.world.battleTime });
    } else if (operation.type === "erase" || operation.type === "effect" && deploymentCardId(operation.card) === "y") {
      for (const tower of targets) changes.set(tower, { inPlay: false });
    } else if (operation.type === "move") {
      const byId = new Map(this.world.towers.map(tower => [tower.entityId, tower]));
      const sources = operation.sources.map(source => ({ ...source, towerId: byId.get(source.target.id)!.id }));
      const plan = this.shifter.plan({ type: "moveTowers", sources, destination: operation.destination });
      if (plan.valid) for (const move of plan.moves) {
        const tower = this.world.towers.find(value => value.id === move.towerId)!;
        changes.set(tower, { lane: move.toLane, column: move.toColumn });
      }
    } else if (operation.type === "push") {
      for (const move of this.push.plan(targets[0], operation.cell.lane, operation.cell.column)?.moves ?? []) {
        changes.set(move.tower, { lane: move.toLane, column: move.toColumn, inPlay: !move.erased });
      }
    }
    return topologyAffectedTowers(this.world.towers, changes);
  }

  executeControl(actorId: string, control: BattleControl) {
    return this.withActor(actorId, () => executeBattleControl(actorId, control, this.controls));
  }

  executeCommand(command: SemanticBattleCommand) {
    return command.type === "operation" ? this.executeOperation(command.actorId, command.operation) :
      this.executeControl(command.actorId, command.control);
  }

  snapshot(selectedCardId: CardId): BattleSaveData {
    const world = this.world, controls = this.session.controls;
    return {
      ...(world.economy.individual ? { wallets: world.economy.snapshot() } : {}),
      ...(world.tutorial ? { tutorial: world.tutorialSnapshot() } : {}), nullifiedTowers: this.nullification.snapshot(),
      edgeTowers: world.edgeTowers, simulation: { ...this.session.snapshot(), mirrorNextGroupId: this.mirrors.snapshotNextGroupId() },
      ...world.progressSnapshot(), gameSpeed: controls.speed, selectedCardId, debugModeEnabled: controls.debugEnabled,
      cardDeadlines: world.loadout.deadlines(), autoUpgradeEnabled: controls.autoUpgradeEnabled, autoUpgradeReserveChars: controls.reserveChars,
      towers: world.towers, enemies: world.enemies, boss: world.boss, projectiles: world.projectiles,
      enemyProjectiles: world.enemyProjectiles, mortarProjectiles: world.mortarProjectiles,
      actions: this.session.actions.snapshot(), storage: this.storage.snapshot(), shifter: this.shifter.snapshot(),
      reselection: world.loadout.reselection.snapshot(), extraction: this.extraction.value,
      spellMortarFlights: this.skills.snapshotFlights(), sealedCells: [...world.sealedCells],
      timedCellSeals: world.timedCellSeals.snapshot(), entityIds: world.entityIds.snapshot(), lifecycle: world.lifecycleSnapshot()
    };
  }

  // Accept already-decoded state; decoding/hydrating a display graph is an adapter concern.
  restore(state: BattleSaveData) {
    const world = this.world;
    world.validateTutorial(state.tutorial);
    world.validateLifecycle(state.lifecycle, state.battleTime, state.baseIntegrity);
    restoreBattleEntityIds(state, world.entityIds);
    this.session.restore(state.simulation, state.battleTime, {
      paused: false, speed: state.gameSpeed, debugEnabled: state.debugModeEnabled ?? this.session.controls.debugEnabled,
      autoUpgradeEnabled: state.autoUpgradeEnabled, reserveChars: state.autoUpgradeReserveChars
    });
    world.economy.restore(state.chars, state.wallets, this.session.policy, this.session.participants);
    world.restoreProgress(state); world.restoreLifecycle(state.lifecycle, state.battleTime, state.baseIntegrity);
    world.towers = state.towers; this.nullification.restore(state.nullifiedTowers); world.edgeTowers = state.edgeTowers ?? [];
    world.towers = world.towers.filter(tower => {
      if (tower.type !== "=") return true;
      world.gainChars(getCardDefinition("=").cost * tower.level, tower.ownerId);
      tower.inPlay = false; this.lifecycle.presentation.removeTower(tower); return false;
    });
    for (const tower of world.towers) {
      delete tower.numberMemory; delete tower.numberChannels; delete tower.numberValue; delete tower.equationLevel;
      if (!tower.pipelineSkillContexts) {
        if (tower.imitatedSkills?.length) { tower.skills = {}; tower.flyingUntil = 0; }
        delete tower.imitatedSkills; delete tower.imitatedSkillLevels;
      }
    }
    world.enemies = state.enemies; world.boss = state.boss ?? null;
    world.bossHomePosition = state.bossHomePosition ?? (world.boss ? { x: world.boss.x, y: world.boss.y } : null);
    world.projectiles = state.projectiles; world.enemyProjectiles = state.enemyProjectiles; world.mortarProjectiles = state.mortarProjectiles;
    world.occupied.clear(); syncTowerOccupancy(world.towers, world.occupied);
    world.sealedCells = new Set(state.sealedCells); world.timedCellSeals.restore(state.timedCellSeals);
    this.storage.restore(state.storage); this.shifter.restore(state.shifter); world.loadout.reselection.restore(state.reselection);
    this.extraction.restore(state.extraction); this.session.actions.restore(state.actions);
    this.mirrors.restoreGroups(state.simulation?.mirrorNextGroupId); syncTowerTopology(world.towers); this.circuit.sync();
    world.loadout.restoreDeadlines(state.cardDeadlines);
    this.skills.restoreFlights(state.spellMortarFlights);
    world.restoreTutorial(state.tutorial);
  }

  initialize() {
    const lanes = this.world.options.level.deployableLanes;
    if (lanes) for (let lane = 0; lane < LANES; lane++) if (!lanes.includes(lane)) {
      for (let column = 0; column < COLUMNS; column++) this.cells.sealCell(lane, column);
    }
    this.encounter.spawnBoss();
  }

  finish(outcome: BattleResult["outcome"]) {
    if (!this.world.finish(outcome)) return;
    this.observers.finished?.(this.world.result!);
  }

  cellIsDeployable(lane: number, column: number) {
    return lane >= 0 && lane < LANES && column >= 0 && column < COLUMNS &&
      !this.nullification.isOccupied(lane, column) && !this.world.sealedCells.has(`${lane}:${column}`) &&
      !this.world.timedCellSeals.isSealed(lane, column);
  }

  spawnEnemy(options: EnemySpawnOptions) {
    const enemy = this.world.entityIds.identify("enemy", this.factories.enemy({
      ...options, environmentHpMultiplier: endlessEnemyHpMultiplier(this.world.options.level, this.world.wave)
    }));
    addEnemyToField(this.world.enemies, enemy);
    initializeEnemyHealthLinks(enemy, this.world.enemies);
    for (const member of enemy.healthPool?.members ?? []) this.lifecycle.presentation.enemyScale(member);
    this.observers.enemySeen?.(options.kind);
    return options.waveWeight;
  }

  removeTower(tower: TowerState) { removeTower(this.lifecycle, tower); }
  triggerShockTower(tower: TowerState) {
    this.mirrors.runMirrorGroupEvent(tower, member => triggerShockTower(this.triggers, member));
  }
  triggerTrapTower(tower: TowerState, target: Parameters<typeof triggerTrapTower>[2]) {
    this.mirrors.runMirrorGroupEvent(tower, member => triggerTrapTower(this.triggers, member, target));
  }
  towersMoved(moves: AppliedTowerMove[]) {
    syncTowerTopology(this.world.towers);
    this.mirrors.handleTowersShifted(moves, tower => this.removeTower(tower));
    this.board.refresh();
  }
  gainChars(amount: number, x: number, y: number, source?: TowerState) {
    const gained = this.world.gainChars(amount, source?.ownerId);
    this.observers.production?.(Math.floor(gained), x, y);
    this.autoUpgrade();
  }
  autoUpgrade() {
    if (this.world.economy.individual) {
      for (const actorId of this.world.economy.actorIds) this.withActor(actorId, () => this.autoUpgradeCurrentActor());
    } else this.autoUpgradeCurrentActor();
  }
  private autoUpgradeCurrentActor() {
    this.deployment.attemptAutoUpgrades();
    for (const card of this.world.loadout.cards) if (deploymentCardId(card.definition.id) === "=") this.edgeControls.attemptAutoUpgrade(card);
  }
  private towerDamaged(tower: TowerState) {
    const definition = getCardDefinition(towerBehaviorType(tower));
    if (!definition.hitProduceAmount) return;
    const amount = getHitProductionAmount(tower, definition);
    if (amount > 0 && !this.routeTowerAction(tower, { kind: "hitProduction" })) this.gainChars(amount, tower.x, tower.y - 28, tower);
  }
  executeAction(action: BattleAction) {
    if (this.world.gameOver) return;
    switch (action.type) {
      case "imitation": return;
      case "companionLaser": case "companionMortar": case "bossDeathLaser": case "bossDeathMortar": case "bossReinforcements":
        executeBossAttack(this.boss, action); break;
      case "enemyShot": case "enemyLaser": case "enemyMortar": executeEnemyAttack(this.enemies, action); break;
      case "volley": executeTowerVolley(this.combat, action); break;
      case "targetedEffect": this.targetedEffects.resolvePendingEffectCard(action.tower); break;
      case "shock": executeShockPulse(this.triggers, action); break;
      case "spellMortar": this.skills.launchSpellMortar(action); break;
    }
  }
}
