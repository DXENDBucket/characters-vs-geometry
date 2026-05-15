import {
  CUBE_BOSS_CONTACT_DAMAGE,
  CUBE_BOSS_CONTACT_INTERVAL,
  CUBE_BOSS_MAX_HP,
  ENEMY_SPEED
} from "./config";
import { cardDefinitions } from "./data/cards";
import { enemyDefinitions } from "./data/enemies";
import { DAMAGE_SYMBOLS, EFFECT_SYMBOLS, getLanguage, t } from "./i18n";
import type { CardDefinition, CardId, DamageType, EnemyKind, UnitCategory } from "./types";

export type EncyclopediaTab = "enemies" | "towers";

export interface EncyclopediaEntry {
  title: string;
  lines: string[];
  description: string;
  enemyKind?: EnemyKind;
  card?: CardDefinition;
  icon?: "cube";
}

export function enemyEncyclopediaEntries(): EncyclopediaEntry[] {
  const zh = isZh();
  const circle = enemyDefinitions.circle;
  const triangle = enemyDefinitions.triangle;
  const shootingTriangle = enemyDefinitions.shootingTriangle;
  const square = enemyDefinitions.square;

  return [
    {
      title: zh ? "圆系列" : "Circle Series",
      enemyKind: "circle",
      lines: [
        statLine([
          [t("label.hp"), circle.hp],
          [t("label.armor"), circle.armor],
          [t("label.mr"), circle.magicResistance],
          [t("label.atk"), damageText(circle.damage, circle.damageType)],
          [t("label.speed"), speedText("circle")]
        ]),
        zh
          ? "权重 I/II/III：10 / 50 / 90"
          : "Weight I/II/III: 10 / 50 / 90"
      ],
      description: zh
        ? "近战单位。II/III 死亡时会在本行、上行、下行各尝试分裂出一个低一级圆。"
        : "Melee unit. II/III try to split into one lower-rank circle on this lane, the lane above, and the lane below."
    },
    {
      title: zh ? "三角系列" : "Triangle Series",
      enemyKind: "triangle",
      lines: [
        statLine([
          [t("label.hp"), triangle.hp],
          [t("label.armor"), triangle.armor],
          [t("label.mr"), triangle.magicResistance],
          [t("label.atk"), damageText(triangle.damage, triangle.damageType)]
        ]),
        zh
          ? "权重 I/II/III：30 / 90 / 150，速度：15 / 20 / 25，攻速间隔：1s / 0.5s / 0.33s"
          : "Weight I/II/III: 30 / 90 / 150, speed: 15 / 20 / 25, attack interval: 1s / 0.5s / 0.33s"
      ],
      description: zh
        ? "近战单位。数字越高，生命与单次攻击不变，但移动更快，攻击间隔按数字缩短。"
        : "Melee unit. Higher ranks keep the same HP and hit damage, but move faster and attack more often."
    },
    {
      title: zh ? "正方形系列" : "Square Series",
      enemyKind: "square",
      lines: [
        statLine([
          [t("label.hp"), square.hp],
          [t("label.mr"), square.magicResistance],
          [t("label.atk"), damageText(square.damage, square.damageType)],
          [t("label.speed"), speedText("square")]
        ]),
        zh
          ? "护甲 I/II/III：300 / 600 / 900，权重：50 / 150 / 250"
          : "Armor I/II/III: 300 / 600 / 900, weight: 50 / 150 / 250"
      ],
      description: zh
        ? "慢速高护甲近战单位。数字越高护甲和权重越高。"
        : "Slow, armored melee unit. Higher ranks gain more armor and cost more wave weight."
    },
    {
      title: zh ? "射击三角系列" : "Shooting Triangle Series",
      enemyKind: "shootingTriangle",
      lines: [
        statLine([
          [t("label.hp"), shootingTriangle.hp],
          [t("label.armor"), shootingTriangle.armor],
          [t("label.mr"), shootingTriangle.magicResistance],
          [t("label.atk"), damageText(shootingTriangle.damage, shootingTriangle.damageType)],
          [t("label.speed"), speedText("shootingTriangle")],
          [t("label.weight"), shootingTriangle.weight]
        ]),
        zh ? "攻击间隔：2s，弹幕命中塔时造成伤害" : "Attack interval: 2s, projectile damages towers on hit"
      ],
      description: zh
        ? "远程敌怪。三角尖端朝向底线，会发射带红色的物理弹幕。"
        : "Ranged enemy. Its point faces the base and it fires red-tinted physical projectiles."
    },
    {
      title: zh ? "正方体 Boss 系列" : "Cube Boss Series",
      icon: "cube",
      lines: [
        statLine([
          [t("label.hp"), CUBE_BOSS_MAX_HP],
          [t("label.armor"), "I 300 / II 600"],
          [t("label.mr"), 50],
          [t("label.speed"), 0.6],
          [t("label.atk"), `${damageText(CUBE_BOSS_CONTACT_DAMAGE, "physical")} / ${CUBE_BOSS_CONTACT_INTERVAL}s`]
        ]),
        zh
          ? "晋升：90技力满后消耗30，将最近 I 小怪升为 II；推进：120技力满后召唤3个正方体。"
          : "Promotion: at 90 SP, spend 30 to promote nearest rank I minion to II. Advance: at 120 SP, summon 3 cubes.",
        zh
          ? "正方体 II 额外拥有晋升2：180技力满后消耗40，将最近 II 小怪升为 III。"
          : "Cube II also has Promotion 2: at 180 SP, spend 40 to promote nearest rank II minion to III."
      ],
      description: zh
        ? "Boss 不会被阻挡，也不会随血量缩小；到达底线会失败，死亡会直接胜利。"
        : "Bosses cannot be blocked and do not shrink with HP. Reaching the base is defeat; killing one clears the stage."
    }
  ];
}

