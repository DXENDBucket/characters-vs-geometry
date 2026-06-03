import Phaser from "phaser";
import {
  DODECAHEDRON_EDGES,
  DODECAHEDRON_UNIT_VERTICES,
  OCTAHEDRON_EDGES,
  OCTAHEDRON_UNIT_VERTICES,
  SMALL_STELLATED_DODECAHEDRON_SPIKES
} from "../bosses/cubeBoss";
import { palette } from "../config";
import { romanLabel, toRomanNumeral } from "../format";
import { enemyFamily, getEnemyDefinition } from "../registry/enemies";
import type { EnemyKind, UnitCategory } from "../types";

const DODECAHEDRON_COMPANION_DRAW_SIZE = 18;

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
  if (family === "dodecahedronCompanion") {
    const shape = scene.add.container(0, 0);
    const frame = scene.add.graphics();
    const label = scene.add
      .text(0, 0, toRomanNumeral(1), {
        color: "#f5f5f5",
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "700"
    })
      .setOrigin(0.5);
    drawDodecahedronCompanionFrame(frame, -0.42, 0.62, -0.12);
    shape.setData("dodecahedronFrame", frame);
    shape.setData("dodecahedronLabel", label);
    shape.add([frame, label]);
    return shape;
  }

  if (family === "circle") {
    const shape = scene.add.container(0, 0);
    const circle = scene.add.circle(0, 0, 20, palette.black, 1).setStrokeStyle(2, palette.white, 1);
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.add([circle, label]);
    return shape;
  }

  if (family === "solarBomb") {
    const shape = scene.add.container(0, 0);
    const frame = scene.add.graphics();
    drawSolarBombFrame(frame, palette.white);
    shape.setData("solarBombFrame", frame);
    shape.add(frame);
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

  if (family === "triangleRam") {
    const shape = scene.add.container(0, 0);
    const triangles = scene.add.graphics();
    triangles.fillStyle(palette.black, 1);
    triangles.lineStyle(2, palette.white, 1);
    triangles.beginPath();
    triangles.moveTo(-28, 0);
    triangles.lineTo(0, -22);
    triangles.lineTo(0, 22);
    triangles.closePath();
    triangles.fillPath();
    triangles.strokePath();
    triangles.beginPath();
    triangles.moveTo(28, 0);
    triangles.lineTo(0, -22);
    triangles.lineTo(0, 22);
    triangles.closePath();
    triangles.fillPath();
    triangles.strokePath();
    const leftLabel = createEnemyLabel(scene, -9, 0, kind, 15);
    const rightLabel = createEnemyLabel(scene, 9, 0, kind, 15);
    shape.add([triangles, leftLabel, rightLabel]);
    return shape;
  }

  if (family === "angelPentagonRam") {
    const shape = scene.add.container(0, 0);
    const pentagons = scene.add.graphics();
    pentagons.fillStyle(palette.black, 1);
    pentagons.lineStyle(2, palette.white, 1);
    drawPentagonPath(pentagons, -18, 0, 24, 180);
    pentagons.fillPath();
    pentagons.strokePath();
    drawPentagonPath(pentagons, 18, 0, 24, 0);
    pentagons.fillPath();
    pentagons.strokePath();
    const leftLabel = createEnemyLabel(scene, -18, -1, kind, 15);
    const rightLabel = createEnemyLabel(scene, 18, -1, kind, 15);
    shape.add([pentagons, leftLabel, rightLabel]);
    return shape;
  }

  if (family === "mortarTriangle") {
    const shape = scene.add.container(0, 0);
    const triangles = scene.add.graphics();
    triangles.fillStyle(palette.black, 1);
    triangles.lineStyle(2, palette.white, 1);
    triangles.beginPath();
    triangles.moveTo(0, -28);
    triangles.lineTo(-22, 0);
    triangles.lineTo(22, 0);
    triangles.closePath();
    triangles.fillPath();
    triangles.strokePath();
    triangles.beginPath();
    triangles.moveTo(0, 28);
    triangles.lineTo(-22, 0);
    triangles.lineTo(22, 0);
    triangles.closePath();
    triangles.fillPath();
    triangles.strokePath();
    const topLabel = createEnemyLabel(scene, 0, -9, kind, 15);
    const bottomLabel = createEnemyLabel(scene, 0, 9, kind, 15);
    shape.add([triangles, topLabel, bottomLabel]);
    return shape;
  }

  if (family === "diamond") {
    const shape = scene.add.container(0, 0);
    const diamond = scene.add.graphics();
    diamond.fillStyle(palette.black, 1);
    diamond.lineStyle(2, palette.white, 1);
    diamond.beginPath();
    diamond.moveTo(0, -25);
    diamond.lineTo(25, 0);
    diamond.lineTo(0, 25);
    diamond.lineTo(-25, 0);
    diamond.closePath();
    diamond.fillPath();
    diamond.strokePath();
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.add([diamond, label]);
    return shape;
  }

  if (family === "pentagon") {
    const shape = scene.add.container(0, 0);
    const pentagon = scene.add.graphics();
    pentagon.fillStyle(palette.black, 1);
    pentagon.lineStyle(2, palette.white, 1);
    pentagon.beginPath();
    const radius = 25;
    for (let index = 0; index < 5; index += 1) {
      const angle = Phaser.Math.DegToRad(54 + index * 72);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) {
        pentagon.moveTo(x, y);
      } else {
        pentagon.lineTo(x, y);
      }
    }
    pentagon.closePath();
    pentagon.fillPath();
    pentagon.strokePath();
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.add([pentagon, label]);
    return shape;
  }

  if (family === "angelPentagon") {
    const shape = scene.add.container(0, 0);
    const pentagon = scene.add.graphics();
    pentagon.fillStyle(palette.black, 1);
    pentagon.lineStyle(2, palette.white, 1);
    pentagon.beginPath();
    const radius = 25;
    for (let index = 0; index < 5; index += 1) {
      const angle = Phaser.Math.DegToRad(90 + index * 72);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) {
        pentagon.moveTo(x, y);
      } else {
        pentagon.lineTo(x, y);
      }
    }
    pentagon.closePath();
    pentagon.fillPath();
    pentagon.strokePath();
    const halo = scene.add.ellipse(0, -34, 25, 7, palette.black, 0).setStrokeStyle(2, palette.white, 0.95);
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.add([halo, pentagon, label]);
    return shape;
  }

  if (family === "archangelHeptagon") {
    const shape = scene.add.container(0, 0);
    const heptagon = scene.add.graphics();
    heptagon.fillStyle(palette.black, 1);
    heptagon.lineStyle(2, palette.white, 1);
    heptagon.beginPath();
    const radius = 27;
    for (let index = 0; index < 7; index += 1) {
      const angle = Phaser.Math.DegToRad(90 + index * (360 / 7));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) {
        heptagon.moveTo(x, y);
      } else {
        heptagon.lineTo(x, y);
      }
    }
    heptagon.closePath();
    heptagon.fillPath();
    heptagon.strokePath();
    const outerHalo = scene.add.ellipse(0, -43, 37, 9, palette.black, 0).setStrokeStyle(2, palette.white, 0.86);
    const innerHalo = scene.add.ellipse(0, -34, 27, 7, palette.black, 0).setStrokeStyle(2, palette.white, 0.95);
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.setData("archangelHalos", [outerHalo, innerHalo]);
    shape.add([outerHalo, innerHalo, heptagon, label]);
    return shape;
  }

  if (family === "shootingPentagon") {
    const shape = scene.add.container(0, 0);
    const pentagon = scene.add.graphics();
    pentagon.fillStyle(palette.black, 1);
    pentagon.lineStyle(2, palette.white, 1);
    pentagon.beginPath();
    const radius = 25;
    for (let index = 0; index < 5; index += 1) {
      const angle = Phaser.Math.DegToRad(180 + index * 72);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) {
        pentagon.moveTo(x, y);
      } else {
        pentagon.lineTo(x, y);
      }
    }
    pentagon.closePath();
    pentagon.fillPath();
    pentagon.strokePath();
    const label = createEnemyLabel(scene, 2, -1, kind);
    shape.add([pentagon, label]);
    return shape;
  }

  if (family === "hexagon") {
    const shape = scene.add.container(0, 0);
    const hexagon = scene.add.graphics();
    hexagon.fillStyle(palette.black, 1);
    hexagon.lineStyle(2, palette.white, 1);
    hexagon.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = Phaser.Math.DegToRad(30 + index * 60);
      const x = Math.cos(angle) * 25;
      const y = Math.sin(angle) * 25;
      if (index === 0) {
        hexagon.moveTo(x, y);
      } else {
        hexagon.lineTo(x, y);
      }
    }
    hexagon.closePath();
    hexagon.fillPath();
    hexagon.strokePath();
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.add([hexagon, label]);
    return shape;
  }

  if (family === "chargingHexagon") {
    const shape = scene.add.container(0, 0);
    const hexagon = scene.add.graphics();
    hexagon.fillStyle(palette.black, 1);
    hexagon.lineStyle(2, palette.white, 1);
    hexagon.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = Phaser.Math.DegToRad(180 + index * 60);
      const x = Math.cos(angle) * 27;
      const y = Math.sin(angle) * 27;
      if (index === 0) {
        hexagon.moveTo(x, y);
      } else {
        hexagon.lineTo(x, y);
      }
    }
    hexagon.closePath();
    hexagon.fillPath();
    hexagon.strokePath();
    const label = createEnemyLabel(scene, 1, -1, kind);
    shape.add([hexagon, label]);
    return shape;
  }

  if (family === "hexMace") {
    const shape = scene.add.container(0, 0);
    const mace = scene.add.graphics();
    mace.fillStyle(palette.black, 1);
    mace.lineStyle(2, palette.white, 1);
    for (const centerX of [-22, 22]) {
      mace.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = Phaser.Math.DegToRad(30 + index * 60);
        const x = centerX + Math.cos(angle) * 25;
        const y = Math.sin(angle) * 25;
        if (index === 0) {
          mace.moveTo(x, y);
        } else {
          mace.lineTo(x, y);
        }
      }
      mace.closePath();
      mace.fillPath();
      mace.strokePath();
    }
    const leftLabel = createEnemyLabel(scene, -22, -1, kind, 15);
    const rightLabel = createEnemyLabel(scene, 22, -1, kind, 15);
    shape.add([mace, leftLabel, rightLabel]);
    return shape;
  }

  if (family === "hexSpellBulwark") {
    const shape = scene.add.container(0, 0);
    const bulwark = scene.add.graphics();
    const radius = 25;
    const centerOffsetY = Math.sin(Phaser.Math.DegToRad(60)) * radius;
    bulwark.fillStyle(palette.black, 1);
    bulwark.lineStyle(2, palette.white, 1);
    for (const centerY of [-centerOffsetY, centerOffsetY]) {
      bulwark.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = Phaser.Math.DegToRad(index * 60);
        const x = Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (index === 0) {
          bulwark.moveTo(x, y);
        } else {
          bulwark.lineTo(x, y);
        }
      }
      bulwark.closePath();
      bulwark.fillPath();
      bulwark.strokePath();
    }
    const topLabel = createEnemyLabel(scene, 0, -centerOffsetY, kind, 15);
    const bottomLabel = createEnemyLabel(scene, 0, centerOffsetY, kind, 15);
    shape.add([bulwark, topLabel, bottomLabel]);
    return shape;
  }

  if (family === "heart") {
    const shape = scene.add.container(0, 0);
    const heart = scene.add.graphics();
    heart.fillStyle(palette.black, 1);
    heart.lineStyle(2, palette.heart, 1);
    heart.beginPath();
    for (let index = 0; index <= 48; index += 1) {
      const t = (Math.PI * 2 * index) / 48;
      const x = 1.65 * 16 * Math.sin(t) ** 3;
      const y = -1.65 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + 3;
      if (index === 0) {
        heart.moveTo(x, y);
      } else {
        heart.lineTo(x, y);
      }
    }
    heart.closePath();
    heart.fillPath();
    heart.strokePath();
    const label = createEnemyLabel(scene, 0, 5, kind, 18, "#ff7eb6");
    shape.add([heart, label]);
    return shape;
  }

  if (family === "burrowArrow") {
    const shape = scene.add.container(0, 0);
    const arrow = scene.add.graphics();
    arrow.fillStyle(palette.black, 1);
    arrow.lineStyle(2, palette.white, 1);
    arrow.beginPath();
    arrow.moveTo(-30, 0);
    arrow.lineTo(-7, -26);
    arrow.lineTo(-2, -10);
    arrow.lineTo(26, -10);
    arrow.lineTo(12, 0);
    arrow.lineTo(26, 10);
    arrow.lineTo(-2, 10);
    arrow.lineTo(-7, 26);
    arrow.closePath();
    arrow.fillPath();
    arrow.strokePath();
    arrow.lineStyle(1, palette.white, 0.52);
    arrow.lineBetween(-7, -26, 12, 0);
    arrow.lineBetween(-7, 26, 12, 0);
    const label = createEnemyLabel(scene, -4, 0, kind);
    const tip = scene.add.graphics();
    tip.fillStyle(palette.black, 1);
    tip.lineStyle(2, palette.white, 1);
    tip.beginPath();
    tip.moveTo(0, -27);
    tip.lineTo(10, -11);
    tip.lineTo(-10, -11);
    tip.closePath();
    tip.fillPath();
    tip.strokePath();
    tip.setVisible(false);
    shape.setData("burrowFull", [arrow, label]);
    shape.setData("burrowTip", tip);
    shape.add([arrow, label, tip]);
    return shape;
  }

  if (family === "slopeTriangle") {
    const shape = scene.add.container(0, 0);
    const triangle = scene.add.graphics();
    triangle.fillStyle(palette.black, 1);
    triangle.lineStyle(2, palette.white, 1);
    triangle.beginPath();
    triangle.moveTo(-30, 28);
    triangle.lineTo(-30, -28);
    triangle.lineTo(28, 28);
    triangle.closePath();
    triangle.fillPath();
    triangle.strokePath();
    const label = createEnemyLabel(scene, -13, 9, kind, 18);
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

  if (family === "trapezoid") {
    const shape = scene.add.container(0, 0);
    const trapezoid = scene.add.graphics();
    trapezoid.fillStyle(palette.black, 1);
    trapezoid.lineStyle(2, palette.white, 1);
    trapezoid.beginPath();
    trapezoid.moveTo(-18, -22);
    trapezoid.lineTo(18, -22);
    trapezoid.lineTo(28, 22);
    trapezoid.lineTo(-28, 22);
    trapezoid.closePath();
    trapezoid.fillPath();
    trapezoid.strokePath();
    const label = createEnemyLabel(scene, 0, -1, kind);
    shape.add([trapezoid, label]);
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

export function createTetrahedronIcon(scene: Phaser.Scene) {
  const icon = scene.add.container(0, 0);
  const frame = scene.add.graphics();
  const points = [
    new Phaser.Math.Vector2(0, -22),
    new Phaser.Math.Vector2(-22, 17),
    new Phaser.Math.Vector2(24, 15),
    new Phaser.Math.Vector2(7, 5)
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3]
  ];
  frame.lineStyle(2, palette.white, 0.95);
  for (const [from, to] of edges) {
    frame.lineBetween(points[from].x, points[from].y, points[to].x, points[to].y);
  }
  const label = scene.add
    .text(2, 0, toRomanNumeral(1), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  icon.add([frame, label]);
  return icon;
}

export function createDodecahedronIcon(scene: Phaser.Scene) {
  const icon = scene.add.container(0, 0);
  const frame = scene.add.graphics();
  const vertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectIconPoint(x * 15, y * 15, z * 15, -0.42, 0.62, -0.12)
  );

  frame.lineStyle(1.6, palette.white, 0.95);
  for (const [from, to] of DODECAHEDRON_EDGES) {
    frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }

  const label = scene.add
    .text(0, 0, toRomanNumeral(1), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  icon.add([frame, label]);
  return icon;
}

export function syncDodecahedronCompanionShape(
  shape: Phaser.GameObjects.GameObject,
  rotation: { rotationX: number; rotationY: number; rotationZ: number },
  invincible = false
) {
  const frame = shape.getData("dodecahedronFrame") as Phaser.GameObjects.Graphics | undefined;
  if (!frame) {
    return;
  }

  const label = shape.getData("dodecahedronLabel") as Phaser.GameObjects.Text | undefined;
  const color = invincible ? palette.gold : palette.white;
  drawDodecahedronCompanionFrame(frame, rotation.rotationX, rotation.rotationY, rotation.rotationZ, color);
  label?.setColor(invincible ? "#ffd75a" : "#f5f5f5");
}

function drawDodecahedronCompanionFrame(
  frame: Phaser.GameObjects.Graphics,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  color = palette.white
) {
  const vertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectIconPoint(
      x * DODECAHEDRON_COMPANION_DRAW_SIZE,
      y * DODECAHEDRON_COMPANION_DRAW_SIZE,
      z * DODECAHEDRON_COMPANION_DRAW_SIZE,
      rotationX,
      rotationY,
      rotationZ
    )
  );

  frame.clear();
  frame.lineStyle(1.7, color, 0.95);
  for (const [from, to] of DODECAHEDRON_EDGES) {
    frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

export function createSmallStellatedDodecahedronIcon(scene: Phaser.Scene) {
  const icon = scene.add.container(0, 0);
  const frame = scene.add.graphics();
  const baseVertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectIconPoint(x * 10, y * 10, z * 10, -0.42, 0.62, -0.12)
  );
  const spikeTips = SMALL_STELLATED_DODECAHEDRON_SPIKES.map(({ tip }) =>
    projectIconPoint(tip[0] * 10, tip[1] * 10, tip[2] * 10, -0.42, 0.62, -0.12)
  );

  frame.lineStyle(1.1, palette.white, 0.35);
  for (const [from, to] of DODECAHEDRON_EDGES) {
    frame.lineBetween(baseVertices[from].x, baseVertices[from].y, baseVertices[to].x, baseVertices[to].y);
  }

  frame.lineStyle(1.5, palette.white, 0.95);
  SMALL_STELLATED_DODECAHEDRON_SPIKES.forEach(({ face }, index) => {
    const tip = spikeTips[index];
    for (const vertexIndex of face) {
      const vertex = baseVertices[vertexIndex];
      frame.lineBetween(tip.x, tip.y, vertex.x, vertex.y);
    }
  });

  const label = scene.add
    .text(0, 0, toRomanNumeral(1), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  icon.add([frame, label]);
  return icon;
}

export function createOctahedronIcon(scene: Phaser.Scene) {
  const icon = scene.add.container(0, 0);
  const frame = scene.add.graphics();
  const vertices = OCTAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectIconPoint(x * 23, y * 23, z * 23, -0.42, 0.62, -0.12)
  );

  frame.lineStyle(1.8, palette.white, 0.95);
  for (const [from, to] of OCTAHEDRON_EDGES) {
    frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }

  const label = scene.add
    .text(0, 0, toRomanNumeral(1), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  icon.add([frame, label]);
  return icon;
}

export function syncSolarBombShape(shape: Phaser.GameObjects.GameObject, color: number) {
  const frame = shape.getData("solarBombFrame") as Phaser.GameObjects.Graphics | undefined;
  if (!frame) {
    return;
  }

  frame.clear();
  drawSolarBombFrame(frame, color);
}

function drawSolarBombFrame(frame: Phaser.GameObjects.Graphics, color: number) {
  const triangleRadius = 38;
  const circleRadius = 24;
  frame.fillStyle(palette.black, 1);
  frame.lineStyle(2, color, 1);
  frame.beginPath();
  for (let index = 0; index < 3; index += 1) {
    const angle = Phaser.Math.DegToRad(-90 + index * 120);
    const x = Math.cos(angle) * triangleRadius;
    const y = Math.sin(angle) * triangleRadius;
    if (index === 0) {
      frame.moveTo(x, y);
    } else {
      frame.lineTo(x, y);
    }
  }
  frame.closePath();
  frame.fillPath();
  frame.strokePath();
  frame.fillStyle(palette.black, 1);
  frame.lineStyle(2, color, 1);
  frame.fillCircle(0, 0, circleRadius);
  frame.strokeCircle(0, 0, circleRadius);
}

function projectIconPoint(x: number, y: number, z: number, rotationX: number, rotationY: number, rotationZ: number) {
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const cosZ = Math.cos(rotationZ);
  const sinZ = Math.sin(rotationZ);

  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;
  const x2 = x * cosY + z1 * sinY;
  const z2 = -x * sinY + z1 * cosY;
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;
  const scale = 1.35 / (1 + z2 / 120);
  return { x: x3 * scale, y: y3 * scale };
}

function createEnemyLabel(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, size = 18, color = "#f5f5f5") {
  const label = romanLabel(getEnemyDefinition(kind).label);

  return scene.add
    .text(x, y, label, {
      color,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: `${size}px`,
      fontStyle: "bold"
    })
    .setOrigin(0.5)
    .setScale(0.64, 1);
}

function drawPentagonPath(
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  rotationDegrees: number
) {
  graphics.beginPath();
  for (let index = 0; index < 5; index += 1) {
    const angle = Phaser.Math.DegToRad(rotationDegrees + index * 72);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) {
      graphics.moveTo(x, y);
    } else {
      graphics.lineTo(x, y);
    }
  }
  graphics.closePath();
}
