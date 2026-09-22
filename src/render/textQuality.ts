import Phaser from "phaser";
import { MAX_RENDER_SCALE } from "./renderResolution";

const TEXT_RESOLUTION = MAX_RENDER_SCALE;

/** Text textures cover the maximum framebuffer scale without changing their logical dimensions. */
export class TextQualityPlugin extends Phaser.Plugins.ScenePlugin {
  boot() {
    this.systems?.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
    this.systems?.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  private onAdded(object: Phaser.GameObjects.GameObject) {
    if (object instanceof Phaser.GameObjects.Text && object.style.resolution < TEXT_RESOLUTION) {
      object.setResolution(TEXT_RESOLUTION);
    }
  }

  destroy() {
    this.systems?.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
    this.systems?.events.off(Phaser.Scenes.Events.DESTROY, this.destroy, this);
    super.destroy();
  }
}
