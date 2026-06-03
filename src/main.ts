import Phaser from "phaser";
import "./styles.css";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { CardSelectScene } from "./scenes/CardSelectScene";
import { ChapterSelectScene } from "./scenes/ChapterSelectScene";
import { GameScene } from "./scenes/GameScene";
import { LevelSelectScene } from "./scenes/LevelSelectScene";
import { SettingsScene } from "./scenes/SettingsScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  scene: [ChapterSelectScene, LevelSelectScene, SettingsScene, CardSelectScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true
  },
  render: {
    antialias: false,
    roundPixels: true
  }
});

window.addEventListener("contextmenu", (event) => event.preventDefault());
