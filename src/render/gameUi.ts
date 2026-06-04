import Phaser from "phaser";
import {
  CARD_BAR_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  GAME_SPEED_MAX,
  GAME_SPEED_MIN,
  PROGRESS_BAR_WIDTH,
  palette
} from "../config";
import { t } from "../i18n";
import { getCardDefinition } from "../registry/cards";
import type { CardId, CardState, CubeBoss } from "../types";
import { createUnitBorder } from "./unitShapes";

export interface GameHudElements {
  charsText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  progressText: Phaser.GameObjects.Text;
  progressBack: Phaser.GameObjects.Rectangle;
  progressFill: Phaser.GameObjects.Rectangle;
  toastText: Phaser.GameObjects.Text;
  speedText: Phaser.GameObjects.Text;
  speedFill: Phaser.GameObjects.Rectangle;
  speedKnob: Phaser.GameObjects.Rectangle;
  debugDamageButton: Phaser.GameObjects.Rectangle;
  debugDamageText: Phaser.GameObjects.Text;
  debugButton: Phaser.GameObjects.Rectangle;
  debugText: Phaser.GameObjects.Text;
  shifterButton: Phaser.GameObjects.Rectangle;
  shifterText: Phaser.GameObjects.Text;
  shifterCooldownBack: Phaser.GameObjects.Rectangle;
  shifterCooldownFill: Phaser.GameObjects.Rectangle;
  autoUpgradeButton: Phaser.GameObjects.Rectangle;
  autoUpgradeText: Phaser.GameObjects.Text;
  autoUpgradeEnabledBox: Phaser.GameObjects.Rectangle;
  autoUpgradeEnabledFill: Phaser.GameObjects.Rectangle;
  autoUpgradeEnabledLabel: Phaser.GameObjects.Text;
  autoUpgradeReserveLabel: Phaser.GameObjects.Text;
  autoUpgradeReserveInput: Phaser.GameObjects.Rectangle;
  autoUpgradeReserveText: Phaser.GameObjects.Text;
  eraserButton: Phaser.GameObjects.Rectangle;
  eraserText: Phaser.GameObjects.Text;
}

export interface GameOverlayElements {
  container: Phaser.GameObjects.Container;
  title: Phaser.GameObjects.Text;
  buttonText: Phaser.GameObjects.Text;
}

interface GameHudActions {
  onDebug: () => void;
  onDebugDamage: () => void;
  onShifter: () => void;
  onAutoUpgrade: () => void;
  onAutoUpgradeEnabled: () => void;
  onAutoUpgradeReserveFocus: () => void;
  onGameSpeedChange: (speed: number) => void;
  onErase: () => void;
}

interface CardUpdateState {
  time: number;
  timeForCard?: (id: CardId) => number;
  selectedCardId: CardId;
  chars: number;
  eraserMode: boolean;
  shifterMode: boolean;
  autoUpgradeMode: boolean;
  debugDamageMode: boolean;
}

interface HudUpdateState {
  chars: number;
  rawChars: number;
  charsSoftcapped: boolean;
  wave: number;
  wavesPerFlag: number;
  totalWaves: number;
  baseIntegrity: number;
  enemiesDefeated: number;
  battlePaused: boolean;
  gameSpeed: number;
  boss: CubeBoss | null;
  bossHpBar?: {
    fillColor: number;
    backColor: number;
    phase: number;
    totalPhases: number;
  };
}

