import Phaser from "phaser";
import { bindButtonHover } from "./buttonHover";
import { bindSliderInput } from "./sliderInput";
import {
  CARD_BAR_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  GAME_SPEED_MAX,
  GAME_SPEED_MIN,
  PROGRESS_BAR_WIDTH,
  palette,
  uiTextColors
} from "../config";
import { createUnlockedCardDetails } from "./cardUnlockDetails";
import { t } from "../i18n";
import { getCardDefinition } from "../registry/cards";
import type { AlphaGameObject, CardId, CardState, CubeBoss } from "../types";
import { createUnitBorder } from "./unitShapes";
import { drawParenthesisBorder } from "./parenthesisTower";
import type { TowerExtractionPool } from "../game/towerExtraction";

export interface GameHudElements {
  titleText: Phaser.GameObjects.Text;
  pauseMenuButton: Phaser.GameObjects.Rectangle;
  pauseMenuText: Phaser.GameObjects.Text;
  pauseMenuTooltip: Phaser.GameObjects.Text;
  charsText: Phaser.GameObjects.Text;
  extractionText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  environmentText: Phaser.GameObjects.Text;
  progressText: Phaser.GameObjects.Text;
  progressBack: Phaser.GameObjects.Rectangle;
  progressFill: Phaser.GameObjects.Rectangle;
  toastText: Phaser.GameObjects.Text;
  speedText: Phaser.GameObjects.Text;
  speedFill: Phaser.GameObjects.Rectangle;
  speedKnob: Phaser.GameObjects.Rectangle;
  superDebugDamageButton: Phaser.GameObjects.Rectangle;
  superDebugDamageText: Phaser.GameObjects.Text;
  debugDamageButton: Phaser.GameObjects.Rectangle;
  debugDamageText: Phaser.GameObjects.Text;
  debugButton: Phaser.GameObjects.Rectangle;
  debugText: Phaser.GameObjects.Text;
  shifterButton: Phaser.GameObjects.Rectangle;
  shifterText: Phaser.GameObjects.Text;
  shifterCooldownBack: Phaser.GameObjects.Rectangle;
  shifterCooldownFill: Phaser.GameObjects.Rectangle;
  reselectButton: Phaser.GameObjects.Rectangle;
  reselectText: Phaser.GameObjects.Text;
  reselectCooldownBack: Phaser.GameObjects.Rectangle;
  reselectCooldownFill: Phaser.GameObjects.Rectangle;
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
  plate: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  subtitle: Phaser.GameObjects.Text;
  menuButton: Phaser.GameObjects.Rectangle;
  buttonText: Phaser.GameObjects.Text;
  details: Phaser.GameObjects.Container;
}

interface GameHudActions {
  onMenu: () => void;
  onDebug: () => void;
  onDebugDamage: () => void;
  onSuperDebugDamage: () => void;
  onShifter: () => void;
  onReselect: () => void;
  onAutoUpgrade: () => void;
  onAutoUpgradeEnabled: () => void;
  onAutoUpgradeReserveFocus: () => void;
  onGameSpeedChange: (speed: number) => void;
  canChangeGameSpeed: () => boolean;
  onErase: () => void;
}

interface CardUpdateState {
  extraction: TowerExtractionPool;
  selectedCardId: CardId;
  chars: number;
  eraserMode: boolean;
  shifterMode: boolean;
  autoUpgradeMode: boolean;
  debugDamageMode: boolean;
}

