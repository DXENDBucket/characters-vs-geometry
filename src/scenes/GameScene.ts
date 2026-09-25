import Phaser from "phaser";
import { bindBattleAudio } from "../audio/battleAudio";
import { playSound, soundPlayer } from "../audio/player";
import { BattleProfile, type BattleRewards } from "../battleProfile";
import {
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
  GAME_HEIGHT,
  GAME_SPEED_MAX,
  GAME_SPEED_MIN,
  LANES,
  clampDifficulty,
  getDifficultyConfig,
  migrateDifficulty,
  palette
} from "../config";
import { chapterIdForLevelId } from "../data/chapters";
import { getLevelConfig } from "../data/levels";
import type { BattleAction, ScheduleBattleAction } from "../game/battleActions";
import { BattleAuthority } from "../game/battleAuthority";
import { battleChecksum } from "../game/battleChecksum";
import { validateReplay, type BattleCommand, type BattlePointer, type BattleReplay, type RecordedBattleCommand } from "../game/battleCommands";
import {
  validBattleControl, validReserveChars,
  type BattleControl
} from "../game/battleControls";
import { setBattleDiscoveryObserver } from "../game/battleDiscovery";
import { BattleEncounter } from "../game/battleEncounter";
import { setBattleEntityIds } from "../game/battleEntityIds";
import type { BattleResult } from "../game/battleLifecycle";
import { battleCardTime, type BattleCardState } from "../game/battleLoadout";
import { type LiveBattleOperationRuntime } from "../game/battleOperationRuntime";
import {
  LOCAL_BATTLE_ACTOR,
  edgeOperationRef,
  towerOperationRef,
  validBattleActorId, validBattleOperation,
  type BattleOperation, type BattleOperationResult
} from "../game/battleOperations";
import type { BattleOperationActor } from "../game/battleParticipants";
import { LEGACY_BATTLE_POLICY, battleCardAllowed, copyBattlePolicy, type BattlePolicy } from "../game/battlePolicy";
import type { BattleSaveState } from "../game/battleSaveState";
import { BattleSession, type BattleSessionRuntime } from "../game/battleSession";
import { BATTLE_RULES_VERSION, setBattlePlayback, setBattleRandom } from "../game/battleSimulation";
import { restoreBattleSnapshot } from "../game/battleSnapshot";
import { BattleSyncHost } from "../game/battleSyncHost";
import { BattleWorld, type BattleWorldSystems } from "../game/battleWorld";
import { BattlefieldCells } from "../game/battlefieldCells";
import { boardPointerTarget } from "../game/boardPointerTarget";
import { type BossRuntime } from "../game/bossRuntime";
import { applyBossPhaseSkillState } from "../game/bossSkillRules";
import { captureBattleSnapshot } from "../game/captureBattleSnapshot";
import { deploymentCardId, isImitatorCard, uniqueLoadout } from "../game/cardIdentity";
import { charsAreSoftcapped } from "../game/charSoftcap";
import type { CombatRuntime } from "../game/combatRuntime";
import { EdgeTowerControls } from "../game/edgeTowerControls";
import { battleWorldOptions, createBattleContext } from "../game/battleSetup";
import { endlessEnemyHpMultiplier } from "../game/endlessEnvironment";
import { enemiesWithPassengers } from "../game/enemyContainers";
import { advanceEnemies } from "../game/enemyRuntime";
import { RESELECT_UNLOCK_LEVEL } from "../game/loadoutReselection";
import { ProjectileCircuitController, edgeAtPoint, edgePosition } from "../game/projectileCircuit";
import {
  type ProjectileRuntime
} from "../game/projectileRuntime";
import type { SaveGraph } from "../game/saveGraph";
import { type SlowAuraSources } from "../game/slowAura";
import {
  TargetedEffectCardController
} from "../game/targetedEffectCards";
import { gridCellKey } from "../game/targeting";
import { TimedCellSeals } from "../game/timedCellSeals";
import type { TowerActionEvent } from "../game/towerActions";
import { TowerBoardSimulation } from "../game/towerBoard";
import { advanceTowerAttacks } from "../game/towerCombat";
import { TowerDeploymentController } from "../game/towerDeployment";
import { TowerExtractionPool } from "../game/towerExtraction";
import { canUpgradeTowerWithCard, supportsTowerAutoUpgrade, towerBehaviorType } from "../game/towerIdentity";
import { TowerMirrorController } from "../game/towerMirrors";
import { TowerNullificationController } from "../game/towerNullification";
import { isParenthesisTower, isTowerShellType, towerInPlacementLayer } from "../game/towerOccupancy";
import { TowerPushController } from "../game/towerPush";
import { TowerShifterController, type TowerShifterRuntime } from "../game/towerShifter";
import { TowerSkillController, type TowerSkillRuntime } from "../game/towerSkills";
import { TowerStorageController } from "../game/towerStorage";
import { physicalTowerCell, towerCell } from "../game/towerTopology";
import { TowerTopologyController } from "../game/towerTopologyController";
import {
  syncFriendlyRangeVisual, syncTowerAutoUpgradeVisual, syncTowerFacingVisual,
  syncTowerLevelText,
  syncTowerTrueDamageVisual
} from "../game/towers";
import {
  isShockTower,
  type TriggerTowerRuntime
} from "../game/triggerTowers";
import {
  isTutorialMechanic,
  type TutorialToolId
} from "../game/tutorial";
import { sameTutorialInteraction, type TutorialInteraction } from "../game/tutorialInteraction";
import { createTutorialController, tutorialLoadout } from "../game/tutorialRegistry";
import {
  damageBoss,
  damageEnemy,
  type UnitLifecycleRuntime
} from "../game/unitLifecycle";
import { t } from "../i18n";
import { isCardUnlocked, isLevelCompleted, unlockedCardSlotCount } from "../progress";
import { allCardDefinitions, defaultCardLoadout, getCardDefinition, hasCardDefinition } from "../registry/cardDefinitions";
import { BattleCardList } from "../render/battleCardList";
import { battleEncounterPresentation } from "../render/battleEncounter";
import { attachBoardPresentation, attachCombatPresentation, createLiveBattleRuntime, type LiveBattlePorts, type LiveBattleRuntime } from "../render/battleRuntime";
import { BattlefieldLayer, useBattlefieldCanvas } from "../render/battlefieldLayer";
import { BoardToolPreview, type BoardToolHint } from "../render/boardToolPreview";
import { createCellSealMark } from "../render/cellSealMark";
import { drawCircuitEdges } from "../render/circuitEdges";
import { makeEraseMark, makeProductionPulse, makeShellBurst, makeShockPulse } from "../render/combatEffects";
import { EncyclopediaPanel } from "../render/encyclopediaPanel";
import { drawEnemyHealthLinks } from "../render/enemyHealthLinks";
import { syncEnemyStatusVisuals } from "../render/enemyStatus";
import { syncHexArmorAuras } from "../render/enemySupport";
import {
  createGameHud,
  createGameOverlay,
  refreshGameHudSettings,
  showGameOverlay,
  showToast as showUiToast,
  updateCardViews,
  updateExtractionPool,
  updateGameHud,
  updateReselectButtonState,
  updateToolButtonStates,
  type GameHudElements,
  type GameOverlayElements
} from "../render/gameUi";
import { GuidedTutorialView } from "../render/guidedTutorialView";
import { drawNullifiedTowers } from "../render/nullifiedTowers";
import { drawTowerShellBorder } from "../render/parenthesisTower";
import { PauseMenu } from "../render/pauseMenu";
import { drawTimedCellSeals } from "../render/timedCellSeals";
import { towerAttackRuntime } from "../render/towerCombat";
import { createUnitBorder } from "../render/unitShapes";
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
import { readSurvivalSave, writeSurvivalSave, type SurvivalSave } from "../survivalSaves";
import type {
  CardDefinition,
  CardId,
  CubeBoss,
  DifficultyConfig,
  EdgeTower,
  Enemy,
  EnemyProjectile,
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

type DebugDamageMode = "normal" | "super" | null;

const BOSS_PHASE_BAR_COLORS = [palette.heart, 0xff9f43, palette.magic, palette.gold];
const BOSS_PHASE_BAR_BACK = palette.magic;
const BOSS_PHASE_FINAL_BAR_BACK = palette.dim;

type LiveBattleEntities = { tower: Tower; enemy: Enemy; boss: CubeBoss; projectile: Projectile;
  enemyProjectile: EnemyProjectile; mortar: MortarProjectile };

export class GameScene extends Phaser.Scene {
  private world!: BattleWorld<LiveBattleEntities>;
  private runtime!: LiveBattleRuntime;
  private livePorts!: LiveBattlePorts;
  private worldSystems!: BattleWorldSystems<LiveBattleEntities>;
  private topology!: TowerTopologyController;
  private numbers!: ProjectileCircuitController;
  private get edgeTowers() { return this.world.edgeTowers; }
  private set edgeTowers(value: EdgeTower[]) { this.world.edgeTowers = value; }
  private edgeControls!: EdgeTowerControls;
  private circuitEdges!: Phaser.GameObjects.Graphics;
  private enemyHealthLinks!: Phaser.GameObjects.Graphics;
  private session!: BattleSession;
  private authority!: BattleAuthority;
  private syncHost?: BattleSyncHost;
  private replicaCheckpoint?: SaveGraph;
  get commandAuthority() { return this.authority; }
  private get simulation() { return this.session.clock; }
  private get playback() { return this.session?.playback; }
  private get actionQueue() { return this.session.actions; }
  private readonly sessionRuntime: BattleSessionRuntime = {
    step: () => this.stepBattle(),
    executeCommand: command => this.executeCommand(command),
    canAdvance: () => !this.gameOver && !this.localModalPausesBattle
  };
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
  private get selectedCardIds() { return this.world.loadout.ids; }
  private get levelElapsed() { return this.world.levelElapsed; }
  private set levelElapsed(value: number) { this.world.levelElapsed = value; }
  private get battleTime() { return this.world.battleTime; }
  private set battleTime(value: number) { this.world.battleTime = value; }
  private get cardTime() { return this.world.cardTime; }
  private set cardTime(value: number) { this.world.cardTime = value; }
  private get nextNaturalProduceAt() { return this.world.nextNaturalProduceAt; }
  private set nextNaturalProduceAt(value: number) { this.world.nextNaturalProduceAt = value; }
  private get cardStates() { return this.world.loadout.cards; }
  private cardList?: BattleCardList;
  private battlefield!: BattlefieldLayer;
  private get cardStatesById() { return this.world.loadout.byId; }
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
  private get wave() { return this.world.wave; }
  private set wave(value: number) { this.world.wave = value; }
  private get waveTracker() { return this.world.waveTracker; }
  private set waveTracker(value: WaveTracker | null) { this.world.waveTracker = value; }
  private get enemiesDefeated() { return this.world.enemiesDefeated; }
  private set enemiesDefeated(value: number) { this.world.enemiesDefeated = value; }
  private get towerOrder() { return this.world.towerOrder; }
  private set towerOrder(value: number) { this.world.towerOrder = value; }
  private get gameOver() { return this.world.gameOver; }
  private profile!: BattleProfile;
  private get controls() { return this.session.controls; }
  private get battlePaused() { return this.controls.paused; }
  private set battlePaused(value: boolean) { this.controls.paused = value; }
  private get gameSpeed() { return this.controls.speed; }
  private set gameSpeed(value: number) { this.controls.speed = value; }
  private eraserMode = false;
  private towerBoard!: TowerBoardSimulation<Tower>;
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
  private towerShifterRuntimeCache!: TowerShifterRuntime;
  private encounter!: BattleEncounter<LiveBattleEntities>;
  private battleCells!: BattlefieldCells<Tower>;
  private get projectileMotion() { return this.runtime.projectileMotion; }
  private get tutorial() { return this.world.tutorial; }
  private set tutorial(value: ReturnType<typeof createTutorialController>) { this.world.tutorial = value; }
  private get tutorialInteraction() { return this.world.tutorialInteraction; }
  private set tutorialInteraction(value: TutorialInteraction) { this.world.tutorialInteraction = value; }
  private tutorialView?: GuidedTutorialView;
  private ui!: GameHudElements;
  private overlay!: GameOverlayElements;
  private pauseMenu!: PauseMenu;
  private menuOpen = false;
  private battleSettingsOpen = false;
  private reselectOpen = false;
  private get localModalPausesBattle() { return this.session.policy.pauseOnLocalModal && (this.menuOpen || this.reselectOpen); }
  private get reselection() { return this.world.loadout.reselection; }
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

  init(data: { levelId?: string; chapterId?: string; selectedCards?: CardId[]; difficulty?: number; unlimitedFirepower?: boolean; resume?: boolean; seed?: number; replay?: BattleReplay; participants?: readonly BattleOperationActor[]; policy?: BattlePolicy; persistProgress?: boolean; replica?: BattleReplay }) {
    const replica = data.replica ? structuredClone(data.replica) : undefined;
    if (replica) {
      validateReplay(replica);
      if (data.replay || !replica.checkpoint || replica.commands.length) throw new Error("Invalid replica bootstrap");
      data = { ...data, ...replica, resume: false };
    }
    this.replicaCheckpoint = replica?.checkpoint;
    const playback = data.replay ? structuredClone(data.replay) : undefined;
    if (playback) {
      validateReplay(playback);
      playback.difficulty = migrateDifficulty(playback.difficulty, playback.difficultyVersion);
      playback.difficultyVersion = DIFFICULTY_VERSION;
      data = { ...data, ...playback, resume: false };
    }
    const seed = (data.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
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
    const debugModeEnabled = playback?.debug ?? replica?.debug ?? isDebugModeEnabled();
    this.difficultyConfig = battleWorldOptions({ levelId: this.levelId, difficulty: this.difficulty,
      unlimitedFirepower: this.unlimitedFirepower }).difficulty;
    const policy = playback ? playback.policy : copyBattlePolicy(data.policy ?? {
      version: 1, slotCount: unlockedCardSlotCount(), allowedCards: allCardDefinitions.filter(card => isCardUnlocked(card.id)).map(card => card.id),
      reselectEnabled: !isTutorial && isLevelCompleted(RESELECT_UNLOCK_LEVEL), pauseOnLocalModal: true
    });
    const selectedCards = this.sanitizeLoadout(tutorialLoadout(tutorialMechanic, data.selectedCards), policy ?? LEGACY_BATTLE_POLICY,
      Boolean(playback || this.resumeSave || replica));
    const context = createBattleContext({ version: BATTLE_RULES_VERSION, levelId: this.levelId, difficulty: this.difficulty,
      difficultyVersion: DIFFICULTY_VERSION,
      unlimitedFirepower: this.unlimitedFirepower, selectedCards,
      seed, debug: debugModeEnabled, ...(data.participants ? { participants: data.participants } : {}),
      ...(policy ? { policy } : {}) }, playback, Boolean(replica));
    this.session = context.session;
    this.resetCommandAuthority();
    setBattleRandom(this, this.session.random);
    setBattlePlayback(this, Boolean(playback));
    this.profile = new BattleProfile(!playback && !replica && data.persistProgress !== false, this.levelId, this.difficulty, !!this.levelConfig.survival);
    setBattleDiscoveryObserver(this, kind => this.profile.enemySeen(kind));
    // Factories and snapshot hydration below attach all live display objects.
    this.world = context.world as BattleWorld<LiveBattleEntities>;
    setBattleEntityIds(this, this.world.entityIds);
    this.selectedCardId = this.selectedCardIds.includes("X") ? "X" : this.selectedCardIds[0];
    this.sealedCellMarks = new Map<string, Phaser.GameObjects.Text>();
    this.menuOpen = false;
    this.battleSettingsOpen = false;
    this.reselectOpen = false;
    this.reselectShade = undefined;
    this.eraserMode = false;
    this.placementGhosts = [];
    this.placementGhostKey = "";
    this.autoUpgradeMode = false;
    this.debugDamageMode = null;
    this.autoUpgradeReserveInputFocused = false;
    this.autoUpgradeReserveDraft = 0;
    this.tutorial = null;
    this.runtime = createLiveBattleRuntime(this, this.world, this.session, {
      cards: () => this.updateCards(),
      controlChanged: type => this.syncControlView(type),
      debugChars: amount => {
        makeProductionPulse(this, this.ui.debugButton.x, this.ui.debugButton.y + 34, amount);
        this.showToast(t("toast.debugChars")); this.updateCards(); this.updateHud();
      },
      debugDamage: ({ x, y }) => {
        makeShellBurst(this, x, y, Math.min(CELL_WIDTH, CELL_HEIGHT) * 0.5, "true");
        makeShockPulse(this, x, y, CELL_WIDTH, CELL_HEIGHT);
      },
      erased: (x, y) => { makeEraseMark(this, x, y); playSound("erase"); },
      autoUpgrade: (tower, active) => syncTowerAutoUpgradeVisual(tower as Tower, active),
      placement: () => this.syncPlacementGhost(this.input.activePointer),
      topology: () => this.topology.update(),
      push: time => this.towerPush.update(time),
      arming: time => this.updateArmingTowers(time),
      suspended: () => {
        this.shifter.clearSelection(); this.cancelSpellMortarTargeting(); this.towerPush.cancel(); this.topology.cancel();
      },
      nullification: () => drawNullifiedTowers(this.nullifiedTowerGraphics, this.nullification.snapshot(), this.battleTime),
      production: (amount, x, y) => makeProductionPulse(this, x, y, amount),
      waveStarted: (wave, isFlag) => {
        playSound(isFlag ? "flag" : "wave");
        this.showToast(isFlag ? `${t("label.flag")} ${wave / this.levelConfig.wavesPerFlag}` : `${t("label.wave")} ${wave}`);
      },
      enemySeen: kind => this.profile.enemySeen(kind), bossSeen: kind => this.profile.bossSeen(kind),
      completedWaves: waves => this.profile.completedWaves(waves), defeatedBoss: rank => this.profile.defeatedBoss(rank),
      finished: result => this.battlefield.ui(() => {
        const rewards = this.profile.settle(result);
        playSound(result.outcome); this.showBattleResult(result, rewards);
      })
    });
    this.worldSystems = this.runtime.systems as BattleWorldSystems<LiveBattleEntities>;
    this.extraction = this.runtime.extraction;
    this.targetedEffects = this.runtime.targetedEffects as TargetedEffectCardController;
    this.edgeControls = this.runtime.edgeControls;
    this.numbers = this.runtime.circuit;
    this.mirrors = this.runtime.mirrors as TowerMirrorController;
    this.storage = this.runtime.storage as TowerStorageController;
    this.nullification = this.runtime.nullification as TowerNullificationController;
    this.deployment = this.runtime.deployment as TowerDeploymentController;
    this.towerBoard = this.runtime.board as TowerBoardSimulation<Tower>;
    this.encounter = this.runtime.encounter as BattleEncounter<LiveBattleEntities>;
    this.battleCells = this.runtime.cells as BattlefieldCells<Tower>;
    this.topology = new TowerTopologyController(this, () => ({ towers: this.towers, battleTime: this.battleTime,
      onChanged: () => { this.updateLevelAuras(); this.mirrors.syncMirrors(); this.clearPlacementGhosts(); } }));
    this.towerSkills = new TowerSkillController(this, () => this.towerSkillRuntime(), this.runtime);
    this.shifter = new TowerShifterController(() => this.towerShifterRuntime(),
      this.runtime.shifter as import("../game/towerShifterRules").TowerShifterSimulation<Tower>);
    this.towerPush = new TowerPushController(this, () => ({
      scene: this, towers: this.towers, occupied: this.occupied, cardTime: this.battleTime, battleTime: this.battleTime,
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column),
      onMoved: moves => this.runtime.towersMoved(moves), onTowerAction: this.routeTowerAction,
      eraseTower: tower => this.runtime.removeTower(tower)
    }), this.runtime.push as import("../game/towerPushRules").TowerPushSimulation<Tower>);
    this.towerSkillRuntimeCache = this.createTowerSkillRuntime();
    this.towerShifterRuntimeCache = this.createTowerShifterRuntime();
    this.livePorts = attachCombatPresentation(this, this.runtime);
    attachBoardPresentation(this, this.runtime, { updateCards: () => this.updateCards(), onFeedback: kind => playSound(kind) });
    this.encounter.presentation = battleEncounterPresentation(this, {
      changed: () => this.updateHud(), phaseChanged: (phase, total) => this.showToast(`PHASE ${phase}/${total}`)
    });
    this.battleCells.presentation = {
      erase: tower => makeEraseMark(this, tower.x, tower.y),
      permanentSeal: (lane, column) => {
        this.sealedCellMarks.set(gridCellKey(lane, column), createCellSealMark(this, lane, column));
      },
      timedSeals: () => drawTimedCellSeals(this.timedCellSealGraphics, this.timedCellSeals.entries, this.battleTime, this.timedCellWarningGraphics),
      changed: () => this.syncPlacementGhost(this.input.activePointer)
    };
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
      resume: () => {
        this.closePauseMenu();
        if (this.session.policy.pauseOnLocalModal && this.battlePaused && !this.gameOver && !this.playback) {
          this.requestControl({ type: "pause", paused: false });
        }
      },
      settings: () => {
        this.pauseMenu.hide();
        this.battleSettingsOpen = true;
        this.scene.launch("SettingsScene", { onReturn: () => {
          this.battleSettingsOpen = false;
          if (!this.menuOpen) return;
          this.refreshBattleSettings();
          this.pauseMenu.show();
        } });
      },
      restart: () => { if (this.session.replica) return; this.scene.restart({
        levelId: this.levelId,
        chapterId: this.chapterId,
        selectedCards: [...this.selectedCardIds],
        difficulty: this.difficulty,
        unlimitedFirepower: this.unlimitedFirepower,
        policy: this.session.policy, participants: this.session.snapshot().participants, persistProgress: this.profile.enabled
      }); },
      exit: () => this.handleOverlayAction()
    });
    this.setGameSpeed(this.gameSpeed);
    if (!this.resumeSave && !this.playback?.checkpoint && !this.replicaCheckpoint) this.spawnBossIfNeeded();
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
    } else if (this.replicaCheckpoint) {
      this.applyBattleSave(restoreBattleSnapshot(this, this.replicaCheckpoint));
      this.replicaCheckpoint = undefined;
    } else if (this.levelConfig.survival && !this.playback) {
      this.profile.clearSurvivalSave();
    }
    if (this.tutorial) {
      this.tutorialView = this.battlefield.ui(() => new GuidedTutorialView({
        scene: this, getCardView: id => this.cardList?.cards.find(card => card.state.definition.id === id),
        getEnemies: () => this.enemies, getToolBounds: id => this.tutorialToolBounds(id)
      }, () => this.localInput(() => { this.requestControl({ type: "tutorialAdvance" }); })));
      this.syncTutorialView();
    }

    this.input.on("pointerdown", this.scenePointerDownHandler);
    this.input.on("pointermove", this.scenePointerMoveHandler);
    this.input.keyboard?.on("keydown", this.sceneKeyDownHandler);
    window.addEventListener("pagehide", this.saveOnPageHide);
    bindBattleAudio(this, !!this.levelConfig.bossKind, () => ({
      paused: this.battlePaused || this.menuOpen || this.reselectOpen, finished: this.gameOver
    }));
    if (this.resumeRequested && !this.playback && !this.gameOver) this.openPauseMenu();
  }

  private cleanupSceneHandlers() {
    this.syncHost?.close(); this.syncHost = undefined;
    setBattleDiscoveryObserver(this);
    this.authority?.close();
    if (this.reselectOpen) this.scene.stop("CardSelectScene");
    if (this.battleSettingsOpen) this.scene.stop("SettingsScene");
    this.menuOpen = false;
    this.reselectOpen = false;
    this.battleSettingsOpen = false;
    soundPlayer.stop("battle");
    window.removeEventListener("pagehide", this.saveOnPageHide);
    this.cardList?.destroy();
    this.cardList = undefined;
    this.pauseMenu?.destroy();
    this.input.off("pointerdown", this.scenePointerDownHandler);
    this.input.off("pointermove", this.scenePointerMoveHandler);
    this.input.keyboard?.off("keydown", this.sceneKeyDownHandler);
    this.clearPlacementGhosts();
    this.tutorialView?.destroy();
    this.tutorialView = undefined;
    this.tutorial?.destroy();
    this.tutorial = null;
    this.shifter?.clearSelection();
    this.towerPush?.destroy();
    this.topology?.destroy();
    this.towerSkills?.cancelSpellMortarTargeting();
    this.storage?.clear();
  }

  private createCardList() {
    this.cardList = this.battlefield.ui(() => new BattleCardList(this, this.cardStates, (id) => this.localInput(() => this.selectCard(id)),
      () => !this.gameOver && !this.menuOpen && !this.reselectOpen));
    this.cardList.ensureVisible(this.selectedCardId);
  }

  update(_time: number, delta: number) {
    if (this.gameOver || this.localModalPausesBattle) {
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

    if (!this.session.advance(delta, this.sessionRuntime)) return;
    this.syncHost?.publish(false);
    this.refreshBattleViews();
  }

  private refreshBattleViews() {
    this.syncBattleOverlays();
    this.shifter.syncSelectionVisuals();
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards();
    this.updateHud();
  }

  private syncTutorialView() {
    if (this.tutorialView && this.tutorial) this.battlefield.ui(() => this.tutorialView!.sync(this.tutorial!.presentation));
  }

  private stepBattle() { this.runtime.step(); }

  private syncBattleOverlays() {
    this.syncTutorialView();
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
    cardState: BattleCardState | undefined,
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
    return this.runtime.executeOperation(actorId, operation);
  }

  private resetCommandAuthority() {
    this.syncHost?.close(); this.syncHost = undefined;
    this.authority?.close();
    this.authority = new BattleAuthority(crypto.randomUUID(), this.session, {
      available: () => !this.gameOver,
      inputTime: () => performance.now(),
      execute: command => this.runtime.executeCommand(command)
    });
  }

  private createPlayerOperationRuntime(): LiveBattleOperationRuntime {
    return this.runtime.operationRuntime() as LiveBattleOperationRuntime;
  }

  submitPlayerOperation(actorId: string, operation: BattleOperation): BattleOperationResult {
    if (!validBattleActorId(actorId) || !validBattleOperation(operation)) return "invalid";
    if (this.playback || this.gameOver) return "unavailable";
    const result = this.authority.submitTrusted(actorId, { type: "operation", operation });
    this.syncHost?.publish();
    return result;
  }

  private applyPlayerControl(actorId: string, control: BattleControl): BattleOperationResult {
    return this.runtime.executeControl(actorId, control);
  }

  private syncControlView(type: BattleControl["type"]) {
    switch (type) {
      case "pause": this.updateCards(); this.updateHud(); break;
      case "speed": this.time.timeScale = this.gameSpeed; this.updateHud(); break;
      case "autoUpgradeEnabled": this.syncAutoUpgradeBorders(); this.updateCards(); break;
      case "debugMode":
        if (!this.debugModeEnabled) this.debugDamageMode = null;
        refreshGameHudSettings(this.ui, this.levelId, this.difficulty, this.debugModeEnabled); this.updateCards();
        break;
      case "reselect":
        this.cardList?.destroy(); this.createCardList();
        if (!this.selectedCardIds.includes(this.selectedCardId)) this.selectedCardId = this.selectedCardIds[0];
        this.updateCards(); break;
      case "tutorialAdvance": this.syncTutorialView(); break;
    }
  }

  submitPlayerControl(actorId: string, control: BattleControl): BattleOperationResult {
    if (!validBattleActorId(actorId) || !validBattleControl(control)) return "invalid";
    // A local menu must not reject an already-authorized control from another participant.
    if (this.playback || this.gameOver) return "unavailable";
    const result = this.authority.submitTrusted(actorId, { type: "control", control });
    this.syncHost?.publish();
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


  private updateLevelAurasIfNeeded() { this.towerBoard.updateIfNeeded(); }
  private syncCopiedTowers() { this.towerBoard.syncCopies(); }
  private updateLevelAuras() { this.towerBoard.refresh(); }

  private cardTimeFor(id: CardId) {
    return battleCardTime(this.getDefinition(id), this.world);
  }

  private gainChars(amount: number, x: number, y: number) { this.runtime.gainChars(amount, x, y); }

  private effectiveChars() { return this.world.effectiveChars(); }

  private spendChars(amount: number) { this.world.spendChars(amount); }

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


  private spawnBossIfNeeded(rank?: number) { this.encounter.spawnBoss(rank); }

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
      onTargetingChanged: () => this.updateCards()
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
      onMoved: moves => this.runtime.towersMoved(moves)
    };
  }

  private combatRuntime(): CombatRuntime { return this.livePorts.combat; }
  private bossRuntime(): BossRuntime { return this.livePorts.boss; }
  private unitLifecycleRuntime(): UnitLifecycleRuntime { return this.runtime.lifecycle; }
  private triggerTowerRuntime(): TriggerTowerRuntime { return this.livePorts.trigger; }
  private projectileRuntime(slowSources?: SlowAuraSources): ProjectileRuntime {
    this.runtime.projectiles.slowAuraSources = slowSources;
    return this.runtime.projectiles;
  }

  private nextTowerOrder() { return this.world.nextTowerOrder(); }

  private spawnGeneratedTower(id: CardId, lane: number, column: number, level: number, facingDirection: -1 | 1 = 1) {
    return this.deployment.spawnGeneratedTower(id, lane, column, level, facingDirection);
  }

  private routeTowerAction = (tower: Tower, event: TowerActionEvent) => {
    return this.runtime.routeTowerAction(tower, event);
  };

  private updateTowers(time: number) {
    advanceTowerAttacks(towerAttackRuntime(this.combatRuntime()), time);
  }

  private updateEnemies(time: number, seconds: number) {
    advanceEnemies(this.combatRuntime(), time, seconds);
  }

  private handleEnemyReachedBase(enemy: Enemy) { return this.encounter.enemyReachedBase(enemy); }

  private spawnWave(levelElapsed: number, gameTime: number) { this.world.spawnWave(levelElapsed, gameTime, this.worldSystems); }

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

  private handleBossDefeated(boss: CubeBoss) { return this.encounter.bossDefeated(boss); }

  private clearEnemiesForBossPhaseTransition() { this.encounter.clearPhaseEnemies(); }

  private resetBossForPhase(boss: CubeBoss) { this.encounter.resetBoss(boss); }

  private sealColumn(column: number) { this.battleCells.sealColumn(column); }

  private eraseTowersInCell(lane: number, column: number) { return this.battleCells.eraseCell(lane, column); }

  private sealCell(lane: number, column: number) { this.battleCells.sealCell(lane, column); }

  private cellCenter(lane: number, column: number) {
    return {
      x: BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2,
      y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
    };
  }

  private triggerShockTower(tower: Tower) {
    this.runtime.triggerShockTower(tower);
  }

  private triggerTrapTower(tower: Tower, target: Enemy | CubeBoss | "boss") {
    this.runtime.triggerTrapTower(tower, target);
  }

  private updateCards() {
    const shifterMode = this.shifter.isActive();
    const views = this.cardList?.cards ?? [];
    for (const view of views) {
      view.displayTime = battleCardTime(view.state.definition, this.world);
    }

    updateCardViews(views, {
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
    updateReselectButtonState(this.ui, this.session.policy.reselectEnabled,
      this.reselection.readyRatio(this.battleTime), !isTutorialMechanic(this.levelConfig.specialMechanic));
  }

  private openReselection() {
    if (this.playback) return;
    if (this.gameOver || this.menuOpen || this.reselectOpen || isTutorialMechanic(this.levelConfig.specialMechanic)) return;
    if (!this.session.policy.reselectEnabled) {
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
    if (this.session.policy.pauseOnLocalModal) this.scene.pause();
    this.scene.launch("CardSelectScene", {
      levelId: this.levelId,
      chapterId: this.chapterId,
      difficulty: this.difficulty,
      unlimitedFirepower: this.unlimitedFirepower,
      reselect: {
        selectedCards: [...this.selectedCardIds],
        policy: this.session.policy,
        onConfirm: (cards: CardId[]) => this.closeReselection(cards),
        onCancel: () => this.closeReselection()
      }
    });
  }

  private closeReselection(cards?: CardId[]) {
    if (!this.reselectOpen) return false;
    this.reselectOpen = false;
    const result = cards?.length ? this.requestControl({ type: "reselect", cards }) : undefined;
    this.reselectShade?.destroy();
    this.reselectShade = undefined;
    if (this.session.policy.pauseOnLocalModal) this.scene.resume();
    this.updateCards();
    this.syncPlacementGhost(this.input.activePointer);
    if (result && result !== "handled") this.showToast(t(result === "cooldown" ? "toast.cooldown" : "toast.reselectUnavailable"));
    return result === "handled";
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

  private attemptAutoUpgrades() { this.runtime.autoUpgrade(); }

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
    if (this.session.policy.pauseOnLocalModal) this.scene.pause();
    this.pauseMenu.show();
  }

  private closePauseMenu() {
    this.pauseMenu.hide();
    this.menuOpen = false;
    if (this.session.policy.pauseOnLocalModal) this.scene.resume();
    this.syncPlacementGhost(this.input.activePointer);
  }

  private dismissBattleModals() {
    if (this.battleSettingsOpen) { this.scene.stop("SettingsScene"); this.battleSettingsOpen = false; }
    if (this.reselectOpen) { this.scene.stop("CardSelectScene"); this.closeReselection(); }
    if (this.menuOpen) this.closePauseMenu();
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
    this.finishBattle("defeat");
  }

  private endLevel() {
    this.finishBattle("victory");
  }

  private finishBattle(outcome: BattleResult["outcome"]) { this.runtime.finish(outcome); }

  private showBattleResult(result: BattleResult, rewards: BattleRewards = { cards: [] }) {
    soundPlayer.stop("battle");
    this.dismissBattleModals();
    this.clearPlacementGhosts();
    showGameOverlay(
      this.overlay,
      t(result.outcome === "defeat" ? "overlay.breach" : result.flawless ? "overlay.flawless" : "overlay.clear"),
      t("button.menu"),
      rewards.cards,
      rewards.slots,
      rewards.reselect ? t("toast.reselectUnlocked") : undefined,
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

  private sanitizeLoadout(selectedCards: CardId[] | undefined, policy: BattlePolicy, historical: boolean) {
    const slotCount = historical ? CARD_SLOT_COUNT : policy.slotCount;
    const validCards = uniqueLoadout((selectedCards ?? defaultCardLoadout).filter((id, index, cards): id is CardId => {
      return hasCardDefinition(id) && (historical || battleCardAllowed(policy, id)) && cards.indexOf(id) === index;
    }), slotCount);

    if (validCards.length) return validCards;
    const defaults = uniqueLoadout(defaultCardLoadout.filter(id => battleCardAllowed(policy, id)), slotCount);
    const fallback = defaults.length ? defaults : uniqueLoadout(policy.allowedCards.filter(id => battleCardAllowed(policy, id)), slotCount);
    if (!fallback.length) throw new Error("No eligible battle cards");
    return fallback;
  }

  private executeBattleAction(action: BattleAction) { this.runtime.executeAction(action); }

  private battleState(): BattleSaveState { return this.runtime.snapshot(this.selectedCardId) as BattleSaveState; }

  private saveSurvivalBattle() {
    if (!this.profile.enabled) return true;
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
    this.runtime.restore(state);
    this.selectedCardId = state.selectedCardId;
    this.shifter.clearSelection();
    drawNullifiedTowers(this.nullifiedTowerGraphics, this.nullification.snapshot(), this.battleTime);
    drawTimedCellSeals(this.timedCellSealGraphics, this.timedCellSeals.entries, this.battleTime, this.timedCellWarningGraphics);
    for (const tower of this.towers) {
      syncTowerLevelText(tower); syncTowerAutoUpgradeVisual(tower, this.autoUpgradeEnabled); syncFriendlyRangeVisual(tower);
    }
    this.topology.update();
    this.setGameSpeed(this.gameSpeed);
    this.syncAutoUpgradeBorders(); this.updateCards(); this.updateHud();
    drawEnemyHealthLinks(this.enemyHealthLinks, this.enemies, this.battleTime);
    this.syncTutorialView();
    if (!this.playback) this.session.startRecordingFromCheckpoint(captureBattleSnapshot(this.battleState()), this.selectedCardIds);
    this.resetCommandAuthority();
    this.profile.restored(this.world.result);
    if (this.world.result) this.showBattleResult(this.world.result);
    else this.overlay.container.setVisible(false);
  }

  private localInputBlocked() {
    return !this.session.executingCommand && (!!this.playback || this.session.replica || this.gameOver || this.menuOpen || this.reselectOpen);
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
    if (this.syncHost) throw new Error("Use semantic player commands while hosting");
    if (this.playback || this.gameOver || this.menuOpen || this.reselectOpen) return;
    this.session.submit(command, this.sessionRuntime.executeCommand);
  }

  private executeCommand(command: BattleCommand) {
    if (command.type === "control" || command.type === "operation") return this.runtime.executeCommand(command);
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

  startSynchronization() {
    return this.syncHost ??= new BattleSyncHost(this.session, this.authority, {
      checkpoint: () => this.session.checkpointReplay(captureBattleSnapshot(this.battleState()), this.selectedCardIds),
      checksum: () => this.battleChecksum(), inputTime: () => performance.now()
    });
  }

  followSynchronizedFrame(tick: number, commands: RecordedBattleCommand[]) {
    this.session.followFrame(tick, commands, { ...this.sessionRuntime, canAdvance: () => !this.gameOver });
    this.refreshBattleViews();
  }

  battleChecksum() {
    return battleChecksum(this.battleState());
  }

  private isInsideBoard(x: number, y: number) {
    return x >= BOARD_X && x < BOARD_X + BOARD_WIDTH && y >= BOARD_Y && y < BOARD_Y + BOARD_HEIGHT;
  }

  private cellIsDeployable(lane: number, column: number) { return this.runtime.cellIsDeployable(lane, column); }

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
