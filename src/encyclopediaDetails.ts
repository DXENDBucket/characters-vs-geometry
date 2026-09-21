import type { CardDefinition } from "./types";
import { getLanguage } from "./i18n";
import {
  AIR_PATROL_INITIAL_SP, AIR_PATROL_SKILL_MAX, AIR_PATROL_SKILL_COST, AIR_PATROL_SKILL_DURATION,
  CELL_WIDTH, CLOCK_TOWER_SKILL_MAX, CLOCK_TOWER_SKILL_DURATION,
  GUARDIAN_TOWER_SKILL_MAX, GUARDIAN_TOWER_SKILL_COST, GUARDIAN_TOWER_HEAL_RATIO,
  SPELL_MORTAR_SKILL_MAX, SPELL_MORTAR_SKILL_COST, SPELL_MORTAR_SHOT_COUNT, SPELL_MORTAR_SHOT_INTERVAL
} from "./config";
import { attackIntervalMs } from "./game/attackSpeed";
import { getCardAttackArea, getProjectilePattern } from "./game/cardAttackConfigs";
import { isMaxHpUpgradeable, scaledByEffectiveUpgrades, upgradedAttackPower, volleyShotCount } from "./game/upgrades";
import { volleyHitsAt, volleyTimingCount } from "./game/volley";
import { ORIENTATION_MAX_SP, ORIENTATION_DURATION } from "./game/orientation";
import { GATHERING_MAX_SP, GATHERING_DURATION } from "./game/gathering";
import { PUSH_MAX_SP, PUSH_DURATION } from "./game/pushSkill";
import { UNYIELDING_PERCENT_PER_LEVEL, ZEAL_ATTACK_SPEED_MULTIPLIER } from "./game/towerAuras";

