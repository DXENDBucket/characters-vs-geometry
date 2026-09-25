import Phaser from "phaser";
import { clearEnemyField } from "../game/enemyRoster";
import { playSound, soundPlayer } from "../audio/player";
import { bindBattleAudio } from "../audio/battleAudio";
import { canUpgradeTowerWithCard, supportsTowerAutoUpgrade, towerBehaviorType, towerFormType } from "../game/towerIdentity";
import { syncTowerTopology, inFriendlyRange, towerCell, physicalTowerCell } from "../game/towerTopology";
import { TowerTopologyController } from "../game/towerTopologyController";
import { syncFriendlyRangeVisual, syncTowerAutoUpgradeVisual } from "../game/towers";
import { effectiveTowerLevel, getHitProductionAmount, towerFacingDirection } from "../game/towerRules";
import { syncTowerCopies } from "../game/towerCopy";
import { syncTowerFormVisual } from "../game/towers";
import { BATTLE_RULES_VERSION, setBattleRandom, setBattlePlayback } from "../game/battleSimulation";
import { validateReplay, type BattleCommand, type BattlePointer, type BattleReplay } from "../game/battleCommands";
import { createTutorialInteraction, sameTutorialInteraction, type TutorialInteraction } from "../game/tutorialInteraction";
import type { BattleAction, ScheduleBattleAction } from "../game/battleActions";
import { BattleSession, type BattleSessionRuntime } from "../game/battleSession";
import { BattleWorld, type BattleWorldSystems } from "../game/battleWorld";
import { battleChecksum } from "../game/battleChecksum";
import { syncEnemyStatusVisuals } from "../render/enemyStatus";
import { syncHexArmorAuras } from "../render/enemySupport";
import { TimedCellSeals } from "../game/timedCellSeals";
import { drawTimedCellSeals } from "../render/timedCellSeals";
import { createCellSealMark } from "../render/cellSealMark";
import { TowerNullificationController } from "../game/towerNullification";
import { drawNullifiedTowers } from "../render/nullifiedTowers";
import type { BattleSaveState } from "../game/battleSaveState";
import { captureBattleSnapshot } from "../game/captureBattleSnapshot";
import { restoreBattleSnapshot } from "../game/battleSnapshot";
import { setBattleEntityIds } from "../game/battleEntityIds";
import { restoreBattleEntityIds } from "../game/battleEntityGraph";
import { LOCAL_BATTLE_ACTOR, towerOperationRef, edgeOperationRef, validBattleActorId, validBattleOperation,
  type BattleOperation, type BattleOperationResult } from "../game/battleOperations";
import { executeLiveBattleOperation, type LiveBattleOperationRuntime } from "../game/battleOperationRuntime";
import { createBattleControlState, executeBattleControl, validBattleControl, validReserveChars,
  type BattleControl, type BattleControlRuntime } from "../game/battleControls";
import { deleteSurvivalSave, readSurvivalSave, writeSurvivalSave, type SurvivalSave } from "../survivalSaves";
import { endlessEnemyHpMultiplier } from "../game/endlessEnvironment";
import { syncTowerHealthNetworks } from "../game/towerHealth";
import { detachEnemyHealth } from "../game/enemyHealth";
import { destroyContainedEnemies, enemiesWithPassengers } from "../game/enemyContainers";
import { ProjectileCircuitController, edgeAtPoint, edgePosition } from "../game/projectileCircuit";
import { drawCircuitEdges } from "../render/circuitEdges";
import { EdgeTowerControls } from "../game/edgeTowerControls";
import { deploymentCardId, isImitatorCard, uniqueLoadout } from "../game/cardIdentity";
import { createTowerProjectile } from "../game/projectiles";
import { drawTowerShellBorder } from "../render/parenthesisTower";
import { isParenthesisTower, isTowerShellType, syncTowerOccupancy, towerInPlacementLayer } from "../game/towerOccupancy";
import { boardPointerTarget } from "../game/boardPointerTarget";
import { BoardToolPreview, type BoardToolHint } from "../render/boardToolPreview";
import { executePipelineAction, healPipelineArea, pipelineActionSelfCost } from "../game/pipelineActionEffects";
import type { TowerActionEvent } from "../game/towerActions";
import { reflectEnemyAttack } from "../game/projectileRuntime";
import { detonateSlowAuraTower } from "../game/unitLifecycle";
import { drawEnemyHealthLinks } from "../render/enemyHealthLinks";
import { PauseMenu } from "../render/pauseMenu";
import { EncyclopediaPanel } from "../render/encyclopediaPanel";
import { BattleCardList } from "../render/battleCardList";
import { BattlefieldLayer, useBattlefieldCanvas } from "../render/battlefieldLayer";
import { TowerExtractionPool } from "../game/towerExtraction";
import { LoadoutReselection, RESELECT_UNLOCK_LEVEL } from "../game/loadoutReselection";
import { TowerStorageController } from "../game/towerStorage";
import { expireReversalEffect } from "../game/rules/reversal";
import {
  BASE_INTEGRITY,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  CARD_SLOT_COUNT,
  CELL_HEIGHT,
  CELL_WIDTH,
  COLUMNS,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_VERSION,
  DEFAULT_GAME_SPEED,
  GAME_HEIGHT,
  GAME_SPEED_MAX,
  GAME_SPEED_MIN,
  LANES,
  clampDifficulty,
  migrateDifficulty,
  getDifficultyConfig,
  palette
} from "../config";
import { createCubeBoss } from "../bosses/cubeBoss";
import { isDodecahedronBoss, isOctahedronBoss, syncBossBaseStats } from "../game/bossRules";
import { applyBossPhaseSkillState } from "../game/bossSkillRules";
import { clearBossCopyWarnings } from "../render/bossCopyWarnings";
import { enemyIsBossCompanion } from "../registry/enemies";
import { chapterIdForLevelId } from "../data/chapters";
import { getLevelConfig } from "../data/levels";
import { updateBossRuntime, executeBossAttack, initializeDodecahedronCompanions, initializeOctahedronSolarBombs, type BossRuntime } from "../game/bossRuntime";
import { idleCardBehavior, projectileCardBehavior, slowAuraCardBehavior } from "../game/cardBehaviors";
import type { CombatRuntime } from "../game/combatRuntime";
import { advanceEnemies, executeEnemyAttack, spawnEnemyAt } from "../game/enemyRuntime";
import {
  updateEnemyProjectiles,
  updateMortarProjectiles,
  updateTowerProjectiles,
  type ProjectileRuntime
} from "../game/projectileRuntime";
import { forEachSnapshot } from "../game/iteration";
import { ProjectileMotionFrame } from "../game/projectileMotion";
import { gridCellKey } from "../game/targeting";
import { isBossInRect } from "../game/unitGeometry";
import {
  createTower,
  setTowerFacing,
  syncTowerDerivedStats,
  syncTowerFacingVisual,
  syncTowerLevelText,
  syncTowerTrueDamageVisual
} from "../game/towers";
import {
  TargetedEffectCardController,
  type TargetedEffectCardRuntime
} from "../game/targetedEffectCards";
import { TowerDeploymentController, type TowerDeploymentRuntime } from "../game/towerDeployment";
import { MIRROR_COST_LIMIT, TowerMirrorController, type TowerMirrorRuntime } from "../game/towerMirrors";
import { TowerShifterController, type TowerShifterRuntime } from "../game/towerShifter";
import { TowerPushController } from "../game/towerPush";
import { TowerSkillController, type TowerSkillRuntime } from "../game/towerSkills";
import {
  isTutorialMechanic,
  type TutorialController,
  type TutorialEnemySpawn,
  type TutorialRuntime,
  type TutorialToolId
} from "../game/tutorial";
import { createTutorialController, tutorialLoadout } from "../game/tutorialRegistry";
import { towerAuraSources } from "../game/towerAuras";
import { slowAuraSources, type SlowAuraSources } from "../game/slowAura";
import { charsAreSoftcapped } from "../game/charSoftcap";
import {
  damageBoss,
  damageEnemy,
  damageTower,
  removeEnemy,
  removeBoss,
  removeTower,
  settleTowerHealth,
  type UnitLifecycleRuntime
} from "../game/unitLifecycle";
import {
  isShockTower,
  executeShockPulse,
  triggerShockTower as runTriggerShockTower,
  triggerTrapTower as runTriggerTrapTower,
  type TriggerTowerRuntime
} from "../game/triggerTowers";
import { towerFinalStats } from "../game/unitStats";
import { volleyInterval, volleyShotCount } from "../game/upgrades";
import { volleyHitsAt, volleyTimingCount } from "../game/volley";
import { attackIntervalMs } from "../game/attackSpeed";
import { t } from "../i18n";
import { completeLevel, isCardUnlocked, isLevelCompleted, recordBossSeen, recordCompletedWaves, recordDefeatedBossRank, unlockedCardSlotCount } from "../progress";
import { makeEraseMark, makeProductionPulse, makeShellBurst, makeShockPulse, makeTowerPipelineShield } from "../render/combatEffects";
import { createUnitBorder } from "../render/unitShapes";
import {
  updateReselectButtonState,
  updateExtractionPool,
  createGameHud,
  refreshGameHudSettings,
  createGameOverlay,
  showGameOverlay,
  showToast as showUiToast,
  updateCardStates,
  updateGameHud,
  updateToolButtonStates,
  type GameHudElements,
  type GameOverlayElements
} from "../render/gameUi";
import { allCardDefinitions, defaultCardLoadout, getCardBehavior, getCardDefinition, hasCardDefinition } from "../registry/cards";
import { getEnemyDefinition } from "../registry/enemies";
import {
  CONTROL_SLOT_COUNT,
  cardControlAction,
  getKeybindings,
  isDebugToolControlAction,
  keyCodeForEvent,
  slotControlAction,
  toolControlDefinitions,
  type ControlActionId,
  type ToolControlAction
} from "../settings/keybindings";
import { isDebugModeEnabled } from "../settings/preferences";
import type {
  CardDefinition,
  CardId,
  CardState,
  CubeBoss,
  DifficultyConfig,
  Enemy,
  EnemyProjectile,
  EdgeTower,
  MortarProjectile,
  Projectile,
  Tower,
  WaveTracker
} from "../types";

interface PlacementGhostSpec {
  type: CardId;
  lane: number;
  column: number;
}

interface BossHpBarState {
  fillColor: number;
  backColor: number;
  phase: number;
  totalPhases: number;
}

interface LevelAuraTowerSignature {
  id: string;
  type: CardId;
  lane: number;
  column: number;
  level: number;
  transient: boolean;
  mirrorGroupId: number;
}

type DebugDamageMode = "normal" | "super" | null;

const BOSS_PHASE_BAR_COLORS = [palette.heart, 0xff9f43, palette.magic, palette.gold];
const BOSS_PHASE_BAR_BACK = palette.magic;
const BOSS_PHASE_FINAL_BAR_BACK = palette.dim;
const HAS_TIMED_PRODUCER_CARDS = allCardDefinitions.some((definition) =>
  Boolean(definition.produceEvery && definition.produceAmount)
);

type LiveBattleEntities = { tower: Tower; enemy: Enemy; boss: CubeBoss; projectile: Projectile;
  enemyProjectile: EnemyProjectile; mortar: MortarProjectile };

