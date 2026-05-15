import Phaser from "phaser";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  BOSS_HITBOX_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  CUBE_BOSS_ADVANCE_SKILL_COST,
  CUBE_BOSS_ADVANCE_SKILL_MAX,
  CUBE_BOSS_PROMOTION2_SKILL_COST,
  CUBE_BOSS_PROMOTION2_SKILL_MAX,
  CUBE_BOSS_PROMOTION_SKILL_COST,
  CUBE_BOSS_PROMOTION_SKILL_MAX,
  CUBE_BOSS_STATS,
  ENEMY_SPEED,
  ENEMY_SPEED_VARIANCE,
  LANES,
  palette
} from "../config";
import { enemyDefinitions } from "../data/enemies";
import { toRomanNumeral } from "../format";
import { bossRect } from "../game/targeting";
import type { BossKind, BossSkill, CubeBoss, Enemy, EnemyKind } from "../types";

const CUBE_DRAW_SIZE = 59;

export function createCubeBoss(scene: Phaser.Scene, kind: BossKind, finalDamageReduction: number) {
  const rank = kind === "cube2" ? 2 : 1;
  const stats = CUBE_BOSS_STATS[kind];
  const x = BOARD_X + BOARD_WIDTH - BOSS_HITBOX_WIDTH / 2;
  const y = BOARD_Y + BOARD_HEIGHT / 2;
  const frame = scene.add.graphics();
  const labelText = scene.add
    .text(0, -3, toRomanNumeral(rank), {
      color: "#f5f5f5",
      fontFamily: "monospace",
      fontSize: "34px",
      fontStyle: "700"
    })
    .setOrigin(0.5);
  const body = scene.add.container(x, y, [frame, labelText]).setDepth(88);

  const boss: CubeBoss = {
    kind,
    rank,
    label: toRomanNumeral(rank),
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    armor: stats.armor,
    magicResistance: stats.magicResistance,
    finalDamageReduction,
    speed: 0.6,
    advanceMinionKind: rank >= 2 ? "square2" : "square",
    skills: {
      promotion: {
        name: "promotion",
        sp: 0,
        maxSp: CUBE_BOSS_PROMOTION_SKILL_MAX,
        cost: CUBE_BOSS_PROMOTION_SKILL_COST,
        gainBuffer: 0
      },
      advance: {
        name: "advance",
        sp: 0,
        maxSp: CUBE_BOSS_ADVANCE_SKILL_MAX,
        cost: CUBE_BOSS_ADVANCE_SKILL_COST,
        gainBuffer: 0
      },
      ...(rank >= 2
        ? {
            promotion2: {
              name: "promotion2" as const,
              sp: 0,
              maxSp: CUBE_BOSS_PROMOTION2_SKILL_MAX,
              cost: CUBE_BOSS_PROMOTION2_SKILL_COST,
              gainBuffer: 0
            }
          }
        : {})
    },
    contactAttackBuffer: 0,
    body,
    frame,
    labelText,
    rotationX: Phaser.Math.FloatBetween(-0.4, 0.4),
    rotationY: Phaser.Math.FloatBetween(-0.4, 0.4),
    rotationZ: Phaser.Math.FloatBetween(-0.2, 0.2),
    velocityX: 0.18,
    velocityY: -0.12,
    velocityZ: 0.1,
    targetVelocityX: 0.18,
    targetVelocityY: -0.12,
    targetVelocityZ: 0.1,
    nextTurnIn: 1.8
  };

  drawCubeBoss(boss);
  return boss;
}

export function updateCubeBossMotion(boss: CubeBoss, seconds: number) {
  boss.x -= boss.speed * seconds;
  boss.body.setPosition(boss.x, boss.y);

  boss.nextTurnIn -= seconds;
  if (boss.nextTurnIn <= 0) {
    boss.targetVelocityX = Phaser.Math.FloatBetween(-0.32, 0.32);
    boss.targetVelocityY = Phaser.Math.FloatBetween(-0.32, 0.32);
    boss.targetVelocityZ = Phaser.Math.FloatBetween(-0.22, 0.22);
    boss.nextTurnIn = Phaser.Math.FloatBetween(2.2, 4.6);
  }

  const turnEase = Phaser.Math.Clamp(seconds * 0.55, 0, 1);
  boss.velocityX = Phaser.Math.Linear(boss.velocityX, boss.targetVelocityX, turnEase);
  boss.velocityY = Phaser.Math.Linear(boss.velocityY, boss.targetVelocityY, turnEase);
  boss.velocityZ = Phaser.Math.Linear(boss.velocityZ, boss.targetVelocityZ, turnEase);
  boss.rotationX += boss.velocityX * seconds;
  boss.rotationY += boss.velocityY * seconds;
  boss.rotationZ += boss.velocityZ * seconds;
  drawCubeBoss(boss);
}

