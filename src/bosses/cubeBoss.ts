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
  DODECAHEDRON_BOSS_ENDLESS_WINGS_SKILL_COST,
  DODECAHEDRON_BOSS_ENDLESS_WINGS_SKILL_MAX,
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
const DODECAHEDRON_DRAW_SIZE = 47;
const SMALL_STELLATED_DODECAHEDRON_DRAW_SIZE = 31;
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;
const SMALL_STELLATED_TIP_RADIUS = 2.55;
const TETRAHEDRON_INITIAL_ROTATION_SPEED = {
  x: 0.56,
  y: -0.42,
  z: 0.36
};

export const DODECAHEDRON_UNIT_VERTICES = [
  [-1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, -1],
  [1, -1, 1],
  [1, 1, -1],
  [1, 1, 1],
  [0, -INV_PHI, -PHI],
  [0, -INV_PHI, PHI],
  [0, INV_PHI, -PHI],
  [0, INV_PHI, PHI],
  [-INV_PHI, -PHI, 0],
  [-INV_PHI, PHI, 0],
  [INV_PHI, -PHI, 0],
  [INV_PHI, PHI, 0],
  [-PHI, 0, -INV_PHI],
  [-PHI, 0, INV_PHI],
  [PHI, 0, -INV_PHI],
  [PHI, 0, INV_PHI]
] as const;

export const DODECAHEDRON_EDGES = buildDodecahedronEdges();
export const DODECAHEDRON_FACES = buildDodecahedronFaces();
export const SMALL_STELLATED_DODECAHEDRON_SPIKES = DODECAHEDRON_FACES.map((face) => ({
  face,
  tip: dodecahedronFaceTip(face)
}));

