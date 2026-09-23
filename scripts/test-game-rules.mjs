import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

test("timed seals wait for a 1s cue and 5s warning, erase once, and last 90s", () => {
  const { TimedCellSeals } = createTypeScriptLoader()("src/game/timedCellSeals.ts");
  const seals = new TimedCellSeals(), erased = [];
  const erase = (lane, column) => {
    assert.ok(seals.isSealed(lane, column), "Seal must block mirror respawn before erasure");
    erased.push([lane, column]);
  };
  seals.warn(2, 5, 100, 5000, 90000, 1000);
  assert.equal(seals.entries[0].warnedAt, 1100);
  for (const time of [100, 1000, 1100, 6099]) {
    assert.equal(seals.update(time, erase), false);
    assert.equal(seals.isSealed(2, 5), false);
  }
  assert.equal(seals.update(6100, erase), true);
  assert.deepEqual(erased, [[2, 5]]);
  for (const time of [6100, 6100, 96100 - 1]) {
    seals.update(time, erase);
    assert.equal(seals.isSealed(2, 5), true);
  }
  assert.equal(erased.length, 1);
  assert.equal(seals.update(96100, erase), true);
  assert.equal(seals.isSealed(2, 5), false);
});

test("timed seals restore both cue and active phases and retain overlapping seals", () => {
  const { TimedCellSeals } = createTypeScriptLoader()("src/game/timedCellSeals.ts");
  let seals = new TimedCellSeals();
  seals.warn(0, 1, 0, 5000, 90000, 1000);
  const restore = () => {
    const saved = JSON.parse(JSON.stringify(seals.snapshot()));
    seals = new TimedCellSeals(); seals.restore(saved);
  };
  restore();
  let erased = 0;
  seals.update(6000, () => erased++);
  restore();
  seals.update(7000, () => erased++);
  assert.equal(erased, 1);
  seals.warn(0, 1, 40000, 5000, 90000, 1000);
  seals.update(46000, () => erased++);
  assert.equal(erased, 2);
  seals.update(96000, () => erased++);
  assert.equal(seals.isSealed(0, 1), true);
  seals.update(136000, () => erased++);
  assert.equal(seals.isSealed(0, 1), false);
  seals.restore();
  assert.deepEqual(seals.snapshot(), []);
});

test("immediate seals preserve longer bans and shrink at a duration-relative rate", () => {
  const { TimedCellSeals, timedCellSealScale } = createTypeScriptLoader()("src/game/timedCellSeals.ts");
  const seals = new TimedCellSeals();
  let erasures = 0;
  seals.seal(2, 3, 1000, 90000, () => erasures++);
  seals.seal(2, 3, 2000, 40000, () => erasures++);
  assert.equal(erasures, 1);
  assert.equal(seals.entries[0].expiresAt, 91000);
  seals.seal(2, 3, 60000, 40000, () => erasures++);
  assert.equal(seals.entries[0].expiresAt, 100000);
  assert.equal(erasures, 1);
  for (const duration of [40000, 90000]) {
    const seal = { active: true, lane: 0, column: 0, warnedAt: 100, sealsAt: 100, expiresAt: 100 + duration };
    assert.equal(timedCellSealScale(seal, 100), 1);
    assert.equal(timedCellSealScale(seal, 100 + duration / 2), .75);
    assert.equal(timedCellSealScale(seal, 100 + duration), .5);
    assert.equal(timedCellSealScale(seal, 100 + duration * 2), .5);
  }
});