export function createGameHud(
  scene: Phaser.Scene,
  levelId: string,
  difficulty: number,
  actions: GameHudActions
): GameHudElements {
  scene.add
    .text(28, 24, `${t("app.title")} ${levelId} D${difficulty}`, {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "25px",
      fontStyle: "700"
    })
    .setOrigin(0, 0);

  const charsText = scene.add.text(28, 70, "", {
    color: "#f5f5f5",
    fontFamily: "monospace",
    fontSize: "18px"
  });

  const statusText = scene.add.text(240, 92, "", {
    color: "#8c8c8c",
    fontFamily: "monospace",
    fontSize: "16px"
  });
  const speedSliderX = 348;
  const speedSliderY = 120;
  const speedSliderWidth = 176;
  const speedText = scene.add
    .text(240, speedSliderY - 2, "", {
      color: "#8c8c8c",
      fontFamily: "monospace",
      fontSize: "13px"
    })
    .setOrigin(0, 0.5)
    .setDepth(21);
  scene.add.rectangle(speedSliderX, speedSliderY, speedSliderWidth, 4, palette.dim, 1).setOrigin(0, 0.5).setDepth(21);
  const speedFill = scene.add.rectangle(speedSliderX, speedSliderY, 0, 4, palette.white, 1).setOrigin(0, 0.5).setDepth(22);
  const speedKnob = scene.add
    .rectangle(speedSliderX, speedSliderY, 10, 20, palette.black, 1)
    .setStrokeStyle(2, palette.white, 0.92)
    .setInteractive({ useHandCursor: true })
    .setDepth(23);
  const speedHit = scene.add
    .rectangle(speedSliderX + speedSliderWidth / 2, speedSliderY, speedSliderWidth + 24, 28, palette.black, 0.001)
    .setInteractive({ useHandCursor: true })
    .setDepth(20);
  const setSpeedFromPointer = (pointer: Phaser.Input.Pointer) => {
    const ratio = Phaser.Math.Clamp((pointer.x - speedSliderX) / speedSliderWidth, 0, 1);
    const speed = GAME_SPEED_MIN + ratio * (GAME_SPEED_MAX - GAME_SPEED_MIN);
    actions.onGameSpeedChange(Math.round(speed * 10) / 10);
  };
  speedHit.on("pointerdown", setSpeedFromPointer);
  speedKnob.on("pointerdown", setSpeedFromPointer);
  speedKnob.on("drag", (pointer: Phaser.Input.Pointer) => setSpeedFromPointer(pointer));
  scene.input.setDraggable(speedKnob);

  const progressText = scene.add
    .text(GAME_WIDTH - 28, GAME_HEIGHT - 50, "", {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "15px"
    })
    .setOrigin(1, 1);
  const progressBack = scene.add
    .rectangle(GAME_WIDTH - 28 - PROGRESS_BAR_WIDTH, GAME_HEIGHT - 24, PROGRESS_BAR_WIDTH, 4, palette.dim, 1)
    .setOrigin(0, 0.5);
  const progressFill = scene.add
    .rectangle(GAME_WIDTH - 28 - PROGRESS_BAR_WIDTH, GAME_HEIGHT - 24, 0, 4, palette.white, 1)
    .setOrigin(0, 0.5);

  const toastText = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, "", {
      color: "#d8d8d8",
      fontFamily: "monospace",
      fontSize: "16px"
    })
    .setOrigin(0.5, 0.5);

  const { button: debugDamageButton, text: debugDamageText } = createToolButton(
    scene,
    GAME_WIDTH - 588,
    42,
    126,
    t("button.debugDamage")
  );
  const { button: debugButton, text: debugText } = createToolButton(scene, GAME_WIDTH - 460, 42, 110, t("button.debug"));
  const { button: shifterButton, text: shifterText } = createToolButton(scene, GAME_WIDTH - 332, 42, 110, t("button.shifter"));
  const shifterCooldownBack = scene.add
    .rectangle(GAME_WIDTH - 377, 59, 90, 4, palette.dim, 1)
    .setOrigin(0, 0.5)
    .setDepth(32);
  const shifterCooldownFill = scene.add
    .rectangle(GAME_WIDTH - 377, 59, 90, 4, palette.white, 1)
    .setOrigin(0, 0.5)
    .setDepth(33);
  const { button: autoUpgradeButton, text: autoUpgradeText } = createToolButton(
    scene,
    GAME_WIDTH - 196,
    42,
    126,
    t("button.autoUpgrade")
  );
  const { button: eraserButton, text: eraserText } = createToolButton(scene, GAME_WIDTH - 68, 42, 100, t("button.erase"));
  const autoUpgradeEnabledBox = scene.add
    .rectangle(GAME_WIDTH - 252, 88, 18, 18, palette.black, 1)
    .setStrokeStyle(2, palette.green, 0.82)
    .setInteractive({ useHandCursor: true })
    .setDepth(30);
  const autoUpgradeEnabledFill = scene.add.rectangle(GAME_WIDTH - 252, 88, 10, 10, palette.green, 1).setDepth(31);
  const autoUpgradeEnabledLabel = scene.add
    .text(GAME_WIDTH - 238, 86, t("label.autoUpgradeEnabled"), {
      color: "#d8d8d8",
      fontFamily: "monospace",
      fontSize: "12px"
    })
    .setOrigin(0, 0.5)
    .setDepth(31)
    .setInteractive({ useHandCursor: true });
  const autoUpgradeReserveLabel = scene.add
    .text(GAME_WIDTH - 205, 86, t("label.autoUpgradeReserve"), {
      color: "#8c8c8c",
      fontFamily: "monospace",
      fontSize: "12px"
    })
    .setOrigin(0, 0.5)
    .setDepth(31);
  const autoUpgradeReserveInput = scene.add
    .rectangle(GAME_WIDTH - 145, 88, 42, 22, palette.black, 1)
    .setStrokeStyle(2, palette.mid, 0.72)
    .setInteractive({ useHandCursor: true })
    .setDepth(30);
  const autoUpgradeReserveText = scene.add
    .text(GAME_WIDTH - 145, 86, "0", {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "13px"
    })
    .setOrigin(0.5, 0.5)
    .setDepth(31)
    .setInteractive({ useHandCursor: true });

  bindPointerAction(debugDamageButton, actions.onDebugDamage);
  debugDamageText.setInteractive({ useHandCursor: true });
  bindPointerAction(debugDamageText, actions.onDebugDamage);
  debugButton.on("pointerdown", actions.onDebug);
  debugText.setInteractive({ useHandCursor: true }).on("pointerdown", actions.onDebug);
  shifterButton.on("pointerdown", actions.onShifter);
  shifterText.setInteractive({ useHandCursor: true }).on("pointerdown", actions.onShifter);
  autoUpgradeButton.on("pointerdown", actions.onAutoUpgrade);
  autoUpgradeText.setInteractive({ useHandCursor: true }).on("pointerdown", actions.onAutoUpgrade);
  autoUpgradeEnabledBox.on("pointerdown", actions.onAutoUpgradeEnabled);
  autoUpgradeEnabledLabel.on("pointerdown", actions.onAutoUpgradeEnabled);
  autoUpgradeReserveInput.on("pointerdown", actions.onAutoUpgradeReserveFocus);
  autoUpgradeReserveText.on("pointerdown", actions.onAutoUpgradeReserveFocus);
  eraserButton.on("pointerdown", actions.onErase);
  eraserText.setInteractive({ useHandCursor: true }).on("pointerdown", actions.onErase);

  return {
    charsText,
    statusText,
    progressText,
    progressBack,
    progressFill,
    toastText,
    speedText,
    speedFill,
    speedKnob,
    debugDamageButton,
    debugDamageText,
    debugButton,
    debugText,
    shifterButton,
    shifterText,
    shifterCooldownBack,
    shifterCooldownFill,
    autoUpgradeButton,
    autoUpgradeText,
    autoUpgradeEnabledBox,
    autoUpgradeEnabledFill,
    autoUpgradeEnabledLabel,
    autoUpgradeReserveLabel,
    autoUpgradeReserveInput,
    autoUpgradeReserveText,
    eraserButton,
    eraserText
  };
}

