import { BOARD_X, BOARD_Y, BOARD_WIDTH, CELL_WIDTH, CELL_HEIGHT, COLUMNS } from "../config";
import { delLaneSweepConfig, DEL_ECHO_HITBOX_CELLS } from "../data/delBoss";
import type { EnemyKind } from "../types";
import type { BossState as CubeBoss } from "./bossState";
import { delSweepActive } from "./delSweep";

export function delLaneSweepInvincible(boss: CubeBoss) {
  return boss.delLaneSweep?.phase === "warning" || boss.delLaneSweep?.phase === "sweeping";
}

export function startDelLaneSweep(boss: CubeBoss, time: number) {
  if (boss.kind !== "del" || boss.delEcho || delSweepActive(boss) || boss.hp <= 0) return false;
  const previous = boss.delLaneSweep;
  if (previous && (previous.phase !== "complete" || previous.stage === "quarter")) return false;
  const stage = previous ? "quarter" : "half";
  if (boss.hp > boss.maxHp * delLaneSweepConfig(stage).hpRatio) return false;
  boss.delLaneSweep = { stage, phase: "warning", startedAt: time, previousInvincibleUntil: boss.invincibleUntil,
    sealedCells: [], parts: [], summons: 0 };
  boss.invincibleUntil = Infinity;
  return true;
}

export function advanceDelLaneSweep(boss: CubeBoss, time: number, callbacks: {
  createEcho: (x: number, y: number) => CubeBoss;
  removeEcho: (part: CubeBoss) => void;
  sealCell: (lane: number, column: number, durationMs: number) => void;
  summon: (lane: number, kind: EnemyKind) => void;
}) {
  const state = boss.delLaneSweep;
  if (!state || state.phase === "complete") return;
  const { warningMs, speed, sealMs, lanes, summonCount, summonIntervalMs, summonKind } = delLaneSweepConfig(state.stage);
  const startsMovingAt = state.startedAt + warningMs;
  if (time < startsMovingAt) return;
  const entryX = BOARD_X + BOARD_WIDTH + CELL_WIDTH / 2;
  // Fully clear the battlefield's left margin, not just the base line.
  const exitX = BOARD_X - 32 - CELL_WIDTH / 2 - 1;
  const exitedAt = startsMovingAt + (entryX - exitX) / speed * 1000;
  if (state.phase === "warning") {
    state.parts = lanes.map(lane => callbacks.createEcho(entryX, BOARD_Y + (lane + .5) * CELL_HEIGHT));
    state.phase = "sweeping";
  }
  if (state.phase === "sweeping") {
    const nextX = Math.max(exitX, entryX - (time - startsMovingAt) * speed / 1000);
    for (let i = 0; i < state.parts.length; i++) {
      const part = state.parts[i], lane = lanes[i];
      sealDelSweepCells(part.x, nextX, lane, state.sealedCells, sealMs, callbacks.sealCell);
      part.x = nextX;
    }
    if (time < exitedAt) return;
    for (const part of state.parts) callbacks.removeEcho(part);
    state.parts = [];
    state.phase = "summoning";
    boss.invincibleUntil = state.previousInvincibleUntil;
  }
  // Use simulation timestamps, so pausing and save/restore preserve the one-second cadence.
  while (state.summons < summonCount && time >= exitedAt + state.summons * summonIntervalMs) {
    for (const lane of lanes) callbacks.summon(lane, summonKind);
    state.summons++;
  }
  if (time >= exitedAt + summonCount * summonIntervalMs) state.phase = "complete";
}

export function sealDelSweepCells(fromX: number, toX: number, lane: number, sealedCells: string[], sealMs: number,
  sealCell: (lane: number, column: number, durationMs: number) => void) {
  const halfWidth = CELL_WIDTH * DEL_ECHO_HITBOX_CELLS / 2;
  const left = Math.max(0, Math.floor((Math.min(fromX, toX) - halfWidth - BOARD_X) / CELL_WIDTH));
  const right = Math.min(COLUMNS - 1, Math.ceil((Math.max(fromX, toX) + halfWidth - BOARD_X) / CELL_WIDTH) - 1);
  for (let column = left; column <= right; column++) {
    const key = `${lane}:${column}`;
    if (sealedCells.includes(key)) continue;
    sealedCells.push(key);
    sealCell(lane, column, sealMs);
  }
}
