import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { TowerDeploymentSimulation } = load("src/game/towerDeploymentRules.ts");
const { TowerMirrorSimulation } = load("src/game/towerMirrorRules.ts");
const { TowerBoardSimulation } = load("src/game/towerBoard.ts");
const { TargetedEffectSimulation } = load("src/game/targetedEffectRules.ts");
const { TowerSkillSimulation } = load("src/game/towerSkillSimulation.ts");
const { TowerExtractionPool } = load("src/game/towerExtraction.ts");
const { BattleActionQueue } = load("src/game/battleActions.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { NO_UNIT_LIFECYCLE_PRESENTATION } = load("src/game/unitLifecyclePresentation.ts");
const { NO_TOWER_SKILL_PRESENTATION } = load("src/game/towerSkillPresentation.ts");
const { connectTowerTopology, syncTowerTopology, towerCell } = load("src/game/towerTopology.ts");
const { changeTowerHealth } = load("src/game/towerHealthRules.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const life = load("src/game/unitLifecycle.ts");
const { BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");

// Compose real rules/factories/lifecycle; no Phaser or display objects are created.
function fixture(saved) {
  const state = saved ?? { towers: [], cardStates: cardDefinitions.map(definition => ({ definition, readyAt: 0 })),
    time: 0, order: 0, chars: 100000, unlimitedFirepower: false, autoUpgradeEnabled: false, autoUpgradeReserveChars: 0 };
  const occupied = new Map(), removed = [], queue = new BattleActionQueue(), extraction = new TowerExtractionPool();
  if (saved?.pending) queue.restore(saved.pending);
  extraction.restore(saved?.extraction ?? 0);
  const common = {
    get towers() { return state.towers; }, get battleTime() { return state.time; }, occupied, getDefinition: getCardDefinition,
    get cardStates() { return state.cardStates; }, get unlimitedFirepower() { return state.unlimitedFirepower; },
    get autoUpgradeEnabled() { return state.autoUpgradeEnabled; }, get autoUpgradeReserveChars() { return state.autoUpgradeReserveChars; },
    extraction, cardTimeFor: () => state.time, getChars: () => state.chars, spendChars: n => { state.chars -= n; },
    nextTowerOrder: () => state.order++, createTower: createTowerState,
    isCellDeployable: (lane, column) => lane >= 0 && lane < 7 && column >= 0 && column < 13 && column !== 12,
    updateLevelAuras: () => board.refresh(), resetTowerSkill: t => skills.resetTowerSkill(t),
    mirrorGroupFor: t => mirrors.mirrorGroupFor(t), runMirrorGroupEvent: (t, action) => mirrors.runMirrorGroupEvent(t, action),
    createTargetedEffectMirror: (source, target) => targeted.createMirroredEffect(source, target),
    scheduleBattleAction: (delay, action) => queue.schedule(state.time, delay, action),
    removeTower: t => life.removeTower(lifecycle, t)
  };
  const lifecycle = {
    get towers() { return state.towers; }, get battleTime() { return state.time; }, occupied,
    enemies: [], projectiles: [], enemyProjectiles: [], mortarProjectiles: [], finalDamageReduction: 0,
    presentation: NO_UNIT_LIFECYCLE_PRESENTATION, getBoss: () => null, getWaveTracker() {},
    onEnemyDefeated() {}, onTowerDamaged() {}, endLevel() {},
    onTowerRemoved: t => {
      removed.push(t.id); syncTowerTopology(state.towers);
      mirrors.handleTowerRemoved(t, member => life.removeTower(lifecycle, member));
    }
  };
  const skills = new TowerSkillSimulation(() => ({ towers: state.towers, enemies: [], boss: null, battleTime: state.time,
    presentation: NO_TOWER_SKILL_PRESENTATION, getDefinition: getCardDefinition }));
  const targeted = new TargetedEffectSimulation(() => common), mirrors = new TowerMirrorSimulation(() => common);
  const board = new TowerBoardSimulation(() => ({ towers: state.towers, occupied, battleTime: state.time,
    getDefinition: getCardDefinition, syncMirrorLevelBonuses: () => mirrors.syncMirrorLevelBonuses(),
    settleHealth: () => life.settleTowerHealth(lifecycle), syncCircuits() {} }));
  const deployment = new TowerDeploymentSimulation(() => common);
  mirrors.restoreGroups(saved?.nextGroupId ?? 1); board.refresh();
  const sync = () => { mirrors.syncMirrors(); board.refresh(); };
  const place = (id, column, lane = 3) => {
    const card = state.cardStates.find(c => c.definition.id === id); card.readyAt = 0;
    assert.equal(deployment.useCard(card.definition, lane, column), "deployed");
    sync(); return state.towers.find(t => t.type === id && t.column === column && t.lane === lane && !t.transient);
  };
  const flush = () => { queue.update(state.time, action => {
    assert.equal(action.type, "targetedEffect"); targeted.resolvePendingEffectCard(action.tower);
  }); sync(); };
  const snapshot = () => captureBattleSnapshot({ ...state, pending: queue.snapshot(), nextGroupId: mirrors.snapshotNextGroupId(), extraction: extraction.value });
  return { state, occupied, removed, common, lifecycle, skills, targeted, mirrors, board, deployment, extraction, place, sync, flush, snapshot };
}

test("actual deployment preserves spending, extraction, layers and unavailable cells without visuals", () => {
  const f = fixture(), b = f.place("B", 2), shell = f.place("[]", 2);
  assert.equal(b.parenthesisGuard, shell); assert.equal(shell.parenthesisInner, b);
  f.extraction.restore(getCardDefinition("B").cost * 3 + 1);
  const before = f.state.chars; f.place("B", 2);
  assert.equal(b.level, 4); assert.equal(shell.level, 1); assert.equal(f.extraction.value, 0);
  assert.equal(f.state.chars, before - getCardDefinition("B").cost * 3);
  const money = f.state.chars; f.state.cardStates.find(c => c.definition.id === "B").readyAt = 0;
  assert.equal(f.deployment.useCard(getCardDefinition("B"), 3, 12), "occupied");
  assert.equal(f.deployment.useCard(getCardDefinition("="), 3, 5), "occupied");
  assert.equal(f.state.chars, money); assert.ok(f.state.towers.every(t => !("body" in t)));
});

test("upgrading resets real skills and trap arming, including a copied trap", () => {
  const f = fixture(), w = f.place("w", 1), trap = f.place("G", 3), copy = f.place("@", 2);
  assert.equal(copy.copiedType, "G");
  w.skills.airPatrol.sp = 10; f.state.time = 5000;
  f.place("w", 1); assert.equal(w.skills.airPatrol.sp, 0);
  f.place("G", 3); f.place("@", 2);
  assert.equal(trap.armedAt, 5000 + getCardDefinition("G").armTime);
  assert.equal(copy.armedAt, trap.armedAt); assert.equal(copy.level, 2);
});

test("mirror chains upgrade as one network and maintain level bonuses until removal", () => {
  const f = fixture(), a = f.place("A", 1), first = f.place("m", 2); f.place("m", 4);
  const group = f.mirrors.mirrorGroupFor(a); assert.equal(group.length, 3);
  f.place("A", 3); assert.ok(group.every(t => t.level === 2));
  f.place("m", 2); assert.equal(first.level, 2); assert.ok(group.every(t => t.mirrorLevelBonus === 1));
  life.removeTower(f.lifecycle, group[1]); f.sync();
  assert.ok(group.every(t => !t.inPlay)); assert.equal(f.state.towers.filter(t => t.type === "A").length, 0);
  assert.equal(new Set(f.removed).size, 3);
});

test("unlimited columns upgrade an existing mirror group once for one cost", () => {
  const f = fixture(), a = f.place("B", 3, 1); f.place("m", 3, 2);
  const group = f.mirrors.mirrorGroupFor(a); assert.equal(group.length, 2);
  f.state.unlimitedFirepower = true; const chars = f.state.chars;
  f.place("B", 3, 0);
  assert.ok(group.every(t => t.level === 2)); assert.equal(f.state.chars, chars - getCardDefinition("B").cost);
  assert.equal(f.state.towers.filter(t => t.type === "B").length, 6);
});

test("mirrored pending attachments work across occupied cells and resume with group identity", () => {
  const f = fixture(), a = f.place("A", 1), b = f.place("B", 3); f.place("m", 2);
  assert.equal(f.targeted.use(getCardDefinition("t"), 3, 1, a), "handled"); f.sync();
  const effects = f.state.towers.filter(t => t.transient); assert.equal(effects.length, 2);
  assert.equal(effects[0].mirrorGroupId, effects[1].mirrorGroupId);
  const restored = fixture(decodeSaveGraph(f.snapshot(), () => ({})));
  f.state.time = restored.state.time = 25; f.flush(); restored.flush();
  assert.equal(a.trueDamageUntil, 12025); assert.equal(b.trueDamageUntil, 12025);
  assert.ok(effects.every(t => !t.inPlay)); assert.deepEqual(restored.snapshot(), f.snapshot());
});

test("group effects consume all mirrored one-shot sources without regenerating siblings", () => {
  const f = fixture(), source = f.place("i", 1); f.place("m", 2);
  const group = f.mirrors.mirrorGroupFor(source); assert.equal(group.length, 2);
  const actions = [];
  f.mirrors.runMirrorGroupEvent(source, member => { actions.push(member.id); life.removeTower(f.lifecycle, member); });
  f.sync(); f.sync();
  assert.equal(actions.length, 2); assert.equal(new Set(f.removed).size, 2);
  assert.equal(f.state.towers.some(t => t.type === "i"), false);
});

test("copying through logical swaps preserves shared health ratio and resets copied state", () => {
  const f = fixture(), u = f.place("u", 1), copy = f.place("@", 2), swap = f.place("&", 3), target = f.place("w", 9, 0);
  assert.equal(copy.healthPool, u.healthPool); changeTowerHealth(copy, -400);
  const ratio = copy.healthPool.hp / copy.healthPool.maxHp;
  assert.equal(connectTowerTopology(swap, { lane: 0, column: 9 }, f.state.towers, 123), true); f.sync();
  assert.equal(copy.copiedType, "w"); assert.equal(copy.hp / copy.maxHp, ratio);
  assert.notEqual(copy.skills, target.skills); assert.equal(copy.skills.airPatrol.sp, 8);
  copy.moveVisual = { fromX: copy.x - 20, fromY: copy.y, startedAt: 0, duration: 500 };
  f.state.time = 1000; life.removeTower(f.lifecycle, swap); f.sync();
  assert.equal(copy.copiedType, undefined); assert.equal(copy.moveVisual, undefined);
  assert.equal(copy.flyingUntil, 0); assert.equal(copy.lastFire, 1000);
});

test("ordered topology swaps are local to each roster and restore when a connector disappears", () => {
  const f = fixture(), first = f.place("&", 1), second = f.place("&", 4), ally = f.place("B", 8);
  const other = fixture(), otherAlly = other.place("B", 8);
  assert.equal(connectTowerTopology(first, { lane: 3, column: 8 }, f.state.towers, 1), true);
  assert.equal(connectTowerTopology(second, { lane: 3, column: 1 }, f.state.towers, 2), true);
  assert.equal(towerCell(ally).column, 4); assert.equal(towerCell(otherAlly).column, 8);
  assert.equal(connectTowerTopology(first, { lane: 3, column: 2 }, f.state.towers, 3), false);
  life.removeTower(f.lifecycle, first); f.sync();
  assert.equal(towerCell(ally).column, 8); assert.equal(ally.column, 8);
});

test("mirror shift rebuilding preserves moved supported members and erases the disconnected remainder", () => {
  const f = fixture(), a = f.place("A", 1), m = f.place("m", 2); f.place("m", 4);
  const [left, middle, right] = f.mirrors.mirrorGroupFor(a), units = [left, m, middle];
  const moves = units.map(t => ({ tower: t, fromLane: t.lane, fromColumn: t.column, toLane: 0, toColumn: t.column + 5 }));
  for (const move of moves) Object.assign(move.tower, { lane: move.toLane, column: move.toColumn,
    x: BOARD_X + (move.toColumn + .5) * CELL_WIDTH, y: BOARD_Y + (move.toLane + .5) * CELL_HEIGHT });
  f.board.refresh(); f.mirrors.handleTowersShifted(moves, t => life.removeTower(f.lifecycle, t));
  assert.ok(left.inPlay && middle.inPlay && m.inPlay); assert.equal(right.inPlay, false);
  assert.equal(left.mirrorGroupId, middle.mirrorGroupId);
  assert.equal(f.mirrors.mirrorGroupFor(left).length, 2);
});

test("automatic upgrades and cached board refresh agree across interleaved restored worlds", () => {
  const f = fixture(), a = f.place("A", 1); f.place("m", 2); f.place("U", 2, 2); f.place("u", 2, 4);
  a.autoUpgrade = true; f.state.autoUpgradeEnabled = true; f.state.autoUpgradeReserveChars = 999;
  const r = fixture(decodeSaveGraph(f.snapshot(), () => ({})));
  for (let i = 1; i <= 100; i++) {
    for (const fixture of [f, r]) {
      fixture.state.time = i * 1000; fixture.deployment.attemptAutoUpgrades(); fixture.board.updateIfNeeded(); fixture.mirrors.syncMirrors();
    }
    if (i % 10 === 0) assert.deepEqual(r.snapshot(), f.snapshot());
  }
  assert.ok(a.level > 1); assert.ok(f.state.chars >= 999);
});
