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
  DEFAULT_DIFFICULTY,
  GAME_HEIGHT,
  GAME_WIDTH,
  LANES,
  NATURAL_PRODUCE_AMOUNT,
  NATURAL_PRODUCE_INTERVAL,
  STARTING_CHARS,
  clampDifficulty,
  getDifficultyConfig,
  palette
} from "../config";
import { createCubeBoss } from "../bosses/cubeBoss";
import { getLevelConfig } from "../data/levels";
import { updateBossRuntime, type BossRuntime } from "../game/bossRuntime";
import type { CardBehavior } from "../game/cardBehaviors";
import type { CombatRuntime } from "../game/combatRuntime";
import { advanceEnemies, spawnWaveEnemies } from "../game/enemyRuntime";
import {
  updateEnemyProjectiles,
  updateTowerProjectiles,
  type ProjectileRuntime
} from "../game/projectileRuntime";
import {
  gridCellKey,
  isBossInRect
} from "../game/targeting";
import {
  applyTowerUpgradeStats,
  createTower,
  findAutoUpgradeTarget,
  getProductionAmount,
  getShockCount,
  getTrapDamage,
  isCardReadyForAutoUpgrade,
  setTowerAutoUpgradeState,
  syncTowerAutoUpgradeVisual,
  upgradeTowerLevel
} from "../game/towers";
import {
  damageBoss,
  damageEnemy,
  damageTower,
  removeEnemy,
  removeTower,
  type UnitLifecycleRuntime
} from "../game/unitLifecycle";
import { volleyInterval, volleyShotCount } from "../game/upgrades";
import { waveScheduleAction } from "../game/waves";
import { t } from "../i18n";
import {
  makeAutoUpgradePulse,
  makeEraseMark,
  makeProductionPulse,
  makeShockPulse,
  makeTrapBurst
} from "../render/combatEffects";
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
import type {
  CardDefinition,
  CardId,
  CardState,
  CubeBoss,
  Enemy,
  EnemyProjectile,
  Projectile,
  Tower,
  WaveTracker
} from "../types";

