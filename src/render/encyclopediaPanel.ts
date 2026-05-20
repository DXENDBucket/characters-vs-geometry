import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, palette } from "../config";
import {
  enemyEncyclopediaEntries,
  towerEncyclopediaEntries,
  type EncyclopediaEntry,
  type EncyclopediaTab
} from "../encyclopedia";
import { t } from "../i18n";
import { cardLetterCase, type CardLetterCase } from "../registry/cards";
import {
  createCubeIcon,
  createDodecahedronIcon,
  createEnemyShape,
  createSmallStellatedDodecahedronIcon,
  createTetrahedronIcon,
  createUnitBorder
} from "./unitShapes";

interface EncyclopediaTabButton {
  tab: EncyclopediaTab;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface EncyclopediaCardCaseButton {
  letterCase: CardLetterCase;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class EncyclopediaPanel {
  private overlay!: Phaser.GameObjects.Container;
  private list!: Phaser.GameObjects.Container;
  private viewport!: Phaser.Geom.Rectangle;
  private contentHeight = 0;
  private scrollY = 0;
  private dragPointer: Phaser.Input.Pointer | null = null;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private openState = false;
  private tab: EncyclopediaTab = "enemies";
  private tabs: EncyclopediaTabButton[] = [];
  private cardCase: CardLetterCase = "uppercase";
  private cardCaseButtons: EncyclopediaCardCaseButton[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.createOverlay();
  }

  isOpen() {
    return this.openState;
  }

  open(tab: EncyclopediaTab) {
    this.openState = true;
    this.overlay.setVisible(true);
    this.setTab(tab);
  }

  close() {
    this.openState = false;
    this.dragPointer = null;
    this.overlay.setVisible(false);
  }

  private createOverlay() {
    this.tabs = [];
    this.cardCaseButtons = [];
    const backdrop = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, palette.black, 0.78);
    backdrop.setInteractive();
    const panel = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, 1060, 616, palette.black, 0.98)
      .setStrokeStyle(2, palette.white, 0.95);
    const title = this.scene.add
      .text(144, 86, t("encyclopedia.title"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "26px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    const closeButton = this.scene.add
      .rectangle(1128, 102, 54, 34, palette.black, 1)
      .setStrokeStyle(2, palette.mid, 0.9)
      .setInteractive({ useHandCursor: true });
    const closeText = this.scene.add
      .text(1128, 100, "X", {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    const enemyTab = this.createTabButton("enemies", 144, 136);
    const towerTab = this.createTabButton("towers", 294, 136);
    const upperCaseButton = this.createCardCaseButton("uppercase", 452, 136, "A");
    const lowerCaseButton = this.createCardCaseButton("lowercase", 504, 136, "a");

    this.viewport = new Phaser.Geom.Rectangle(144, 180, 992, 418);
    this.list = this.scene.add.container(this.viewport.x, this.viewport.y);
    const maskGraphics = this.scene.add.graphics().setVisible(false);
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height);
    this.list.setMask(maskGraphics.createGeometryMask());
    const scrollZone = this.scene.add
      .zone(this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height)
      .setOrigin(0, 0)
      .setInteractive();

    closeButton.on("pointerdown", () => this.close());
    closeText.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.close());
    scrollZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.openState) {
        return;
      }

      this.dragPointer = pointer;
      this.dragStartY = pointer.y;
      this.dragStartScrollY = this.scrollY;
    });
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.dragPointer !== pointer || !pointer.isDown) {
        return;
      }

      this.setScroll(this.dragStartScrollY - (pointer.y - this.dragStartY));
    });
    this.scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.stopDrag(pointer));
    this.scene.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.stopDrag(pointer));
    this.scene.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        if (!this.openState || !this.viewport.contains(pointer.x, pointer.y)) {
          return;
        }

        this.setScroll(this.scrollY + deltaY);
      }
    );

    this.overlay = this.scene.add.container(0, 0, [
      backdrop,
      panel,
      title,
      closeButton,
      closeText,
      enemyTab.frame,
      enemyTab.label,
      towerTab.frame,
      towerTab.label,
      upperCaseButton.frame,
      upperCaseButton.label,
      lowerCaseButton.frame,
      lowerCaseButton.label,
      maskGraphics,
      this.list,
      scrollZone
    ]);
    this.overlay.setDepth(260);
    this.overlay.setVisible(false);
  }

  private createTabButton(tab: EncyclopediaTab, x: number, y: number) {
    const frame = this.scene.add
      .rectangle(x, y, 132, 36, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(x + 66, y - 1, t(tab === "enemies" ? "encyclopedia.enemies" : "encyclopedia.towers"), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "15px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setTab(tab));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setTab(tab));
    const button = { tab, frame, label };
    this.tabs.push(button);
    return button;
  }

  private createCardCaseButton(letterCase: CardLetterCase, x: number, y: number, text: string) {
    const frame = this.scene.add
      .rectangle(x, y, 42, 30, palette.black, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, palette.dim, 0.9)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(x + 21, y - 1, text, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "700"
      })
      .setOrigin(0.5);

    frame.on("pointerdown", () => this.setCardCase(letterCase));
    label.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setCardCase(letterCase));
    const button = { letterCase, frame, label };
    this.cardCaseButtons.push(button);
    return button;
  }

  private setTab(tab: EncyclopediaTab) {
    this.tab = tab;
    this.updateTabs();
    this.updateCardCaseButtons();
    this.rebuildList();
  }

  private setCardCase(letterCase: CardLetterCase) {
    if (letterCase === this.cardCase) {
      return;
    }

    this.cardCase = letterCase;
    this.updateCardCaseButtons();
    if (this.tab === "towers") {
      this.rebuildList();
    }
  }

  private updateTabs() {
    for (const button of this.tabs) {
      const selected = button.tab === this.tab;
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.75);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.86);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private updateCardCaseButtons() {
    const visible = this.tab === "towers";
    for (const button of this.cardCaseButtons) {
      const selected = button.letterCase === this.cardCase;
      button.frame.setVisible(visible);
      button.label.setVisible(visible);
      button.frame.setStrokeStyle(selected ? 3 : 2, selected ? palette.white : palette.dim, selected ? 1 : 0.7);
      button.frame.setFillStyle(selected ? palette.panel : palette.black, selected ? 1 : 0.78);
      button.label.setAlpha(selected ? 1 : 0.55);
    }
  }

  private rebuildList() {
    this.list.removeAll(true);
    const entries =
      this.tab === "enemies"
        ? enemyEncyclopediaEntries()
        : towerEncyclopediaEntries().filter((entry) => entry.card && cardLetterCase(entry.card.id) === this.cardCase);
    const entryHeight = 206;
    entries.forEach((entry, index) => {
      this.drawEntry(entry, index * entryHeight);
    });
    this.contentHeight = entries.length * entryHeight + 14;
    this.setScroll(0);
  }

  private drawEntry(entry: EncyclopediaEntry, y: number) {
    const container = this.scene.add.container(0, y);
    const frame = this.scene.add
      .rectangle(this.viewport.width / 2, 96, this.viewport.width - 6, 186, palette.black, 1)
      .setStrokeStyle(1, palette.dim, 0.95);
    container.add(frame);

    if (entry.enemyKind) {
      container.add(createEnemyShape(this.scene, entry.enemyKind).setPosition(48, 72).setScale(1.05));
    } else if (entry.icon === "cube") {
      container.add(createCubeIcon(this.scene).setPosition(48, 72));
    } else if (entry.icon === "tetrahedron") {
      container.add(createTetrahedronIcon(this.scene).setPosition(48, 72));
    } else if (entry.icon === "dodecahedron") {
      container.add(createDodecahedronIcon(this.scene).setPosition(48, 72));
    } else if (entry.icon === "smallStellatedDodecahedron") {
      container.add(createSmallStellatedDodecahedronIcon(this.scene).setPosition(48, 72));
    } else if (entry.card) {
      const border = createUnitBorder(this.scene, entry.card.category, 23, 2).setPosition(48, 70);
      const label = this.scene.add
        .text(48, 67, entry.card.id, {
          color: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: "28px",
          fontStyle: "700"
        })
        .setOrigin(0.5);
      container.add([border, label]);
    }

    const title = this.scene.add
      .text(92, 18, entry.title, {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "700"
      })
      .setOrigin(0, 0);
    const stats = this.scene.add
      .text(92, 46, entry.lines.join("\n"), {
        color: "#cfcfcf",
        fontFamily: "monospace",
        fontSize: "13px",
        lineSpacing: 3,
        wordWrap: { width: 850 }
      })
      .setOrigin(0, 0);
    const description = this.scene.add
      .text(92, 134, entry.description, {
        color: "#8c8c8c",
        fontFamily: "monospace",
        fontSize: "13px",
        wordWrap: { width: 850 }
      })
      .setOrigin(0, 0);

    container.add([title, stats, description]);
    this.list.add(container);
  }

  private stopDrag(pointer: Phaser.Input.Pointer) {
    if (this.dragPointer === pointer) {
      this.dragPointer = null;
    }
  }

  private setScroll(scrollY: number) {
    const maxScroll = Math.max(0, this.contentHeight - this.viewport.height);
    this.scrollY = Math.round(Phaser.Math.Clamp(scrollY, 0, maxScroll));
    this.list.y = this.viewport.y - this.scrollY;
  }
}