export function createCardStates(scene: Phaser.Scene, selectedCardIds: CardId[], onSelect: (id: CardId) => void) {
  return selectedCardIds.map((cardId, index): CardState => {
    const definition = getCardDefinition(cardId);
    const x = 28;
    const y = 122 + index * 70;
    const frame = scene.add
      .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, palette.black, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, palette.dim, 1)
      .setInteractive({ useHandCursor: true });

    const previewBorder = createUnitBorder(scene, definition.category, 19, 2).setPosition(x + 37, y + 34);
    const label = scene.add
      .text(x + 37, y + 31, definition.id, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "27px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    const costText = scene.add.text(x + 78, y + 11, `${definition.cost}`, {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "18px"
    });
    const statsText = scene.add.text(x + 78, y + 35, definition.stats, {
      color: "#8c8c8c",
      fontFamily: "monospace",
      fontSize: "13px"
    });

    const barBack = scene.add.rectangle(x + 17, y + 58, CARD_BAR_WIDTH, 4, palette.dim, 1).setOrigin(0, 0.5);
    const cooldownFill = scene.add
      .rectangle(x + 17, y + 58, CARD_BAR_WIDTH, 4, palette.white, 1)
      .setOrigin(0, 0.5);

    frame.on("pointerdown", () => onSelect(definition.id));

    return {
      definition,
      frame,
      cooldownFill,
      content: [previewBorder, label, costText, statsText, barBack],
      readyAt: 0
    };
  });
}

