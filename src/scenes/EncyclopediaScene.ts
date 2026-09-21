import Phaser from "phaser";
import { palette } from "../config";
import { EncyclopediaPanel } from "../render/encyclopediaPanel";

export class EncyclopediaScene extends Phaser.Scene {
  private panel!: EncyclopediaPanel;
  constructor() {
    super("EncyclopediaScene");
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.black);
    const back = () => this.scene.start("MainMenuScene");
    this.panel = new EncyclopediaPanel(this, back);
    this.panel.open("towers");
    this.input.keyboard?.on("keydown-ESC", back);
    this.events.once("shutdown", () => this.input.keyboard?.off("keydown-ESC", back));
  }
}