test("timed seal crosses and warnings draw on separate layers", () => {
  const load = createTypeScriptLoader();
  const { drawTimedCellSeals } = load("src/render/timedCellSeals.ts");
  const { createCellSealMark } = load("src/render/cellSealMark.ts");
  const created = [];
  const scene = { children: {}, add: { text: (x,y,text,style) => {
    const mark = { x,y,text,style, destroy() { this.destroyed = true; } };
    for (const name of ["Origin","Depth","Alpha","Stroke","Scale"]) mark[`set${name}`] = (...args) => {
      mark[name] = args; return mark;
    };
    created.push(mark); return mark;
  } } };
  const mock = () => {
    const calls = [];
    const graphics = Object.fromEntries(["clear", "lineStyle", "lineBetween", "fillStyle", "fillRect", "strokeRect"]
      .map(name => [name, (...args) => calls.push([name, ...args])]));
    return { calls, graphics };
  };
  const marks = mock(), warnings = mock();
  marks.graphics.scene = scene; marks.graphics.depth = 1; marks.graphics.displayList = scene.children;
  marks.graphics.once = (_event, callback) => { marks.destroy = callback; };
  drawTimedCellSeals(marks.graphics, [
    { lane: 2, column: 3, active: true, warnedAt: 0, sealsAt: 0, expiresAt: 40000 },
    { lane: 2, column: 4, active: false, warnedAt: 19000, sealsAt: 24000, expiresAt: 114000 }
  ], 20000, warnings.graphics);
  const timed = created[0], permanent = createCellSealMark(scene, 2, 3);
  assert.equal(timed.text, "×"); assert.deepEqual(timed.style, permanent.style);
  for (const key of ["x","y","Origin","Depth","Alpha","Stroke"]) assert.deepEqual(timed[key],permanent[key]);
  assert.deepEqual(timed.Scale,[.75]);
  assert.ok(marks.calls.every(([name]) => name !== "fillRect" && name !== "strokeRect"));
  assert.ok(warnings.calls.some(([name]) => name === "strokeRect"));
  assert.ok(warnings.calls.every(([name]) => name !== "lineBetween"));
  const seal = { lane:2,column:3,active:true,warnedAt:0,sealsAt:0,expiresAt:40000 };
  drawTimedCellSeals(marks.graphics,[seal,seal],30000,warnings.graphics);
  assert.equal(created.length,2,"Reuse one glyph for the same cell, including overlapping seals");
  assert.deepEqual(timed.Scale,[.625]);
  drawTimedCellSeals(marks.graphics,[],40000,warnings.graphics);
  assert.equal(timed.destroyed,true,"Expired glyph leaked");
  drawTimedCellSeals(marks.graphics,[seal],0,warnings.graphics);
  marks.destroy(); assert.equal(created.at(-1).destroyed,true,"Scene teardown leaked a glyph");
});

