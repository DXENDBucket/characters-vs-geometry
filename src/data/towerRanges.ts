import { CELL_HEIGHT, CELL_WIDTH } from "../config";
import { TOWER_SKILLS } from "./towerAbilities";
import { getCardAttackArea } from "../game/cardAttackConfigs";
import type { CardDefinition, CardId } from "../types";
import type { RangeDefinition } from "../rangeGeometry";

export interface TowerRanges {
  attack?: RangeDefinition;
  skill?: RangeDefinition;
  aura?: RangeDefinition;
  passive?: RangeDefinition;
  impact?: RangeDefinition;
}

const self: RangeDefinition = { shape: { kind: "cells", cells: [[0, 0]] }, label: { zh: "自身", en: "Self" } };
const contact: RangeDefinition = { ...self, label: { zh: "接触／阻挡目标", en: "Contact / blocked target" } };
const adjacent: RangeDefinition = { shape: { kind: "cells", cells: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, label: { zh: "上下左右相邻格", en: "Four adjacent cells" } };
const centered3 = { shape: { kind: "grid", left: -1, right: 1, top: -1, bottom: 1 } } satisfies RangeDefinition;
const centered5: RangeDefinition = { shape: { kind: "grid", left: -2, right: 2, top: -2, bottom: 2, cutCorners: true } };
const global: RangeDefinition = { shape: { kind: "global" } };

// Roles are separate: an aura is not a regular attack and a splash is not a targeting range.
export const towerRangeDefinitions: Partial<Record<CardId, TowerRanges>> = {
  e: { attack: centered5, aura: centered5 }, g: { attack: centered3, aura: centered3 },
  H: { attack: centered3 }, p: { attack: centered3 }, h: { skill: TOWER_SKILLS.h.range },
  T: { attack: self, aura: centered5 }, o: { skill: TOWER_SKILLS.o.range },
  U: { aura: { shape: { ...centered3.shape, excludeSelf: true } } },
  P: { attack: { shape: { kind: "grid", left: -3, right: 4, top: -1, bottom: 1 } } },
  k: { attack: { shape: { kind: "cells", cells: [[0, -1], [1, -1], [0, 0], [1, 0], [2, 0], [0, 1], [1, 1]] }, label: { zh: "前方七格区域", en: "Seven-cell forward area" } } },
  m: { passive: adjacent }, u: { passive: adjacent }, "#": { skill: TOWER_SKILLS["#"].range },
  "@": { passive: { shape: { kind: "cells", cells: [[1, 0]] }, label: { zh: "朝向前方一格", en: "One cell ahead" } } },
  X: { attack: self }, Y: { passive: self }, w: { skill: TOWER_SKILLS.w.range },
  B: { passive: contact }, G: { skill: contact }, N: { attack: contact }, q: { attack: contact },
  j: { skill: TOWER_SKILLS.j.range },
  L: { attack: { shape: { kind: "cells", cells: [[0, -1], [1, -1], [0, 1], [1, 1]] }, label: { zh: "上下相邻行，自身列与前方一列", en: "Adjacent lanes, own column and next column" } } },
  n: { attack: { shape: { kind: "cells", cells: [[0, 0], [1, 0]] }, label: { zh: "本行自身格与前方一格", en: "Own cell and one cell ahead" } } },
  s: { attack: { shape: { kind: "lane", start: 1 }, label: { zh: "前方本行，最近的可部署空格", en: "Nearest deployable empty cell ahead" } } },
  x: { attack: global }, S: { skill: TOWER_SKILLS.S.range, impact: TOWER_SKILLS.S.impact },
  c: { skill: TOWER_SKILLS.c.range },
  "+": { passive: centered5 }, "*": { passive: centered5 }, "/": { passive: centered5 },
  "-": { passive: { shape: { kind: "circle", radius: 2.6 } } },
  "()": { passive: self }, "[]": { passive: self }, "&": { passive: global }
};

export function towerRanges(card: CardDefinition): TowerRanges {
  const ranges: TowerRanges = { ...towerRangeDefinitions[card.id] };
  if (card.attackSpeed !== undefined && !ranges.attack) {
    const area = getCardAttackArea(card.id);
    if (area.kind === "fan") {
      const horizontal = area.direction === "forward";
      ranges.attack = { shape: { kind: "fan", direction: horizontal ? "right" : area.direction as "up" | "down",
        halfWidth: area.halfWidth / (horizontal ? CELL_HEIGHT : CELL_WIDTH),
        slope: (area.spreadSlope ?? Math.tan(area.spreadDegrees * Math.PI / 180)) *
          (horizontal ? CELL_WIDTH / CELL_HEIGHT : CELL_HEIGHT / CELL_WIDTH) } };
    } else {
      const length = ("rangeCells" in area ? area.rangeCells : undefined) ?? card.rangeCells;
      ranges.attack = { shape: length ? { kind: "grid", left: 0, right: length - 1, top: 0, bottom: 0 } : { kind: "lane", start: 0 } };
    }
  }
  if (card.triggerRangeX !== undefined) {
    const x = card.triggerRangeX / CELL_WIDTH, y = (card.triggerRangeY ?? 0) / CELL_HEIGHT;
    ranges.skill = { shape: card.triggerShape === "circle" ? { kind: "circle", radius: x }
      : !Number.isFinite(x) && !Number.isFinite(y) ? { kind: "global" }
      : !Number.isFinite(y) ? { kind: "column", halfWidth: x } : { kind: "rectangle", halfWidth: x, halfHeight: y } };
  }
  if (card.splashRadius) ranges.impact = { shape: { kind: "circle", radius: card.splashRadius / CELL_WIDTH }, origin: "impact" };
  return ranges;
}
