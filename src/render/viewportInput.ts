import Phaser from "phaser";

/** Geometry masks clip rendering, not Phaser input hit areas. */
export function clipInputToViewport(
  target: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text,
  viewport: Phaser.Geom.Rectangle
) {
  const input = target.input!;
  const original = input.hitAreaCallback;
  const point = new Phaser.Math.Vector2();
  input.hitAreaCallback = (area, x, y, object) => {
    if (!original(area, x, y, object)) return false;
    target.getWorldTransformMatrix().transformPoint(x - target.displayOriginX, y - target.displayOriginY, point);
    return viewport.contains(point.x, point.y);
  };
}