test("DEL sweep warns, sweeps only three lanes, wraps without crossing the board, and returns once", () => {
  const load = createTypeScriptLoader();
  const { startDelSweep, advanceDelSweep, delSweepActive } = load("src/game/delSweep.ts");
  const c = load("src/config.ts");
  const makeBoss = () => ({ kind: "del", hp: 90000, maxHp: 120000, x: c.BOARD_X + c.BOARD_WIDTH - 117,
    y: c.BOARD_Y + 3.5 * c.CELL_HEIGHT, hitboxWidth: 234, hitboxHeight: 234, invincibleUntil: 0,
    baseStats: { speed: 0 }, finalStats: { speed: 0 } });
  const boss = makeBoss();
  boss.hp++;
  assert.equal(startDelSweep(boss, 0), false);
  boss.hp--;
  assert.equal(startDelSweep(boss, 0), true);
  assert.equal(boss.invincibleUntil, Infinity);
  assert.equal(startDelSweep(boss, 100), false);
  const home = boss.x, touched = [];
  const seal = (lane, col, duration) => { touched.push([lane, col]); assert.equal(duration, 40000); };
  advanceDelSweep(boss, 2999, seal);
  assert.equal(boss.x, home); assert.equal(touched.length, 0);
  advanceDelSweep(boss, 4000, seal);
  assert.equal(boss.x, home - 600);
  assert.equal(boss.finalStats.speed, 600);
  assert.ok(touched.every(([lane]) => lane >= 2 && lane <= 4));
  advanceDelSweep(boss, 4000, seal);
  assert.equal(touched.length, new Set(touched.map(String)).size);
  const exitX = c.BOARD_X - 20 - 117 - 1;
  const exitAt = 3000 + (home - exitX) / 600 * 1000;
  advanceDelSweep(boss, exitAt, seal);
  assert.equal(boss.delSweep.phase, "returning");
  assert.equal(boss.x, c.BOARD_X + c.BOARD_WIDTH + 118);
  assert.equal(touched.length, c.COLUMNS * 3, "Teleport must not touch any new cells");
  const entryX = boss.x;
  const endAt = exitAt + (entryX - home) / 600 * 1000;
  advanceDelSweep(boss, endAt + .01, seal);
  assert.equal(boss.x, home); assert.equal(boss.finalStats.speed, 0);
  assert.equal(boss.invincibleUntil, 0); assert.equal(delSweepActive(boss), false);
  assert.equal(startDelSweep(boss, endAt), false);
  const count = touched.length;
  advanceDelSweep(boss, endAt + 10000, seal);
  assert.equal(touched.length, count);
  // Absolute-time motion gives identical saved state after fine/coarse ticking and resume.
  const a = makeBoss(), b = makeBoss(); startDelSweep(a, 0); startDelSweep(b, 0);
  for (let time = 0; time <= 4000; time += 10) advanceDelSweep(a, time, () => {});
  advanceDelSweep(b, 4000, () => {});
  a.delSweep.sealedCells.sort(); b.delSweep.sealedCells.sort();
  assert.deepEqual(a, b);
  const resumed = structuredClone(a);
  advanceDelSweep(a, endAt + 1, () => {}); advanceDelSweep(resumed, endAt + 1, () => {});
  assert.deepEqual(a, resumed);
});

test("DEL half-health sweep shields once, covers only lanes 2/6 and summons three rank-V pairs on battle time", () => {
  const load = createTypeScriptLoader();
  const { startDelLaneSweep, advanceDelLaneSweep } = load("src/game/delLaneSweep.ts");
  const c = load("src/config.ts");
  const boss = { kind: "del", hp: 60001, maxHp: 120000, x: 1100, y: 411, invincibleUntil: 7 };
  assert.equal(startDelLaneSweep(boss, 0), false);
  boss.hp = 60000; boss.delSweep = { phase: "returning" };
  assert.equal(startDelLaneSweep(boss, 0), false, "Do not overlap the 75% sweep");
  boss.delSweep.phase = "complete";
  assert.equal(startDelLaneSweep(boss, 0), true);
  assert.equal(boss.invincibleUntil, Infinity);
  let destroyed = 0;
  const cells = [], summons = [], echoes = [];
  const callbacks = {
    createEcho: (x,y) => { const echo = { x,y,body: { destroy: () => destroyed++ } }; echoes.push(echo); return echo; },
    sealCell: (lane,col,ms) => { assert.equal(ms,40000); cells.push(`${lane}:${col}`); },
    summon: lane => summons.push(lane)
  };
  advanceDelLaneSweep(boss, 2999, callbacks); assert.equal(echoes.length, 0);
  advanceDelLaneSweep(boss, 3500, callbacks);
  assert.equal(echoes.length, 2);
  assert.deepEqual(echoes.map(p => p.y), [1,5].map(lane => c.BOARD_Y + (lane+.5)*c.CELL_HEIGHT));
  assert.equal(echoes[0].x, c.BOARD_X+c.BOARD_WIDTH+c.CELL_WIDTH/2-300);
  assert.equal(boss.x, 1100); assert.equal(boss.y, 411);
  const exitAt = 3000 + (c.BOARD_WIDTH+c.CELL_WIDTH+33)/600*1000;
  advanceDelLaneSweep(boss, exitAt-1, callbacks);
  assert.equal(boss.invincibleUntil, Infinity); assert.equal(summons.length,0);
  advanceDelLaneSweep(boss, exitAt+.01, callbacks);
  assert.equal(destroyed,2); assert.equal(boss.delLaneSweep.parts.length,0);
  assert.equal(cells.length,26); assert.equal(new Set(cells).size,26);
  assert.ok(cells.every(key => key.startsWith("1:") || key.startsWith("5:")));
  assert.equal(boss.invincibleUntil,7); assert.deepEqual(summons,[1,5]);
  advanceDelLaneSweep(boss, exitAt+999, callbacks); assert.equal(summons.length,2);
  advanceDelLaneSweep(boss, exitAt+1000, callbacks); assert.equal(summons.length,4);
  const resumed = structuredClone(boss);
  advanceDelLaneSweep(boss, exitAt+3001, callbacks);
  const restoredSummons = [];
  advanceDelLaneSweep(resumed, exitAt+3001, { ...callbacks, summon: lane => restoredSummons.push(lane) });
  assert.deepEqual(boss,resumed); assert.deepEqual(restoredSummons,[1,5]);
  assert.deepEqual(summons,[1,5,1,5,1,5]); assert.equal(boss.delLaneSweep.phase,"complete");
  assert.equal(startDelLaneSweep(boss,exitAt+4000),false);
  advanceDelLaneSweep(boss,exitAt+5000,callbacks); assert.equal(summons.length,6);
});

