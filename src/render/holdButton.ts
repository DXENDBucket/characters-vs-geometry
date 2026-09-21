import Phaser from "phaser";

/** Immediate click, then repeat while the same pointer remains over the button. */
export function bindHoldButton(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, action: () => void, enabled: () => boolean) {
  let pointer: Phaser.Input.Pointer | undefined;
  let elapsed = 0;
  let nextRepeat = 400;
  const cancel = () => { pointer = undefined; };
  const down = (value: Phaser.Input.Pointer) => {
    if (pointer || !value.leftButtonDown() || !enabled()) return;
    pointer = value;
    elapsed = 0;
    nextRepeat = 400;
    action();
  };
  const up = (value: Phaser.Input.Pointer) => { if (value === pointer) cancel(); };
  const update = (_time: number, delta: number) => {
    if (!pointer) return;
    if (!pointer.isDown || !scene.input.enabled || !enabled()) { cancel(); return; }
    elapsed += delta;
    if (elapsed >= nextRepeat) {
      nextRepeat = elapsed + (elapsed >= 1800 ? 65 : 110);
      action();
    }
  };
  target.on("pointerdown", down);
  target.on("pointerout", up);
  scene.input.on("pointerup", up);
  scene.input.on("pointerupoutside", up);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.on(Phaser.Scenes.Events.PAUSE, cancel);
  scene.events.on(Phaser.Scenes.Events.SLEEP, cancel);
  scene.game.events.on(Phaser.Core.Events.BLUR, cancel);
  const destroy = () => {
    cancel();
    target.off("pointerdown", down);
    target.off("pointerout", up);
    target.off(Phaser.GameObjects.Events.DESTROY, destroy);
    scene.input.off("pointerup", up);
    scene.input.off("pointerupoutside", up);
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    scene.events.off(Phaser.Scenes.Events.PAUSE, cancel);
    scene.events.off(Phaser.Scenes.Events.SLEEP, cancel);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
    scene.game.events.off(Phaser.Core.Events.BLUR, cancel);
  };
  target.once(Phaser.GameObjects.Events.DESTROY, destroy);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  return cancel;
}
