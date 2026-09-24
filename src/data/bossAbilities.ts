import type { BossSkillName } from "../types";
import { DEL_DELETE_STACK, DEL_FORMAT } from "./delBoss";

export interface BossSkillData {
  name: { zh: string; en: string };
  initialSp: number;
  maxSp: number;
  cost: number;
  regen: number;
  // Displayed effect duration, not a universal recovery pause or casting deadline.
  duration: number;
  recoveryHp?: { ratio: number; inclusive: boolean };
  criticalRegenMultiplier?: number;
  grantsSp?: { skill: BossSkillName; amount: number };
}

export const BOSS_SKILLS = {
  promotion: { name: { zh: "晋升", en: "Promotion" }, initialSp: 0, maxSp: 90, cost: 30, regen: 1, duration: 0 },
  advance: { name: { zh: "推进", en: "Advance" }, initialSp: 0, maxSp: 120, cost: 120, regen: 1, duration: 0 },
  charge: {
    name: { zh: "冲锋", en: "Charge" }, initialSp: 0, maxSp: 60, cost: 30, regen: 1, duration: 7_000,
    criticalRegenMultiplier: 2, grantsSp: { skill: "suppression", amount: 15 }
  },
  impact: {
    name: { zh: "冲击", en: "Impact" }, initialSp: 0, maxSp: 120, cost: 60, regen: 1, duration: 0,
    criticalRegenMultiplier: 2, grantsSp: { skill: "charge", amount: 10 }
  },
  suppression: {
    name: { zh: "压制", en: "Suppression" }, initialSp: 0, maxSp: 160, cost: 40, regen: 1, duration: 0,
    criticalRegenMultiplier: 2, grantsSp: { skill: "impact", amount: 20 }
  },
  desperation: {
    name: { zh: "孤注一掷", en: "Last Stand" }, initialSp: 0, maxSp: 10, cost: 10, regen: 1, duration: 0,
    recoveryHp: { ratio: 0.5, inclusive: true }, criticalRegenMultiplier: 2, grantsSp: { skill: "charge", amount: 5 }
  },
  endlessWings: { name: { zh: "无尽羽翼", en: "Endless Wings" }, initialSp: 0, maxSp: 4, cost: 4, regen: 1, duration: 0 },
  ultimateAdvance: { name: { zh: "终极推进", en: "Ultimate Advance" }, initialSp: 30, maxSp: 40, cost: 40, regen: 1, duration: 0 },
  heartbeatAlpha: { name: { zh: "心跳 α", en: "Heartbeat Alpha" }, initialSp: 30, maxSp: 60, cost: 60, regen: 1, duration: 0 },
  heartbeatBeta: { name: { zh: "心跳 β", en: "Heartbeat Beta" }, initialSp: 0, maxSp: 60, cost: 60, regen: 1, duration: 0 },
  leap: { name: { zh: "飞跃", en: "Leap" }, initialSp: 35, maxSp: 50, cost: 50, regen: 1, duration: 0 },
  deleteStack: {
    name: { zh: "删除：栈", en: "Delete: Stack" }, initialSp: DEL_DELETE_STACK.initialSp,
    maxSp: DEL_DELETE_STACK.maxSp, cost: DEL_DELETE_STACK.cost, regen: 1, duration: DEL_DELETE_STACK.sealMs
  },
  deleteFormat: {
    name: { zh: "删除：格式化", en: "Delete: Format" }, initialSp: DEL_FORMAT.initialSp,
    maxSp: DEL_FORMAT.maxSp, cost: DEL_FORMAT.cost, regen: 1, duration: DEL_FORMAT.durationMs,
    recoveryHp: { ratio: 0.5, inclusive: false }
  }
} satisfies Record<BossSkillName, BossSkillData>;

// Zero-based phase indices. Only these skills reset on entry; other saved states are untouched.
export const ICOSAHEDRON_PHASE_SKILL_SP: Partial<Record<number, Partial<Record<BossSkillName, number>>>> = {
  1: { charge: 0, impact: 75, suppression: 75, desperation: 0, leap: BOSS_SKILLS.leap.initialSp },
  2: { endlessWings: 0 }
};

export const ENDLESS_WINGS_EFFECT = { duration: 7_000, speedMultiplier: 2 };