interface HudUpdateState {
  enemyHpMultiplier?: number;
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
  actions: GameHudActions,
  debugModeEnabled: boolean
): GameHudElements {
  const titleText = scene.add
    .text(28, 24, `${t("app.title")} ${levelId} D${difficulty}`, {
      color: uiTextColors.primary,
      fontFamily: "monospace",
      fontSize: "25px",
      fontStyle: "700"
    })
    .setOrigin(0, 0);

  const charsText = scene.add.text(28, 70, "", {
    color: uiTextColors.primary,
    fontFamily: "monospace",
    fontSize: "18px"
  });
  const extractionText = scene.add.text(GAME_WIDTH - 500, 112, "", {
    color: "#ffd75a", fontFamily: "monospace", fontSize: "13px"
  }).setOrigin(0.5).setVisible(false);

  const statusText = scene.add.text(240, 92, "", {
    color: uiTextColors.secondary,
    fontFamily: "monospace",
    fontSize: "16px"
  });
  const speedSliderX = 348;
  const environmentText = scene.add.text(550, 120, "", {
    color: "#9fdcff", fontFamily: "monospace", fontSize: "13px"
  }).setOrigin(0, 0.5);
  const speedSliderY = 120;
  const speedSliderWidth = 176;
  const speedText = scene.add
    .text(240, speedSliderY - 2, "", {
      color: uiTextColors.secondary,
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
  bindSliderInput(scene, [speedHit, speedKnob], {
    enabled: actions.canChangeGameSpeed,
    coordinate: pointer => pointer.x,
    geometry: () => ({ start: speedSliderX, end: speedSliderX + speedSliderWidth, thumb: speedKnob.x, thumbSize: speedKnob.width }),
    change: ratio => {
      const speed = GAME_SPEED_MIN + ratio * (GAME_SPEED_MAX - GAME_SPEED_MIN);
      actions.onGameSpeedChange(Math.round(speed * 10) / 10);
    }
  });
  bindButtonHover(speedKnob, [speedHit]);

  const progressText = scene.add
    .text(GAME_WIDTH - 28, GAME_HEIGHT - 50, "", {
      color: uiTextColors.primary,
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
      color: uiTextColors.body,
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
  const { button: superDebugDamageButton, text: superDebugDamageText } = createToolButton(
    scene,
    GAME_WIDTH - 716,
    42,
    126,
    t("button.superDebugDamage")
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
      color: uiTextColors.body,
      fontFamily: "monospace",
      fontSize: "12px"
    })
    .setOrigin(0, 0.5)
    .setDepth(31)
    .setInteractive({ useHandCursor: true });
  const autoUpgradeReserveLabel = scene.add
    .text(GAME_WIDTH - 205, 86, t("label.autoUpgradeReserve"), {
      color: uiTextColors.secondary,
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
      color: uiTextColors.primary,
      fontFamily: "monospace",
      fontSize: "13px"
    })
    .setOrigin(0.5, 0.5)
    .setDepth(31)
    .setInteractive({ useHandCursor: true });

  bindPointerAction(debugDamageButton, actions.onDebugDamage);
  debugDamageText.setInteractive({ useHandCursor: true });
  bindButtonHover(autoUpgradeEnabledBox, [autoUpgradeEnabledLabel]);
  bindButtonHover(autoUpgradeReserveInput, [autoUpgradeReserveText], () => autoUpgradeEnabledFill.visible);
  bindPointerAction(debugDamageText, actions.onDebugDamage);
  bindPointerAction(superDebugDamageButton, actions.onSuperDebugDamage);
  superDebugDamageText.setInteractive({ useHandCursor: true });
  bindPointerAction(superDebugDamageText, actions.onSuperDebugDamage);
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

  const { button: pauseMenuButton, text: pauseMenuText } = createToolButton(scene, 0, 42, 40, "\u2630");
  bindPointerAction(pauseMenuButton, actions.onMenu);
  const pauseMenuTooltip = scene.add.text(0, 69, `${t("button.menu")} (Esc)`, {
    color: uiTextColors.primary, backgroundColor: "#101010", fontFamily: "monospace", fontSize: "13px",
    padding: { x: 8, y: 5 }
  }).setOrigin(1, 0).setDepth(100).setVisible(false);
  pauseMenuButton.on("pointerover", () => pauseMenuTooltip.setVisible(true));
  pauseMenuButton.on("pointerout", () => pauseMenuTooltip.setVisible(false));

  for (const element of [
    superDebugDamageButton, superDebugDamageText, debugDamageButton, debugDamageText,
    debugButton, debugText, shifterButton, shifterText, shifterCooldownBack, shifterCooldownFill,
    autoUpgradeButton, autoUpgradeText, autoUpgradeEnabledBox, autoUpgradeEnabledFill,
    autoUpgradeEnabledLabel, autoUpgradeReserveLabel, autoUpgradeReserveInput, autoUpgradeReserveText,
    eraserButton, eraserText
  ]) element.x -= 40;
  for (const element of [superDebugDamageButton, superDebugDamageText, debugDamageButton, debugDamageText, debugButton, debugText]) {
    element.x -= 128;
  }
  const { button: reselectButton, text: reselectText } = createToolButton(scene, GAME_WIDTH - 500, 42, 110, t("button.reselect"));
  bindPointerAction(reselectButton, actions.onReselect);
  const reselectCooldownBack = scene.add.rectangle(GAME_WIDTH - 545, 59, 90, 4, palette.dim, 1)
    .setOrigin(0, 0.5).setDepth(32).setVisible(false);
  const reselectCooldownFill = scene.add.rectangle(GAME_WIDTH - 545, 59, 90, 4, palette.white, 1)
    .setOrigin(0, 0.5).setDepth(33).setVisible(false);

  const ui: GameHudElements = {
    titleText,
    environmentText,
    pauseMenuButton,
    pauseMenuText,
    pauseMenuTooltip,
    charsText,
    extractionText,
    statusText,
    progressText,
    progressBack,
    progressFill,
    toastText,
    speedText,
    speedFill,
    speedKnob,
    superDebugDamageButton,
    superDebugDamageText,
    debugDamageButton,
    debugDamageText,
    debugButton,
    debugText,
    shifterButton,
    shifterText,
    shifterCooldownBack,
    shifterCooldownFill,
    reselectButton,
    reselectText,
    reselectCooldownBack,
    reselectCooldownFill,
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
  refreshGameHudSettings(ui, levelId, difficulty, debugModeEnabled);
  return ui;
}

export function refreshGameHudSettings(ui: GameHudElements, levelId: string, difficulty: number, debugModeEnabled: boolean) {
  ui.titleText.setText(`${t("app.title")} ${levelId} D${difficulty}`);
  for (const [label, key] of [
    [ui.superDebugDamageText, "button.superDebugDamage"], [ui.debugDamageText, "button.debugDamage"],
    [ui.debugText, "button.debug"], [ui.shifterText, "button.shifter"],
    [ui.reselectText, "button.reselect"],
    [ui.autoUpgradeText, "button.autoUpgrade"], [ui.eraserText, "button.erase"],
    [ui.autoUpgradeEnabledLabel, "label.autoUpgradeEnabled"], [ui.autoUpgradeReserveLabel, "label.autoUpgradeReserve"]
  ] as const) label.setText(t(key));
  for (const element of [ui.superDebugDamageButton, ui.superDebugDamageText, ui.debugDamageButton,
    ui.debugDamageText, ui.debugButton, ui.debugText]) element.setVisible(debugModeEnabled);
  ui.pauseMenuButton.x = ui.pauseMenuText.x = GAME_WIDTH - 30;
  ui.pauseMenuTooltip.x = GAME_WIDTH - 10;
  ui.pauseMenuTooltip.setText(`${t("button.menu")} (Esc)`).setVisible(false);
}

export function createCardStates(scene: Phaser.Scene, selectedCardIds: CardId[]) {
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
      .text(x + 37, y + (definition.id === "*" ? 37 : 31), definition.id, {
        color: uiTextColors.primary,
        fontFamily: "monospace",
        fontSize: definition.id.startsWith("?") ? (definition.id.length > 2 ? "17px" : "23px") : "27px",
        fontStyle: "700"
      })
      .setOrigin(0.5);
    if (definition.id === "()") { drawParenthesisBorder(previewBorder, palette.white, 3); previewBorder.setScale(19 / 34); label.setVisible(false); }
    const costText = scene.add.text(x + 78, y + 11, `${definition.cost}`, {
      color: uiTextColors.primary,
      fontFamily: "monospace",
      fontSize: "18px"
    });
    const statsText = scene.add.text(x + 78, y + 35, definition.stats, {
      color: uiTextColors.secondary,
      fontFamily: "monospace",
      fontSize: "13px"
    });
    const batchText = scene.add.text(x + 78, y + 35, "", {
      color: "#ffd75a", fontFamily: "monospace", fontSize: "13px"
    }).setVisible(false);

    const barBack = scene.add.rectangle(x + 17, y + 58, CARD_BAR_WIDTH, 4, palette.dim, 1).setOrigin(0, 0.5);
    const cooldownFill = scene.add
      .rectangle(x + 17, y + 58, CARD_BAR_WIDTH, 4, palette.white, 1)
      .setOrigin(0, 0.5);

    bindButtonHover(frame, [], undefined, { clickSound: false });

    return {
      definition,
      frame,
      cooldownFill,
      costText,
      statsText,
      batchText,
      content: [previewBorder, label, costText, statsText, barBack, batchText],
      readyAt: 0,
      displayTime: 0
    };
  });
}

export function destroyCardStates(cards: CardState[]) {
  for (const card of cards) {
    card.frame.destroy();
    card.cooldownFill.destroy();
    for (const element of card.content) element.destroy();
  }
}

export function updateReselectButtonState(ui: GameHudElements, unlocked: boolean, readyRatio: number, visible: boolean) {
  const ready = unlocked && readyRatio >= 1;
  ui.reselectButton.setData("hoverEnabled", ready);
  setVisibleIfChanged(ui.reselectButton, visible && unlocked);
  setVisibleIfChanged(ui.reselectText, visible && unlocked);
  setStrokeStyleIfChanged(ui.reselectButton, 2, ready ? palette.mid : palette.dim, 1);
  setAlphaIfChanged(ui.reselectButton, ready ? 0.78 : 0.42);
  setAlphaIfChanged(ui.reselectText, ready ? 0.78 : 0.42);
  updateToolCooldownBar(ui.reselectCooldownBack, ui.reselectCooldownFill, readyRatio, visible && unlocked);
}

function updateToolCooldownBar(
  back: Phaser.GameObjects.Rectangle,
  fill: Phaser.GameObjects.Rectangle,
  readyRatio: number,
  visible = true
) {
  setVisibleIfChanged(back, visible && readyRatio < 1);
  setVisibleIfChanged(fill, visible && readyRatio < 1);
  setRectangleWidthIfChanged(fill, back.width * Phaser.Math.Clamp(readyRatio, 0, 1));
}

export function createGameOverlay(scene: Phaser.Scene, onAction: () => void): GameOverlayElements {
  const plate = scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 360, 160, palette.black, 0.98)
    .setStrokeStyle(2, palette.white, 1);
  const title = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, t("overlay.breach"), {
      color: uiTextColors.primary,
      fontFamily: "monospace",
      fontSize: "30px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const subtitle = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 6, "", {
      color: uiTextColors.secondary,
      fontFamily: "monospace",
      fontSize: "17px",
      fontStyle: "700"
    })
    .setOrigin(0.5)
    .setVisible(false);
  const menuButton = scene.add
    .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 34, 118, 38, palette.black, 1)
    .setStrokeStyle(2, palette.white, 1)
    .setInteractive({ useHandCursor: true });
  const buttonText = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 31, t("button.menu"), {
      color: uiTextColors.primary,
      fontFamily: "monospace",
      fontSize: "16px"
    })
    .setOrigin(0.5);

  menuButton.on("pointerdown", onAction);
  bindButtonHover(menuButton, [buttonText]);

  const details = scene.add.container(0, 0);
  const container = scene.add.container(0, 0, [plate, title, subtitle, details, menuButton, buttonText]);
  container.setVisible(false);
  container.setDepth(200);

  return { container, plate, title, subtitle, menuButton, buttonText, details };
}

