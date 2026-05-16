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
  TETRAHEDRON_BOSS_CHARGE_SKILL_COST,
  TETRAHEDRON_BOSS_CHARGE_SKILL_MAX,
  TETRAHEDRON_BOSS_DESPERATION_SKILL_COST,
  TETRAHEDRON_BOSS_DESPERATION_SKILL_MAX,
  TETRAHEDRON_BOSS_IMPACT_SKILL_COST,
  TETRAHEDRON_BOSS_IMPACT_SKILL_MAX,
  TETRAHEDRON_BOSS_SUPPRESSION_SKILL_COST,
  TETRAHEDRON_BOSS_SUPPRESSION_SKILL_MAX,
  LANES,
  palette
} from "../config";
import { toRomanNumeral } from "../format";
import { bossRect } from "../game/targeting";
import type { BossKind, BossSkill, CubeBoss } from "../types";

const CUBE_DRAW_SIZE = 59;
const TETRAHEDRON_INITIAL_ROTATION_SPEED = {
  x: 0.56,
  y: -0.42,
  z: 0.36
};

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
    speed: stats.speed,
    advanceMinionKind: rank >= 2 ? "square2" : "square",
    hasSkills: true,
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
        : {}),
      ...(kind === "tetrahedron"
        ? {
            charge: {
              name: "charge" as const,
              sp: 0,
              maxSp: TETRAHEDRON_BOSS_CHARGE_SKILL_MAX,
              cost: TETRAHEDRON_BOSS_CHARGE_SKILL_COST,
              gainBuffer: 0
            },
            impact: {
              name: "impact" as const,
              sp: 0,
              maxSp: TETRAHEDRON_BOSS_IMPACT_SKILL_MAX,
              cost: TETRAHEDRON_BOSS_IMPACT_SKILL_COST,
              gainBuffer: 0
            },
            suppression: {
              name: "suppression" as const,
              sp: 0,
              maxSp: TETRAHEDRON_BOSS_SUPPRESSION_SKILL_MAX,
              cost: TETRAHEDRON_BOSS_SUPPRESSION_SKILL_COST,
              gainBuffer: 0
            },
            desperation: {
              name: "desperation" as const,
              sp: 0,
              maxSp: TETRAHEDRON_BOSS_DESPERATION_SKILL_MAX,
              cost: TETRAHEDRON_BOSS_DESPERATION_SKILL_COST,
              gainBuffer: 0
            }
          }
        : {})
    },
    contactAttackBuffer: 0,
    chargeExpiresAt: 0,
    halfHpTriggered: false,
    criticalHpTriggered: false,
    pendingCriticalSummon: false,
    invincibleUntil: 0,
    bossHasteUntil: 0,
    nextBossHasteTrailAt: 0,
    body,
    frame,
    labelText,
    rotationX: Phaser.Math.FloatBetween(-0.4, 0.4),
    rotationY: Phaser.Math.FloatBetween(-0.4, 0.4),
    rotationZ: Phaser.Math.FloatBetween(-0.2, 0.2),
    velocityX: kind === "tetrahedron" ? TETRAHEDRON_INITIAL_ROTATION_SPEED.x : 0.18,
    velocityY: kind === "tetrahedron" ? TETRAHEDRON_INITIAL_ROTATION_SPEED.y : -0.12,
    velocityZ: kind === "tetrahedron" ? TETRAHEDRON_INITIAL_ROTATION_SPEED.z : 0.1,
    targetVelocityX: kind === "tetrahedron" ? TETRAHEDRON_INITIAL_ROTATION_SPEED.x : 0.18,
    targetVelocityY: kind === "tetrahedron" ? TETRAHEDRON_INITIAL_ROTATION_SPEED.y : -0.12,
    targetVelocityZ: kind === "tetrahedron" ? TETRAHEDRON_INITIAL_ROTATION_SPEED.z : 0.1,
    nextTurnIn: kind === "tetrahedron" ? 0.8 : 1.8
  };

  drawCubeBoss(boss, 0);
  return boss;
}

export function updateCubeBossMotion(boss: CubeBoss, seconds: number, movementMultiplier = 1, time = 0) {
  boss.x -= boss.speed * seconds * movementMultiplier;
  boss.body.setPosition(boss.x, boss.y);

  boss.nextTurnIn -= seconds;
  if (boss.nextTurnIn <= 0) {
    const rotationRange = boss.kind === "tetrahedron"
      ? { xy: 0.92, z: 0.72, minTurn: 0.75, maxTurn: 1.8 }
      : { xy: 0.32, z: 0.22, minTurn: 2.2, maxTurn: 4.6 };
    boss.targetVelocityX = Phaser.Math.FloatBetween(-rotationRange.xy, rotationRange.xy);
    boss.targetVelocityY = Phaser.Math.FloatBetween(-rotationRange.xy, rotationRange.xy);
    boss.targetVelocityZ = Phaser.Math.FloatBetween(-rotationRange.z, rotationRange.z);
    boss.nextTurnIn = Phaser.Math.FloatBetween(rotationRange.minTurn, rotationRange.maxTurn);
  }

  const turnEase = Phaser.Math.Clamp(seconds * (boss.kind === "tetrahedron" ? 1.08 : 0.55), 0, 1);
  boss.velocityX = Phaser.Math.Linear(boss.velocityX, boss.targetVelocityX, turnEase);
  boss.velocityY = Phaser.Math.Linear(boss.velocityY, boss.targetVelocityY, turnEase);
  boss.velocityZ = Phaser.Math.Linear(boss.velocityZ, boss.targetVelocityZ, turnEase);
  boss.rotationX += boss.velocityX * seconds;
  boss.rotationY += boss.velocityY * seconds;
  boss.rotationZ += boss.velocityZ * seconds;
  drawCubeBoss(boss, time);
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

export function bossAdvanceSpawnPoints(boss: CubeBoss) {
  const x = bossRect(boss).left - CELL_WIDTH / 2;
  return Array.from({ length: LANES }, (_, lane) => ({
    lane,
    x,
    y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
  }));
}

function drawCubeBoss(boss: CubeBoss, time: number) {
  if (boss.kind === "tetrahedron") {
    drawTetrahedronBoss(boss, time);
    return;
  }

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

  const color = boss.invincibleUntil > time ? palette.gold : palette.white;
  boss.labelText.setColor(boss.invincibleUntil > time ? "#ffd75a" : "#f5f5f5");
  boss.frame.clear();
  boss.frame.lineStyle(2, color, 0.95);
  for (const [from, to] of edges) {
    boss.frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

function drawTetrahedronBoss(boss: CubeBoss, time: number) {
  const vertices = [
    [1, 1, 1],
    [-1, -1, 1],
    [-1, 1, -1],
    [1, -1, -1]
  ].map(([x, y, z]) => projectCubePoint(x * CUBE_DRAW_SIZE, y * CUBE_DRAW_SIZE, z * CUBE_DRAW_SIZE, boss));
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3]
  ];

  const color = boss.invincibleUntil > time ? palette.gold : palette.white;
  boss.labelText.setColor(boss.invincibleUntil > time ? "#ffd75a" : "#f5f5f5");
  boss.frame.clear();
  boss.frame.lineStyle(2, color, 0.95);
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
