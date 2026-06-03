import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, palette } from "../config";
import { getLanguage, setLanguage, t, type Language } from "../i18n";
import { allCardDefinitions, cardLetterCase, type CardLetterCase } from "../registry/cards";
import {
  CONTROL_SLOT_COUNT,
  captureKeyCode,
  formatKeyCode,
  getKeybinding,
  resetKeybindings,
  setKeybinding,
  slotControlAction,
  toolControlDefinitions,
  type ControlActionId
} from "../settings/keybindings";

interface KeybindingRow {
  actionId: ControlActionId;
  button: Phaser.GameObjects.Rectangle;
  keyText: Phaser.GameObjects.Text;
}

interface CardCaseButton {
  letterCase: CardLetterCase;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface SettingsSceneData {
  returnScene?: string;
  returnData?: Record<string, unknown>;
}

export class SettingsScene extends Phaser.Scene {
  private returnScene = "ChapterSelectScene";
  private returnData: Record<string, unknown> = {};
  private rows: KeybindingRow[] = [];
  private editingActionId: ControlActionId | null = null;
  private languageButtons: Array<{ language: Language; frame: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }> = [];
  private cardCase: CardLetterCase = "uppercase";
  private cardCaseButtons: CardCaseButton[] = [];
  private cardBindingList!: Phaser.GameObjects.Container;

  constructor() {
    super("SettingsScene");
  }

  init(data: SettingsSceneData) {
    this.returnScene = data.returnScene ?? "ChapterSelectScene";
    this.returnData = data.returnData ?? {};
    this.rows = [];
    this.editingActionId = null;
    this.languageButtons = [];
    this.cardCase = "uppercase";
    this.cardCaseButtons = [];
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.black);
    this.drawBackdrop();
    this.createBackButton();
    this.createLanguageControls();
    this.createControlRows();
    this.createResetButton();
    this.refreshBindings();

    this.input.keyboard?.on("keydown", this.handleCaptureKey, this);
    this.events.once("shutdown", () => {
      this.input.keyboard?.off("keydown", this.handleCaptureKey, this);
    });
  }