export function updateCardStates(cardStates: CardState[], state: CardUpdateState) {
  for (const card of cardStates) {
    const isSelected =
      !state.eraserMode &&
      !state.shifterMode &&
      !state.autoUpgradeMode &&
      !state.debugDamageMode &&
      card.definition.id === state.selectedCardId;
    const batch = state.extraction.plan(card.definition);
    const isAffordable = state.chars >= batch.cost;
    setTextIfChanged(card.costText, `${batch.cost}`);
    setTextIfChanged(card.batchText, `x${batch.levels}`);
    setVisibleIfChanged(card.statsText, !batch.usesPool);
    setVisibleIfChanged(card.batchText, batch.usesPool);
    fitCardText(card.costText, CARD_WIDTH - 84);
    fitCardText(card.statsText, CARD_WIDTH - 84);
    fitCardText(card.batchText, CARD_WIDTH - 84);
    const cooldownRatio = Phaser.Math.Clamp((card.readyAt - card.displayTime) / card.definition.cooldown, 0, 1);
    const readyRatio = 1 - cooldownRatio;
    const contentAlpha = isSelected ? (isAffordable ? 1 : 0.56) : isAffordable ? 0.95 : 0.22;

    setStrokeStyleIfChanged(
      card.frame,
      isSelected ? 4 : 2,
      isSelected ? palette.white : isAffordable ? palette.mid : palette.dim,
      isSelected ? 1 : isAffordable ? 0.72 : 0.35
    );
    setFillStyleIfChanged(card.frame, isSelected ? palette.panel : palette.black, isSelected ? 1 : isAffordable ? 0.78 : 0.34);
    setAlphaIfChanged(card.frame, isSelected ? 1 : isAffordable ? 0.78 : 0.34);
    for (const content of card.content) {
      setAlphaIfChanged(content, contentAlpha);
    }
    setRectangleWidthIfChanged(card.cooldownFill, CARD_BAR_WIDTH * readyRatio);
    setAlphaIfChanged(card.cooldownFill, contentAlpha * (cooldownRatio > 0 ? 0.86 : 1));
  }
}