function buildDodecahedronEdges() {
  const edges: Array<[number, number]> = [];
  for (let from = 0; from < DODECAHEDRON_UNIT_VERTICES.length; from += 1) {
    for (let to = from + 1; to < DODECAHEDRON_UNIT_VERTICES.length; to += 1) {
      const [x1, y1, z1] = DODECAHEDRON_UNIT_VERTICES[from];
      const [x2, y2, z2] = DODECAHEDRON_UNIT_VERTICES[to];
      const distanceSquared = (x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2;
      if (distanceSquared < 1.6) {
        edges.push([from, to]);
      }
    }
  }
  return edges;
}

function buildDodecahedronFaces() {
  const adjacency = DODECAHEDRON_UNIT_VERTICES.map(() => new Set<number>());
  for (const [from, to] of DODECAHEDRON_EDGES) {
    adjacency[from].add(to);
    adjacency[to].add(from);
  }

  const faces: number[][] = [];
  const seen = new Set<string>();
  const search = (start: number, path: number[]) => {
    const last = path[path.length - 1];
    if (path.length === 5) {
      if (adjacency[last].has(start)) {
        const key = [...path].sort((a, b) => a - b).join(":");
        if (!seen.has(key)) {
          seen.add(key);
          faces.push([...path]);
        }
      }
      return;
    }

    for (const next of adjacency[last]) {
      if (next < start || path.includes(next)) {
        continue;
      }
      search(start, [...path, next]);
    }
  };

  for (let start = 0; start < DODECAHEDRON_UNIT_VERTICES.length; start += 1) {
    search(start, [start]);
  }

  return faces;
}

function dodecahedronFaceTip(face: number[]) {
  const center = face.reduce(
    (sum, index) => {
      const [x, y, z] = DODECAHEDRON_UNIT_VERTICES[index];
      return [sum[0] + x, sum[1] + y, sum[2] + z] as [number, number, number];
    },
    [0, 0, 0] as [number, number, number]
  );
  const averaged = center.map((value) => value / face.length) as [number, number, number];
  const length = Math.hypot(averaged[0], averaged[1], averaged[2]) || 1;
  return averaged.map((value) => (value / length) * SMALL_STELLATED_TIP_RADIUS) as [number, number, number];
}

export function createCubeBoss(scene: Phaser.Scene, kind: BossKind, finalDamageReduction: number) {
  const rank = bossRank(kind);
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
    hasSkills: !isSkilllessBossKind(kind),
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
      ...(isTetrahedronBossKind(kind)
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
        : {}),
      ...(isDodecahedronBossKind(kind)
        ? {
            endlessWings: {
              name: "endlessWings" as const,
              sp: 0,
              maxSp: DODECAHEDRON_BOSS_ENDLESS_WINGS_SKILL_MAX,
              cost: DODECAHEDRON_BOSS_ENDLESS_WINGS_SKILL_COST,
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
    companionsInitialized: false,
    companionArmorReduced: false,
    companionDeathsHandled: 0,
    invincibleUntil: 0,
    bossHasteUntil: 0,
    nextBossHasteTrailAt: 0,
    body,
    frame,
    labelText,
    rotationX: Phaser.Math.FloatBetween(-0.4, 0.4),
    rotationY: Phaser.Math.FloatBetween(-0.4, 0.4),
    rotationZ: Phaser.Math.FloatBetween(-0.2, 0.2),
    velocityX: isTetrahedronBossKind(kind) ? TETRAHEDRON_INITIAL_ROTATION_SPEED.x : 0.18,
    velocityY: isTetrahedronBossKind(kind) ? TETRAHEDRON_INITIAL_ROTATION_SPEED.y : -0.12,
    velocityZ: isTetrahedronBossKind(kind) ? TETRAHEDRON_INITIAL_ROTATION_SPEED.z : 0.1,
    targetVelocityX: isTetrahedronBossKind(kind) ? TETRAHEDRON_INITIAL_ROTATION_SPEED.x : 0.18,
    targetVelocityY: isTetrahedronBossKind(kind) ? TETRAHEDRON_INITIAL_ROTATION_SPEED.y : -0.12,
    targetVelocityZ: isTetrahedronBossKind(kind) ? TETRAHEDRON_INITIAL_ROTATION_SPEED.z : 0.1,
    nextTurnIn: isTetrahedronBossKind(kind) ? 0.8 : 1.8
  };

  drawCubeBoss(boss, 0);
  return boss;
}

export function updateCubeBossMotion(boss: CubeBoss, seconds: number, movementMultiplier = 1, time = 0) {
  boss.x -= boss.speed * seconds * movementMultiplier;
  boss.body.setPosition(boss.x, boss.y);

  boss.nextTurnIn -= seconds;
  if (boss.nextTurnIn <= 0) {
    if (isTetrahedronBoss(boss)) {
      boss.targetVelocityX = randomSignedRotationSpeed(0.42, 0.9);
      boss.targetVelocityY = randomSignedRotationSpeed(0.42, 0.9);
      boss.targetVelocityZ = randomSignedRotationSpeed(0.28, 0.64);
      boss.nextTurnIn = Phaser.Math.FloatBetween(2.8, 5.2);
    } else {
      const rotationRange = { xy: 0.32, z: 0.22, minTurn: 2.2, maxTurn: 4.6 };
      boss.targetVelocityX = Phaser.Math.FloatBetween(-rotationRange.xy, rotationRange.xy);
      boss.targetVelocityY = Phaser.Math.FloatBetween(-rotationRange.xy, rotationRange.xy);
      boss.targetVelocityZ = Phaser.Math.FloatBetween(-rotationRange.z, rotationRange.z);
      boss.nextTurnIn = Phaser.Math.FloatBetween(rotationRange.minTurn, rotationRange.maxTurn);
    }
  }

  const turnEase = Phaser.Math.Clamp(seconds * (isTetrahedronBoss(boss) ? 0.42 : 0.55), 0, 1);
  boss.velocityX = Phaser.Math.Linear(boss.velocityX, boss.targetVelocityX, turnEase);
  boss.velocityY = Phaser.Math.Linear(boss.velocityY, boss.targetVelocityY, turnEase);
  boss.velocityZ = Phaser.Math.Linear(boss.velocityZ, boss.targetVelocityZ, turnEase);
  boss.rotationX += boss.velocityX * seconds;
  boss.rotationY += boss.velocityY * seconds;
  boss.rotationZ += boss.velocityZ * seconds;
  drawCubeBoss(boss, time);
}

function randomSignedRotationSpeed(min: number, max: number) {
  return Phaser.Math.FloatBetween(min, max) * (Phaser.Math.Between(0, 1) === 0 ? -1 : 1);
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
  if (isTetrahedronBoss(boss)) {
    drawTetrahedronBoss(boss, time);
    return;
  }

  if (isDodecahedronBoss(boss)) {
    drawDodecahedronBoss(boss, time);
    return;
  }

  if (isSmallStellatedDodecahedronBoss(boss)) {
    drawSmallStellatedDodecahedronBoss(boss, time);
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

export function bossRank(kind: BossKind) {
  return kind === "cube2" || kind === "tetrahedron2" ? 2 : 1;
}

export function isTetrahedronBossKind(kind: BossKind) {
  return kind === "tetrahedron" || kind === "tetrahedron2";
}

export function isTetrahedronBoss(boss: CubeBoss) {
  return isTetrahedronBossKind(boss.kind);
}

export function isDodecahedronBossKind(kind: BossKind) {
  return kind === "dodecahedron";
}

export function isDodecahedronBoss(boss: CubeBoss) {
  return isDodecahedronBossKind(boss.kind);
}

export function isSmallStellatedDodecahedronBossKind(kind: BossKind) {
  return kind === "smallStellatedDodecahedron";
}

export function isSmallStellatedDodecahedronBoss(boss: CubeBoss) {
  return isSmallStellatedDodecahedronBossKind(boss.kind);
}

function isSkilllessBossKind(kind: BossKind) {
  return isDodecahedronBossKind(kind) || isSmallStellatedDodecahedronBossKind(kind);
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

function drawDodecahedronBoss(boss: CubeBoss, time: number) {
  const vertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectCubePoint(x * DODECAHEDRON_DRAW_SIZE, y * DODECAHEDRON_DRAW_SIZE, z * DODECAHEDRON_DRAW_SIZE, boss)
  );

  const color = boss.invincibleUntil > time ? palette.gold : palette.white;
  boss.labelText.setColor(boss.invincibleUntil > time ? "#ffd75a" : "#f5f5f5");
  boss.frame.clear();
  boss.frame.lineStyle(2, color, 0.9);
  for (const [from, to] of DODECAHEDRON_EDGES) {
    boss.frame.lineBetween(vertices[from].x, vertices[from].y, vertices[to].x, vertices[to].y);
  }
}

function drawSmallStellatedDodecahedronBoss(boss: CubeBoss, time: number) {
  const baseVertices = DODECAHEDRON_UNIT_VERTICES.map(([x, y, z]) =>
    projectCubePoint(
      x * SMALL_STELLATED_DODECAHEDRON_DRAW_SIZE,
      y * SMALL_STELLATED_DODECAHEDRON_DRAW_SIZE,
      z * SMALL_STELLATED_DODECAHEDRON_DRAW_SIZE,
      boss
    )
  );
  const spikeTips = SMALL_STELLATED_DODECAHEDRON_SPIKES.map(({ tip }) =>
    projectCubePoint(
      tip[0] * SMALL_STELLATED_DODECAHEDRON_DRAW_SIZE,
      tip[1] * SMALL_STELLATED_DODECAHEDRON_DRAW_SIZE,
      tip[2] * SMALL_STELLATED_DODECAHEDRON_DRAW_SIZE,
      boss
    )
  );

  const color = boss.invincibleUntil > time ? palette.gold : palette.white;
  boss.labelText.setColor(boss.invincibleUntil > time ? "#ffd75a" : "#f5f5f5");
  boss.frame.clear();
  boss.frame.lineStyle(1.4, color, 0.34);
  for (const [from, to] of DODECAHEDRON_EDGES) {
    boss.frame.lineBetween(baseVertices[from].x, baseVertices[from].y, baseVertices[to].x, baseVertices[to].y);
  }

  boss.frame.lineStyle(1.8, color, 0.92);
  SMALL_STELLATED_DODECAHEDRON_SPIKES.forEach(({ face }, index) => {
    const tip = spikeTips[index];
    for (const vertexIndex of face) {
      const vertex = baseVertices[vertexIndex];
      boss.frame.lineBetween(tip.x, tip.y, vertex.x, vertex.y);
    }
  });
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
