import { ANGEL_WINGS_SKILL_MAX, CELL_HEIGHT, CELL_WIDTH } from "./config";
import { enemyArchetypes } from "./data/enemyArchetypes";
import { INCITEMENT } from "./data/incitement";
import { HEART_ATTACK_RADIUS, ENEMY_MORTAR_RANGE_X, ENEMY_MORTAR_RANGE_Y } from "./data/enemyCombatConfig";
import { getEnemyRegistration } from "./registry/enemies";
import { enemyAttackSpeed, initialEnemySkillStates } from "./game/enemyBehaviors";
import { attackIntervalMs } from "./game/attackSpeed";
import { volleyHitsAt, volleyTimingCount } from "./game/volley";
import * as support from "./game/enemySupport";
import { ARCHANGEL_SPAWN_HIGH_FLIGHT_DURATION, ARCHANGEL_SPAWN_SPEED_MULTIPLIER } from "./game/enemyFactory";
import { PASSENGER_STAT_RATIO } from "./game/enemyContainers";
import { detailRange } from "./encyclopediaRanges";
import { detailText as l, detailField as f, detailNumber as n, detailSeconds as s, skillChargeFields, type DetailSection } from "./encyclopediaSections";
import type { RangeDefinition } from "./rangeGeometry";
import type { EnemyKind } from "./types";

export const enemyContactRange: RangeDefinition = { shape: { kind: "cells", cells: [[0, 0]] }, label: { zh: "接触／阻挡目标", en: "Contact / blocking target" } };
export const enemyForwardRange: RangeDefinition = { shape: { kind: "lane", start: 0, direction: -1 }, label: { zh: "面朝方向本行，至场地边界", en: "Facing direction, own lane to the board edge" } };
export const battlefieldRange: RangeDefinition = { shape: { kind: "global" } };
export const enemyMortarRange: RangeDefinition = { shape: { kind: "rectangle", halfWidth: ENEMY_MORTAR_RANGE_X / CELL_WIDTH, halfHeight: ENEMY_MORTAR_RANGE_Y / CELL_HEIGHT }, origin: "impact" };
const behindRange: RangeDefinition = { shape: { kind: "lane", start: 1 }, label: { zh: "同行右侧，远离底线方向", en: "Same lane to the right, away from the base" } };
const circle = (radius: number): RangeDefinition => ({ shape: { kind: "circle", radius: radius / CELL_WIDTH } });
const noRegularModes = new Set(["siegeRam", "mace", "blockedDetonator", "companion", "special"]);

export function enemyPreviewAttackSpeed(kind: EnemyKind) {
  const { family, attackMode } = getEnemyRegistration(kind);
  return noRegularModes.has(attackMode) || family === "slopeTriangle" ? undefined : enemyAttackSpeed(kind);
}

