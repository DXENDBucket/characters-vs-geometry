import Phaser from "phaser";
import {
  ATTACK_INTERVAL,
  BASE_INTEGRITY,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  BOSS_HITBOX_HEIGHT,
  BOSS_HITBOX_WIDTH,
  CARD_BAR_WIDTH,
  CARD_HEIGHT,
  CARD_SLOT_COUNT,
  CARD_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  COLUMNS,
  CUBE_BOSS_CONTACT_DAMAGE,
  CUBE_BOSS_CONTACT_INTERVAL,
  CUBE_BOSS_ADVANCE_SKILL_COST,
  CUBE_BOSS_ADVANCE_SKILL_MAX,
  CUBE_BOSS_MAX_HP,
  CUBE_BOSS_PROMOTION2_SKILL_COST,
  CUBE_BOSS_PROMOTION2_SKILL_MAX,
  CUBE_BOSS_PROMOTION_SKILL_COST,
  CUBE_BOSS_PROMOTION_SKILL_MAX,
  DEFAULT_DIFFICULTY,
  ENEMY_SPEED,
  ENEMY_SPEED_VARIANCE,
  FIRST_SPAWN_AT,
  GAME_HEIGHT,
  GAME_WIDTH,
  LANES,
  MAX_CHARS,
  NATURAL_PRODUCE_AMOUNT,
  NATURAL_PRODUCE_INTERVAL,
  NEXT_WAVE_DELAY,
  PROGRESS_BAR_WIDTH,
  STARTING_CHARS,
  clampDifficulty,
  getDifficultyConfig,
  palette
} from "../config";
import { cardDefinitions, defaultLoadout, getCardDefinition } from "../data/cards";
import { enemyDefinitions } from "../data/enemies";
import { getLevelConfig } from "../data/levels";
import { romanLabel, toRomanNumeral } from "../format";
import { EFFECT_SYMBOLS, t } from "../i18n";
import { effectiveLevelForLevel, effectiveUpgradeCountForLevel } from "../progression";
import type {
  CardDefinition,
  CardId,
  CardState,
  BossSkill,
  CubeBoss,
  DamageType,
  Enemy,
  EnemyKind,
  Projectile,
  ProjectileKind,
  Tower,
  UnitCategory,
  WaveTracker
} from "../types";