export interface DetailField { label: string; value: string }
export interface DetailSection {
  title: string;
  tag: string;
  tone: "attack" | "skill" | "aura" | "passive";
  fields: DetailField[];
  description?: string;
}
export interface DetailRange { cells: Array<[number, number]>; label: string }
const l = (zh: string, en: string) => getLanguage() === "zh-CN" ? zh : en;
const n = (value: number) => Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`;
const field = (zh: string, en: string, value: string): DetailField => ({ label: l(zh, en), value });
const seconds = (ms: number) => `${n(ms / 1000)}s`;

export function towerPreviewStats(card: CardDefinition, level: number) {
  return {
    maxHp: isMaxHpUpgradeable(card.id) ? scaledByEffectiveUpgrades(card.maxHp, level) : card.maxHp,
    attackPower: upgradedAttackPower(card.id, card.attackPower, level),
    armor: card.armor ?? 0, magicResistance: card.magicResistance ?? 0, attackSpeed: card.attackSpeed
  };
}

export function towerDetailRange(card: CardDefinition): DetailRange | undefined {
  const id = card.id;
  let cells: Array<[number, number]> = [];
  const square = (radius: number, cut = false) => {
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++)
      if (!cut || Math.abs(x) !== radius || Math.abs(y) !== radius) cells.push([x, y]);
  };
  if (["e", "T", "o", "+"].includes(id)) {
    square(2, true); return { cells, label: l("自身中心 5×5，去四角", "Centered 5x5, corners excluded") };
  }
  if (["g", "H", "p", "h", "U"].includes(id)) {
    square(1); if (id === "U") cells = cells.filter(([x, y]) => x !== 0 || y !== 0);
    return { cells, label: l("自身中心 3×3", "Centered 3x3") };
  }
  if (id === "P") {
    for (let y = -1; y <= 1; y++) for (let x = -3; x <= 4; x++) cells.push([x, y]);
    return { cells, label: l("三行，身后三格至前方四格", "3 lanes, 3 cells behind to 4 ahead") };
  }
  if (["m", "u", "#"].includes(id)) return { cells: [[-1, 0], [1, 0], [0, -1], [0, 1]], label: l("上下左右相邻格", "Four adjacent cells") };
  if (id === "@") return { cells: [[1, 0]], label: l("朝向前方一格", "One cell ahead") };
  if (id === "X" || id === "Y") return { cells: [[0, 0]], label: l("自身生产", "Self production") };
  if (id === "-") return { cells: [], label: l("半径 2.6 格", "2.6-cell radius") };
  if (id === "j") return { cells: [[0, -1], [0, 1]], label: l("上下相邻行的同列格", "Same column, adjacent lanes") };
  if (id === "k") return { cells: [[0, -1], [1, -1], [0, 0], [1, 0], [2, 0], [0, 1], [1, 1]], label: l("前方七格区域", "Seven-cell forward area") };
  if (id === "x" || id === "S" || id === "f") return { cells: [], label: l("全场", "Entire battlefield") };
  if (id === "F") return { cells: [], label: l("自身中心 4×4 范围", "Centered 4x4 area") };
  if (id === "l") return { cells: [], label: l("全列，宽 1.5 格", "Entire column, 1.5 cells wide") };
  if (id === "G") return { cells: [[0, 0]], label: l("接触目标", "Contact target") };
  if (id === "N" || id === "q") return { cells: [[0, 0]], label: l("自身阻挡的敌怪", "Blocked enemies") };
  if (id === "L" || id === "n") return { cells: [], label: l("见行动说明", "See action details") };
  if (card.triggerShape === "circle") return { cells: [], label: l("半径 ", "Radius ") + n((card.triggerRangeX ?? 0) / CELL_WIDTH) + l(" 格", " cells") };
  if (id === "w") return { cells: [[0, 0]], label: l("自身", "Self") };
  if (!card.attackSpeed) return undefined;
  const area = getCardAttackArea(id);
  if (area.kind === "verticalFan") return { cells: [], label: l(area.direction === "up" ? "向上扇形" : "向下扇形", `${area.direction}ward fan`) };
  const length = ("rangeCells" in area ? area.rangeCells : undefined) ?? card.rangeCells;
  if (length) {
    for (let x = 0; x < length; x++) cells.push([x, 0]);
    return { cells, label: l(`本行，自身至前方 ${length - 1} 格`, `Own cell and ${length - 1} cells ahead`) };
  }
  return { cells: [], label: l("本行前方，至场地边界", "Forward lane to the board edge") };
}

export function towerDetailSections(card: CardDefinition, level: number, description: string): DetailSection[] {
  const id = card.id, stats = towerPreviewStats(card, level);
  const damage = stats.attackPower * (card.attackMultiplier ?? 1);
  const damageType = card.damageType === "physical" ? l("物理", "physical") : card.damageType === "true" ? l("真实", "true") : l("法术", "magic");
  const damageValue = `${n(damage)} ${damageType} · ${n((card.attackMultiplier ?? 1) * 100)}% ATK`;
  const range = towerDetailRange(card)?.label ?? "/";
  const regular: DetailSection = { title: l("常规攻击", "Regular attack"), tag: l("自动", "Automatic"), tone: "attack", fields: [] };
  const sections: DetailSection[] = [regular];
  const skillIds = ["w", "o", "j", "c", "h", "S", "#"];
  const trigger = ["F", "f", "i", "l", "r", "G"].includes(id);
  if (card.attackSpeed !== undefined) {
    const healing = card.category === "healing", production = id === "X", utility = ["L", "N", "n", "q", "T", "s"].includes(id);
    const hits = volleyShotCount(id, level), timings = volleyTimingCount(hits);
    const pattern = getProjectilePattern(id);
    const bullets = id === "x" ? 4 : pattern?.shots.length ?? 1;
    regular.title = healing ? l("常规行动 · 治疗", "Regular action · Healing") : production ? l("常规行动 · 生产", "Regular action · Production")
      : utility ? l("常规行动", "Regular action") : regular.title;
    let targeting = l("范围内有可攻击目标时发动", "Requires an attackable target in range");
    if (id === "V") targeting = l("远程优先 → 最终攻击力最高 → 最近", "Ranged first > highest final ATK > nearest");
    if (id === "x") targeting = l("最近的可攻击飞行目标优先，否则最近目标", "Nearest attackable flying target first, otherwise nearest");
    if (healing) targeting = ["e", "g"].includes(id) ? l("范围内所有受伤友方塔，含自身", "All injured friendly towers, including self") : l("优先生命比例最低的受伤友方塔", "Injured friendly towers with lowest HP ratio first");
    if (production || id === "T") targeting = l("不需要目标", "No target required");
    if (id === "s") targeting = l("自身前方最近的可部署空格", "Nearest deployable empty cell ahead");
    if (id === "N" || id === "q") targeting = l("自身阻挡的敌怪", "Enemies blocked by this tower");
    let effect = healing ? `${n(damage)} HP · ${n((card.attackMultiplier ?? 1) * 100)}% ATK` : damageValue;
    if (production) effect = `${scaledByEffectiveUpgrades(card.produceAmount ?? 0, level)} ` + l("字符", "characters");
    if (utility) effect = id === "s" ? l(`生成等级 ${level} 的小 a`, `Create level ${level} a`) : id === "T" ? l(`自损 ${card.selfDamage} 真实伤害`, `${card.selfDamage} true self-damage`) : l("位移／存储，不造成攻击伤害", "Displacement / storage, no attack damage");
    let hitMode = card.splashRadius ? l(`半径 ${n(card.splashRadius / CELL_WIDTH)} 格范围，距离衰减`, `${n(card.splashRadius / CELL_WIDTH)}-cell radius, distance falloff`) : l("单体", "Single target");
    if (id === "d" || id === "z") hitMode = l("穿透；命中首个有法抗敌怪后停止", "Pierces; stops after first magic-resistant enemy");
    if (id === "k") hitMode = l("范围内全部目标", "All targets in area");
    if (id === "V") hitMode = l("预判落点，飞行 1.2s，可打空", "Predicted landing; 1.2s flight; can miss");
    if (id === "x") hitMode = l("追踪；目标消失后重新索敌", "Homing; retargets only if target disappears");
    if (healing) hitMode = ["e", "g"].includes(id) ? l("范围内全部目标", "All targets in area") : `${card.healTargets ?? 1} ` + l("个目标", "targets");
    regular.fields = [field("作用范围", "Range", range), field("目标规则", "Targeting", targeting),
      field("攻击速度", "Attack speed", `${n(card.attackSpeed)} · ${seconds(attackIntervalMs(card.attackSpeed))}`),
      field("单次效果", "Per hit", effect),
      field("发射与判定", "Volley / hits", utility || production ? l("每周期一次", "Once per cycle")
        : `${timings} ` + l("连发", "volleys") + ` × ${bullets} ` + l(healing ? "次治疗" : "发／次", healing ? "heals" : "shots") + ` · ` + l("各发判定 ", "hits per shot ") + Array.from({ length: timings }, (_, i) => volleyHitsAt(hits, i)).join("/")),
      field("命中方式", "Resolution", utility || production ? "/" : hitMode)];
    regular.description = description;
    if (id === "e" || id === "g") regular.description = l("每次治疗覆盖范围内所有受伤塔，包括自身与负生命状态的塔。", "Each pulse heals all injured towers in range, including self and towers with negative HP.");
    if (id === "z") regular.description = l("穿透至首个有法抗的敌怪。命中扣除目标各技能 1 技力，不中断已开启技能；Boss 只受伤害，不被扣技力。", "Pierces through the first magic-resistant enemy. Each hit drains 1 SP from each skill without interrupting active skills; Bosses take damage but lose no SP.");
    if (id === "T") regular.description = l("无论因何原因消失，清除范围内所有弹幕和抛射体。", "On removal for any reason, clears all projectiles and mortars in its area.");
    if (id === "x") regular.fields.push(field("对地修正", "Ground modifier", l(`非飞行目标伤害 -35%：每颗 ${n(damage * .65)}`, `-35% vs non-Flying targets: ${n(damage * .65)} per shot`)));
    if (card.projectileDebuff) regular.fields.push(field("附加状态", "On-hit status", l(card.projectileDebuff === "sunder" ? "碎甲" : "凝滞", card.projectileDebuff === "sunder" ? "Sunder" : "Stasis") + ` · ${seconds(card.projectileDebuffDuration ?? 0)}`));
    if (card.skillDrainOnHit) regular.fields.push(field("技力削减", "SP drain", `${card.skillDrainOnHit} / ` + l("技能，Boss 除外", "skill, excluding Bosses")));
  } else {
    regular.tag = l("无", "None");
    regular.fields = [field("常规行动", "Regular action", id === "@" ? l("随复制对象变化", "Determined by copied tower") : l("无主动常规攻击", "No regular attack"))];
  }

  if (skillIds.includes(id)) {
    let name = "", initial = 0, max = 10, cost = 10, duration = 0, regen = 1, automatic = false;
    let pause = true;
    if (id === "w") { name = l("巡空", "Air Patrol"); initial = AIR_PATROL_INITIAL_SP; max = AIR_PATROL_SKILL_MAX; cost = AIR_PATROL_SKILL_COST; duration = AIR_PATROL_SKILL_DURATION; }
    if (id === "o") { name = l("导向", "Orientation"); max = cost = ORIENTATION_MAX_SP; duration = ORIENTATION_DURATION; }
    if (id === "j") { name = l("汇聚", "Gathering"); max = cost = GATHERING_MAX_SP; duration = GATHERING_DURATION; }
    if (id === "c") { name = l("极速钟", "Speed Clock"); max = cost = CLOCK_TOWER_SKILL_MAX; duration = CLOCK_TOWER_SKILL_DURATION; }
    if (id === "h") { name = l("守护", "Guardian"); max = GUARDIAN_TOWER_SKILL_MAX; cost = GUARDIAN_TOWER_SKILL_COST; automatic = true; pause = false; }
    if (id === "S") { name = l("术法迫击", "Spell Mortar"); max = SPELL_MORTAR_SKILL_MAX; cost = SPELL_MORTAR_SKILL_COST; duration = (SPELL_MORTAR_SHOT_COUNT - 1) * SPELL_MORTAR_SHOT_INTERVAL; }
    if (id === "#") { name = l("推箱子", "Box Push"); max = cost = PUSH_MAX_SP; duration = PUSH_DURATION; regen = 1 + .5 * (level - 1); pause = false; }
    const fields = [field("初始技力", "Initial SP", `${initial}`), field("消耗 / 上限", "Cost / max SP", `${cost} / ${max}`),
      field("回复方式", "Recovery", l(`自动 · ${n(regen)}/秒`, `Auto · ${n(regen)}/s`)),
      field("持续时间", "Duration", duration ? seconds(duration) : l("瞬时", "Instant")),
      field("期间回复", "While active", pause ? l("暂停", "Paused") : l("继续", "Continues")),
      field("选定目标", "Target selection", ["S", "#"].includes(id) ? l("手动选定", "Manual targeting") : l("无需手动选定", "No manual targeting"))];
    if (id === "S") fields.push(field("每发伤害", "Per shell", damageValue), field("连发", "Volley", `${SPELL_MORTAR_SHOT_COUNT} · ${seconds(SPELL_MORTAR_SHOT_INTERVAL)}`));
    if (id === "h") fields.push(field("每目标治疗量", "Healing per target", `${Math.round(stats.maxHp * GUARDIAN_TOWER_HEAL_RATIO)} HP · ` + l(`小 h 生命上限的 ${GUARDIAN_TOWER_HEAL_RATIO * 100}%`, `${GUARDIAN_TOWER_HEAL_RATIO * 100}% of h's max HP`)));
    const effects: Partial<Record<typeof id, string>> = {
      w: l("自身进入飞行状态，不再阻挡地面敌人，改为阻挡普通飞行敌人。无法阻挡高空飞行。升级会重置技力并结束飞行。", "Becomes Flying: blocks regular Flying enemies instead of ground enemies. Cannot block High Flight. Upgrading resets SP and ends flight."),
      o: l("保护自身中心缺角 5×5 内的友方塔：有目标的敌方攻击与技能转向自身，包括已飞出的锁定迫击弹。无目标弹幕、激光和范围攻击不受影响；重叠时优先最近开启者。", "Protects friendly towers in a centered 5x5 area without corners. Redirects targeted enemy attacks and skills to self, including airborne locked mortars. Untargeted projectiles, lasers and area attacks are unaffected; the latest activation takes priority."),
      c: l("基础费用 ≤999 的其他卡槽，冷却速度变为所有激活小 c 的等级和 +1 倍。不加速小 c 自身卡槽。", "Other card slots costing <=999 recover at (sum of active c levels + 1)x speed. Does not speed up c's own slot."),
      h: l("自身或 3×3 内有受伤塔时自动发动：治疗自己，并治疗范围内生命比例最低的一座受伤塔。", "Activates when self or a tower in the centered 3x3 is injured. Heals self and the injured tower with the lowest HP ratio in range."),
      S: l("手动指定全场任意落点，发射三发迫击弹；每发造成 3×3 法术范围伤害。瞄准及连发期间暂停回复，取消瞄准不消耗技力。", "Aim anywhere on the battlefield and fire three mortar shells, each dealing 3x3 magic area damage. Recovery pauses during aiming and firing. Canceling aim costs no SP.")
    };
    sections.push({ title: name, tag: l("技力技能 · ", "SP skill · ") + (automatic ? l("自动触发", "Automatic") : l("手动触发", "Manual")), tone: "skill", fields, description: effects[id] ?? description });
  } else if (trigger) {
    sections.push({ title: l("一次性效果", "One-shot effect"), tag: l("触发后消失", "Consumed on trigger"), tone: "skill",
      fields: [field("触发方式", "Trigger", id === "G" ? l(`部署 ${seconds(card.armTime ?? 0)} 后接触触发`, `Contact after ${seconds(card.armTime ?? 0)} arming`) : l("点击或阻挡接触", "Click or blocking contact")),
        field("作用范围", "Range", range), field("单次伤害", "Per hit", damage > 0 ? damageValue : l("无伤害", "No damage")),
        field("判定次数", "Hit count", `${id === "F" ? scaledByEffectiveUpgrades(card.triggerCount ?? 1, level) : card.triggerCount ?? 1}`),
        field("状态持续", "Status duration", card.triggerDebuffDuration ? seconds(id === "r" ? card.triggerDebuffDuration * level : scaledByEffectiveUpgrades(card.triggerDebuffDuration, level)) : "/")], description });
  } else if (["e", "g", "U", "T"].includes(id)) {
    const name = id === "e" ? l("热忱", "Zeal") : id === "g" ? l("不屈", "Unyielding") : id === "U" ? l("等级光环", "Level Aura") : l("迟滞领域", "Slow Field");
    const zeal = Math.round((ZEAL_ATTACK_SPEED_MULTIPLIER - 1) * 100), unyielding = UNYIELDING_PERCENT_PER_LEVEL * level;
    const effect = id === "e" ? l(`攻击速度 +${zeal}%`, `+${zeal}% attack speed`) : id === "g" ? l(`允许负生命：目标基础生命的 ${unyielding}%`, `Negative HP allowance: ${unyielding}% of target base HP`)
      : id === "U" ? l(`额外等级 +${level}`, `+${level} bonus levels`) : l("移动速度变为 1/6", "Movement speed becomes 1/6");
    sections.push({ title: name, tag: l("常驻光环", "Persistent aura"), tone: "aura", fields: [field("作用范围", "Range", range),
      field("作用对象", "Recipients", id === "U" ? l("基础费用 ≤999 的其他塔", "Other towers costing <=999") : id === "T" ? l("普通单位与弹幕，Boss 除外", "Ordinary units and projectiles, excluding Bosses") : l("友方塔，包含自身", "Friendly towers, including self")),
      field("效果", "Effect", effect), field("叠加规则", "Stacking", id === "U" ? l("加算叠加", "Additive") : id === "g" ? l("取最高值", "Strongest only") : l("同名不叠加", "Does not stack"))] });
  } else if (card.attackSpeed === undefined) {
    sections.push({ title: l("机制与被动", "Mechanics & passives"), tag: l("特殊机制", "Special behavior"), tone: "passive", fields: [], description });
  }
  if (card.reflectAttackMultiplier) sections.push({ title: l("近战反伤", "Melee retaliation"), tag: l("受击被动", "On-hit passive"), tone: "passive",
    fields: [field("触发条件", "Trigger", l("受到近战攻击", "Hit by melee attack")), field("反伤", "Retaliation", `${n(stats.attackPower * card.reflectAttackMultiplier)} ${damageType} · ${n(card.reflectAttackMultiplier * 100)}% ATK`)] });
  return sections;
}