export function chargeBossSkill(skill: BossSkill, seconds: number) {
  skill.gainBuffer += seconds;
  while (skill.gainBuffer >= 1) {
    skill.sp = Math.min(skill.maxSp, skill.sp + 1);
    skill.gainBuffer -= 1;
  }
}

export function isBossSkillReady(skill: BossSkill) {
  return skill.sp >= skill.maxSp;
}

export function spendBossSkill(skill: BossSkill) {
  skill.sp = Math.max(0, skill.sp - skill.cost);
}

export function findPromotionTarget(boss: CubeBoss, enemies: Enemy[], fromRank: number) {
  return enemies
    .filter((enemy) => enemyRank(enemy.kind) === fromRank && promotedKind(enemy.kind))
    .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))[0];
}

export function promotedKind(kind: EnemyKind): EnemyKind | null {
  if (kind === "circle") {
    return "circle2";
  }
  if (kind === "circle2") {
    return "circle3";
  }
  if (kind === "triangle") {
    return "triangle2";
  }
  if (kind === "triangle2") {
    return "triangle3";
  }
  if (kind === "square") {
    return "square2";
  }
  if (kind === "square2") {
    return "square3";
  }
  return null;
}

export function applyEnemyPromotionStats(
  enemy: Enemy,
  kind: EnemyKind,
  battleTime: number,
  attackInterval: number
) {
  const hpRatio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
  const definition = enemyDefinitions[kind];
  enemy.kind = kind;
  enemy.maxHp = definition.hp;
  enemy.hp = Math.max(1, definition.hp * hpRatio);
  enemy.armor = definition.armor;
  enemy.magicResistance = definition.magicResistance;
  enemy.damage = definition.damage;
  enemy.damageType = definition.damageType;
  enemy.attackInterval = attackInterval;
  enemy.attackAt = Math.min(enemy.attackAt, battleTime + enemy.attackInterval);
  enemy.speed =
    ENEMY_SPEED *
    (definition.speedMultiplier ?? 1) *
    Phaser.Math.FloatBetween(1 - ENEMY_SPEED_VARIANCE, 1 + ENEMY_SPEED_VARIANCE);
}

export function bossAdvanceSpawnPoints(boss: CubeBoss) {
  const centerLane = Phaser.Math.Clamp(Math.round((boss.y - BOARD_Y - CELL_HEIGHT / 2) / CELL_HEIGHT), 0, LANES - 1);
  const x = bossRect(boss).left - CELL_WIDTH / 2;
  return [centerLane - 1, centerLane, centerLane + 1]
    .filter((lane) => lane >= 0 && lane < LANES)
    .map((lane) => ({
      lane,
      x,
      y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
    }));
}

function enemyRank(kind: EnemyKind) {
  return Number.parseInt(enemyDefinitions[kind].label ?? "1", 10);
}

function drawCubeBoss(boss: CubeBoss) {
  const vertices = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1]
  ].map(([x, y, z]) => projectCubePoint(x * CUBE_DRAW_SIZE, y * CUBE_DRAW_SIZE, z * CUBE_DRAW_SIZE, boss));
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7]
  ];

  boss.frame.clear();
  boss.frame.lineStyle(2, palette.white, 0.95);
  for (const [from, to] of edges) {
    boss.frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

function projectCubePoint(x: number, y: number, z: number, boss: CubeBoss) {
  const cosX = Math.cos(boss.rotationX);
  const sinX = Math.sin(boss.rotationX);
  const cosY = Math.cos(boss.rotationY);
  const sinY = Math.sin(boss.rotationY);
  const cosZ = Math.cos(boss.rotationZ);
  const sinZ = Math.sin(boss.rotationZ);

  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;
  const x2 = x * cosY + z1 * sinY;
  const z2 = -x * sinY + z1 * cosY;
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;
  const scale = 1.25 / (1 + z2 / 360);
  return { x: x3 * scale, y: y3 * scale };
}