export class GameScene extends Phaser.Scene {
  private levelId = "0-1";
  private levelConfig = getLevelConfig("0-1");
  private difficulty = DEFAULT_DIFFICULTY;
  private difficultyConfig = getDifficultyConfig(DEFAULT_DIFFICULTY);
  private selectedCardIds: CardId[] = [...defaultLoadout];
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
  private charsText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private toastText!: Phaser.GameObjects.Text;
  private debugButton!: Phaser.GameObjects.Rectangle;
  private debugText!: Phaser.GameObjects.Text;
  private autoUpgradeButton!: Phaser.GameObjects.Rectangle;
  private autoUpgradeText!: Phaser.GameObjects.Text;
  private eraserButton!: Phaser.GameObjects.Rectangle;
  private eraserText!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Container;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlayButtonText!: Phaser.GameObjects.Text;
  private overlayAction: "menu" = "menu";

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
    this.occupied = new Map<string, Tower>();
    this.chars = STARTING_CHARS;
    this.baseIntegrity = BASE_INTEGRITY;
    this.wave = 0;
    this.waveTracker = null;
    this.enemiesDefeated = 0;
    this.towerOrder = 0;
    this.gameOver = false;
    this.battlePaused = false;
    this.eraserMode = false;
    this.autoUpgradeMode = false;
    this.levelElapsed = 0;
    this.battleTime = 0;
    this.cardTime = 0;
    this.nextNaturalProduceAt = NATURAL_PRODUCE_INTERVAL;
    this.overlayAction = "menu";
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBoard();
    this.createHud();
    this.spawnBossIfNeeded();
    this.createCards();
    this.createOverlay();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handleBoardPointer(pointer.x, pointer.y);
    });

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
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
    this.updateBoss(seconds);
    this.updateEnemies(this.battleTime, seconds);
    this.updateTowers(this.battleTime);
    this.updateProjectiles(seconds);
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

  private createHud() {
    this.add
      .text(28, 24, `${t("app.title")} ${this.levelId} D${this.difficulty}`, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "25px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);

    this.charsText = this.add.text(28, 70, "", {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "18px"
    });

    this.statusText = this.add.text(240, 92, "", {
      color: "#8c8c8c",
      fontFamily: "monospace",
      fontSize: "16px"
    });

    this.progressText = this.add
      .text(GAME_WIDTH - 28, GAME_HEIGHT - 50, "", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px"
      })
      .setOrigin(1, 1);
    this.add
      .rectangle(GAME_WIDTH - 28 - PROGRESS_BAR_WIDTH, GAME_HEIGHT - 24, PROGRESS_BAR_WIDTH, 4, palette.dim, 1)
      .setOrigin(0, 0.5);
    this.progressFill = this.add
      .rectangle(GAME_WIDTH - 28 - PROGRESS_BAR_WIDTH, GAME_HEIGHT - 24, 0, 4, palette.white, 1)
      .setOrigin(0, 0.5);

    this.toastText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, "", {
        color: "#d8d8d8",
        fontFamily: "monospace",
        fontSize: "16px"
      })
      .setOrigin(0.5, 0.5);

    this.createCombatTools();
  }

  private createCombatTools() {
    this.createDebugTool();
    this.createAutoUpgradeTool();
    this.createEraserTool();
  }

  private createDebugTool() {
    const x = GAME_WIDTH - 332;
    const y = 42;
    this.debugButton = this.add
      .rectangle(x, y, 110, 40, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.75)
      .setInteractive({ useHandCursor: true })
      .setDepth(30);
    this.debugText = this.add
      .text(x, y - 2, t("button.debug"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setDepth(31);

    this.debugButton.on("pointerdown", () => this.grantDebugChars());
    this.debugText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.grantDebugChars());
  }

  private createAutoUpgradeTool() {
    const x = GAME_WIDTH - 196;
    const y = 42;
    this.autoUpgradeButton = this.add
      .rectangle(x, y, 126, 40, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.75)
      .setInteractive({ useHandCursor: true })
      .setDepth(30);
    this.autoUpgradeText = this.add
      .text(x, y - 2, t("button.autoUpgrade"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setDepth(31);

    this.autoUpgradeButton.on("pointerdown", () => this.toggleAutoUpgradeMode());
    this.updateAutoUpgradeTool();
  }

  private createEraserTool() {
    const x = GAME_WIDTH - 68;
    const y = 42;
    this.eraserButton = this.add
      .rectangle(x, y, 100, 40, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.75)
      .setInteractive({ useHandCursor: true })
      .setDepth(30);
    this.eraserText = this.add
      .text(x, y - 2, t("button.erase"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "700"
      })
      .setOrigin(0.5)
      .setDepth(31);

    this.eraserButton.on("pointerdown", () => this.toggleEraser());
    this.updateEraserTool();
  }

  private createCards() {
    this.selectedCardIds.map((cardId) => getCardDefinition(cardId)).forEach((definition, index) => {
      const x = 28;
      const y = 122 + index * 82;
      const frame = this.add
        .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, palette.black, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(2, palette.dim, 1)
        .setInteractive({ useHandCursor: true });

      const previewBorder = this.createUnitBorder(definition.category, 19, 2).setPosition(x + 37, y + 34);
      const label = this.add.text(x + 37, y + 31, definition.id, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "27px",
        fontStyle: "700"
      }).setOrigin(0.5);
      const costText = this.add.text(x + 78, y + 11, `${definition.cost}`, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px"
      });
      const statsText = this.add.text(x + 78, y + 35, definition.stats, {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "13px"
      });

      const barBack = this.add.rectangle(x + 17, y + 58, CARD_BAR_WIDTH, 4, palette.dim, 1).setOrigin(0, 0.5);
      const cooldownFill = this.add
        .rectangle(x + 17, y + 58, CARD_BAR_WIDTH, 4, palette.white, 1)
        .setOrigin(0, 0.5);

      frame.on("pointerdown", () => this.selectCard(definition.id));

      this.cardStates.push({
        definition,
        frame,
        cooldownFill,
        content: [previewBorder, label, costText, statsText, barBack],
        readyAt: 0
      });
    });

    this.updateCards(this.cardTime);
  }

  private createUnitBorder(category: UnitCategory, radius: number, lineWidth: number) {
    const border = this.add.graphics();
    border.fillStyle(palette.black, 1);
    border.lineStyle(lineWidth, palette.white, 1);

    if (category === "production") {
      border.fillCircle(0, 0, radius);
      border.strokeCircle(0, 0, radius);
      return border;
    }

    if (category === "defense") {
      border.fillRect(-radius, -radius, radius * 2, radius * 2);
      border.strokeRect(-radius, -radius, radius * 2, radius * 2);
      return border;
    }

    if (category === "healing") {
      border.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = Phaser.Math.DegToRad(-90 + index * 60);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) {
          border.moveTo(x, y);
        } else {
          border.lineTo(x, y);
        }
      }
      border.closePath();
      border.fillPath();
      border.strokePath();
      return border;
    }

    border.beginPath();
    if (category === "attack") {
      border.moveTo(0, -radius);
      border.lineTo(radius, 0);
      border.lineTo(0, radius);
      border.lineTo(-radius, 0);
    } else {
      border.moveTo(0, -radius);
      border.lineTo(radius, radius * 0.82);
      border.lineTo(-radius, radius * 0.82);
    }
    border.closePath();
    border.fillPath();
    border.strokePath();
    return border;
  }

  private createOverlay() {
    const plate = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 360, 160, palette.black, 0.98)
      .setStrokeStyle(2, palette.white, 1);
    this.overlayTitle = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, t("overlay.breach"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "30px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    const menuButton = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 34, 118, 38, palette.black, 1)
      .setStrokeStyle(2, palette.white, 1)
      .setInteractive({ useHandCursor: true });
    this.overlayButtonText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 31, t("button.menu"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "16px"
      })
      .setOrigin(0.5);

    menuButton.on("pointerdown", () => this.handleOverlayAction());

    this.overlay = this.add.container(0, 0, [plate, this.overlayTitle, menuButton, this.overlayButtonText]);
    this.overlay.setVisible(false);
    this.overlay.setDepth(200);
  }

  private handleBoardPointer(x: number, y: number) {
    if (this.gameOver || !this.isInsideBoard(x, y)) {
      return;
    }

    const column = Math.floor((x - BOARD_X) / CELL_WIDTH);
    const lane = Math.floor((y - BOARD_Y) / CELL_HEIGHT);
    const key = this.cellKey(lane, column);
    const existingTower = this.occupied.get(key);

    if (this.eraserMode) {
      if (!existingTower) {
        this.showToast(t("toast.empty"));
        return;
      }

      const erasedX = existingTower.x;
      const erasedY = existingTower.y;
      this.removeTower(existingTower);
      this.makeEraseMark(erasedX, erasedY);
      this.eraserMode = false;
      this.updateCards(this.cardTime);
      return;
    }

    if (this.autoUpgradeMode) {
      if (!existingTower) {
        this.showToast(t("toast.empty"));
        return;
      }

      this.setTowerAutoUpgrade(existingTower, !existingTower.autoUpgrade);
      this.showToast(existingTower.autoUpgrade ? t("toast.autoOn") : t("toast.autoOff"));
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
    const x = BOARD_X + column * CELL_WIDTH + CELL_WIDTH / 2;
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    const body = this.add.container(x, y).setDepth(20 + lane);
    const border = this.createUnitBorder(definition.category, 24, definition.id === "B" || definition.id === "D" ? 3 : 2);
    const autoUpgradeBorder = this.createAutoUpgradeBorder();
    const label = this.add
      .text(0, -3, definition.id, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "34px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    const hpBack = this.add.rectangle(0, 31, 42, 4, palette.dim, 1);
    const hpFill = this.add.rectangle(-21, 31, 42, 4, palette.white, 1).setOrigin(0, 0.5);
    const levelText = this.add
      .text(0, 17, "1", {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    body.add([autoUpgradeBorder, border, label, levelText, hpBack, hpFill]);
    if (definition.id === "G") {
      border.setVisible(false);
    }

    const tower: Tower = {
      id: `${lane}:${column}:${this.battleTime}`,
      type: definition.id,
      lane,
      column,
      x,
      y,
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      baseMaxHp: definition.maxHp,
      armor: definition.armor ?? 0,
      magicResistance: definition.magicResistance ?? 0,
      fireRate: definition.fireRate ?? Number.POSITIVE_INFINITY,
      lastFire: -Number.POSITIVE_INFINITY,
      level: 1,
      nextProduceAt: definition.produceEvery ? this.battleTime + definition.produceEvery : Number.POSITIVE_INFINITY,
      armedAt: definition.armTime ? this.battleTime + definition.armTime : 0,
      autoUpgrade: false,
      placedOrder: this.towerOrder,
      body,
      border,
      autoUpgradeBorder,
      hpFill,
      levelText
    };
    this.towerOrder += 1;

    this.towers.push(tower);
    this.occupied.set(this.cellKey(lane, column), tower);
  }

  private upgradeTower(tower: Tower) {
    const previousEffectiveUpgrades = effectiveUpgradeCountForLevel(tower.level);
    tower.level += 1;
    tower.levelText.setText(`${tower.level}`);
    tower.levelText.setAlpha(1);
    const gainedEffectiveUpgrades = effectiveUpgradeCountForLevel(tower.level) - previousEffectiveUpgrades;
    this.applyUpgradeStats(tower, gainedEffectiveUpgrades);
    this.tweens.add({
      targets: tower.body,
      scale: 1.08,
      yoyo: true,
      duration: 90,
      ease: "Quad.easeOut"
    });
  }

  private createAutoUpgradeBorder() {
    const border = this.add.graphics();
    border.lineStyle(2, palette.green, 0.95);
    border.strokeCircle(0, 0, 31);
    border.setVisible(false);
    return border;
  }

  private applyUpgradeStats(tower: Tower, gainedEffectiveUpgrades: number) {
    if ((tower.type === "B" || tower.type === "D" || tower.type === "L") && gainedEffectiveUpgrades > 0) {
      const hpGain = tower.baseMaxHp * 0.8 * gainedEffectiveUpgrades;
      tower.maxHp += hpGain;
      tower.hp = Math.min(tower.maxHp, tower.hp + hpGain);
      this.updateTowerHpBar(tower);
    }

    if (tower.type === "G") {
      this.resetTrapArming(tower);
    }
  }

  private updateProducers(time: number) {
    for (const tower of this.towers) {
      const definition = this.getDefinition(tower.type);
      if (!definition.produceEvery || !definition.produceAmount) {
        continue;
      }

      while (time >= tower.nextProduceAt) {
        const amount = this.getProductionAmount(tower, definition);
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

  private getProductionAmount(tower: Tower, definition: CardDefinition) {
    return Math.round((definition.produceAmount ?? 0) * (1 + effectiveUpgradeCountForLevel(tower.level) * 0.8));
  }

  private gainChars(amount: number, x: number, y: number) {
    this.chars = Math.min(MAX_CHARS, this.chars + amount);
    this.makeProductionPulse(x, y, amount);
    this.attemptAutoUpgrades();
  }

  private spawnBossIfNeeded() {
    if (!this.levelConfig.bossKind) {
      return;
    }

    const bossRank = this.levelConfig.bossKind === "cube2" ? 2 : 1;
    const x = BOARD_X + BOARD_WIDTH - BOSS_HITBOX_WIDTH / 2;
    const y = BOARD_Y + BOARD_HEIGHT / 2;
    const frame = this.add.graphics();
    const labelText = this.add
      .text(0, -3, toRomanNumeral(bossRank), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "34px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    const body = this.add.container(x, y, [frame, labelText]).setDepth(88);

    this.boss = {
      kind: this.levelConfig.bossKind,
      rank: bossRank,
      label: toRomanNumeral(bossRank),
      x,
      y,
      hp: CUBE_BOSS_MAX_HP,
      maxHp: CUBE_BOSS_MAX_HP,
      armor: bossRank >= 2 ? 600 : 300,
      magicResistance: 50,
      finalDamageReduction: this.difficultyConfig.finalDamageReduction,
      speed: 0.6,
      advanceMinionKind: bossRank >= 2 ? "square2" : "square",
      skills: {
        promotion: {
          name: "promotion",
          sp: 0,
          maxSp: CUBE_BOSS_PROMOTION_SKILL_MAX,
          cost: CUBE_BOSS_PROMOTION_SKILL_COST,
          gainBuffer: 0
        },
        advance: {
          name: "advance",
          sp: 0,
          maxSp: CUBE_BOSS_ADVANCE_SKILL_MAX,
          cost: CUBE_BOSS_ADVANCE_SKILL_COST,
          gainBuffer: 0
        },
        ...(bossRank >= 2
          ? {
              promotion2: {
                name: "promotion2" as const,
                sp: 0,
                maxSp: CUBE_BOSS_PROMOTION2_SKILL_MAX,
                cost: CUBE_BOSS_PROMOTION2_SKILL_COST,
                gainBuffer: 0
              }
            }
          : {})
      },
      contactAttackBuffer: 0,
      body,
      frame,
      labelText,
      rotationX: Phaser.Math.FloatBetween(-0.4, 0.4),
      rotationY: Phaser.Math.FloatBetween(-0.4, 0.4),
      rotationZ: Phaser.Math.FloatBetween(-0.2, 0.2),
      velocityX: 0.18,
      velocityY: -0.12,
      velocityZ: 0.1,
      targetVelocityX: 0.18,
      targetVelocityY: -0.12,
      targetVelocityZ: 0.1,
      nextTurnIn: 1.8
    };

    this.drawBossCube(this.boss);
  }

  private updateBoss(seconds: number) {
    const boss = this.boss;
    if (!boss) {
      return;
    }

    boss.x -= boss.speed * seconds;
    boss.body.setPosition(boss.x, boss.y);

    boss.nextTurnIn -= seconds;
    if (boss.nextTurnIn <= 0) {
      boss.targetVelocityX = Phaser.Math.FloatBetween(-0.32, 0.32);
      boss.targetVelocityY = Phaser.Math.FloatBetween(-0.32, 0.32);
      boss.targetVelocityZ = Phaser.Math.FloatBetween(-0.22, 0.22);
      boss.nextTurnIn = Phaser.Math.FloatBetween(2.2, 4.6);
    }

    const turnEase = Phaser.Math.Clamp(seconds * 0.55, 0, 1);
    boss.velocityX = Phaser.Math.Linear(boss.velocityX, boss.targetVelocityX, turnEase);
    boss.velocityY = Phaser.Math.Linear(boss.velocityY, boss.targetVelocityY, turnEase);
    boss.velocityZ = Phaser.Math.Linear(boss.velocityZ, boss.targetVelocityZ, turnEase);
    boss.rotationX += boss.velocityX * seconds;
    boss.rotationY += boss.velocityY * seconds;
    boss.rotationZ += boss.velocityZ * seconds;
    this.drawBossCube(boss);
    this.updateBossSkills(boss, seconds);
    this.triggerFunctionalTowersTouchingBoss(boss);
    if (!this.boss) {
      return;
    }
    this.damageBossTouchingTowers(boss, seconds);

    if (this.bossRect(boss).left <= BOARD_X - 20) {
      this.endGame();
    }
  }

  private triggerFunctionalTowersTouchingBoss(boss: CubeBoss) {
    const rect = this.bossRect(boss);
    for (const tower of [...this.towers]) {
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, this.towerRect(tower))) {
        continue;
      }

      if (tower.type === "G" && this.isTrapArmed(tower, this.battleTime)) {
        this.triggerTrapTower(tower, "boss");
        if (!this.boss) {
          return;
        }
        continue;
      }

      if (tower.type === "F") {
        this.triggerShockTower(tower);
      }
    }
  }

  private damageBossTouchingTowers(boss: CubeBoss, seconds: number) {
    boss.contactAttackBuffer += seconds;
    if (boss.contactAttackBuffer < CUBE_BOSS_CONTACT_INTERVAL) {
      return;
    }

    const rect = this.bossRect(boss);
    while (boss.contactAttackBuffer >= CUBE_BOSS_CONTACT_INTERVAL) {
      const targets = this.towers.filter((tower) => {
        return Phaser.Geom.Intersects.RectangleToRectangle(rect, this.towerRect(tower));
      });

      for (const tower of targets) {
        this.makeCubeCollapse(tower.x, tower.y, tower);
        this.damageTower(tower, CUBE_BOSS_CONTACT_DAMAGE, "physical");
      }

      boss.contactAttackBuffer -= CUBE_BOSS_CONTACT_INTERVAL;
    }
  }

  private drawBossCube(boss: CubeBoss) {
    const size = 59;
    const vertices = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1]
    ].map(([x, y, z]) => this.projectCubePoint(x * size, y * size, z * size, boss));
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7]
    ];

    boss.frame.clear();
    boss.frame.lineStyle(2, palette.white, 0.95);
    for (const [from, to] of edges) {
      boss.frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
    }
  }

  private projectCubePoint(x: number, y: number, z: number, boss: CubeBoss) {
    const cosX = Math.cos(boss.rotationX);
    const sinX = Math.sin(boss.rotationX);
    const cosY = Math.cos(boss.rotationY);
    const sinY = Math.sin(boss.rotationY);
    const cosZ = Math.cos(boss.rotationZ);
    const sinZ = Math.sin(boss.rotationZ);

    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;
    const x2 = x * cosY + z1 * sinY;
    const z2 = -x * sinY + z1 * cosY;
    const x3 = x2 * cosZ - y1 * sinZ;
    const y3 = x2 * sinZ + y1 * cosZ;
    const scale = 1.25 / (1 + z2 / 360);
    return { x: x3 * scale, y: y3 * scale };
  }

  private updateBossSkills(boss: CubeBoss, seconds: number) {
    this.gainBossSkill(boss.skills.promotion, seconds);
    this.gainBossSkill(boss.skills.advance, seconds);
    if (boss.skills.promotion2) {
      this.gainBossSkill(boss.skills.promotion2, seconds);
      this.tryUsePromotionSkill(boss, boss.skills.promotion2, 2);
    }
    this.tryUsePromotionSkill(boss, boss.skills.promotion, 1);
    this.tryUseAdvanceSkill(boss);
  }

  private gainBossSkill(skill: BossSkill, seconds: number) {
    skill.gainBuffer += seconds;
    while (skill.gainBuffer >= 1) {
      skill.sp = Math.min(skill.maxSp, skill.sp + 1);
      skill.gainBuffer -= 1;
    }
  }

  private tryUsePromotionSkill(boss: CubeBoss, skill: BossSkill<"promotion" | "promotion2">, fromRank: number) {
    if (skill.sp < skill.maxSp) {
      return;
    }

    const target = this.findPromotionTarget(boss, fromRank);
    if (!target) {
      return;
    }

    this.spendBossSkill(skill);
    this.promoteEnemy(target);
  }

  private tryUseAdvanceSkill(boss: CubeBoss) {
    const skill = boss.skills.advance;
    if (skill.sp < skill.maxSp) {
      return;
    }

    this.spendBossSkill(skill);
    this.summonBossAdvanceMinions(boss);
  }

  private spendBossSkill(skill: BossSkill) {
    skill.sp = Math.max(0, skill.sp - skill.cost);
  }

  private findPromotionTarget(boss: CubeBoss, fromRank: number) {
    return this.enemies
      .filter((enemy) => this.enemyRank(enemy.kind) === fromRank && this.promotedKind(enemy.kind))
      .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))[0];
  }

  private promotedKind(kind: EnemyKind): EnemyKind | null {
    if (kind === "circle") {
      return "circle2";
    }
    if (kind === "circle2") {
      return "circle3";
    }
    if (kind === "triangle") {
      return "triangle2";
    }
    if (kind === "triangle2") {
      return "triangle3";
    }
    if (kind === "square") {
      return "square2";
    }
    if (kind === "square2") {
      return "square3";
    }
    return null;
  }

  private enemyRank(kind: EnemyKind) {
    return Number.parseInt(enemyDefinitions[kind].label ?? "1", 10);
  }

  private promoteEnemy(enemy: Enemy) {
    const promotedKind = this.promotedKind(enemy.kind);
    if (!promotedKind || !this.enemies.includes(enemy)) {
      return;
    }

    const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
    const definition = enemyDefinitions[promotedKind];
    enemy.kind = promotedKind;
    enemy.maxHp = definition.hp;
    enemy.hp = Math.max(1, definition.hp * hpRatio);
    enemy.armor = definition.armor;
    enemy.magicResistance = definition.magicResistance;
    enemy.damage = definition.damage;
    enemy.damageType = definition.damageType;
    enemy.attackInterval = this.enemyAttackInterval(promotedKind);
    enemy.attackAt = Math.min(enemy.attackAt, this.battleTime + enemy.attackInterval);
    enemy.speed =
      ENEMY_SPEED *
      (definition.speedMultiplier ?? 1) *
      Phaser.Math.FloatBetween(1 - ENEMY_SPEED_VARIANCE, 1 + ENEMY_SPEED_VARIANCE);
    enemy.body.removeAll(true);
    enemy.shape = this.createEnemyShape(promotedKind);
    enemy.body.add(enemy.shape);
    enemy.shape.setScale(this.enemyScaleFromHp(Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1)));
    this.makeCubeCollapse(enemy.x, enemy.y, enemy);
  }

  private summonBossAdvanceMinions(boss: CubeBoss) {
    const centerLane = Phaser.Math.Clamp(Math.round((boss.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
    const x = this.bossRect(boss).left - CELL_WIDTH / 2;
    const waveNumber = this.wave || 0;
    for (const lane of [centerLane - 1, centerLane, centerLane + 1]) {
      if (lane < 0 || lane >= LANES) {
        continue;
      }
      this.spawnEnemyAt(boss.advanceMinionKind, waveNumber, this.battleTime, lane, x, 0);
      this.makeCubeCollapse(x, BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2);
    }
  }

  private updateTowers(time: number) {
    for (const tower of this.towers) {
      const definition = this.getDefinition(tower.type);
      if (tower.type === "H") {
        if (!definition.healAmount || time < tower.lastFire + tower.fireRate || !this.hasHealTargets(tower)) {
          continue;
        }

        this.startTowerVolley(tower, definition, time);
        continue;
      }

      if (tower.type === "L") {
        if (time < tower.lastFire + tower.fireRate || this.getShiftTargets(tower).length === 0) {
          continue;
        }

        this.startTowerVolley(tower, definition, time);
        continue;
      }

      if (tower.type === "I") {
        if (!definition.damage || time < tower.lastFire + tower.fireRate || !this.hasAttackTarget(tower, definition)) {
          continue;
        }

        this.startTowerVolley(tower, definition, time);
        continue;
      }

      if (!definition.damage || time < tower.lastFire + tower.fireRate) {
        continue;
      }

      const target = this.getAttackTarget(tower, definition);

      if (!target && !this.canAttackBoss(tower, definition)) {
        continue;
      }

      this.startTowerVolley(tower, definition, time);
    }
  }

  private startTowerVolley(tower: Tower, definition: CardDefinition, time: number) {
    const shots = this.isVolleyUpgradeable(tower.type) ? effectiveLevelForLevel(tower.level) : 1;
    const volleyInterval = this.getVolleyInterval(tower);

    for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
      this.time.delayedCall(shotIndex * volleyInterval, () => {
        this.runWhenBattleActive(() => {
          if (this.gameOver || !this.towers.includes(tower)) {
            return;
          }
          this.fireTowerShot(tower, definition);
        });
      });
    }

    tower.lastFire = time + (shots - 1) * volleyInterval;
  }

  private getVolleyInterval(tower: Tower) {
    const shots = effectiveLevelForLevel(tower.level);
    if (shots <= 1) {
      return 0;
    }

    const totalVolleyTime = tower.fireRate * (1 - 0.8 ** (shots - 1));
    return totalVolleyTime / (shots - 1);
  }

  private fireTowerShot(tower: Tower, definition: CardDefinition) {
    if (tower.type === "H") {
      this.fireHealingPulse(tower, definition);
      return;
    }

    if (tower.type === "L") {
      this.fireShiftPulse(tower, definition);
      return;
    }

    if (tower.type === "A") {
      this.createProjectile(
        "bolt",
        tower.x + 24,
        tower.y,
        tower.lane,
        540,
        definition.damage ?? 0,
        definition.damageType ?? "physical",
        0
      );
      return;
    }

    if (tower.type === "E" || tower.type === "M" || tower.type === "W") {
      for (const angle of this.fanAnglesFor(tower.type)) {
        this.createProjectile(
          "bolt",
          tower.type === "E" ? tower.x + 24 : tower.x,
          tower.y,
          tower.lane,
          540,
          definition.damage ?? 0,
          definition.damageType ?? "physical",
          0,
          angle
        );
      }
      return;
    }

    if (tower.type === "I") {
      this.createProjectile(
        "star",
        tower.x + 12,
        tower.y,
        tower.lane,
        540,
        definition.damage ?? 0,
        definition.damageType ?? "magic",
        0,
        0,
        this.attackRangeRight(tower, definition)
      );
      return;
    }

    if (tower.type === "K") {
      this.fireSlash(tower, definition);
      return;
    }

    if (tower.type === "C" || tower.type === "J") {
      this.createProjectile(
        tower.type === "J" ? "hash" : "shell",
        tower.x + 22,
        tower.y,
        tower.lane,
        390,
        definition.damage ?? 0,
        definition.damageType ?? "physical",
        definition.splashRadius ?? CELL_WIDTH,
        0,
        tower.type === "J" ? this.attackRangeRight(tower, definition) : Number.POSITIVE_INFINITY
      );
    }
  }

  private fireHealingPulse(tower: Tower, definition: CardDefinition) {
    const target = this.getHealTarget(tower);
    if (target) {
      this.healTower(target, definition.healAmount ?? 60);
    }
  }

  private fireShiftPulse(tower: Tower, definition: CardDefinition) {
    const targets = this.getShiftTargets(tower);
    if (targets.length === 0) {
      return;
    }

    for (const target of targets) {
      const previousY = target.y;
      target.lane = tower.lane;
      target.y = tower.y;
      target.body.setDepth(60 + target.lane);
      target.body.setPosition(target.x, target.y);
      this.makeShiftEffect(target.x, previousY, target.x, target.y);
    }
    for (let index = 0; index < targets.length; index += 1) {
      if (!this.towers.includes(tower)) {
        break;
      }
      this.damageTower(tower, definition.selfDamage ?? 400, definition.selfDamageType ?? "true");
    }
  }

  private fireSlash(tower: Tower, definition: CardDefinition) {
    const damage = definition.damage ?? 0;
    const damageType = definition.damageType ?? "physical";
    const target = this.getAttackTarget(tower, definition);
    if (target) {
      this.makeSlashEffect(target.x, target.y, damageType);
      this.damageEnemy(target, damage, damageType);
      return;
    }

    const boss = this.boss;
    if (!boss || !this.canAttackBoss(tower, definition)) {
      return;
    }

    const rect = this.bossRect(boss);
    const x = Phaser.Math.Clamp(tower.x + CELL_WIDTH, rect.left, rect.right);
    const y = Phaser.Math.Clamp(tower.y, rect.top, rect.bottom);
    this.makeSlashEffect(x, y, damageType);
    this.damageBoss(damage, damageType);
  }

  private hasHealTargets(tower: Tower) {
    return Boolean(this.getHealTarget(tower));
  }

  private getHealTarget(tower: Tower) {
    const frontColumn = tower.column + 1;
    if (frontColumn >= COLUMNS) {
      return undefined;
    }

    return [tower.lane - 1, tower.lane, tower.lane + 1]
      .map((lane) => (lane >= 0 && lane < LANES ? this.occupied.get(this.cellKey(lane, frontColumn)) : undefined))
      .filter((target): target is Tower => Boolean(target && target.hp < target.maxHp))
      .sort((a, b) => {
        const hpRatioDelta = a.hp / a.maxHp - b.hp / b.maxHp;
        return hpRatioDelta || a.placedOrder - b.placedOrder;
      })[0];
  }

  private healTower(tower: Tower, amount: number) {
    const previousHp = tower.hp;
    tower.hp = Math.min(tower.maxHp, tower.hp + amount);
    if (tower.hp <= previousHp) {
      return;
    }

    this.updateTowerHpBar(tower);
    this.makeHealParticles(tower.x, tower.y);
  }

  private isVolleyUpgradeable(type: CardId) {
    return (
      type === "A" ||
      type === "C" ||
      type === "E" ||
      type === "M" ||
      type === "W" ||
      type === "H" ||
      type === "I" ||
      type === "J" ||
      type === "K"
    );
  }

  private fanAnglesFor(type: CardId) {
    if (type === "W") {
      return [-100, -90, -80];
    }
    if (type === "M") {
      return [80, 90, 100];
    }
    return [-10, 0, 10];
  }

  private getShiftTargets(tower: Tower) {
    const targetLanes = [tower.lane - 1, tower.lane + 1].filter((lane) => lane >= 0 && lane < LANES);
    const targetColumns = [tower.column, tower.column + 1].filter((column) => column >= 0 && column < COLUMNS);
    const ranges = targetColumns.map((column) => ({
      left: BOARD_X + column * CELL_WIDTH,
      right: BOARD_X + (column + 1) * CELL_WIDTH
    }));

    return this.enemies
      .filter((enemy) => {
        return targetLanes.includes(enemy.lane) && ranges.some((range) => enemy.x >= range.left && enemy.x < range.right);
      })
      .sort((a, b) => a.x - b.x || Math.abs(a.lane - tower.lane) - Math.abs(b.lane - tower.lane));
  }

  private getAttackTarget(tower: Tower, definition: CardDefinition) {
    if (tower.type === "M" || tower.type === "W") {
      return this.getVerticalFanTarget(tower);
    }

    if (tower.type === "I" || tower.type === "J" || tower.type === "K") {
      const rangeLeft = BOARD_X + tower.column * CELL_WIDTH;
      const rangeRight = this.attackRangeRight(tower, definition);
      return this.enemies
        .filter((enemy) => enemy.lane === tower.lane && enemy.x >= rangeLeft && enemy.x <= rangeRight)
        .sort((a, b) => a.x - b.x)[0];
    }

    return this.enemies
      .filter((enemy) => enemy.lane === tower.lane && enemy.x > tower.x + 24)
      .sort((a, b) => a.x - b.x)[0];
  }

  private attackRangeRight(tower: Tower, definition: CardDefinition) {
    const rangeCells = definition.rangeCells ?? COLUMNS;
    return BOARD_X + Math.min(COLUMNS, tower.column + rangeCells) * CELL_WIDTH;
  }

  private hasAttackTarget(tower: Tower, definition: CardDefinition) {
    return Boolean(this.getAttackTarget(tower, definition) || this.canAttackBoss(tower, definition));
  }

  private canAttackBoss(tower: Tower, definition: CardDefinition) {
    if (!this.boss) {
      return false;
    }

    const rect = this.bossRect(this.boss);
    if (tower.y < rect.top || tower.y > rect.bottom) {
      return false;
    }

    if (tower.type === "I" || tower.type === "J" || tower.type === "K") {
      const rangeLeft = BOARD_X + tower.column * CELL_WIDTH;
      const rangeRight = this.attackRangeRight(tower, definition);
      return rect.right >= rangeLeft && rect.left <= rangeRight;
    }

    if (tower.type === "M" || tower.type === "W") {
      const verticalDirection = tower.type === "M" ? 1 : -1;
      const bossIsInDirection = verticalDirection > 0 ? rect.top > tower.y : rect.bottom < tower.y;
      if (!bossIsInDirection) {
        return false;
      }

      const distance = verticalDirection > 0 ? rect.top - tower.y : tower.y - rect.bottom;
      const spread = CELL_WIDTH * 0.35 + Math.tan(Phaser.Math.DegToRad(10)) * distance;
      return tower.x >= rect.left - spread && tower.x <= rect.right + spread;
    }

    return rect.right > tower.x + 12;
  }

  private getVerticalFanTarget(tower: Tower) {
    const verticalDirection = tower.type === "M" ? 1 : -1;
    return this.enemies
      .filter((enemy) => {
        const dy = enemy.y - tower.y;
        if (dy * verticalDirection <= 0) {
          return false;
        }

        const spread = CELL_WIDTH * 0.35 + Math.tan(Phaser.Math.DegToRad(10)) * Math.abs(dy);
        return Math.abs(enemy.x - tower.x) <= spread;
      })
      .sort((a, b) => Math.abs(a.y - tower.y) - Math.abs(b.y - tower.y))[0];
  }

  private createProjectile(
    type: ProjectileKind,
    x: number,
    y: number,
    lane: number,
    speed: number,
    damage: number,
    damageType: DamageType,
    splashRadius: number,
    angleDegrees = 0,
    maxX = Number.POSITIVE_INFINITY
  ) {
    const angle = Phaser.Math.DegToRad(angleDegrees);
    const projectileColor = this.damageEffectColor(damageType);
    let body: Phaser.GameObjects.Shape | Phaser.GameObjects.Text;
    if (type === "bolt") {
      body = this.add.rectangle(x, y, 18, 4, projectileColor, 1);
    } else if (type === "star" || type === "hash") {
      body = this.add
        .text(x, y - 1, type === "star" ? "*" : "#", {
          color: this.damageEffectTextColor(damageType),
          fontFamily: "monospace",
          fontSize: "22px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
    } else {
      body = this.add.circle(x, y, 7, palette.black, 1).setStrokeStyle(2, projectileColor, 1);
    }
    body.setDepth(90);
    body.rotation = angle;

    this.projectiles.push({
      type,
      lane,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      damageType,
      splashRadius,
      maxX,
      body
    });
  }

  private damageEffectColor(damageType: DamageType) {
    return damageType === "magic" ? palette.magic : palette.white;
  }

  private damageEffectTextColor(damageType: DamageType) {
    return damageType === "magic" ? "#9fdcff" : "#f5f5f5";
  }

  private updateProjectiles(seconds: number) {
    for (const projectile of [...this.projectiles]) {
      const nextX = projectile.x + projectile.vx * seconds;
      const reachedMaxX = nextX >= projectile.maxX;
      projectile.x = reachedMaxX ? projectile.maxX : nextX;
      projectile.y += projectile.vy * seconds;
      projectile.body.setPosition(projectile.x, projectile.y);

      const hit = this.enemies.find(
        (enemy) => Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) < 22
      );
      const hitBoss = this.isPointInBossHitbox(projectile.x, projectile.y);

      if (!hit && !hitBoss) {
        if (
          reachedMaxX ||
          projectile.x < BOARD_X - 60 ||
          projectile.x > BOARD_X + BOARD_WIDTH + 52 ||
          projectile.y < BOARD_Y - 60 ||
          projectile.y > BOARD_Y + BOARD_HEIGHT + 60
        ) {
          this.removeProjectile(projectile);
        }
        continue;
      }

      if (projectile.type === "bolt" || projectile.type === "star") {
        if (hit) {
          this.makeHitShards(hit.x, hit.y, projectile.damageType);
          this.damageEnemy(hit, projectile.damage, projectile.damageType);
        } else {
          this.makeHitShards(projectile.x, projectile.y, projectile.damageType);
          this.damageBoss(projectile.damage, projectile.damageType);
        }
      } else {
        const burstX = hit ? hit.x : projectile.x;
        const burstY = hit ? hit.y : projectile.y;
        this.makeShellBurst(burstX, burstY, projectile.splashRadius, projectile.damageType);
        for (const enemy of [...this.enemies]) {
          const dx = enemy.x - burstX;
          const dy = enemy.y - burstY;
          if (Math.hypot(dx, dy) <= projectile.splashRadius) {
            this.damageEnemy(enemy, projectile.damage, projectile.damageType);
          }
        }
        if (this.isBossInRadius(burstX, burstY, projectile.splashRadius)) {
          this.damageBoss(projectile.damage, projectile.damageType);
        }
      }

      this.removeProjectile(projectile);
    }
  }

  private updateEnemies(time: number, seconds: number) {
    for (const enemy of [...this.enemies]) {
      const blocker = this.towers
        .filter((tower) => tower.lane === enemy.lane && Math.abs(enemy.x - tower.x) < 38)
        .sort((a, b) => b.x - a.x)[0];

      if (blocker) {
        if (blocker.type === "G" && this.isTrapArmed(blocker, time)) {
          this.triggerTrapTower(blocker, enemy);
          continue;
        }

        if (blocker.type === "F") {
          this.triggerShockTower(blocker);
          continue;
        }

        if (time >= enemy.attackAt) {
          this.damageTower(blocker, enemy.damage, enemy.damageType);
          if (blocker.type === "B") {
            const definition = this.getDefinition(blocker.type);
            this.damageEnemy(enemy, definition.reflectDamage ?? 20, definition.reflectDamageType ?? "physical");
            this.makeReflectFlash(blocker.x, blocker.y);
          }
          enemy.attackAt = time + enemy.attackInterval;
        }
      } else {
        enemy.x -= enemy.speed * seconds;
        enemy.body.setPosition(enemy.x, enemy.y);
      }

      if (!this.enemies.includes(enemy)) {
        continue;
      }

      if (enemy.x < BOARD_X - 34) {
        this.baseIntegrity -= 1;
        this.removeEnemy(enemy, false);
        this.cameras.main.shake(110, 0.004);
        if (this.baseIntegrity <= 0) {
          this.endGame();
          return;
        }
      }
    }
  }

  private updateWaveSchedule(levelElapsed: number, gameTime: number) {
    if (!this.levelConfig.endless && this.levelConfig.totalWaves && this.wave >= this.levelConfig.totalWaves) {
      if (this.enemies.length === 0) {
        this.endLevel();
      }
      return;
    }

    if (!this.waveTracker) {
      if (levelElapsed >= FIRST_SPAWN_AT) {
        this.spawnWave(levelElapsed, gameTime);
      }
      return;
    }

    const halfDefeated = this.waveTracker.defeatedWeight >= this.waveTracker.totalWeight / 2;
    const timedOut = levelElapsed - this.waveTracker.spawnedAt >= NEXT_WAVE_DELAY;

    if (halfDefeated || timedOut) {
      this.spawnWave(levelElapsed, gameTime);
    }
  }

  private spawnWave(levelElapsed: number, gameTime: number) {
    const waveNumber = this.wave + 1;
    const weightLimit = this.waveWeightLimit(waveNumber);
    const kinds = this.buildWaveKinds(weightLimit);
    let totalWeight = 0;

    kinds.forEach((kind, index) => {
      totalWeight += this.spawnEnemy(kind, waveNumber, gameTime, index);
    });

    this.wave = waveNumber;
    this.waveTracker = {
      number: waveNumber,
      totalWeight,
      defeatedWeight: 0,
      spawnedAt: levelElapsed
    };

    this.showToast(
      waveNumber % this.levelConfig.wavesPerFlag === 0
        ? `${t("label.flag")} ${waveNumber / this.levelConfig.wavesPerFlag}`
        : `${t("label.wave")} ${waveNumber}`
    );
  }

  private buildWaveKinds(weightLimit: number) {
    const kinds: EnemyKind[] = [];
    let remainingWeight = weightLimit;
    const enemyPool = this.levelConfig.enemyKinds.map((kind) => enemyDefinitions[kind]);
    const minWeight = Math.min(...enemyPool.map((enemy) => enemy.weight));

    while (remainingWeight >= minWeight) {
      const candidates = enemyPool.filter((enemy) => enemy.weight <= remainingWeight);
      const candidate = candidates[Phaser.Math.Between(0, candidates.length - 1)];
      kinds.push(candidate.kind);
      remainingWeight -= candidate.weight;
    }

    return kinds;
  }

  private spawnEnemy(kind: EnemyKind, waveNumber: number, time: number, index: number) {
    const lane = Phaser.Math.Between(0, LANES - 1);
    const x = BOARD_X + BOARD_WIDTH + 46 + Phaser.Math.Between(0, 18) + (index % 3) * 5;
    return this.spawnEnemyAt(kind, waveNumber, time, lane, x, enemyDefinitions[kind].weight);
  }

  private spawnEnemyAt(kind: EnemyKind, waveNumber: number, time: number, lane: number, x: number, waveWeight: number) {
    const y = BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2;
    const definition = enemyDefinitions[kind];
    const attackInterval = this.enemyAttackInterval(kind);

    const body = this.add.container(x, y).setDepth(60 + lane);
    const shape = this.createEnemyShape(kind);

    body.add([shape]);

    this.enemies.push({
      kind,
      waveNumber,
      weight: waveWeight,
      lane,
      x,
      y,
      hp: definition.hp,
      maxHp: definition.hp,
      armor: definition.armor,
      magicResistance: definition.magicResistance,
      speed:
        ENEMY_SPEED *
        (definition.speedMultiplier ?? 1) *
        Phaser.Math.FloatBetween(1 - ENEMY_SPEED_VARIANCE, 1 + ENEMY_SPEED_VARIANCE),
      damage: definition.damage,
      damageType: definition.damageType,
      finalDamageReduction: this.difficultyConfig.finalDamageReduction,
      attackInterval,
      attackAt: time + attackInterval,
      body,
      shape
    });

    return waveWeight;
  }

  private enemyAttackInterval(kind: EnemyKind) {
    const definition = enemyDefinitions[kind];
    if (kind.startsWith("triangle")) {
      const rank = Number.parseInt(definition.label ?? "1", 10);
      return ATTACK_INTERVAL / Math.max(1, rank);
    }

    return ATTACK_INTERVAL;
  }

  private createEnemyShape(kind: EnemyKind) {
    if (kind === "circle" || kind === "circle2" || kind === "circle3") {
      const shape = this.add.container(0, 0);
      const circle = this.add.circle(0, 0, 20, palette.black, 1).setStrokeStyle(2, palette.white, 1);
      const label = this.add
        .text(0, -1, enemyDefinitions[kind].label ?? "", {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "18px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      label.setText(romanLabel(enemyDefinitions[kind].label));
      shape.add([circle, label]);
      return shape;
    }

    if (kind === "square" || kind === "square2" || kind === "square3") {
      const shape = this.add.container(0, 0);
      const square = this.add.rectangle(0, 0, 42, 42, palette.black, 1).setStrokeStyle(2, palette.white, 1);
      const label = this.add
        .text(0, -1, enemyDefinitions[kind].label ?? "", {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "18px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      label.setText(romanLabel(enemyDefinitions[kind].label));
      shape.add([square, label]);
      return shape;
    }

    const shape = this.add.container(0, 0);
    const triangle = this.add.graphics();
    triangle.fillStyle(palette.black, 1);
    triangle.lineStyle(2, palette.white, 1);
    triangle.beginPath();
    triangle.moveTo(0, -22);
    triangle.lineTo(22, 18);
    triangle.lineTo(-22, 18);
    triangle.closePath();
    triangle.fillPath();
    triangle.strokePath();
    const label = this.add
      .text(0, 2, enemyDefinitions[kind].label ?? "", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    label.setText(romanLabel(enemyDefinitions[kind].label));
    shape.add([triangle, label]);
    return shape;
  }

  private waveWeightLimit(waveNumber: number) {
    const baseWeight = this.levelConfig.firstWaveWeight + (waveNumber - 1) * this.levelConfig.waveWeightIncrement;
    const flagWeight = waveNumber % this.levelConfig.wavesPerFlag === 0 ? baseWeight * 2 : baseWeight;
    const cappedWeight = this.levelConfig.waveWeightCap ? Math.min(flagWeight, this.levelConfig.waveWeightCap) : flagWeight;
    return Math.max(10, Math.floor(cappedWeight * this.difficultyConfig.weightMultiplier));
  }

  private damageTower(tower: Tower, damage: number, damageType: DamageType) {
    const actualDamage = this.calculateDamage(damage, damageType, tower.armor, tower.magicResistance);
    tower.hp -= actualDamage;
    this.updateTowerHpBar(tower);

    if (tower.hp <= 0) {
      this.removeTower(tower);
    }
  }

  private updateTowerHpBar(tower: Tower) {
    tower.hpFill.width = 42 * Phaser.Math.Clamp(tower.hp / tower.maxHp, 0, 1);
  }

  private damageBoss(damage: number, damageType: DamageType) {
    const boss = this.boss;
    if (!boss) {
      return;
    }

    const actualDamage =
      this.calculateDamage(damage, damageType, boss.armor, boss.magicResistance) *
      (1 - boss.finalDamageReduction);
    boss.hp -= actualDamage;
    this.makeBossHitFlash(boss.x, boss.y, damageType);

    if (boss.hp <= 0) {
      boss.hp = 0;
      this.removeBoss();
      this.endLevel();
    }
  }

  private damageEnemy(enemy: Enemy, damage: number, damageType: DamageType) {
    if (!this.enemies.includes(enemy)) {
      return;
    }

    const actualDamage =
      this.calculateDamage(damage, damageType, enemy.armor, enemy.magicResistance) *
      (1 - enemy.finalDamageReduction);
    enemy.hp -= actualDamage;
    const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
    enemy.shape.setScale(this.enemyScaleFromHp(hpRatio));

    if (enemy.hp <= 0) {
      if (this.waveTracker?.number === enemy.waveNumber) {
        this.waveTracker.defeatedWeight += enemy.weight;
      }

      this.enemiesDefeated += 1;
      this.handleEnemyDeath(enemy);
      this.removeEnemy(enemy, true);
    }
  }

  private handleEnemyDeath(enemy: Enemy) {
    if (enemy.kind !== "circle2" && enemy.kind !== "circle3") {
      return;
    }

    const spawnKind = enemy.kind === "circle3" ? "circle2" : "circle";
    for (const lane of [enemy.lane - 1, enemy.lane, enemy.lane + 1]) {
      if (lane < 0 || lane >= LANES) {
        continue;
      }
      this.spawnEnemyAt(spawnKind, enemy.waveNumber, this.battleTime, lane, enemy.x, 0);
    }
  }

  private calculateDamage(rawDamage: number, damageType: DamageType, armor: number, magicResistance: number) {
    if (damageType === "true") {
      return rawDamage;
    }

    if (damageType === "magic") {
      const resistanceMultiplier = 1 - magicResistance / 100;
      return rawDamage * Phaser.Math.Clamp(resistanceMultiplier, 0.05, 1);
    }

    return Math.max(rawDamage - armor, rawDamage * 0.1);
  }

  private enemyScaleFromHp(hpRatio: number) {
    return 0.4 + hpRatio * 0.6;
  }

  private bossRect(boss: CubeBoss) {
    return new Phaser.Geom.Rectangle(
      boss.x - BOSS_HITBOX_WIDTH / 2,
      boss.y - BOSS_HITBOX_HEIGHT / 2,
      BOSS_HITBOX_WIDTH,
      BOSS_HITBOX_HEIGHT
    );
  }

  private towerRect(tower: Tower) {
    return new Phaser.Geom.Rectangle(
      tower.x - CELL_WIDTH / 2,
      tower.y - CELL_HEIGHT / 2,
      CELL_WIDTH,
      CELL_HEIGHT
    );
  }

  private isPointInBossHitbox(x: number, y: number) {
    return Boolean(this.boss && this.bossRect(this.boss).contains(x, y));
  }

  private isBossInRadius(x: number, y: number, radius: number) {
    if (!this.boss) {
      return false;
    }

    const rect = this.bossRect(this.boss);
    const closestX = Phaser.Math.Clamp(x, rect.left, rect.right);
    const closestY = Phaser.Math.Clamp(y, rect.top, rect.bottom);
    return Math.hypot(x - closestX, y - closestY) <= radius;
  }

  private isBossInRect(x: number, y: number, width: number, height: number) {
    if (!this.boss) {
      return false;
    }

    return Phaser.Geom.Intersects.RectangleToRectangle(this.bossRect(this.boss), new Phaser.Geom.Rectangle(x, y, width, height));
  }

  private removeBoss() {
    const boss = this.boss;
    if (!boss) {
      return;
    }

    this.boss = null;
    this.tweens.add({
      targets: boss.body,
      alpha: 0,
      scale: 0.82,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => boss.body.destroy()
    });
  }

  private triggerShockTower(tower: Tower) {
    const definition = this.getDefinition(tower.type);
    const count = this.getShockCount(tower, definition);
    const interval = definition.triggerInterval ?? 50;
    const damage = definition.triggerDamage ?? 100;
    const damageType = definition.triggerDamageType ?? "physical";
    const rangeX = definition.triggerRangeX ?? CELL_WIDTH;
    const rangeY = definition.triggerRangeY ?? CELL_HEIGHT;
    const x = tower.x;
    const y = tower.y;

    this.removeTower(tower);

    for (let index = 0; index < count; index += 1) {
      this.time.delayedCall(index * interval, () => {
        this.runWhenBattleActive(() => {
          if (this.gameOver) {
            return;
          }

          this.makeShockPulse(x, y, rangeX, rangeY);
          for (const enemy of [...this.enemies]) {
            if (Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY) {
              this.damageEnemy(enemy, damage, damageType);
            }
          }
          if (this.isBossInRect(x - rangeX, y - rangeY, rangeX * 2, rangeY * 2)) {
            this.damageBoss(damage, damageType);
          }
        });
      });
    }
  }

  private getShockCount(tower: Tower, definition: CardDefinition) {
    return Math.round((definition.triggerCount ?? 10) * (1 + effectiveUpgradeCountForLevel(tower.level) * 0.8));
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

  private isTrapArmed(tower: Tower, time: number) {
    return tower.type === "G" && time >= tower.armedAt;
  }

  private resetTrapArming(tower: Tower) {
    const definition = this.getDefinition(tower.type);
    tower.armedAt = this.battleTime + (definition.armTime ?? 15_000);
    tower.border.setVisible(false);
  }

  private triggerTrapTower(tower: Tower, target: Enemy | "boss") {
    const definition = this.getDefinition(tower.type);
    const damage = this.getTrapDamage(tower, definition);
    const damageType = definition.triggerDamageType ?? "magic";
    const x = tower.x;
    const y = tower.y;

    this.removeTower(tower);
    this.makeTrapBurst(x, y, damageType);
    if (target === "boss") {
      this.damageBoss(damage, damageType);
      return;
    }

    this.damageEnemy(target, damage, damageType);
  }

  private getTrapDamage(tower: Tower, definition: CardDefinition) {
    return Math.round((definition.triggerDamage ?? 1_500) * (1 + effectiveUpgradeCountForLevel(tower.level) * 0.8));
  }

  private makeHitShards(x: number, y: number, damageType: DamageType) {
    const shardColor = this.damageEffectColor(damageType);
    for (let index = 0; index < 7; index += 1) {
      const angle = Phaser.Math.FloatBetween(-Math.PI * 0.8, Math.PI * 0.8);
      const distance = Phaser.Math.Between(12, 30);
      const shard = this.add.rectangle(x, y, Phaser.Math.Between(4, 9), 2, shardColor, 1).setDepth(110);
      shard.rotation = angle;
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 260,
        ease: "Quad.easeOut",
        onComplete: () => shard.destroy()
      });
    }
  }

  private makeShellBurst(x: number, y: number, radius: number, damageType: DamageType) {
    const ring = this.add
      .circle(x, y, radius / 5, palette.black, 0)
      .setStrokeStyle(2, this.damageEffectColor(damageType), 0.9);
    ring.setDepth(105);
    this.tweens.add({
      targets: ring,
      scale: 5,
      alpha: 0,
      duration: 280,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy()
    });
  }

  private makeShockPulse(x: number, y: number, rangeX: number, rangeY: number) {
    const pulse = this.add
      .rectangle(x, y, rangeX * 2, rangeY * 2, palette.black, 0)
      .setStrokeStyle(2, palette.white, 0.82)
      .setDepth(106);

    this.tweens.add({
      targets: pulse,
      scale: 1.12,
      alpha: 0,
      duration: 120,
      ease: "Quad.easeOut",
      onComplete: () => pulse.destroy()
    });
  }

  private makeTrapBurst(x: number, y: number, damageType: DamageType) {
    const ring = this.add
      .circle(x, y, 14, palette.black, 0)
      .setStrokeStyle(3, this.damageEffectColor(damageType), 0.92);
    ring.setDepth(106);
    this.tweens.add({
      targets: ring,
      scale: 2.7,
      alpha: 0,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy()
    });
  }

  private makeSlashEffect(x: number, y: number, damageType: DamageType) {
    const color = this.damageEffectColor(damageType);
    const slash = this.add.graphics().setPosition(x, y).setDepth(110);
    slash.lineStyle(4, color, 0.98);
    slash.lineBetween(-30, -30, 30, 30);
    slash.lineBetween(-30, 30, 30, -30);
    slash.lineStyle(1, color, 0.72);
    slash.lineBetween(-38, -38, -22, -22);
    slash.lineBetween(22, 22, 38, 38);
    slash.lineBetween(-38, 38, -22, 22);
    slash.lineBetween(22, -22, 38, -38);

    this.tweens.add({
      targets: slash,
      scale: 1.28,
      alpha: 0,
      duration: 145,
      ease: "Quad.easeOut",
      onComplete: () => slash.destroy()
    });
  }

  private makeShiftEffect(fromX: number, fromY: number, toX: number, toY: number) {
    const line = this.add.graphics().setDepth(109);
    line.lineStyle(2, palette.green, 0.92);
    line.lineBetween(fromX, fromY, toX, toY);
    const marker = this.add.circle(toX, toY, 13, palette.black, 0).setStrokeStyle(2, palette.green, 0.9);
    marker.setDepth(109);

    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => line.destroy()
    });
    this.tweens.add({
      targets: marker,
      scale: 1.7,
      alpha: 0,
      duration: 220,
      ease: "Quad.easeOut",
      onComplete: () => marker.destroy()
    });
  }

  private makeBossHitFlash(x: number, y: number, damageType: DamageType) {
    const flash = this.add
      .rectangle(x, y, BOSS_HITBOX_WIDTH, BOSS_HITBOX_HEIGHT, palette.black, 0)
      .setStrokeStyle(2, this.damageEffectColor(damageType), 0.5);
    flash.setDepth(109);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.03,
      duration: 120,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });
  }

  private makeCubeCollapse(x: number, y: number, followTarget?: Enemy | Tower) {
    const cube = this.add.graphics().setPosition(x, y).setDepth(108);
    const size = 132;
    cube.lineStyle(2, palette.white, 0.88);
    cube.strokeRect(-size / 2, -size / 2, size, size);
    cube.strokeRect(-size / 2 + 8, -size / 2 - 8, size, size);
    cube.lineBetween(-size / 2, -size / 2, -size / 2 + 8, -size / 2 - 8);
    cube.lineBetween(size / 2, -size / 2, size / 2 + 8, -size / 2 - 8);
    cube.lineBetween(size / 2, size / 2, size / 2 + 8, size / 2 - 8);
    cube.lineBetween(-size / 2, size / 2, -size / 2 + 8, size / 2 - 8);

    this.tweens.add({
      targets: cube,
      scale: 0.15,
      rotation: 0.5,
      alpha: 0,
      duration: 936,
      ease: "Quad.easeIn",
      onUpdate: () => {
        if (!followTarget) {
          return;
        }

        const targetStillExists =
          "kind" in followTarget ? this.enemies.includes(followTarget) : this.towers.includes(followTarget);
        if (targetStillExists) {
          cube.setPosition(followTarget.x, followTarget.y);
        }
      },
      onComplete: () => cube.destroy()
    });
  }

  private makeHealParticles(x: number, y: number) {
    for (let index = 0; index < 6; index += 1) {
      const angle = Phaser.Math.FloatBetween(-Math.PI, 0);
      const distance = Phaser.Math.Between(12, 28);
      const particle = this.add
        .text(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 10), EFFECT_SYMBOLS.heal, {
          color: "#48ff88",
          fontFamily: "monospace",
          fontSize: "15px",
          fontStyle: "700"
        })
        .setOrigin(0.5)
        .setDepth(106);

      this.tweens.add({
        targets: particle,
        x: particle.x + Math.cos(angle) * distance,
        y: particle.y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 360,
        ease: "Quad.easeOut",
        onComplete: () => particle.destroy()
      });
    }
  }

  private makeReflectFlash(x: number, y: number) {
    const flash = this.add.circle(x, y, 16, palette.black, 0).setStrokeStyle(2, palette.white, 0.8);
    flash.setDepth(105);
    this.tweens.add({
      targets: flash,
      scale: 1.8,
      alpha: 0,
      duration: 180,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy()
    });
  }

  private makeEraseMark(x: number, y: number) {
    const mark = this.add.graphics().setDepth(107);
    mark.lineStyle(3, palette.white, 0.9);
    mark.lineBetween(x - 18, y - 18, x + 18, y + 18);
    mark.lineBetween(x + 18, y - 18, x - 18, y + 18);

    this.tweens.add({
      targets: mark,
      scale: 1.2,
      alpha: 0,
      duration: 220,
      ease: "Quad.easeOut",
      onComplete: () => mark.destroy()
    });
  }

  private makeAutoUpgradePulse(x: number, y: number) {
    const ring = this.add.circle(x, y, 20, palette.black, 0).setStrokeStyle(2, palette.green, 0.95);
    ring.setDepth(107);
    this.tweens.add({
      targets: ring,
      scale: 1.65,
      alpha: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy()
    });
  }

  private makeProductionPulse(x: number, y: number, amount: number) {
    const text = this.add
      .text(x, y, `${EFFECT_SYMBOLS.chars}${amount}`, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    text.setDepth(105);

    this.tweens.add({
      targets: text,
      y: y - 22,
      alpha: 0,
      duration: 640,
      ease: "Quad.easeOut",
      onComplete: () => text.destroy()
    });
  }

  private removeProjectile(projectile: Projectile) {
    Phaser.Utils.Array.Remove(this.projectiles, projectile);
    projectile.body.destroy();
  }

  private removeEnemy(enemy: Enemy, animate: boolean) {
    Phaser.Utils.Array.Remove(this.enemies, enemy);
    if (animate) {
      this.tweens.add({
        targets: enemy.body,
        alpha: 0,
        duration: 140,
        onComplete: () => enemy.body.destroy()
      });
      return;
    }

    enemy.body.destroy();
  }

  private removeTower(tower: Tower) {
    Phaser.Utils.Array.Remove(this.towers, tower);
    this.occupied.delete(this.cellKey(tower.lane, tower.column));
    this.tweens.add({
      targets: tower.body,
      alpha: 0,
      y: tower.y + 8,
      duration: 130,
      onComplete: () => tower.body.destroy()
    });
  }

  private updateCards(time: number) {
    for (const card of this.cardStates) {
      const isSelected = !this.eraserMode && !this.autoUpgradeMode && card.definition.id === this.selectedCardId;
      const isAffordable = this.chars >= card.definition.cost;
      const cooldownRatio = Phaser.Math.Clamp((card.readyAt - time) / card.definition.cooldown, 0, 1);
      const readyRatio = 1 - cooldownRatio;
      const contentAlpha = isSelected ? (isAffordable ? 1 : 0.56) : isAffordable ? 0.82 : 0.22;

      card.frame.setStrokeStyle(
        isSelected ? 4 : 2,
        isSelected ? palette.white : isAffordable ? palette.mid : palette.dim,
        isSelected ? 1 : isAffordable ? 0.72 : 0.35
      );
      card.frame.setFillStyle(isSelected ? palette.panel : palette.black, isSelected ? 1 : isAffordable ? 0.78 : 0.34);
      card.frame.setAlpha(isSelected ? 1 : isAffordable ? 0.78 : 0.34);
      card.content.forEach((content) => content.setAlpha(contentAlpha));
      card.cooldownFill.width = CARD_BAR_WIDTH * readyRatio;
      card.cooldownFill.setAlpha(contentAlpha * (cooldownRatio > 0 ? 0.86 : 1));
    }
    this.updateAutoUpgradeTool();
    this.updateEraserTool();
  }

  private updateAutoUpgradeTool() {
    this.autoUpgradeButton.setStrokeStyle(
      this.autoUpgradeMode ? 4 : 2,
      this.autoUpgradeMode ? palette.green : palette.mid,
      1
    );
    this.autoUpgradeButton.setFillStyle(this.autoUpgradeMode ? palette.panel : palette.black, this.autoUpgradeMode ? 1 : 0.82);
    this.autoUpgradeButton.setAlpha(this.autoUpgradeMode ? 1 : 0.78);
    this.autoUpgradeText.setAlpha(this.autoUpgradeMode ? 1 : 0.78);
  }

  private updateEraserTool() {
    this.eraserButton.setStrokeStyle(this.eraserMode ? 4 : 2, this.eraserMode ? palette.white : palette.mid, 1);
    this.eraserButton.setFillStyle(this.eraserMode ? palette.panel : palette.black, this.eraserMode ? 1 : 0.82);
    this.eraserButton.setAlpha(this.eraserMode ? 1 : 0.78);
    this.eraserText.setAlpha(this.eraserMode ? 1 : 0.78);
  }

  private grantDebugChars() {
    if (this.gameOver) {
      return;
    }

    this.eraserMode = false;
    this.autoUpgradeMode = false;
    this.gainChars(9_999, this.debugButton.x, this.debugButton.y + 34);
    this.showToast(t("toast.debugChars"));
    this.updateCards(this.cardTime);
  }

  private toggleEraser() {
    if (this.gameOver) {
      return;
    }

    this.eraserMode = !this.eraserMode;
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
    if (this.autoUpgradeMode) {
      this.eraserMode = false;
    }
    this.updateCards(this.cardTime);
  }

  private setTowerAutoUpgrade(tower: Tower, enabled: boolean) {
    tower.autoUpgrade = enabled;
    tower.autoUpgradeBorder.setVisible(enabled);
  }

  private attemptAutoUpgrades() {
    let upgraded = false;
    for (const cardState of this.cardStates) {
      if (this.cardTime < cardState.readyAt) {
        continue;
      }

      const target = this.towers
        .filter((tower) => tower.autoUpgrade && tower.type === cardState.definition.id)
        .sort((a, b) => a.level - b.level || a.placedOrder - b.placedOrder)[0];

      if (!target || this.chars < cardState.definition.cost) {
        continue;
      }

      this.chars -= cardState.definition.cost;
      this.upgradeTower(target);
      this.makeAutoUpgradePulse(target.x, target.y);
      cardState.readyAt = this.cardTime + cardState.definition.cooldown;
      upgraded = true;
    }

    if (upgraded) {
      this.updateCards(this.cardTime);
    }
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
    const waveText = this.wave === 0 ? t("label.wait") : `${this.wave}`;
    const flag = this.wave === 0 ? 0 : Math.ceil(this.wave / this.levelConfig.wavesPerFlag);
    const pauseText = this.battlePaused ? `    ${t("label.paused")}` : "";

    this.charsText.setText(`${t("label.chars")} ${Math.floor(this.chars)}`);
    this.statusText.setText(
      `${t("label.wave")} ${waveText}    ${t("label.base")} ${this.baseIntegrity}    ${t("label.ko")} ${this.enemiesDefeated}${pauseText}`
    );
    if (this.boss) {
      const bossHpRatio = Phaser.Math.Clamp(this.boss.hp / this.boss.maxHp, 0, 1);
      this.progressText.setText(`${t("label.cubeHp")} ${Math.ceil(this.boss.hp)}/${this.boss.maxHp}`);
      this.progressFill.width = PROGRESS_BAR_WIDTH * bossHpRatio;
      return;
    }

    const totalWaves = this.levelConfig.totalWaves ?? this.wave;
    const totalFlags = totalWaves / this.levelConfig.wavesPerFlag;
    const waveProgress = totalWaves > 0 ? Phaser.Math.Clamp(this.wave / totalWaves, 0, 1) : 0;
    this.progressText.setText(`${t("label.flag")} ${flag}/${totalFlags}  ${t("label.wave")} ${this.wave}/${totalWaves}`);
    this.progressFill.width = PROGRESS_BAR_WIDTH * waveProgress;
  }

  private showToast(text: string) {
    this.toastText.setText(text);
    this.toastText.setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      duration: 620,
      delay: 250
    });
  }

  private endGame() {
    this.gameOver = true;
    this.overlayAction = "menu";
    this.overlayTitle.setText(t("overlay.breach"));
    this.overlayButtonText.setText(t("button.menu"));
    this.overlay.setVisible(true);
  }

  private endLevel() {
    this.gameOver = true;
    this.overlayAction = "menu";
    this.overlayTitle.setText(t("overlay.clear"));
    this.overlayButtonText.setText(t("button.menu"));
    this.overlay.setVisible(true);
  }

  private handleOverlayAction() {
    this.scene.start("LevelSelectScene");
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
      L: "L"
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
    const validCards = (selectedCards ?? defaultLoadout).filter((id, index, cards): id is CardId => {
      return cardDefinitions.some((definition) => definition.id === id) && cards.indexOf(id) === index;
    });

    return validCards.length > 0 ? validCards.slice(0, CARD_SLOT_COUNT) : [...defaultLoadout];
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

  private cellKey(lane: number, column: number) {
    return `${lane}:${column}`;
  }
}