test("DEL quarter-health sweep follows the half event, seals outer lanes and summons one Heart I per lane", () => {
  const load = createTypeScriptLoader();
  const { startDelLaneSweep, advanceDelLaneSweep } = load("src/game/delLaneSweep.ts");
  const c = load("src/config.ts");
  const boss = { kind: "del", hp: 30001, maxHp: 120000, x: 1100, y: 411, invincibleUntil: 0,
    delLaneSweep: { phase: "complete" } }; // Legacy half-health save, no stage tag.
  assert.equal(startDelLaneSweep(boss, 100), false);
  boss.hp = 30000;
  assert.equal(startDelLaneSweep(boss, 100), true);
  assert.equal(boss.delLaneSweep.stage, "quarter");
  assert.equal(boss.invincibleUntil, Infinity);
  const cells = [], summons = [], echoes = [];
  let destroyed = 0;
  const callbacks = {
    createEcho: (x,y) => { const echo = { x,y,body: { destroy: () => destroyed++ } }; echoes.push(echo); return echo; },
    sealCell: (lane,col,ms) => { assert.equal(ms,40000); cells.push(`${lane}:${col}`); },
    summon: (lane,kind) => summons.push([lane,kind])
  };
  advanceDelLaneSweep(boss, 3099, callbacks); assert.equal(echoes.length,0);
  advanceDelLaneSweep(boss, 3600, callbacks);
  assert.deepEqual(echoes.map(p => p.y), [0,6].map(lane => c.BOARD_Y+(lane+.5)*c.CELL_HEIGHT));
  assert.equal(echoes[0].x,c.BOARD_X+c.BOARD_WIDTH+c.CELL_WIDTH/2-300);
  assert.equal(summons.length,0);
  advanceDelLaneSweep(boss, 10000, callbacks);
  assert.equal(destroyed,2); assert.equal(cells.length,26); assert.equal(new Set(cells).size,26);
  assert.ok(cells.every(key => key.startsWith("0:") || key.startsWith("6:")));
  assert.deepEqual(summons,[[0,"heart"],[6,"heart"]]);
  assert.equal(boss.invincibleUntil,0); assert.equal(boss.x,1100); assert.equal(boss.y,411);
  assert.equal(boss.delLaneSweep.phase,"complete");
  boss.hp = 1; assert.equal(startDelLaneSweep(boss,11000),false);
  const resumed = structuredClone(boss);
  assert.equal(startDelLaneSweep(resumed,12000),false);
  advanceDelLaneSweep(resumed,12000,callbacks); assert.equal(summons.length,2);
  const pending = { ...boss, delLaneSweep: { phase: "summoning", stage: "half" } };
  assert.equal(startDelLaneSweep(pending,12000),false,"Earlier summons must finish before the quarter event");
  pending.delLaneSweep.phase = "complete";
  assert.equal(startDelLaneSweep(pending,12000),true);
});