  private drawBackdrop() {
    this.add
      .text(48, 40, t("settings.title"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "30px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);

    this.add
      .text(50, 88, t("settings.controls"), {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "17px"
      })
      .setOrigin(0, 0);

    const frame = this.add.graphics();
    frame.lineStyle(1, palette.dim, 1);
    frame.strokeRect(38, 130, GAME_WIDTH - 76, GAME_HEIGHT - 184);
  }

  private createBackButton() {
    const button = this.add
      .rectangle(GAME_WIDTH - 78, 52, 92, 34, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(GAME_WIDTH - 78, 50, t("button.back"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    button.on("pointerdown", () => this.goBack());
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.goBack());
  }

  private createLanguageControls() {
    this.add
      .text(66, 158, t("settings.language"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);

    this.createLanguageButton("zh-CN", 66, 204, t("language.zh"));
    this.createLanguageButton("en", 176, 204, t("language.en"));
    this.updateLanguageButtons();
  }

  private createLanguageButton(language: Language, x: number, y: number, text: string) {
    const frame = this.add
      .rectangle(x, y, 92, 34, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x + 46, y - 1, text, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    const apply = () => this.changeLanguage(language);
    frame.on("pointerdown", apply);
    label.setInteractive({ useHandCursor: true }).on("pointerdown", apply);
    this.languageButtons.push({ language, frame, label });
  }

  private createControlRows() {
    this.createSectionTitle(66, 266, t("settings.tools"));
    toolControlDefinitions.forEach((definition, index) => {
      this.createBindingRow(t(definition.labelKey), definition.id, 66, 306 + index * 34, 150);
    });

    this.createSectionTitle(334, 266, t("settings.slots"));
    for (let index = 1; index <= CONTROL_SLOT_COUNT; index += 1) {
      this.createBindingRow(t("control.slot", { index }), slotControlAction(index), 334, 306 + (index - 1) * 34, 94);
    }

    this.createSectionTitle(560, 158, t("settings.towers"));
    this.createCardCaseButtons(560, 204);
    this.cardBindingList = this.add.container(0, 0);
    this.populateCardBindingRows();
  }

  private populateCardBindingRows() {
    this.rows = this.rows.filter((row) => !row.actionId.startsWith("card:"));
    this.cardBindingList.removeAll(true);

    const startX = 560;
    const startY = 252;
    const columns = 4;
    const columnWidth = 164;
    const rowHeight = 34;
    const definitions = allCardDefinitions.filter((definition) => cardLetterCase(definition.id) === this.cardCase);
    definitions.forEach((definition, index) => {
      const x = startX + (index % columns) * columnWidth;
      const y = startY + Math.floor(index / columns) * rowHeight;
      this.createBindingRow(definition.id, `card:${definition.id}`, x, y, 28, this.cardBindingList);
    });
    this.updateCardCaseButtons();
  }

  private createSectionTitle(x: number, y: number, text: string) {
    this.add
      .text(x, y, text, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
  }

  private createBindingRow(
    label: string,
    actionId: ControlActionId,
    x: number,
    y: number,
    labelWidth: number,
    parent?: Phaser.GameObjects.Container
  ) {
    const labelText = this.add
      .text(x, y, label, {
        color: "#d8d8d8",
        fontFamily: "monospace",
        fontSize: "14px"
      })
      .setOrigin(0, 0.5);

    const buttonX = x + labelWidth + 8;
    const button = this.add
      .rectangle(buttonX, y, 74, 26, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const keyText = this.add
      .text(buttonX + 37, y - 1, "", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    const begin = () => this.beginCapture(actionId);
    button.on("pointerdown", begin);
    keyText.setInteractive({ useHandCursor: true }).on("pointerdown", begin);
    parent?.add([labelText, button, keyText]);
    this.rows.push({ actionId, button, keyText });
  }

  private createCardCaseButtons(x: number, y: number) {
    this.cardCaseButtons = [
      this.createCardCaseButton("uppercase", x, y, "A"),
      this.createCardCaseButton("lowercase", x + 54, y, "a")
    ];
    this.updateCardCaseButtons();
  }

  private createCardCaseButton(letterCase: CardLetterCase, x: number, y: number, text: string) {
    const frame = this.add
      .rectangle(x, y, 42, 28, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x + 21, y - 1, text, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "17px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    const select = () => this.setCardCase(letterCase);
    frame.on("pointerdown", select);
    label.setInteractive({ useHandCursor: true }).on("pointerdown", select);
    return { letterCase, frame, label };
  }

  private setCardCase(letterCase: CardLetterCase) {
    if (letterCase === this.cardCase) {
      return;
    }

    this.cardCase = letterCase;
    if (this.editingActionId?.startsWith("card:")) {
      this.editingActionId = null;
    }
    this.populateCardBindingRows();
    this.refreshBindings();
  }

  private updateCardCaseButtons() {
    for (const button of this.cardCaseButtons) {
      const selected = button.letterCase === this.cardCase;
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.7);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.78);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private createResetButton() {
    const y = GAME_HEIGHT - 84;
    const button = this.add
      .rectangle(132, y, 132, 38, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(132, y - 2, t("settings.resetControls"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    const reset = () => {
      resetKeybindings();
      this.editingActionId = null;
      this.refreshBindings();
    };
    button.on("pointerdown", reset);
    label.setInteractive({ useHandCursor: true }).on("pointerdown", reset);
  }

  private beginCapture(actionId: ControlActionId) {
    this.editingActionId = actionId;
    this.refreshBindings();
  }

  private handleCaptureKey(event: KeyboardEvent) {
    if (!this.editingActionId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setKeybinding(this.editingActionId, captureKeyCode(event));
    this.editingActionId = null;
    this.refreshBindings();
  }

  private refreshBindings() {
    for (const row of this.rows) {
      const editing = row.actionId === this.editingActionId;
      const code = getKeybinding(row.actionId);
      row.keyText.setText(editing ? t("control.capture") : formatKeyCode(code) || t("control.empty"));
      row.button.setStrokeStyle(editing ? 3 : 2, editing ? palette.white : code ? palette.mid : palette.dim, editing ? 1 : 0.9);
      row.button.setFillStyle(editing ? palette.panel : palette.black, editing ? 1 : 0.82);
      row.keyText.setAlpha(code || editing ? 1 : 0.5);
    }
  }

  private updateLanguageButtons() {
    const current = getLanguage();
    for (const button of this.languageButtons) {
      const selected = button.language === current;
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.8);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.82);
      button.label.setAlpha(selected ? 1 : 0.62);
    }
  }

  private changeLanguage(language: Language) {
    if (getLanguage() === language) {
      return;
    }

    setLanguage(language);
    this.scene.restart({ returnScene: this.returnScene, returnData: this.returnData });
  }

  private goBack() {
    this.scene.start(this.returnScene, this.returnData);
  }
}
