import Phaser from "phaser";
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
  CUBE_BOSS_STATS,
  DEFAULT_DIFFICULTY,
  DEFAULT_GAME_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
  GAME_SPEED_MAX,
  GAME_SPEED_MIN,
  LANES,
  NATURAL_PRODUCE_AMOUNT,
  NATURAL_PRODUCE_INTERVAL,
  STARTING_CHARS,
  clampDifficulty,
  getDifficultyConfig,
  palette
} from "../config";
import { createCubeBoss } from "../bosses/cubeBoss";
import { chapterIdForLevelId } from "../data/chapters";
import { getLevelConfig } from "../data/levels";
import { updateBossRuntime, type BossRuntime } from "../game/bossRuntime";
import type { CardBehavior } from "../game/cardBehaviors";
import type { CombatRuntime } from "../game/combatRuntime";
import { advanceEnemies, spawnWaveEnemies } from "../game/enemyRuntime";
import {
  updateEnemyProjectiles,
  updateMortarProjectiles,
  updateTowerProjectiles,
  type ProjectileRuntime
} from "../game/projectileRuntime";
import { gridCellKey, isBossInRect } from "../game/targeting";
import {
  createTower,
  effectiveTowerLevel,
  getHitProductionAmount,
  getProductionAmount,
  setTowerFacing,
  setTowerAutoUpgradeState,
  syncTowerDerivedStats,
  syncTowerLevelText,
  syncTowerTrueDamageVisual
} from "../game/towers";
import {
  TargetedEffectCardController,
  type TargetedEffectCardResult,
  type TargetedEffectCardRuntime
} from "../game/targetedEffectCards";
import { TowerDeploymentController, type TowerDeploymentRuntime } from "../game/towerDeployment";
import { MIRROR_COST_LIMIT, TowerMirrorController, type TowerMirrorRuntime, type TowerMirrorShiftMove } from "../game/towerMirrors";
import { TowerShifterController, type TowerShifterRuntime } from "../game/towerShifter";
import { TowerSkillController, type TowerSkillRuntime } from "../game/towerSkills";
import { charsAreSoftcapped, rawCharsForSoftcapped, softcapChars } from "../game/charSoftcap";
import {
  damageBoss,
  damageEnemy,
  damageTower,
  removeEnemy,
  removeTower,
  type UnitLifecycleRuntime
} from "../game/unitLifecycle";
import {
  triggerShockTower as runTriggerShockTower,
  triggerTrapTower as runTriggerTrapTower,
  type TriggerTowerRuntime
} from "../game/triggerTowers";
import { syncBossBaseStats, towerFinalStats } from "../game/unitStats";
import { volleyInterval, volleyShotCount } from "../game/upgrades";
import { waveScheduleAction } from "../game/waves";
import { attackIntervalMs } from "../game/attackSpeed";
import { t } from "../i18n";
import { makeEraseMark, makeProductionPulse, makeShellBurst, makeShockPulse } from "../render/combatEffects";
import { createUnitBorder } from "../render/unitShapes";
import {
  createCardStates,
  createGameHud,
  createGameOverlay,
  showGameOverlay,
  showToast as showUiToast,
  updateCardStates,
  updateGameHud,
  updateToolButtonStates,
  type GameHudElements,
  type GameOverlayElements
} from "../render/gameUi";
import { defaultCardLoadout, getCardBehavior, getCardDefinition, hasCardDefinition } from "../registry/cards";
import {
  CONTROL_SLOT_COUNT,
  cardControlAction,
  matchingControlAction,
  slotControlAction,
  toolControlDefinitions,
  type ControlActionId,
  type ToolControlAction
} from "../settings/keybindings";
import type {
  CardDefinition,
  CardId,
  CardState,
  CubeBoss,
  DifficultyConfig,
  Enemy,
  EnemyProjectile,
  LevelConfig,
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

const BOSS_PHASE_BAR_COLORS = [palette.heart, 0xff9f43, palette.magic];
const BOSS_PHASE_BAR_BACK = palette.magic;

function combineDamageReduction(baseReduction: number, extraReduction: number) {
  return 1 - (1 - baseReduction) * (1 - extraReduction);
}

export class GameScene extends Phaser.Scene {
  private levelId = "1-1";
  private chapterId = "1";
  private levelConfig = getLevelConfig("1-1");
  private difficulty = DEFAULT_DIFFICULTY;
  private difficultyConfig = getDifficultyConfig(DEFAULT_DIFFICULTY);
  private unlimitedFirepower = false;
  private selectedCardIds: CardId[] = [...defaultCardLoadout];
  private levelElapsed = 0;
  private battleTime = 0;
  private cardTime = 0;
  private nextNaturalProduceAt = NATURAL_PRODUCE_INTERVAL;
  private cardStates: CardState[] = [];
  private selectedCardId: CardId = "X";
  private towers: Tower[] = [];
  private enemies: Enemy[] = [];
  private boss: CubeBoss | null = null;
  private bossPhaseIndex = 0;
  private bossPhaseStartedAt = 0;
  private bossHomePosition: { x: number; y: number } | null = null;
  private projectiles: Projectile[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private mortarProjectiles: MortarProjectile[] = [];
  private occupied = new Map<string, Tower>();
  private sealedCells = new Set<string>();
  private sealedCellMarks = new Map<string, Phaser.GameObjects.Text>();
  // Stored as raw resources; affordability and spending use the softcapped effective value.
  private chars = STARTING_CHARS;
  private baseIntegrity = BASE_INTEGRITY;
  private wave = 0;
  private waveTracker: WaveTracker | null = null;
  private enemiesDefeated = 0;
  private towerOrder = 0;
  private gameOver = false;
  private battlePaused = false;
  private gameSpeed = DEFAULT_GAME_SPEED;
  private eraserMode = false;
  private placementGhosts: Phaser.GameObjects.Container[] = [];
  private placementGhostKey = "";
  private pausedActions: Array<() => void> = [];
  private autoUpgradeMode = false;
  private debugDamageMode = false;
  private autoUpgradeEnabled = true;
  private autoUpgradeReserveChars = 0;
  private autoUpgradeReserveInputFocused = false;
  private targetedEffects!: TargetedEffectCardController;
  private towerSkills!: TowerSkillController;
  private shifter!: TowerShifterController;
  private mirrors!: TowerMirrorController;
  private deployment!: TowerDeploymentController;
  private ui!: GameHudElements;
  private overlay!: GameOverlayElements;
  private readonly scenePointerDownHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer);
  private readonly scenePointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
    this.towerSkills.updateSpellMortarReticlePosition(pointer.x, pointer.y);
    this.syncPlacementGhost(pointer);
  };
  private readonly sceneKeyDownHandler = (event: KeyboardEvent) => {
    if (this.handleAutoUpgradeReserveKey(event)) {
      return;
    }

    if (this.handleGameKey(event)) {
      event.preventDefault();
    }
  };

  constructor() {
    super("GameScene");
  }

  init(data: { levelId?: string; chapterId?: string; selectedCards?: CardId[]; difficulty?: number; unlimitedFirepower?: boolean }) {
    this.levelId = data.levelId ?? "1-1";
    this.chapterId = data.chapterId ?? chapterIdForLevelId(this.levelId);
    this.levelConfig = getLevelConfig(this.levelId);
    this.difficulty = clampDifficulty(data.difficulty);
    this.unlimitedFirepower = Boolean(data.unlimitedFirepower);
    this.difficultyConfig = this.adjustDifficultyForUnlimitedFirepower(getDifficultyConfig(this.difficulty));
    this.selectedCardIds = this.sanitizeLoadout(data.selectedCards);
    this.cardStates = [];
    this.selectedCardId = this.selectedCardIds.includes("X") ? "X" : this.selectedCardIds[0];
    this.towers = [];
    this.enemies = [];
    this.boss = null;
    this.bossPhaseIndex = 0;
    this.bossPhaseStartedAt = 0;
    this.bossHomePosition = null;
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.mortarProjectiles = [];
    this.occupied = new Map<string, Tower>();
    this.sealedCells = new Set<string>();
    this.sealedCellMarks = new Map<string, Phaser.GameObjects.Text>();
    this.chars = this.startingCharsForLevel();
    this.baseIntegrity = BASE_INTEGRITY;
    this.wave = 0;
    this.waveTracker = null;
    this.enemiesDefeated = 0;
    this.towerOrder = 0;
    this.gameOver = false;
    this.battlePaused = false;
    this.gameSpeed = DEFAULT_GAME_SPEED;
    this.eraserMode = false;
    this.placementGhosts = [];
    this.placementGhostKey = "";
    this.pausedActions = [];
    this.autoUpgradeMode = false;
    this.debugDamageMode = false;
    this.autoUpgradeEnabled = true;
    this.autoUpgradeReserveChars = 0;
    this.autoUpgradeReserveInputFocused = false;
    this.targetedEffects = new TargetedEffectCardController(() => this.targetedEffectCardRuntime());
    this.towerSkills = new TowerSkillController(this, () => this.towerSkillRuntime());
    this.shifter = new TowerShifterController(() => this.towerShifterRuntime());
    this.mirrors = new TowerMirrorController(() => this.towerMirrorRuntime());
    this.deployment = new TowerDeploymentController(() => this.towerDeploymentRuntime());
    this.levelElapsed = 0;
    this.battleTime = 0;
    this.cardTime = 0;
    this.nextNaturalProduceAt = NATURAL_PRODUCE_INTERVAL;
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBoard();
    this.ui = createGameHud(this, this.levelId, this.difficulty, {
      onDebug: () => this.grantDebugChars(),
      onDebugDamage: () => this.toggleDebugDamageMode(),
      onShifter: () => this.toggleShifterMode(),
      onAutoUpgrade: () => this.toggleAutoUpgradeMode(),
      onAutoUpgradeEnabled: () => this.toggleAutoUpgradeEnabled(),
      onAutoUpgradeReserveFocus: () => this.focusAutoUpgradeReserveInput(),
      onGameSpeedChange: (speed) => this.setGameSpeed(speed),
      onErase: () => this.toggleEraser()
    });
    this.setGameSpeed(this.gameSpeed);
    this.spawnBossIfNeeded();
    this.cardStates = createCardStates(this, this.selectedCardIds, (id) => this.selectCard(id));
    this.updateCards(this.cardTime);
    this.overlay = createGameOverlay(this, () => this.handleOverlayAction());

    this.input.on("pointerdown", this.scenePointerDownHandler);
    this.input.on("pointermove", this.scenePointerMoveHandler);
    this.input.keyboard?.on("keydown", this.sceneKeyDownHandler);
    this.events.once("shutdown", () => this.cleanupSceneHandlers());
  }

  private cleanupSceneHandlers() {
    this.input.off("pointerdown", this.scenePointerDownHandler);
    this.input.off("pointermove", this.scenePointerMoveHandler);
    this.input.keyboard?.off("keydown", this.sceneKeyDownHandler);
    this.pausedActions = [];
    this.clearPlacementGhosts();
    this.shifter?.clearSelection();
    this.towerSkills?.cancelSpellMortarTargeting();
  }

  update(_time: number, delta: number) {
    if (this.gameOver) {
      return;
    }

    if (this.battlePaused) {
      this.mirrors.syncMirrors();
      this.updateLevelAuras();
      this.shifter.syncSelectionVisuals();
      this.syncPlacementGhost(this.input.activePointer);
      this.updateCards(this.cardTime);
      this.updateHud();
      return;
    }

    const scaledDelta = delta * this.gameSpeed;
    const seconds = scaledDelta / 1000;
    this.levelElapsed += scaledDelta;
    this.battleTime += scaledDelta;
    this.towerSkills.update(seconds, this.battleTime);
    this.mirrors.syncMirrors();
    this.updateLevelAuras();
    this.cardTime += scaledDelta * this.cardCooldownMultiplier();
    this.updateNaturalProduction();
    this.updateProducers(this.battleTime);
    this.updateArmingTowers(this.battleTime);
    updateBossRuntime(this.bossRuntime(), seconds);
    this.updateEnemies(this.battleTime, seconds);
    this.updateTowers(this.battleTime);
    const projectileRuntime = this.projectileRuntime();
    updateTowerProjectiles(projectileRuntime, seconds);
    updateEnemyProjectiles(projectileRuntime, seconds);
    updateMortarProjectiles(projectileRuntime, seconds);
    this.updateWaveSchedule(this.levelElapsed, this.battleTime);
    this.attemptAutoUpgrades();
    this.shifter.syncSelectionVisuals();
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards(this.cardTime);
    this.updateHud();
  }

  private drawBoard() {
    const graphics = this.add.graphics();
    graphics.fillStyle(palette.black, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

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
    const x = pointer.x;
    const y = pointer.y;
    if (this.gameOver) {
      return;
    }

    if (this.isRightPointer(pointer)) {
      this.towerSkills.cancelSpellMortarTargeting();
      if (this.shifter.isActive()) {
        this.shifter.deactivate();
        this.clearPlacementGhosts();
        this.updateCards(this.cardTime);
      }
      return;
    }

    if (this.towerSkills.hasSpellMortarTargeting()) {
      if (this.isInsideBoard(x, y)) {
        this.towerSkills.fireSelectedSpellMortars(x, y);
      } else {
        this.towerSkills.cancelSpellMortarTargeting();
      }
      return;
    }

    if (this.debugDamageMode) {
      this.applyDebugDamage(x, y);
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

    const column = Math.floor((x - BOARD_X) / CELL_WIDTH);
    const lane = Math.floor((y - BOARD_Y) / CELL_HEIGHT);
    const key = gridCellKey(lane, column);
    const existingTower = this.occupied.get(key);

    if (this.eraserMode) {
      if (!existingTower) {
        this.showToast(t("toast.empty"));
        return;
      }

      const erasedX = existingTower.x;
      const erasedY = existingTower.y;
      removeTower(this.unitLifecycleRuntime(), existingTower);
      this.updateLevelAuras();
      makeEraseMark(this, erasedX, erasedY);
      this.eraserMode = false;
      this.updateCards(this.cardTime);
      return;
    }

    if (this.autoUpgradeMode) {
      if (!existingTower) {
        this.showToast(t("toast.empty"));
        return;
      }

      const nextState = !existingTower.autoUpgrade;
      if (this.isShiftPointer(pointer)) {
        this.towers
          .filter((tower) => tower.type === existingTower.type)
          .forEach((tower) => setTowerAutoUpgradeState(tower, nextState, this.autoUpgradeEnabled));
      } else {
        setTowerAutoUpgradeState(existingTower, nextState, this.autoUpgradeEnabled);
      }
      this.showToast(nextState ? t("toast.autoOn") : t("toast.autoOff"));
      this.attemptAutoUpgrades();
      return;
    }

    if (this.shifter.isActive()) {
      this.handleShifterPointer(pointer, lane, column, existingTower);
      return;
    }

    const definition = this.getSelectedDefinition();
    const cardState = this.cardStates.find((card) => card.definition.id === definition.id);
    const effectiveChars = this.effectiveChars();
    if (this.canUpgradeSelectedTower(existingTower, definition, cardState, effectiveChars)) {
      this.deploySelectedCard(definition, cardState!, lane, column, pointer);
      return;
    }

    if (this.targetedEffects.canHandle(definition.id)) {
      this.handleTargetedEffectCardResult(this.targetedEffects.use(definition, lane, column, existingTower));
      return;
    }

    if (existingTower?.type === "c" && this.towerSkills.isClockTowerReady(existingTower)) {
      if (this.isShiftPointer(pointer)) {
        this.towerSkills.activateReadyClockTowers();
      } else {
        this.towerSkills.activateClockTower(existingTower);
      }
      this.updateCards(this.cardTime);
      return;
    }

    if (existingTower?.type === "S" && this.towerSkills.isSpellMortarReady(existingTower)) {
      if (this.isShiftPointer(pointer)) {
        this.activateReadySpellMortars(pointer.x, pointer.y);
      } else {
        this.activateSpellMortarTargeting([existingTower], pointer.x, pointer.y);
      }
      this.updateCards(this.cardTime);
      return;
    }

    if (existingTower?.type === "w" && this.towerSkills.isAirPatrolReady(existingTower)) {
      this.towerSkills.activateAirPatrolTower(existingTower);
      this.updateCards(this.cardTime);
      return;
    }

    if (this.isManualShockTower(existingTower)) {
      this.triggerShockTower(existingTower);
      return;
    }

    if (!cardState || this.cardTimeFor(definition.id) < cardState.readyAt) {
      this.showToast(t("toast.cooldown"));
      return;
    }

    if (effectiveChars < definition.cost) {
      this.showToast(t("toast.noChars"));
      return;
    }

    this.deploySelectedCard(definition, cardState, lane, column, pointer);
  }

  private canUpgradeSelectedTower(
    tower: Tower | undefined,
    definition: CardDefinition,
    cardState: CardState | undefined,
    effectiveChars: number
  ) {
    return (
      Boolean(tower && tower.type === definition.id) &&
      Boolean(cardState && this.cardTimeFor(definition.id) >= cardState.readyAt) &&
      effectiveChars >= definition.cost
    );
  }

  private deploySelectedCard(
    definition: CardDefinition,
    cardState: CardState,
    lane: number,
    column: number,
    pointer: Phaser.Input.Pointer
  ) {
    const deployed = this.deployment.deploy(definition, lane, column);
    if (!deployed) {
      this.showToast(t("toast.occupied"));
      return;
    }

    this.spendChars(definition.cost);
    cardState.readyAt = this.cardTimeFor(definition.id) + definition.cooldown;
    this.mirrors.syncMirrors();
    this.updateLevelAuras();
    this.syncPlacementGhost(pointer);
  }

  private handleShifterPointer(pointer: Phaser.Input.Pointer, lane: number, column: number, existingTower?: Tower) {
    const mirrorMoves = !existingTower && this.shifter.hasSelection()
      ? this.previewMirrorShiftMoves(lane, column)
      : null;
    const result = this.shifter.handlePointer(lane, column, existingTower, this.isCtrlPointer(pointer));
    if (result === "cooldown") {
      this.clearPlacementGhosts();
      this.showToast(t("toast.cooldown"));
      this.updateCards(this.cardTime);
      return;
    }

    if (result === "empty") {
      this.showToast(t("toast.empty"));
      return;
    }

    if (result === "invalid") {
      this.clearPlacementGhosts();
      this.showToast(t("toast.invalidMove"));
      this.updateCards(this.cardTime);
      return;
    }

    if (result === "moved") {
      this.clearPlacementGhosts();
      if (mirrorMoves) {
        this.mirrors.handleTowersShifted(
          mirrorMoves,
          (linkedTower) => removeTower(this.unitLifecycleRuntime(), linkedTower)
        );
      } else {
        this.mirrors.syncMirrors();
      }
      this.updateLevelAuras();
      this.updateCards(this.cardTime);
      return;
    }

    this.syncPlacementGhost(pointer);
    this.updateCards(this.cardTime);
  }

  private previewMirrorShiftMoves(lane: number, column: number): TowerMirrorShiftMove[] | null {
    const move = this.shifter.previewMove(lane, column);
    if (!move.valid) {
      return null;
    }

    return move.positions.map(({ tower, lane: toLane, column: toColumn }) => ({
      tower,
      fromLane: tower.lane,
      fromColumn: tower.column,
      toLane,
      toColumn
    }));
  }

  private syncPlacementGhost(pointer?: Phaser.Input.Pointer) {
    const ghosts = this.placementGhostSpecs(pointer);
    const nextKey = placementGhostKey(ghosts);
    if (nextKey === this.placementGhostKey) {
      return;
    }

    this.clearPlacementGhosts();
    this.placementGhostKey = nextKey;
    for (const ghost of ghosts) {
      this.addPlacementGhost(ghost.type, ghost.lane, ghost.column);
    }
  }

  private placementGhostSpecs(pointer?: Phaser.Input.Pointer): PlacementGhostSpec[] {
    if (!pointer || this.gameOver || this.battlePaused || !this.isInsideBoard(pointer.x, pointer.y)) {
      return [];
    }

    const lane = Math.floor((pointer.y - BOARD_Y) / CELL_HEIGHT);
    const column = Math.floor((pointer.x - BOARD_X) / CELL_WIDTH);

    if (this.shifter.isActive() && this.shifter.hasSelection() && !this.occupied.get(gridCellKey(lane, column))) {
      const move = this.shifter.previewMove(lane, column);
      if (move.valid) {
        return move.positions.map((position) => ({
          type: position.tower.type,
          lane: position.lane,
          column: position.column
        }));
      }
      return [];
    }

    if (
      this.eraserMode ||
      this.shifter.isActive() ||
      this.autoUpgradeMode ||
      this.debugDamageMode ||
      this.towerSkills.hasSpellMortarTargeting()
    ) {
      return [];
    }

    const definition = this.getSelectedDefinition();
    const cardState = this.cardStates.find((card) => card.definition.id === definition.id);
    if (
      this.targetedEffects.canHandle(definition.id) ||
      !cardState ||
      this.cardTimeFor(definition.id) < cardState.readyAt ||
      this.effectiveChars() < definition.cost
    ) {
      return [];
    }

    if (this.unlimitedFirepower) {
      return Array.from({ length: LANES }, (_value, targetLane) => targetLane)
        .filter((targetLane) => this.cellIsDeployable(targetLane, column) && !this.occupied.get(gridCellKey(targetLane, column)))
        .map((targetLane) => ({ type: definition.id, lane: targetLane, column }));
    }

    if (this.cellIsDeployable(lane, column) && !this.occupied.get(gridCellKey(lane, column))) {
      return [{ type: definition.id, lane, column }];
    }

    return [];
  }

  private addPlacementGhost(type: CardId, lane: number, column: number) {
    const definition = this.getDefinition(type);
    const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    const border = createUnitBorder(this, definition.category, 24, definition.category === "defense" ? 3 : 2);
    const label = this.add
      .text(0, -3, definition.id, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "34px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    const ghost = this.add.container(x, y, [border, label]).setDepth(18).setAlpha(0.32);
    this.placementGhosts.push(ghost);
  }

  private clearPlacementGhosts() {
    for (const ghost of this.placementGhosts) {
      ghost.destroy();
    }
    this.placementGhosts = [];
    this.placementGhostKey = "";
  }

  private handleTargetedEffectCardResult(result: TargetedEffectCardResult) {
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

  private updateProducers(time: number) {
    for (const tower of this.towers) {
      const definition = this.getDefinition(tower.type);
      if (!definition.produceEvery || !definition.produceAmount) {
        continue;
      }

      while (time >= tower.nextProduceAt) {
        const amount = getProductionAmount(tower, definition);
        tower.nextProduceAt += definition.produceEvery;
        this.gainChars(amount, tower.x, tower.y - 28);
      }
    }
  }

  private updateNaturalProduction() {
    while (this.levelElapsed >= this.nextNaturalProduceAt) {
      this.nextNaturalProduceAt += NATURAL_PRODUCE_INTERVAL;
      this.gainChars(NATURAL_PRODUCE_AMOUNT, 172, 96);
    }
  }

  private updateArmingTowers(time: number) {
    for (const tower of this.towers) {
      syncTowerTrueDamageVisual(tower, time);

      if (tower.type === "G") {
        tower.border.setVisible(time >= tower.armedAt);
        continue;
      }

      if (tower.type === "F" || tower.type === "f" || tower.type === "l") {
        tower.border.setVisible(true);
        tower.border.setAlpha(0.55 + Math.sin(time / 95) * 0.27);
      }
    }
  }

  private cardCooldownMultiplier() {
    return this.towerSkills.cardCooldownMultiplier();
  }

  private updateLevelAuras() {
    const previousBonuses = new Map(this.towers.map((tower) => [tower, tower.levelBonus + tower.mirrorLevelBonus]));
    for (const tower of this.towers) {
      tower.levelBonus = 0;
    }

    const levelAuraTowers = this.towers.filter((tower) => tower.type === "U");
    for (const auraTower of levelAuraTowers) {
      for (const target of this.towers) {
        const targetDefinition = this.getDefinition(target.type);
        if (
          target === auraTower ||
          targetDefinition.cost > MIRROR_COST_LIMIT ||
          Math.abs(target.lane - auraTower.lane) > 1 ||
          Math.abs(target.column - auraTower.column) > 1
        ) {
          continue;
        }

        target.levelBonus += auraTower.level;
      }
    }
    this.mirrors.syncMirrorLevelBonuses();

    for (const tower of this.towers) {
      if (previousBonuses.get(tower) !== tower.levelBonus + tower.mirrorLevelBonus) {
        syncTowerLevelText(tower);
      }

      syncTowerDerivedStats(tower, false, this.towers);
    }
  }

  private cardTimeFor(id: CardId) {
    return this.cardUsesClockCooldown(id) ? this.cardTime : this.battleTime;
  }

  private cardUsesClockCooldown(id: CardId) {
    return id !== "c" && this.getDefinition(id).cost <= MIRROR_COST_LIMIT;
  }

  private gainChars(amount: number, x: number, y: number) {
    const previousEffectiveChars = this.effectiveChars();
    this.chars += amount;
    const gainedEffectiveChars = Math.max(0, this.effectiveChars() - previousEffectiveChars);
    makeProductionPulse(this, x, y, Math.floor(gainedEffectiveChars));
    this.attemptAutoUpgrades();
  }

  private effectiveChars() {
    return softcapChars(this.chars);
  }

  private spendChars(amount: number) {
    const nextEffectiveChars = Math.max(0, this.effectiveChars() - amount);
    this.chars = rawCharsForSoftcapped(nextEffectiveChars);
  }

  private handleTowerDamaged(tower: Tower) {
    const definition = this.getDefinition(tower.type);
    if (!definition.hitProduceAmount) {
      return;
    }

    const amount = getHitProductionAmount(tower, definition);
    if (amount > 0) {
      this.gainChars(amount, tower.x, tower.y - 28);
    }
  }

  private activateReadySpellMortars(x: number, y: number) {
    this.prepareSpellMortarTargeting();
    this.towerSkills.activateReadySpellMortars(x, y);
  }

  private activateSpellMortarTargeting(towers: Tower[], x: number, y: number) {
    this.prepareSpellMortarTargeting();
    this.towerSkills.activateSpellMortarTargeting(towers, x, y);
  }

  private prepareSpellMortarTargeting() {
    this.eraserMode = false;
    this.shifter.deactivate();
    this.clearPlacementGhosts();
    this.autoUpgradeMode = false;
    this.debugDamageMode = false;
    this.autoUpgradeReserveInputFocused = false;
  }

  private cancelSpellMortarTargeting() {
    this.towerSkills.cancelSpellMortarTargeting();
  }

  private startingCharsForLevel() {
    return this.levelConfig.startingChars ?? (this.levelId.startsWith("1-") ? 300 : STARTING_CHARS);
  }

  private currentBossPhaseConfig() {
    return this.levelConfig.bossPhases?.[this.bossPhaseIndex];
  }

  private activeLevelConfig(): LevelConfig {
    const phase = this.currentBossPhaseConfig();
    if (!phase) {
      return this.levelConfig;
    }

    return {
      ...this.levelConfig,
      enemyKinds: phase.enemyKinds,
      waveWeightCap: phase.waveWeightCap ?? this.levelConfig.waveWeightCap,
      totalWaves: undefined,
      endless: true
    };
  }

  private currentPhaseElapsed(levelElapsed: number) {
    return Math.max(0, levelElapsed - this.bossPhaseStartedAt);
  }

  private adjustDifficultyForUnlimitedFirepower(difficultyConfig: DifficultyConfig): DifficultyConfig {
    if (!this.unlimitedFirepower) {
      return difficultyConfig;
    }

    return {
      ...difficultyConfig,
      weightMultiplier: difficultyConfig.weightMultiplier * 10
    };
  }

  private spawnBossIfNeeded() {
    if (!this.levelConfig.bossKind) {
      return;
    }

    this.boss = createCubeBoss(this, this.levelConfig.bossKind, this.difficultyConfig.finalDamageReduction);
    this.bossHomePosition = { x: this.boss.x, y: this.boss.y };
    if (this.currentBossPhaseConfig()) {
      this.applyBossPhaseStats(this.boss);
      return;
    }

    if (this.unlimitedFirepower) {
      this.boss.baseStats.maxHp *= 10;
      syncBossBaseStats(this.boss);
      this.boss.hp = this.boss.finalStats.maxHp;
    }
  }

  private applyBossPhaseStats(boss: CubeBoss) {
    const phase = this.currentBossPhaseConfig();
    if (!phase) {
      return;
    }

    boss.baseStats.maxHp = phase.maxHp * (this.unlimitedFirepower ? 10 : 1);
    const defaultStats = CUBE_BOSS_STATS[boss.kind];
    boss.baseStats.armor = phase.armor ?? defaultStats.armor;
    boss.baseStats.magicResistance = phase.magicResistance ?? defaultStats.magicResistance;
    boss.baseStats.speed = defaultStats.speed;
    boss.baseStats.finalDamageReduction = combineDamageReduction(
      this.difficultyConfig.finalDamageReduction,
      phase.finalDamageReduction ?? 0
    );
    syncBossBaseStats(boss);
    boss.hp = boss.finalStats.maxHp;
  }

  private towerSkillRuntime(): TowerSkillRuntime {
    return {
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
      onTargetingChanged: () => this.updateCards(this.cardTime)
    };
  }

  private targetedEffectCardRuntime(): TargetedEffectCardRuntime {
    return {
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
      runWhenBattleActive: (action) => this.runWhenBattleActive(action),
      updateLevelAuras: () => this.updateLevelAuras(),
      updateCards: () => this.updateCards(this.cardTime)
    };
  }

  private towerShifterRuntime(): TowerShifterRuntime {
    return {
      scene: this,
      towers: this.towers,
      occupied: this.occupied,
      cardTime: this.battleTime,
      battleTime: this.battleTime,
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column)
    };
  }

  private towerMirrorRuntime(): TowerMirrorRuntime {
    return {
      scene: this,
      towers: this.towers,
      occupied: this.occupied,
      battleTime: this.battleTime,
      getDefinition: (id) => this.getDefinition(id),
      nextTowerOrder: () => this.nextTowerOrder(),
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column),
      updateLevelAuras: () => this.updateLevelAuras()
    };
  }

  private towerDeploymentRuntime(): TowerDeploymentRuntime {
    return {
      scene: this,
      towers: this.towers,
      occupied: this.occupied,
      cardStates: this.cardStates,
      battleTime: this.battleTime,
      unlimitedFirepower: this.unlimitedFirepower,
      autoUpgradeEnabled: this.autoUpgradeEnabled,
      autoUpgradeReserveChars: this.autoUpgradeReserveChars,
      autoUpgradeReserveInputFocused: this.autoUpgradeReserveInputFocused,
      getDefinition: (id) => this.getDefinition(id),
      cardTimeFor: (id) => this.cardTimeFor(id),
      getChars: () => this.effectiveChars(),
      spendChars: (amount) => this.spendChars(amount),
      nextTowerOrder: () => this.nextTowerOrder(),
      resetTowerSkill: (tower) => this.towerSkills.resetTowerSkill(tower),
      mirrorGroupFor: (tower) => this.mirrors.mirrorGroupFor(tower),
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column),
      updateLevelAuras: () => this.updateLevelAuras(),
      updateCards: () => this.updateCards(this.cardTime)
    };
  }

  private combatRuntime(): CombatRuntime {
    return {
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
      gainChars: (amount, x, y) => this.gainChars(amount, x, y),
      spawnTower: (id, lane, column, level, facingDirection) => this.spawnGeneratedTower(id, lane, column, level, facingDirection),
      isCellDeployable: (lane, column) => this.cellIsDeployable(lane, column),
      triggerTrapTower: (tower, target) => this.triggerTrapTower(tower, target),
      triggerShockTower: (tower) => this.triggerShockTower(tower),
      onEnemyReachedBase: (enemy) => this.handleEnemyReachedBase(enemy),
      runWhenBattleActive: (action) => this.runWhenBattleActive(action)
    };
  }

  private bossRuntime(): BossRuntime {
    return {
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

  private projectileRuntime(): ProjectileRuntime {
    return {
      scene: this,
      projectiles: this.projectiles,
      enemyProjectiles: this.enemyProjectiles,
      mortarProjectiles: this.mortarProjectiles,
      enemies: this.enemies,
      towers: this.towers,
      battleTime: this.battleTime,
      getBoss: () => this.boss,
      damageEnemy: (enemy, damage, damageType, sourceTower) =>
        damageEnemy(this.unitLifecycleRuntime(), enemy, damage, damageType, sourceTower),
      damageBoss: (damage, damageType, targetPart) => damageBoss(this.unitLifecycleRuntime(), damage, damageType, targetPart),
      damageTower: (tower, damage, damageType) => damageTower(this.unitLifecycleRuntime(), tower, damage, damageType)
    };
  }

  private unitLifecycleRuntime(): UnitLifecycleRuntime {
    return {
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
      battleTime: this.battleTime,
      finalDamageReduction: this.difficultyConfig.finalDamageReduction,
      onEnemyDefeated: () => {
        this.enemiesDefeated += 1;
      },
      onTowerDamaged: (tower) => this.handleTowerDamaged(tower),
      onTowerRemoved: (tower) =>
        this.mirrors.handleTowerRemoved(tower, (linkedTower) => removeTower(this.unitLifecycleRuntime(), linkedTower)),
      onBossDefeated: (boss) => this.handleBossDefeated(boss),
      endLevel: () => this.endLevel()
    };
  }

  private triggerTowerRuntime(): TriggerTowerRuntime {
    return {
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

  private nextTowerOrder() {
    const order = this.towerOrder;
    this.towerOrder += 1;
    return order;
  }

  private spawnGeneratedTower(id: CardId, lane: number, column: number, level: number, facingDirection: -1 | 1 = 1) {
    if (!this.cellIsDeployable(lane, column) || this.occupied.has(gridCellKey(lane, column))) {
      return null;
    }

    const definition = this.getDefinition(id);
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
    this.occupied.set(gridCellKey(lane, column), tower);
    this.updateLevelAuras();
    return tower;
  }

  private updateTowers(time: number) {
    const runtime = this.combatRuntime();
    for (const tower of this.towers) {
      const definition = this.getDefinition(tower.type);
      const behavior = getCardBehavior(tower.type);
      if (!behavior.canUse(tower, definition, time, runtime)) {
        continue;
      }

      this.startTowerVolley(tower, definition, behavior, time);
    }
  }

  private startTowerVolley(tower: Tower, definition: CardDefinition, behavior: CardBehavior, time: number) {
    const shots = volleyShotCount(tower.type, effectiveTowerLevel(tower));
    const attackInterval = attackIntervalMs(towerFinalStats(tower).attackSpeed);
    const interval = volleyInterval(attackInterval, shots);

    for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
      this.time.delayedCall(shotIndex * interval, () => {
        this.runWhenBattleActive(() => {
          if (this.gameOver || !this.towers.includes(tower)) {
            return;
          }
          behavior.execute(tower, definition, this.combatRuntime());
        });
      });
    }

    tower.lastFire = time + (shots - 1) * interval;
  }

  private updateEnemies(time: number, seconds: number) {
    advanceEnemies(this.combatRuntime(), time, seconds);
  }

  private handleEnemyReachedBase(enemy: Enemy) {
    this.baseIntegrity -= 1;
    removeEnemy(this.unitLifecycleRuntime(), enemy, false);
    this.cameras.main.shake(110, 0.004);
    if (this.baseIntegrity <= 0) {
      this.endGame();
      return true;
    }
    return false;
  }

  private updateWaveSchedule(levelElapsed: number, gameTime: number) {
    const activeLevelConfig = this.activeLevelConfig();
    const action = waveScheduleAction(
      activeLevelConfig,
      this.wave,
      this.waveTracker,
      this.enemies.length,
      this.currentPhaseElapsed(levelElapsed)
    );

    if (action === "complete") {
      this.endLevel();
      return;
    }

    if (action === "spawn") {
      this.spawnWave(levelElapsed, gameTime);
    }
  }

  private spawnWave(levelElapsed: number, gameTime: number) {
    const activeLevelConfig = this.activeLevelConfig();
    const waveNumber = this.wave + 1;
    this.wave = waveNumber;
    this.waveTracker = spawnWaveEnemies(this.combatRuntime(), {
      levelConfig: activeLevelConfig,
      difficultyConfig: this.difficultyConfig,
      waveNumber,
      levelElapsed: this.currentPhaseElapsed(levelElapsed),
      gameTime
    });
    this.applyWaveStartMechanics();

    this.showToast(
      waveNumber % activeLevelConfig.wavesPerFlag === 0
        ? `${t("label.flag")} ${waveNumber / activeLevelConfig.wavesPerFlag}`
        : `${t("label.wave")} ${waveNumber}`
    );
  }

  private handleBossDefeated(boss: CubeBoss) {
    const phases = this.levelConfig.bossPhases;
    if (!phases || this.bossPhaseIndex + 1 >= phases.length) {
      return false;
    }

    this.bossPhaseIndex += 1;
    this.bossPhaseStartedAt = this.levelElapsed;
    this.wave = 0;
    this.waveTracker = null;
    this.clearEnemiesForBossPhaseTransition();
    this.resetBossForPhase(boss);
    this.applyBossPhaseStats(boss);
    this.showToast(`PHASE ${this.bossPhaseIndex + 1}/${phases.length}`);
    this.updateHud();
    return true;
  }

  private clearEnemiesForBossPhaseTransition() {
    const enemies = [...this.enemies];
    const bodies: Phaser.GameObjects.Container[] = [];
    for (const enemy of enemies) {
      bodies.push(enemy.body);
      for (const cargo of enemy.burrowCargo ?? []) {
        bodies.push(cargo.body);
      }
      enemy.burrowCargo = [];
    }

    this.enemies.length = 0;
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
    const home = this.bossHomePosition ?? { x: boss.x, y: boss.y };
    boss.x = home.x;
    boss.y = home.y;
    boss.body.setPosition(home.x, home.y);
    boss.movementAxis = "x";
    boss.movementDirection = -1;
    boss.contactAttackBuffer = 0;
    boss.chargeExpiresAt = 0;
    boss.halfHpTriggered = false;
    boss.criticalHpTriggered = false;
    boss.pendingCriticalSummon = false;
    boss.invincibleUntil = 0;
    boss.bossHasteUntil = 0;
  }

  private applyWaveStartMechanics() {
    if (this.levelConfig.specialMechanic !== "rightColumnSeal") {
      return;
    }

    this.applyRightColumnSeal();
  }

  private applyRightColumnSeal() {
    if (this.wave % 5 !== 0) {
      return;
    }

    const column = COLUMNS - this.wave / 5;
    if (column < 0 || column >= COLUMNS) {
      return;
    }

    this.sealColumn(column);
  }

  private sealColumn(column: number) {
    let removedTower = false;
    for (let lane = 0; lane < LANES; lane += 1) {
      const tower = this.occupied.get(gridCellKey(lane, column));
      if (tower && this.towers.includes(tower)) {
        makeEraseMark(this, tower.x, tower.y);
        removeTower(this.unitLifecycleRuntime(), tower);
        removedTower = true;
      }
      this.sealCell(lane, column);
    }

    if (removedTower) {
      this.updateLevelAuras();
    }
    this.syncPlacementGhost(this.input.activePointer);
  }

  private sealCell(lane: number, column: number) {
    const key = gridCellKey(lane, column);
    if (this.sealedCells.has(key)) {
      return;
    }

    this.sealedCells.add(key);
    const center = this.cellCenter(lane, column);
    const mark = this.add
      .text(center.x, center.y - 2, "×", {
        color: "#ff4d4d",
        fontFamily: "monospace",
        fontSize: "58px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setDepth(19)
      .setAlpha(0.82);
    mark.setStroke("#2a0000", 4);
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

  private updateCards(time: number) {
    updateCardStates(this.cardStates, {
      time,
      timeForCard: (id) => this.cardTimeFor(id),
      selectedCardId: this.selectedCardId,
      chars: this.effectiveChars(),
      eraserMode: this.eraserMode,
      shifterMode: this.shifter.isActive(),
      autoUpgradeMode: this.autoUpgradeMode,
      debugDamageMode: this.debugDamageMode
    });
    updateToolButtonStates(
      this.ui,
      this.eraserMode,
      this.shifter.isActive(),
      this.shifter.cooldownRatio(),
      this.autoUpgradeMode,
      this.debugDamageMode,
      this.autoUpgradeEnabled,
      this.autoUpgradeReserveChars,
      this.autoUpgradeReserveInputFocused
    );
  }

  private grantDebugChars() {
    if (this.gameOver) {
      return;
    }

    this.eraserMode = false;
    this.shifter.deactivate();
    this.clearPlacementGhosts();
    this.autoUpgradeMode = false;
    this.debugDamageMode = false;
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    this.cardStates.forEach((cardState) => {
      cardState.readyAt = this.cardTimeFor(cardState.definition.id);
    });
    this.baseIntegrity += 1_000;
    this.gainChars(10_000, this.ui.debugButton.x, this.ui.debugButton.y + 34);
    this.showToast(t("toast.debugChars"));
    this.updateCards(this.cardTime);
    this.updateHud();
  }

  private toggleEraser() {
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
      this.debugDamageMode = false;
    }
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards(this.cardTime);
  }

  private toggleShifterMode() {
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
      this.debugDamageMode = false;
    } else {
      this.clearPlacementGhosts();
    }
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards(this.cardTime);
  }

  private toggleAutoUpgradeMode() {
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
      this.debugDamageMode = false;
    }
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards(this.cardTime);
  }

  private toggleAutoUpgradeEnabled() {
    if (this.gameOver) {
      return;
    }

    this.autoUpgradeEnabled = !this.autoUpgradeEnabled;
    this.autoUpgradeReserveInputFocused = false;
    this.syncAutoUpgradeBorders();
    this.attemptAutoUpgrades();
    this.updateCards(this.cardTime);
  }

  private focusAutoUpgradeReserveInput() {
    if (this.gameOver) {
      return;
    }

    this.eraserMode = false;
    this.shifter.deactivate();
    this.clearPlacementGhosts();
    this.autoUpgradeMode = false;
    this.debugDamageMode = false;
    this.autoUpgradeReserveInputFocused = true;
    this.cancelSpellMortarTargeting();
    this.updateCards(this.cardTime);
  }

  private attemptAutoUpgrades() {
    this.deployment.attemptAutoUpgrades();
  }

  private toggleDebugDamageMode() {
    if (this.gameOver) {
      return;
    }

    this.debugDamageMode = !this.debugDamageMode;
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    if (this.debugDamageMode) {
      this.eraserMode = false;
      this.shifter.deactivate();
      this.clearPlacementGhosts();
      this.autoUpgradeMode = false;
    }
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards(this.cardTime);
  }

  private applyDebugDamage(x: number, y: number) {
    const rangeX = CELL_WIDTH / 2;
    const rangeY = CELL_HEIGHT / 2;
    const damage = 15_000;
    makeShellBurst(this, x, y, Math.min(CELL_WIDTH, CELL_HEIGHT) * 0.5, "true");
    makeShockPulse(this, x, y, CELL_WIDTH, CELL_HEIGHT);

    for (const enemy of [...this.enemies]) {
      if (Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY) {
        damageEnemy(this.unitLifecycleRuntime(), enemy, damage, "true");
      }
    }

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

    this.battlePaused = !this.battlePaused;
    this.towerSkills.syncSpellMortarTweenPause(this.battlePaused);
    if (!this.battlePaused) {
      this.flushPausedActions();
    }
    this.showToast(this.battlePaused ? t("toast.paused") : t("toast.resume"));
    this.updateCards(this.cardTime);
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

  private updateHud() {
    const activeLevelConfig = this.activeLevelConfig();
    updateGameHud(this.ui, {
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
        : BOSS_PHASE_BAR_BACK;

    return {
      fillColor,
      backColor: nextFillColor,
      phase: this.bossPhaseIndex + 1,
      totalPhases: phases.length
    };
  }

  private showToast(text: string) {
    showUiToast(this, this.ui, text);
  }

  private endGame() {
    this.gameOver = true;
    showGameOverlay(this.overlay, t("overlay.breach"), t("button.menu"));
  }

  private endLevel() {
    this.gameOver = true;
    showGameOverlay(this.overlay, t("overlay.clear"), t("button.menu"));
  }

  private handleOverlayAction() {
    this.scene.start("LevelSelectScene", {
      chapterId: this.chapterId,
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
      this.attemptAutoUpgrades();
      this.updateCards(this.cardTime);
      return true;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      this.setAutoUpgradeReserve(Math.floor(this.autoUpgradeReserveChars / 10));
      return true;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const nextText =
        this.autoUpgradeReserveChars === 0 ? event.key : `${this.autoUpgradeReserveChars}${event.key}`;
      this.setAutoUpgradeReserve(Number.parseInt(nextText, 10));
      return true;
    }

    event.preventDefault();
    return true;
  }

  private setAutoUpgradeReserve(value: number) {
    this.autoUpgradeReserveChars = Math.max(0, Math.floor(value));
    this.updateCards(this.cardTime);
  }

  private handleGameKey(event: KeyboardEvent) {
    const actionIds: ControlActionId[] = [
      ...toolControlDefinitions.map((definition) => definition.id),
      ...Array.from({ length: CONTROL_SLOT_COUNT }, (_value, index) => slotControlAction(index + 1)),
      ...this.selectedCardIds.map((id) => cardControlAction(id))
    ];
    const actionId = matchingControlAction(event, actionIds);
    if (!actionId) {
      return false;
    }

    this.runControlAction(actionId);
    return true;
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
      if (this.selectedCardIds.includes(cardId)) {
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
      case "tool:debugDamage":
        this.toggleDebugDamageMode();
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
    if (!this.selectedCardIds.includes(id)) {
      return;
    }
    this.eraserMode = false;
    this.shifter.deactivate();
    this.clearPlacementGhosts();
    this.autoUpgradeMode = false;
    this.debugDamageMode = false;
    this.autoUpgradeReserveInputFocused = false;
    this.cancelSpellMortarTargeting();
    this.selectedCardId = id;
    this.syncPlacementGhost(this.input.activePointer);
    this.updateCards(this.cardTime);
  }

  private getSelectedDefinition() {
    return this.getDefinition(this.selectedCardId);
  }

  private isManualShockTower(tower?: Tower): tower is Tower {
    return tower?.type === "F" || tower?.type === "f" || tower?.type === "i" || tower?.type === "l";
  }

  private getDefinition(id: CardId) {
    return getCardDefinition(id);
  }

  private sanitizeLoadout(selectedCards?: CardId[]) {
    const validCards = (selectedCards ?? defaultCardLoadout).filter((id, index, cards): id is CardId => {
      return hasCardDefinition(id) && cards.indexOf(id) === index;
    });

    return validCards.length > 0 ? validCards.slice(0, CARD_SLOT_COUNT) : [...defaultCardLoadout];
  }

  private isInsideBoard(x: number, y: number) {
    return x >= BOARD_X && x < BOARD_X + BOARD_WIDTH && y >= BOARD_Y && y < BOARD_Y + BOARD_HEIGHT;
  }

  private cellIsDeployable(lane: number, column: number) {
    return lane >= 0 && lane < LANES && column >= 0 && column < COLUMNS && !this.sealedCells.has(gridCellKey(lane, column));
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
  return ghosts.map((ghost) => `${ghost.type}:${ghost.lane}:${ghost.column}`).join("|");
}