test("O specializes in magic resistance without changing its cost, health or cooldown", () => {
  const { cardDefinitions } = createTypeScriptLoader()("src/data/cards.ts");
  const card = cardDefinitions.find(card => card.id === "O");
  assert.equal(card.armor, 300);
  assert.equal(card.magicResistance, 70);
  assert.equal(card.maxHp, 3000);
  assert.equal(card.cost, 125);
  assert.equal(card.cooldown, 20000);
  assert.equal(card.stats, "3000 A300 MR70");
});

// Load the pure rules with the project's compiler, without a browser or Phaser.
const source = fs.readFileSync(new URL("../src/game/rules/towerMovement.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const { planTowerMove } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const pushModule = ts.transpileModule(fs.readFileSync(new URL("../src/game/rules/towerPush.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const { planTowerPush } = await import(`data:text/javascript;base64,${Buffer.from(pushModule.outputText).toString("base64")}`);

test("box push moves contiguous chains in all four directions, leaving the source and towers beyond gaps unchanged", () => {
  for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const source = { id: "source", lane: 3, column: 6, inPlay: true };
    const towers = [source, ...[1, 2, 4].map(n => ({ id: String(n), lane: 3 + n * dy, column: 6 + n * dx, inPlay: true }))];
    const board = { lanes: 7, columns: 13, getTower: id => towers.find(t => t.id === id),
      occupantAt: (lane, column) => towers.find(t => t.lane === lane && t.column === column)?.id,
      isCellDeployable: () => true };
    const plan = planTowerPush(source, towers[1], board);
    assert.deepEqual(plan.map(m => m.towerId), ["1", "2"]);
    assert.equal(plan.every(m => m.toLane - m.fromLane === dy && m.toColumn - m.fromColumn === dx && !m.erased), true);
    assert.equal(source.lane, 3);
    assert.equal(source.column, 6);
    assert.equal(planTowerPush(source, source, board), null);
    assert.equal(planTowerPush(source, { lane: 4, column: 7 }, board), null);
    assert.equal(planTowerPush(source, { lane: 3 - dy, column: 6 - dx }, board), null);
  }
});

test("box push erases at board edges and sealed destinations instead of blocking", () => {
  for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const source = { id: "source", lane: dy < 0 ? 2 : dy > 0 ? 4 : 3, column: dx < 0 ? 2 : dx > 0 ? 10 : 6, inPlay: true };
    const towers = [source, ...[1, 2].map(n => ({ id: String(n), lane: source.lane + n * dy, column: source.column + n * dx, inPlay: true }))];
    const board = { lanes: 7, columns: 13, getTower: id => towers.find(t => t.id === id),
      occupantAt: (lane, column) => towers.find(t => t.lane === lane && t.column === column)?.id,
      isCellDeployable: () => true };
    assert.deepEqual(planTowerPush(source, towers[1], board).map(m => m.erased), [false, true]);
    board.isCellDeployable = (lane, column) => lane !== towers[2].lane || column !== towers[2].column;
    const sealed = planTowerPush(source, towers[1], board);
    assert.equal(sealed.length, 1);
    assert.equal(sealed[0].erased, true);
  }
});

const { LoadoutReselection, RESELECT_UNLOCK_LEVEL, RESELECT_COOLDOWN } = createTypeScriptLoader()("src/game/loadoutReselection.ts");

test("changing imitation target cannot reset the imitator cooldown and preserves the native slot", () => {
  const state = new LoadoutReselection();
  state.confirm(240000, [{ definition: { id: "?A" }, readyAt: 502000, displayTime: 500000 },
    { definition: { id: "A" }, readyAt: 501000 }]);
  assert.equal(state.cardReadyAt("?B", 500000, 240000), 502000);
  assert.equal(state.cardReadyAt("A"), 501000);
  const restored = new LoadoutReselection(); restored.restore(state.snapshot());
  assert.equal(restored.cardReadyAt("?=", 750000, 241000), 751000);
  assert.equal(restored.cardReadyAt("?()", 900000, 244000), 900000);
});

