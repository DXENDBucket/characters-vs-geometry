import { getLanguage } from "./i18n";
import { rangeDiagram, type RangeDefinition } from "./rangeGeometry";

export interface DetailRange extends RangeDefinition {
  caption: string;
  labelText: string;
  diagram: ReturnType<typeof rangeDiagram>;
}

const l = (zh: string, en: string) => getLanguage() === "zh-CN" ? zh : en;
const n = (value: number) => `${Number(value.toFixed(2))}`;

export function detailRange(range: RangeDefinition, caption = l("作用范围", "Range")): DetailRange {
  return { ...range, caption, labelText: rangeLabel(range), diagram: rangeDiagram(range.shape) };
}

export function rangeLabel(range: RangeDefinition): string {
  if (range.label) return l(range.label.zh, range.label.en);
  const s = range.shape;
  switch (s.kind) {
    case "grid": {
      const width = s.right - s.left + 1, height = s.bottom - s.top + 1;
      let text = s.left === -s.right && s.top === -s.bottom
        ? l(`自身中心 ${width}×${height}`, `Centered ${width}x${height}`)
        : s.left === 0 && s.top === 0 && s.bottom === 0
          ? l(`本行，自身至前方 ${s.right} 格`, `Own cell and ${s.right} cells ahead`)
          : l(`${height} 行，身后 ${-s.left} 格至前方 ${s.right} 格`, `${height} lanes, ${-s.left} cells behind to ${s.right} ahead`);
      if (s.cutCorners) text += l("，去四角", ", corners excluded");
      if (s.excludeSelf) text += l("，不含自身", ", excluding self");
      return text;
    }
    case "circle": return l(`半径 ${n(s.radius)} 格`, `${n(s.radius)}-cell radius`);
    case "rectangle": return l(`${n(s.halfWidth * 2)}×${n(s.halfHeight * 2)} 格区域`, `${n(s.halfWidth * 2)}x${n(s.halfHeight * 2)}-cell area`);
    case "column": return l(`全列，宽 ${n(s.halfWidth * 2)} 格`, `Entire column, ${n(s.halfWidth * 2)} cells wide`);
    case "row": return l(`全行，高 ${n(s.halfHeight * 2)} 格`, `Entire row, ${n(s.halfHeight * 2)} cells high`);
    case "lane": return (s.halfHeight ?? 0) > 0
      ? l(`前方 ${n(Math.floor(s.halfHeight!) * 2 + 1)} 行，至场地边界`, `${n(Math.floor(s.halfHeight!) * 2 + 1)} forward lanes to the board edge`)
      : l("本行前方，至场地边界", "Forward lane to the board edge");
    case "fan": return s.direction === "right" ? l("前方扇形，至场地边界", "Forward fan to the board edge")
      : s.direction === "up" ? l("向上扇形，至场地边界", "Upward fan to the board edge") : l("向下扇形，至场地边界", "Downward fan to the board edge");
    case "global": return l("全场", "Entire battlefield");
    case "cells": return l(`${s.cells.length} 个指定格`, `${s.cells.length} specified cells`);
    case "nonSpatial": return l("无空间范围", "Non-spatial");
  }
}
