import {
  CUBE_BOSS_CONTACT_DAMAGE,
  CUBE_BOSS_CONTACT_INTERVAL,
  CUBE_BOSS_STATS,
  ENEMY_SPEED
} from "./config";
import { DAMAGE_SYMBOLS, EFFECT_SYMBOLS, getLanguage, t } from "./i18n";
import { allCardDefinitions } from "./registry/cards";
import { getEnemyDefinition } from "./registry/enemies";
import type { CardDefinition, CardId, DamageType, EnemyKind, UnitCategory } from "./types";

export type EncyclopediaTab = "enemies" | "towers";

export interface EncyclopediaEntry {
  title: string;
  lines: string[];
  description: string;
  enemyKind?: EnemyKind;
  card?: CardDefinition;
  icon?: "cube" | "tetrahedron";
}

export function enemyEncyclopediaEntries(): EncyclopediaEntry[] {
  const zh = isZh();
  const circle = getEnemyDefinition("circle");
  const triangle = getEnemyDefinition("triangle");
  const invertedTriangle = getEnemyDefinition("invertedTriangle");
  const invertedTriangle2 = getEnemyDefinition("invertedTriangle2");
  const shootingTriangle = getEnemyDefinition("shootingTriangle");
  const shootingTriangle2 = getEnemyDefinition("shootingTriangle2");
  const square = getEnemyDefinition("square");

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
      title: zh ? "倒三角系列" : "Inverted Triangle Series",
      enemyKind: "invertedTriangle",
      lines: [
        statLine([
          [t("label.hp"), invertedTriangle.hp],
          [t("label.armor"), invertedTriangle.armor],
          [t("label.mr"), invertedTriangle.magicResistance],
          [t("label.atk"), `I ${damageText(invertedTriangle.damage, invertedTriangle.damageType)} / II ${damageText(invertedTriangle2.damage, invertedTriangle2.damageType)}`],
          [t("label.speed"), `I ${speedText("invertedTriangle")} / II ${speedText("invertedTriangle2")}`]
        ]),
        zh
          ? `权重 I/II：${invertedTriangle.weight} / ${invertedTriangle2.weight}`
          : `Weight I/II: ${invertedTriangle.weight} / ${invertedTriangle2.weight}`,
        zh ? "被同一座塔连续阻挡 2s 后触发" : "Triggers after being blocked by the same tower for 2s"
      ],
      description: zh
        ? "高速法抗自爆单位。若 2 秒内一直被同一座塔阻挡，会消失并爆炸，对阻挡者造成法术伤害。"
        : "Fast magic-resistant detonator. If the same tower blocks it for 2 seconds, it disappears and deals magic damage to that blocker."
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
        zh
          ? `权重 I/II：${shootingTriangle.weight} / ${shootingTriangle2.weight}，连发 I/II：1 / 2`
          : `Weight I/II: ${shootingTriangle.weight} / ${shootingTriangle2.weight}, volley I/II: 1 / 2`,
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
          [t("label.hp"), `I ${CUBE_BOSS_STATS.cube.hp} / II ${CUBE_BOSS_STATS.cube2.hp}`],
          [t("label.armor"), "I 300 / II 600"],
          [t("label.mr"), 20],
          [t("label.speed"), CUBE_BOSS_STATS.cube.speed],
          [t("label.atk"), `${damageText(CUBE_BOSS_CONTACT_DAMAGE, "physical")} / ${CUBE_BOSS_CONTACT_INTERVAL}s`]
        ]),
        zh
          ? "晋升：90技力满后消耗30，将最近 I 小怪升为 II；推进：120技力满后在每一行召唤一个正方形。"
          : "Promotion: at 90 SP, spend 30 to promote nearest rank I minion to II. Advance: at 120 SP, summon one square in each lane.",
        zh
          ? "正方体 II 额外拥有晋升2：180技力满后消耗40，将最近 II 小怪升为 III。"
          : "Cube II also has Promotion 2: at 180 SP, spend 40 to promote nearest rank II minion to III."
      ],
      description: zh
        ? "Boss 不会被阻挡，也不会随血量缩小；到达底线会失败，死亡会直接胜利。"
        : "Bosses cannot be blocked and do not shrink with HP. Reaching the base is defeat; killing one clears the stage."
    },
    {
      title: zh ? "正四面体 Boss 系列" : "Tetrahedron Boss Series",
      icon: "tetrahedron",
      lines: [
        statLine([
          [t("label.hp"), CUBE_BOSS_STATS.tetrahedron.hp],
          [t("label.armor"), CUBE_BOSS_STATS.tetrahedron.armor],
          [t("label.mr"), CUBE_BOSS_STATS.tetrahedron.magicResistance],
          [t("label.speed"), CUBE_BOSS_STATS.tetrahedron.speed],
          [t("label.atk"), `${damageText(CUBE_BOSS_CONTACT_DAMAGE, "physical")} / ${CUBE_BOSS_CONTACT_INTERVAL}s`]
        ]),
        zh
          ? "冲锋：60技力满后消耗30，使所有普通敌怪在 7 秒内获得加速，移动速度变为 200%，并使压制技力 +16。"
          : "Charge: at 60 SP, spend 30 to give ordinary enemies 7s Haste, raising movement speed to 200%, and gives Suppression +16 SP.",
        zh
          ? "冲击：120技力满后消耗60，在 Boss 前方两列每行召唤倒三角 I，并使冲锋技力 +12。压制：160技力满后消耗40，在出怪线每行召唤射击三角 I，并使冲击技力 +25。"
          : "Impact: at 120 SP, spend 60 to summon Inverted Triangle I in every lane across two columns in front of the Boss, and gives Charge +12 SP. Suppression: at 160 SP, spend 40 to summon Shooting Triangle I in every lane at the spawn line, and gives Impact +25 SP.",
        zh
          ? "首次降至50%生命时，在最远离底线的三列每格召唤倒三角 II，并立刻填满冲锋技力。"
          : "The first time HP reaches 50% or lower, summons Inverted Triangle II in every cell of the three columns farthest from the base and immediately fills Charge SP.",
        zh
          ? "首次降至10%生命时获得15秒无敌和60秒300%速度加速，并在最远离底线的五列每格召唤倒三角 I；若此前被直接击杀，则锁1血并触发同一套效果。孤注一掷：50%生命以下每秒回1技力，10满后给接触 Boss 的敌怪永久力量，并使冲锋 +5。"
          : "The first time HP reaches 10% or lower, gains 15s Invincible and 60s Boss Haste at 300% speed, then summons Inverted Triangle I in every cell of the five columns farthest from the base. If it would die before this triggers, it locks at 1 HP and triggers the same package. Last Stand: below 50% HP, gains 1 SP/s; at 10 SP, grants permanent Power to enemies touching the Boss and gives Charge +5 SP."
      ],
      description: zh
        ? "Boss 不会被阻挡，也不会随血量缩小；到达底线会失败，死亡会直接胜利。"
        : "Boss cannot be blocked and does not shrink with HP. Reaching the base is defeat; killing it clears the stage."
    }
  ];
}