export function towerEncyclopediaEntries(): EncyclopediaEntry[] {
  return cardDefinitions.map((card) => ({
    title: `${card.id}  ${categoryName(card.category)}`,
    card,
    lines: towerLines(card),
    description: towerDescription(card.id)
  }));
}

function towerLines(card: CardDefinition) {
  const firstLine = statLine([
    [t("label.cost"), card.cost],
    [t("label.cd"), seconds(card.cooldown)],
    [t("label.hp"), card.maxHp],
    [t("label.armor"), card.armor ?? 0],
    [t("label.mr"), card.magicResistance ?? 0]
  ]);
  const effectParts = [card.stats];
  if (card.fireRate) {
    effectParts.push(`${isZh() ? "间隔" : "interval"} ${seconds(card.fireRate)}`);
  }
  if (card.rangeCells) {
    effectParts.push(`${isZh() ? "范围" : "range"} ${card.rangeCells}`);
  }
  const secondLine = `${t("label.effect")}: ${effectParts.join("  ")}`;
  return [firstLine, secondLine, `${t("label.upgrade")}: ${towerUpgradeText(card.id)}`];
}

function towerDescription(id: CardId) {
  const zh = isZh();
  const descriptions: Record<CardId, string> = {
    A: zh ? "直线物理射手。沿本行平射，命中后有碎片粒子。" : "Straight physical shooter. Fires along its lane with hit shards.",
    B: zh ? "防御塔。阻挡敌怪，只会对近战伤害反伤 400 物理伤害。" : "Defender. Blocks enemies and reflects 400 physical damage only against melee hits.",
    C: zh ? "物理溅射炮。沿本行发射炮弹，命中后对 1 格半径造成范围伤害。" : "Physical splash cannon. Fires down its lane and deals 1-cell radius splash on hit.",
    D: zh ? "纯防御塔。高护甲，用来拖住近战敌怪。" : "Pure defender with high armor for stalling melee enemies.",
    X: zh ? `生产塔。每 10 秒产生 ${EFFECT_SYMBOLS.chars}25，也是主要字符来源之一。` : `Producer. Generates ${EFFECT_SYMBOLS.chars}25 every 10s.`,
    E: zh ? "三连物理射手。向前平射，并向上/下各偏转 10 度发射一发。" : "Triple physical shooter. Fires one straight shot plus two shots at +/-10 degrees.",
    M: zh ? "下向三连物理射手。攻击方向朝下，出弹点保持在列中心。" : "Downward triple physical shooter. Fires downward from the column center.",
    W: zh ? "上向三连物理射手。攻击方向朝上，出弹点保持在列中心。" : "Upward triple physical shooter. Fires upward from the column center.",
    F: zh ? "触发器。阻挡敌怪时立刻消失，并在 3x3 范围内连续释放冲击波。" : "Trigger. Disappears on blocking and releases rapid shockwaves in a 3x3 area.",
    G: zh ? "延迟触发器。放置 15 秒后准备完成，接触敌怪时消失并造成高额法术伤害。" : "Delayed trigger. Arms after 15s, then disappears on contact to deal heavy magic damage.",
    H: zh ? "治疗塔。治疗前方一列、以自己为中心三行内生命百分比最低的一座塔。" : "Healer. Heals the lowest-HP-percent tower in the three front tiles.",
    I: zh ? "短程法术射手。只攻击自身和前方 5 格内的目标。" : "Short-range magic shooter. Attacks only within itself plus five tiles ahead.",
    J: zh ? "短程法术溅射。范围和 I 一致，发射 # 弹幕并造成范围法术伤害。" : "Short-range magic splash attacker. Same range as I, firing # projectiles with splash.",
    K: zh ? "近程斩击塔。攻击自身一格和前方两格内的单体目标，释放十字斩特效。" : "Close-range slasher. Hits one target within itself plus two tiles ahead, with a cross slash.",
    L: zh ? "牵引塔。抓取上下两行指定格子的所有敌怪平移到本行，每抓一个自损 400 真实伤害。" : "Shifter. Pulls all enemies from target tiles in adjacent lanes into its lane, taking 400 true self-damage per target."
  };
  return descriptions[id];
}

