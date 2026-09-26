import { BOARD_X, BOARD_Y, BOARD_WIDTH, CELL_WIDTH, CELL_HEIGHT } from "../config";
import { DEL_ECHO_HITBOX_CELLS } from "../data/delBoss";
import type { BossSimulationRuntime } from "./bossSimulationRuntime";
import { bossHealthRoots } from "./unitGeometry";
import { sealDelSweepCells } from "./delLaneSweep";

export function updateEnvironmentalDelSweep(runtime: BossSimulationRuntime, seconds: number) {
  const environment = runtime.environmentalDel!;
  const { intervalMs, warningMs, laneGroups, speed, sealMs } = environment.config;
  const time = runtime.battleTime;
  const cycle = Math.floor((time + 1e-6) / intervalMs);
  const elapsed = time - cycle * intervalMs;
  const warning = cycle >= 1 && elapsed < warningMs - 1e-6;
  runtime.presentation.environmentalWarning(warning ? laneGroups[(cycle - 1) % laneGroups.length] : [],
    Math.max(0, elapsed / warningMs), Math.max(0, elapsed));

  const parts = bossHealthRoots(runtime.getBoss());
  const first = Math.max(1, Math.floor((time - seconds * 1000 - warningMs + 1e-6) / intervalMs) + 1);
  const last = Math.floor((time - warningMs + 1e-6) / intervalMs);
  const entryX = BOARD_X + BOARD_WIDTH + CELL_WIDTH / 2;
  const exitX = BOARD_X - 32 - CELL_WIDTH / 2 - 1;
  for (let index = first; index <= last; index++) {
    if (parts.some(part => part.environmentalDel?.startedAt === index * intervalMs + warningMs)) continue;
    for (const lane of laneGroups[(index - 1) % laneGroups.length]) {
      const boss = runtime.createBoss("del", 0, { x: entryX, y: BOARD_Y + (lane + .5) * CELL_HEIGHT });
      boss.delEcho = true;
      boss.hasSkills = false;
      boss.invincibleUntil = Infinity;
      boss.hitboxWidth = CELL_WIDTH * DEL_ECHO_HITBOX_CELLS;
      boss.hitboxHeight = CELL_HEIGHT * DEL_ECHO_HITBOX_CELLS;
      boss.environmentalDel = { startedAt: index * intervalMs + warningMs, lane, sealedCells: [] };
      runtime.presentation.bossDepth(boss, 87);
      parts.push(boss);
    }
  }
  const survivors = [];
  for (const part of parts) {
    const state = part.environmentalDel!;
    const nextX = Math.max(exitX, entryX - Math.max(0, time - state.startedAt) * speed / 1000);
    sealDelSweepCells(part.x, nextX, state.lane, state.sealedCells, sealMs, runtime.sealCell);
    part.x = nextX;
    delete part.independentBosses;
    if (nextX <= exitX) runtime.presentation.removeEcho(part);
    else {
      runtime.presentation.motion(part, seconds, time);
      survivors.push(part);
    }
  }
  if (survivors.length > 1) survivors[0].independentBosses = survivors.slice(1);
  environment.setBoss(survivors[0] ?? null);
}
