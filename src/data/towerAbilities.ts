import type { RangeDefinition } from "../rangeGeometry";
import type { CardId } from "../types";

export interface TowerSkillData {
  stateKey: string;
  name: { zh: string; en: string };
  initialSp: number;
  maxSp: number;
  cost: number;
  regen: number;
  regenPerLevel?: number;
  duration: number;
  pauseWhileActive: boolean;
  recovery: "wholeTick" | "elapsed";
  resetOnUpgrade: "none" | "charge" | "chargeAndActive";
  activation: "manual" | "automatic";
  requiresTarget?: boolean;
  supportsGroup?: boolean;
  range: RangeDefinition;
}

const mortarVolley = { shotCount: 3, shotInterval: 500 };

// Durations are battle milliseconds. State keys also identify skills in saved battles.
export const TOWER_SKILLS = {
  w: {
    stateKey: "airPatrol", name: { zh: "巡空", en: "Air Patrol" },
    initialSp: 8, maxSp: 10, cost: 10, regen: 1, duration: 10_000,
    pauseWhileActive: true, recovery: "wholeTick", resetOnUpgrade: "chargeAndActive", activation: "manual",
    range: { shape: { kind: "cells", cells: [[0, 0]] }, label: { zh: "自身", en: "Self" } }
  },
  o: {
    stateKey: "orientation", name: { zh: "导向", en: "Orientation" },
    initialSp: 0, maxSp: 10, cost: 10, regen: 1, duration: 6_000,
    pauseWhileActive: true, recovery: "elapsed", resetOnUpgrade: "chargeAndActive", activation: "manual",
    range: { shape: { kind: "grid", left: -2, right: 2, top: -2, bottom: 2, cutCorners: true } }
  },
  j: {
    stateKey: "gathering", name: { zh: "汇聚", en: "Gathering" },
    initialSp: 0, maxSp: 10, cost: 10, regen: 1, duration: 10_000,
    pauseWhileActive: true, recovery: "elapsed", resetOnUpgrade: "chargeAndActive", activation: "manual",
    range: { shape: { kind: "cells", cells: [[0, -1], [0, 1]] }, label: { zh: "上下相邻行的同列格", en: "Same column in adjacent lanes" } }
  },
  c: {
    stateKey: "clock", name: { zh: "极速钟", en: "Speed Clock" },
    initialSp: 0, maxSp: 20, cost: 20, regen: 1, duration: 10_000,
    pauseWhileActive: true, recovery: "wholeTick", resetOnUpgrade: "chargeAndActive", activation: "manual", supportsGroup: true,
    range: { shape: { kind: "nonSpatial" }, label: { zh: "符合条件的卡槽，不受距离限制", en: "Eligible card slots, no distance limit" } }
  },
  h: {
    stateKey: "guardian", name: { zh: "守护", en: "Guardian" },
    initialSp: 0, maxSp: 20, cost: 20, regen: 1, duration: 0,
    pauseWhileActive: false, recovery: "wholeTick", resetOnUpgrade: "none", activation: "automatic",
    healRatio: 0.4,
    range: { shape: { kind: "grid", left: -1, right: 1, top: -1, bottom: 1 } }
  },
  S: {
    stateKey: "spellMortar", name: { zh: "术法迫击", en: "Spell Mortar" },
    initialSp: 0, maxSp: 30, cost: 30, regen: 1,
    duration: (mortarVolley.shotCount - 1) * mortarVolley.shotInterval, ...mortarVolley,
    pauseWhileActive: true, recovery: "wholeTick", resetOnUpgrade: "chargeAndActive", activation: "manual", supportsGroup: true, requiresTarget: true,
    range: { shape: { kind: "global" } },
    impact: { shape: { kind: "rectangle", halfWidth: 1.5, halfHeight: 1.5 }, origin: "impact" }
  },
  "#": {
    stateKey: "push", name: { zh: "推箱子", en: "Box Push" },
    initialSp: 0, maxSp: 30, cost: 30, regen: 1, regenPerLevel: 0.5, duration: 500,
    pauseWhileActive: false, recovery: "wholeTick", resetOnUpgrade: "charge", activation: "manual", requiresTarget: true,
    range: { shape: { kind: "cells", cells: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, label: { zh: "上下左右相邻格", en: "Four adjacent cells" } }
  }
} satisfies Partial<Record<CardId, TowerSkillData & { healRatio?: number; shotCount?: number; shotInterval?: number; impact?: RangeDefinition }>>;

export type TowerSkillCardId = keyof typeof TOWER_SKILLS;
export const TOWER_SKILL_CARD_IDS = Object.keys(TOWER_SKILLS) as TowerSkillCardId[];

export function towerSkillData(id: CardId): TowerSkillData | undefined {
  return (TOWER_SKILLS as Partial<Record<CardId, TowerSkillData>>)[id];
}
