import type { RangeDefinition } from "../rangeGeometry";
import type { EnemyFamily } from "../types";
import { INCITEMENT } from "./incitement";

export interface EnemySkillData {
  family: EnemyFamily;
  name: { zh: string; en: string };
  initialSp: number;
  initialSpPerRank?: number;
  maxSp: number;
  cost: number;
  regen: number;
  regenPerRank?: number;
  duration: number;
  pauseWhileActive: boolean;
  range: RangeDefinition;
}

const armorRange = { shape: { kind: "circle", radius: 1.4 } } as const;
export const ENEMY_AURAS = {
  armor: {
    families: ["hexagon"], range: armorRange,
    base: 50, perRank: 30
  },
  resistance: {
    families: ["hexSpellBulwark"], range: { shape: { kind: "row", halfHeight: 0.5 } },
    base: 40, perRank: 10
  },
  advance: {
    families: ["chargingHexagon", "heart"],
    range: { shape: { kind: "lane", start: 1 }, label: {
      zh: "同行右侧，远离底线方向", en: "Same lane to the right, away from the base"
    } },
    speedMultiplier: 1.5
  }
} as const satisfies Record<string, { families: readonly EnemyFamily[]; range: RangeDefinition } &
  ({ base: number; perRank: number } | { speedMultiplier: number })>;

export const ENEMY_SKILLS = {
  heal: {
    family: "hexagon", name: { zh: "治愈", en: "Heal" },
    initialSp: 0, maxSp: 20, cost: 20, regen: 1, duration: 0, pauseWhileActive: false,
    range: armorRange, healRatio: 0.3
  },
  wings: {
    family: "angelPentagon", name: { zh: "羽翼", en: "Wings" },
    initialSp: 0, initialSpPerRank: 2, maxSp: 15, cost: 15, regen: 1, regenPerRank: 0.2,
    duration: 3_000, pauseWhileActive: true,
    range: { shape: { kind: "rectangle", halfWidth: 1.5, halfHeight: 1.5 } }, speedMultiplier: 2
  },
  ascension: {
    family: "archangelHeptagon", name: { zh: "升华", en: "Ascension" },
    initialSp: 10, maxSp: 15, cost: 15, regen: 1, duration: 6_000, pauseWhileActive: true,
    range: { shape: { kind: "circle", radius: 2.5 } }, speedMultiplier: 2
  },
  lead: {
    family: "heart", name: { zh: "引领", en: "Lead" },
    initialSp: 0, maxSp: 5, cost: 5, regen: 1, duration: 0, pauseWhileActive: false,
    range: { shape: { kind: "grid", left: 0, right: 4, top: -1, bottom: 1 }, label: {
      zh: "本列及右侧四列，上下各一行", en: "Own column and four to the right, one lane up/down"
    } }
  },
  incitement: {
    family: "dollar", name: { zh: "煽动", en: "Incitement" },
    initialSp: INCITEMENT.initialSp, maxSp: INCITEMENT.maxSp, cost: INCITEMENT.cost, regen: INCITEMENT.regen,
    duration: 0, pauseWhileActive: false, range: { shape: { kind: "global" } }
  }
} as const satisfies Record<string, EnemySkillData & {
  healRatio?: number; speedMultiplier?: number;
}>;

export type EnemySkillId = keyof typeof ENEMY_SKILLS;
export const ENEMY_SKILL_IDS = Object.keys(ENEMY_SKILLS) as readonly EnemySkillId[];
export const ARCHANGEL_ENTRY = { highFlightDuration: 3_000, speedMultiplier: 2.5 } as const;

const supportFamilies = new Set<EnemyFamily>(Object.values(ENEMY_AURAS).flatMap(aura => [...aura.families]));
export function enemyFamilyProvidesSupport(family: EnemyFamily) {
  return supportFamilies.has(family);
}