function towerUpgradeText(id: CardId) {
  const zh = isZh();
  if (id === "A" || id === "C" || id === "E" || id === "M" || id === "W" || id === "I" || id === "J" || id === "H" || id === "K") {
    return zh ? "增加连发次数；等级越高，连发间隔按曲线缩短。" : "Adds burst count; higher levels reduce burst spacing on the upgrade curve.";
  }
  if (id === "X") {
    return zh ? "每级单次生产量增加基础值的 80%。" : "Each level adds 80% of base production per tick.";
  }
  if (id === "F") {
    return zh ? "每级冲击波数量增加基础值的 80%。" : "Each level adds 80% of base shockwave count.";
  }
  if (id === "G") {
    return zh ? "每级伤害增加基础值的 80%，并重置准备倒计时。" : "Each level adds 80% of base damage and resets arming.";
  }
  return zh ? "每级最大生命增加基础值的 80%，当前生命同步补充。" : "Each level adds 80% of base max HP and heals by the same amount.";
}

function categoryName(category: UnitCategory) {
  const zh = isZh();
  const names: Record<UnitCategory, string> = {
    production: zh ? "生产" : "Production",
    attack: zh ? "攻击" : "Attack",
    defense: zh ? "防御" : "Defense",
    function: zh ? "功能" : "Function",
    healing: zh ? "治疗" : "Healing"
  };
  return names[category];
}

function statLine(entries: Array<[string, string | number]>) {
  return entries.map(([label, value]) => `${label} ${value}`).join("  ");
}

function damageText(amount: number, type: DamageType) {
  return `${amount}${DAMAGE_SYMBOLS[type]}`;
}

function speedText(kind: EnemyKind) {
  const speed = ENEMY_SPEED * (enemyDefinitions[kind].speedMultiplier ?? 1);
  return Number.isInteger(speed) ? `${speed}` : speed.toFixed(1);
}

function seconds(ms: number) {
  return `${ms / 1000}s`;
}

function isZh() {
  return getLanguage() === "zh-CN";
}
