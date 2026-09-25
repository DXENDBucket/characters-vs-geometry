import { BOARD_Y, CELL_HEIGHT, CELL_WIDTH, LANES } from "../config";
import type { BossKind } from "../types";
import type { BossState } from "./bossState";
import { bossMovementDirection, expireReversalEffect } from "./rules/reversal";
import { bossBounds, type BossHitbox } from "./unitGeometry";

export function bossRank(kind: BossKind) {
  return kind === "cube2" || kind === "tetrahedron2" || kind === "dodecahedron2" || kind === "octahedron2" ? 2 : 1;
}

export function isTetrahedronBossKind(kind: BossKind) {
  return kind === "tetrahedron" || kind === "tetrahedron2";
}

export function isTetrahedronBoss(boss: Pick<BossState, "kind">) {
  return isTetrahedronBossKind(boss.kind);
}

export function isDodecahedronBossKind(kind: BossKind) {
  return kind === "dodecahedron" || kind === "dodecahedron2";
}

export function isDodecahedronBoss(boss: Pick<BossState, "kind">) {
  return isDodecahedronBossKind(boss.kind);
}

export function isSmallStellatedDodecahedronBossKind(kind: BossKind) {
  return kind === "smallStellatedDodecahedron";
}

export function isSmallStellatedDodecahedronBoss(boss: Pick<BossState, "kind">) {
  return isSmallStellatedDodecahedronBossKind(boss.kind);
}

export function isOctahedronBossKind(kind: BossKind) {
  return kind === "octahedron" || kind === "octahedron2";
}

export function isOctahedronBoss(boss: Pick<BossState, "kind">) {
  return isOctahedronBossKind(boss.kind);
}

export function isIcosahedronBossKind(kind: BossKind) {
  return kind === "icosahedron";
}

export function isIcosahedronBoss(boss: Pick<BossState, "kind">) {
  return isIcosahedronBossKind(boss.kind);
}

export function isSkilllessBossKind(kind: BossKind) {
  return isDodecahedronBossKind(kind) || isSmallStellatedDodecahedronBossKind(kind) || isOctahedronBossKind(kind);
}

export function advanceBossPosition(boss: BossState, seconds: number, movementMultiplier = 1, time = 0) {
  expireReversalEffect(boss, time);
  const distance = boss.finalStats.speed * seconds * movementMultiplier;
  const direction = bossMovementDirection(boss);
  if ((boss.movementAxis ?? "x") === "y") {
    boss.y += direction * distance;
  } else {
    boss.x += direction * distance;
  }
}

export function bossAdvanceSpawnPoints(boss: BossHitbox) {
  const x = bossBounds(boss).left - CELL_WIDTH / 2;
  return Array.from({ length: LANES }, (_, lane) => ({
    lane,
    x,
    y: BOARD_Y + lane * CELL_HEIGHT + CELL_HEIGHT / 2
  }));
}

export function syncBossBaseStats(boss: BossState) {
  boss.finalStats = { ...boss.baseStats };
  boss.maxHp = boss.baseStats.maxHp;
  boss.armor = boss.baseStats.armor;
  boss.magicResistance = boss.baseStats.magicResistance;
  boss.speed = boss.baseStats.speed;
  boss.finalDamageReduction = boss.baseStats.finalDamageReduction;
  boss.hp = Math.min(boss.hp, boss.maxHp);
}

export function setBossBaseArmor(boss: BossState, armor: number) {
  boss.baseStats.armor = Math.max(0, armor);
  syncBossBaseStats(boss);
}
