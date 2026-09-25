import { BOARD_X, BOARD_Y, BOARD_WIDTH, CELL_WIDTH, CELL_HEIGHT, COLUMNS, LANES } from "../config";
import { DEL_SWEEP } from "../data/delBoss";
import type { BossState as CubeBoss } from "./bossState";

export function delSweepActive(boss: CubeBoss) {
  return boss.kind === "del" && !!boss.delSweep && boss.delSweep.phase !== "complete";
}

export function startDelSweep(boss: CubeBoss, time: number) {
  if (boss.kind !== "del" || boss.delSweep || boss.hp <= 0 || boss.hp > boss.maxHp * DEL_SWEEP.hpRatio) return false;
  boss.delSweep = { phase: "warning", startedAt: time, homeX: boss.x, homeY: boss.y,
    previousInvincibleUntil: boss.invincibleUntil, sealedCells: [] };
  boss.invincibleUntil = Infinity;
  return true;
}

export function delSweepSpeed(boss: CubeBoss) {
  return boss.kind === "del" && (boss.delSweep?.phase === "outbound" || boss.delSweep?.phase === "returning")
    ? DEL_SWEEP.speed : boss.baseStats.speed;
}

export function advanceDelSweep(boss: CubeBoss, time: number, sealCell: (lane: number, column: number, durationMs: number) => void) {
  if (!delSweepActive(boss)) return false;
  const state = boss.delSweep!;
  const elapsed = time - state.startedAt - DEL_SWEEP.warningMs;
  if (elapsed < 0) return true;
  const leftExit = BOARD_X - 20 - boss.hitboxWidth / 2 - 1;
  const rightEntry = BOARD_X + BOARD_WIDTH + boss.hitboxWidth / 2 + 1;
  const outboundDistance = state.homeX - leftExit;
  const distance = elapsed * DEL_SWEEP.speed / 1000;
  const sealSegment = (fromX: number, toX: number) => {
    const left = Math.max(0, Math.floor((Math.min(fromX, toX) - boss.hitboxWidth / 2 - BOARD_X) / CELL_WIDTH));
    const right = Math.min(COLUMNS - 1, Math.ceil((Math.max(fromX, toX) + boss.hitboxWidth / 2 - BOARD_X) / CELL_WIDTH) - 1);
    const top = Math.max(0, Math.floor((state.homeY - boss.hitboxHeight / 2 - BOARD_Y) / CELL_HEIGHT));
    const bottom = Math.min(LANES - 1, Math.ceil((state.homeY + boss.hitboxHeight / 2 - BOARD_Y) / CELL_HEIGHT) - 1);
    // Swept bounds prevent missed cells; each cell is touched once per pass, not once per tick.
    for (let lane = top; lane <= bottom; lane++) for (let column = left; column <= right; column++) {
      const key = `${lane}:${column}`;
      if (state.sealedCells.includes(key)) continue;
      state.sealedCells.push(key);
      sealCell(lane, column, DEL_SWEEP.sealMs);
    }
  };
  if (distance < outboundDistance) {
    const nextX = state.homeX - distance;
    sealSegment(boss.x, nextX);
    boss.x = nextX;
    state.phase = "outbound";
  } else {
    if (state.phase !== "returning") {
      sealSegment(boss.x, leftExit);
      state.sealedCells = [];
      boss.x = rightEntry;
      state.phase = "returning";
    }
    const nextX = Math.max(state.homeX, rightEntry - (distance - outboundDistance));
    sealSegment(boss.x, nextX);
    boss.x = nextX;
    if (nextX === state.homeX) {
      state.phase = "complete";
      boss.invincibleUntil = state.previousInvincibleUntil;
    }
  }
  boss.y = state.homeY;
  boss.speed = boss.finalStats.speed = delSweepSpeed(boss);
  return true;
}
