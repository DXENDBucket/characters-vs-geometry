import type Phaser from "phaser";
import { palette, uiTextColors } from "../config";
import { t } from "../i18n";
import { playSound, soundPlayer } from "../audio/player";
import { getAudioSettings, setAudioSettings } from "../settings/preferences";
import { bindButtonHover } from "./buttonHover";
import { bindSliderInput } from "./sliderInput";

export function createAudioSettingsControls(scene: Phaser.Scene) {
  const textStyle = { fontFamily: "monospace", fontSize: "13px", color: uiTextColors.body };
  scene.add.text(560, 622, t("settings.audio"), {
    ...textStyle, fontSize: "18px", fontStyle: "700", color: uiTextColors.primary
  });
  const mute = scene.add.rectangle(950, 634, 18, 18, palette.black)
    .setStrokeStyle(2, palette.mid).setInteractive({ useHandCursor: true });
  const fill = scene.add.rectangle(950, 634, 10, 10, palette.gold);
  const muteLabel = scene.add.text(969, 634, t("settings.audioMute"), textStyle)
    .setOrigin(0, .5).setInteractive({ useHandCursor: true });
  const refreshMute = () => fill.setVisible(getAudioSettings().muted);
  const toggle = () => {
    setAudioSettings({ muted: !getAudioSettings().muted });
    soundPlayer.applySettings();
    refreshMute();
  };
  mute.on("pointerdown", toggle);
  muteLabel.on("pointerdown", toggle);
  bindButtonHover(mute, [muteLabel]);
  refreshMute();

  const preview = scene.add.rectangle(1150, 634, 100, 28, palette.black)
    .setStrokeStyle(2, palette.mid).setInteractive({ useHandCursor: true });
  scene.add.text(1150, 634, t("settings.audioPreview"), textStyle).setOrigin(.5);
  preview.on("pointerdown", () => {
    void soundPlayer.unlock().then(() => {
      if (scene.scene.isActive()) playSound("deploy");
    });
  });
  bindButtonHover(preview);

  const controls = [
    ["master", "settings.audioMaster"], ["ui", "settings.audioUi"], ["battle", "settings.audioBattle"], ["music", "settings.audioMusic"]
  ] as const;
  controls.forEach(([key, label], index) => {
    const x = 560 + index * 165, width = 135, y = 684;
    let value = getAudioSettings()[key];
    scene.add.text(x, 655, t(label), textStyle);
    const percent = scene.add.text(x + width, 655, "", textStyle).setOrigin(1, 0);
    scene.add.rectangle(x, y, width, 3, palette.dim).setOrigin(0, .5);
    const progress = scene.add.rectangle(x, y, width, 3, palette.white).setOrigin(0, .5);
    const thumb = scene.add.rectangle(x, y, 8, 16, palette.white);
    const hit = scene.add.zone(x + width / 2, y, width + 12, 24)
      .setInteractive({ useHandCursor: true });
    const refresh = () => {
      thumb.setX(x + value * width);
      progress.setDisplaySize(Math.max(.001, value * width), 3);
      percent.setText(`${Math.round(value * 100)}%`);
    };
    refresh();
    bindSliderInput(scene, [hit], {
      coordinate: pointer => pointer.x,
      geometry: () => ({ start: x, end: x + width, thumb: x + value * width, thumbSize: 8 }),
      change: ratio => {
        value = Math.round(ratio * 100) / 100;
        if (value !== getAudioSettings()[key]) {
          setAudioSettings({ [key]: value });
          soundPlayer.applySettings();
        }
        refresh();
      }
    });
  });
}
