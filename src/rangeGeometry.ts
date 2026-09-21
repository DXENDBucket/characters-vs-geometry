export type RangeCell = readonly [number, number];
export type RangeShape =
  | { kind: "grid"; left: number; right: number; top: number; bottom: number; cutCorners?: boolean; excludeSelf?: boolean }
  | { kind: "cells"; cells: readonly RangeCell[] }
  | { kind: "rectangle"; halfWidth: number; halfHeight: number }
  | { kind: "circle"; radius: number }
  | { kind: "lane"; start: number }
  | { kind: "row"; halfHeight: number }
  | { kind: "column"; halfWidth: number }
  | { kind: "fan"; direction: "up" | "down" | "right"; halfWidth: number; slope: number }
  | { kind: "global" }
  | { kind: "nonSpatial" };

export interface RangeDefinition {
  shape: RangeShape;
  origin?: "self" | "impact";
  label?: { zh: string; en: string };
}

export function rangeContains(shape: RangeShape, x: number, y: number): boolean {
  switch (shape.kind) {
    case "grid": return x >= shape.left && x <= shape.right && y >= shape.top && y <= shape.bottom &&
      !(shape.excludeSelf && x === 0 && y === 0) &&
      !(shape.cutCorners && (x === shape.left || x === shape.right) && (y === shape.top || y === shape.bottom));
    case "cells": return shape.cells.some(([cx, cy]) => x === cx && y === cy);
    case "rectangle": return Math.abs(x) <= shape.halfWidth && Math.abs(y) <= shape.halfHeight;
    case "circle": return x * x + y * y <= shape.radius * shape.radius;
    case "lane": return x >= shape.start && y === 0;
    case "row": return Math.abs(y) <= shape.halfHeight;
    case "column": return Math.abs(x) <= shape.halfWidth;
    case "fan": {
      const distance = shape.direction === "right" ? x : shape.direction === "up" ? -y : y;
      return distance >= 0 && Math.abs(shape.direction === "right" ? y : x) <= shape.halfWidth + shape.slope * distance;
    }
    case "global": return true;
    case "nonSpatial": return false;
  }
}

/** Infinite ranges use a bounded preview with continuation marks, never a fabricated range limit. */
export function rangeDiagram(shape: RangeShape) {
  let left = -2, right = 2, top = -2, bottom = 2;
  const extensions: Array<"left" | "right" | "up" | "down"> = [];
  switch (shape.kind) {
    case "grid": left = shape.left; right = shape.right; top = shape.top; bottom = shape.bottom; break;
    case "cells":
      left = Math.min(0, ...shape.cells.map(cell => cell[0])); right = Math.max(0, ...shape.cells.map(cell => cell[0]));
      top = Math.min(0, ...shape.cells.map(cell => cell[1])); bottom = Math.max(0, ...shape.cells.map(cell => cell[1])); break;
    case "circle": left = top = -Math.ceil(shape.radius); right = bottom = Math.ceil(shape.radius); break;
    case "rectangle": left = -Math.ceil(shape.halfWidth); right = -left; top = -Math.ceil(shape.halfHeight); bottom = -top; break;
    case "lane": left = -1; right = 5; top = -1; bottom = 1; extensions.push("right"); break;
    case "row": left = -3; right = 3; top = -Math.ceil(shape.halfHeight); bottom = -top; extensions.push("left", "right"); break;
    case "column": left = -Math.ceil(shape.halfWidth); right = -left; top = -3; bottom = 3; extensions.push("up", "down"); break;
    case "fan":
      if (shape.direction === "right") {
        left = -1; right = 5; top = -Math.ceil(shape.halfWidth + shape.slope * 5); bottom = -top;
      } else {
        top = shape.direction === "up" ? -5 : -1; bottom = shape.direction === "up" ? 1 : 5;
        left = -Math.ceil(shape.halfWidth + shape.slope * 5); right = -left;
      }
      extensions.push(shape.direction); break;
    case "global": left = -3; right = 3; extensions.push("left", "right", "up", "down"); break;
  }
  left = Math.min(-1, left); right = Math.max(1, right); top = Math.min(-1, top); bottom = Math.max(1, bottom);
  const cells: RangeCell[] = [];
  if (shape.kind !== "nonSpatial") for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (rangeContains(shape, x, y)) cells.push([x, y]);
  }
  return { left, right, top, bottom, cells, extensions };
}