function fitCardText(text: Phaser.GameObjects.Text, maxWidth: number) {
  const scale = text.width > maxWidth ? maxWidth / text.width : 1;
  if (text.scaleX !== scale) text.setScale(scale);
}

export function updateExtractionPool(ui: GameHudElements, amount: number) {
  setVisibleIfChanged(ui.extractionText, amount > 0);
  setTextIfChanged(ui.extractionText, `y: ${amount}`);
}

export function updateToolButtonStates(
  ui: GameHudElements,
  eraserMode: boolean,
  shifterMode: boolean,
  shifterReadyRatio: number,
  autoUpgradeMode: boolean,
  debugDamageMode: boolean,
  superDebugDamageMode: boolean,
  autoUpgradeEnabled: boolean,
  autoUpgradeReserve: number,
  reserveInputFocused: boolean
) {
  setStrokeStyleIfChanged(ui.debugDamageButton, debugDamageMode ? 4 : 2, debugDamageMode ? palette.gold : palette.mid, 1);
  setFillStyleIfChanged(ui.debugDamageButton, debugDamageMode ? palette.panel : palette.black, debugDamageMode ? 1 : 0.82);
  setAlphaIfChanged(ui.debugDamageButton, debugDamageMode ? 1 : 0.78);
  setAlphaIfChanged(ui.debugDamageText, debugDamageMode ? 1 : 0.78);
  setStrokeStyleIfChanged(ui.superDebugDamageButton, superDebugDamageMode ? 4 : 2, superDebugDamageMode ? palette.gold : palette.mid, 1);
  setFillStyleIfChanged(
    ui.superDebugDamageButton,
    superDebugDamageMode ? palette.panel : palette.black,
    superDebugDamageMode ? 1 : 0.82
  );
  setAlphaIfChanged(ui.superDebugDamageButton, superDebugDamageMode ? 1 : 0.78);
  setAlphaIfChanged(ui.superDebugDamageText, superDebugDamageMode ? 1 : 0.78);

  const shifterReady = shifterReadyRatio >= 1;
  ui.shifterButton.setData("hoverEnabled", shifterReady);
  setStrokeStyleIfChanged(ui.shifterButton, shifterMode ? 4 : 2, shifterMode ? palette.magic : shifterReady ? palette.mid : palette.dim, 1);
  setFillStyleIfChanged(ui.shifterButton, shifterMode ? palette.panel : palette.black, shifterMode ? 1 : shifterReady ? 0.82 : 0.44);
  setAlphaIfChanged(ui.shifterButton, shifterMode ? 1 : shifterReady ? 0.78 : 0.42);
  setAlphaIfChanged(ui.shifterText, shifterMode ? 1 : shifterReady ? 0.78 : 0.42);
  updateToolCooldownBar(ui.shifterCooldownBack, ui.shifterCooldownFill, shifterReadyRatio);

  setStrokeStyleIfChanged(ui.autoUpgradeButton, autoUpgradeMode ? 4 : 2, autoUpgradeMode ? palette.green : palette.mid, 1);
  setFillStyleIfChanged(ui.autoUpgradeButton, autoUpgradeMode ? palette.panel : palette.black, autoUpgradeMode ? 1 : 0.82);
  setAlphaIfChanged(ui.autoUpgradeButton, autoUpgradeMode ? 1 : 0.78);
  setAlphaIfChanged(ui.autoUpgradeText, autoUpgradeMode ? 1 : 0.78);
  setStrokeStyleIfChanged(ui.autoUpgradeEnabledBox, 2, autoUpgradeEnabled ? palette.green : palette.dim, autoUpgradeEnabled ? 0.86 : 0.62);
  setVisibleIfChanged(ui.autoUpgradeEnabledFill, autoUpgradeEnabled);
  setAlphaIfChanged(ui.autoUpgradeEnabledLabel, autoUpgradeEnabled ? 0.95 : 0.42);
  setAlphaIfChanged(ui.autoUpgradeReserveLabel, autoUpgradeEnabled ? 0.9 : 0.34);
  setStrokeStyleIfChanged(
    ui.autoUpgradeReserveInput,
    reserveInputFocused ? 3 : 2,
    reserveInputFocused ? palette.white : autoUpgradeEnabled ? palette.mid : palette.dim,
    reserveInputFocused ? 1 : autoUpgradeEnabled ? 0.72 : 0.42
  );
  setFillStyleIfChanged(ui.autoUpgradeReserveInput, reserveInputFocused ? palette.panel : palette.black, reserveInputFocused ? 1 : 0.84);
  setTextIfChanged(ui.autoUpgradeReserveText, `${autoUpgradeReserve}`);
  setAlphaIfChanged(ui.autoUpgradeReserveText, autoUpgradeEnabled ? 0.95 : 0.44);

  setStrokeStyleIfChanged(ui.eraserButton, eraserMode ? 4 : 2, eraserMode ? palette.white : palette.mid, 1);
  setFillStyleIfChanged(ui.eraserButton, eraserMode ? palette.panel : palette.black, eraserMode ? 1 : 0.82);
  setAlphaIfChanged(ui.eraserButton, eraserMode ? 1 : 0.78);
  setAlphaIfChanged(ui.eraserText, eraserMode ? 1 : 0.78);
}

