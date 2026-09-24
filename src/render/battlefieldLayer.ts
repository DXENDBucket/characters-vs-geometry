import Phaser from "phaser";
import { BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, CELL_WIDTH, GAME_WIDTH, GAME_HEIGHT, BATTLE_STATUS_Y, BATTLE_PROGRESS_Y } from "../config";

const VERTICAL_MARGIN = Math.max(BOARD_Y - BATTLE_STATUS_Y, BATTLE_PROGRESS_Y - (BOARD_Y + BOARD_HEIGHT));
export const BATTLEFIELD_RIGHT_MARGIN = CELL_WIDTH * 2;
export const BATTLE_CANVAS_WIDTH = Math.max(GAME_WIDTH, BOARD_X + BOARD_WIDTH + BATTLEFIELD_RIGHT_MARGIN);

export const BATTLEFIELD_VIEWPORT = {
  // The baseline is 20px left of the grid; keep 12px beyond it, up to the card rail.
  x: BOARD_X - 32, y: BOARD_Y - VERTICAL_MARGIN,
  width: BOARD_WIDTH + 32 + BATTLEFIELD_RIGHT_MARGIN, height: BOARD_HEIGHT + VERTICAL_MARGIN * 2
} as const;

export function useBattlefieldCanvas(scene: Phaser.Scene) {
  const previous = { width: scene.scale.width, height: scene.scale.height };
  // FIT keeps input in unchanged board coordinates while making room for enemy entry.
  scene.scale.setGameSize(BATTLE_CANVAS_WIDTH, GAME_HEIGHT);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.setGameSize(previous.width, previous.height);
  });
}

/** New battle visuals default to the clipped world; UI factories explicitly opt out. */
export class BattlefieldLayer {
  readonly worldLayer: Phaser.GameObjects.Layer;
  readonly uiLayer: Phaser.GameObjects.Layer;
  private readonly maskGraphics: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.Display.Masks.GeometryMask;
  private creatingUi = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.worldLayer = scene.add.layer().setDepth(1).setName("battlefield-world");
    this.uiLayer = scene.add.layer().setDepth(2).setName("battlefield-ui");
    this.maskGraphics = new Phaser.GameObjects.Graphics(scene);
    const { x, y, width, height } = BATTLEFIELD_VIEWPORT;
    this.maskGraphics.fillStyle(0xffffff).fillRect(x, y, width, height);
    this.mask = this.maskGraphics.createGeometryMask();
    this.worldLayer.setMask(this.mask);
    scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.routeVisual, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  ui<T>(create: () => T): T { return this.withScope(true, create); }
  world<T>(create: () => T): T { return this.withScope(false, create); }

  private withScope<T>(ui: boolean, create: () => T): T {
    const previous = this.creatingUi;
    this.creatingUi = ui;
    try { return create(); } finally { this.creatingUi = previous; }
  }

  private routeVisual(object: Phaser.GameObjects.GameObject) {
    // Moving into a Layer also emits ADDED_TO_SCENE. Only route new top-level objects.
    if (object.displayList !== this.scene.children || object.parentContainer ||
      !this.worldLayer.scene || !this.uiLayer.scene) return;
    (this.creatingUi ? this.uiLayer : this.worldLayer).add(object);
  }

  private destroy() {
    this.scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.routeVisual, this);
    this.worldLayer.clearMask();
    this.mask.destroy();
    this.maskGraphics.destroy();
  }
}
