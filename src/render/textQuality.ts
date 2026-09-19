import Phaser from "phaser";

const TEXT_RESOLUTION = 2;

/** Supersample text without enlarging the battlefield framebuffer or changing input coordinates. */
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