export function updateGameHud(ui: GameHudElements, state: HudUpdateState) {
  setTextIfChanged(ui.environmentText, state.enemyHpMultiplier === undefined ? "" :
    t("label.enemyEnvironmentHp", { value: Math.round(state.enemyHpMultiplier * 100) / 100 }));
  const waveText = state.wave === 0 ? t("label.wait") : `${state.wave}`;
  const flag = state.wave === 0 ? 0 : Math.ceil(state.wave / state.wavesPerFlag);
  const pauseText = state.battlePaused ? `    ${t("label.paused")}` : "";
  const speedRatio = Phaser.Math.Clamp((state.gameSpeed - GAME_SPEED_MIN) / (GAME_SPEED_MAX - GAME_SPEED_MIN), 0, 1);

  const rawCharsText = state.charsSoftcapped ? ` (${Math.floor(state.rawChars)})` : "";
  setTextIfChanged(ui.charsText, `${t("label.chars")} ${Math.floor(state.chars)}${rawCharsText}`);
  setTextIfChanged(
    ui.statusText,
    `${t("label.wave")} ${waveText}    ${t("label.base")} ${state.baseIntegrity}    ${t("label.ko")} ${state.enemiesDefeated}${pauseText}`
  );
  setTextIfChanged(ui.speedText, `${t("label.speed")} x${formatSpeed(state.gameSpeed)}`);
  setRectangleWidthIfChanged(ui.speedFill, 176 * speedRatio);
  setXIfChanged(ui.speedKnob, Math.round(348 + 176 * speedRatio));
  if (state.boss) {
    const bossHpRatio = Phaser.Math.Clamp(state.boss.hp / state.boss.maxHp, 0, 1);
    const phaseText = state.bossHpBar ? ` P${state.bossHpBar.phase}/${state.bossHpBar.totalPhases}` : "";
    setTextIfChanged(ui.progressText, `${t("label.cubeHp")}${phaseText} ${Math.ceil(state.boss.hp)}/${state.boss.maxHp}`);
    setFillStyleIfChanged(ui.progressBack, state.bossHpBar?.backColor ?? palette.dim, 1);
    setFillStyleIfChanged(ui.progressFill, state.bossHpBar?.fillColor ?? palette.white, 1);
    setRectangleWidthIfChanged(ui.progressFill, PROGRESS_BAR_WIDTH * bossHpRatio);
    return;
  }

  const totalFlags = state.totalWaves / state.wavesPerFlag;
  const waveProgress = state.totalWaves > 0 ? Phaser.Math.Clamp(state.wave / state.totalWaves, 0, 1) : 0;
  setFillStyleIfChanged(ui.progressBack, palette.dim, 1);
  setFillStyleIfChanged(ui.progressFill, palette.white, 1);
  setTextIfChanged(
    ui.progressText,
    `${t("label.flag")} ${flag}/${totalFlags}  ${t("label.wave")} ${state.wave}/${state.totalWaves}`
  );
  setRectangleWidthIfChanged(ui.progressFill, PROGRESS_BAR_WIDTH * waveProgress);
}

