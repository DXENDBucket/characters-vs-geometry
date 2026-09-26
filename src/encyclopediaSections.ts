import { getLanguage } from "./i18n";
import type { DetailRange } from "./encyclopediaRanges";

export interface DetailField { label: string; value: string }
export interface DetailSection {
  title: string;
  tag: string;
  tone: "attack" | "skill" | "aura" | "passive";
  fields: DetailField[];
  description?: string;
  ranges?: DetailRange[];
}

const sectionOrder: Record<DetailSection["tone"], number> = { attack: 0, passive: 1, aura: 1, skill: 2 };

export function sortDetailSections(sections: readonly DetailSection[]): DetailSection[] {
  return [...sections].sort((a, b) => sectionOrder[a.tone] - sectionOrder[b.tone]);
}

export const detailText = (zh: string, en: string) => getLanguage() === "zh-CN" ? zh : en;
export const detailNumber = (value: number) => `${Number(value.toFixed(2))}`;
export const detailField = (zh: string, en: string, value: string): DetailField => ({ label: detailText(zh, en), value });
export const detailSeconds = (ms: number) => `${detailNumber(ms / 1000)}s`;

export function skillChargeFields(skill: { initial: number; max: number; cost: number; regen: number; duration: number; pause: boolean }): DetailField[] {
  return [
    detailField("初始技力", "Initial SP", `${skill.initial}`),
    detailField("消耗 / 上限", "Cost / max SP", `${skill.cost} / ${skill.max}`),
    detailField("回复方式", "Recovery", detailText(`自动 · ${detailNumber(skill.regen)}/秒`, `Auto · ${detailNumber(skill.regen)}/s`)),
    detailField("持续时间", "Duration", skill.duration ? detailSeconds(skill.duration) : detailText("瞬时", "Instant")),
    detailField("期间回复", "While active", detailText(skill.pause ? "暂停" : "继续", skill.pause ? "Paused" : "Continues"))
  ];
}