export function createGameOverlay(scene: Phaser.Scene, onAction: () => void): GameOverlayElements {
  const plate = scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 360, 160, palette.black, 0.98)
    .setStrokeStyle(2, palette.white, 1);
  const title = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, t("overlay.breach"), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "30px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const menuButton = scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 34, 118, 38, palette.black, 1)
    .setStrokeStyle(2, palette.white, 1)
    .setInteractive({ useHandCursor: true });
  const buttonText = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 31, t("button.menu"), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "16px"
    })
    .setOrigin(0.5);

  menuButton.on("pointerdown", onAction);

  const container = scene.add.container(0, 0, [plate, title, menuButton, buttonText]);
  container.setVisible(false);
  container.setDepth(200);

  return { container, title, buttonText };
}

export function updateCardStates(cardStates: CardState[], state: CardUpdateState) {
  for (const card of cardStates) {
    const isSelected =
      !state.eraserMode &&
      !state.shifterMode &&
      !state.autoUpgradeMode &&
      !state.debugDamageMode &&
      card.definition.id === state.selectedCardId;
    const isAffordable = state.chars >= card.definition.cost;
    const cardTime = state.timeForCard?.(card.definition.id) ?? state.time;
    const cooldownRatio = Phaser.Math.Clamp((card.readyAt - cardTime) / card.definition.cooldown, 0, 1);
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
}

export function updateToolButtonStates(
  ui: GameHudElements,
  eraserMode: boolean,
  shifterMode: boolean,
  shifterReadyRatio: number,
  autoUpgradeMode: boolean,
  debugDamageMode: boolean,
  autoUpgradeEnabled: boolean,
  autoUpgradeReserve: number,
  reserveInputFocused: boolean
) {
  ui.debugDamageButton.setStrokeStyle(debugDamageMode ? 4 : 2, debugDamageMode ? palette.gold : palette.mid, 1);
  ui.debugDamageButton.setFillStyle(debugDamageMode ? palette.panel : palette.black, debugDamageMode ? 1 : 0.82);
  ui.debugDamageButton.setAlpha(debugDamageMode ? 1 : 0.78);
  ui.debugDamageText.setAlpha(debugDamageMode ? 1 : 0.78);

  const shifterReady = shifterReadyRatio >= 1;
  ui.shifterButton.setStrokeStyle(shifterMode ? 4 : 2, shifterMode ? palette.magic : shifterReady ? palette.mid : palette.dim, 1);
  ui.shifterButton.setFillStyle(shifterMode ? palette.panel : palette.black, shifterMode ? 1 : shifterReady ? 0.82 : 0.44);
  ui.shifterButton.setAlpha(shifterMode ? 1 : shifterReady ? 0.78 : 0.42);
  ui.shifterText.setAlpha(shifterMode ? 1 : shifterReady ? 0.78 : 0.42);
  ui.shifterCooldownBack.setVisible(!shifterReady);
  ui.shifterCooldownFill.setVisible(!shifterReady);
  ui.shifterCooldownFill.width = 90 * Phaser.Math.Clamp(shifterReadyRatio, 0, 1);

  ui.autoUpgradeButton.setStrokeStyle(autoUpgradeMode ? 4 : 2, autoUpgradeMode ? palette.green : palette.mid, 1);
  ui.autoUpgradeButton.setFillStyle(autoUpgradeMode ? palette.panel : palette.black, autoUpgradeMode ? 1 : 0.82);
  ui.autoUpgradeButton.setAlpha(autoUpgradeMode ? 1 : 0.78);
  ui.autoUpgradeText.setAlpha(autoUpgradeMode ? 1 : 0.78);
  ui.autoUpgradeEnabledBox.setStrokeStyle(2, autoUpgradeEnabled ? palette.green : palette.dim, autoUpgradeEnabled ? 0.86 : 0.62);
  ui.autoUpgradeEnabledFill.setVisible(autoUpgradeEnabled);
  ui.autoUpgradeEnabledLabel.setAlpha(autoUpgradeEnabled ? 0.95 : 0.42);
  ui.autoUpgradeReserveLabel.setAlpha(autoUpgradeEnabled ? 0.72 : 0.34);
  ui.autoUpgradeReserveInput.setStrokeStyle(
    reserveInputFocused ? 3 : 2,
    reserveInputFocused ? palette.white : autoUpgradeEnabled ? palette.mid : palette.dim,
    reserveInputFocused ? 1 : autoUpgradeEnabled ? 0.72 : 0.42
  );
  ui.autoUpgradeReserveInput.setFillStyle(reserveInputFocused ? palette.panel : palette.black, reserveInputFocused ? 1 : 0.84);
  ui.autoUpgradeReserveText.setText(`${autoUpgradeReserve}`);
  ui.autoUpgradeReserveText.setAlpha(autoUpgradeEnabled ? 0.95 : 0.44);

  ui.eraserButton.setStrokeStyle(eraserMode ? 4 : 2, eraserMode ? palette.white : palette.mid, 1);
  ui.eraserButton.setFillStyle(eraserMode ? palette.panel : palette.black, eraserMode ? 1 : 0.82);
  ui.eraserButton.setAlpha(eraserMode ? 1 : 0.78);
  ui.eraserText.setAlpha(eraserMode ? 1 : 0.78);
}

export function updateGameHud(ui: GameHudElements, state: HudUpdateState) {
  const waveText = state.wave === 0 ? t("label.wait") : `${state.wave}`;
  const flag = state.wave === 0 ? 0 : Math.ceil(state.wave / state.wavesPerFlag);
  const pauseText = state.battlePaused ? `    ${t("label.paused")}` : "";
  const speedRatio = Phaser.Math.Clamp((state.gameSpeed - GAME_SPEED_MIN) / (GAME_SPEED_MAX - GAME_SPEED_MIN), 0, 1);

  const rawCharsText = state.charsSoftcapped ? ` (${Math.floor(state.rawChars)})` : "";
  ui.charsText.setText(`${t("label.chars")} ${Math.floor(state.chars)}${rawCharsText}`);
  ui.statusText.setText(
    `${t("label.wave")} ${waveText}    ${t("label.base")} ${state.baseIntegrity}    ${t("label.ko")} ${state.enemiesDefeated}${pauseText}`
  );
  ui.speedText.setText(`${t("label.speed")} x${formatSpeed(state.gameSpeed)}`);
  ui.speedFill.width = 176 * speedRatio;
  ui.speedKnob.x = Math.round(348 + 176 * speedRatio);
  if (state.boss) {
    const bossHpRatio = Phaser.Math.Clamp(state.boss.hp / state.boss.maxHp, 0, 1);
    const phaseText = state.bossHpBar ? ` P${state.bossHpBar.phase}/${state.bossHpBar.totalPhases}` : "";
    ui.progressText.setText(`${t("label.cubeHp")}${phaseText} ${Math.ceil(state.boss.hp)}/${state.boss.maxHp}`);
    ui.progressBack.setFillStyle(state.bossHpBar?.backColor ?? palette.dim, 1);
    ui.progressFill.setFillStyle(state.bossHpBar?.fillColor ?? palette.white, 1);
    ui.progressFill.width = PROGRESS_BAR_WIDTH * bossHpRatio;
    return;
  }

  const totalFlags = state.totalWaves / state.wavesPerFlag;
  const waveProgress = state.totalWaves > 0 ? Phaser.Math.Clamp(state.wave / state.totalWaves, 0, 1) : 0;
  ui.progressBack.setFillStyle(palette.dim, 1);
  ui.progressFill.setFillStyle(palette.white, 1);
  ui.progressText.setText(
    `${t("label.flag")} ${flag}/${totalFlags}  ${t("label.wave")} ${state.wave}/${state.totalWaves}`
  );
  ui.progressFill.width = PROGRESS_BAR_WIDTH * waveProgress;
}

function formatSpeed(speed: number) {
  return Number.isInteger(speed) ? speed.toFixed(0) : speed.toFixed(1);
}

export function showToast(scene: Phaser.Scene, ui: GameHudElements, text: string) {
  ui.toastText.setText(text);
  ui.toastText.setAlpha(1);
  scene.tweens.killTweensOf(ui.toastText);
  scene.tweens.add({
    targets: ui.toastText,
    alpha: 0,
    duration: 620,
    delay: 250
  });
}

export function showGameOverlay(overlay: GameOverlayElements, titleText: string, buttonText: string) {
  overlay.title.setText(titleText);
  overlay.buttonText.setText(buttonText);
  overlay.container.setVisible(true);
}

function createToolButton(scene: Phaser.Scene, x: number, y: number, width: number, label: string) {
  const button = scene.add
    .rectangle(x, y, width, 40, palette.black, 1)
    .setStrokeStyle(2, palette.mid, 0.75)
    .setInteractive({ useHandCursor: true })
    .setDepth(30);
  const text = scene.add
    .text(x, y - 2, label, {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: width >= 110 ? "15px" : "16px",
      fontStyle: "700"
    })
    .setOrigin(0.5)
    .setDepth(31);

  return { button, text };
}

function bindPointerAction(target: Phaser.GameObjects.GameObject, action: () => void) {
  target.on(
    "pointerdown",
    (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      action();
    }
  );
}
