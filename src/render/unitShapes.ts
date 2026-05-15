import Phaser from "phaser";
import { palette } from "../config";
import { romanLabel, toRomanNumeral } from "../format";
import { enemyFamily, getEnemyDefinition } from "../registry/enemies";
import type { EnemyKind, UnitCategory } from "../types";

interface EnemyShapeOptions {
  squareSize?: number;
  shootingNoseX?: number;
}

export function createUnitBorder(
  scene: Phaser.Scene,
  category: UnitCategory,
  radius: number,
  lineWidth: number
) {
  const border = scene.add.graphics();
  border.fillStyle(palette.black, 1);
  border.lineStyle(lineWidth, palette.white, 1);

  if (category === "production") {
    border.fillCircle(0, 0, radius);
    border.strokeCircle(0, 0, radius);
    return border;
  }

  if (category === "defense") {
    border.fillRect(-radius, -radius, radius * 2, radius * 2);
    border.strokeRect(-radius, -radius, radius * 2, radius * 2);
    return border;
  }

  if (category === "healing") {
    border.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = Phaser.Math.DegToRad(-90 + index * 60);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) {
        border.moveTo(x, y);
      } else {
        border.lineTo(x, y);
      }
    }
    border.closePath();
    border.fillPath();
    border.strokePath();
    return border;
  }

  border.beginPath();
  if (category === "attack") {
    border.moveTo(0, -radius);
    border.lineTo(radius, 0);
    border.lineTo(0, radius);
    border.lineTo(-radius, 0);
  } else {
    border.moveTo(0, -radius);
    border.lineTo(radius, radius * 0.82);
    border.lineTo(-radius, radius * 0.82);
  }
  border.closePath();
  border.fillPath();
  border.strokePath();
  return border;
}

export function createEnemyShape(scene: Phaser.Scene, kind: EnemyKind, options: EnemyShapeOptions = {}) {
  const family = enemyFamily(kind);
  if (family === "circle") {
    const shape = scene.add.container(0, 0);
    const circle = scene.add.circle(0, 0, 20, palette.black, 1).setStrokeStyle(2, palette.white, 1);
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.add([circle, label]);
    return shape;
  }

  if (family === "square") {
    const shape = scene.add.container(0, 0);
    const size = options.squareSize ?? 40;
    const square = scene.add.rectangle(0, 0, size, size, palette.black, 1).setStrokeStyle(2, palette.white, 1);
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.add([square, label]);
    return shape;
  }

  if (family === "shootingTriangle") {
    const shape = scene.add.container(0, 0);
    const triangle = scene.add.graphics();
    triangle.fillStyle(palette.black, 1);
    triangle.lineStyle(2, palette.white, 1);
    triangle.beginPath();
    triangle.moveTo(options.shootingNoseX ?? -22, 0);
    triangle.lineTo(18, -22);
    triangle.lineTo(18, 22);
    triangle.closePath();
    triangle.fillPath();
    triangle.strokePath();
    const label = createEnemyLabel(scene, 2, 0, kind);
    shape.add([triangle, label]);
    return shape;
  }

  if (family === "invertedTriangle") {
    const shape = scene.add.container(0, 0);
    const triangle = scene.add.graphics();
    triangle.fillStyle(palette.black, 1);
    triangle.lineStyle(2, palette.white, 1);
    triangle.beginPath();
    triangle.moveTo(0, 22);
    triangle.lineTo(22, -18);
    triangle.lineTo(-22, -18);
    triangle.closePath();
    triangle.fillPath();
    triangle.strokePath();
    const label = createEnemyLabel(scene, 0, -2, kind);
    shape.add([triangle, label]);
    return shape;
  }

  const shape = scene.add.container(0, 0);
  const triangle = scene.add.graphics();
  triangle.fillStyle(palette.black, 1);
  triangle.lineStyle(2, palette.white, 1);
  triangle.beginPath();
  triangle.moveTo(0, -22);
  triangle.lineTo(22, 18);
  triangle.lineTo(-22, 18);
  triangle.closePath();
  triangle.fillPath();
  triangle.strokePath();
  const label = createEnemyLabel(scene, 0, 2, kind);
  shape.add([triangle, label]);
  return shape;
}

export function createCubeIcon(scene: Phaser.Scene) {
  const icon = scene.add.container(0, 0);
  const frame = scene.add.graphics();
  const front = [
    new Phaser.Math.Vector2(-18, -14),
    new Phaser.Math.Vector2(16, -18),
    new Phaser.Math.Vector2(20, 16),
    new Phaser.Math.Vector2(-14, 20)
  ];
  const back = front.map((point) => new Phaser.Math.Vector2(point.x + 10, point.y - 10));
  frame.lineStyle(2, palette.white, 0.95);
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    frame.lineBetween(front[index].x, front[index].y, front[next].x, front[next].y);
    frame.lineBetween(back[index].x, back[index].y, back[next].x, back[next].y);
    frame.lineBetween(front[index].x, front[index].y, back[index].x, back[index].y);
  }
  const label = scene.add
    .text(4, 0, `${toRomanNumeral(1)}/${toRomanNumeral(2)}`, {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  icon.add([frame, label]);
  return icon;
}

function createEnemyLabel(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind) {
  return scene.add
    .text(x, y, romanLabel(getEnemyDefinition(kind).label), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "18px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
}