export function towerEncyclopediaEntries(): EncyclopediaEntry[] {
  return allCardDefinitions.map((card) => ({
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
    O: zh ? "抗法防御塔。机制和 D 类似，但冷却更短并拥有较高法术抗性。" : "Magic-resistant defender. Similar to D, with shorter cooldown and high magic resistance.",
    R: zh ? "反弹防御塔。机制和 O 类似；敌方弹幕击中它时仍会造成伤害，但弹幕会被反射为同伤害、同类型、反向飞行的我方弹幕。" : "Reflect defender. Similar to O; enemy projectiles still damage it on hit, then reflect into friendly projectiles with the same damage and damage type flying the opposite direction.",
    X: zh ? `生产塔。每 10 秒产生 ${EFFECT_SYMBOLS.chars}25，也是主要字符来源之一。` : `Producer. Generates ${EFFECT_SYMBOLS.chars}25 every 10s.`,
    E: zh ? "三连物理射手。向前平射，并向上/下各偏转 10 度发射一发。" : "Triple physical shooter. Fires one straight shot plus two shots at +/-10 degrees.",
    M: zh ? "下向三连物理射手。攻击方向朝下，出弹点保持在列中心。" : "Downward triple physical shooter. Fires downward from the column center.",
    W: zh ? "上向三连物理射手。攻击方向朝上，出弹点保持在列中心。" : "Upward triple physical shooter. Fires upward from the column center.",
    F: zh ? "触发器。阻挡敌怪时立刻消失，并在 3x3 范围内连续释放冲击波。" : "Trigger. Disappears on blocking and releases rapid shockwaves in a 3x3 area.",
    G: zh ? "延迟触发器。放置 15 秒后准备完成，接触敌怪时消失并造成高额法术伤害。" : "Delayed trigger. Arms after 15s, then disappears on contact to deal heavy magic damage.",
    H: zh ? "治疗塔。治疗自身列和前方一列、以自己为中心三行内生命百分比最低的一座塔。" : "Healer. Heals the lowest-HP-percent tower in a 2x3 area covering its column and the front column.",
    P: zh ? "广域治疗塔。治疗自身列和前方四列、以自己为中心三行内生命百分比最低的一座塔。" : "Wide healer. Heals the lowest-HP-percent tower in a 5x3 area covering its column plus four forward columns.",
    I: zh ? "短程法术射手。只攻击自身和前方 5 格内的目标。" : "Short-range magic shooter. Attacks only within itself plus five tiles ahead.",
    Q: zh ? "短程控制射手。范围和 I 一致，发射 $ 法术弹幕；命中普通敌怪后施加 1 秒凝滞，使其移动速度变为三分之一。Boss 不会受到凝滞影响。" : "Short-range control shooter. Same range as I, firing $ magic projectiles; hits apply 1s Stasis to ordinary enemies, reducing movement speed to one third. Bosses ignore Stasis.",
    J: zh ? "短程法术溅射。范围和 I 一致，发射 # 弹幕并造成范围法术伤害。" : "Short-range magic splash attacker. Same range as I, firing # projectiles with splash.",
    K: zh ? "近程斩击塔。攻击自身一格和前方两格内的单体目标，释放十字斩特效。" : "Close-range slasher. Hits one target within itself plus two tiles ahead, with a cross slash.",
    L: zh ? "牵引塔。抓取上下两行指定格子的所有敌怪平移到本行，每抓一个自损 400 真实伤害。" : "Shifter. Pulls all enemies from target tiles in adjacent lanes into its lane, taking 400 true self-damage per target.",
    N: zh ? "防御推移塔。每秒把自己正在阻挡的所有敌怪向左推移 4 格，每推一个自损 400 真实伤害。" : "Defender-shifter. Every second, pushes all enemies it is blocking 4 cells left, taking 400 true self-damage per pushed enemy.",
    T: zh ? "迟滞塔。每秒自损 700 真实伤害；以自身为中心 5x5 去角范围内的普通单位和弹幕移动速度降为六分之一，并显示深紫色时间范围框。Boss 不受减速影响。死亡时清除范围内弹幕；被橡皮擦移除不会触发亡语。" : "Slow field tower. Takes 700 true self-damage every second; ordinary units and projectiles in its centered 5x5 no-corner area move at one sixth speed, shown with a deep-purple time range border. Bosses ignore the slow. On death, clears projectiles in that area; erasing it does not trigger the death effect."
  };
  return descriptions[id];
}

function towerUpgradeText(id: CardId) {
  const zh = isZh();
  if (id === "A" || id === "C" || id === "E" || id === "M" || id === "W" || id === "I" || id === "Q" || id === "J" || id === "H" || id === "P" || id === "K") {
    return zh ? "增加连发次数；整段连射固定占攻击/治疗间隔的五分之一。" : "Adds burst count; the whole volley always takes one fifth of the attack/heal interval.";
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
  const speed = ENEMY_SPEED * (getEnemyDefinition(kind).speedMultiplier ?? 1);
  return Number.isInteger(speed) ? `${speed}` : speed.toFixed(1);
}

function seconds(ms: number) {
  return `${ms / 1000}s`;
}

function isZh() {
  return getLanguage() === "zh-CN";
}
