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
  CUBE_BOSS_CONTACT_DAMAGE,
  CUBE_BOSS_CONTACT_INTERVAL,
  DEFAULT_DIFFICULTY,
  GAME_HEIGHT,
  GAME_WIDTH,
  LANES,
  MAX_CHARS,
  NATURAL_PRODUCE_AMOUNT,
  NATURAL_PRODUCE_INTERVAL,
  STARTING_CHARS,
  clampDifficulty,
  getDifficultyConfig,
  palette
} from "../config";
import {
  applyEnemyPromotionStats,
  bossAdvanceSpawnPoints,
  chargeBossSkill,
  createCubeBoss,
  findPromotionTarget,
  isBossSkillReady,
  promotedKind,
  spendBossSkill,
  updateCubeBossMotion
} from "../bosses/cubeBoss";
import { cardDefinitions, defaultLoadout, getCardDefinition } from "../data/cards";
import { getLevelConfig } from "../data/levels";
import { calculateDamage } from "../game/damage";
import { advanceEnemies, spawnEnemyAt, spawnSplitEnemies, spawnWaveEnemies } from "../game/enemyRuntime";
import {
  enemyAttackInterval,
  enemyScaleFromHp
} from "../game/enemyFactory";
import {
  createTowerProjectile,
  isEnemyProjectileOutOfBounds,
  isTowerProjectileOutOfBounds,
  towerProjectileSpecs
} from "../game/projectiles";
import {
  bossRect,
  canAttackBoss,
  getAttackTarget,
  getHealTarget,
  getShiftTargets,
  gridCellKey,
  hasAttackTarget,
  isBossInRadius,
  isBossInRect,
  isPointInBossHitbox,
  towerRect
} from "../game/targeting";
import {
  applyTowerUpgradeStats,
  createTower,
  findAutoUpgradeTarget,
  getProductionAmount,
  getShockCount,
  getTrapDamage,
  isCardReadyForAutoUpgrade,
  isTrapArmed,
  setTowerAutoUpgradeState,
  syncTowerHpBar,
  upgradeTowerLevel
} from "../game/towers";
import { volleyInterval, volleyShotCount } from "../game/upgrades";
import { waveScheduleAction } from "../game/waves";
import { t } from "../i18n";
import {
  makeAutoUpgradePulse,
  makeBossHitFlash,
  makeCubeCollapse,
  makeEnemyHitShards,
  makeEraseMark,
  makeHealParticles,
  makeHitShards,
  makeProductionPulse,
  makeShellBurst,
  makeShiftEffect,
  makeShockPulse,
  makeSlashEffect,
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
import { createEnemyShape } from "../render/unitShapes";
import type {
  CardDefinition,
  CardId,
  CardState,
  CubeBoss,
  DamageType,
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
      onErase: () => this.toggleEraser()
    });
    this.spawnBossIfNeeded();
    this.cardStates = createCardStates(this, this.selectedCardIds, (id) => this.selectCard(id));
    this.updateCards(this.cardTime);
    this.overlay = createGameOverlay(this, () => this.handleOverlayAction());

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
    this.updateEnemyProjectiles(seconds);
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

  private handleBoardPointer(x: number, y: number) {
    if (this.gameOver || !this.isInsideBoard(x, y)) {
      return;
    }

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
      this.removeTower(existingTower);
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

      setTowerAutoUpgradeState(existingTower, !existingTower.autoUpgrade);
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
    this.chars = Math.min(MAX_CHARS, this.chars + amount);
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

  private updateBoss(seconds: number) {
    const boss = this.boss;
    if (!boss) {
      return;
    }

    updateCubeBossMotion(boss, seconds);
    this.updateBossSkills(boss, seconds);
    this.triggerFunctionalTowersTouchingBoss(boss);
    if (!this.boss) {
      return;
    }
    this.damageBossTouchingTowers(boss, seconds);

    if (bossRect(boss).left <= BOARD_X - 20) {
      this.endGame();
    }
  }

  private triggerFunctionalTowersTouchingBoss(boss: CubeBoss) {
    const rect = bossRect(boss);
    for (const tower of [...this.towers]) {
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, towerRect(tower))) {
        continue;
      }

      if (tower.type === "G" && isTrapArmed(tower, this.battleTime)) {
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

    const rect = bossRect(boss);
    while (boss.contactAttackBuffer >= CUBE_BOSS_CONTACT_INTERVAL) {
      const targets = this.towers.filter((tower) => {
        return Phaser.Geom.Intersects.RectangleToRectangle(rect, towerRect(tower));
      });

      for (const tower of targets) {
        makeCubeCollapse(this, tower.x, tower.y, tower, this.enemies, this.towers);
        this.damageTower(tower, CUBE_BOSS_CONTACT_DAMAGE, "physical");
      }

      boss.contactAttackBuffer -= CUBE_BOSS_CONTACT_INTERVAL;
    }
  }

  private updateBossSkills(boss: CubeBoss, seconds: number) {
    chargeBossSkill(boss.skills.promotion, seconds);
    chargeBossSkill(boss.skills.advance, seconds);
    if (boss.skills.promotion2) {
      chargeBossSkill(boss.skills.promotion2, seconds);
      this.tryUsePromotionSkill(boss, boss.skills.promotion2, 2);
    }
    this.tryUsePromotionSkill(boss, boss.skills.promotion, 1);
    this.tryUseAdvanceSkill(boss);
  }

  private tryUsePromotionSkill(
    boss: CubeBoss,
    skill: CubeBoss["skills"]["promotion"] | NonNullable<CubeBoss["skills"]["promotion2"]>,
    fromRank: number
  ) {
    if (!isBossSkillReady(skill)) {
      return;
    }

    const target = findPromotionTarget(boss, this.enemies, fromRank);
    if (!target) {
      return;
    }

    spendBossSkill(skill);
    this.promoteEnemy(target);
  }

  private tryUseAdvanceSkill(boss: CubeBoss) {
    const skill = boss.skills.advance;
    if (!isBossSkillReady(skill)) {
      return;
    }

    spendBossSkill(skill);
    this.summonBossAdvanceMinions(boss);
  }

  private promoteEnemy(enemy: Enemy) {
    const nextKind = promotedKind(enemy.kind);
    if (!nextKind || !this.enemies.includes(enemy)) {
      return;
    }

    applyEnemyPromotionStats(enemy, nextKind, this.battleTime, enemyAttackInterval(nextKind));
    enemy.body.removeAll(true);
    enemy.shape = createEnemyShape(this, nextKind, { squareSize: 42, shootingNoseX: -24 });
    enemy.body.add(enemy.shape);
    enemy.shape.setScale(enemyScaleFromHp(enemy.hp / enemy.maxHp));
    makeCubeCollapse(this, enemy.x, enemy.y, enemy, this.enemies, this.towers);
  }

  private summonBossAdvanceMinions(boss: CubeBoss) {
    const waveNumber = this.wave || 0;
    for (const point of bossAdvanceSpawnPoints(boss)) {
      spawnEnemyAt(this, this.enemies, {
        kind: boss.advanceMinionKind,
        waveNumber,
        time: this.battleTime,
        lane: point.lane,
        x: point.x,
        waveWeight: 0,
        finalDamageReduction: this.difficultyConfig.finalDamageReduction
      });
      makeCubeCollapse(this, point.x, point.y);
    }
  }

  private updateTowers(time: number) {
    for (const tower of this.towers) {
      const definition = this.getDefinition(tower.type);
      if (tower.type === "H") {
        if (!definition.healAmount || time < tower.lastFire + tower.fireRate || !getHealTarget(tower, this.occupied)) {
          continue;
        }

        this.startTowerVolley(tower, definition, time);
        continue;
      }

      if (tower.type === "L") {
        if (time < tower.lastFire + tower.fireRate || getShiftTargets(tower, this.enemies).length === 0) {
          continue;
        }

        this.startTowerVolley(tower, definition, time);
        continue;
      }

      if (tower.type === "I") {
        if (
          !definition.damage ||
          time < tower.lastFire + tower.fireRate ||
          !hasAttackTarget(tower, definition, this.enemies, this.boss)
        ) {
          continue;
        }

        this.startTowerVolley(tower, definition, time);
        continue;
      }

      if (!definition.damage || time < tower.lastFire + tower.fireRate) {
        continue;
      }

      const target = getAttackTarget(tower, definition, this.enemies);

      if (!target && !canAttackBoss(tower, definition, this.boss)) {
        continue;
      }

      this.startTowerVolley(tower, definition, time);
    }
  }

  private startTowerVolley(tower: Tower, definition: CardDefinition, time: number) {
    const shots = volleyShotCount(tower.type, tower.level);
    const interval = volleyInterval(tower.fireRate, shots);

    for (let shotIndex = 0; shotIndex < shots; shotIndex += 1) {
      this.time.delayedCall(shotIndex * interval, () => {
        this.runWhenBattleActive(() => {
          if (this.gameOver || !this.towers.includes(tower)) {
            return;
          }
          this.fireTowerShot(tower, definition);
        });
      });
    }

    tower.lastFire = time + (shots - 1) * interval;
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

    if (tower.type === "K") {
      this.fireSlash(tower, definition);
      return;
    }

    const specs = towerProjectileSpecs(tower, definition);
    for (const spec of specs) {
      this.projectiles.push(createTowerProjectile(this, spec));
    }
  }

  private fireHealingPulse(tower: Tower, definition: CardDefinition) {
    const target = getHealTarget(tower, this.occupied);
    if (target) {
      this.healTower(target, definition.healAmount ?? 60);
    }
  }

  private fireShiftPulse(tower: Tower, definition: CardDefinition) {
    const targets = getShiftTargets(tower, this.enemies);
    if (targets.length === 0) {
      return;
    }

    for (const target of targets) {
      const previousY = target.y;
      target.lane = tower.lane;
      target.y = tower.y;
      target.body.setDepth(60 + target.lane);
      target.body.setPosition(target.x, target.y);
      makeShiftEffect(this, target.x, previousY, target.x, target.y);
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
    const target = getAttackTarget(tower, definition, this.enemies);
    if (target) {
      makeSlashEffect(this, target.x, target.y, damageType);
      this.damageEnemy(target, damage, damageType);
      return;
    }

    const boss = this.boss;
    if (!boss || !canAttackBoss(tower, definition, boss)) {
      return;
    }

    const rect = bossRect(boss);
    const x = Phaser.Math.Clamp(tower.x + CELL_WIDTH, rect.left, rect.right);
    const y = Phaser.Math.Clamp(tower.y, rect.top, rect.bottom);
    makeSlashEffect(this, x, y, damageType);
    this.damageBoss(damage, damageType);
  }

  private healTower(tower: Tower, amount: number) {
    const previousHp = tower.hp;
    tower.hp = Math.min(tower.maxHp, tower.hp + amount);
    if (tower.hp <= previousHp) {
      return;
    }

    syncTowerHpBar(tower);
    makeHealParticles(this, tower.x, tower.y);
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
      const hitBoss = isPointInBossHitbox(this.boss, projectile.x, projectile.y);

      if (!hit && !hitBoss) {
        if (isTowerProjectileOutOfBounds(projectile, reachedMaxX)) {
          this.removeProjectile(projectile);
        }
        continue;
      }

      if (projectile.type === "bolt" || projectile.type === "star") {
        if (hit) {
          makeHitShards(this, hit.x, hit.y, projectile.damageType);
          this.damageEnemy(hit, projectile.damage, projectile.damageType);
        } else {
          makeHitShards(this, projectile.x, projectile.y, projectile.damageType);
          this.damageBoss(projectile.damage, projectile.damageType);
        }
      } else {
        const burstX = hit ? hit.x : projectile.x;
        const burstY = hit ? hit.y : projectile.y;
        makeShellBurst(this, burstX, burstY, projectile.splashRadius, projectile.damageType);
        for (const enemy of [...this.enemies]) {
          const dx = enemy.x - burstX;
          const dy = enemy.y - burstY;
          if (Math.hypot(dx, dy) <= projectile.splashRadius) {
            this.damageEnemy(enemy, projectile.damage, projectile.damageType);
          }
        }
        if (isBossInRadius(this.boss, burstX, burstY, projectile.splashRadius)) {
          this.damageBoss(projectile.damage, projectile.damageType);
        }
      }

      this.removeProjectile(projectile);
    }
  }

  private updateEnemyProjectiles(seconds: number) {
    for (const projectile of [...this.enemyProjectiles]) {
      projectile.x += projectile.vx * seconds;
      projectile.body.setPosition(projectile.x, projectile.y);

      const hit = this.towers
        .filter((tower) => tower.lane === projectile.sourceLane)
        .find((tower) => towerRect(tower).contains(projectile.x, projectile.y));

      if (hit) {
        makeEnemyHitShards(this, projectile.x, projectile.y);
        this.damageTower(hit, projectile.damage, projectile.damageType);
        this.removeEnemyProjectile(projectile);
        continue;
      }

      if (isEnemyProjectileOutOfBounds(projectile)) {
        this.removeEnemyProjectile(projectile);
      }
    }
  }

  private updateEnemies(time: number, seconds: number) {
    advanceEnemies(this, {
      enemies: this.enemies,
      towers: this.towers,
      enemyProjectiles: this.enemyProjectiles,
      time,
      seconds,
      triggerTrapTower: (tower, enemy) => this.triggerTrapTower(tower, enemy),
      triggerShockTower: (tower) => this.triggerShockTower(tower),
      damageTower: (tower, damage, damageType) => this.damageTower(tower, damage, damageType),
      damageEnemy: (enemy, damage, damageType) => this.damageEnemy(enemy, damage, damageType),
      onEnemyReachedBase: (enemy) => {
        this.baseIntegrity -= 1;
        this.removeEnemy(enemy, false);
        this.cameras.main.shake(110, 0.004);
        if (this.baseIntegrity <= 0) {
          this.endGame();
          return true;
        }
        return false;
      }
    });
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
    this.waveTracker = spawnWaveEnemies(this, this.enemies, {
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

  private damageTower(tower: Tower, damage: number, damageType: DamageType) {
    const actualDamage = calculateDamage(damage, damageType, tower.armor, tower.magicResistance);
    tower.hp -= actualDamage;
    syncTowerHpBar(tower);

    if (tower.hp <= 0) {
      this.removeTower(tower);
    }
  }

  private damageBoss(damage: number, damageType: DamageType) {
    const boss = this.boss;
    if (!boss) {
      return;
    }

    const actualDamage =
      calculateDamage(damage, damageType, boss.armor, boss.magicResistance) *
      (1 - boss.finalDamageReduction);
    boss.hp -= actualDamage;
    makeBossHitFlash(this, boss.x, boss.y, damageType);

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
      calculateDamage(damage, damageType, enemy.armor, enemy.magicResistance) *
      (1 - enemy.finalDamageReduction);
    enemy.hp -= actualDamage;
    const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
    enemy.shape.setScale(enemyScaleFromHp(hpRatio));

    if (enemy.hp <= 0) {
      if (this.waveTracker?.number === enemy.waveNumber) {
        this.waveTracker.defeatedWeight += enemy.weight;
      }

      this.enemiesDefeated += 1;
      spawnSplitEnemies(this, this.enemies, enemy, this.battleTime, this.difficultyConfig.finalDamageReduction);
      this.removeEnemy(enemy, true);
    }
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
    const count = getShockCount(tower, definition);
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

          makeShockPulse(this, x, y, rangeX, rangeY);
          for (const enemy of [...this.enemies]) {
            if (Math.abs(enemy.x - x) <= rangeX && Math.abs(enemy.y - y) <= rangeY) {
              this.damageEnemy(enemy, damage, damageType);
            }
          }
          if (isBossInRect(this.boss, x - rangeX, y - rangeY, rangeX * 2, rangeY * 2)) {
            this.damageBoss(damage, damageType);
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

    this.removeTower(tower);
    makeTrapBurst(this, x, y, damageType);
    if (target === "boss") {
      this.damageBoss(damage, damageType);
      return;
    }

    this.damageEnemy(target, damage, damageType);
  }

  private removeProjectile(projectile: Projectile) {
    Phaser.Utils.Array.Remove(this.projectiles, projectile);
    projectile.body.destroy();
  }

  private removeEnemyProjectile(projectile: EnemyProjectile) {
    Phaser.Utils.Array.Remove(this.enemyProjectiles, projectile);
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
    this.occupied.delete(gridCellKey(tower.lane, tower.column));
    this.tweens.add({
      targets: tower.body,
      alpha: 0,
      y: tower.y + 8,
      duration: 130,
      onComplete: () => tower.body.destroy()
    });
  }

  private updateCards(time: number) {
    updateCardStates(this.cardStates, {
      time,
      selectedCardId: this.selectedCardId,
      chars: this.chars,
      eraserMode: this.eraserMode,
      autoUpgradeMode: this.autoUpgradeMode
    });
    updateToolButtonStates(this.ui, this.eraserMode, this.autoUpgradeMode);
  }

  private grantDebugChars() {
    if (this.gameOver) {
      return;
    }

    this.eraserMode = false;
    this.autoUpgradeMode = false;
    this.gainChars(9_999, this.ui.debugButton.x, this.ui.debugButton.y + 34);
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

  private attemptAutoUpgrades() {
    let upgraded = false;
    for (const cardState of this.cardStates) {
      if (!isCardReadyForAutoUpgrade(cardState, this.cardTime)) {
        continue;
      }

      const target = findAutoUpgradeTarget(this.towers, cardState.definition.id);

      if (!target || this.chars < cardState.definition.cost) {
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

}