test("reselection unlocks after 2-4 and starts each battle and confirmation with a full 240-second cooldown", () => {
  const state = new LoadoutReselection();
  assert.equal(RESELECT_UNLOCK_LEVEL, "2-4");
  assert.equal(RESELECT_COOLDOWN, 240_000);
  assert.equal(state.isReady(0), false);
  assert.equal(state.readyRatio(0), 0);
  assert.equal(state.confirm(0, []), false);
  assert.equal(state.readyRatio(120_000), 0.5);
  assert.equal(state.isReady(239_999), false);
  assert.equal(state.isReady(240_000), true);
  assert.equal(state.confirm(240_000, []), true);
  assert.equal(state.isReady(240_000), false);
  assert.equal(state.readyRatio(240_000), 0);
  assert.equal(state.readyRatio(360_000), 0.5);
  assert.equal(state.isReady(479_999), false);
  assert.equal(state.isReady(480_000), true);
  assert.equal(state.readyRatio(999_999), 1);
  assert.equal(new LoadoutReselection().readyRatio(0), 0);
});

test("reselection preserves card deadlines across removal, return and separate card clocks", () => {
  const state = new LoadoutReselection();
  const a = { definition: { id: "A" }, readyAt: 900_000 };
  const c = { definition: { id: "c" }, readyAt: 123_456 };
  const cards = [a, c];
  state.confirm(240_000, cards);
  a.readyAt = 0;
  assert.equal(state.cardReadyAt("A"), 900_000);
  assert.equal(state.cardReadyAt("c"), 123_456);
  assert.equal(state.cardReadyAt("B"), 0);
  assert.equal(state.confirm(479_999, [a]), false);
  assert.equal(state.cardReadyAt("A"), 900_000);
  state.confirm(480_000, [{ definition: { id: "B" }, readyAt: 600_000 }]);
  assert.equal(state.cardReadyAt("A"), 900_000);
  assert.equal(state.cardReadyAt("B"), 600_000);
  state.confirm(720_000, [{ definition: { id: "A" }, readyAt: 950_000 }]);
  assert.equal(state.cardReadyAt("A"), 950_000);
  assert.equal(state.cardReadyAt("c"), 123_456);
});

function fixture() {
  const a = { id: "tower:0", lane: 1, column: 2, inPlay: true };
  const b = { id: "tower:1", lane: 2, column: 3, inPlay: true };
  const towers = new Map([[a.id, a], [b.id, b]]);
  const occupied = new Map([["1:2", a.id], ["2:3", b.id]]);
  const sealed = new Set();
  const board = {
    lanes: 7,
    columns: 13,
    getTower: (id) => towers.get(id),
    occupantAt: (lane, column) => occupied.get(`${lane}:${column}`),
    isCellDeployable: (lane, column) => !sealed.has(`${lane}:${column}`)
  };
  const command = (selected = [a, b], lane = 3, column = 7) => ({
    type: "moveTowers",
    sources: selected.map((tower) => ({ towerId: tower.id, lane: tower.lane, column: tower.column })),
    destination: { lane, column }
  });
  return { a, b, towers, occupied, sealed, board, command };
}

