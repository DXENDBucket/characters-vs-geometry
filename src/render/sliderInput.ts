import Phaser from "phaser";

interface SliderGeometry {
  start: number;
  end: number;
  thumb: number;
  thumbSize: number;
}

/** Capture one gesture from either the track or thumb, including movement off the track. */
export function bindSliderInput(
  scene: Phaser.Scene,
  targets: Phaser.GameObjects.GameObject[],
  options: {
    coordinate: (pointer: Phaser.Input.Pointer) => number;
    geometry: () => SliderGeometry;
    change: (ratio: number) => void;
    enabled?: () => boolean;
  }
) {
  let active: Phaser.Input.Pointer | undefined;
  let grabOffset = 0;
  const enabled = () => scene.input.enabled && (options.enabled?.() ?? true);
  const cancel = () => { active = undefined; };
  const update = (pointer: Phaser.Input.Pointer) => {
    const { start, end } = options.geometry();
    if (end <= start) return;
    options.change(Phaser.Math.Clamp((options.coordinate(pointer) - grabOffset - start) / (end - start), 0, 1));
  };
  const down = (pointer: Phaser.Input.Pointer) => {
    if (active || !pointer.leftButtonDown() || !enabled()) return;
    active = pointer;
    const coordinate = options.coordinate(pointer);
    const { start, end, thumb, thumbSize } = options.geometry();
    // Keep the grabbed point stable; a track click instead centers the thumb under the pointer.
    grabOffset = Math.abs(coordinate - thumb) <= thumbSize / 2
      ? coordinate - thumb : coordinate - Phaser.Math.Clamp(coordinate, start, end);
    update(pointer);
  };
  const move = (pointer: Phaser.Input.Pointer) => {
    if (active !== pointer) return;
    if (!pointer.isDown || !enabled()) { cancel(); return; }
    update(pointer);
  };
  const up = (pointer: Phaser.Input.Pointer) => {
    if (active !== pointer) return;
    if (enabled()) update(pointer);
    cancel();
  };
  for (const target of targets) target.on("pointerdown", down);
  scene.input.on("pointermove", move);
  scene.input.on("pointerup", up);
  scene.input.on("pointerupoutside", up);
  scene.game.events.on(Phaser.Core.Events.BLUR, cancel);
  scene.events.on(Phaser.Scenes.Events.PAUSE, cancel);
  scene.events.on(Phaser.Scenes.Events.SLEEP, cancel);
  const destroy = () => {
    cancel();
    for (const target of targets) {
      target.off("pointerdown", down);
      target.off(Phaser.GameObjects.Events.DESTROY, destroy);
    }
    scene.input.off("pointermove", move);
    scene.input.off("pointerup", up);
    scene.input.off("pointerupoutside", up);
    scene.game.events.off(Phaser.Core.Events.BLUR, cancel);
    scene.events.off(Phaser.Scenes.Events.PAUSE, cancel);
    scene.events.off(Phaser.Scenes.Events.SLEEP, cancel);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
  };
  for (const target of targets) target.once(Phaser.GameObjects.Events.DESTROY, destroy);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  return destroy;
}