function setTextIfChanged(textObject: Phaser.GameObjects.Text, text: string) {
  if (textObject.text !== text) {
    textObject.setText(text);
  }
}

interface StrokeStyleCache {
  lineWidth: number;
  color: number;
  alpha: number;
}

interface FillStyleCache {
  color: number;
  alpha: number;
}

const strokeStyleCache = new WeakMap<Phaser.GameObjects.Rectangle, StrokeStyleCache>();
const fillStyleCache = new WeakMap<Phaser.GameObjects.Rectangle, FillStyleCache>();

function setStrokeStyleIfChanged(rectangle: Phaser.GameObjects.Rectangle, lineWidth: number, color: number, alpha: number) {
  const previous = strokeStyleCache.get(rectangle);
  if (previous?.lineWidth === lineWidth && previous.color === color && previous.alpha === alpha) {
    return;
  }
  rectangle.setStrokeStyle(lineWidth, color, alpha);
  strokeStyleCache.set(rectangle, { lineWidth, color, alpha });
}

function setFillStyleIfChanged(rectangle: Phaser.GameObjects.Rectangle, color: number, alpha: number) {
  const previous = fillStyleCache.get(rectangle);
  if (previous?.color === color && previous.alpha === alpha) {
    return;
  }
  rectangle.setFillStyle(color, alpha);
  fillStyleCache.set(rectangle, { color, alpha });
}

