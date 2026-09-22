import * as config from "./config";
import { getLevelConfig } from "./data/levels";
import { bossStatsAtRank, rankedBossFamily, tetrahedronChargeSpeedAtRank, dodecahedronAttacksAtRank } from "./bosses/bossRanks";
import { getEnemyDefinition } from "./registry/enemies";
import { enemyKindAtRank } from "./game/enemyIdentity";
import { detailText as l, detailField as f, detailNumber as n, skillChargeFields, type DetailSection } from "./encyclopediaSections";
import { detailRange } from "./encyclopediaRanges";
import { battlefieldRange, enemyContactRange, enemyMortarRange, enemyForwardRange } from "./enemyEncyclopediaDetails";
import type { RangeDefinition } from "./rangeGeometry";
import type { EncyclopediaEntry } from "./encyclopedia";

type BossIcon = NonNullable<EncyclopediaEntry["icon"]>;
export function bossPreviewStats(icon: BossIcon, level: number) {
  const base = rankedBossFamily(icon) ? bossStatsAtRank(icon, level) : config.CUBE_BOSS_STATS[icon];
  const phase = icon === "icosahedron" ? getLevelConfig("5-10").bossPhases![level - 1] : undefined;
  return { ...base, hp: phase?.maxHp ?? base.hp, armor: phase?.armor ?? base.armor,
    magicResistance: phase?.magicResistance ?? base.magicResistance, reduction: phase?.finalDamageReduction ?? 0 };
}

export function bossPreviewLimit(icon: BossIcon) {
  return icon === "icosahedron" ? getLevelConfig("5-10").bossPhases!.length : rankedBossFamily(icon) ? 999 : 1;
}

