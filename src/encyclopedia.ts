import {
  CUBE_BOSS_CONTACT_DAMAGE,
  CUBE_BOSS_CONTACT_INTERVAL,
  CUBE_BOSS_STATS,
  ENEMY_SPEED
} from "./config";
import { attackIntervalMs } from "./game/attackSpeed";
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
  icon?: "cube" | "tetrahedron" | "dodecahedron" | "smallStellatedDodecahedron" | "octahedron" | "icosahedron";
}

export function enemyEncyclopediaEntries(): EncyclopediaEntry[] {
  const zh = isZh();
  const circle = getEnemyDefinition("circle");
  const triangle = getEnemyDefinition("triangle");
  const triangleRam = getEnemyDefinition("triangleRam");
  const triangleRam2 = getEnemyDefinition("triangleRam2");
  const triangleRam3 = getEnemyDefinition("triangleRam3");
  const angelPentagonRam = getEnemyDefinition("angelPentagonRam");
  const angelPentagonRam2 = getEnemyDefinition("angelPentagonRam2");
  const angelPentagonRam3 = getEnemyDefinition("angelPentagonRam3");
  const mortarTriangle = getEnemyDefinition("mortarTriangle");
  const mortarTriangle2 = getEnemyDefinition("mortarTriangle2");
  const mortarTriangle3 = getEnemyDefinition("mortarTriangle3");
  const pentagon = getEnemyDefinition("pentagon");
  const pentagon2 = getEnemyDefinition("pentagon2");
  const pentagon3 = getEnemyDefinition("pentagon3");
  const angelPentagon = getEnemyDefinition("angelPentagon");
  const angelPentagon2 = getEnemyDefinition("angelPentagon2");
  const angelPentagon3 = getEnemyDefinition("angelPentagon3");
  const archangelHeptagon = getEnemyDefinition("archangelHeptagon");
  const archangelHeptagon2 = getEnemyDefinition("archangelHeptagon2");
  const archangelHeptagon3 = getEnemyDefinition("archangelHeptagon3");
  const shootingPentagon = getEnemyDefinition("shootingPentagon");
  const shootingPentagon2 = getEnemyDefinition("shootingPentagon2");
  const shootingPentagon3 = getEnemyDefinition("shootingPentagon3");
  const diamond = getEnemyDefinition("diamond");
  const diamond2 = getEnemyDefinition("diamond2");
  const diamond3 = getEnemyDefinition("diamond3");
  const hexagon = getEnemyDefinition("hexagon");
  const hexagon2 = getEnemyDefinition("hexagon2");
  const hexagon3 = getEnemyDefinition("hexagon3");
  const chargingHexagon = getEnemyDefinition("chargingHexagon");
  const chargingHexagon2 = getEnemyDefinition("chargingHexagon2");
  const chargingHexagon3 = getEnemyDefinition("chargingHexagon3");
  const hexMace = getEnemyDefinition("hexMace");
  const hexMace2 = getEnemyDefinition("hexMace2");
  const hexMace3 = getEnemyDefinition("hexMace3");
  const hexSpellBulwark = getEnemyDefinition("hexSpellBulwark");
  const hexSpellBulwark2 = getEnemyDefinition("hexSpellBulwark2");
  const hexSpellBulwark3 = getEnemyDefinition("hexSpellBulwark3");
  const heart = getEnemyDefinition("heart");
  const heart2 = getEnemyDefinition("heart2");
  const heart3 = getEnemyDefinition("heart3");
  const burrowArrow = getEnemyDefinition("burrowArrow");
  const burrowArrow2 = getEnemyDefinition("burrowArrow2");
  const burrowArrow3 = getEnemyDefinition("burrowArrow3");
  const slopeTriangle = getEnemyDefinition("slopeTriangle");
  const slopeTriangle2 = getEnemyDefinition("slopeTriangle2");
  const slopeTriangle3 = getEnemyDefinition("slopeTriangle3");
  const invertedTriangle = getEnemyDefinition("invertedTriangle");
  const invertedTriangle2 = getEnemyDefinition("invertedTriangle2");
  const invertedTriangle3 = getEnemyDefinition("invertedTriangle3");
  const shootingTriangle = getEnemyDefinition("shootingTriangle");
  const shootingTriangle2 = getEnemyDefinition("shootingTriangle2");
  const shootingTriangle3 = getEnemyDefinition("shootingTriangle3");
  const dodecahedronCompanion = getEnemyDefinition("dodecahedronCompanion");
  const dodecahedronCompanion2 = getEnemyDefinition("dodecahedronCompanion2");
  const trapezoid = getEnemyDefinition("trapezoid");
  const trapezoid2 = getEnemyDefinition("trapezoid2");
  const trapezoid3 = getEnemyDefinition("trapezoid3");
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
          ? "权重 I/II/III：30 / 90 / 150，速度：15 / 20 / 25，攻击间隔：1s / 0.5s / 0.33s"
          : "Weight I/II/III: 30 / 90 / 150, speed: 15 / 20 / 25, attack interval: 1s / 0.5s / 0.33s"
      ],
      description: zh
        ? "近战单位。数字越高，生命与单次攻击不变，但移动更快，攻击间隔按数字缩短。"
        : "Melee unit. Higher ranks keep the same HP and hit damage, but move faster and attack more often."
    },
    {
      title: zh ? "三角攻城锤系列" : "Triangle Ram Series",
      enemyKind: "triangleRam",
      lines: [
        statLine([
          [t("label.hp"), triangleRam.hp],
          [t("label.armor"), triangleRam.armor],
          [t("label.mr"), triangleRam.magicResistance],
          [t("label.atk"), damageText(triangleRam.damage, triangleRam.damageType)],
          [t("label.speed"), `I ${speedText("triangleRam")} -> ${ENEMY_SPEED * 1.5 * 4} / II ${speedText("triangleRam2")} -> ${ENEMY_SPEED * 2 * 4} / III ${speedText("triangleRam3")} -> ${ENEMY_SPEED * 2.5 * 4}`],
          [t("label.weight"), `I ${triangleRam.weight} / II ${triangleRam2.weight} / III ${triangleRam3.weight}`]
        ]),
        zh ? "移动中匀加速，经过 7 格达到 4 倍基础速度" : "Accelerates while moving, reaching 4x base speed after 7 cells"
      ],
      description: zh
        ? "冲锋单位。第一次被阻挡时立刻撞击阻挡者并造成物理伤害；无论因撞击还是被击杀而死亡，都会在原地略微前后分裂成两个同数字三角。"
        : "Charging unit. The first time it is blocked, it immediately rams the blocker for physical damage. Whether it dies by ramming or being killed, it splits into two same-rank triangles slightly ahead and behind."
    },
    {
      title: zh ? "天使五边形攻城锤系列" : "Angel Pentagon Ram Series",
      enemyKind: "angelPentagonRam",
      lines: [
        statLine([
          [t("label.hp"), angelPentagonRam.hp],
          [t("label.armor"), angelPentagonRam.armor],
          [t("label.mr"), angelPentagonRam.magicResistance],
          [t("label.atk"), damageText(angelPentagonRam.damage, angelPentagonRam.damageType)],
          [
            t("label.speed"),
            `I ${speedText("angelPentagonRam")} -> ${ENEMY_SPEED * 1.5 * 4} / II ${speedText("angelPentagonRam2")} -> ${ENEMY_SPEED * 2 * 4} / III ${speedText("angelPentagonRam3")} -> ${ENEMY_SPEED * 2.5 * 4}`
          ],
          [t("label.weight"), `I ${angelPentagonRam.weight} / II ${angelPentagonRam2.weight} / III ${angelPentagonRam3.weight}`]
        ]),
        zh ? "第 1 旗前不会自然出现；移动加速逻辑和同级三角攻城锤一致" : "Does not naturally appear before Flag 1; movement acceleration matches the same-rank Triangle Ram"
      ],
      description: zh
        ? "冲锋变体，外观为两个面贴在一起的五边形。第一次被阻挡时不造成伤害，而是获得带光环的 2 秒飞行。此效果触发后，再次被阻挡时会造成法术冲撞伤害并消失。无论是否触发过飞行，死亡时都会靠前生成同等级天使五边形，靠后生成同等级五边形。"
        : "Charging variant drawn as two face-linked pentagons. The first time it is blocked, it deals no damage and gains 2s Flying with a halo. After that effect has triggered, the next block deals magic ram damage and makes it disappear. Whether or not Flying has triggered, death spawns a same-rank Angel Pentagon ahead and a same-rank Pentagon behind."
    },
    {
      title: zh ? "倒三角系列" : "Inverted Triangle Series",
      enemyKind: "invertedTriangle",
      lines: [
        statLine([
          [t("label.hp"), invertedTriangle.hp],
          [t("label.armor"), invertedTriangle.armor],
          [t("label.mr"), invertedTriangle.magicResistance],
          [
            t("label.atk"),
            `I ${damageText(invertedTriangle.damage, invertedTriangle.damageType)} / II ${damageText(invertedTriangle2.damage, invertedTriangle2.damageType)} / III ${damageText(invertedTriangle3.damage, invertedTriangle3.damageType)}`
          ],
          [t("label.speed"), `I ${speedText("invertedTriangle")} / II ${speedText("invertedTriangle2")} / III ${speedText("invertedTriangle3")}`]
        ]),
        zh
          ? `权重 I/II/III：${invertedTriangle.weight} / ${invertedTriangle2.weight} / ${invertedTriangle3.weight}`
          : `Weight I/II/III: ${invertedTriangle.weight} / ${invertedTriangle2.weight} / ${invertedTriangle3.weight}`,
        zh ? "被同一座塔连续阻挡 2s 后触发" : "Triggers after being blocked by the same tower for 2s"
      ],
      description: zh
        ? "高速法抗自爆单位。若 2 秒内一直被同一座塔阻挡，会消失并爆炸，对阻挡者造成法术伤害。"
        : "Fast magic-resistant detonator. If the same tower blocks it for 2 seconds, it disappears and deals magic damage to that blocker."
    },
    {
      title: zh ? "梯形系列" : "Trapezoid Series",
      enemyKind: "trapezoid",
      lines: [
        statLine([
          [t("label.hp"), trapezoid.hp],
          [t("label.armor"), trapezoid.armor],
          [t("label.mr"), `I ${trapezoid.magicResistance} / II ${trapezoid2.magicResistance} / III ${trapezoid3.magicResistance}`],
          [t("label.atk"), damageText(trapezoid.damage, trapezoid.damageType)],
          [t("label.speed"), speedText("trapezoid")],
          [t("label.weight"), `I ${trapezoid.weight} / II ${trapezoid2.weight} / III ${trapezoid3.weight}`]
        ]),
        zh ? "每秒攻击 1 次" : "Attacks once per second"
      ],
      description: zh
        ? "高法抗重装近战单位。攻击造成攻击力 100% 的物理伤害。"
        : "Heavily magic-resistant melee unit. Attacks deal 100% ATK as physical damage."
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
      title: zh ? "三角迫击炮系列" : "Triangle Mortar Series",
      enemyKind: "mortarTriangle",
      lines: [
        statLine([
          [t("label.hp"), mortarTriangle.hp],
          [t("label.armor"), mortarTriangle.armor],
          [t("label.mr"), mortarTriangle.magicResistance],
          [t("label.atk"), damageText(mortarTriangle.damage, mortarTriangle.damageType)],
          [t("label.speed"), speedText("mortarTriangle")],
          [t("label.weight"), `I ${mortarTriangle.weight} / II ${mortarTriangle2.weight} / III ${mortarTriangle3.weight}`]
        ]),
        zh ? "每 15 秒发射 3x3 物理迫击弹；II/III 分别连射 2/3 发，连射窗口固定为攻击间隔五分之一" : "Fires 3x3 physical mortars every 15s; II/III fire 2/3 shots with the volley window fixed at one fifth of its attack interval"
      ],
      description: zh
        ? "若自身正被阻挡，会优先锁定阻挡自己的塔；否则锁定场上阻挡敌怪数最多的塔，若相同则瞄准更晚放置的塔。锁定 N 时落点会被 N 改写。命中 R 时，R 会照常受伤并把迫击弹反射回发射者。"
        : "If blocked, it targets its own blocker first. Otherwise it targets the tower blocking the most enemies, breaking ties by later placement. If it locks onto N, N rewrites the landing point. If it hits R, R still takes damage and reflects a matching mortar back at the shooter."
    },
    {
      title: zh ? "五边形系列" : "Pentagon Series",
      enemyKind: "pentagon",
      lines: [
        statLine([
          [t("label.hp"), pentagon.hp],
          [t("label.armor"), pentagon.armor],
          [t("label.mr"), pentagon.magicResistance],
          [t("label.atk"), damageText(pentagon.damage, pentagon.damageType)],
          [t("label.speed"), speedText("pentagon")],
          [t("label.weight"), `I ${pentagon.weight} / II ${pentagon2.weight} / III ${pentagon3.weight}`]
        ]),
        zh ? "每 15 秒发射红色 # 法术迫击弹，3x3 范围伤害；I/II/III 连发 1/2/3；第 1 旗前不会自然出现" : "Fires red # magic mortars every 15s with 3x3 AOE; volley I/II/III: 1 / 2 / 3; does not naturally appear before Flag 1"
      ],
      description: zh
        ? "锁定型远程敌怪，行为类似三角迫击炮。若自身正被阻挡，会优先锁定阻挡自己的塔；否则锁定场上最后放置的塔，忽略等级。外观为面朝下的五边形。"
        : "Locked ranged enemy, similar to Triangle Mortar. If blocked, it targets its own blocker first; otherwise it targets the most recently placed tower on the field, ignoring level. Its pentagon body has a downward-facing side."
    },
    {
      title: zh ? "天使五边形系列" : "Angel Pentagon Series",
      enemyKind: "angelPentagon",
      lines: [
        statLine([
          [t("label.hp"), angelPentagon.hp],
          [t("label.armor"), angelPentagon.armor],
          [t("label.mr"), angelPentagon.magicResistance],
          [t("label.atk"), damageText(angelPentagon.damage, angelPentagon.damageType)],
          [t("label.speed"), speedText("angelPentagon")],
          [t("label.weight"), `I ${angelPentagon.weight} / II ${angelPentagon2.weight} / III ${angelPentagon3.weight}`]
        ]),
        zh ? "第 1 旗前不会自然出现；羽翼：15 技力满后，让自身和 3x3 范围内敌怪飞行并获得 100% 移速加成，持续 3s；II/III 初始 2/4 技力且每秒回复 1.2/1.4 技力" : "Does not naturally appear before Flag 1. Wings: at 15 SP, gives itself and enemies in a 3x3 area Flying and +100% movement speed for 3s; II/III start at 2/4 SP and regenerate 1.2/1.4 SP/s"
      ],
      description: zh
        ? "支援型近战敌怪，外观为端点朝下且带小光环的五边形。飞行单位不会被阻挡，显示位置会更靠上。羽翼持续期间不会回复技力，结束后才重新蓄力。"
        : "Support melee enemy. Its pentagon point faces downward and it has a small halo. Flying units cannot be blocked and render slightly higher. It does not regenerate SP while Wings is active, then starts charging again after the effect ends."
    },
    {
      title: zh ? "大天使七边形领袖系列" : "Archangel Heptagon Leader Series",
      enemyKind: "archangelHeptagon",
      lines: [
        statLine([
          [t("label.hp"), `I ${archangelHeptagon.hp} / II ${archangelHeptagon2.hp} / III ${archangelHeptagon3.hp}`],
          [t("label.armor"), archangelHeptagon.armor],
          [t("label.mr"), archangelHeptagon.magicResistance],
          [t("label.atk"), `${damageText(archangelHeptagon.damage, archangelHeptagon.damageType)} / 2s`],
          [t("label.speed"), `I ${speedText("archangelHeptagon")} / II ${speedText("archangelHeptagon2")} / III ${speedText("archangelHeptagon3")}`],
          [t("label.weight"), zh ? "旗帜固定" : "flag fixed"]
        ]),
        zh
          ? `领袖敌人；常态飞行，外观为两层光环七边形。出生后 3 秒内获得 +150% 移速和高空飞行。升华：初始 10 技力，15 技力满后，让自身和半径 2.5 格内敌怪飞行并获得 +100% 移速，持续 6s；I/II/III 每秒回复 1 技力，生命值线性提升`
          : `Leader enemy with permanent Flying and a two-layer halo. For 3s after spawning, gains +150% movement speed and High Flight. Ascension: starts at 10 SP; at 15 SP, gives itself and enemies within a 2.5-cell radius Flying and +100% movement speed for 6s; I/II/III regenerate 1 SP/s, with linearly increasing HP`
      ],
      description: zh
        ? "大天使七边形会每 2 秒对阻挡者造成一次 100% 攻击力的法术伤害。若出现在关卡出怪池中，会在旗帜波固定刷新 1 个且不计入常规波次权重。它不会因其他技能或小怪获得额外飞行光环；收到飞行效果时改为高空飞行，高空飞行期间自身两层光环变为金色，且不会被阻挡、锁定、直接命中或受到塔 AOE。"
        : "Archangel Heptagon attacks its blocker every 2s for 100% attack as magic damage. If present in a level pool, one fixed spawn appears on flag waves and it does not consume regular wave weight. It does not gain extra Flying halos from other skills or minions; incoming Flying effects become High Flight instead, turning its own two halos gold while it cannot be blocked, targeted, directly hit, or damaged by tower AOE."
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
          [t("label.weight"), `I ${shootingTriangle.weight} / II ${shootingTriangle2.weight} / III ${shootingTriangle3.weight}`]
        ]),
        zh
          ? "连发 I/II/III：1 / 2 / 3"
          : "Volley I/II/III: 1 / 2 / 3",
        zh ? "攻击间隔：2s，弹幕命中塔时造成伤害" : "Attack interval: 2s, projectile damages towers on hit"
      ],
      description: zh
        ? "远程敌怪。三角尖端朝向底线，会发射带红色的物理弹幕。"
        : "Ranged enemy. Its point faces the base and it fires red-tinted physical projectiles."
    },
    {
      title: zh ? "射击五边形系列" : "Shooting Pentagon Series",
      enemyKind: "shootingPentagon",
      lines: [
        statLine([
          [t("label.hp"), shootingPentagon.hp],
          [t("label.armor"), shootingPentagon.armor],
          [t("label.mr"), shootingPentagon.magicResistance],
          [t("label.atk"), damageText(shootingPentagon.damage, shootingPentagon.damageType)],
          [t("label.speed"), speedText("shootingPentagon")],
          [t("label.weight"), `I ${shootingPentagon.weight} / II ${shootingPentagon2.weight} / III ${shootingPentagon3.weight}`]
        ]),
        zh ? "攻击间隔 4s；I/II/III 连发 1/2/3；红色激光瞬间结算，会穿透塔，直到命中第一座法抗大于 0 的塔后停止" : "Attack interval: 4s; volley I/II/III: 1 / 2 / 3; instant red laser pierces towers until it hits the first tower with MR greater than 0"
      ],
      description: zh
        ? "远程法术敌怪，性质类似菱形。外观为一个顶点朝向底线的五边形。激光不是弹射物，会同时对同一行路径上的塔造成法术伤害，不会被 R 反弹，并在第一座有法抗的塔处停止。"
        : "Ranged magic enemy, similar to Diamond. Its pentagon body has one point facing the base. The laser is not a projectile: it damages towers in its lane instantly, cannot be reflected by R, and stops at the first tower with magic resistance."
    },
    {
      title: zh ? "菱形系列" : "Diamond Series",
      enemyKind: "diamond",
      lines: [
        statLine([
          [t("label.hp"), diamond.hp],
          [t("label.armor"), diamond.armor],
          [t("label.mr"), diamond.magicResistance],
          [t("label.atk"), damageText(diamond.damage, diamond.damageType)],
          [t("label.speed"), speedText("diamond")],
          [t("label.weight"), `I ${diamond.weight} / II ${diamond2.weight} / III ${diamond3.weight}`]
        ]),
        zh ? `权重 I/II/III：${diamond.weight} / ${diamond2.weight} / ${diamond3.weight}，连发 I/II/III：1 / 2 / 3` : `Weight I/II/III: ${diamond.weight} / ${diamond2.weight} / ${diamond3.weight}, volley I/II/III: 1 / 2 / 3`,
        zh ? "第 1 旗前不会自然出现；攻击间隔 2s" : "Does not naturally appear before Flag 1; attack interval: 2s"
      ],
      description: zh
        ? "远程法术敌怪。发射红色 * 弹幕，命中塔时造成法术伤害。"
        : "Ranged magic enemy. Fires red * projectiles that deal magic damage to towers."
    },
    {
      title: zh ? "六边形系列" : "Hexagon Series",
      enemyKind: "hexagon",
      lines: [
        statLine([
          [t("label.hp"), hexagon.hp],
          [t("label.armor"), hexagon.armor],
          [t("label.mr"), hexagon.magicResistance],
          [t("label.atk"), damageText(hexagon.damage, hexagon.damageType)],
          [t("label.speed"), speedText("hexagon")],
          [t("label.weight"), `I ${hexagon.weight} / II ${hexagon2.weight} / III ${hexagon3.weight}`]
        ]),
        zh ? "半径 1.4 格装甲光环；I/II/III +50/+80/+110 护甲；每秒 +1 技力，20 技力满后可治愈" : "1.4-cell Armor aura; I/II/III grant +50/+80/+110 armor; gains +1 SP/s, heals at 20 SP"
      ],
      description: zh
        ? "支援型近战敌怪。自身和半径 1.4 格内敌怪获得装甲，Boss 碰撞体接触光环时也会获得装甲；六边形 1 提供 +50 护甲，六边形 2 提供 +80 护甲，可加算叠加，普通敌怪显示 ⬡。治愈每秒回复 1 技力，上限 20，满技力且范围内有可治疗目标时消耗 20 技力，治疗范围内生命百分比最低的缺血敌怪，治疗量为自身最大生命的 30%。外观是一条边朝向底线的六边形。"
        : "Support melee enemy. It and enemies within 1.4 cells gain Armor, and Bosses also gain Armor while their hitbox touches the aura. Hexagon I/II/III grant +50/+80/+110 armor, stacking additively and shown as ⬡ on ordinary enemies. Heal gains 1 SP/s up to 20; at full SP, if a healing target exists, it consumes 20 SP and restores the lowest-HP-percent damaged enemy in range for 30% of its own max HP. Its flat side faces the base."
    },
    {
      title: zh ? "冲锋六边形系列" : "Charging Hexagon Series",
      enemyKind: "chargingHexagon",
      lines: [
        statLine([
          [t("label.hp"), chargingHexagon.hp],
          [t("label.armor"), chargingHexagon.armor],
          [t("label.mr"), chargingHexagon.magicResistance],
          [t("label.atk"), `I ${damageText(chargingHexagon.damage, chargingHexagon.damageType)} / 2s; II ${damageText(chargingHexagon2.damage, chargingHexagon2.damageType)} / 1s; III ${damageText(chargingHexagon3.damage, chargingHexagon3.damageType)} / 0.67s`],
          [t("label.speed"), speedText("chargingHexagon")],
          [t("label.weight"), `I ${chargingHexagon.weight} / II ${chargingHexagon2.weight} / III ${chargingHexagon3.weight}`]
        ]),
        zh ? "同行且更靠后的敌怪获得不可叠加的 50% 移速加成" : "Enemies in the same lane behind it gain a non-stacking 50% movement speed bonus"
      ],
      description: zh
        ? "高速近战支援敌怪。外观为尖端朝向底线的六边形，近战攻击造成法术伤害。它会推进同一行、距离底线更远的敌怪。"
        : "Fast melee support enemy. Its hexagon point faces the base, and its melee attack deals magic damage. It pushes enemies in the same lane that are farther from the base."
    },
    {
      title: zh ? "六边形重锤系列" : "Hex Mace Series",
      enemyKind: "hexMace",
      lines: [
        statLine([
          [t("label.hp"), hexMace.hp],
          [t("label.armor"), hexMace.armor],
          [t("label.mr"), hexMace.magicResistance],
          [t("label.atk"), `I ${damageText(hexMace.damage, hexMace.damageType)} / II ${damageText(hexMace2.damage, hexMace2.damageType)} / III ${damageText(hexMace3.damage, hexMace3.damageType)}`],
          [t("label.speed"), speedText("hexMace")],
          [t("label.weight"), `I ${hexMace.weight} / II ${hexMace2.weight} / III ${hexMace3.weight}`]
        ]),
        zh
          ? "第 1 旗前不会自然出现；初始速度为 0，移动中持续朝面朝方向加速，7 格达到 4 倍基础速度"
          : "Does not naturally appear before Flag 1; starts at 0 velocity and continuously accelerates toward its facing direction, reaching 4x base speed after 7 cells"
      ],
      description: zh
        ? "冲撞型小怪，外观为两个共边六边形。被塔阻挡时不会自毁，而是按当前实际移速造成伤害：10 速度为 100% 基础攻击，20 速度为 200%，以此类推；随后反弹当前速度，但面朝方向不变，并继续朝面朝方向加速。死亡时会在面朝方向前方生成同等级冲锋六边形，后方生成同等级普通六边形。"
        : "Ramming minion drawn as two edge-linked hexagons. When blocked, it does not self-destruct; it deals damage based on current actual speed: 10 speed is 100% base attack, 20 speed is 200%, and so on. It then reflects its current velocity while keeping its facing direction, and keeps accelerating toward that facing direction. On death, it spawns same-rank Charging Hexagon ahead of its facing direction and same-rank Hexagon behind."
    },
    {
      title: zh ? "六边形术战壁垒领袖系列" : "Hex Spell Bulwark Leader Series",
      enemyKind: "hexSpellBulwark",
      lines: [
        statLine([
          [t("label.hp"), `I ${hexSpellBulwark.hp} / II ${hexSpellBulwark2.hp} / III ${hexSpellBulwark3.hp}`],
          [t("label.armor"), hexSpellBulwark.armor],
          [t("label.mr"), hexSpellBulwark.magicResistance],
          [t("label.atk"), damageText(hexSpellBulwark.damage, hexSpellBulwark.damageType)],
          [t("label.speed"), speedText("hexSpellBulwark")],
          [t("label.weight"), zh ? "旗帜固定" : "flag fixed"]
        ]),
        zh
          ? "领袖敌人；不计入常规出怪权重。为本行敌怪提供可加算法抗，包括自身；I/II/III 为 +40/+50/+60。"
          : "Leader enemy; does not count toward regular wave weight. Grants enemies in its lane additive MR, including itself: rank I/II/III +40/+50/+60"
      ],
      description: zh
        ? "外观为竖起来的六边形重锤。每秒攻击一次，造成攻击力 100% 的法术伤害；同一行的敌怪获得法抗加成，多个六边形术战壁垒可以叠加。获得加成的敌怪会显示浅蓝色六边形标识。"
        : "Drawn as a vertical Hex Mace. Attacks once per second, dealing 100% ATK as magic damage. Enemies in the same lane gain additive magic resistance, and multiple Hex Spell Bulwarks stack. Affected enemies show a light-blue hexagon icon."
    },
    {
      title: zh ? "潜地箭头领袖系列" : "Burrow Arrow Leader Series",
      enemyKind: "burrowArrow",
      lines: [
        statLine([
          [t("label.hp"), burrowArrow.hp],
          [t("label.armor"), burrowArrow.armor],
          [t("label.mr"), burrowArrow.magicResistance],
          [t("label.atk"), `I ${damageText(burrowArrow.damage, burrowArrow.damageType)} / II ${damageText(burrowArrow2.damage, burrowArrow2.damageType)} / III ${damageText(burrowArrow3.damage, burrowArrow3.damageType)}`],
          [t("label.speed"), speedText("burrowArrow")],
          [t("label.weight"), zh ? "旗帜固定" : "flag fixed"]
        ]),
        zh
          ? "领袖敌人：不计入常规出怪权重；等级 I/II/III 最多装载总等级 5/10/15 的非领袖小怪"
          : "Leader enemy: does not count toward regular wave weight; rank I/II/III can load non-leader minions with total rank up to 5/10/15"
      ],
      description: zh
        ? "碰到它的非领袖小怪会被装载。装满或出场 6 秒后潜地，只露出上侧小角；潜地期间不会被常规弹幕锁定或直接命中，但仍会被 AOE 波及，并获得 +300% 移速。在底线前一格中心出土后，它和装载的小怪都会转向另一侧，卸载只会发生一次。若它在装载期间死亡，装载的小怪会立刻在原地出现且不会反转朝向。"
        : "Non-leader minions that touch it are loaded. Once full or after 6s on the field, it burrows and only its upper tip remains visible; while burrowed it cannot be targeted or directly hit by normal projectiles, but AOE still affects it, and it gains +300% movement speed. It resurfaces at the center of the cell before the base, turns itself and loaded minions around, and unloads only once. If it dies while carrying cargo, loaded minions immediately appear without reversing direction."
    },
    {
      title: zh ? "斜坡三角形领袖系列" : "Slope Triangle Leader Series",
      enemyKind: "slopeTriangle",
      lines: [
        statLine([
          [t("label.hp"), `I ${slopeTriangle.hp} / II ${slopeTriangle2.hp} / III ${slopeTriangle3.hp}`],
          [t("label.armor"), slopeTriangle.armor],
          [t("label.mr"), slopeTriangle.magicResistance],
          [t("label.atk"), damageText(slopeTriangle.damage, slopeTriangle.damageType)],
          [t("label.speed"), `I ${speedText("slopeTriangle")} / II ${speedText("slopeTriangle2")} / III ${speedText("slopeTriangle3")}`],
          [t("label.weight"), zh ? "旗帜固定" : "flag fixed"]
        ]),
        zh
          ? "被阻挡期间停在原地且不攻击；只有此时才会让接触它、速度方向与斜坡朝向一致的非领袖小怪进入高空飞行"
          : "While blocked, it stays in place and does not attack; only then can it launch touching non-leader minions whose velocity direction matches its facing direction into High Flight"
      ],
      description: zh
        ? "斜坡三角形 I/II/III 不进行攻击。它只有在当前被塔阻挡时才作为斜坡生效，本体被阻挡在原地；若阻挡解除，它会继续按自身速度移动。生效期间，接触到它、且当前速度方向与斜坡三角形面朝方向一致的普通小怪会沿速度方向抛物线飞出；这里比较的是小怪的速度方向，不是小怪面朝方向。高空飞行落地前不会被阻挡、锁定、直接命中或受到塔 AOE。飞行距离按当前实际速度计算：每 10 速度飞 1.5 格。领袖、Boss 和 Boss 眷属不会被发射。"
        : "Slope Triangle I/II/III does not attack. It acts as a ramp only while currently blocked by a tower, staying in place while blocked; once unblocked, it keeps moving at its own speed. During that block, ordinary minions touching it are launched forward only if their current velocity direction matches the Slope Triangle's facing direction. This checks the minion's velocity direction, not the minion's facing direction. Before landing, High Flight enemies cannot be blocked, targeted, directly hit, or damaged by tower AOE. Flight distance uses current actual speed: every 10 speed sends it 1.5 cells. Leaders, Bosses, and Boss companions are not launched."
    },
    {
      title: zh ? "心形领袖系列" : "Heart Leader Series",
      enemyKind: "heart",
      lines: [
        statLine([
          [t("label.hp"), heart.hp],
          [t("label.armor"), heart.armor],
          [t("label.mr"), heart.magicResistance],
          [t("label.atk"), `I ${damageText(heart.damage, heart.damageType)} / II ${damageText(heart2.damage, heart2.damageType)} / III ${damageText(heart3.damage, heart3.damageType)} / 5s`],
          [t("label.speed"), speedText("heart")],
          [t("label.weight"), zh ? "旗帜固定" : "flag fixed"]
        ]),
        zh
          ? "领袖敌人：不计入常规出怪权重；若在关卡出怪池中，只会在旗帜波固定刷出 1 个，且没有随机移速浮动"
          : "Leader enemy: does not count toward regular wave weight; if present in a level pool, one fixed spawn appears on flag waves and it has no random speed variance"
      ],
      description: zh
        ? "心形 I/II/III 会让同一行且位于自己身后的敌怪获得 50% 移速加成。每 5 秒以自身为中心释放半径 1.75 格、向外衰减的粉色爱心 AOE，造成真实伤害。引领技能每秒回复 1 技力，5 技力满时把本列和身后四列、上下两行内的普通小怪牵引到本行；领袖、Boss 和 Boss 眷属不会被牵引。"
        : "Heart I/II/III gives same-lane enemies behind it +50% movement speed. Every 5s it releases a pink heart AOE centered on itself with 1.75-cell radius and outward falloff, dealing true damage. Lead gains 1 SP/s; at 5 SP, it pulls ordinary minions in its column plus four columns behind, within two lanes up/down, into its lane. Leaders, Bosses, and Boss companions are not pulled."
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
          ? "晋升：90技力满后消耗30，将最近 3 个 I 小怪升为 II；不足 3 个目标时不发动。推进：120技力满后在每一行召唤一个正方形。"
          : "Promotion: at 90 SP, spend 30 to promote the nearest 3 rank I minions to II; it will not activate with fewer than 3 targets. Advance: at 120 SP, summon one square in each lane.",
        zh
          ? "正方体 II 额外拥有晋升2：180技力满后消耗40，将最近 3 个 II 小怪升为 III；不足 3 个目标时不发动。"
          : "Cube II also has Promotion 2: at 180 SP, spend 40 to promote the nearest 3 rank II minions to III; it will not activate with fewer than 3 targets."
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
          [t("label.hp"), `I ${CUBE_BOSS_STATS.tetrahedron.hp} / II ${CUBE_BOSS_STATS.tetrahedron2.hp}`],
          [t("label.armor"), CUBE_BOSS_STATS.tetrahedron.armor],
          [t("label.mr"), CUBE_BOSS_STATS.tetrahedron.magicResistance],
          [t("label.speed"), `I ${CUBE_BOSS_STATS.tetrahedron.speed} / II ${CUBE_BOSS_STATS.tetrahedron2.speed}`],
          [t("label.atk"), `${damageText(CUBE_BOSS_CONTACT_DAMAGE, "physical")} / ${CUBE_BOSS_CONTACT_INTERVAL}s`]
        ]),
        zh
          ? "正四面体 II 使用同一套技能，但 Boss 机制召唤的倒三角和射击三角均为 II。"
          : "Tetrahedron II uses the same skill kit, but all Inverted/Shooting Triangles summoned by Boss mechanics are rank II.",
        zh
          ? "冲锋：60技力满后消耗30，使所有普通敌怪在 7 秒内获得加速，移动速度变为 200%；正四面体 II 为 250%。并使压制技力 +15。"
          : "Charge: at 60 SP, spend 30 to give ordinary enemies 7s Haste, raising movement speed to 200%; Tetrahedron II uses 250%. It also gives Suppression +15 SP.",
        zh
          ? "冲击：120技力满后消耗60，在 Boss 前方两列每行召唤倒三角 I，并使冲锋技力 +10。压制：160技力满后消耗40，在出怪线每行召唤射击三角 I，并使冲击技力 +20。"
          : "Impact: at 120 SP, spend 60 to summon Inverted Triangle I in every lane across two columns in front of the Boss, and gives Charge +10 SP. Suppression: at 160 SP, spend 40 to summon Shooting Triangle I in every lane at the spawn line, and gives Impact +20 SP.",
        zh
          ? "首次降至50%生命时，在最远离底线的两列每格召唤倒三角 I，并立刻填满冲锋技力。"
          : "The first time HP reaches 50% or lower, summons Inverted Triangle I in every cell of the two columns farthest from the base and immediately fills Charge SP.",
        zh
          ? "首次降至10%生命时获得15秒无敌和60秒300%速度加速，并在最远离底线的五列每格召唤倒三角 I；之后所有技能自然回技速度永久翻倍。若此前被直接击杀，则锁1血并触发同一套效果。孤注一掷：50%生命以下每秒回1技力，10满后给接触 Boss 的敌怪永久力量，并使冲锋 +5。"
          : "The first time HP reaches 10% or lower, gains 15s Invincible and 60s Boss Haste at 300% speed, summons Inverted Triangle I in every cell of the five columns farthest from the base, and permanently doubles all skill natural SP gain. If it would die before this triggers, it locks at 1 HP and triggers the same package. Last Stand: below 50% HP, gains 1 SP/s; at 10 SP, grants permanent Power to enemies touching the Boss and gives Charge +5 SP."
      ],
      description: zh
        ? "Boss 不会被阻挡，也不会随血量缩小；到达底线会失败，死亡会直接胜利。"
        : "Boss cannot be blocked and does not shrink with HP. Reaching the base is defeat; killing it clears the stage."
    },
    {
      title: zh ? "正十二面体 Boss 系列" : "Dodecahedron Boss Series",
      icon: "dodecahedron",
      lines: [
        statLine([
          [t("label.hp"), `I ${CUBE_BOSS_STATS.dodecahedron.hp} / II ${CUBE_BOSS_STATS.dodecahedron2.hp}`],
          [t("label.armor"), CUBE_BOSS_STATS.dodecahedron.armor],
          [t("label.mr"), CUBE_BOSS_STATS.dodecahedron.magicResistance],
          [t("label.speed"), CUBE_BOSS_STATS.dodecahedron.speed],
          [t("label.atk"), `${damageText(CUBE_BOSS_CONTACT_DAMAGE, "physical")} / ${CUBE_BOSS_CONTACT_INTERVAL}s`]
        ]),
        zh
          ? `开局拥有 3 个环绕眷属：I ${dodecahedronCompanion.hp} 生命 / II ${dodecahedronCompanion2.hp} 生命；护甲 ${dodecahedronCompanion.armor} / 法抗 ${dodecahedronCompanion.magicResistance}`
          : `Starts with 3 orbiting companions: I ${dodecahedronCompanion.hp} HP / II ${dodecahedronCompanion2.hp} HP; ${dodecahedronCompanion.armor} armor / ${dodecahedronCompanion.magicResistance} MR`,
        zh ? "眷属中心带有 I/II；有眷属存活时，正十二面体获得 95% 全伤害减免，全部眷属死亡后移除。" : "Companions show I/II at the center; while any companion is alive, Dodecahedron gains 95% all-damage reduction, removed after all companions die.",
        zh
          ? "眷属攻击循环：20s 后连射射击五边形激光（I 4 发 / II 8 发）；再 30s 后连射五边形迫击（I 2 发 / II 4 发）；再 30s 后释放 3x3 羽翼。"
          : "Companion attack loop: after 20s, fires Shooting-Pentagon lasers (I 4 / II 8); after 30s, fires Pentagon mortars (I 2 / II 4); after 30s, casts 3x3 Wings.",
        zh
          ? "眷属运动循环：旋转 47s，1s 平移到 Boss 前方一列并分布在本行/上二行/下二行，停留 47s，再 1s 回到旋转。"
          : "Companion motion loop: orbits for 47s, spends 1s shifting to the front column on the boss lane / two lanes up / two lanes down, holds 47s, then spends 1s returning to orbit.",
        zh
          ? "第 1 个眷属死亡时，Boss 在自身三行连射射击五边形激光（I 7 次 / II 14 次）；第 2 个眷属死亡时，按五边形规则依次瞄准不同目标发射法术迫击弹（I 4 个 / II 6 个）。"
          : "When the 1st companion dies, the Boss fires Shooting-Pentagon lasers across its 3 lanes (I 7 volleys / II 14 volleys). When the 2nd dies, it fires magic mortars at different Pentagon-rule targets in order (I 4 / II 6).",
        zh
          ? "每次眷属死亡时，存活眷属获得 10s 无敌。全部眷属死亡后，正十二面体失去眷属减伤，且无尽羽翼开始回技：4 技力满后消耗 4，使接触 Boss 碰撞体且未飞行的敌怪获得 7s 羽翼飞行。"
          : "Each companion death gives surviving companions 10s Invincible. After all companions die, Dodecahedron loses companion damage reduction and Endless Wings starts charging: at 4 SP, spend 4 to give 7s Wings Flying to non-flying enemies touching the Boss hitbox."
      ],
      description: zh
        ? "Boss 本体不会被阻挡，也不会随血量缩小；眷属不会被阻挡，但会像普通敌怪一样随血量变小。到达底线会失败，死亡会直接胜利。"
        : "The Boss body cannot be blocked and does not shrink with HP. Companions cannot be blocked, but shrink with HP like ordinary enemies. Reaching the base is defeat; killing it clears the stage."
    },
    {
      title: zh ? "正八面体 Boss 系列" : "Octahedron Boss Series",
      icon: "octahedron",
      lines: [
        statLine([
          [t("label.hp"), `I ${CUBE_BOSS_STATS.octahedron.hp} / II ${CUBE_BOSS_STATS.octahedron2.hp}`],
          [t("label.armor"), CUBE_BOSS_STATS.octahedron.armor],
          [t("label.mr"), CUBE_BOSS_STATS.octahedron.magicResistance],
          [t("label.speed"), CUBE_BOSS_STATS.octahedron.speed],
          [t("label.atk"), `${damageText(CUBE_BOSS_CONTACT_DAMAGE, "physical")} / ${CUBE_BOSS_CONTACT_INTERVAL}s`]
        ]),
        zh
          ? "75% / 50% / 25% 生命时各生成一个共享血条的正八面体；每个实体的状态效果独立。"
          : "At 75% / 50% / 25% HP, spawns another Octahedron that shares the HP bar; each body keeps independent effects.",
        zh
          ? "75% 分身出现在网格内底线侧中路并反向移动；50% 分身出现在网格内左起第 8 列顶部并下行；25% 分身出现在网格内左起第 5 列底部并上行。"
          : "The 75% copy appears inside the grid at the base-side middle and moves backward; the 50% copy appears inside the grid at the top of column 8 and moves down; the 25% copy appears inside the grid at the bottom of column 5 and moves up.",
        zh
          ? "2 / 3 / 4 个正八面体本体在场时，所有正八面体获得额外 20% / 40% / 60% 全伤害减免；II 的 25% 召唤序列会召唤 2 级领袖。"
          : "With 2 / 3 / 4 Octahedron bodies on the field, all Octahedrons gain an additional 20% / 40% / 60% all-damage reduction; II's 25% reinforcement sequence summons rank-2 leaders."
      ],
      description: zh
        ? "所有正八面体都可以被攻击，伤害扣同一条 Boss 血量。只有向底线移动的实体会触发失败。"
        : "All Octahedron bodies can be attacked and damage the shared Boss HP. Only bodies moving toward the base can trigger defeat."
    },
    {
      title: zh ? "正二十面体 Boss 系列" : "Icosahedron Boss Series",
      icon: "icosahedron",
      lines: [
        statLine([
          [t("label.hp"), "P1 300000 / P2 200000 / P3 300000"],
          [t("label.armor"), "P1 3200 / P2 0"],
          [t("label.mr"), "P1 20 / P2 0"],
          [t("label.speed"), CUBE_BOSS_STATS.icosahedron.speed],
          [t("label.atk"), `${damageText(CUBE_BOSS_CONTACT_DAMAGE, "physical")} / ${CUBE_BOSS_CONTACT_INTERVAL}s`]
        ]),
        zh
          ? "第五章主线终章 Boss。P1 使用终极推进、心跳α、心跳β；P2 拥有 50% 全伤害减免，使用正四面体II式技能组和飞跃，召唤物为3级，冲击/压制初始技力为75，飞跃初始技力为35；P3 使用5-5敌池家族的可用1/2/3级，且本战领袖均为3级。"
          : "Chapter 5 finale Boss. Phase 1 uses Ultimate Advance, Heartbeat Alpha, and Heartbeat Beta; Phase 2 has 50% all-damage reduction, uses a Tetrahedron II-style skill kit plus Leap, summons rank III minions, starts Impact/Suppression at 75 SP, and starts Leap at 35 SP; Phase 3 uses the 5-5 enemy family expanded to available rank I/II/III variants, and leaders in this fight are rank III."
      ],
      description: zh
        ? "Boss 不会被阻挡，也不会随血量缩小；到达底线会失败，死亡会直接胜利。正二十面体 I 的碰撞体为 4.95x4.95 格。"
        : "Boss cannot be blocked and does not shrink with HP. Reaching the base is defeat; killing it clears the stage. Icosahedron I uses a 4.95x4.95-cell hitbox."
    },
    {
      title: zh ? "小星形十二面体 Boss 系列" : "Small Stellated Dodecahedron Boss Series",
      icon: "smallStellatedDodecahedron",
      lines: [
        statLine([
          [t("label.hp"), CUBE_BOSS_STATS.smallStellatedDodecahedron.hp],
          [t("label.armor"), CUBE_BOSS_STATS.smallStellatedDodecahedron.armor],
          [t("label.mr"), CUBE_BOSS_STATS.smallStellatedDodecahedron.magicResistance],
          [t("label.speed"), CUBE_BOSS_STATS.smallStellatedDodecahedron.speed],
          [t("label.atk"), `${damageText(CUBE_BOSS_CONTACT_DAMAGE, "physical")} / ${CUBE_BOSS_CONTACT_INTERVAL}s`]
        ]),
        zh ? "白板 Boss：没有技力技能。当前用于测试小星形十二面体线框绘制。" : "Whiteboard Boss: no SP skills. Currently used to test the small stellated dodecahedron wireframe."
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
  if (card.attackSpeed !== undefined) {
    effectParts.push(`${isZh() ? "攻速" : "AS"} ${card.attackSpeed} (${seconds(attackIntervalMs(card.attackSpeed))})`);
  }
  if (card.rangeCells) {
    effectParts.push(`${isZh() ? "范围" : "range"} ${card.rangeCells}`);
  }
  if (card.hitProduceAmount) {
    effectParts.push(`${isZh() ? "受击" : "on hit"} ${EFFECT_SYMBOLS.chars}${card.hitProduceAmount}`);
  }
  if (card.attackProduceAmount) {
    effectParts.push(`${isZh() ? "命中" : "attack hit"} ${EFFECT_SYMBOLS.chars}${card.attackProduceAmount}`);
  }
  const secondLine = `${t("label.effect")}: ${effectParts.join("  ")}`;
  return [firstLine, secondLine, `${t("label.upgrade")}: ${towerUpgradeText(card.id)}`];
}

function towerDescription(id: CardId) {
  const zh = isZh();
  const descriptions: Record<CardId, string> = {
    A: zh ? "直线物理射手。沿本行平射，命中后有碎片粒子。" : "Straight physical shooter. Fires along its lane with hit shards.",
    a: zh ? "短程免费物理射手。机制类似 A，但只攻击自身和前方 4 格内的目标。" : "Free short-range physical shooter. Similar to A, but only attacks within itself plus 4 tiles ahead.",
    B: zh ? "防御塔。阻挡敌怪，只会对近战伤害反伤 400 物理伤害。" : "Defender. Blocks enemies and reflects 400 physical damage only against melee hits.",
    b: zh ? "小 b。放在已有塔上，短暂占格后让目标塔切换朝向；反向塔会镜像边框和字符，并显示黄色 < 标记。再次使用可转回正向。" : "Turn card. Place it on an existing tower; it briefly occupies the cell, then toggles that tower's facing. Reversed towers mirror their border and letter and show a yellow < marker. Use it again to turn the tower back.",
    t: zh ? "真实伤害增幅。放在已有塔上，短暂占格后让目标塔在持续时间内造成的所有伤害变为真实伤害；目标塔会显示比自动升级更外侧的金色光环。" : "True-damage amplifier. Place it on an existing tower; it briefly occupies the cell, then makes all damage dealt by the target tower become true damage for the duration. The target shows a gold ring outside the auto-upgrade ring.",
    C: zh ? "物理溅射炮。沿本行发射炮弹，命中后对 1.75 格半径造成随距离衰减的范围伤害。" : "Physical splash cannon. Fires down its lane and deals 1.75-cell radius splash with distance falloff on hit.",
    c: zh ? "极速钟。每秒回复 1 技力，20 满后显示边框；点击消耗全部技力，使自身进入 10 秒闪烁状态。所有激活的 c 会让基础费用 999 或以下的其他卡槽冷却速度变为等级和 +1 倍，c 自身卡槽冷却不受影响；Shift+点击可同时激活所有满技力的 c。" : "Speed clock. Gains 1 SP/s up to 20 and shows its border when full; clicking it spends all SP and makes it flash for 10s. Active c towers make other card-slot cooldown speed equal active level sum + 1 for cards with base cost 999 or lower; c's own card cooldown is unaffected. Shift-click activates all full c towers.",
    D: zh ? "纯防御塔。高护甲，用来拖住近战敌怪。" : "Pure defender with high armor for stalling melee enemies.",
    O: zh ? "抗法防御塔。机制和 D 类似，拥有高护甲和中等法术抗性。" : "Magic-resistant defender. Similar to D, with high armor and moderate magic resistance.",
    R: zh ? "反弹防御塔。机制和 O 类似；敌方弹幕击中它时仍会造成伤害，但弹幕会被反射为同伤害、同类型的我方弹幕。锁定迫击弹命中 R 时会被反射回发射者。" : "Reflect defender. Similar to O; enemy projectiles still damage it on hit, then reflect into friendly projectiles with the same damage and damage type. Locked mortars that hit R are reflected back at the shooter.",
    X: zh ? `生产塔。按攻速每 10 秒产生 ${EFFECT_SYMBOLS.chars}25，也是主要字符来源之一；热忱可以加快生产。` : `Producer. Generates ${EFFECT_SYMBOLS.chars}25 every 10s using attack speed, so Zeal speeds it up.`,
    x: zh ? "追踪法术射手。每次从攻击形四角发射 4 枚 > 法术追踪弹。小 x 开火时优先锁定离小 x 最近的可攻击飞行敌怪；没有飞行敌怪时锁定离小 x 最近的可攻击敌怪。追踪弹只追锁定目标，目标死亡或消失后才改为锁定离子弹最近的可攻击敌怪。" : "Homing magic attacker. Fires four > magic homing shots from the attack-shape corners. When x fires, it prioritizes the attackable Flying enemy nearest to x; if none exist, it locks the attackable enemy nearest to x. Shots keep chasing their locked target and only retarget to the nearest attackable enemy to the shot if that target dies or disappears.",
    Y: zh ? `受击生产塔。不攻击；每次受到攻击时产生 ${EFFECT_SYMBOLS.chars}12。` : `Hit producer. Does not attack; generates ${EFFECT_SYMBOLS.chars}12 each time it is attacked.`,
    d: zh ? "碎甲激光射手。沿本行发射浅蓝色法术激光，穿透敌怪，直到命中第一个拥有法术抗性的敌怪后停止。被命中的敌怪获得 10 秒碎甲，最终护甲降低 35%；重复命中会刷新持续时间。碎甲敌怪头顶显示白色 ▣ 图标。" : "Sunder laser attacker. Fires a light-blue magic laser along its lane, piercing enemies until it hits the first enemy with magic resistance. Hit enemies gain 10s Sunder, reducing final armor by 35%; repeated hits refresh the duration. Sundered enemies show a white ▣ icon above them.",
    E: zh ? "三连物理射手。向前平射，并向上/下各偏转 10 度发射一发。" : "Triple physical shooter. Fires one straight shot plus two shots at +/-10 degrees.",
    e: zh ? "热忱治疗塔。拥有和 T 相同的 5x5 去角范围，并显示红色范围框；每次治疗范围内所有受伤塔 90 生命。范围内所有塔，包括自己，获得不叠加的热忱，攻击速度提高 35%。" : "Zeal healer. Uses the same centered 5x5 no-corner range as T and shows a red range border; each heal pulse restores 90 HP to every damaged tower in range. All towers in range, including itself, gain non-stacking Zeal for +35% attack speed.",
    M: zh ? "下向三连物理射手。攻击方向朝下，出弹点保持在列中心。" : "Downward triple physical shooter. Fires downward from the column center.",
    m: zh ? "镜像塔。若小 m 的左右或上下相邻格一边有可镜像塔、另一边为空且可部署，会在空格生成同种类、同朝向、同等级的镜像。基础费用 999 以上的塔不能被镜像。镜像关系会组成网络；网络内任一塔消失会让全网以同一事件消失。小 m 消失时，会擦除自己周围镜像状态塔所属的整个镜像网络。" : "Mirror tower. If one side of m has a mirrorable tower and the opposite side is an empty deployable cell, m creates a same-type, same-facing, same-level mirror there. Towers with base cost above 999 cannot be mirrored. Mirror links form networks; if any tower in a network disappears, the whole network disappears through the same event. When m disappears, it erases the full mirror networks adjacent to it.",
    V: zh ? "预判术法炮。沿本行投掷 * 炮弹，优先锁定可攻击目标中最大生命值最低的敌怪，并按锁定瞬间的移速预判落点；落点没有命中目标时会打空。" : "Predictive magic cannon. Lobs * shells along its lane, prioritizing the attackable enemy with the lowest max HP and predicting the landing point from target speed at lock time; it can miss.",
    v: zh ? "预判凝滞炮。沿本行投掷 * 炮弹，锁定自身前方第一个敌怪并按锁定瞬间的移速预判落点；落地造成 1.75 格半径衰减法术范围伤害，并对命中的普通敌怪施加 2 秒凝滞。" : "Predictive Stasis cannon. Lobs * shells along its lane, targeting the first enemy ahead and predicting the landing point from target speed at lock time. On impact, it deals 1.75-cell falloff magic AOE and applies 2s Stasis to ordinary enemies hit.",
    W: zh ? "上向三连物理射手。攻击方向朝上，出弹点保持在列中心。" : "Upward triple physical shooter. Fires upward from the column center.",
    w: zh ? "巡空防御塔。数值和 B 相同；初始 8 技力，每秒回复 1 技力，上限 10。满技力时外框闪烁；点击消耗 10 技力，获得 6 秒飞行和光环。飞行期间不阻挡地面敌人，但可以阻挡普通飞行敌人；高空飞行不会被阻挡。技能结束后才重新回技，升级会重置技力。" : "Air patrol defender. Same baseline stats as B; starts at 8 SP, gains 1 SP/s up to 10. At full SP its border flashes; click to spend 10 SP and gain 6s Flying with a halo. While flying it no longer blocks ground enemies, but can block regular Flying enemies; High Flight is never blocked. SP regeneration resumes only after the skill ends, and upgrades reset SP.",
    F: zh ? "触发器。阻挡敌怪或被点击时立刻消失，并在 4x4 范围内连续释放冲击波。" : "Trigger. Disappears on blocking or when clicked, then releases rapid shockwaves in a 4x4 area.",
    f: zh ? "全场凝滞触发器。机制和 F 类似，可被点击主动触发；触发时消失，不造成伤害，而是让全场普通敌怪获得凝滞。" : "Global Stasis trigger. Similar trigger rules to F and can be clicked manually; disappears on trigger and deals no damage, applying Stasis to all ordinary enemies on the field.",
    i: zh ? "冻结触发器。机制和 f 类似，可被点击主动引爆；触发时消失，冻结半径 2.6 格内的所有敌怪。冻结期间敌怪无法移动，攻击和技能不会触发；冻结期间累计受到的实际物理伤害达到最大生命值一半时，会提前解除冻结。" : "Freeze trigger. Similar trigger rules to f and can be clicked manually; disappears on trigger and freezes all enemies in a 2.6-cell radius. Frozen enemies cannot move, attack, or use skills; accumulated physical damage taken during Freeze breaks it early once it reaches half max HP.",
    l: zh ? "列式法术触发器。机制和 F 类似，可被点击主动引爆；触发时消失，对整列横向 0.75 格范围造成一次法术伤害。" : "Column magic trigger. Similar to F and can be clicked to detonate manually; disappears on trigger and deals one magic hit to a full-column area with 0.75-cell horizontal range.",
    G: zh ? "延迟触发器。放置 15 秒后准备完成，接触敌怪时消失并造成高额法术伤害。" : "Delayed trigger. Arms after 15s, then disappears on contact to deal heavy magic damage.",
    H: zh ? "治疗塔。治疗以自身为中心 3x3 范围内生命百分比最低的一座塔。" : "Healer. Heals the lowest-HP-percent tower in a centered 3x3 area.",
    h: zh ? "守护者。每秒回复 1 技力，20 技力满后若自己或 3x3 范围内有缺血塔，会自动消耗 20 技力治疗自己，并治疗范围内生命百分比最低的一座缺血塔。" : "Guardian. Gains 1 SP/s up to 20; when full, if itself or a tower in its 3x3 area is damaged, it spends 20 SP to heal itself and the lowest-HP-percent damaged tower in that area.",
    P: zh ? "广域治疗塔。治疗身后三列、自身列和前方四列、以自己为中心三行内生命百分比最低的一座塔。" : "Wide healer. Heals the lowest-HP-percent tower in a 3-lane area covering three rear columns, its column, and four forward columns.",
    p: zh ? "群体治疗塔。范围和 H 一致，治疗自身 3x3 范围内生命百分比最低的三座缺血塔；目标不足时治疗所有可治疗目标。" : "Group healer. Same range as H: heals the three lowest-HP-percent damaged towers in its centered 3x3 area, or all available targets if fewer than three are damaged.",
    I: zh ? "短程法术射手。只攻击自身和前方 5 格内的目标。" : "Short-range magic shooter. Attacks only within itself plus five tiles ahead.",
    Q: zh ? "整行控制射手。沿本行发射 $ 法术弹幕；命中普通敌怪后施加 1 秒凝滞，使其移动速度变为二分之一。Boss 不会受到凝滞影响。" : "Full-lane control shooter. Fires $ magic projectiles along its lane; hits apply 1s Stasis to ordinary enemies, reducing movement speed to one half. Bosses ignore Stasis.",
    J: zh ? "短程法术溅射。范围和 I 一致，发射 # 弹幕并造成 1.75 格半径、随距离衰减的范围法术伤害。" : "Short-range magic splash attacker. Same range as I, firing # projectiles with 1.75-cell radius splash and distance falloff.",
    K: zh ? "近程斩击塔。攻击自身一格和前方两格内的单体目标，释放十字斩特效。" : "Close-range slasher. Hits one target within itself plus two tiles ahead, with a cross slash.",
    k: zh ? "近程推波塔。攻击自身列和前方一列的上下三行，并额外覆盖本行更前方一格；每秒释放弧形推波，对范围内所有敌怪造成法术伤害。" : "Close-range wave attacker. Covers a 2x3 area over its column and the next column plus one extra forward cell in its lane; every second releases an arc wave that deals magic damage to all enemies in range.",
    S: zh ? "主动术法迫击塔。30 技力满后显示边框；点击进入瞄准，指定任意落点后连射三发 S 形抛物线迫击弹，每发造成 3x3 范围法术伤害。右键或点击其他 UI 可取消瞄准。" : "Active spell mortar. At 30 SP, shows its border; click to aim, then choose any target point to fire three arcing S shells, each dealing 3x3 magic AOE damage. Right-click or clicking other UI cancels aiming.",
    s: zh ? "小写 s。基础攻击力为 0；每 20 秒在自身前方最近的空格生成一个同等级小 a。如果自身被转向，会向反方向寻找空格，生成的小 a 也继承转向。" : "Lowercase s. Base attack is 0; every 20s, it creates a same-level a in the nearest empty cell in front. If s is turned, it searches the reversed direction and the created a inherits that facing.",
    Z: zh ? `生产型斩击塔。范围和 K 一致；每次斩击命中时产生 ${EFFECT_SYMBOLS.chars}15。` : `Production slasher. Same range as K; each slash hit generates ${EFFECT_SYMBOLS.chars}15.`,
    L: zh ? "牵引塔。抓取上下两行指定格子的所有敌怪平移到本行，每抓一个自损 400 真实伤害。" : "Shifter. Pulls all enemies from target tiles in adjacent lanes into its lane, taking 400 true self-damage per target.",
    N: zh ? "防御推移塔。每秒把自己正在阻挡的所有敌怪沿推移方向移动 5 格：正常 N 向左，反向 N 向右。每推一个自损 400 真实伤害。敌方弹幕命中它时会沿同方向被推移，不造成弹幕本身的伤害，但会让 N 自损 400 真实伤害；锁定 N 的迫击弹会沿同方向改写落点并造成一次同等自损。" : "Defender-shifter. Every second, pushes all enemies it is blocking 5 cells in its push direction: normal N pushes left, reversed N pushes right. It takes 400 true self-damage per pushed enemy. Enemy projectiles that would hit it are shifted in the same direction and deal no projectile damage, but N takes 400 true self-damage per shifted projectile; locked mortars targeting N have their landing point rewritten in the same direction and cost the same self-damage once.",
    n: zh ? "排斥塔。机制类似 L，但会把本行指定格子的所有敌怪排斥到上/下相邻行；第一次方向按放置顺序决定，奇数先向上、偶数先向下，之后每次生效交替。每排斥一个目标自损 400 真实伤害。" : "Repulsor. Similar to L, but shifts all enemies from target tiles in its own lane to the adjacent lane above or below. Odd placement order starts upward, even starts downward, then alternates after each pulse. Takes 400 true self-damage per shifted target.",
    T: zh ? "迟滞塔。每秒自损 700 真实伤害；以自身为中心 5x5 去角范围内的普通单位和弹幕移动速度降为六分之一，并显示深紫色时间范围框。Boss 不受减速影响。无论因任何原因消失，都会清除范围内所有弹幕和抛射体。" : "Slow field tower. Takes 700 true self-damage every second; ordinary units and projectiles in its centered 5x5 no-corner area move at one sixth speed, shown with a deep-purple time range border. Bosses ignore the slow. Whenever it disappears for any reason, it clears all projectiles and mortars in that area.",
    U: zh ? "等级光环塔。为自身 3x3 范围内除自己外、基础费用 999 或以下的塔提供等同于自身真实等级的额外等级加成；多个 U 可加算。" : "Level aura tower. Grants towers in its centered 3x3 area, excluding itself, bonus levels equal to U's real level. It only affects towers with base cost 999 or lower, and multiple U auras stack additively."
  };
  return descriptions[id];
}

function towerUpgradeText(id: CardId) {
  const zh = isZh();
  if (id === "U") {
    return zh ? "每级提高自身等级，因此光环提供的额外等级也会提高。" : "Each level raises U's own level, increasing the bonus levels its aura grants.";
  }
  if (id === "b") {
    return zh ? "每级提高自身等级；生效后会返还冷却，最终剩余冷却为基础冷却 / 有效等级。" : "Each level raises b's level; after it resolves, it refunds cooldown so the remaining cooldown is base cooldown / effective level.";
  }
  if (id === "t") {
    return zh ? "每个有效等级提供 12 秒真实伤害持续时间；生效后冷却返还方式与 b 相同。" : "Each effective level grants 12 seconds of true-damage duration; after it resolves, cooldown refund works like b.";
  }
  if (id === "x") {
    return zh ? "每级追踪弹伤害增加基础值的 80%。" : "Each level adds 80% of base homing-shot damage.";
  }
  if (id === "m") {
    return zh ? "每级提高小 m 自身等级；2 级小 m 会持续为周围镜像状态塔所属的整个镜像网络提供 +1 有效等级，3 级提供 +2，以此类推。" : "Each level raises m's own level; a level 2 m continuously grants +1 effective level to the full mirror networks adjacent to it, level 3 grants +2, and so on.";
  }
  if (id === "A" || id === "a" || id === "C" || id === "E" || id === "e" || id === "M" || id === "W" || id === "I" || id === "J" || id === "H" || id === "P" || id === "p" || id === "K" || id === "Z") {
    return zh ? "增加连发次数；整段连射固定占攻击/治疗间隔的五分之一。" : "Adds burst count; the whole volley always takes one fifth of the attack/heal interval.";
  }
  if (id === "X" || id === "Y") {
    return zh ? "每级单次生产量增加基础值的 80%。" : "Each level adds 80% of base production per trigger.";
  }
  if (id === "c") {
    return zh ? "技能倍率按当前激活的 c 的等级和计算。" : "Skill multiplier uses the sum of active c tower levels.";
  }
  if (id === "S") {
    return zh ? "每级每发迫击弹伤害增加基础值的 80%（4000），并重置技力。" : "Each level adds 80% of base mortar damage per shell (+4000) and resets SP.";
  }
  if (id === "s") {
    return zh ? "每级提高自身等级；生成的小 a 等级等于小 s 当前有效等级。" : "Each level raises s's own level; created a towers use s's current effective level.";
  }
  if (id === "F") {
    return zh ? "每级冲击波数量增加基础值的 80%。" : "Each level adds 80% of base shockwave count.";
  }
  if (id === "f") {
    return zh ? "每级凝滞持续时间增加基础值的 80%。" : "Each level adds 80% of base Stasis duration.";
  }
  if (id === "i") {
    return zh ? "每级冻结持续时间增加基础值的 80%。" : "Each level adds 80% of base Freeze duration.";
  }
  if (id === "l") {
    return zh ? "每级伤害增加基础值的 80%。" : "Each level adds 80% of base damage.";
  }
  if (id === "Q" || id === "v") {
    return zh ? "每级伤害增加基础值的 80%。" : "Each level adds 80% of base damage.";
  }
  if (id === "d" || id === "k" || id === "V") {
    return zh ? "每级攻击力增加基础值的 80%。" : "Each level adds 80% of base attack.";
  }
  if (id === "G") {
    return zh ? "每级伤害增加基础值的 80%，并重置准备倒计时。" : "Each level adds 80% of base damage and resets arming.";
  }
  if (id === "w") {
    return zh ? "每级最大生命增加基础值的 80%，当前生命同步补充，并重置巡空技力。" : "Each level adds 80% of base max HP, heals by the same amount, and resets Air Patrol SP.";
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
