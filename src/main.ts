import Phaser from "phaser";
import "./styles.css";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { CardSelectScene } from "./scenes/CardSelectScene";
import { ChapterSelectScene } from "./scenes/ChapterSelectScene";
import { ChapterGroupSelectScene } from "./scenes/ChapterGroupSelectScene";
import { GameScene } from "./scenes/GameScene";
import { LevelSelectScene } from "./scenes/LevelSelectScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { EncyclopediaScene } from "./scenes/EncyclopediaScene";
import { TextQualityPlugin } from "./render/textQuality";
import { recoverSaveImport } from "./saveArchive";

try { recoverSaveImport(); } catch (error) { console.error("Save recovery is pending", error); }

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: false,
  plugins: {
    scene: [{ key: "TextQuality", plugin: TextQualityPlugin, start: true }]
  },
  scene: [MainMenuScene, ChapterGroupSelectScene, ChapterSelectScene, LevelSelectScene, SettingsScene, EncyclopediaScene, CardSelectScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true
  },
  render: {
    antialias: true,
    roundPixels: true
  }
});

window.addEventListener("contextmenu", (event) => event.preventDefault());

window.charsetDesktop?.onBeforeClose(() => {
  const battle = game.scene.getScene("GameScene") as GameScene;
  if (!battle || (!battle.scene.isActive() && !battle.scene.isPaused())) return true;
  return battle.prepareDesktopClose();
});
