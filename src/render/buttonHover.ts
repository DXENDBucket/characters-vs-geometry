import Phaser from "phaser";
import { palette } from "../config";

/** Keep hover feedback separate from persistent selection and cooldown styling. */
export function bindButtonHover(
  frame: Phaser.GameObjects.Rectangle,
  labels: Phaser.GameObjects.GameObject[] = [],
  enabled: () => boolean = () => true
) {
  const scene = frame.scene;
  const targets = [frame, ...labels];
  const hovered = new Set<Phaser.GameObjects.GameObject>();
  let outline: Phaser.GameObjects.Rectangle | undefined;
  let outsideCanvas = false;
  const leaveCanvas = () => {
    outsideCanvas = true;
    outline?.setVisible(false);
  };
  const enterCanvas = () => {
    outsideCanvas = false;
    refresh();
  };
  const clear = () => {
    hovered.clear();
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, refresh);
    scene.input.off(Phaser.Input.Events.GAME_OUT, leaveCanvas);
    scene.input.off(Phaser.Input.Events.GAME_OVER, enterCanvas);
    outline?.setVisible(false);
  };
  const refresh = () => {
    const visible = !outsideCanvas && hovered.size > 0 && scene.input.enabled && frame.active && frame.visible && frame.input?.enabled && enabled();
    if (!visible) {
      outline?.setVisible(false);
      return;
    }
    if (!outline) {
      outline = scene.add.rectangle(0, 0, frame.width, frame.height)
        .setName("button-hover").setStrokeStyle(2, palette.green);
      frame.parentContainer?.add(outline);
    }
    if (outline.width !== frame.width || outline.height !== frame.height) outline.setSize(frame.width, frame.height);
    outline.setPosition(frame.x, frame.y)
      .setOrigin(frame.originX, frame.originY).setScale(frame.scaleX, frame.scaleY)
      .setRotation(frame.rotation).setDepth(frame.depth + 0.01).setAlpha(frame.alpha).setVisible(true);
  };
  const bindings = targets.map((target) => {
    const over = () => {
      outsideCanvas = false;
      if (!hovered.size) {
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, refresh);
        scene.input.on(Phaser.Input.Events.GAME_OUT, leaveCanvas);
        scene.input.on(Phaser.Input.Events.GAME_OVER, enterCanvas);
      }
      hovered.add(target);
      refresh();
    };
    const out = () => {
      hovered.delete(target);
      if (!hovered.size) clear();
      refresh();
    };
    target.on("pointerover", over).on("pointerout", out);
    return { target, over, out };
  });
  const destroy = () => {
    clear();
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
    for (const { target, over, out } of bindings) {
      target.off("pointerover", over).off("pointerout", out);
    }
    outline?.destroy();
    outline = undefined;
  };
  frame.once(Phaser.GameObjects.Events.DESTROY, destroy);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
}