export function bossDetailSections(icon: BossIcon, level: number): DetailSection[] {
  const ico = icon === "icosahedron", rank = ico ? 3 : level;
  const contact: RangeDefinition = { shape: { kind: "rectangle", halfWidth: (ico ? config.CUBE_BOSS_STATS.icosahedron.hitboxCells! : config.BOSS_HITBOX_WIDTH / config.CELL_WIDTH) / 2,
    halfHeight: (ico ? config.CUBE_BOSS_STATS.icosahedron.hitboxCells! : config.BOSS_HITBOX_HEIGHT / config.CELL_HEIGHT) / 2 },
    label: { zh: "接触 Boss 碰撞体", en: "Contact with the Boss hitbox" } };
  const column: RangeDefinition = { shape: { kind: "column", halfWidth: .5 } };
  const sections: DetailSection[] = [{ title: l("常规攻击", "Regular attack"), tag: l("接触伤害", "Contact damage"), tone: "attack",
    fields: [f("攻击速度", "Attack speed", `${60 / config.CUBE_BOSS_CONTACT_INTERVAL} · ${config.CUBE_BOSS_CONTACT_INTERVAL}s`),
      f("单次伤害", "Per hit", `${config.CUBE_BOSS_CONTACT_DAMAGE} ` + l("物理", "physical")),
      f("目标规则", "Targeting", l("接触碰撞体的塔；本体不可阻挡", "Towers touching the hitbox; the Boss cannot be blocked"))], ranges: [detailRange(contact)] }];
  const passive = (zh: string, en: string, description: string, ranges: RangeDefinition[] = []) => sections.push({ title: l(zh, en), tag: l("被动／事件", "Passive / event"), tone: "passive", fields: [], description, ranges: ranges.map(range => detailRange(range)) });
  const skill = (zh: string, en: string, max: number, cost: number, initial: number, description: string, range: RangeDefinition, duration = 0, condition?: string) => {
    sections.push({ title: l(zh, en), tag: l("技力技能 · 自动", "SP skill · Automatic"), tone: "skill",
      fields: [...skillChargeFields({ initial, max, cost, regen: 1, duration, pause: false }),
        f("触发／回复条件", "Trigger / recovery", condition ?? l("满技力自动触发", "Automatically at full SP"))], description, ranges: [detailRange(range)] });
  };
  if (ico) {
    passive("阶段规则", "Phase rules", l(`P${level} · 常态全伤害减免 ${n(bossPreviewStats(icon, level).reduction * 100)}%。转阶段清空敌怪并回到初始位置，波数与权重增长保留。P4 为最终金色血条。`,
      `P${level} · Baseline damage reduction ${n(bossPreviewStats(icon, level).reduction * 100)}%. Transitions clear enemies and return the Boss to its entry position without resetting waves or weight growth. P4 is the final gold bar.`));
  }
  if (icon === "cube") {
    skill("晋升", "Promotion", config.CUBE_BOSS_PROMOTION_SKILL_MAX, config.CUBE_BOSS_PROMOTION_SKILL_COST, 0,
      l(`将 3 个不高于 ${rank} 级的可晋升小怪提升一级，优先高等级，再取最近。圆最高晋升到 IV。`, `Promotes 3 eligible minions of rank ${rank} or lower; highest rank first, then nearest. Circles cap at IV.`), battlefieldRange, 0,
      l("满技力且至少有 3 个合法目标", "Full SP and at least 3 eligible targets"));
    skill("推进", "Advance", config.CUBE_BOSS_ADVANCE_SKILL_MAX, config.CUBE_BOSS_ADVANCE_SKILL_COST, 0,
      l(`在自身前方一列的每行召唤一个 ${rank} 级正方形。`, `Summons a rank ${rank} Square in each lane of the column ahead.`), column);
  }
  if (ico && level === 1) {
    skill("终极推进", "Ultimate Advance", config.ICOSAHEDRON_BOSS_ULTIMATE_ADVANCE_SKILL_MAX, config.ICOSAHEDRON_BOSS_ULTIMATE_ADVANCE_SKILL_COST, config.ICOSAHEDRON_BOSS_ULTIMATE_ADVANCE_INITIAL_SP,
      l("在前方一列及该列右侧一列，每格召唤正方形 III。", "Summons Square III in every cell of the front column and the column to its right."), { shape: { kind: "column", halfWidth: 1 } });
    for (const alpha of [true, false]) skill(alpha ? "心跳 α" : "心跳 β", alpha ? "Heartbeat Alpha" : "Heartbeat Beta",
      alpha ? config.ICOSAHEDRON_BOSS_HEARTBEAT_ALPHA_SKILL_MAX : config.ICOSAHEDRON_BOSS_HEARTBEAT_BETA_SKILL_MAX,
      alpha ? config.ICOSAHEDRON_BOSS_HEARTBEAT_ALPHA_SKILL_COST : config.ICOSAHEDRON_BOSS_HEARTBEAT_BETA_SKILL_COST,
      alpha ? config.ICOSAHEDRON_BOSS_HEARTBEAT_ALPHA_INITIAL_SP : config.ICOSAHEDRON_BOSS_HEARTBEAT_BETA_INITIAL_SP,
      l(`在最右列的第 ${alpha ? "2、4、6" : "1、3、5、7"} 行各召唤心形 III。`, `Summons Heart III in lanes ${alpha ? "2, 4, 6" : "1, 3, 5, 7"} of the rightmost column.`), column);
  }
  if (icon === "tetrahedron" || ico && level === 2) {
    const condition = l("满技力触发；触发濒危效果后自然回技永久翻倍", "At full SP; natural recovery permanently doubles after the critical-HP event");
    skill("冲锋", "Charge", config.TETRAHEDRON_BOSS_CHARGE_SKILL_MAX, config.TETRAHEDRON_BOSS_CHARGE_SKILL_COST, 0,
      l(`场上敌怪获得 ${ico ? 2.5 : tetrahedronChargeSpeedAtRank(rank)} 倍移速；压制技力 +${config.TETRAHEDRON_BOSS_CHARGE_SUPPRESSION_SP_GAIN}。`,
        `Enemies gain ${ico ? 2.5 : tetrahedronChargeSpeedAtRank(rank)}x speed; Suppression gains ${config.TETRAHEDRON_BOSS_CHARGE_SUPPRESSION_SP_GAIN} SP.`), battlefieldRange, config.TETRAHEDRON_BOSS_CHARGE_DURATION, condition);
    skill("冲击", "Impact", config.TETRAHEDRON_BOSS_IMPACT_SKILL_MAX, config.TETRAHEDRON_BOSS_IMPACT_SKILL_COST, ico ? 75 : 0,
      l(`前方两列每行召唤 ${rank} 级倒三角；冲锋技力 +${config.TETRAHEDRON_BOSS_IMPACT_CHARGE_SP_GAIN}。`, `Summons rank ${rank} Inverted Triangles across two columns; Charge gains ${config.TETRAHEDRON_BOSS_IMPACT_CHARGE_SP_GAIN} SP.`), { shape: { kind: "column", halfWidth: 1 } }, 0, condition);
    skill("压制", "Suppression", config.TETRAHEDRON_BOSS_SUPPRESSION_SKILL_MAX, config.TETRAHEDRON_BOSS_SUPPRESSION_SKILL_COST, ico ? 75 : 0,
      l(`出怪线每行召唤 ${rank} 级射击三角；冲击技力 +${config.TETRAHEDRON_BOSS_SUPPRESSION_IMPACT_SP_GAIN}。`, `Summons rank ${rank} Shooting Triangles in each lane at the spawn line; Impact gains ${config.TETRAHEDRON_BOSS_SUPPRESSION_IMPACT_SP_GAIN} SP.`), column, 0, condition);
    skill("孤注一掷", "Last Stand", config.TETRAHEDRON_BOSS_DESPERATION_SKILL_MAX, config.TETRAHEDRON_BOSS_DESPERATION_SKILL_COST, 0,
      l(`接触 Boss 的敌怪获得永久力量；冲锋技力 +${config.TETRAHEDRON_BOSS_DESPERATION_CHARGE_SP_GAIN}。`, `Enemies touching the Boss gain permanent Power; Charge gains ${config.TETRAHEDRON_BOSS_DESPERATION_CHARGE_SP_GAIN} SP.`), contact, 0,
      l("生命不高于 50% 才回复技力；濒危后回复翻倍", "Recovers only at 50% HP or lower; recovery doubles after the critical event"));
    passive("半血与濒危", "Half HP & critical HP", l(`首次降至 50%：最右 ${ico ? 5 : 2} 列召唤 ${rank} 级倒三角，填满冲锋技力。首次降至 10%：无敌 15s、移速 3 倍持续 60s，并在${ico ? "每个格子" : "最右五列"}召唤 ${rank} 级倒三角。若提前受到致命伤害则锁 1 血触发濒危效果。`,
      `First reaching 50% HP: summon rank ${rank} Inverted Triangles in the rightmost ${ico ? 5 : 2} columns and fill Charge SP. First reaching 10%: 15s Invincible, 3x speed for 60s, and rank ${rank} Inverted Triangles in ${ico ? "every cell" : "the rightmost five columns"}. An earlier lethal hit locks HP at 1 and triggers this event.`));
    if (ico) skill("飞跃", "Leap", config.ICOSAHEDRON_BOSS_LEAP_SKILL_MAX, config.ICOSAHEDRON_BOSS_LEAP_SKILL_COST, config.ICOSAHEDRON_BOSS_LEAP_INITIAL_SP,
      l("在最远离底线的一列，每行召唤斜坡三角形 III。", "Summons Ramp Triangle III in each lane of the column farthest from the base."), column);
  }
  if (icon === "dodecahedron" || ico && level === 3) {
    const companionRank = ico ? 1 : rank, attacks = dodecahedronAttacksAtRank(companionRank);
    const companion = getEnemyDefinition(enemyKindAtRank("dodecahedronCompanion", companionRank));
    passive("眷属与庇护", "Companions & protection", l(`${ico ? 7 : 3} 个 ${companionRank} 级眷属，单体 ${n(companion.hp)} 生命、${companion.armor} 护甲、${companion.magicResistance} 法抗。有眷属存活时，本体额外获得 95% 全伤害减免。每个眷属死亡使其他眷属无敌 10s。`,
      `${ico ? 7 : 3} rank ${companionRank} companions, each with ${n(companion.hp)} HP, ${companion.armor} armor and ${companion.magicResistance} MR. Living companions grant the Boss an extra 95% damage reduction. Each death makes survivors invincible for 10s.`));
    passive("眷属行动", "Companion actions", l(`20s 后发射激光（${attacks.companionLaserHits} 次判定），再等 30s 发射迫击弹（${attacks.companionMortarHits} 次判定），再等 30s 释放 3×3 羽翼，循环执行。连发最多 5 发，超出部分分配为独立判定。运动为环绕 47s、转换 1s、列队 47s、转换 1s；列队时${ico ? "每行一个" : "位于本行及上下两行"}。`,
      `After 20s: lasers (${attacks.companionLaserHits} hits); 30s later: mortars (${attacks.companionMortarHits} hits); 30s later: 3x3 Wings, then repeat. Volleys cap at 5 shots with excess hits resolved independently. Motion alternates 47s orbit and 47s formation with 1s transitions; ${ico ? "one per lane" : "own lane and two lanes above/below"}.`), [enemyForwardRange, enemyMortarRange]);
    passive("眷属阵亡反击", "Companion death retaliation", ico
      ? l("第 1、3、5、7 个眷属死亡：自身所在五行发射激光，10 秒内 15 次。第 2、4、6 个死亡：向最后放置的最多 6 座塔各发射一颗法术迫击弹。", "Deaths 1/3/5/7: lasers across five lanes, 15 times over 10s. Deaths 2/4/6: one magic mortar at each of up to 6 most recently placed towers.")
      : l(`第一个死亡：自身所在三行发射激光，共 ${dodecahedronAttacksAtRank(rank).deathLaserHits} 次独立判定。第二个死亡：向最后放置的最多 4 座塔各发射一颗法术迫击弹。`, `First death: lasers across three lanes, ${dodecahedronAttacksAtRank(rank).deathLaserHits} independent hits. Second death: one magic mortar at each of up to 4 most recently placed towers.`),
      [{ shape: { kind: "lane", start: 0, direction: -1, halfHeight: ico ? 2.5 : 1.5 } }, enemyMortarRange]);
    skill("无尽羽翼", "Endless Wings", config.DODECAHEDRON_BOSS_ENDLESS_WINGS_SKILL_MAX, config.DODECAHEDRON_BOSS_ENDLESS_WINGS_SKILL_COST, 0,
      l("接触 Boss 且尚未飞行的敌怪获得 7s 飞行和 2 倍移速。", "Non-flying enemies touching the Boss gain 7s Flying and 2x speed."), contact, 0,
      l("全部眷属死亡后开始回技，满技力自动发动", "Starts recovering after all companions die; activates at full SP"));
  }
  if (icon === "octahedron" || ico && level === 4) {
    passive("共享血条分身", "Shared-HP bodies", l("75%／50%／25% 生命各触发一次分身，目标位置预警 4s 后出现，状态效果独立。依次在底线侧中路反向移动、第八列顶部向下、第五列底部向上。2／3／4 个本体提供额外 20%／40%／60% 全伤害减免。", "At 75% / 50% / 25% HP, telegraphs each destination for 4s before spawning a body with independent effects: base-side middle moving backward, column 8 top moving down, column 5 bottom moving up. With 2 / 3 / 4 bodies, gain an extra 20% / 40% / 60% damage reduction."));
    passive("领袖增援", "Leader reinforcements", l(`仅 25% 分身事件：全行术战壁垒，0.5s 后第 2/4/6 行潜地箭头，再 0.5s 第 2/4/6 行心形，再 0.5s 全行斜坡三角形，再 0.5s 全行大天使。均为 ${rank} 级。`,
      `Only at the 25% split: Bulwarks in every lane; after 0.5s Burrow Arrows in lanes 2/4/6; after 0.5s Hearts in 2/4/6; after 0.5s Ramps in all lanes; after 0.5s Archangels in all lanes. All rank ${rank}.`), [column]);
    passive(ico ? "最终锁血" : "阳炎护盾", ico ? "Final survival" : "Solar shield", ico
      ? l("阈值分身不无敌，也不召唤阳炎爆弹。首次受到致命伤害锁 1 血，所有本体立即无敌 15s；预警 4s 后在第二列第三行生成向下移动的最终分身，共用剩余无敌时间。", "Threshold splits grant neither invincibility nor Sun Bombs. The first lethal hit locks HP at 1 and immediately grants all bodies 15s Invincible. After a 4s warning, the final body spawns in column 2, row 3 moving down, sharing the remaining invincibility time.")
      : l("开局及每次触发分身预警时，场上所有本体立即无敌。开局及分身实际出现时，在第 2/6 行最右列生成阳炎爆弹，新分身无敌。金色爆弹撞击无敌本体后破盾并消失，半径 2.6 格内造成 2900 真实伤害，不分敌我。", "Entry and each split warning immediately shield all existing bodies. Sun Bombs spawn in the rightmost cells of lanes 2/6 on entry and when each invincible copy appears. A gold bomb breaks the struck body's shield, disappears, and deals 2900 true damage to both sides within 2.6 cells."));
  }
  return sections;
}