function setAlphaIfChanged(target: AlphaGameObject, alpha: number) {
  if ((target as AlphaGameObject & { alpha?: number }).alpha !== alpha) {
    target.setAlpha(alpha);
  }
}

function setVisibleIfChanged(
  target: Phaser.GameObjects.GameObject & { visible: boolean; setVisible(visible: boolean): unknown },
  visible: boolean
) {
  if (target.visible !== visible) {
    target.setVisible(visible);
  }
}

function setRectangleWidthIfChanged(rectangle: Phaser.GameObjects.Rectangle, width: number) {
  if (rectangle.width !== width) {
    rectangle.width = width;
  }
}

function setXIfChanged(target: Phaser.GameObjects.GameObject & { x: number }, x: number) {
  if (target.x !== x) {
    target.x = x;
  }
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

export function showGameOverlay(
  overlay: GameOverlayElements,
  titleText: string,
  buttonText: string,
  unlockedCardIds: CardId[] = [],
  unlockedCardSlot?: { current: number; total: number },
  unlockedToolMessage?: string,
  onOpenCard?: (id: CardId) => void
) {
  const hasCardUnlocks = unlockedCardIds.length > 0;
  const hasSlotUnlock = Boolean(unlockedCardSlot);
  const hasUnlocks = hasCardUnlocks || hasSlotUnlock || Boolean(unlockedToolMessage);
  const compactSlotUnlock = hasUnlocks && !hasCardUnlocks;
  const plateWidth = hasCardUnlocks ? 1_040 : compactSlotUnlock ? 460 : 360;
  const plateHeight = hasCardUnlocks ? 600 : compactSlotUnlock ? 210 : 160;
  const titleY = hasCardUnlocks
    ? 112
    : compactSlotUnlock
      ? GAME_HEIGHT / 2 - 48
      : GAME_HEIGHT / 2 - 24;
  const menuY = hasCardUnlocks
    ? 640
    : compactSlotUnlock
      ? GAME_HEIGHT / 2 + 58
      : GAME_HEIGHT / 2 + 34;
  overlay.details.removeAll(true);
  overlay.plate.setSize(plateWidth, plateHeight);
  overlay.title.setText(titleText);
  overlay.title.setPosition(GAME_WIDTH / 2, titleY);
  const unlockMessages = [
    hasCardUnlocks ? t("overlay.newCards") : "",
    unlockedCardSlot
      ? t("overlay.newCardSlot", { current: unlockedCardSlot.current, total: unlockedCardSlot.total })
      : "",
    unlockedToolMessage
  ].filter(Boolean);
  overlay.subtitle.setText(unlockMessages.join("  +  "));
  overlay.subtitle.setPosition(GAME_WIDTH / 2, hasCardUnlocks ? 154 : GAME_HEIGHT / 2 - 6);
  overlay.subtitle.setVisible(hasUnlocks);
  overlay.menuButton.setPosition(GAME_WIDTH / 2, menuY);
  overlay.buttonText.setText(buttonText);
  overlay.buttonText.setPosition(GAME_WIDTH / 2, menuY - 3);
  if (hasCardUnlocks) {
    createUnlockedCardDetails(overlay.details, unlockedCardIds, onOpenCard);
  }
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
      color: uiTextColors.primary,
      fontFamily: "monospace",
      fontSize: width >= 110 ? "15px" : "16px",
      fontStyle: "700"
    })
    .setOrigin(0.5)
    .setDepth(31);

  bindButtonHover(button, [text], () => button.getData("hoverEnabled") !== false);
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