test("a JSON round-trip command preserves the diagonal formation and compounded cooldown", () => {
  const f = fixture();
  const request = JSON.parse(JSON.stringify(f.command()));
  assert.deepEqual(planTowerMove(request, f.board), {
    valid: true,
    moves: [
      { towerId: f.a.id, fromLane: 1, fromColumn: 2, toLane: 3, toColumn: 7 },
      { towerId: f.b.id, fromLane: 2, fromColumn: 3, toLane: 4, toColumn: 8 }
    ],
    cooldownMs: 18_000
  });
  assert.equal(planTowerMove(f.command([f.a]), f.board).cooldownMs, 15_000);
  const c = { id: "tower:2", lane: 3, column: 3, inPlay: true };
  f.towers.set(c.id, c);
  f.occupied.set("3:3", c.id);
  assert.ok(Math.abs(planTowerMove(f.command([f.a, f.b, c]), f.board).cooldownMs - 21_600) < 1e-8);
});

test("anchor is topmost, then leftmost, independent of selection order", () => {
  const f = fixture();
  const forward = planTowerMove(f.command(), f.board);
  const reversed = planTowerMove(f.command([f.b, f.a]), f.board);
  assert.deepEqual(reversed.moves.slice().reverse(), forward.moves);
  f.occupied.delete("2:3");
  f.b.lane = 1;
  f.occupied.set("1:3", f.b.id);
  const sameRow = planTowerMove(f.command([f.b, f.a]), f.board);
  assert.equal(sameRow.moves.find((move) => move.towerId === f.a.id).toColumn, 7);
});

test("moving a group into its own vacated cells is allowed", () => {
  const f = fixture();
  assert.equal(planTowerMove(f.command([f.a, f.b], 2, 3), f.board).valid, true);
});

test("an unrelated occupant blocks the entire move", () => {
  const f = fixture();
  f.occupied.set("4:8", "tower:other");
  assert.deepEqual(planTowerMove(f.command(), f.board), { valid: false, reason: "occupied" });
  assert.equal(f.a.lane, 1);
  assert.equal(f.b.lane, 2);
});

test("any sealed or out-of-bounds destination rejects the entire group", () => {
  const f = fixture();
  f.sealed.add("4:8");
  assert.deepEqual(planTowerMove(f.command(), f.board), { valid: false, reason: "sealed" });
  for (const [lane, column] of [[6, 7], [3, 12], [-1, 0], [0, -1]]) {
    assert.deepEqual(planTowerMove(f.command([f.a, f.b], lane, column), f.board), { valid: false, reason: "outside" });
  }
});

test("preview cannot authorize a later move after the board changes", () => {
  const f = fixture();
  const request = f.command();
  assert.equal(planTowerMove(request, f.board).valid, true);
  f.occupied.set("4:8", "tower:new");
  assert.deepEqual(planTowerMove(request, f.board), { valid: false, reason: "occupied" });
  f.occupied.delete("4:8");
  f.b.column += 1;
  assert.deepEqual(planTowerMove(request, f.board), { valid: false, reason: "stale" });
});

test("removed or replaced source towers invalidate the request", () => {
  for (const change of [
    (f) => { f.b.inPlay = false; },
    (f) => { f.towers.delete(f.b.id); },
    (f) => { f.occupied.set("2:3", "tower:replacement"); }
  ]) {
    const f = fixture();
    const request = f.command();
    change(f);
    assert.deepEqual(planTowerMove(request, f.board), { valid: false, reason: "stale" });
  }
});

test("duplicate sources and non-integral coordinates are rejected", () => {
  const f = fixture();
  assert.deepEqual(planTowerMove(f.command([f.a, f.a]), f.board), { valid: false, reason: "invalid" });
  for (const lane of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(planTowerMove(f.command([f.a], lane, 0), f.board), { valid: false, reason: "invalid" });
  }
  assert.deepEqual(planTowerMove(f.command([]), f.board), { valid: false, reason: "empty" });
});

test("planning never mutates the command or source state", () => {
  const f = fixture();
  const request = f.command();
  request.sources.forEach(Object.freeze);
  Object.freeze(request.sources);
  Object.freeze(request.destination);
  Object.freeze(request);
  Object.freeze(f.a);
  Object.freeze(f.b);
  const before = [...f.occupied];
  assert.equal(planTowerMove(request, f.board).valid, true);
  assert.deepEqual([...f.occupied], before);
});