export function enemyDetailSections(kind: EnemyKind, description: string): DetailSection[] {
  const { definition: stats, family, rank, attackMode: mode, blockedDetonation, leader } = getEnemyRegistration(kind);
  const damageType = l(stats.damageType === "true" ? "真实" : stats.damageType === "magic" ? "法术" : "物理", stats.damageType);
  const damage = `${n(stats.damage)} ${damageType} · 100% ATK`;
  const speed = enemyPreviewAttackSpeed(kind);
  const ranged = ["ranged", "laser", "mortar"].includes(mode);
  const hits = ranged ? rank : 1, shots = volleyTimingCount(hits);
  const attack: DetailSection = { title: l("常规攻击", "Regular attack"), tag: l("自动", "Automatic"), tone: "attack", fields: [] };
  const sections: DetailSection[] = [attack];
  if (speed === undefined) {
    attack.tag = l("无", "None");
    attack.fields = [f("常规攻击", "Regular attack", l("无；见下方触发机制", "None; see triggered mechanics below"))];
  } else {
    const range = family === "heart" ? circle(HEART_ATTACK_RADIUS) : mode === "mortar" ? battlefieldRange : ranged ? enemyForwardRange : enemyContactRange;
    attack.ranges = [detailRange(range, l("攻击范围", "Attack range"))];
    if (mode === "mortar") attack.ranges.push(detailRange(enemyMortarRange, l("落点范围", "Impact area")));
    let target = l("攻击阻挡自身的塔", "Attacks its blocker");
    let resolution = l("单体近战", "Single-target melee");
    if (mode === "ranged" || mode === "laser") target = l("按周期朝移动方向开火，不要求已有目标", "Fires along movement direction on cooldown; no target required");
    if (mode === "ranged") resolution = l("弹幕命中首座塔时结算", "Projectile hit against the first tower");
    if (mode === "laser") resolution = l("瞬间穿透，命中第一座有法抗的塔后停止；不可反弹", "Instant piercing beam; stops after the first MR-positive tower; cannot be reflected");
    if (mode === "mortar") {
      target = family === "pentagon" ? l("自身阻挡者优先，否则最后部署的塔", "Own blocker first, otherwise the most recently placed tower")
        : l("自身阻挡者优先，否则阻挡数最多的塔；同数选最后部署", "Own blocker first, then most enemies blocked; ties favor latest placement");
      resolution = l("每发重新锁定目标，落点矩形范围伤害", "Reacquires each shell; rectangular impact damage");
    }
    if (family === "heart") { target = l("范围内所有我方塔，无需阻挡", "All player towers in range; no block required"); resolution = l("以自身为中心，伤害随距离线性衰减", "Centered area; damage falls off linearly with distance"); }
    attack.fields = [f("目标规则", "Targeting", target), f("攻击速度", "Attack speed", `${n(speed)} · ${s(attackIntervalMs(speed))}`),
      f("单次伤害", "Per hit", damage), f("连发与判定", "Volley / hits", `${shots} ` + l("连发 · 各发判定 ", "shots · hits per shot ") + Array.from({ length: shots }, (_, i) => volleyHitsAt(hits, i)).join("/")),
      f("命中方式", "Resolution", resolution)];
    if (mode === "mortar") attack.fields.push(f("周期说明", "Cycle", l("整段连发结束后，再等待攻击间隔", "The attack interval starts after the full volley")));
    if (ranged) attack.description = description;
  }
  const passive = (zh: string, en: string, text: string, range?: RangeDefinition, fields: DetailSection["fields"] = []) => {
    sections.push({ title: l(zh, en), tag: l("被动机制", "Passive"), tone: "passive", fields, description: text, ranges: range ? [detailRange(range)] : [] });
  };
  const aura = (zh: string, en: string, range: RangeDefinition, effect: string, recipients: string, stacking: string) => {
    sections.push({ title: l(zh, en), tag: l("常驻光环", "Persistent aura"), tone: "aura", ranges: [detailRange(range)], fields: [
      f("作用对象", "Recipients", recipients), f("效果", "Effect", effect), f("叠加规则", "Stacking", stacking)],
      description: l("光环来源处于高空飞行时不提供加成。", "The aura is inactive while its source is in High Flight.") });
  };
  const skill = (key: string, zh: string, en: string, max: number, cost: number, regen: number, duration: number, range: RangeDefinition, text: string, condition?: string) => {
    const state = initialEnemySkillStates(kind)[key];
    const fields = skillChargeFields({ initial: state?.sp ?? 0, max, cost, regen: regen * (state?.regenMultiplier ?? 1), duration, pause: duration > 0 });
    fields.push(f("触发条件", "Trigger", condition ?? l("技力达到上限自动发动", "Automatically at full SP")));
    sections.push({ title: l(zh, en), tag: l("技力技能 · 自动触发", "SP skill · Automatic"), tone: "skill", fields, ranges: [detailRange(range)], description: text });
  };
  if (family === "dollar") {
    skill("incitement", "煽动", "Incitement", INCITEMENT.maxSp, INCITEMENT.cost, INCITEMENT.regen, 0, battlefieldRange,
      l(`选取距离自身最近的 ${INCITEMENT.targetsPerRank * rank} 个其他小怪，赋予 +30% 力量和 +100% 加速，均持续 15 秒；施放后技力继续恢复。排除领袖、Boss、眷属及阳炎爆弹。`,
        `Grants +30% Power and +100% Haste to the nearest ${INCITEMENT.targetsPerRank * rank} other minions for 15s. SP recovery continues. Excludes leaders, Bosses, companions and Solar Bombs.`),
      l("满技力，且有合格的其他小怪", "Full SP with another eligible minion"));
  } else if (family === "hexagon") {
    const range = circle(support.HEX_ARMOR_RADIUS);
    aura("装甲光环", "Armor Aura", range, `+${support.HEX_ARMOR_RANK_ONE_BONUS + (rank - 1) * support.HEX_ARMOR_BONUS_PER_EXTRA_RANK} ` + l("护甲", "armor"),
      l("范围内敌怪，含自身；接触光环的 Boss", "Enemies including self; Boss hitboxes touching the aura"), l("加算叠加", "Additive"));
    skill("heal", "治愈", "Heal", support.HEX_HEAL_SKILL_MAX, support.HEX_HEAL_SKILL_COST, support.HEX_HEAL_SKILL_REGEN_PER_SECOND, 0, range,
      l(`治疗范围内生命比例最低的受伤敌怪，恢复施法者生命上限的 ${support.HEX_HEAL_RATIO * 100}%（基础面板 ${n(stats.hp * support.HEX_HEAL_RATIO)} 生命）。不选高空飞行目标。`,
        `Heals the injured enemy with the lowest HP ratio for ${support.HEX_HEAL_RATIO * 100}% of the caster's max HP (${n(stats.hp * support.HEX_HEAL_RATIO)} base HP). Excludes High Flight.`),
      l("满技力且存在可治疗目标", "Full SP and an injured target in range"));
  } else if (family === "angelPentagon" || family === "archangelHeptagon") {
    const arch = family === "archangelHeptagon";
    const range: RangeDefinition = arch ? circle(support.ARCHANGEL_ASCENSION_RADIUS) : { shape: { kind: "rectangle", halfWidth: support.ANGEL_WINGS_RANGE_X / CELL_WIDTH, halfHeight: support.ANGEL_WINGS_RANGE_Y / CELL_HEIGHT } };
    skill(arch ? "ascension" : "wings", arch ? "升华" : "羽翼", arch ? "Ascension" : "Wings",
      arch ? support.ARCHANGEL_ASCENSION_SKILL_MAX : ANGEL_WINGS_SKILL_MAX, arch ? support.ARCHANGEL_ASCENSION_SKILL_COST : support.ANGEL_WINGS_SKILL_COST,
      arch ? support.ARCHANGEL_ASCENSION_REGEN_PER_SECOND : support.ANGEL_WINGS_REGEN_PER_SECOND,
      arch ? support.ARCHANGEL_ASCENSION_DURATION : support.ANGEL_WINGS_DURATION, range,
      l(`范围内非高空飞行敌怪获得飞行与 ${support.ANGEL_WINGS_SPEED_MULTIPLIER} 倍移速；对括号乘客的效果作用于整个括号。`,
        `Non-High-Flight enemies gain Flying and ${support.ANGEL_WINGS_SPEED_MULTIPLIER}x speed; passengers apply the effect to their whole carrier.`));
    if (arch) passive("大天使飞行", "Archangel Flight", l("常态飞行；获得额外起飞效果时变为高空飞行，已有双光环变金色，不再增加光环。", "Permanently Flying; extra flight effects grant High Flight and turn its two existing halos gold."), undefined,
      [f("入场高空飞行", "Entry High Flight", s(ARCHANGEL_SPAWN_HIGH_FLIGHT_DURATION)), f("入场移速", "Entry speed", `${ARCHANGEL_SPAWN_SPEED_MULTIPLIER}x`)]);
  } else if (family === "hexSpellBulwark") {
    aura("术防光环", "Resistance Aura", { shape: { kind: "row", halfHeight: .5 } }, `+${support.HEX_SPELL_BULWARK_RANK_ONE_MAGIC_RESISTANCE_BONUS + (rank - 1) * support.HEX_SPELL_BULWARK_MAGIC_RESISTANCE_BONUS_PER_EXTRA_RANK} ` + l("法抗", "MR"),
      l("同行敌怪，包含自身", "Same-lane enemies, including self"), l("加算叠加", "Additive"));
  }
  if (family === "chargingHexagon" || family === "heart") {
    aura("推进光环", "Advance Aura", behindRange, `+${n((support.LEADER_SPEED_MULTIPLIER - 1) * 100)}% ` + l("移速", "speed"),
      l("同一行且位于右侧的敌怪", "Enemies to the right in the same lane"), l("与同类推进光环取最高值", "Strongest advance aura only"));
  }
  if (family === "heart") {
    skill("lead", "引领", "Lead", support.HEART_LEAD_SKILL_MAX, support.HEART_LEAD_SKILL_COST, support.HEART_LEAD_REGEN_PER_SECOND, 0,
      { shape: { kind: "grid", left: 0, right: support.HEART_LEAD_COLUMN_SPAN - 1, top: -support.HEART_LEAD_LANE_RADIUS, bottom: support.HEART_LEAD_LANE_RADIUS }, label: { zh: "本列及右侧四列，上下两行", en: "Own column and four to the right, two lanes up/down" } },
      l("将区域内普通小怪直接拉到自身所在行。排除领袖、Boss 眷属、已装载及高空飞行单位。同一批心形发动时，每个目标只被分配一次。", "Moves ordinary minions directly into the caster's lane. Excludes leaders, Boss companions, passengers and High Flight. Simultaneous casters claim each target only once."),
      l("满技力且区域内有可牵引目标", "Full SP and an eligible target in the area"));
  }
  if (mode === "blockedDetonator") passive("阻挡自爆", "Blocked Detonation", description, enemyContactRange,
    [f("连续阻挡时间", "Continuous block", s(blockedDetonation!.delay)), f("爆炸伤害", "Detonation damage", damage)]);
  if (mode === "siegeRam") passive("冲撞与分裂", "Ram & Split", description, enemyContactRange,
    [f("冲撞伤害", "Ram damage", damage), f("移动加速", "Acceleration", l("经过 7 格达到 4 倍基础移速", "4x base speed after 7 cells"))]);
  if (mode === "mace") passive("反弹冲撞", "Rebounding Ram", description, enemyContactRange,
    [f("伤害倍率", "Damage multiplier", l("实际移速 / 10 × 攻击力", "Actual speed / 10 x ATK")), f("分裂等级", "Split rank", `${rank}`),
      f("移动加速", "Acceleration", l("从静止朝面向方向加速，7 格达到 4 倍基础移速", "Accelerates from rest toward its facing; 4x base speed after 7 cells"))]);
  if (family === "slopeTriangle") passive("斜坡起飞", "Ramp Launch", description, enemyContactRange,
    [f("生效条件", "Condition", l("自身正被阻挡；接触小怪的速度方向与自身朝向一致", "Currently blocked; contacting minion velocity matches ramp facing")), f("飞行距离", "Flight distance", l("每 10 实际速度飞 1.5 格", "1.5 cells per 10 actual speed"))]);
  if (family === "burrowArrow") passive("装载与潜地", "Cargo & Burrow", description, enemyContactRange,
    [f("装载上限", "Cargo limit", l(`总等级 ${rank * 5}`, `Total rank ${rank * 5}`)), f("潜地条件", "Burrow trigger", l("装满或入场 6 秒", "Full cargo or 6s after entry"))]);
  if (family === "parentheses") passive("装载", "Carrier", description, enemyContactRange,
    [f("乘客数量", "Capacity", `${rank + 1}`), f("生命／攻击转化", "HP / ATK contribution", `${PASSENGER_STAT_RATIO * 100}%`)]);
  if (family === "equals") passive("生命连接", "Health Link", description, battlefieldRange,
    [f("连接数量", "Link capacity", `${stats.healthLinkCapacity}`), f("触发方式", "Trigger", l("入场时一次，最近目标优先", "Once on entry, nearest targets first"))]);
  if (family === "circle") passive("死亡分裂", "Death Split", rank > 1
    ? l(`死亡后在本行与上下相邻行各尝试生成一个 ${rank - 1} 级圆。`, `On death, tries to spawn rank ${rank - 1} circles in its lane and both adjacent lanes.`)
    : l("I 级不分裂；更高等级死亡时分裂为低一级圆。", "Rank I does not split; higher ranks split into the preceding rank."));
  if (["tilde", "triangle", "square", "trapezoid"].includes(family)) passive("单位特性", "Traits", description);
  const minFlag = stats.minFlag ?? 0;
  const growth = enemyArchetypes[family].growth;
  const changes = Object.entries(growth).map(([key, value]) => `${l(({ hp: "生命", armor: "护甲", magicResistance: "法抗", damage: "攻击", speedMultiplier: "移速倍率", weight: "权重", healthLinkCapacity: "连接数" } as Record<string, string>)[key] ?? key, key)} +${n(value!)}`);
  sections.push({ title: l("等级与出场", "Rank & spawn"), tag: l("基础规则", "Base rules"), tone: "passive", fields: [
    f("每级面板增量", "Panel growth per rank", changes.join(" · ") || l("面板不增长", "No panel growth")),
    f("常规出场限制", "Regular spawn restriction", leader ? l("旗帜波固定领袖，不占常规权重；关卡可指定额外召唤", "Fixed flag-wave leader, outside regular weight; stages may add summons")
      : minFlag ? l(`第 ${minFlag} 旗起；关卡可覆盖此限制`, `From flag ${minFlag}; stages may override`) : "/"),
    f("自然出场等级上限", "Natural spawn rank cap", enemyArchetypes[family].spawnRankCap?.toString() ?? l("无固定上限，取决于关卡", "No fixed cap; determined by stage")) ] });
  return sections;
}
