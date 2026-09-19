import Phaser from "phaser";
import { palette, uiTextColors } from "../config";

export function createPageHeading(scene: Phaser.Scene, title: string, subtitle: string) {
  const heading = scene.add.text(48, 40, title, {
    color: uiTextColors.primary, fontFamily: "monospace", fontSize: "30px", fontStyle: "700"
  }).setOrigin(0, 0).setName("page-title");
  const caption = scene.add.text(48, 88, subtitle, {
    color: uiTextColors.secondary, fontFamily: "monospace", fontSize: "17px"
  }).setOrigin(0, 0).setName("page-subtitle");
  return [heading, caption];
}

interface HeaderAction {
  label: string;
  run: () => void;
}

export function createHeaderNavigation(scene: Phaser.Scene, actions: readonly HeaderAction[]) {
  const width = 132;
  const gap = 12;
  return actions.map((action, index) => {
    const x = scene.scale.width - 48 - width / 2 - (actions.length - index - 1) * (width + gap);
    const frame = scene.add.rectangle(x, 58, width, 38, palette.black)
      .setName("header-action")
      .setStrokeStyle(2, palette.mid, 0.85)
      .setInteractive({ useHandCursor: true });
    const label = scene.add.text(x, 58, action.label, {
      color: uiTextColors.primary, fontFamily: "monospace", fontSize: "15px", fontStyle: "700"
    }).setOrigin(0.5);
    frame.on("pointerover", () => frame.setStrokeStyle(2, palette.green, 1));
    frame.on("pointerout", () => frame.setStrokeStyle(2, palette.mid, 0.85));
    frame.on("pointerdown", action.run);
    return { frame, label };
  });
}
