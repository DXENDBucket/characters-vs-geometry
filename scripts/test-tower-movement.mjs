import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { TowerShifterSimulation } = load("src/game/towerShifterRules.ts");
const { TowerPushSimulation } = load("src/game/towerPushRules.ts");
const { TowerDeploymentSimulation } = load("src/game/towerDeploymentRules.ts");
const { TowerMirrorSimulation } = load("src/game/towerMirrorRules.ts");
const { TowerBoardSimulation } = load("src/game/towerBoard.ts");
const { TowerSkillSimulation } = load("src/game/towerSkillSimulation.ts");
const { TargetedEffectSimulation } = load("src/game/targetedEffectRules.ts");
const { getTowerSkillState } = load("src/game/skillState.ts");
const { TowerExtractionPool } = load("src/game/towerExtraction.ts");
const { ProjectileCircuitSimulation } = load("src/game/projectileCircuitRules.ts");
const { routePipelineTowerAction, emitPipelineShot } = load("src/game/pipelineActionRules.ts");
const { EdgeTowerControls } = load("src/game/edgeTowerControls.ts");
const { executeBattleOperationRules } = load("src/game/battleOperationRuntime.ts");
const { towerOperationRef: ref } = load("src/game/battleOperations.ts");
const { LOCAL_BATTLE_ACTOR } = load("src/game/battleParticipants.ts");
const { BattleEntityIds } = load("src/game/battleEntityIds.ts");
const { collectBattleEntities } = load("src/game/battleEntityGraph.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { connectTowerTopology, syncTowerTopology, towerCell, physicalTowerCell } = load("src/game/towerTopology.ts");
const { NO_TOWER_SKILL_PRESENTATION } = load("src/game/towerSkillPresentation.ts");
const { NO_TOWER_COMBAT_PRESENTATION } = load("src/game/towerCombatPresentation.ts");
const { NO_UNIT_LIFECYCLE_PRESENTATION } = load("src/game/unitLifecyclePresentation.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const { cardBehaviorsById } = load("src/game/cardBehaviorRules.ts");
const life = load("src/game/unitLifecycle.ts");
const { BOARD_X, CELL_WIDTH } = load("src/config.ts");

// Real deployment, command, movement, mirror, skill and circuit rules; no display objects.
function fixture(saved) {
  const state = saved ?? { towers: [], edges: [], cardStates: cardDefinitions.map(definition => ({ definition, readyAt: 0 })),
    time: 0, order: 0, chars: 100000, sealed: [], route: false };
  const occupied = new Map(), removed = [], ids = new BattleEntityIds(), extraction = new TowerExtractionPool();
  if (saved) ids.restore(collectBattleEntities(saved), saved.entityIds);
  const common = {
    get towers() { return state.towers; }, get occupied() { return occupied; },
    get battleTime() { return state.time; }, get cardTime() { return state.time; },
    get cardStates() { return state.cardStates; }, get edges() { return state.edges; },
    isCellDeployable: (lane, column) => Number.isInteger(lane) && Number.isInteger(column) && lane >= 0 && lane < 7 &&
      column >= 0 && column < 13 && !state.sealed.includes(`${lane}:${column}`),
    getDefinition: getCardDefinition, nextTowerOrder: () => state.order++,
    createTower: (...args) => ids.identify("tower", createTowerState(...args)),
    cardTimeFor: () => state.time, getChars: () => state.chars, spendChars: n => { state.chars -= n; },
    unlimitedFirepower: false, autoUpgradeEnabled: false, autoUpgradeReserveChars: 0, extraction,
    resetTowerSkill: t => skills.resetTowerSkill(t), mirrorGroupFor: t => mirrors.mirrorGroupFor(t),
    updateLevelAuras: () => board.refresh(),
    createTargetedEffectMirror: (a, b) => targeted.createMirroredEffect(a, b),
    runMirrorGroupEvent: (t, action) => mirrors.runMirrorGroupEvent(t, action),
    removeTower: t => life.removeTower(lifecycle, t),
    eraseTower: t => life.removeTower(lifecycle, t),
    onMoved: moves => {
      syncTowerTopology(state.towers);
      mirrors.handleTowersShifted(moves, t => life.removeTower(lifecycle, t)); board.refresh();
    },
    onTowerAction: (t, event) => state.route && routePipelineTowerAction(t, event, circuit, combat, getCardDefinition)
  };
  const lifecycle = { ...common, enemies: [], projectiles: [], enemyProjectiles: [], mortarProjectiles: [],
    finalDamageReduction: 0, presentation: NO_UNIT_LIFECYCLE_PRESENTATION, getBoss: () => null,
    getWaveTracker() {}, onEnemyDefeated() {}, onTowerDamaged() {}, endLevel() {},
    onTowerRemoved: t => {
      removed.push({ id: t.id, positions: state.towers.map(t => [t.id, t.column]) });
      syncTowerTopology(state.towers); mirrors.handleTowerRemoved(t, member => life.removeTower(lifecycle, member));
    }
  };
  const deployment = new TowerDeploymentSimulation(() => common), mirrors = new TowerMirrorSimulation(() => common);
  const targeted = new TargetedEffectSimulation(() => common);
  const board = new TowerBoardSimulation(() => ({ ...common,
    syncMirrorLevelBonuses: () => mirrors.syncMirrorLevelBonuses(),
    settleHealth: () => life.settleTowerHealth(lifecycle), syncCircuits: () => circuit.sync() }));
  const shifter = new TowerShifterSimulation(() => common), push = new TowerPushSimulation(() => common);
  const skills = new TowerSkillSimulation(() => ({ ...common, enemies: [], boss: null, gameOver: false, battlePaused: false,
    presentation: NO_TOWER_SKILL_PRESENTATION,
    imitateTowerPush: (tower, dy, dx) => {
      const origin = towerCell(tower), target = physicalTowerCell(tower, { lane: origin.lane + dy, column: origin.column + dx });
      push.push(tower, target.lane, target.column, true);
    }
  }));
  const combat = { ...common, enemies: [], boss: null, projectiles: [], mortarProjectiles: [],
    presentation: NO_TOWER_COMBAT_PRESENTATION,
    spawnTower: (...args) => deployment.spawnGeneratedTower(...args),
    damageTower: (t, damage, type) => life.damageTower(lifecycle, t, damage, type) };
  const circuit = new ProjectileCircuitSimulation(() => ({ ...common,
    emit: (shot, outlet) => emitPipelineShot(shot, outlet, { combat, getDefinition: getCardDefinition, skill: (t, e) => skills.imitateSkill(t, e) }) }));
  const edges = new EdgeTowerControls(() => ({ edges: state.edges, time: state.time, cardTime: state.time, chars: state.chars,
    autoEnabled: false, reserve: 0, spend: common.spendChars, identify: edge => ids.identify("edge", edge), changed: () => circuit.sync() }));
  const operations = { ...common, cards: state.cardStates, autoUpgradeEnabled: false, ended: false,
    actor: id => id === "local" ? LOCAL_BATTLE_ACTOR : id === "observer" ? { id, permissions: [] } : undefined,
    authorize: () => true, deployment, targetedEffects: targeted, edgeControls: edges, shifter, skills, push,
    topology: { connect: (tower, lane, column) => {
      if (!connectTowerTopology(tower, { lane, column }, state.towers, state.time)) return false;
      board.refresh(); mirrors.syncMirrors(); return true;
    } },
    erasedAt() {}, updateCards() {}, refreshPlacement: () => { mirrors.syncMirrors(); board.refresh(); },
    refreshEdges: () => circuit.sync(), attemptAutoUpgrades: () => deployment.attemptAutoUpgrades()
  };
  const send = (op, expected = "handled", actor = "local") => {
    const result = executeBattleOperationRules(operations, actor, op); assert.equal(result, expected); return result;
  };
  const place = (id, lane, column) => {
    state.cardStates.find(c => c.definition.id === id).readyAt = 0;
    send({ type: "deploy", card: id, cell: { lane, column }, expected: null }, "deployed");
    return state.towers.find(t => t.type === id && t.lane === lane && t.column === column && !t.transient);
  };
  const move = (towers, lane, column) => ({ type: "move", sources: towers.map(t => ({ target: ref(t), lane: t.lane, column: t.column })), destination: { lane, column } });
  const snapshot = () => captureBattleSnapshot({ ...state, shifter: shifter.snapshot(),
    nextGroupId: mirrors.snapshotNextGroupId(), entityIds: ids.snapshot() });
  const tick = ms => { state.time += ms; skills.update(ms / 1000, state.time); circuit.update(); board.updateIfNeeded(); };
  if (saved?.shifter) shifter.restore(saved.shifter);
  mirrors.restoreGroups(saved?.nextGroupId ?? 1); board.refresh();
  return { state, common, occupied, deployment, board, mirrors, shifter, push, skills, operations, circuit, combat, place, send, move, snapshot, tick, removed };
}

test("semantic shifter commits both layers, rejects stale requests and restores cooldown without rendering", () => {
  const f = fixture(), inner = f.place("B", 2, 2), shell = f.place("()", 2, 2);
  const op = f.move([shell, inner], 4, 6);
  f.send(op, "moved"); assert.equal(inner.parenthesisGuard, shell); assert.equal(inner.x, BOARD_X + 6.5 * CELL_WIDTH);
  assert.equal(f.shifter.snapshot().cooldownDuration, 18000); assert.equal(f.shifter.cooldownRatio(), 0);
  f.send(op, "stale"); f.send(f.move([inner], 4, 8), "cooldown");
  const r = fixture(decodeSaveGraph(f.snapshot(), () => ({})));
  f.tick(9000); r.tick(9000); assert.equal(r.shifter.cooldownRatio(), .5); assert.deepEqual(r.snapshot(), f.snapshot());
  f.tick(9000); r.tick(9000);
  f.send(f.move([inner], 4, 8), "moved"); r.send(r.move([r.state.towers.find(t => t.type === "B")], 4, 8), "moved");
  assert.equal(inner.parenthesisGuard, undefined); assert.equal(f.occupied.get("4:6"), shell);
  assert.deepEqual(r.snapshot(), f.snapshot());
});

test("shifter preflights entire groups and permissions without mutating any position or cooldown", () => {
  const f = fixture(), a = f.place("A", 1, 1), b = f.place("B", 1, 2), wall = f.place("B", 4, 5);
  for (const [op, result] of [[f.move([a, b], 4, 4), "invalid"], [f.move([a, b], 4, 12), "invalid"],
    [f.move([a], 0, 0), "forbidden"]]) {
    const before = f.snapshot(); f.send(op, result, result === "forbidden" ? "observer" : "local"); assert.deepEqual(f.snapshot(), before);
  }
  f.state.sealed.push("0:1"); const before = f.snapshot(); f.send(f.move([a, b], 0, 0), "invalid");
  assert.deepEqual(f.snapshot(), before); assert.equal(wall.column, 5);
});

test("actual shifter preserves moved mirror component and removes disconnected members", () => {
  const f = fixture(), a = f.place("A", 3, 1), m = f.place("m", 3, 2); f.place("m", 3, 4);
  const group = f.mirrors.mirrorGroupFor(a), middle = group.find(t => t.column === 3), right = group.find(t => t.column === 5);
  f.send(f.move([middle, m, a], 0, 6), "moved");
  assert.ok(a.inPlay && middle.inPlay && m.inPlay); assert.equal(right.inPlay, false);
  assert.equal(a.mirrorGroupId, middle.mirrorGroupId); assert.equal(f.mirrors.mirrorGroupFor(a).length, 2);
});

test("shifting both layers of a mirror component retains its shells as an independent network", () => {
  const f = fixture(), a = f.place("B", 3, 1), shell = f.place("[]", 3, 1), m = f.place("m", 3, 2); f.place("m", 3, 4);
  const middle = f.mirrors.mirrorGroupFor(a).find(t => t.column === 3);
  const middleShell = f.mirrors.mirrorGroupFor(shell).find(t => t.column === 3);
  const rightShell = f.mirrors.mirrorGroupFor(shell).find(t => t.column === 5);
  f.send(f.move([a, shell, m, middle, middleShell], 0, 6), "moved");
  assert.ok(shell.inPlay && middleShell.inPlay);
  assert.equal(a.parenthesisGuard, shell); assert.equal(middle.parenthesisGuard, middleShell);
  assert.equal(shell.mirrorGroupId, middleShell.mirrorGroupId); assert.notEqual(shell.mirrorGroupId, a.mirrorGroupId);
  assert.equal(rightShell.inPlay, false);
});

test("push authorization includes shells; NUL is pushable but moving members cancel before skill consumption", () => {
  const f = fixture(), pusher = f.place("#", 3, 0), inner = f.place("B", 3, 1), shell = f.place("[]", 3, 1);
  getTowerSkillState(pusher, "push").sp = 30; const op = { type: "push", target: ref(pusher), cell: { lane: 3, column: 1 } };
  f.operations.authorize = (_actor, _op, affected) => !affected.towers.includes(shell);
  let before = f.snapshot(); f.send(op, "forbidden"); assert.deepEqual(f.snapshot(), before);
  f.operations.authorize = () => true; inner.nullified = true;
  before = f.snapshot(); assert.ok(f.push.plan(pusher, 3, 1)); assert.deepEqual(f.snapshot(), before); inner.nullified = false;
  inner.moveVisual = { fromX: inner.x, fromY: inner.y, startedAt: 0, duration: 500 };
  before = f.snapshot(); f.send(op, "unavailable"); assert.deepEqual(f.snapshot(), before); inner.moveVisual = undefined;
  f.send(op); assert.equal(inner.column, 2); assert.equal(shell.column, 2); assert.equal(pusher.column, 0);
  assert.equal(pusher.skills.push.sp, 0); assert.equal(inner.parenthesisGuard, shell);
  const r = fixture(decodeSaveGraph(f.snapshot(), () => ({}))); f.tick(500); r.tick(500);
  assert.equal(inner.moveVisual, undefined); assert.deepEqual(r.snapshot(), f.snapshot());
});

test("pushing into a sealed cell commits all positions before removal callbacks and erases both layers", () => {
  const f = fixture(), source = f.place("#", 3, 0), a = f.place("A", 3, 1), b = f.place("B", 3, 2), shell = f.place("()", 3, 2);
  f.state.sealed.push("3:3"); getTowerSkillState(source, "push").sp = 30;
  f.send({ type: "push", target: ref(source), cell: { lane: 3, column: 1 } });
  assert.equal(a.column, 2); assert.equal(b.inPlay, false); assert.equal(shell.inPlay, false);
  assert.ok(f.removed.every(e => e.positions.find(([id]) => id === a.id)?.[1] === 2));
  assert.equal(f.occupied.get("3:2"), a); assert.equal(f.occupied.has("3:3"), false);
});

test("pushing past the right board edge removes the tower through the actual lifecycle", () => {
  const f = fixture(), source = f.place("#", 3, 11), target = f.place("B", 3, 12);
  getTowerSkillState(source, "push").sp = 30; f.send({ type: "push", target: ref(source), cell: { lane: 3, column: 12 } });
  assert.equal(target.column, 13); assert.equal(target.inPlay, false); assert.equal(f.removed.length, 1);
});

test("topology changes push adjacency but commits the actual physical destination", () => {
  const f = fixture(), source = f.place("#", 3, 0), swap = f.place("&", 3, 1), remote = f.place("B", 0, 8);
  f.send({ type: "topology", target: ref(swap), cell: { lane: 0, column: 8 } });
  getTowerSkillState(source, "push").sp = 30;
  f.send({ type: "push", target: ref(source), cell: { lane: 0, column: 8 } });
  assert.equal(remote.column, 2); assert.equal(remote.lane, 3); assert.equal(swap.column, 1);
});

test("routed push spends source charge once and executes only at the outlet after restore", () => {
  const f = fixture(), source = f.place("#", 3, 1), bank = f.place("0", 3, 2), outlet = f.place("1", 3, 4), victim = f.place("B", 3, 5);
  for (let column = 1; column < 4; column++) {
    f.state.cardStates.find(c => c.definition.id === "=").readyAt = 0;
    f.send({ type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 3, column }, expected: null });
    f.state.edges.at(-1).mode = ">";
  }
  f.circuit.sync(); f.state.route = true; getTowerSkillState(source, "push").sp = 30;
  f.send({ type: "push", target: ref(source), cell: { lane: 3, column: 2 } });
  assert.equal(source.skills.push.sp, 0); assert.equal(bank.column, 2); assert.equal(bank.projectileBank.shots.length, 1);
  const r = fixture(decodeSaveGraph(f.snapshot(), () => ({})));
  for (let i = 0; i < 20; i++) { f.tick(40); r.tick(40); }
  assert.equal(victim.column, 6); assert.equal(outlet.column, 4); assert.equal(source.skills.push.sp, 0);
  assert.ok(Math.abs(source.skills.push.spBuffer - .8) < 1e-12);
  assert.deepEqual(r.snapshot(), f.snapshot());
});

test("generated towers use real deployment eligibility, effective levels and source facing", () => {
  const f = fixture(), source = f.place("s", 2, 5), shell = f.place("()", 2, 4);
  source.level = 3; source.facingDirection = -1; f.board.refresh(); const chars = f.state.chars;
  cardBehaviorsById.s.execute(source, getCardDefinition("s"), f.combat, 1);
  const child = f.occupied.get("2:4"); assert.equal(child.type, "a"); assert.equal(child.level, 3);
  assert.equal(child.facingDirection, -1); assert.equal(child.parenthesisGuard, shell);
  assert.equal(f.state.chars, chars); assert.ok(child.entityId); assert.equal("body" in child, false);
  assert.equal(f.deployment.spawnGeneratedTower("a", 2, 4, 3), null);
  f.state.sealed.push("2:3"); assert.equal(f.deployment.spawnGeneratedTower("a", 2, 3, 3), null);
  assert.equal(f.deployment.spawnGeneratedTower("=", 0, 0, 1), null);
});

test("edge and automatic upgrade commands share the same renderer-free application path", () => {
  const f = fixture(), tower = f.place("B", 1, 1);
  f.send({ type: "autoUpgrade", targets: [ref(tower)], enabled: true }); assert.equal(tower.autoUpgrade, true);
  f.send({ type: "edgeCard", card: "=", position: { axis: "horizontal", lane: 1, column: 1 }, expected: null });
  const edge = f.state.edges[0], target = { kind: "edge", id: edge.entityId };
  f.send({ type: "edgeMode", target, mode: "<" }); assert.equal(edge.mode, "<");
  f.send({ type: "autoUpgrade", targets: [target], enabled: true }); assert.equal(edge.autoUpgrade, true);
  f.send({ type: "erase", target }); assert.equal(f.state.edges.length, 0);
});
