import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, palette } from "../config";
import { t } from "../i18n";
import { getCardDefinition } from "../registry/cards";
import { createUnitBorder } from "../render/unitShapes";
import type { CardId } from "../types";

interface MenuItem {
  hitArea: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Text;
  enabled: boolean;
  action: () => void;
}

const TITLE_TOWERS: CardId[] = ["C", "h", "a", "r", "s", "e", "t"];

export class MainMenuScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private items: MenuItem[] = [];
  private selectedIndex = -1;
  private exited = false;
  private resizeFrame = 0;

  constructor() {
    super("MainMenuScene");
  }

  create() {
    this.exited = false;
    this.selectedIndex = -1;
    this.cameras.main.setBackgroundColor(palette.black);
    this.root = this.add.container(0, 0);
    this.layout();
    window.addEventListener("resize", this.handleResize);
    this.input.keyboard?.on("keydown", this.handleKey, this);
    this.events.once("shutdown", () => {
      window.removeEventListener("resize", this.handleResize);
      cancelAnimationFrame(this.resizeFrame);
      this.input.keyboard?.off("keydown", this.handleKey, this);
      this.input.setDefaultCursor("default");
      // Other scenes retain their existing fixed-format battlefield layout.
      this.scale.setGameSize(GAME_WIDTH, GAME_HEIGHT);
    });
  }

  private readonly handleResize = () => {
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => this.layout());
  };

  private layout() {
    const parent = this.game.canvas.parentElement;
    const screenWidth = parent?.clientWidth || window.innerWidth;
    const screenHeight = parent?.clientHeight || window.innerHeight;
    const aspect = screenWidth / Math.max(1, screenHeight);
    const baseHeight = screenHeight < 500 && aspect > 1 ? 600 : GAME_HEIGHT;
    const width = Math.max(640, Math.round(baseHeight * aspect));
    const height = Math.max(baseHeight, Math.round(width / aspect));
    this.scale.setGameSize(width, height);
    this.cameras.main.setSize(width, height);
    this.root.removeAll(true);
    this.items = [];
    this.selectedIndex = -1;

    if (this.exited) {
      this.drawExitState(width, height);
      return;
    }

    const centerX = width / 2;
    const titleY = Math.round(height * 0.25);
    const titleScale = Math.min(1, (width - 64) / 920);
    this.drawTitle(centerX, titleY, titleScale);
    const subtitleY = titleY + 76 * titleScale + 24;
    this.root.add(this.add.text(centerX, subtitleY, t("menu.subtitle"), {
      fontFamily: "monospace", fontSize: "22px", color: "#b6b6b6"
    }).setOrigin(0.5));

    const portrait = height > width;
    const spacing = portrait ? 72 : 56;
    const startY = Math.max(subtitleY + 70, height * 0.49);
    this.addMenuItem(centerX, startY, t("menu.singlePlayer"), () => this.scene.start("ChapterSelectScene"));
    this.addMenuItem(centerX, startY + spacing, t("menu.multiplayer"), () => {}, false);
    this.addMenuItem(centerX, startY + spacing * 2, t("button.encyclopedia"), () => this.scene.start("EncyclopediaScene"));
    this.addMenuItem(centerX, startY + spacing * 3, t("button.settings"), () => {
      this.scene.start("SettingsScene", { returnScene: "MainMenuScene" });
    });
    this.addMenuItem(centerX, startY + spacing * 4, t("menu.quit"), () => this.quit());
  }

  private drawTitle(centerX: number, y: number, scale: number) {
    const title = this.add.container(centerX, y).setScale(scale);
    const grid = this.add.graphics();
    grid.lineStyle(1, palette.dim, 0.45);
    for (let index = 0; index <= 7; index++) {
      const x = (index - 3.5) * 128;
      grid.lineBetween(x, -78, x, 94);
    }
    grid.lineBetween(-472, -64, 472, -64);
    grid.lineBetween(-472, 64, 472, 64);
    title.add(grid);

    TITLE_TOWERS.forEach((id, index) => {
      const tower = this.add.container((index - 3) * 128, 0);
      const category = getCardDefinition(id).category;
      const border = createUnitBorder(this, category, 51, category === "defense" ? 3 : 2);
      const label = this.add.text(0, category === "function" ? 3 : -3, id, {
        fontFamily: "monospace", fontSize: "54px", fontStyle: "700", color: "#f5f5f5"
      }).setOrigin(0.5);
      const hp = this.add.rectangle(0, 73, 42, 3, palette.white, 0.75);
      tower.add([border, label, hp]);
      title.add(tower);
    });
    this.root.add(title);
  }

  private addMenuItem(x: number, y: number, text: string, action: () => void, enabled = true) {
    const index = this.items.length;
    const hitArea = this.add.rectangle(x, y, 368, 50, palette.white, 0);
    const label = this.add.text(x - 130, y, text, {
      fontFamily: "monospace", fontSize: "24px", fontStyle: "700",
      color: enabled ? "#f5f5f5" : "#666666"
    }).setOrigin(0, 0.5);
    const arrow = this.add.text(x - 165, y, ">", {
      fontFamily: "monospace", fontSize: "22px", color: "#48ff88"
    }).setOrigin(0.5).setVisible(false);
    const divider = this.add.rectangle(x, y + 27, 328, 1, palette.dim, 0.65);
    this.root.add([hitArea, label, arrow, divider]);
    this.items.push({ hitArea, label, arrow, enabled, action });
    if (enabled) {
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on("pointerover", () => this.select(index));
      hitArea.on("pointerout", () => this.select(-1));
      hitArea.on("pointerup", () => action());
    } else {
      this.root.add(this.add.text(x + 164, y, t("menu.soon"), {
        fontFamily: "monospace", fontSize: "14px", color: "#777777"
      }).setOrigin(1, 0.5));
    }
  }

  private select(index: number) {
    this.selectedIndex = index;
    this.items.forEach((item, itemIndex) => {
      const selected = itemIndex === index && item.enabled;
      item.arrow.setVisible(selected);
      item.label.setColor(!item.enabled ? "#666666" : selected ? "#48ff88" : "#f5f5f5");
      item.hitArea.setFillStyle(palette.white, selected ? 0.045 : 0);
    });
  }

  private handleKey(event: KeyboardEvent) {
    if (event.code === "Escape") {
      if (this.exited) this.resumeMenu();
      else this.select(-1);
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      event.preventDefault();
      const item = this.items[this.selectedIndex];
      if (item?.enabled && !event.repeat) item.action();
      return;
    }
    if (event.code !== "ArrowDown" && event.code !== "ArrowUp" && event.code !== "Tab") return;
    event.preventDefault();
    const direction = event.code === "ArrowUp" || (event.code === "Tab" && event.shiftKey) ? -1 : 1;
    let next = this.selectedIndex;
    if (next < 0) next = direction > 0 ? -1 : 0;
    do {
      next = (next + direction + this.items.length) % this.items.length;
    } while (!this.items[next].enabled);
    this.select(next);
  }

  private quit() {
    this.exited = true;
    window.close();
    if (!window.closed) this.layout();
  }

  private drawExitState(width: number, height: number) {
    this.root.add(this.add.text(width / 2, height / 2 - 72, t("menu.exited"), {
      fontFamily: "monospace", fontSize: "28px", color: "#f5f5f5"
    }).setOrigin(0.5));
    this.root.add(this.add.text(width / 2, height / 2 - 18, t("menu.closeBlocked"), {
      fontFamily: "monospace", fontSize: "18px", color: "#8c8c8c",
      align: "center", wordWrap: { width: Math.min(width - 80, 560), useAdvancedWrap: true }
    }).setOrigin(0.5));
    this.addMenuItem(width / 2, height / 2 + 72, t("menu.return"), () => this.resumeMenu());
  }

  private resumeMenu() {
    this.exited = false;
    this.layout();
  }
}