export class GameScene extends Phaser.Scene {
  private levelId = "0-1";
  private levelConfig = getLevelConfig("0-1");
  private difficulty = DEFAULT_DIFFICULTY;
  private difficultyConfig = getDifficultyConfig(DEFAULT_DIFFICULTY);
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
  private projectiles: Projectile[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private occupied = new Map<string, Tower>();
  private chars = STARTING_CHARS;
  private baseIntegrity = BASE_INTEGRITY;
  private wave = 0;
  private waveTracker: WaveTracker | null = null;
  private enemiesDefeated = 0;
  private towerOrder = 0;
  private gameOver = false;
  private battlePaused = false;
  private eraserMode = false;
  private autoUpgradeMode = false;
  private autoUpgradeEnabled = true;
  private autoUpgradeReserveChars = 0;
  private autoUpgradeReserveInputFocused = false;
  private ui!: GameHudElements;
  private overlay!: GameOverlayElements;

  constructor() {
    super("GameScene");
  }

  init(data: { levelId?: string; selectedCards?: CardId[]; difficulty?: number }) {
    this.levelId = data.levelId ?? "0-1";
    this.levelConfig = getLevelConfig(this.levelId);
    this.difficulty = clampDifficulty(data.difficulty);
    this.difficultyConfig = getDifficultyConfig(this.difficulty);
    this.selectedCardIds = this.sanitizeLoadout(data.selectedCards);
    this.cardStates = [];
    this.selectedCardId = this.selectedCardIds.includes("X") ? "X" : this.selectedCardIds[0];
    this.towers = [];
    this.enemies = [];
    this.boss = null;
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.occupied = new Map<string, Tower>();
    this.chars = this.startingCharsForLevel();
    this.baseIntegrity = BASE_INTEGRITY;
    this.wave = 0;
    this.waveTracker = null;
    this.enemiesDefeated = 0;
    this.towerOrder = 0;
    this.gameOver = false;
    this.battlePaused = false;
    this.eraserMode = false;
    this.autoUpgradeMode = false;
    this.autoUpgradeEnabled = true;
    this.autoUpgradeReserveChars = 0;
    this.autoUpgradeReserveInputFocused = false;
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
      onAutoUpgrade: () => this.toggleAutoUpgradeMode(),
      onAutoUpgradeEnabled: () => this.toggleAutoUpgradeEnabled(),
      onAutoUpgradeReserveFocus: () => this.focusAutoUpgradeReserveInput(),
      onErase: () => this.toggleEraser()
    });
    this.spawnBossIfNeeded();
    this.cardStates = createCardStates(this, this.selectedCardIds, (id) => this.selectCard(id));
    this.updateCards(this.cardTime);
    this.overlay = createGameOverlay(this, () => this.handleOverlayAction());

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handleBoardPointer(pointer);
    });

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (this.handleAutoUpgradeReserveKey(event)) {
        return;
      }

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        this.toggleBattlePause();
        return;
      }
      this.handleKey(event.key);
    });
  }

  update(time: number, delta: number) {
    if (this.gameOver) {
      return;
    }

    if (this.battlePaused) {
      this.updateCards(this.cardTime);
      this.updateHud();
      return;
    }

    const seconds = delta / 1000;
    this.levelElapsed += delta;
    this.battleTime += delta;
    this.cardTime += delta;
    this.updateNaturalProduction();
    this.updateProducers(this.battleTime);
    this.updateArmingTowers(this.battleTime);
    updateBossRuntime(this.bossRuntime(), seconds);
    this.updateEnemies(this.battleTime, seconds);
    this.updateTowers(this.battleTime);
    const projectileRuntime = this.projectileRuntime();
    updateTowerProjectiles(projectileRuntime, seconds);
    updateEnemyProjectiles(projectileRuntime, seconds);
    this.updateWaveSchedule(this.levelElapsed, this.battleTime);
    this.attemptAutoUpgrades();
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

  private handleBoardPointer(pointer: Phaser.Input.Pointer) {
    const x = pointer.x;
    const y = pointer.y;
    if (this.gameOver || !this.isInsideBoard(x, y)) {
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

    const definition = this.getSelectedDefinition();
    const cardState = this.cardStates.find((card) => card.definition.id === definition.id);

    if (!cardState || this.cardTime < cardState.readyAt) {
      this.showToast(t("toast.cooldown"));
      return;
    }

    if (this.chars < definition.cost) {
      this.showToast(t("toast.noChars"));
      return;
    }

    if (existingTower) {
      if (existingTower.type !== definition.id) {
        this.showToast(t("toast.occupied"));
        return;
      }

      this.upgradeTower(existingTower);
    } else {
      this.placeTower(definition, lane, column);
    }

    this.chars -= definition.cost;
    cardState.readyAt = this.cardTime + definition.cooldown;
  }

  private placeTower(definition: CardDefinition, lane: number, column: number) {
    const tower = createTower(this, definition, lane, column, this.battleTime, this.towerOrder);
    this.towerOrder += 1;

    this.towers.push(tower);
    this.occupied.set(gridCellKey(lane, column), tower);
  }

  private upgradeTower(tower: Tower) {
    const definition = this.getDefinition(tower.type);
    const gainedEffectiveUpgrades = upgradeTowerLevel(tower);
    applyTowerUpgradeStats(tower, definition, gainedEffectiveUpgrades, this.battleTime);
    this.tweens.add({
      targets: tower.body,
      scale: 1.08,
      yoyo: true,
      duration: 90,
      ease: "Quad.easeOut"
    });
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
      if (tower.type === "G") {
        tower.border.setVisible(time >= tower.armedAt);
      }
    }
  }

  private gainChars(amount: number, x: number, y: number) {
    this.chars += amount;
    makeProductionPulse(this, x, y, amount);
    this.attemptAutoUpgrades();
  }

  private startingCharsForLevel() {
    return this.levelConfig.startingChars ?? (this.levelId.startsWith("1-") ? 300 : STARTING_CHARS);
  }

  private spawnBossIfNeeded() {
    if (!this.levelConfig.bossKind) {
      return;
    }

    this.boss = createCubeBoss(this, this.levelConfig.bossKind, this.difficultyConfig.finalDamageReduction);
  }

  private combatRuntime(): CombatRuntime {
    return {
      scene: this,
      enemies: this.enemies,
      towers: this.towers,
      boss: this.boss,
      occupied: this.occupied,
      projectiles: this.projectiles,
      enemyProjectiles: this.enemyProjectiles,
      damageEnemy: (enemy, damage, damageType) => damageEnemy(this.unitLifecycleRuntime(), enemy, damage, damageType),
      damageBoss: (damage, damageType) => damageBoss(this.unitLifecycleRuntime(), damage, damageType),
      damageTower: (tower, damage, damageType) => damageTower(this.unitLifecycleRuntime(), tower, damage, damageType),
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
      getBoss: () => this.boss,
      wave: this.wave,
      battleTime: this.battleTime,
      finalDamageReduction: this.difficultyConfig.finalDamageReduction,
      damageTower: (tower, damage, damageType) => damageTower(this.unitLifecycleRuntime(), tower, damage, damageType),
      triggerTrapTower: (tower, target) => this.triggerTrapTower(tower, target),
      triggerShockTower: (tower) => this.triggerShockTower(tower),
      endGame: () => this.endGame()
    };
  }

  private projectileRuntime(): ProjectileRuntime {
    return {
      scene: this,
      projectiles: this.projectiles,
      enemyProjectiles: this.enemyProjectiles,
      enemies: this.enemies,
      towers: this.towers,
      getBoss: () => this.boss,
      damageEnemy: (enemy, damage, damageType) => damageEnemy(this.unitLifecycleRuntime(), enemy, damage, damageType),
      damageBoss: (damage, damageType) => damageBoss(this.unitLifecycleRuntime(), damage, damageType),
      damageTower: (tower, damage, damageType) => damageTower(this.unitLifecycleRuntime(), tower, damage, damageType)
    };
  }

  private unitLifecycleRuntime(): UnitLifecycleRuntime {
    return {
      scene: this,
      enemies: this.enemies,
      towers: this.towers,
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
      endLevel: () => this.endLevel()
    };
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
    const shots = volleyShotCount(tower.type, tower.level);
    const interval = volleyInterval(tower.fireRate, shots);

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
    const action = waveScheduleAction(
      this.levelConfig,
      this.wave,
      this.waveTracker,
      this.enemies.length,
      levelElapsed
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
    const waveNumber = this.wave + 1;
    this.wave = waveNumber;
    this.waveTracker = spawnWaveEnemies(this.combatRuntime(), {
      levelConfig: this.levelConfig,
      difficultyConfig: this.difficultyConfig,
      waveNumber,
      levelElapsed,
      gameTime
    });

    this.showToast(
      waveNumber % this.levelConfig.wavesPerFlag === 0
        ? `${t("label.flag")} ${waveNumber / this.levelConfig.wavesPerFlag}`
        : `${t("label.wave")} ${waveNumber}`
    );
  }

  private triggerShockTower(tower: Tower) {
    const definition = this.getDefinition(tower.type);
    const count = getShockCount(tower, definition);
    const interval = definition.triggerInterval ?? 50;
    const damage = definition.triggerDamage ?? 100;
    const damageType = definition.triggerDamageType ?? "physical";
    const rangeX = definition.triggerRangeX ?? CELL_WIDTH;
    const rangeY = definition.triggerRangeY ?? CELL_HEIGHT;
    const x = tower.x;
    const y = tower.y;

    removeTower(this.unitLifecycleRuntime(), tower);

    for (let index = 0; index < count; index += 1) {
      this.time.delayedCall(index * interval, () => {
        this.runWhenBattleActive(() => {
          if (this.gameOver) {
            return;
          }

          makeShockPulse(this, x, y, rangeX, rangeY);
          for (const enemy of [...this.enemies]) {
            if (Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY) {
              damageEnemy(this.unitLifecycleRuntime(), enemy, damage, damageType);
            }
          }
          if (isBossInRect(this.boss, x - rangeX, y - rangeY, rangeX * 2, rangeY * 2)) {
            damageBoss(this.unitLifecycleRuntime(), damage, damageType);
          }
        });
      });
    }
  }

  private runWhenBattleActive(action: () => void) {
    if (this.gameOver) {
      return;
    }

    if (this.battlePaused) {
      this.time.delayedCall(100, () => this.runWhenBattleActive(action));
      return;
    }

    action();
  }

  private triggerTrapTower(tower: Tower, target: Enemy | "boss") {
    const definition = this.getDefinition(tower.type);
    const damage = getTrapDamage(tower, definition);
    const damageType = definition.triggerDamageType ?? "magic";
    const x = tower.x;
    const y = tower.y;

    removeTower(this.unitLifecycleRuntime(), tower);
    makeTrapBurst(this, x, y, damageType);
    if (target === "boss") {
      damageBoss(this.unitLifecycleRuntime(), damage, damageType);
      return;
    }

    damageEnemy(this.unitLifecycleRuntime(), target, damage, damageType);
  }

  private updateCards(time: number) {
    updateCardStates(this.cardStates, {
      time,
      selectedCardId: this.selectedCardId,
      chars: this.chars,
      eraserMode: this.eraserMode,
      autoUpgradeMode: this.autoUpgradeMode
    });
    updateToolButtonStates(
      this.ui,
      this.eraserMode,
      this.autoUpgradeMode,
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
    this.autoUpgradeMode = false;
    this.autoUpgradeReserveInputFocused = false;
    this.gainChars(10_000, this.ui.debugButton.x, this.ui.debugButton.y + 34);
    this.showToast(t("toast.debugChars"));
    this.updateCards(this.cardTime);
  }

  private toggleEraser() {
    if (this.gameOver) {
      return;
    }

    this.eraserMode = !this.eraserMode;
    this.autoUpgradeReserveInputFocused = false;
    if (this.eraserMode) {
      this.autoUpgradeMode = false;
    }
    this.updateCards(this.cardTime);
  }

  private toggleAutoUpgradeMode() {
    if (this.gameOver) {
      return;
    }

    this.autoUpgradeMode = !this.autoUpgradeMode;
    this.autoUpgradeReserveInputFocused = false;
    if (this.autoUpgradeMode) {
      this.eraserMode = false;
    }
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
    this.autoUpgradeMode = false;
    this.autoUpgradeReserveInputFocused = true;
    this.updateCards(this.cardTime);
  }

  private attemptAutoUpgrades() {
    if (!this.autoUpgradeEnabled || this.autoUpgradeReserveInputFocused || this.chars <= this.autoUpgradeReserveChars) {
      return;
    }

    let upgraded = false;
    for (const cardState of this.cardStates) {
      if (this.chars <= this.autoUpgradeReserveChars) {
        break;
      }

      if (!isCardReadyForAutoUpgrade(cardState, this.cardTime)) {
        continue;
      }

      const target = findAutoUpgradeTarget(this.towers, cardState.definition.id);

      if (!target || !this.canSpendForAutoUpgrade(cardState.definition.cost)) {
        continue;
      }

      this.chars -= cardState.definition.cost;
      this.upgradeTower(target);
      makeAutoUpgradePulse(this, target.x, target.y);
      cardState.readyAt = this.cardTime + cardState.definition.cooldown;
      upgraded = true;
    }

    if (upgraded) {
      this.updateCards(this.cardTime);
    }
  }

  private syncAutoUpgradeBorders() {
    this.towers.forEach((tower) => syncTowerAutoUpgradeVisual(tower, this.autoUpgradeEnabled));
  }

  private canSpendForAutoUpgrade(cost: number) {
    return this.chars - cost >= this.autoUpgradeReserveChars;
  }

  private toggleBattlePause() {
    if (this.gameOver) {
      return;
    }

    this.battlePaused = !this.battlePaused;
    this.showToast(this.battlePaused ? t("toast.paused") : t("toast.resume"));
    this.updateCards(this.cardTime);
    this.updateHud();
  }

  private updateHud() {
    updateGameHud(this.ui, {
      chars: this.chars,
      wave: this.wave,
      wavesPerFlag: this.levelConfig.wavesPerFlag,
      totalWaves: this.levelConfig.totalWaves ?? this.wave,
      baseIntegrity: this.baseIntegrity,
      enemiesDefeated: this.enemiesDefeated,
      battlePaused: this.battlePaused,
      boss: this.boss
    });
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
    this.scene.start("LevelSelectScene");
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

  private handleKey(key: string) {
    const upperKey = key.toUpperCase();
    const slotIndex = Number.parseInt(upperKey, 10) - 1;
    if (slotIndex >= 0 && slotIndex < this.selectedCardIds.length) {
      this.selectCard(this.selectedCardIds[slotIndex]);
      return;
    }

    const hotkeys: Partial<Record<string, CardId>> = {
      A: "A",
      B: "B",
      C: "C",
      D: "D",
      X: "X",
      E: "E",
      M: "M",
      W: "W",
      F: "F",
      G: "G",
      H: "H",
      I: "I",
      J: "J",
      K: "K",
      L: "L",
      N: "N"
    };

    const selected = hotkeys[upperKey];
    if (selected) {
      this.selectCard(selected);
      return;
    }

  }

  private selectCard(id: CardId) {
    if (!this.selectedCardIds.includes(id)) {
      return;
    }
    this.eraserMode = false;
    this.autoUpgradeMode = false;
    this.autoUpgradeReserveInputFocused = false;
    this.selectedCardId = id;
    this.updateCards(this.cardTime);
  }

  private getSelectedDefinition() {
    return this.getDefinition(this.selectedCardId);
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

  private restartLevel() {
    this.scene.restart({
      levelId: this.levelId,
      selectedCards: this.selectedCardIds,
      difficulty: this.difficulty
    });
  }

  private isInsideBoard(x: number, y: number) {
    return x >= BOARD_X && x < BOARD_X + BOARD_WIDTH && y >= BOARD_Y && y < BOARD_Y + BOARD_HEIGHT;
  }

  private isShiftPointer(pointer: Phaser.Input.Pointer) {
    const event = pointer.event as MouseEvent | undefined;
    return Boolean(event && "shiftKey" in event && event.shiftKey);
  }

}