export class GameScene extends Phaser.Scene {
  private world!: BattleWorld<LiveBattleEntities>;
  private worldSystems!: BattleWorldSystems<LiveBattleEntities>;
  private topology!: TowerTopologyController;
  private numbers!: ProjectileCircuitController;
  private get edgeTowers() { return this.world.edgeTowers; }
  private set edgeTowers(value: EdgeTower[]) { this.world.edgeTowers = value; }
  private edgeControls!: EdgeTowerControls;
  private circuitEdges!: Phaser.GameObjects.Graphics;
  private enemyHealthLinks!: Phaser.GameObjects.Graphics;
  private session!: BattleSession;
  private get simulation() { return this.session.clock; }
  private get playback() { return this.session?.playback; }
  private get actionQueue() { return this.session.actions; }
  private readonly sessionRuntime: BattleSessionRuntime = {
    step: () => this.stepBattle(),
    executeCommand: command => this.executeCommand(command),
    canAdvance: () => !this.gameOver && !this.battlePaused && !this.menuOpen && !this.reselectOpen
  };
  private tutorialAdvance?: () => void;
  private rewardEncyclopedia?: EncyclopediaPanel;
  private resumeSave?: SurvivalSave;
  private resumeRequested = false;
  private readonly saveOnPageHide = () => { this.saveSurvivalBattle(); };
  private readonly scheduleBattleAction: ScheduleBattleAction = (delay, action) => {
    this.actionQueue.schedule(this.battleTime, delay, action);
  };
  private levelId = "1-1";
  private chapterId = "1";
  private levelConfig = getLevelConfig("1-1");
  private difficulty = DEFAULT_DIFFICULTY;
  private difficultyConfig = getDifficultyConfig(DEFAULT_DIFFICULTY);
  private unlimitedFirepower = false;
  private selectedCardIds: CardId[] = [...defaultCardLoadout];
  private get levelElapsed() { return this.world.levelElapsed; }
  private set levelElapsed(value: number) { this.world.levelElapsed = value; }
  private get battleTime() { return this.world.battleTime; }
  private set battleTime(value: number) { this.world.battleTime = value; }
  private get cardTime() { return this.world.cardTime; }
  private set cardTime(value: number) { this.world.cardTime = value; }
  private get nextNaturalProduceAt() { return this.world.nextNaturalProduceAt; }
  private set nextNaturalProduceAt(value: number) { this.world.nextNaturalProduceAt = value; }
  private cardStates: CardState[] = [];
  private cardList?: BattleCardList;
  private battlefield!: BattlefieldLayer;
  private cardStatesById = new Map<CardId, CardState>();
  private selectedCardId: CardId = "X";
  private get towers() { return this.world.towers; }
  private set towers(value: Tower[]) { this.world.towers = value; }
  private get enemies() { return this.world.enemies; }
  private set enemies(value: Enemy[]) { this.world.enemies = value; }
  private get boss() { return this.world.boss; }
  private set boss(value: CubeBoss | null) { this.world.boss = value; }
  private get bossPhaseIndex() { return this.world.bossPhaseIndex; }
  private set bossPhaseIndex(value: number) { this.world.bossPhaseIndex = value; }
  private get bossPhaseStartedAt() { return this.world.bossPhaseStartedAt; }
  private set bossPhaseStartedAt(value: number) { this.world.bossPhaseStartedAt = value; }
  private get bossHomePosition() { return this.world.bossHomePosition; }
  private set bossHomePosition(value: { x: number; y: number } | null) { this.world.bossHomePosition = value; }
  private get projectiles() { return this.world.projectiles; }
  private set projectiles(value: Projectile[]) { this.world.projectiles = value; }
  private get enemyProjectiles() { return this.world.enemyProjectiles; }
  private set enemyProjectiles(value: EnemyProjectile[]) { this.world.enemyProjectiles = value; }
  private get mortarProjectiles() { return this.world.mortarProjectiles; }
  private set mortarProjectiles(value: MortarProjectile[]) { this.world.mortarProjectiles = value; }
  private get occupied() { return this.world.occupied; }
  private set occupied(value: Map<string, Tower>) { this.world.occupied = value; }
  private get sealedCells() { return this.world.sealedCells; }
  private set sealedCells(value: Set<string>) { this.world.sealedCells = value; }
  private get timedCellSeals() { return this.world.timedCellSeals; }
  private set timedCellSeals(value: TimedCellSeals) { this.world.timedCellSeals = value; }
  private timedCellSealGraphics!: Phaser.GameObjects.Graphics;
  private nullification!: TowerNullificationController;
  private nullifiedTowerGraphics!: Phaser.GameObjects.Graphics;
  private timedCellWarningGraphics!: Phaser.GameObjects.Graphics;
  private sealedCellMarks = new Map<string, Phaser.GameObjects.Text>();
  // Stored as raw resources; affordability and spending use the softcapped effective value.
  private get chars() { return this.world.chars; }
  private set chars(value: number) { this.world.chars = value; }
  private get baseIntegrity() { return this.world.baseIntegrity; }
  private set baseIntegrity(value: number) { this.world.baseIntegrity = value; }
  private get flawlessRun() { return this.world.flawlessRun; }
  private set flawlessRun(value: boolean) { this.world.flawlessRun = value; }
  private get wave() { return this.world.wave; }
  private set wave(value: number) { this.world.wave = value; }
  private get waveTracker() { return this.world.waveTracker; }
  private set waveTracker(value: WaveTracker | null) { this.world.waveTracker = value; }
  private get enemiesDefeated() { return this.world.enemiesDefeated; }
  private set enemiesDefeated(value: number) { this.world.enemiesDefeated = value; }
  private get towerOrder() { return this.world.towerOrder; }
  private set towerOrder(value: number) { this.world.towerOrder = value; }
  private get gameOver() { return this.world.gameOver; }
  private set gameOver(value: boolean) { this.world.gameOver = value; }
  private controls = createBattleControlState();
  private get battlePaused() { return this.controls.paused; }
  private set battlePaused(value: boolean) { this.controls.paused = value; }
  private get gameSpeed() { return this.controls.speed; }
  private set gameSpeed(value: number) { this.controls.speed = value; }
  private eraserMode = false;
  private levelBonusSnapshotTowers: Tower[] = [];
  private levelBonusSnapshotValues: number[] = [];
  private levelAuraCachedTowers: Tower[] = [];
  private levelAuraCachedStates: LevelAuraTowerSignature[] = [];
  private placementGhosts: Phaser.GameObjects.Container[] = [];
  private toolPreview!: BoardToolPreview;
  private readonly toolHintBuffer: BoardToolHint[] = [];
  private previewCtrlKey?: Phaser.Input.Keyboard.Key;
  private previewShiftKey?: Phaser.Input.Keyboard.Key;
  private placementGhostKey = "";
  private readonly placementGhostSpecBuffer: PlacementGhostSpec[] = [];
  private readonly bossHpBarStateCache: BossHpBarState = {
    fillColor: palette.white,
    backColor: BOSS_PHASE_BAR_BACK,
    phase: 0,
    totalPhases: 0
  };
  private pausedActions: Array<() => void> = [];
  private autoUpgradeMode = false;
  private debugDamageMode: DebugDamageMode = null;
  private get debugModeEnabled() { return this.controls.debugEnabled; }
  private set debugModeEnabled(value: boolean) { this.controls.debugEnabled = value; }
  private get autoUpgradeEnabled() { return this.controls.autoUpgradeEnabled; }
  private set autoUpgradeEnabled(value: boolean) { this.controls.autoUpgradeEnabled = value; }
  private get autoUpgradeReserveChars() { return this.controls.reserveChars; }
  private set autoUpgradeReserveChars(value: number) { this.controls.reserveChars = value; }
  private autoUpgradeReserveInputFocused = false;
  private autoUpgradeReserveDraft = 0;
  private targetedEffects!: TargetedEffectCardController;
  private towerSkills!: TowerSkillController;
  private shifter!: TowerShifterController;
  private towerPush!: TowerPushController;
  private mirrors!: TowerMirrorController;
  private storage!: TowerStorageController;
  private deployment!: TowerDeploymentController;
  private towerSkillRuntimeCache!: TowerSkillRuntime;
  private targetedEffectCardRuntimeCache!: TargetedEffectCardRuntime;
  private towerShifterRuntimeCache!: TowerShifterRuntime;
  private towerMirrorRuntimeCache!: TowerMirrorRuntime;
  private towerDeploymentRuntimeCache!: TowerDeploymentRuntime;
  private combatRuntimeCache!: CombatRuntime;
  private bossRuntimeCache!: BossRuntime;
  private unitLifecycleRuntimeCache!: UnitLifecycleRuntime;
  private projectileRuntimeCache!: ProjectileRuntime;
  private readonly projectileMotion = new ProjectileMotionFrame();
  private triggerTowerRuntimeCache!: TriggerTowerRuntime;
  private tutorial: TutorialController | null = null;
  private tutorialInteraction = createTutorialInteraction();
  private ui!: GameHudElements;
  private overlay!: GameOverlayElements;
  private pauseMenu!: PauseMenu;
  private menuOpen = false;
  private reselectOpen = false;
  private reselection = new LoadoutReselection();
  private extraction = new TowerExtractionPool();
  private reselectShade?: Phaser.GameObjects.Rectangle;
  private readonly scenePointerDownHandler = (pointer: Phaser.Input.Pointer) => this.localInput(() => this.handlePointerDown(pointer));
  private readonly scenePointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
    this.towerSkills.updateSpellMortarReticlePosition(pointer.x, pointer.y);
    this.syncPlacementGhost(pointer);
  };
  private readonly sceneKeyDownHandler = (event: KeyboardEvent) => {
    if (this.rewardEncyclopedia?.isOpen()) {
      if (event.key === "Escape") { event.preventDefault(); this.rewardEncyclopedia.close(); }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (!event.repeat) this.openPauseMenu();
      return;
    }
    this.localInput(() => {
      if (this.handleAutoUpgradeReserveKey(event)) return;
      if (this.handleGameKey(event)) event.preventDefault();
    });
  };

  constructor(key = "GameScene") {
    super(key);
  }

  init(data: { levelId?: string; chapterId?: string; selectedCards?: CardId[]; difficulty?: number; unlimitedFirepower?: boolean; resume?: boolean; seed?: number; replay?: BattleReplay }) {
    const playback = data.replay ? structuredClone(data.replay) : undefined;
    if (playback) {
      validateReplay(playback);
      playback.difficulty = migrateDifficulty(playback.difficulty, playback.difficultyVersion);
      playback.difficultyVersion = DIFFICULTY_VERSION;
      data = { ...data, ...playback, resume: false };
    }
    const seed = (data.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    this.tutorialAdvance = undefined;
    this.tutorialInteraction = createTutorialInteraction();
    this.rewardEncyclopedia = undefined;
    this.resumeRequested = Boolean(data.resume);
    this.resumeSave = data.resume && data.levelId ? readSurvivalSave(data.levelId) : undefined;
    if (this.resumeSave) data = { ...data, difficulty: this.resumeSave.difficulty,
      unlimitedFirepower: this.resumeSave.unlimitedFirepower, selectedCards: this.resumeSave.selectedCards };
    this.levelId = data.levelId ?? "1-1";
    this.chapterId = data.chapterId ?? chapterIdForLevelId(this.levelId);
    this.levelConfig = getLevelConfig(this.levelId);
    this.difficulty = clampDifficulty(data.difficulty);
    const tutorialMechanic = this.levelConfig.specialMechanic;
    const isTutorial = isTutorialMechanic(tutorialMechanic);
    this.unlimitedFirepower = isTutorial ? false : Boolean(data.unlimitedFirepower);
    this.debugModeEnabled = playback?.debug ?? isDebugModeEnabled();
    this.difficultyConfig = this.adjustDifficultyForUnlimitedFirepower(getDifficultyConfig(this.difficulty));
    if (isTutorial) this.difficultyConfig = getDifficultyConfig(1);
    this.selectedCardIds = this.sanitizeLoadout(tutorialLoadout(tutorialMechanic, data.selectedCards), Boolean(playback));
    this.session = new BattleSession({ version: BATTLE_RULES_VERSION, levelId: this.levelId, difficulty: this.difficulty,
      difficultyVersion: DIFFICULTY_VERSION,
      unlimitedFirepower: this.unlimitedFirepower, selectedCards: [...this.selectedCardIds],
      seed, debug: this.debugModeEnabled }, playback);
    setBattleRandom(this, this.session.random);
    setBattlePlayback(this, Boolean(playback));
    this.world = new BattleWorld<LiveBattleEntities>({ levelId: this.levelId, level: this.levelConfig,
      difficulty: this.difficultyConfig, unlimitedFirepower: this.unlimitedFirepower, resumed: !!this.resumeSave }, this.session.random);
    setBattleEntityIds(this, this.world.entityIds);
    this.worldSystems = this.createWorldSystems();
    this.setCardStates([]);
    this.selectedCardId = this.selectedCardIds.includes("X") ? "X" : this.selectedCardIds[0];
    this.sealedCellMarks = new Map<string, Phaser.GameObjects.Text>();
    this.menuOpen = false;
    this.reselectOpen = false;
    this.reselection = new LoadoutReselection();
    this.extraction = new TowerExtractionPool();
    this.reselectShade = undefined;
    this.battlePaused = false;
    this.gameSpeed = DEFAULT_GAME_SPEED;
    this.eraserMode = false;
    this.levelBonusSnapshotTowers.length = 0;
    this.levelBonusSnapshotValues.length = 0;
    this.levelAuraCachedTowers.length = 0;
    this.levelAuraCachedStates.length = 0;
    this.placementGhosts = [];
    this.placementGhostKey = "";
    this.pausedActions = [];
    this.autoUpgradeMode = false;
    this.debugDamageMode = null;
    this.autoUpgradeEnabled = true;
    this.autoUpgradeReserveChars = 0;
    this.autoUpgradeReserveInputFocused = false;
    this.autoUpgradeReserveDraft = 0;
    this.tutorial = null;
    this.targetedEffects = new TargetedEffectCardController(() => this.targetedEffectCardRuntime());
    this.edgeControls = new EdgeTowerControls(() => ({ edges: this.edgeTowers, card: this.cardStatesById.get("="),
      identify: edge => this.world.entityIds.identify("edge", edge),
      time: this.battleTime, cardTime: this.cardTimeFor("="), chars: this.effectiveChars(),
      autoEnabled: this.autoUpgradeEnabled, reserve: this.autoUpgradeReserveChars,
      spend: cost => this.spendChars(cost), changed: () => { this.numbers.sync(); this.updateCards(); } }));
    this.numbers = new ProjectileCircuitController(() => ({ towers: this.towers, edges: this.edgeTowers,
      battleTime: this.battleTime, getDefinition: id => this.getDefinition(id),
      heal: (tower, amount) => healPipelineArea(tower, amount, this.combatRuntime()),
      shielded: (tower, damageType) => makeTowerPipelineShield(this, tower, damageType),
      changed: tower => { syncTowerLevelText(tower); syncTowerAutoUpgradeVisual(tower, this.autoUpgradeEnabled); },
      intercepted: (tower, target) => {
        const flash = this.add.graphics().setDepth(121);
        flash.lineStyle(2, 0x8ce4ba, .85).lineBetween(tower.x, tower.y, target.x, target.y);
        flash.strokeCircle(target.x, target.y, 10);
        this.tweens.add({ targets: flash, alpha: 0, duration: 160, onComplete: () => flash.destroy() });
      },
      emit: (shot, outlet) => {
        if (shot.action) {
          executePipelineAction(shot, outlet, { combat: this.combatRuntime(), trigger: this.triggerTowerRuntime(),
            getDefinition: id => this.getDefinition(id), skill: (tower, event) => { this.towerSkills.imitateSkill(tower, event); },
            targeted: (type, tower, level) => this.targetedEffects.imitate(type, tower, level),
            detonate: tower => detonateSlowAuraTower(this.unitLifecycleRuntime(), tower),
            reflect: (tower, projectile) => reflectEnemyAttack(this.projectileRuntime(), tower, projectile, true) });
          return;
        }
        const direction = towerFacingDirection(outlet), x = outlet.x + direction * 26;
        const projectile = createTowerProjectile(this, { ...shot, x, y: outlet.y, lane: outlet.lane,
          speed: Math.hypot(shot.vx, shot.vy), angleDegrees: Math.atan2(shot.vy, shot.vx * direction) * 180 / Math.PI,
          maxX: x + direction * shot.remainingRange, limitDirection: direction });
        projectile.sourceBehaviorType = shot.sourceBehaviorType;
        projectile.circuitChecked = true;
        this.projectiles.push(projectile);
      } }));
    this.topology = new TowerTopologyController(this, () => ({ towers: this.towers, battleTime: this.battleTime,
      onChanged: () => { this.updateLevelAuras(); this.mirrors.syncMirrors(); this.clearPlacementGhosts(); } }));
    this.towerSkills = new TowerSkillController(this, () => this.towerSkillRuntime());
    this.shifter = new TowerShifterController(() => this.towerShifterRuntime());
    this.towerPush = new TowerPushController(this, () => ({
      ...this.towerShifterRuntime(),
      onTowerAction: this.routeTowerAction,
      eraseTower: tower => removeTower(this.unitLifecycleRuntime(), tower)
    }));
    this.mirrors = new TowerMirrorController(() => this.towerMirrorRuntime());
    this.storage = new TowerStorageController(() => this.combatRuntime());
    this.nullification = new TowerNullificationController(() => ({
      towers: this.towers, occupied: this.occupied,
      suspended: (towers, durationMs) => {
        this.actionQueue.delayTowerActions(towers, durationMs);
        this.storage.delayCarriers(towers, durationMs);
        this.shifter.clearSelection();
        this.cancelSpellMortarTargeting();
        this.towerPush.cancel();
        this.topology.cancel();
      },
      changed: () => {
        syncTowerTopology(this.towers);
        this.updateLevelAuras();
        this.numbers.sync();
        this.topology.update();
        this.towerSkills.update(0, this.battleTime);
        this.clearPlacementGhosts();
        drawNullifiedTowers(this.nullifiedTowerGraphics, this.nullification.snapshot(), this.battleTime);
      }
    }));
    this.deployment = new TowerDeploymentController(() => this.towerDeploymentRuntime());
    this.towerSkillRuntimeCache = this.createTowerSkillRuntime();
    this.targetedEffectCardRuntimeCache = this.createTargetedEffectCardRuntime();
    this.towerShifterRuntimeCache = this.createTowerShifterRuntime();
    this.towerMirrorRuntimeCache = this.createTowerMirrorRuntime();
    this.towerDeploymentRuntimeCache = this.createTowerDeploymentRuntime();
    this.combatRuntimeCache = this.createCombatRuntime();
    this.bossRuntimeCache = this.createBossRuntime();
    this.unitLifecycleRuntimeCache = this.createUnitLifecycleRuntime();
    this.projectileRuntimeCache = this.createProjectileRuntime();
    this.triggerTowerRuntimeCache = this.createTriggerTowerRuntime();
  }

  create() {
    if (this.resumeRequested && !this.resumeSave) {
      this.scene.start("LevelSelectScene", { chapterId: this.chapterId, resumeError: true });
      return;
    }
    this.events.once("shutdown", () => this.cleanupSceneHandlers());
    useBattlefieldCanvas(this);
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBoard();
    this.battlefield = new BattlefieldLayer(this);
    if (this.levelConfig.deployableLanes) {
      for (let lane = 0; lane < LANES; lane++) {
        if (this.levelConfig.deployableLanes.includes(lane)) continue;
        for (let column = 0; column < COLUMNS; column++) this.sealCell(lane, column);
      }
    }
    this.timedCellSealGraphics = this.add.graphics().setDepth(1);
    this.nullifiedTowerGraphics = this.add.graphics().setDepth(28);
    this.timedCellWarningGraphics = this.add.graphics().setDepth(115);
    this.toolPreview = new BoardToolPreview(this);
    this.previewCtrlKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL, false);
    this.previewShiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false);
    this.circuitEdges = this.add.graphics().setDepth(19);
    this.enemyHealthLinks = this.add.graphics().setDepth(59);
    this.ui = this.battlefield.ui(() => createGameHud(this, this.levelId, this.difficulty, {
      onMenu: () => this.openPauseMenu(),
      onDebug: () => this.localInput(() => this.grantDebugChars()),
      onDebugDamage: () => this.localInput(() => this.toggleDebugDamageMode()),
      onSuperDebugDamage: () => this.localInput(() => this.toggleSuperDebugDamageMode()),
      onShifter: () => this.localInput(() => this.toggleShifterMode()),
      onReselect: () => this.openReselection(),
      onAutoUpgrade: () => this.localInput(() => this.toggleAutoUpgradeMode()),
      onAutoUpgradeEnabled: () => this.localInput(() => this.toggleAutoUpgradeEnabled()),
      onAutoUpgradeReserveFocus: () => this.localInput(() => this.focusAutoUpgradeReserveInput()),
      onGameSpeedChange: (speed) => this.localInput(() => this.requestGameSpeed(speed)),
      canChangeGameSpeed: () => !this.localInputBlocked(),
      onErase: () => this.localInput(() => this.toggleEraser())
    }, this.debugModeEnabled));
    this.pauseMenu = new PauseMenu({
      resume: () => this.closePauseMenu(),
      settings: () => {
        this.pauseMenu.hide();
        this.scene.launch("SettingsScene", { onReturn: () => {
          this.refreshBattleSettings();
          this.pauseMenu.show();
        } });
      },
      restart: () => this.scene.restart({
        levelId: this.levelId,
        chapterId: this.chapterId,
        selectedCards: [...this.selectedCardIds],
        difficulty: this.difficulty,
        unlimitedFirepower: this.unlimitedFirepower
      }),
      exit: () => this.handleOverlayAction()
    });
    this.setGameSpeed(this.gameSpeed);
    if (!this.resumeSave && !this.playback?.checkpoint) this.spawnBossIfNeeded();
    this.createCardList();
    this.updateCards();
    this.overlay = this.battlefield.ui(() => createGameOverlay(this, () => this.handleOverlayAction()));
    if (this.resumeSave) {
      try {
        this.applyBattleSave(restoreBattleSnapshot(this, this.resumeSave.graph));
      } catch {
        this.scene.start("LevelSelectScene", { chapterId: this.chapterId, resumeError: true });
        return;
      }
      this.resumeSave = undefined;
    } else if (this.playback?.checkpoint) {
      this.applyBattleSave(restoreBattleSnapshot(this, this.playback.checkpoint));
      this.battlePaused = false;
    } else if (this.levelConfig.survival && !this.playback) {
      deleteSurvivalSave(this.levelId);
    }
    if (isTutorialMechanic(this.levelConfig.specialMechanic)) {
      const runtime: TutorialRuntime = {
        registerAdvance: action => {
          this.tutorialAdvance = action;
          return () => this.localInput(() => { this.requestControl({ type: "tutorialAdvance" }); });
        },
        scene: this,
        getCardState: (id) => this.cardStatesById.get(id),
        getTowers: () => this.towers,
        getEnemies: () => this.enemies,
        getBattleTime: () => this.battleTime,
        getToolBounds: (id) => this.tutorialToolBounds(id),
        getToolState: () => ({
          eraserMode: this.tutorialInteraction.tool === "erase",
          autoUpgradeMode: this.tutorialInteraction.tool === "autoUpgrade",
          autoUpgradeEnabled: this.autoUpgradeEnabled,
          shifterMode: this.tutorialInteraction.tool === "shifter",
          shifterReadyRatio: this.shifter.cooldownRatio(),
          shifterSelection: this.towers.filter(tower => tower.inPlay && !tower.nullified && this.tutorialInteraction.selected.includes(tower.entityId!))
        }),
        spawnWave: (spawns) => this.battlefield.world(() => this.spawnTutorialWave(spawns)),
        finish: () => this.endLevel()
      };
      this.tutorial = this.battlefield.ui(() => createTutorialController(this.levelConfig.specialMechanic, runtime));
    }

    this.input.on("pointerdown", this.scenePointerDownHandler);
    this.input.on("pointermove", this.scenePointerMoveHandler);
    this.input.keyboard?.on("keydown", this.sceneKeyDownHandler);
    window.addEventListener("pagehide", this.saveOnPageHide);
    bindBattleAudio(this, !!this.levelConfig.bossKind, () => ({
      paused: this.battlePaused || this.menuOpen || this.reselectOpen, finished: this.gameOver
    }));
    if (this.levelConfig.survival && this.battlePaused) this.openPauseMenu();
  }

  private cleanupSceneHandlers() {
    soundPlayer.stop("battle");
    window.removeEventListener("pagehide", this.saveOnPageHide);
    this.cardList?.destroy();
    this.cardList = undefined;
    this.pauseMenu?.destroy();
    this.input.off("pointerdown", this.scenePointerDownHandler);
    this.input.off("pointermove", this.scenePointerMoveHandler);
    this.input.keyboard?.off("keydown", this.sceneKeyDownHandler);
    this.pausedActions = [];
    this.clearPlacementGhosts();
    this.tutorial?.destroy();
    this.tutorial = null;
    this.shifter?.clearSelection();
    this.towerPush?.destroy();
    this.topology?.destroy();
    this.towerSkills?.cancelSpellMortarTargeting();
    this.storage?.clear();
  }

  private createCardList() {
    this.cardList = this.battlefield.ui(() => new BattleCardList(this, this.selectedCardIds, (id) => this.localInput(() => this.selectCard(id)),
      () => !this.gameOver && !this.menuOpen && !this.reselectOpen));
    this.setCardStates(this.cardList.cards);
    this.cardList.ensureVisible(this.selectedCardId);
  }

  private setCardStates(cardStates: CardState[]) {
    this.cardStates = cardStates;
    this.cardStatesById.clear();
    for (const cardState of cardStates) {
      this.cardStatesById.set(cardState.definition.id, cardState);
    }
  }

  update(_time: number, delta: number) {
    if (this.gameOver || this.menuOpen || this.reselectOpen) {
      return;
    }

    if (this.battlePaused && !this.playback) {
      this.syncBattleOverlays();
      this.shifter.syncSelectionVisuals();
      this.syncPlacementGhost(this.input.activePointer);
      this.updateCards();
      this.updateHud();
      return;
    }

    if (!this.session.advance(delta * this.gameSpeed, this.sessionRuntime)) return;
    this.syncBattleOverlays();
    this.shifter.syncSelectionVisuals();
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards();
    this.updateHud();
  }

  private stepBattle() { this.world.step(this.worldSystems); }

  private createWorldSystems(): BattleWorldSystems<LiveBattleEntities> {
    let projectiles: ProjectileRuntime;
    return {
      updateNullification: (time, periodic) => this.nullification.update(time, periodic),
      eraseSealedCell: (lane, column) => this.eraseTowersInCell(lane, column),
      updateLevelAuras: () => this.updateLevelAuras(),
      sealsChanged: () => this.syncPlacementGhost(this.input.activePointer),
      syncCopiedTowers: () => this.syncCopiedTowers(),
      updateActions: time => this.actionQueue.update(time, action => this.executeBattleAction(action)),
      updateTowerSkills: (seconds, time) => this.towerSkills.update(seconds, time),
      updateTowerPush: time => this.towerPush.update(time),
      updateTopology: () => this.topology.update(),
      syncMirrors: () => this.mirrors.syncMirrors(),
      updateLevelAurasIfNeeded: () => this.updateLevelAurasIfNeeded(),
      cardCooldownMultiplier: () => this.towerSkills.cardCooldownMultiplier(),
      gainChars: (amount, x, y) => this.gainChars(amount, x, y),
      hasTimedProducers: HAS_TIMED_PRODUCER_CARDS,
      getDefinition: id => this.getDefinition(id),
      routeProduction: tower => this.routeTowerAction(tower, { kind: "production" }),
      updateArmingTowers: time => this.updateArmingTowers(time),
      updateStorage: () => this.storage.update(),
      updateBoss: seconds => updateBossRuntime(this.bossRuntime(), seconds),
      beginProjectileMotion: () => this.projectileMotion.begin(this.projectiles),
      updateEnemies: (time, seconds) => this.updateEnemies(time, seconds),
      updateTowerAttacks: time => this.updateTowers(time),
      updateCircuit: () => this.numbers.update(),
      updateTowerProjectiles: seconds => {
        projectiles = this.projectileRuntime(slowAuraSources(this.towers));
        updateTowerProjectiles(projectiles, seconds);
      },
      finishProjectileMotion: () => this.projectileMotion.finish(),
      updateEnemyProjectiles: seconds => updateEnemyProjectiles(projectiles, seconds),
      updateMortarProjectiles: seconds => {
        projectiles.slowAuraSources = slowAuraSources(this.towers);
        updateMortarProjectiles(projectiles, seconds);
      },
      updateTutorial: () => { if (this.tutorial) this.battlefield.ui(() => this.tutorial!.update()); },
      usesWaveSchedule: () => !this.tutorial || !!this.tutorial.usesWaveSchedule,
      autoUpgrade: () => this.attemptAutoUpgrades(),
      storedEnemyCount: () => this.storage.count,
      earliestStoredWave: () => this.storage.earliestWaveNumber,
      completedWaves: waves => { if (!this.playback) recordCompletedWaves(this.levelId, waves, this.difficulty); },
      completeLevel: () => this.endLevel(),
      spawnEnemy: options => spawnEnemyAt(this.combatRuntime(), options),
      sealColumn: column => this.sealColumn(column),
      waveStarted: (wave, isFlag) => {
        playSound(isFlag ? "flag" : "wave");
        this.showToast(isFlag ? `${t("label.flag")} ${wave / this.levelConfig.wavesPerFlag}` : `${t("label.wave")} ${wave}`);
      }
    };
  }

  private syncBattleOverlays() {
    // Catch-up ticks mutate battle state; redraw these overlays only once per displayed frame.
    for (const enemy of enemiesWithPassengers(this.enemies)) syncEnemyStatusVisuals(enemy, this.battleTime);
    syncHexArmorAuras(this.enemies, this.battleTime);
    for (const tower of this.towers) syncTowerFacingVisual(tower);
    drawNullifiedTowers(this.nullifiedTowerGraphics, this.nullification.snapshot(), this.battleTime);
    drawTimedCellSeals(this.timedCellSealGraphics, this.timedCellSeals.entries, this.battleTime, this.timedCellWarningGraphics);
    drawEnemyHealthLinks(this.enemyHealthLinks, this.enemies, this.battleTime);
  }

  private drawBoard() {
    const graphics = this.add.graphics();
    graphics.fillStyle(palette.black, 1);
    graphics.fillRect(0, 0, this.scale.width, GAME_HEIGHT);

    graphics.fillStyle(palette.nearBlack, 1);
    graphics.fillRect(BOARD_X - 14, BOARD_Y - 14, BOARD_WIDTH + 28, BOARD_HEIGHT + 28);
    graphics.fillStyle(palette.black, 1);
    graphics.fillRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);

    graphics.lineStyle(1, palette.dim, 1);
    for (let lane = 0; lane <= LANES; lane += 1) {
      const y = BOARD_Y + lane * CELL_HEIGHT;
      graphics.lineBetween(BOARD_X, y, BOARD_X + BOARD_WIDTH, y);
    }
    for (let column = 0; column <= COLUMNS; column += 1) {
      const x = BOARD_X + column * CELL_WIDTH;
      graphics.lineBetween(x, BOARD_Y, x, BOARD_Y + BOARD_HEIGHT);
    }

    graphics.lineStyle(3, palette.white, 1);
    graphics.lineBetween(BOARD_X - 20, BOARD_Y, BOARD_X - 20, BOARD_Y + BOARD_HEIGHT);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (this.localInputBlocked()) return;
    const x = pointer.x;
    const y = pointer.y;
    if (this.gameOver || this.menuOpen || this.reselectOpen) {
      return;
    }

    if (this.isRightPointer(pointer)) {
      this.topology.cancel();
      this.towerPush.cancel();
      this.towerSkills.cancelSpellMortarTargeting();
      if (this.shifter.isActive()) {
        this.shifter.deactivate();
        this.clearPlacementGhosts();
        this.updateCards();
      }
      return;
    }

    if (this.topology.isTargeting()) {
      const source = this.topology.selectedSource();
      if (this.isInsideBoard(x, y) && source) {
        const result = this.requestOperation({ type: "topology", target: towerOperationRef(source),
          cell: { lane: Math.floor((y - BOARD_Y) / CELL_HEIGHT), column: Math.floor((x - BOARD_X) / CELL_WIDTH) } });
        if (result === "handled" || result === "stale") this.topology.cancel();
      } else this.topology.cancel();
      return;
    }
    if (this.towerPush.isTargeting()) {
      if (this.isInsideBoard(x, y)) {
        const source = this.towerPush.selectedSource();
        if (source) {
          const result = this.requestOperation({ type: "push", target: towerOperationRef(source),
            cell: { lane: Math.floor((y - BOARD_Y) / CELL_HEIGHT), column: Math.floor((x - BOARD_X) / CELL_WIDTH) } });
          if (result === "handled" || result === "stale") this.towerPush.cancel();
        }
      } else {
        this.towerPush.cancel();
      }
      return;
    }

    if (this.towerSkills.hasSpellMortarTargeting()) {
      if (this.isInsideBoard(x, y)) {
        const targets = this.towerSkills.selectedSpellMortars().map(towerOperationRef);
        this.towerSkills.cancelSpellMortarTargeting();
        if (targets.length) this.requestOperation({ type: "skill", skill: "S", targets, point: { x, y } });
      } else {
        this.towerSkills.cancelSpellMortarTargeting();
      }
      return;
    }

    if (this.debugDamageMode) {
      this.requestControl({ type: "debugDamage", mode: this.debugDamageMode, point: { x, y } });
      return;
    }

    this.handleBoardPointer(pointer);
  }

  private handleBoardPointer(pointer: Phaser.Input.Pointer) {
    const x = pointer.x;
    const y = pointer.y;
    if (!this.isInsideBoard(x, y)) {
      return;
    }
    this.autoUpgradeReserveInputFocused = false;

    const { lane, column, cellTower, pointedParenthesis, tower: existingTower, edge: existingEdge } =
      boardPointerTarget(this.occupied, this.edgeTowers, x, y)!;

    if (this.eraserMode) {
      if (existingEdge) {
        this.requestOperation({ type: "erase", target: edgeOperationRef(existingEdge) });
        this.eraserMode = false; this.updateCards(); this.syncPlacementGhost(pointer); return;
      }
      if (!existingTower) {
        this.showToast(t("toast.empty"));
        return;
      }

      this.requestOperation({ type: "erase", target: towerOperationRef(existingTower) });
      this.eraserMode = false;
      this.updateCards();
      return;
    }

    if (existingEdge && !this.shifter.isActive()) {
      if (this.autoUpgradeMode) {
        this.requestOperation({ type: "autoUpgrade", enabled: !existingEdge.autoUpgrade,
          targets: (this.isShiftPointer(pointer) ? this.edgeTowers : [existingEdge]).map(edgeOperationRef) });
      } else if (deploymentCardId(this.selectedCardId) === "=") this.useEdgeCard(existingEdge, existingEdge);
      else {
        const modes = ["=", ">", "<", "!="] as const;
        this.requestOperation({ type: "edgeMode", target: edgeOperationRef(existingEdge),
          mode: modes[(modes.indexOf(existingEdge.mode ?? "=") + 1) % modes.length] });
      }
      this.syncPlacementGhost(pointer); return;
    }

    if (this.autoUpgradeMode) {
      if (!existingTower) {
        this.showToast(t("toast.empty"));
        return;
      }

      if (!supportsTowerAutoUpgrade(existingTower)) return;
      const nextState = !existingTower.autoUpgrade;
      this.requestOperation({ type: "autoUpgrade", enabled: nextState,
        targets: (this.isShiftPointer(pointer) ? this.towers.filter(tower => tower.type === existingTower.type && tower.inPlay && !tower.transient && supportsTowerAutoUpgrade(tower))
          : [existingTower]).map(towerOperationRef) });
      this.showToast(nextState ? t("toast.autoOn") : t("toast.autoOff"));
      return;
    }

    if (this.shifter.isActive()) {
      this.handleShifterPointer(pointer, lane, column, existingTower, !!pointedParenthesis);
      return;
    }

    const definition = this.getSelectedDefinition();
    if (definition.category === "special") {
      const edge = edgeAtPoint(x, y);
      if (!edge) return;
      this.useEdgeCard(edge); this.syncPlacementGhost(pointer); return;
    }
    const cardState = this.cardStatesById.get(definition.id);
    const effectiveChars = this.effectiveChars();
    if (isTowerShellType(deploymentCardId(definition.id)) || (cellTower && isParenthesisTower(cellTower) && !this.targetedEffects.canHandle(definition.id))) {
      this.deploySelectedCard(definition, lane, column, pointer);
      return;
    }
    if (existingTower?.type === "&" && !existingTower.topologyTarget) {
      this.prepareSkillTargeting(); this.topology.begin(existingTower); return;
    }
    if (this.canUpgradeSelectedTower(existingTower, definition, cardState, effectiveChars)) {
      this.deploySelectedCard(definition, lane, column, pointer);
      return;
    }

    if (this.targetedEffects.canHandle(definition.id)) {
      const result = this.requestOperation({ type: "effect", card: definition.id,
        cell: { lane, column }, target: existingTower ? towerOperationRef(existingTower) : null });
      this.handleTargetedEffectCardResult(result);
      return;
    }

    if (existingTower && this.numbers.release(existingTower)) {
      this.updateCards();
      return;
    }

    if (existingTower) {
      const targets = this.towerSkills.manualSkillTargets(existingTower, this.isShiftPointer(pointer));
      if (targets.length) {
        if (this.towerSkills.requiresManualSkillTarget(existingTower)) {
          this.towerSkills.beginManualSkillTargeting(targets, { x, y, allReady: this.isShiftPointer(pointer) });
        } else {
          this.requestOperation({ type: "skill", skill: towerBehaviorType(existingTower),
            targets: targets.map(towerOperationRef), point: null });
        }
        this.updateCards();
        return;
      }
    }

    if (this.isManualShockTower(existingTower)) {
      this.requestOperation({ type: "trigger", target: towerOperationRef(existingTower), behavior: towerBehaviorType(existingTower) });
      return;
    }

    if (!cardState || this.cardTimeFor(definition.id) < cardState.readyAt) {
      this.showToast(t("toast.cooldown"));
      return;
    }

    if (effectiveChars < this.extraction.plan(definition).cost) {
      this.showToast(t("toast.noChars"));
      return;
    }

    this.deploySelectedCard(definition, lane, column, pointer);
  }

  private canUpgradeSelectedTower(
    tower: Tower | undefined,
    definition: CardDefinition,
    cardState: CardState | undefined,
    effectiveChars: number
  ) {
    return (
      Boolean(tower && canUpgradeTowerWithCard(tower, definition.id)) &&
      Boolean(cardState && this.cardTimeFor(definition.id) >= cardState.readyAt) &&
      Boolean(tower && effectiveChars >= this.deployment.plan(definition).cost)
    );
  }

  private useEdgeCard(position: EdgeTower, existing?: EdgeTower) {
    this.handleTargetedEffectCardResult(this.requestOperation({
      type: "edgeCard", card: this.selectedCardId,
      position: { axis: position.axis, lane: position.lane, column: position.column },
      expected: existing ? edgeOperationRef(existing) : null
    }));
  }

  private applyPlayerOperation(actorId: string, operation: BattleOperation) {
    return executeLiveBattleOperation(this.createPlayerOperationRuntime(), actorId, operation);
  }

  private createPlayerOperationRuntime(): LiveBattleOperationRuntime {
    return {
      towers: this.towers, edges: this.edgeTowers, occupied: this.occupied, cards: this.cardStates,
      unlimitedFirepower: this.unlimitedFirepower, autoUpgradeEnabled: this.autoUpgradeEnabled, ended: this.gameOver,
      actor: id => id === LOCAL_BATTLE_ACTOR.id ? LOCAL_BATTLE_ACTOR : undefined,
      authorize: () => true,
      deployment: this.deployment, targetedEffects: this.targetedEffects, edgeControls: this.edgeControls, shifter: this.shifter,
      skills: this.towerSkills, push: this.towerPush, topology: this.topology,
      triggerShockTower: tower => this.triggerShockTower(tower),
      mirrorGroupFor: tower => this.mirrors.mirrorGroupFor(tower),
      removeTower: tower => removeTower(this.unitLifecycleRuntime(), tower),
      erasedAt: (x, y) => { makeEraseMark(this, x, y); playSound("erase"); },
      refreshPlacement: () => { this.mirrors.syncMirrors(); this.updateLevelAuras(); },
      refreshEdges: () => { this.numbers.sync(); this.updateCards(); },
      updateLevelAuras: () => this.updateLevelAuras(), updateCards: () => this.updateCards(),
      attemptAutoUpgrades: () => this.attemptAutoUpgrades()
    };
  }

  submitPlayerOperation(actorId: string, operation: BattleOperation): BattleOperationResult {
    if (!validBattleActorId(actorId) || !validBattleOperation(operation)) return "invalid";
    if (this.playback || this.gameOver) return "unavailable";
    let result: BattleOperationResult = "unavailable";
    this.session.submit({ type: "operation", actorId, operation }, accepted => {
      if (accepted.type === "operation") result = this.applyPlayerOperation(accepted.actorId, accepted.operation);
    });
    return result;
  }

  private applyPlayerControl(actorId: string, control: BattleControl): BattleOperationResult {
    return executeBattleControl(actorId, control, this.createPlayerControlRuntime());
  }

  private createPlayerControlRuntime(): BattleControlRuntime {
    return {
      state: this.controls, ended: this.gameOver,
      actor: id => id === LOCAL_BATTLE_ACTOR.id ? LOCAL_BATTLE_ACTOR : undefined,
      authorize: () => true,
      slotCount: this.playback ? CARD_SLOT_COUNT : unlockedCardSlotCount(),
      cardAllowed: id => hasCardDefinition(id) && (Boolean(this.playback) || isCardUnlocked(id)),
      reselectAvailable: !isTutorialMechanic(this.levelConfig.specialMechanic) && (Boolean(this.playback) || isLevelCompleted(RESELECT_UNLOCK_LEVEL)),
      reselectReady: this.reselection.isReady(this.battleTime),
      reselect: cards => this.applyReselection(cards),
      tutorialAvailable: !!this.tutorialAdvance,
      tutorialAdvance: () => this.battlefield.ui(() => this.tutorialAdvance?.()),
      tutorialInput: input => {
        if (!this.tutorial?.usesToolInteraction) return "unavailable";
        if (input.selected.some(id => !this.towers.some(tower => tower.entityId === id && tower.inPlay && !tower.transient && !tower.nullified))) return "stale";
        this.tutorialInteraction = { tool: input.tool, selected: [...input.selected] };
        return "handled";
      },
      pauseChanged: () => {
        if (!this.battlePaused) this.flushPausedActions();
        this.updateCards(); this.updateHud();
      },
      speedChanged: () => { this.time.timeScale = this.gameSpeed; this.updateHud(); },
      autoUpgradeChanged: () => { this.syncAutoUpgradeBorders(); this.attemptAutoUpgrades(); this.updateCards(); },
      debugChanged: () => {
        if (!this.debugModeEnabled) this.debugDamageMode = null;
        refreshGameHudSettings(this.ui, this.levelId, this.difficulty, this.debugModeEnabled); this.updateCards();
      },
      debugChars: () => this.applyDebugChars(),
      debugDamage: (point, mode) => this.applyDebugDamage(point.x, point.y, mode)
    };
  }

  submitPlayerControl(actorId: string, control: BattleControl): BattleOperationResult {
    if (!validBattleActorId(actorId) || !validBattleControl(control)) return "invalid";
    // A local menu must not reject an already-authorized control from another participant.
    if (this.playback || this.gameOver) return "unavailable";
    let result: BattleOperationResult = "unavailable";
    this.session.submit({ type: "control", actorId, control }, command => {
      if (command.type === "control") result = this.applyPlayerControl(command.actorId, command.control);
    });
    return result;
  }

  private requestControl(control: BattleControl) {
    return this.session.executingCommand ? this.applyPlayerControl(LOCAL_BATTLE_ACTOR.id, control) :
      this.submitPlayerControl(LOCAL_BATTLE_ACTOR.id, control);
  }

  private requestOperation(operation: BattleOperation) {
    return this.session.executingCommand ? this.applyPlayerOperation(LOCAL_BATTLE_ACTOR.id, operation) :
      this.submitPlayerOperation(LOCAL_BATTLE_ACTOR.id, operation);
  }

  private deploySelectedCard(
    definition: CardDefinition,
    lane: number,
    column: number,
    pointer: Phaser.Input.Pointer
  ) {
    const target = towerInPlacementLayer(this.occupied, lane, column, definition.id);
    const result = this.requestOperation({ type: "deploy", card: definition.id,
      cell: { lane, column }, expected: target ? towerOperationRef(target) : null });
    if (result !== "deployed") {
      this.showToast(t(`toast.${result === "cooldown" || result === "noChars" ? result : "occupied"}`));
      return;
    }

    if (definition.id === "&") {
      const tower = this.occupied.get(gridCellKey(lane, column));
      if (tower && !tower.topologyTarget) { this.prepareSkillTargeting(); this.topology.begin(tower); }
    }
    this.syncPlacementGhost(pointer);
  }

  private handleShifterPointer(pointer: Phaser.Input.Pointer, lane: number, column: number, existingTower?: Tower, explicitSelection = false) {
    const action = this.shifter.pointerAction(lane, column, existingTower, this.isCtrlPointer(pointer), explicitSelection);
    const result = action === "move" ? this.requestOperation({ type: "move",
      sources: this.shifter.selectedTowers().map(tower => ({ target: towerOperationRef(tower), lane: tower.lane, column: tower.column })),
      destination: { lane, column } }) : this.shifter.handlePointer(lane, column, existingTower, this.isCtrlPointer(pointer), explicitSelection);
    if (result === "cooldown") {
      this.shifter.deactivate();
      this.clearPlacementGhosts();
      this.showToast(t("toast.cooldown"));
      this.updateCards();
      return;
    }

    if (result === "empty") {
      this.showToast(t("toast.empty"));
      return;
    }

    if (result === "invalid" || result === "stale" || result === "forbidden" || result === "unavailable") {
      this.shifter.clearSelection();
      this.clearPlacementGhosts();
      this.showToast(t("toast.invalidMove"));
      this.updateCards();
      return;
    }

    if (result === "moved") {
      this.shifter.deactivate();
      playSound("move");
      this.clearPlacementGhosts();
      this.updateCards();
      return;
    }

    this.syncPlacementGhost(pointer);
    this.updateCards();
  }

  private syncPlacementGhost(pointer?: Phaser.Input.Pointer) {
    if (this.circuitEdges) {
      const preview = pointer && !this.gameOver && !this.menuOpen && !this.reselectOpen && !this.eraserMode && !this.autoUpgradeMode &&
        !this.shifter.isActive() && !this.towerPush.isTargeting() && !this.topology.isTargeting() &&
        deploymentCardId(this.selectedCardId) === "=" ? edgeAtPoint(pointer.x, pointer.y) : undefined;
      const card = this.cardStatesById.get(this.selectedCardId);
      const canPlace = !!card && this.cardTimeFor(this.selectedCardId) >= card.readyAt && this.effectiveChars() >= card.definition.cost &&
        !!preview;
      drawCircuitEdges(this.circuitEdges, this.edgeTowers, edge => this.numbers.isEdgeActive(edge), preview, canPlace, this.autoUpgradeEnabled);
    }
    if (this.towerPush.isTargeting() || this.topology.isTargeting()) { this.clearPlacementGhosts(); return; }
    const ghosts = this.placementGhostSpecs(pointer);
    const nextKey = placementGhostKey(ghosts);
    if (nextKey !== this.placementGhostKey) {
      this.clearPlacementGhosts();
      this.placementGhostKey = nextKey;
      for (const ghost of ghosts) {
        this.addPlacementGhost(ghost.type, ghost.lane, ghost.column);
      }
    }
    this.toolPreview.show(this.toolPreviewHints(pointer));
  }

  private toolPreviewHints(pointer?: Phaser.Input.Pointer): BoardToolHint[] {
    const hints = this.toolHintBuffer;
    hints.length = 0;
    if (!pointer || this.gameOver || this.menuOpen || this.reselectOpen || this.debugDamageMode !== null ||
      this.towerPush.isTargeting() || this.topology.isTargeting() || this.towerSkills.hasSpellMortarTargeting()) return hints;
    const target = boardPointerTarget(this.occupied, this.edgeTowers, pointer.x, pointer.y);
    if (!target) return hints;
    const { tower, edge, lane, column, pointedParenthesis } = target;
    const towerHint = (tower: Tower, action: BoardToolHint["action"]) => hints.push({
      x: tower.x, y: tower.y, shape: tower.type === "[]" ? "squareBracket" : isParenthesisTower(tower) ? "parenthesis" : "tower", action
    });
    const edgeHint = (edge: EdgeTower, action: BoardToolHint["action"]) => hints.push({ ...edgePosition(edge), shape: "edge", action });
    const invalid = () => hints.push({ x: BOARD_X + (column + .5) * CELL_WIDTH, y: BOARD_Y + (lane + .5) * CELL_HEIGHT, shape: "cell", action: "invalid" });
    if (this.eraserMode) {
      if (edge) edgeHint(edge, "erase");
      else if (tower) towerHint(tower, "erase");
      else invalid();
    } else if (this.autoUpgradeMode) {
      const all = pointer === this.input.activePointer ? this.previewShiftKey?.isDown ?? this.isShiftPointer(pointer) : this.isShiftPointer(pointer);
      if (edge) {
        for (const item of all ? this.edgeTowers : [edge]) edgeHint(item, edge.autoUpgrade ? "autoOff" : "autoOn");
      } else if (tower && supportsTowerAutoUpgrade(tower)) {
        for (const item of all ? this.towers : [tower]) {
          if (item.inPlay && item.type === tower.type && supportsTowerAutoUpgrade(item)) towerHint(item, tower.autoUpgrade ? "autoOff" : "autoOn");
        }
      } else if (tower) towerHint(tower, "invalid");
      else invalid();
    } else if (this.shifter.isActive()) {
      const additive = this.previewIsAdditive(pointer);
      const action = this.shifter.pointerAction(lane, column, tower, additive, !!pointedParenthesis);
      if (action === "select" && tower) towerHint(tower, additive && this.shifter.isSelected(tower) ? "deselect" : "select");
      else if (action !== "move" || !this.shifter.previewMove(lane, column).valid) invalid();
    }
    return hints;
  }

  private previewIsAdditive(pointer: Phaser.Input.Pointer) {
    return pointer === this.input.activePointer ? this.previewCtrlKey?.isDown ?? this.isCtrlPointer(pointer) : this.isCtrlPointer(pointer);
  }

  private placementGhostSpecs(pointer?: Phaser.Input.Pointer): PlacementGhostSpec[] {
    const ghosts = this.placementGhostSpecBuffer;
    ghosts.length = 0;

    if (!pointer || this.gameOver || this.menuOpen || this.reselectOpen || !this.isInsideBoard(pointer.x, pointer.y)) {
      return ghosts;
    }

    const lane = Math.floor((pointer.y - BOARD_Y) / CELL_HEIGHT);
    const column = Math.floor((pointer.x - BOARD_X) / CELL_WIDTH);

    const target = boardPointerTarget(this.occupied, this.edgeTowers, pointer.x, pointer.y)!;
    if (this.shifter.isActive() && this.shifter.pointerAction(lane, column, target.tower, this.previewIsAdditive(pointer), !!target.pointedParenthesis) === "move") {
      const move = this.shifter.previewMove(lane, column);
      if (move.valid) {
        for (const position of move.positions) {
          ghosts.push({
            type: position.tower.type,
            lane: position.lane,
            column: position.column
          });
        }
        return ghosts;
      }
      return ghosts;
    }

    if (
      this.eraserMode ||
      this.shifter.isActive() ||
      this.autoUpgradeMode ||
      this.debugDamageMode !== null ||
      this.towerSkills.hasSpellMortarTargeting()
    ) {
      return ghosts;
    }

    const definition = this.getSelectedDefinition();
    const cardState = this.cardStatesById.get(definition.id);
    if (
      definition.category === "special" ||
      !cardState ||
      this.cardTimeFor(definition.id) < cardState.readyAt ||
      this.effectiveChars() < this.extraction.plan(definition).cost
    ) {
      return ghosts;
    }

    if (this.targetedEffects.canHandle(definition.id)) {
      const target = this.occupied.get(`${lane}:${column}`);
      for (const recipient of this.targetedEffects.deploymentTargets(lane, column, target)) {
        ghosts.push({ type: definition.id, lane: recipient.lane, column });
      }
      return ghosts;
    }

    if (this.unlimitedFirepower) {
      for (let targetLane = 0; targetLane < LANES; targetLane += 1) {
        if (this.cellIsDeployable(targetLane, column) && !towerInPlacementLayer(this.occupied, targetLane, column, definition.id)) {
          ghosts.push({ type: definition.id, lane: targetLane, column });
        }
      }
      return ghosts;
    }

    if (this.cellIsDeployable(lane, column) && !towerInPlacementLayer(this.occupied, lane, column, definition.id)) {
      ghosts.push({ type: definition.id, lane, column });
    }

    return ghosts;
  }

  private addPlacementGhost(type: CardId, lane: number, column: number) {
    const definition = this.getDefinition(type);
    const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    const border = createUnitBorder(this, definition.category, 24, definition.category === "defense" ? 3 : 2);
    const label = this.add
      .text(0, -3, deploymentCardId(definition.id), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "34px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    if (isTowerShellType(deploymentCardId(definition.id))) { drawTowerShellBorder(border, palette.white, 3, 0, deploymentCardId(definition.id)); label.setVisible(false); }
    const ghost = this.add.container(x, y, [border, label]).setDepth(18).setAlpha(0.32);
    this.placementGhosts.push(ghost);
  }

  private clearPlacementGhosts() {
    this.toolPreview?.clear();
    for (const ghost of this.placementGhosts) {
      ghost.destroy();
    }
    this.placementGhosts = [];
    this.placementGhostKey = "";
  }

  private handleTargetedEffectCardResult(result: BattleOperationResult) {
    if (result === "handled") playSound("deploy");
    if (result === "cooldown") {
      this.showToast(t("toast.cooldown"));
      return;
    }

    if (result === "noChars") {
      this.showToast(t("toast.noChars"));
      return;
    }

    if (result === "empty") {
      this.showToast(t("toast.empty"));
    }
  }

  private updateArmingTowers(time: number) {
    for (const tower of this.towers) {
      if (tower.statusEffects.length > 0) {
        expireReversalEffect(tower, time);
        syncTowerFacingVisual(tower);
      }
      if (tower.trueDamageUntil > 0 || tower.trueDamageBorder.visible) {
        syncTowerTrueDamageVisual(tower, time);
      }

      if (towerBehaviorType(tower) === "G") {
        this.setTowerBorderVisible(tower, time >= tower.armedAt);
        continue;
      }

      if (isShockTower(tower) && towerBehaviorType(tower) !== "i") {
        this.setTowerBorderVisible(tower, true);
        tower.border.setAlpha(0.55 + Math.sin(time / 95) * 0.27);
      }
    }
  }

  private setTowerBorderVisible(tower: Tower, visible: boolean) {
    if (tower.border.visible !== visible) {
      tower.border.setVisible(visible);
    }
  }


  private updateLevelAurasIfNeeded() {
    if (syncTowerTopology(this.towers) || this.levelAuraStateChanged()) {
      this.updateLevelAuras();
    }
  }

  private syncCopiedTowers() {
    syncTowerCopies({ towers: this.towers, occupied: this.occupied, battleTime: this.battleTime,
      getDefinition: id => this.getDefinition(id),
      onChanged: (tower, definition) => syncTowerFormVisual(this, tower, definition, this.battleTime) });
  }

  private updateLevelAuras() {
    syncTowerOccupancy(this.towers, this.occupied);
    syncTowerTopology(this.towers);
    this.syncCopiedTowers();
    const snapshotTowers = this.levelBonusSnapshotTowers;
    const snapshotValues = this.levelBonusSnapshotValues;
    snapshotTowers.length = this.towers.length;
    snapshotValues.length = this.towers.length;

    for (let index = 0; index < this.towers.length; index += 1) {
      const tower = this.towers[index];
      snapshotTowers[index] = tower;
      snapshotValues[index] = tower.levelBonus + tower.mirrorLevelBonus;
      tower.levelBonus = 0;
    }

    for (const auraTower of this.towers) {
      if (auraTower.type !== "U") {
        continue;
      }

      for (const target of this.towers) {
        if (
          target === auraTower ||
          !inFriendlyRange(auraTower, target, 1)
        ) {
          continue;
        }

        const targetDefinition = this.getDefinition(target.type);
        if (targetDefinition.cost > MIRROR_COST_LIMIT) {
          continue;
        }

        target.levelBonus += auraTower.level;
      }
    }
    this.mirrors.syncMirrorLevelBonuses();

    const auraSources = towerAuraSources(this.towers);
    for (let index = 0; index < this.towers.length; index += 1) {
      const tower = this.towers[index];
      if (snapshotTowers[index] !== tower || snapshotValues[index] !== tower.levelBonus + tower.mirrorLevelBonus) {
        syncTowerLevelText(tower);
      }

      syncTowerDerivedStats(tower, false, this.towers, auraSources);
      syncFriendlyRangeVisual(tower);
    }

    snapshotTowers.length = 0;
    snapshotValues.length = 0;
    syncTowerHealthNetworks(this.towers);
    if (settleTowerHealth(this.unitLifecycleRuntime())) {
      this.updateLevelAuras();
      return;
    }
    this.cacheLevelAuraState();
    this.numbers.sync();
  }

  private levelAuraStateChanged() {
    if (this.towers.length !== this.levelAuraCachedTowers.length) {
      return true;
    }

    for (let index = 0; index < this.towers.length; index += 1) {
      const tower = this.towers[index];
      const cached = this.levelAuraCachedStates[index];
      if (this.levelAuraCachedTowers[index] !== tower || !cached || !this.levelAuraTowerStateMatches(tower, cached)) {
        return true;
      }
    }
    return false;
  }

  private levelAuraTowerStateMatches(tower: Tower, cached: LevelAuraTowerSignature) {
    return (
      cached.id === tower.id &&
      cached.type === towerFormType(tower) &&
      cached.lane === tower.lane &&
      cached.column === tower.column &&
      cached.level === tower.level &&
      cached.transient === tower.transient &&
      cached.mirrorGroupId === (tower.mirrorGroupId ?? 0)
    );
  }

  private cacheLevelAuraState() {
    this.levelAuraCachedTowers.length = this.towers.length;
    this.levelAuraCachedStates.length = this.towers.length;
    for (let index = 0; index < this.towers.length; index += 1) {
      const tower = this.towers[index];
      const cached = this.levelAuraCachedStates[index] ?? this.createLevelAuraTowerState(tower);
      cached.id = tower.id;
      cached.type = towerFormType(tower);
      cached.lane = tower.lane;
      cached.column = tower.column;
      cached.level = tower.level;
      cached.transient = tower.transient;
      cached.mirrorGroupId = tower.mirrorGroupId ?? 0;
      this.levelAuraCachedTowers[index] = tower;
      this.levelAuraCachedStates[index] = cached;
    }
  }

  private createLevelAuraTowerState(tower: Tower): LevelAuraTowerSignature {
    return {
      id: tower.id,
      type: towerFormType(tower),
      lane: tower.lane,
      column: tower.column,
      level: tower.level,
      transient: tower.transient,
      mirrorGroupId: tower.mirrorGroupId ?? 0
    };
  }

  private cardTimeFor(id: CardId) {
    return this.cardUsesClockCooldown(id) ? this.cardTime : this.battleTime;
  }

  private cardUsesClockCooldown(id: CardId) {
    return this.cardDefinitionUsesClockCooldown(this.getDefinition(id));
  }

  private cardDefinitionUsesClockCooldown(definition: CardDefinition) {
    return deploymentCardId(definition.id) !== "c" && definition.cost <= MIRROR_COST_LIMIT;
  }

  private gainChars(amount: number, x: number, y: number) {
    const gainedEffectiveChars = this.world.gainChars(amount);
    makeProductionPulse(this, x, y, Math.floor(gainedEffectiveChars));
    this.attemptAutoUpgrades();
  }

  private effectiveChars() { return this.world.effectiveChars(); }

  private spendChars(amount: number) { this.world.spendChars(amount); }

  private handleTowerDamaged(tower: Tower) {
    const definition = this.getDefinition(towerBehaviorType(tower));
    if (!definition.hitProduceAmount) {
      return;
    }

    const amount = getHitProductionAmount(tower, definition);
    if (amount > 0) {
      if (!this.routeTowerAction(tower, { kind: "hitProduction" })) this.gainChars(amount, tower.x, tower.y - 28);
    }
  }

  private prepareSkillTargeting() {
    this.topology.cancel();
    this.eraserMode = false;
    this.shifter.deactivate();
    this.clearPlacementGhosts();
    this.autoUpgradeMode = false;
    this.debugDamageMode = null;
    this.autoUpgradeReserveInputFocused = false;
  }

  private cancelSpellMortarTargeting() {
    this.topology.cancel();
    this.towerPush.cancel();
    this.towerSkills.cancelSpellMortarTargeting();
  }


  private currentBossPhaseConfig() { return this.world.currentBossPhaseConfig(); }

  private activeLevelConfig() { return this.world.activeLevelConfig(); }


  private adjustDifficultyForUnlimitedFirepower(difficultyConfig: DifficultyConfig): DifficultyConfig {
    if (!this.unlimitedFirepower) {
      return difficultyConfig;
    }

    return {
      ...difficultyConfig,
      weightMultiplier: difficultyConfig.weightMultiplier * 10
    };
  }

  private spawnBossIfNeeded(rank?: number) {
    if (!this.levelConfig.bossKind) {
      return;
    }

    this.boss = createCubeBoss(this, this.levelConfig.bossKind, this.difficultyConfig.finalDamageReduction, { rank });
    if (!this.playback) recordBossSeen(this.levelConfig.bossKind);
    this.bossHomePosition = { x: this.boss.x, y: this.boss.y };
    if (this.levelConfig.bossEndless && isDodecahedronBoss(this.boss)) {
      initializeDodecahedronCompanions(this.bossRuntime(), this.boss);
    }
    if (this.levelConfig.bossEndless && isOctahedronBoss(this.boss)) {
      initializeOctahedronSolarBombs(this.bossRuntime(), this.boss);
    }
    if (this.currentBossPhaseConfig()) {
      this.applyBossPhaseStats(this.boss);
      this.applyBossPhaseSkillState(this.boss);
      return;
    }

    if (this.unlimitedFirepower) {
      this.boss.baseStats.maxHp *= 10;
      syncBossBaseStats(this.boss);
      this.boss.hp = this.boss.finalStats.maxHp;
    }
  }

  private applyBossPhaseStats(boss: CubeBoss) { this.world.applyBossPhaseStats(boss); }

  private applyBossPhaseSkillState(boss: CubeBoss) {
    applyBossPhaseSkillState(boss, this.bossPhaseIndex);
  }

  private towerSkillRuntime(): TowerSkillRuntime {
    const runtime = this.towerSkillRuntimeCache;
    runtime.towers = this.towers;
    runtime.enemies = this.enemies;
    runtime.boss = this.boss;
    runtime.battleTime = this.battleTime;
    runtime.gameOver = this.gameOver;
    runtime.battlePaused = this.battlePaused;
    return runtime;
  }

  private createTowerSkillRuntime(): TowerSkillRuntime {
    return {
      onTowerAction: this.routeTowerAction,
      imitateTowerPush: (tower, dl, dc) => {
        const origin = towerCell(tower), target = physicalTowerCell(tower, { lane: origin.lane + dl, column: origin.column + dc });
        this.towerPush.push(tower, target.lane, target.column, true);
      },
      prepareSkillTargeting: () => this.prepareSkillTargeting(),
      beginTowerPush: tower => { this.towerPush.begin(tower); },
      scheduleBattleAction: this.scheduleBattleAction,
      towers: this.towers,
      enemies: this.enemies,
      boss: this.boss,
      battleTime: this.battleTime,
      gameOver: this.gameOver,
      battlePaused: this.battlePaused,
      getDefinition: (id) => this.getDefinition(id),
      damageEnemy: (enemy, damage, damageType, sourceTower) =>
        damageEnemy(this.unitLifecycleRuntime(), enemy, damage, damageType, sourceTower),
      damageBoss: (damage, damageType, targetPart) => damageBoss(this.unitLifecycleRuntime(), damage, damageType, targetPart),
      runWhenBattleActive: (action) => this.runWhenBattleActive(action),
      onTargetingChanged: () => this.updateCards()
    };
  }

  private targetedEffectCardRuntime(): TargetedEffectCardRuntime {
    const runtime = this.targetedEffectCardRuntimeCache;
    runtime.towers = this.towers;
    runtime.cardStates = this.cardStates;
    runtime.battleTime = this.battleTime;
    runtime.unlimitedFirepower = this.unlimitedFirepower;
    return runtime;
  }

  private createTargetedEffectCardRuntime(): TargetedEffectCardRuntime {
    return {
      onTowerAction: this.routeTowerAction,
      scheduleBattleAction: this.scheduleBattleAction,
      extraction: this.extraction,
      scene: this,
      towers: this.towers,
      cardStates: this.cardStates,
      battleTime: this.battleTime,
      getDefinition: (id) => this.getDefinition(id),
      cardTimeFor: (id) => this.cardTimeFor(id),
      getChars: () => this.effectiveChars(),
      spendChars: (amount) => this.spendChars(amount),
      nextTowerOrder: () => this.nextTowerOrder(),
      removeTower: (tower) => removeTower(this.unitLifecycleRuntime(), tower),
      runMirrorGroupEvent: (tower, action) => this.mirrors.runMirrorGroupEvent(tower, action),
      runWhenBattleActive: (action) => this.runWhenBattleActive(action),
      updateLevelAuras: () => this.updateLevelAuras(),
      updateCards: () => this.updateCards()
    };
  }

  private towerShifterRuntime(): TowerShifterRuntime {
    const runtime = this.towerShifterRuntimeCache;
    runtime.towers = this.towers;
    runtime.occupied = this.occupied;
    runtime.cardTime = this.battleTime;
    runtime.battleTime = this.battleTime;
    return runtime;
  }

  private createTowerShifterRuntime(): TowerShifterRuntime {
    return {
      scene: this,
      towers: this.towers,
      occupied: this.occupied,
      cardTime: this.battleTime,
      battleTime: this.battleTime,
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column),
      onMoved: (moves) => {
        syncTowerTopology(this.towers);
        this.mirrors.handleTowersShifted(moves, (tower) => removeTower(this.unitLifecycleRuntime(), tower));
        this.updateLevelAuras();
      }
    };
  }

  private towerMirrorRuntime(): TowerMirrorRuntime {
    const runtime = this.towerMirrorRuntimeCache;
    runtime.towers = this.towers;
    runtime.occupied = this.occupied;
    runtime.battleTime = this.battleTime;
    return runtime;
  }

  private createTowerMirrorRuntime(): TowerMirrorRuntime {
    return {
      scene: this,
      towers: this.towers,
      occupied: this.occupied,
      battleTime: this.battleTime,
      getDefinition: (id) => this.getDefinition(id),
      nextTowerOrder: () => this.nextTowerOrder(),
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column),
      createTargetedEffectMirror: (source, target) => this.targetedEffects.createMirroredEffect(source, target),
      updateLevelAuras: () => this.updateLevelAuras()
    };
  }

  private towerDeploymentRuntime(): TowerDeploymentRuntime {
    const runtime = this.towerDeploymentRuntimeCache;
    runtime.towers = this.towers;
    runtime.occupied = this.occupied;
    runtime.cardStates = this.cardStates;
    runtime.battleTime = this.battleTime;
    runtime.unlimitedFirepower = this.unlimitedFirepower;
    runtime.autoUpgradeEnabled = this.autoUpgradeEnabled;
    runtime.autoUpgradeReserveChars = this.autoUpgradeReserveChars;
    return runtime;
  }

  private createTowerDeploymentRuntime(): TowerDeploymentRuntime {
    return {
      extraction: this.extraction,
      scene: this,
      towers: this.towers,
      occupied: this.occupied,
      cardStates: this.cardStates,
      battleTime: this.battleTime,
      unlimitedFirepower: this.unlimitedFirepower,
      autoUpgradeEnabled: this.autoUpgradeEnabled,
      autoUpgradeReserveChars: this.autoUpgradeReserveChars,
      getDefinition: (id) => this.getDefinition(id),
      cardTimeFor: (id) => this.cardTimeFor(id),
      getChars: () => this.effectiveChars(),
      spendChars: (amount) => this.spendChars(amount),
      nextTowerOrder: () => this.nextTowerOrder(),
      resetTowerSkill: (tower) => this.towerSkills.resetTowerSkill(tower),
      mirrorGroupFor: (tower) => this.mirrors.mirrorGroupFor(tower),
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column),
      updateLevelAuras: () => this.updateLevelAuras(),
      updateCards: () => this.updateCards(),
      onFeedback: (kind) => playSound(kind)
    };
  }

  private combatRuntime(): CombatRuntime {
    const runtime = this.combatRuntimeCache;
    runtime.enemies = this.enemies;
    runtime.towers = this.towers;
    runtime.boss = this.boss;
    runtime.occupied = this.occupied;
    runtime.battleTime = this.battleTime;
    runtime.projectiles = this.projectiles;
    runtime.enemyProjectiles = this.enemyProjectiles;
    runtime.mortarProjectiles = this.mortarProjectiles;
    return runtime;
  }

  private createCombatRuntime(): CombatRuntime {
    return {
      enemyHpMultiplier: () => endlessEnemyHpMultiplier(this.levelConfig, this.wave),
      onTowerAction: this.routeTowerAction,
      scheduleBattleAction: this.scheduleBattleAction,
      scene: this,
      enemies: this.enemies,
      towers: this.towers,
      boss: this.boss,
      occupied: this.occupied,
      battleTime: this.battleTime,
      projectiles: this.projectiles,
      enemyProjectiles: this.enemyProjectiles,
      mortarProjectiles: this.mortarProjectiles,
      damageEnemy: (enemy, damage, damageType, sourceTower) =>
        damageEnemy(this.unitLifecycleRuntime(), enemy, damage, damageType, sourceTower),
      damageBoss: (damage, damageType, targetPart) => damageBoss(this.unitLifecycleRuntime(), damage, damageType, targetPart),
      damageTower: (tower, damage, damageType) => damageTower(this.unitLifecycleRuntime(), tower, damage, damageType),
      storeBlockedEnemies: (tower, definition) => this.storage.storeBlockedEnemies(tower, definition),
      gainChars: (amount, x, y) => this.gainChars(amount, x, y),
      spawnTower: (id, lane, column, level, facingDirection) => this.spawnGeneratedTower(id, lane, column, level, facingDirection),
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column),
      triggerTrapTower: (tower, target) => this.triggerTrapTower(tower, target),
      triggerShockTower: (tower) => this.triggerShockTower(tower),
      onEnemyReachedBase: (enemy) => this.handleEnemyReachedBase(enemy),
      projectileMotion: this.projectileMotion,
      runWhenBattleActive: (action) => this.runWhenBattleActive(action)
    };
  }

  private bossRuntime(): BossRuntime {
    const runtime = this.bossRuntimeCache;
    runtime.enemies = this.enemies;
    runtime.towers = this.towers;
    runtime.mortarProjectiles = this.mortarProjectiles;
    runtime.wave = this.wave;
    runtime.bossPhaseIndex = this.bossPhaseIndex;
    runtime.battleTime = this.battleTime;
    runtime.finalDamageReduction = this.difficultyConfig.finalDamageReduction;
    return runtime;
  }

  private createBossRuntime(): BossRuntime {
    return {
      nullifyTowers: durationMs => { this.nullification.start(this.battleTime, durationMs); },
      sealCell: (lane, column, durationMs) => {
        this.timedCellSeals.seal(lane, column, this.battleTime, durationMs, (row, col) => {
          if (this.eraseTowersInCell(row, col)) this.updateLevelAuras();
        });
        drawTimedCellSeals(this.timedCellSealGraphics, this.timedCellSeals.entries, this.battleTime, this.timedCellWarningGraphics);
        this.syncPlacementGhost(this.input.activePointer);
      },
      warnCellSeal: (lane, column, warningMs, durationMs, leadInMs) => {
        this.timedCellSeals.warn(lane, column, this.battleTime, warningMs, durationMs, leadInMs);
        drawTimedCellSeals(this.timedCellSealGraphics, this.timedCellSeals.entries, this.battleTime, this.timedCellWarningGraphics);
      },
      enemyHpMultiplier: () => endlessEnemyHpMultiplier(this.levelConfig, this.wave),
      scheduleBattleAction: this.scheduleBattleAction,
      scene: this,
      enemies: this.enemies,
      towers: this.towers,
      mortarProjectiles: this.mortarProjectiles,
      getBoss: () => this.boss,
      wave: this.wave,
      bossPhaseIndex: this.bossPhaseIndex,
      battleTime: this.battleTime,
      finalDamageReduction: this.difficultyConfig.finalDamageReduction,
      damageTower: (tower, damage, damageType) => damageTower(this.unitLifecycleRuntime(), tower, damage, damageType),
      triggerTrapTower: (tower, target) => this.triggerTrapTower(tower, target),
      triggerShockTower: (tower) => this.triggerShockTower(tower),
      runWhenBattleActive: (action) => this.runWhenBattleActive(action),
      endGame: () => this.endGame()
    };
  }

  private projectileRuntime(slowSources?: SlowAuraSources): ProjectileRuntime {
    const runtime = this.projectileRuntimeCache;
    runtime.projectiles = this.projectiles;
    runtime.enemyProjectiles = this.enemyProjectiles;
    runtime.mortarProjectiles = this.mortarProjectiles;
    runtime.enemies = this.enemies;
    runtime.towers = this.towers;
    runtime.occupied = this.occupied;
    runtime.battleTime = this.battleTime;
    runtime.slowAuraSources = slowSources;
    return runtime;
  }

  private createProjectileRuntime(): ProjectileRuntime {
    return {
      onTowerAction: this.routeTowerAction,
      routeProjectile: projectile => this.numbers.capture(projectile),
      interceptProjectile: (projectile, from) => this.numbers.intercept(projectile, from),
      projectileMotion: this.projectileMotion,
      scene: this,
      projectiles: this.projectiles,
      enemyProjectiles: this.enemyProjectiles,
      mortarProjectiles: this.mortarProjectiles,
      enemies: this.enemies,
      towers: this.towers,
      occupied: this.occupied,
      battleTime: this.battleTime,
      slowAuraSources: undefined,
      getBoss: () => this.boss,
      damageEnemy: (enemy, damage, damageType, sourceTower) =>
        damageEnemy(this.unitLifecycleRuntime(), enemy, damage, damageType, sourceTower),
      damageBoss: (damage, damageType, targetPart) => damageBoss(this.unitLifecycleRuntime(), damage, damageType, targetPart),
      damageTower: (tower, damage, damageType) => damageTower(this.unitLifecycleRuntime(), tower, damage, damageType)
    };
  }

  private unitLifecycleRuntime(): UnitLifecycleRuntime {
    const runtime = this.unitLifecycleRuntimeCache;
    runtime.enemies = this.enemies;
    runtime.towers = this.towers;
    runtime.projectiles = this.projectiles;
    runtime.enemyProjectiles = this.enemyProjectiles;
    runtime.mortarProjectiles = this.mortarProjectiles;
    runtime.occupied = this.occupied;
    runtime.bossPhaseIndex = this.bossPhaseIndex;
    runtime.battleTime = this.battleTime;
    runtime.finalDamageReduction = this.difficultyConfig.finalDamageReduction;
    return runtime;
  }

  private createUnitLifecycleRuntime(): UnitLifecycleRuntime {
    return {
      enemyHpMultiplier: () => endlessEnemyHpMultiplier(this.levelConfig, this.wave),
      onTowerAction: this.routeTowerAction,
      scene: this,
      enemies: this.enemies,
      towers: this.towers,
      projectiles: this.projectiles,
      enemyProjectiles: this.enemyProjectiles,
      mortarProjectiles: this.mortarProjectiles,
      occupied: this.occupied,
      getBoss: () => this.boss,
      setBoss: (boss) => {
        this.boss = boss;
      },
      getWaveTracker: () => this.waveTracker,
      bossPhaseIndex: this.bossPhaseIndex,
      battleTime: this.battleTime,
      finalDamageReduction: this.difficultyConfig.finalDamageReduction,
      onEnemyDefeated: () => {
        this.enemiesDefeated += 1;
      },
      onTowerDamaged: (tower) => this.handleTowerDamaged(tower),
      absorbTowerDamage: (tower, damage, damageType) => this.numbers.absorbDamage(tower, damage, damageType),
      onTowerRemoved: (tower) => {
        syncTowerTopology(this.towers);
        this.mirrors.handleTowerRemoved(tower, (linkedTower) => removeTower(this.unitLifecycleRuntime(), linkedTower));
        this.numbers.sync();
      },
      onBossDefeated: (boss) => this.handleBossDefeated(boss),
      endLevel: () => this.endLevel()
    };
  }

  private triggerTowerRuntime(): TriggerTowerRuntime {
    const runtime = this.triggerTowerRuntimeCache;
    runtime.enemies = this.enemies;
    runtime.boss = this.boss;
    runtime.battleTime = this.battleTime;
    runtime.gameOver = this.gameOver;
    return runtime;
  }

  private createTriggerTowerRuntime(): TriggerTowerRuntime {
    return {
      onTowerAction: this.routeTowerAction,
      scheduleBattleAction: this.scheduleBattleAction,
      scene: this,
      enemies: this.enemies,
      boss: this.boss,
      battleTime: this.battleTime,
      gameOver: this.gameOver,
      getDefinition: (id) => this.getDefinition(id),
      removeTower: (tower) => removeTower(this.unitLifecycleRuntime(), tower),
      damageEnemy: (enemy, damage, damageType, sourceTower) =>
        damageEnemy(this.unitLifecycleRuntime(), enemy, damage, damageType, sourceTower),
      damageBoss: (damage, damageType, targetPart) => damageBoss(this.unitLifecycleRuntime(), damage, damageType, targetPart),
      runWhenBattleActive: (action) => this.runWhenBattleActive(action)
    };
  }

  private nextTowerOrder() { return this.world.nextTowerOrder(); }

  private spawnGeneratedTower(id: CardId, lane: number, column: number, level: number, facingDirection: -1 | 1 = 1) {
    if (!this.cellIsDeployable(lane, column) || towerInPlacementLayer(this.occupied, lane, column, id)) {
      return null;
    }

    const definition = this.getDefinition(id);
    if (definition.category === "special") return null;
    const tower = createTower(
      this,
      definition,
      lane,
      column,
      this.battleTime,
      this.nextTowerOrder()
    );
    tower.level = Math.max(1, Math.floor(level));
    syncTowerLevelText(tower);
    setTowerFacing(tower, facingDirection);
    this.towers.push(tower);
    syncTowerOccupancy(this.towers, this.occupied);
    this.updateLevelAuras();
    return tower;
  }

  private routeTowerAction = (tower: Tower, event: TowerActionEvent) => {
    if (!this.numbers.captureAction(tower, event)) return false;
    const definition = this.getDefinition(towerBehaviorType(tower));
    const selfCost = event.kind === "attack" ? pipelineActionSelfCost(tower, definition, this.combatRuntime()) : 0;
    const perHit = definition.selfDamage ?? 400;
    for (let remaining = selfCost; remaining > 0 && tower.inPlay; remaining -= perHit) {
      damageTower(this.unitLifecycleRuntime(), tower, perHit, definition.selfDamageType ?? "true");
    }
    return true;
  };

  private updateTowers(time: number) {
    const runtime = this.combatRuntime();
    for (const tower of this.towers) {
      const behavior = getCardBehavior(towerBehaviorType(tower));
      if (behavior === idleCardBehavior) {
        continue;
      }

      const attackInterval = this.towerAttackInterval(tower);
      if (!this.towerAttackReady(tower, time, attackInterval)) {
        continue;
      }

      const definition = this.getDefinition(towerBehaviorType(tower));
      if (!behavior.canUse(tower, definition, time, runtime, true)) {
        continue;
      }

      this.startTowerVolley(tower, time, attackInterval);
    }
  }

  private towerAttackInterval(tower: Tower) {
    return attackIntervalMs(towerFinalStats(tower).attackSpeed);
  }

  private towerAttackReady(tower: Tower, time: number, attackInterval: number) {
    return time >= tower.lastFire + attackInterval;
  }

  private startTowerVolley(
    tower: Tower,
    time: number,
    attackInterval: number
  ) {
    const totalHits = volleyShotCount(towerBehaviorType(tower), effectiveTowerLevel(tower));
    const shots = volleyTimingCount(totalHits);
    const interval = volleyInterval(attackInterval, shots);

    for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
      const hitCount = volleyHitsAt(totalHits, shotIndex);
      this.scheduleBattleAction(shotIndex * interval, { type: "volley", tower, hitCount, copyRevision: tower.copyRevision });
    }

    tower.lastFire = time + (shots - 1) * interval;
  }

  private updateEnemies(time: number, seconds: number) {
    advanceEnemies(this.combatRuntime(), time, seconds);
  }

  private handleEnemyReachedBase(enemy: Enemy) {
    this.world.registerBreach();
    removeEnemy(this.unitLifecycleRuntime(), enemy, false);
    this.cameras.main.shake(110, 0.004);
    playSound("breach");
    if (this.baseIntegrity <= 0) {
      this.endGame();
      return true;
    }
    return false;
  }


  private spawnWave(levelElapsed: number, gameTime: number) { this.world.spawnWave(levelElapsed, gameTime, this.worldSystems); }

  private spawnTutorialWave(spawns: TutorialEnemySpawn[]) {
    const waveNumber = this.wave + 1;
    playSound(waveNumber % this.levelConfig.wavesPerFlag === 0 ? "flag" : "wave");
    let totalWeight = 0;
    this.wave = waveNumber;
    spawns.forEach((spawn, index) => {
      const definition = getEnemyDefinition(spawn.kind);
      totalWeight += spawnEnemyAt(this.combatRuntime(), {
        kind: spawn.kind,
        waveNumber,
        time: this.battleTime,
        lane: spawn.lane,
        x: spawn.x ?? BOARD_X + BOARD_WIDTH + 46 + index * 5,
        waveWeight: definition.weight,
        finalDamageReduction: 0
      });
    });
    this.waveTracker = {
      number: waveNumber,
      totalWeight,
      defeatedWeight: 0,
      spawnedAt: this.levelElapsed
    };
    this.showToast(
      waveNumber % this.levelConfig.wavesPerFlag === 0
        ? `${t("label.flag")} ${waveNumber / this.levelConfig.wavesPerFlag}`
        : `${t("label.wave")} ${waveNumber}`
    );
  }

  private tutorialToolBounds(id: TutorialToolId) {
    switch (id) {
      case "erase":
        return this.ui.eraserButton.getBounds();
      case "autoUpgrade":
        return this.ui.autoUpgradeButton.getBounds();
      case "autoUpgradeEnabled":
        return this.ui.autoUpgradeEnabledBox.getBounds();
      case "autoUpgradeReserve":
        return this.ui.autoUpgradeReserveInput.getBounds();
      case "shifter":
        return this.ui.shifterButton.getBounds();
    }
  }

  private handleBossDefeated(boss: CubeBoss) {
    if (this.levelConfig.bossEndless) {
      if (!this.playback) recordDefeatedBossRank(this.levelId, boss.rank, this.difficulty);
      if (isOctahedronBoss(boss)) {
        forEachSnapshot(this.enemies, enemy => {
          if (enemy.kind === "solarBomb") removeEnemy(this.unitLifecycleRuntime(), enemy, false);
        });
      }
      if (isDodecahedronBoss(boss)) {
        forEachSnapshot(this.enemies, enemy => {
          if (enemyIsBossCompanion(enemy.kind)) removeEnemy(this.unitLifecycleRuntime(), enemy, false);
        });
      }
      removeBoss(this.unitLifecycleRuntime(), false);
      this.spawnBossIfNeeded(boss.rank + 1);
      this.updateHud();
      return true;
    }
    const phases = this.levelConfig.bossPhases;
    if (!phases || !this.world.beginNextBossPhase()) return false;
    this.clearEnemiesForBossPhaseTransition();
    this.resetBossForPhase(boss);
    this.applyBossPhaseStats(boss);
    this.applyBossPhaseSkillState(boss);
    this.showToast(`PHASE ${this.bossPhaseIndex + 1}/${phases.length}`);
    this.updateHud();
    return true;
  }

  private clearEnemiesForBossPhaseTransition() {
    this.storage.clear();
    const bodies: Phaser.GameObjects.Container[] = [];
    forEachSnapshot(this.enemies, (enemy) => {
      detachEnemyHealth(enemy);
      enemy.inPlay = false;
      bodies.push(enemy.body);
      destroyContainedEnemies(enemy);
    });

    clearEnemyField(this.enemies);
    if (bodies.length === 0) {
      return;
    }

    this.tweens.add({
      targets: bodies,
      alpha: 0,
      scale: 0.12,
      duration: 180,
      ease: "Quad.easeIn",
      onComplete: () => bodies.forEach((body) => body.destroy())
    });
  }

  private resetBossForPhase(boss: CubeBoss) {
    const copies = boss.octahedronCopies ?? [];
    this.world.resetBossForPhase(boss);
    boss.body.setPosition(boss.x, boss.y);
    for (const copy of copies) copy.body.destroy();
    clearBossCopyWarnings(boss);
  }

  private sealColumn(column: number) {
    let removedTower = false;
    for (let lane = 0; lane < LANES; lane += 1) {
      removedTower = this.eraseTowersInCell(lane, column) || removedTower;
      this.sealCell(lane, column);
    }

    if (removedTower) {
      this.updateLevelAuras();
    }
    this.syncPlacementGhost(this.input.activePointer);
  }

  private eraseTowersInCell(lane: number, column: number) {
    let removed = false;
    for (const tower of this.towers.filter(tower => tower.lane === lane && tower.column === column)) {
      if (!tower.inPlay) continue;
      makeEraseMark(this, tower.x, tower.y);
      removeTower(this.unitLifecycleRuntime(), tower);
      removed = true;
    }
    return removed;
  }

  private sealCell(lane: number, column: number) {
    const key = gridCellKey(lane, column);
    if (this.sealedCells.has(key)) {
      return;
    }

    this.sealedCells.add(key);
    const mark = createCellSealMark(this, lane, column);
    this.sealedCellMarks.set(key, mark);
  }

  private cellCenter(lane: number, column: number) {
    return {
      x: BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2,
      y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
    };
  }

  private triggerShockTower(tower: Tower) {
    this.mirrors.runMirrorGroupEvent(tower, (member) => runTriggerShockTower(this.triggerTowerRuntime(), member));
  }

  private runWhenBattleActive(action: () => void) {
    if (this.gameOver) {
      return;
    }

    if (this.battlePaused) {
      this.pausedActions.push(action);
      return;
    }

    action();
  }

  private triggerTrapTower(tower: Tower, target: Enemy | CubeBoss | "boss") {
    this.mirrors.runMirrorGroupEvent(tower, (member) => runTriggerTrapTower(this.triggerTowerRuntime(), member, target));
  }

  private updateCards() {
    const shifterMode = this.shifter.isActive();
    for (const cardState of this.cardStates) {
      cardState.displayTime = this.cardDefinitionUsesClockCooldown(cardState.definition) ? this.cardTime : this.battleTime;
    }

    updateCardStates(this.cardStates, {
      extraction: this.extraction,
      selectedCardId: this.selectedCardId,
      chars: this.effectiveChars(),
      eraserMode: this.eraserMode,
      shifterMode,
      autoUpgradeMode: this.autoUpgradeMode,
      debugDamageMode: this.debugDamageMode !== null
    });
    updateExtractionPool(this.ui, this.extraction.value);
    updateToolButtonStates(
      this.ui,
      this.eraserMode,
      shifterMode,
      this.shifter.cooldownRatio(),
      this.autoUpgradeMode,
      this.debugDamageMode === "normal",
      this.debugDamageMode === "super",
      this.autoUpgradeEnabled,
      this.autoUpgradeReserveInputFocused ? this.autoUpgradeReserveDraft : this.autoUpgradeReserveChars,
      this.autoUpgradeReserveInputFocused
    );
    updateReselectButtonState(this.ui, isLevelCompleted(RESELECT_UNLOCK_LEVEL),
      this.reselection.readyRatio(this.battleTime), !isTutorialMechanic(this.levelConfig.specialMechanic));
  }

  private openReselection() {
    if (this.playback) return;
    if (this.gameOver || this.menuOpen || this.reselectOpen || isTutorialMechanic(this.levelConfig.specialMechanic)) return;
    if (!isLevelCompleted(RESELECT_UNLOCK_LEVEL)) {
      this.showToast(t("card.unlockAfter", { level: RESELECT_UNLOCK_LEVEL }));
      return;
    }
    if (!this.reselection.isReady(this.battleTime)) {
      this.showToast(t("toast.cooldown"));
      return;
    }

    this.reselectOpen = true;
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    this.clearPlacementGhosts();
    this.reselectShade = this.battlefield.ui(() => this.add.rectangle(this.scale.width / 2, GAME_HEIGHT / 2, this.scale.width, GAME_HEIGHT, palette.black, 0.4)
      .setDepth(1000));
    this.scene.pause();
    this.scene.launch("CardSelectScene", {
      levelId: this.levelId,
      chapterId: this.chapterId,
      difficulty: this.difficulty,
      unlimitedFirepower: this.unlimitedFirepower,
      reselect: {
        selectedCards: [...this.selectedCardIds],
        onConfirm: (cards: CardId[]) => this.closeReselection(cards),
        onCancel: () => this.closeReselection()
      }
    });
  }

  private closeReselection(cards?: CardId[]) {
    if (!this.reselectOpen) return;
    this.reselectOpen = false;
    if (cards?.length) this.requestControl({ type: "reselect", cards });
    this.reselectShade?.destroy();
    this.reselectShade = undefined;
    this.scene.resume();
    this.updateCards();
    this.syncPlacementGhost(this.input.activePointer);
  }

  private applyReselection(cards: readonly CardId[]) {
    const deadlines = this.cardStates.map(card => ({ definition: card.definition, readyAt: card.readyAt,
      displayTime: this.cardTimeFor(card.definition.id) }));
    if (!this.reselection.confirm(this.battleTime, deadlines)) return false;
    this.selectedCardIds = [...cards];
    this.cardList?.destroy(); this.createCardList();
    for (const card of this.cardStates) card.readyAt = this.reselection.cardReadyAt(card.definition.id, this.cardTimeFor(card.definition.id), this.battleTime);
    if (!this.selectedCardIds.includes(this.selectedCardId)) this.selectedCardId = this.selectedCardIds[0];
    this.updateCards();
    return true;
  }

  private grantDebugChars() {
    if (this.localInputBlocked()) return;
    if (!this.debugModeEnabled || this.gameOver) {
      return;
    }

    this.eraserMode = false;
    this.shifter.deactivate();
    this.clearPlacementGhosts();
    this.autoUpgradeMode = false;
    this.debugDamageMode = null;
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    this.requestControl({ type: "debugChars" });
  }

  private applyDebugChars() {
    this.cardStates.forEach((cardState) => {
      cardState.readyAt = this.cardTimeFor(cardState.definition.id);
    });
    this.baseIntegrity += 1_000;
    this.flawlessRun = false;
    this.gainChars(10_000, this.ui.debugButton.x, this.ui.debugButton.y + 34);
    this.showToast(t("toast.debugChars"));
    this.updateCards();
    this.updateHud();
  }

  private toggleEraser() {
    if (this.localInputBlocked()) return;
    if (this.gameOver) {
      return;
    }

    this.eraserMode = !this.eraserMode;
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    if (this.eraserMode) {
      this.shifter.deactivate();
      this.clearPlacementGhosts();
      this.autoUpgradeMode = false;
      this.debugDamageMode = null;
    }
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards();
  }

  private toggleShifterMode() {
    if (this.localInputBlocked()) return;
    if (this.gameOver) {
      return;
    }

    if (!this.shifter.isActive() && !this.shifter.isReady()) {
      this.showToast(t("toast.cooldown"));
      return;
    }

    this.shifter.setActive(!this.shifter.isActive());
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    if (this.shifter.isActive()) {
      this.eraserMode = false;
      this.autoUpgradeMode = false;
      this.debugDamageMode = null;
    } else {
      this.clearPlacementGhosts();
    }
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards();
  }

  private toggleAutoUpgradeMode() {
    if (this.localInputBlocked()) return;
    if (this.gameOver) {
      return;
    }

    this.autoUpgradeMode = !this.autoUpgradeMode;
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    if (this.autoUpgradeMode) {
      this.eraserMode = false;
      this.shifter.deactivate();
      this.clearPlacementGhosts();
      this.debugDamageMode = null;
    }
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards();
  }

  private toggleAutoUpgradeEnabled() {
    if (this.localInputBlocked()) return;
    if (this.gameOver) {
      return;
    }

    this.autoUpgradeReserveInputFocused = false;
    this.requestControl({ type: "autoUpgradeEnabled", enabled: !this.autoUpgradeEnabled });
  }

  private focusAutoUpgradeReserveInput() {
    if (this.localInputBlocked()) return;
    if (this.gameOver) {
      return;
    }

    this.eraserMode = false;
    this.shifter.deactivate();
    this.clearPlacementGhosts();
    this.autoUpgradeMode = false;
    this.debugDamageMode = null;
    this.autoUpgradeReserveInputFocused = true;
    this.autoUpgradeReserveDraft = this.autoUpgradeReserveChars;
    this.cancelSpellMortarTargeting();
    this.updateCards();
  }

  private attemptAutoUpgrades() {
    this.deployment.attemptAutoUpgrades();
    for (const card of this.cardStates) if (deploymentCardId(card.definition.id) === "=") this.edgeControls.attemptAutoUpgrade(card);
  }

  private toggleDebugDamageMode() {
    if (this.localInputBlocked()) return;
    if (!this.debugModeEnabled || this.gameOver) {
      return;
    }

    this.debugDamageMode = this.debugDamageMode === "normal" ? null : "normal";
    this.enterDebugDamageMode();
  }

  private toggleSuperDebugDamageMode() {
    if (this.localInputBlocked()) return;
    if (!this.debugModeEnabled || this.gameOver) {
      return;
    }

    this.debugDamageMode = this.debugDamageMode === "super" ? null : "super";
    this.enterDebugDamageMode();
  }

  private enterDebugDamageMode() {
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    if (this.debugDamageMode) {
      this.eraserMode = false;
      this.shifter.deactivate();
      this.clearPlacementGhosts();
      this.autoUpgradeMode = false;
    }
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards();
  }

  private applyDebugDamage(x: number, y: number, mode: "normal" | "super") {
    this.flawlessRun = false;
    const rangeX = CELL_WIDTH / 2;
    const rangeY = CELL_HEIGHT / 2;
    const damage = mode === "super" ? 105_000 : 15_000;
    makeShellBurst(this, x, y, Math.min(CELL_WIDTH, CELL_HEIGHT) * 0.5, "true");
    makeShockPulse(this, x, y, CELL_WIDTH, CELL_HEIGHT);

    forEachSnapshot(this.enemies, (enemy) => {
      if (Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY) {
        damageEnemy(this.unitLifecycleRuntime(), enemy, damage, "true");
      }
    });

    if (isBossInRect(this.boss, x - rangeX, y - rangeY, rangeX * 2, rangeY * 2)) {
      damageBoss(this.unitLifecycleRuntime(), damage, "true");
    }
  }

  private syncAutoUpgradeBorders() {
    this.deployment.syncAutoUpgradeBorders();
  }

  private toggleBattlePause() {
    if (this.gameOver) {
      return;
    }

    this.requestControl({ type: "pause", paused: !this.battlePaused });
    this.showToast(this.battlePaused ? t("toast.paused") : t("toast.resume"));
    this.updateCards();
    this.updateHud();
  }

  private flushPausedActions() {
    const actions = this.pausedActions.splice(0);
    for (const action of actions) {
      this.runWhenBattleActive(action);
      if (this.gameOver || this.battlePaused) {
        return;
      }
    }
  }

  private setGameSpeed(speed: number) {
    this.gameSpeed = Math.min(GAME_SPEED_MAX, Math.max(GAME_SPEED_MIN, Math.round(speed * 10) / 10));
    this.time.timeScale = this.gameSpeed;
    this.updateHud();
  }

  private requestGameSpeed(speed: number) {
    if (!Number.isFinite(speed)) return;
    this.requestControl({ type: "speed", speed: Math.min(GAME_SPEED_MAX, Math.max(GAME_SPEED_MIN, Math.round(speed * 10) / 10)) });
  }

  private updateHud() {
    const activeLevelConfig = this.activeLevelConfig();
    updateGameHud(this.ui, {
      enemyHpMultiplier: activeLevelConfig.survival ? endlessEnemyHpMultiplier(activeLevelConfig, this.wave) : undefined,
      chars: this.effectiveChars(),
      rawChars: this.chars,
      charsSoftcapped: charsAreSoftcapped(this.chars),
      wave: this.wave,
      wavesPerFlag: activeLevelConfig.wavesPerFlag,
      totalWaves: activeLevelConfig.totalWaves ?? this.wave,
      baseIntegrity: this.baseIntegrity,
      enemiesDefeated: this.enemiesDefeated,
      battlePaused: this.battlePaused,
      gameSpeed: this.gameSpeed,
      boss: this.boss,
      bossHpBar: this.bossHpBarState()
    });
  }

  private bossHpBarState() {
    const phases = this.levelConfig.bossPhases;
    if (!this.boss || !phases) {
      return undefined;
    }

    const fillColor = BOSS_PHASE_BAR_COLORS[this.bossPhaseIndex] ?? BOSS_PHASE_BAR_COLORS[BOSS_PHASE_BAR_COLORS.length - 1];
    const nextFillColor =
      this.bossPhaseIndex + 1 < phases.length
        ? BOSS_PHASE_BAR_COLORS[this.bossPhaseIndex + 1] ?? BOSS_PHASE_BAR_BACK
        : BOSS_PHASE_FINAL_BAR_BACK;

    const state = this.bossHpBarStateCache;
    state.fillColor = fillColor;
    state.backColor = nextFillColor;
    state.phase = this.bossPhaseIndex + 1;
    state.totalPhases = phases.length;
    return state;
  }

  private openPauseMenu() {
    if (this.menuOpen || this.reselectOpen) return;
    soundPlayer.stop("battle");
    this.menuOpen = true;
    this.autoUpgradeReserveInputFocused = false;
    this.ui.pauseMenuTooltip.setVisible(false);
    this.clearPlacementGhosts();
    this.scene.pause();
    this.pauseMenu.show();
  }

  private closePauseMenu() {
    this.pauseMenu.hide();
    this.menuOpen = false;
    this.scene.resume();
    if (this.battlePaused && !this.gameOver) this.toggleBattlePause();
    this.syncPlacementGhost(this.input.activePointer);
  }

  private refreshBattleSettings() {
    if (!this.playback) {
      this.submitPlayerControl(LOCAL_BATTLE_ACTOR.id, { type: "debugMode", enabled: isDebugModeEnabled() });
    }
    if (!this.debugModeEnabled) this.debugDamageMode = null;
    refreshGameHudSettings(this.ui, this.levelId, this.difficulty, this.debugModeEnabled);
    this.updateCards();
    this.updateHud();
  }

  private showToast(text: string) {
    showUiToast(this, this.ui, text);
  }

  private endGame() {
    soundPlayer.stop("battle");
    playSound("defeat");
    this.gameOver = true;
    this.clearPlacementGhosts();
    if (this.levelConfig.survival && !this.playback) deleteSurvivalSave(this.levelId);
    showGameOverlay(this.overlay, t("overlay.breach"), t("button.menu"));
  }

  private endLevel() {
    soundPlayer.stop("battle");
    playSound("victory");
    this.gameOver = true;
    this.clearPlacementGhosts();
    const reselectUnlocked = this.levelId === RESELECT_UNLOCK_LEVEL && !isLevelCompleted(RESELECT_UNLOCK_LEVEL);
    const previousCardSlotCount = unlockedCardSlotCount();
    const flawless = this.flawlessRun && this.baseIntegrity >= BASE_INTEGRITY && !this.levelConfig.survival && !this.playback;
    const unlockedCardIds = this.playback ? [] : completeLevel(this.levelId, { difficulty: this.difficulty, flawless });
    const currentCardSlotCount = unlockedCardSlotCount();
    showGameOverlay(
      this.overlay,
      t(flawless ? "overlay.flawless" : "overlay.clear"),
      t("button.menu"),
      unlockedCardIds,
      currentCardSlotCount > previousCardSlotCount
        ? { current: currentCardSlotCount, total: CARD_SLOT_COUNT }
        : undefined,
      reselectUnlocked ? t("toast.reselectUnlocked") : undefined,
      id => {
        this.rewardEncyclopedia ??= this.battlefield.ui(() => new EncyclopediaPanel(this));
        this.rewardEncyclopedia.openTower(id);
      }
    );
  }

  private handleOverlayAction() {
    if (this.levelConfig.survival && !this.gameOver && !this.saveSurvivalBattle()) {
      this.pauseMenu.showError(t("save.failed"));
      this.showToast(t("save.failed"));
      return;
    }
    this.scene.start("LevelSelectScene", {
      chapterId: this.chapterId,
      selectedLevelId: this.levelId,
      difficulty: this.difficulty,
      unlimitedFirepower: this.unlimitedFirepower
    });
  }

  private handleAutoUpgradeReserveKey(event: KeyboardEvent) {
    if (!this.autoUpgradeReserveInputFocused) {
      return false;
    }

    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      this.autoUpgradeReserveInputFocused = false;
      this.requestControl({ type: "reserve", value: this.autoUpgradeReserveDraft });
      this.updateCards();
      return true;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      this.autoUpgradeReserveDraft = Math.floor(this.autoUpgradeReserveDraft / 10);
      this.updateCards();
      return true;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const nextText =
        this.autoUpgradeReserveDraft === 0 ? event.key : `${this.autoUpgradeReserveDraft}${event.key}`;
      const next = Number.parseInt(nextText, 10);
      if (validReserveChars(next)) this.autoUpgradeReserveDraft = next;
      this.updateCards();
      return true;
    }

    event.preventDefault();
    return true;
  }

  private setAutoUpgradeReserve(value: number) {
    if (this.localInputBlocked()) return;
    this.requestControl({ type: "reserve", value });
  }

  private handleGameKey(event: KeyboardEvent) {
    const actionId = this.matchGameControlAction(event);
    if (!actionId) {
      return false;
    }

    this.runControlAction(actionId);
    return true;
  }

  private matchGameControlAction(event: KeyboardEvent) {
    const code = keyCodeForEvent(event);
    if (!code) {
      return undefined;
    }

    const bindings = getKeybindings();
    for (const definition of toolControlDefinitions) {
      if (!this.debugModeEnabled && isDebugToolControlAction(definition.id)) {
        continue;
      }
      if (bindings[definition.id] === code) {
        return definition.id;
      }
    }

    for (let index = 1; index <= CONTROL_SLOT_COUNT; index += 1) {
      const actionId = slotControlAction(index);
      if (bindings[actionId] === code) {
        return actionId;
      }
    }

    for (const id of this.selectedCardIds) {
      const actionId = cardControlAction(isImitatorCard(id) ? "?" : id);
      if (bindings[actionId] === code) {
        return actionId;
      }
    }

    return undefined;
  }

  private runControlAction(actionId: ControlActionId) {
    if (actionId.startsWith("slot:")) {
      const slotIndex = Number.parseInt(actionId.slice(5), 10) - 1;
      const cardId = this.selectedCardIds[slotIndex];
      if (cardId) {
        this.selectCard(cardId);
      }
      return;
    }

    if (actionId.startsWith("card:")) {
      const cardId = actionId.slice(5) as CardId;
      if (this.selectedCardIds.includes(cardId) || cardId === "?" && this.selectedCardIds.some(isImitatorCard)) {
        this.selectCard(cardId);
      }
      return;
    }

    this.runToolControlAction(actionId as ToolControlAction);
  }

  private runToolControlAction(actionId: ToolControlAction) {
    switch (actionId) {
      case "tool:erase":
        this.toggleEraser();
        return;
      case "tool:autoUpgrade":
        this.toggleAutoUpgradeMode();
        return;
      case "tool:shifter":
        this.toggleShifterMode();
        return;
      case "tool:reselect":
        this.openReselection();
        return;
      case "tool:debugDamage":
        this.toggleDebugDamageMode();
        return;
      case "tool:superDebugDamage":
        this.toggleSuperDebugDamageMode();
        return;
      case "tool:debugChars":
        this.grantDebugChars();
        return;
      case "tool:autoUpgradeEnabled":
        this.toggleAutoUpgradeEnabled();
        return;
      case "tool:autoUpgradeReserve":
        this.focusAutoUpgradeReserveInput();
        return;
      case "tool:pause":
        this.toggleBattlePause();
        return;
    }
  }

  private selectCard(id: CardId) {
    if (id === "?") id = this.selectedCardIds.find(isImitatorCard) ?? id;
    if (this.localInputBlocked()) return;
    if (!this.selectedCardIds.includes(id)) {
      return;
    }
    this.eraserMode = false;
    this.shifter.deactivate();
    this.clearPlacementGhosts();
    this.autoUpgradeMode = false;
    this.debugDamageMode = null;
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    this.selectedCardId = id;
    this.cardList?.ensureVisible(id);
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards();
  }

  private getSelectedDefinition() {
    return this.getDefinition(this.selectedCardId);
  }

  private isManualShockTower(tower?: Tower): tower is Tower {
    return isShockTower(tower);
  }

  private getDefinition(id: CardId) {
    return getCardDefinition(id);
  }

  private sanitizeLoadout(selectedCards?: CardId[], playback = Boolean(this.playback)) {
    const slotCount = playback ? CARD_SLOT_COUNT : unlockedCardSlotCount();
    const validCards = uniqueLoadout((selectedCards ?? defaultCardLoadout).filter((id, index, cards): id is CardId => {
      return hasCardDefinition(id) && (playback || isCardUnlocked(id)) && cards.indexOf(id) === index;
    }), slotCount);

    return validCards.length > 0
      ? validCards.slice(0, slotCount)
      : [...defaultCardLoadout].slice(0, slotCount);
  }

  private executeBattleAction(action: BattleAction) {
    if (this.gameOver) return;
    switch (action.type) {
      case "imitation":
        // Old saves may contain queued imitations; the projectile circuit never executes them.
        break;
      case "companionLaser": case "companionMortar": case "bossDeathLaser": case "bossDeathMortar": case "bossReinforcements":
        executeBossAttack(this.bossRuntime(), action); break;
      case "enemyShot": case "enemyLaser": case "enemyMortar": executeEnemyAttack(this.combatRuntime(), action); break;
      case "volley":
        if (action.behavior) break;
        if (action.tower.inPlay && action.copyRevision === action.tower.copyRevision) {
          const execute = () => {
            const type = towerBehaviorType(action.tower);
            const behavior = getCardBehavior(type);
            if (behavior !== projectileCardBehavior && behavior !== slowAuraCardBehavior &&
              this.routeTowerAction(action.tower, { kind: "attack", hitCount: action.hitCount })) return;
            getCardBehavior(type).execute(action.tower, this.getDefinition(type), this.combatRuntime(), action.hitCount);
          };
          execute();
        }
        break;
      case "targetedEffect": this.targetedEffects.resolvePendingEffectCard(action.tower); break;
      case "shock": executeShockPulse(this.triggerTowerRuntime(), action); break;
      case "spellMortar": this.towerSkills.launchSpellMortar(action); break;
    }
  }

  private battleState(): BattleSaveState {
    return {
      nullifiedTowers: this.nullification.snapshot(),
      edgeTowers: this.edgeTowers,
      simulation: { ...this.session.snapshot(),
        mirrorNextGroupId: this.mirrors.snapshotNextGroupId() },
      ...this.world.progressSnapshot(), gameSpeed: this.gameSpeed, selectedCardId: this.selectedCardId,
      debugModeEnabled: this.debugModeEnabled,
      cardDeadlines: this.cardStates.map(card => ({ id: card.definition.id, readyAt: card.readyAt })),
      autoUpgradeEnabled: this.autoUpgradeEnabled, autoUpgradeReserveChars: this.autoUpgradeReserveChars,
      towers: this.towers, enemies: this.enemies, boss: this.boss, projectiles: this.projectiles,
      enemyProjectiles: this.enemyProjectiles, mortarProjectiles: this.mortarProjectiles,
      actions: this.actionQueue.snapshot(), storage: this.storage.snapshot(), shifter: this.shifter.snapshot(),
      reselection: this.reselection.snapshot(), extraction: this.extraction.value,
      spellMortarFlights: this.towerSkills.snapshotFlights(), sealedCells: [...this.sealedCells],
      timedCellSeals: this.timedCellSeals.snapshot(), entityIds: this.world.entityIds.snapshot()
    };
  }

  private saveSurvivalBattle() {
    if (this.playback) return true;
    if (!this.levelConfig.survival || this.gameOver) return false;
    try {
      return writeSurvivalSave({ version: 1, levelId: this.levelId, savedAt: Date.now(), wave: this.wave,
        difficultyVersion: DIFFICULTY_VERSION,
        difficulty: this.difficulty, unlimitedFirepower: this.unlimitedFirepower,
        selectedCards: [...this.selectedCardIds], graph: captureBattleSnapshot(this.battleState()) });
    } catch { return false; }
  }

  prepareDesktopClose() {
    if (!this.levelConfig.survival || this.gameOver || this.playback) return true;
    return this.saveSurvivalBattle();
  }

  private applyBattleSave(state: BattleSaveState) {
    restoreBattleEntityIds(state, this.world.entityIds);
    this.session.restore(state.simulation, state.battleTime);
    this.world.restoreProgress(state);
    this.selectedCardId = state.selectedCardId;
    if (state.debugModeEnabled !== undefined) this.debugModeEnabled = state.debugModeEnabled;
    this.autoUpgradeEnabled = state.autoUpgradeEnabled;
    this.autoUpgradeReserveChars = state.autoUpgradeReserveChars;
    this.towers = state.towers;
    this.nullification.restore(state.nullifiedTowers);
    drawNullifiedTowers(this.nullifiedTowerGraphics, this.nullification.snapshot(), this.battleTime);
    this.edgeTowers = state.edgeTowers ?? [];
    // Grid-based equals from old saves cannot remain attackable special towers.
    this.towers = this.towers.filter(tower => {
      if (tower.type !== "=") return true;
      this.chars += this.getDefinition("=").cost * tower.level;
      tower.inPlay = false; tower.body.destroy(); return false;
    });
    for (const tower of this.towers) {
      delete tower.numberMemory; delete tower.numberChannels; delete tower.numberValue; delete tower.equationLevel;
      if (!tower.pipelineSkillContexts) {
        if (tower.imitatedSkills?.length) { tower.skills = {}; tower.flyingUntil = 0; }
        delete tower.imitatedSkills; delete tower.imitatedSkillLevels;
      }
      syncTowerLevelText(tower);
      syncTowerAutoUpgradeVisual(tower, this.autoUpgradeEnabled);
    }
    this.enemies = state.enemies;
    this.boss = state.boss ?? null;
    this.bossHomePosition = state.bossHomePosition ?? (this.boss ? { x: this.boss.x, y: this.boss.y } : null);
    this.projectiles = state.projectiles;
    this.enemyProjectiles = state.enemyProjectiles;
    this.mortarProjectiles = state.mortarProjectiles;
    this.occupied.clear();
    syncTowerOccupancy(this.towers, this.occupied);
    this.sealedCells = new Set(state.sealedCells);
    this.timedCellSeals.restore(state.timedCellSeals);
    drawTimedCellSeals(this.timedCellSealGraphics, this.timedCellSeals.entries, this.battleTime, this.timedCellWarningGraphics);
    this.storage.restore(state.storage);
    this.shifter.restore(state.shifter);
    this.reselection.restore(state.reselection);
    this.extraction.restore(state.extraction);
    this.actionQueue.restore(state.actions);
    this.mirrors.restoreGroups(state.simulation?.mirrorNextGroupId);
    syncTowerTopology(this.towers);
    this.numbers.sync();
    for (const tower of this.towers) syncFriendlyRangeVisual(tower);
    this.topology.update();
    for (const deadline of state.cardDeadlines) {
      const card = this.cardStatesById.get(deadline.id);
      if (card) card.readyAt = deadline.readyAt;
    }
    this.battlePaused = true;
    for (const flight of state.spellMortarFlights) this.towerSkills.restoreSpellMortarFlight(flight);
    this.setGameSpeed(state.gameSpeed);
    this.syncAutoUpgradeBorders();
    this.updateCards();
    this.updateHud();
    drawEnemyHealthLinks(this.enemyHealthLinks, this.enemies, this.battleTime);
    if (!this.playback) this.session.startRecordingFromCheckpoint(captureBattleSnapshot(this.battleState()), this.selectedCardIds);
  }

  private localInputBlocked() {
    return !this.session.executingCommand && (!!this.playback || this.gameOver || this.menuOpen || this.reselectOpen);
  }

  private localInput(action: () => void) {
    if (this.localInputBlocked()) return;
    action();
    if (!this.tutorial?.usesToolInteraction || this.gameOver) return;
    const input: TutorialInteraction = {
      tool: this.eraserMode ? "erase" : this.autoUpgradeMode ? "autoUpgrade" : this.shifter.isActive() ? "shifter" : "none",
      selected: this.shifter.isActive() ? this.shifter.selectedTowers().map(tower => towerOperationRef(tower).id) : []
    };
    if (!sameTutorialInteraction(this.tutorialInteraction, input)) this.requestControl({ type: "tutorialInput", input });
  }

  /** Legacy input adapter for current-version recordings and diagnostic fixtures. */
  submitBattleCommand(command: BattleCommand) {
    if (this.playback || this.gameOver || this.menuOpen || this.reselectOpen) return;
    this.session.submit(command, this.sessionRuntime.executeCommand);
  }

  private executeCommand(command: BattleCommand) {
    if (command.type === "control") return this.applyPlayerControl(command.actorId, command.control);
    if (command.type === "operation") return this.applyPlayerOperation(command.actorId, command.operation);
    this.localInput(() => this.executeLegacyInput(command));
  }

  private executeLegacyInput(command: Exclude<BattleCommand, { type: "control" | "operation" }>) {
    switch (command.type) {
      case "tutorialAdvance": this.applyPlayerControl(LOCAL_BATTLE_ACTOR.id, { type: "tutorialAdvance" }); break;
      case "cancelTargeting": this.cancelSpellMortarTargeting(); break;
      case "debugMode":
        this.applyPlayerControl(LOCAL_BATTLE_ACTOR.id, command);
        if (!command.enabled) this.debugDamageMode = null;
        break;
      case "pointer": this.handlePointerDown(this.replayPointer(command.pointer)); break;
      case "selectCard": this.selectCard(command.id); break;
      case "tool": this.runToolControlAction(command.action); break;
      case "reserve": this.setAutoUpgradeReserve(command.value); break;
      case "reserveConfirm":
        this.autoUpgradeReserveInputFocused = false;
        this.attemptAutoUpgrades(); this.updateCards(); break;
      case "reselect":
        this.cancelSpellMortarTargeting();
        this.applyPlayerControl(LOCAL_BATTLE_ACTOR.id, command);
        break;
    }
  }

  private replayPointer(pointer: BattlePointer): Phaser.Input.Pointer {
    return { x: pointer.x, y: pointer.y, event: { shiftKey: pointer.shift, ctrlKey: pointer.ctrl, button: pointer.right ? 2 : 0 },
      rightButtonDown: () => pointer.right } as Phaser.Input.Pointer;
  }

  exportReplay(): BattleReplay {
    return this.session.exportReplay();
  }

  battleChecksum() {
    return battleChecksum(this.battleState());
  }

  private isInsideBoard(x: number, y: number) {
    return x >= BOARD_X && x < BOARD_X + BOARD_WIDTH && y >= BOARD_Y && y < BOARD_Y + BOARD_HEIGHT;
  }

  private cellIsDeployable(lane: number, column: number) {
    return lane >= 0 && lane < LANES && column >= 0 && column < COLUMNS &&
      !this.nullification.isOccupied(lane, column) &&
      !this.sealedCells.has(gridCellKey(lane, column)) && !this.timedCellSeals.isSealed(lane, column);
  }

  private isShiftPointer(pointer: Phaser.Input.Pointer) {
    const event = pointer.event as MouseEvent | undefined;
    return Boolean(event && "shiftKey" in event && event.shiftKey);
  }

  private isCtrlPointer(pointer: Phaser.Input.Pointer) {
    const event = pointer.event as MouseEvent | undefined;
    return Boolean(event && "ctrlKey" in event && event.ctrlKey);
  }

  private isRightPointer(pointer: Phaser.Input.Pointer) {
    const event = pointer.event as MouseEvent | undefined;
    return Boolean(event?.button === 2 || pointer.rightButtonDown());
  }

}

function placementGhostKey(ghosts: PlacementGhostSpec[]) {
  let key = "";
  for (let index = 0; index < ghosts.length; index += 1) {
    const ghost = ghosts[index];
    if (index > 0) {
      key += "|";
    }
    key += `${ghost.type}:${ghost.lane}:${ghost.column}`;
  }
  return key;
}
