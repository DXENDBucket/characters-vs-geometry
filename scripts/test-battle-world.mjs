import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

// No engine stubs. These are world/port contract tests, not a replacement combat engine.
const load = createTypeScriptLoader();
const { BattleWorld } = load("src/game/battleWorld.ts");
const { BattleSession } = load("src/game/battleSession.ts");
const { BattleRandom, BATTLE_STEP_MS, BATTLE_RULES_VERSION } = load("src/game/battleSimulation.ts");
const { getLevelConfig } = load("src/data/levels.ts");
const { getDifficultyConfig, NATURAL_PRODUCE_INTERVAL, NATURAL_PRODUCE_AMOUNT, COLUMNS } = load("src/config.ts");
const { createEnemyState } = load("src/game/enemyState.ts");
const { createBossState } = load("src/game/bossState.ts");
const { createTowerState } = load("src/game/towerState.ts");
const { cardDefinitions } = load("src/data/cards.ts");
const { endlessEnemyHpMultiplier } = load("src/game/endlessEnvironment.ts");
const { waveWeightLimit } = load("src/game/waves.ts");
const { softcapChars } = load("src/game/charSoftcap.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { decodeSaveGraph } = load("src/game/saveGraph.ts");
const { createTutorialController } = load("src/game/tutorialRegistry.ts");

const options = (id = "1-9", extra = {}) => ({ levelId: id, level: structuredClone(getLevelConfig(id)),
  difficulty: { ...getDifficultyConfig(3) }, unlimitedFirepower: false, ...extra });
const makeWorld = (id, extra) => new BattleWorld(options(id, extra), new BattleRandom(4829));
const definition = id => cardDefinitions.find(card => card.id === id);
const stages = ["updateNullification", "syncCopiedTowers", "updateActions", "updateTowerSkills", "updateTowerPush",
  "updateTopology", "syncMirrors", "updateLevelAurasIfNeeded", "cardCooldownMultiplier", "updateArmingTowers",
  "updateStorage", "updateBoss", "beginProjectileMotion", "updateEnemies", "updateTowerAttacks", "updateCircuit",
  "updateTowerProjectiles", "finishProjectileMotion", "updateEnemyProjectiles", "updateMortarProjectiles",
  "updateTutorial", "usesWaveSchedule", "autoUpgrade"];

function systems(world, changes = {}) {
  const events = [];
  world.tutorial = {
    update: () => events.push(["updateTutorial"]),
    get usesWaveSchedule() { events.push(["usesWaveSchedule"]); return changes.waveSchedule ?? false; }
  };
  const ports = Object.fromEntries(stages.map(name => [name, (...args) => { events.push([name, ...args]); }]));
  Object.assign(ports, {
    eraseSealedCell: (lane, column) => { events.push(["erase", lane, column]); return true; },
    updateLevelAuras: () => events.push(["auras"]), sealsChanged: () => events.push(["seals"]),
    cardCooldownMultiplier: () => { events.push(["cardCooldownMultiplier"]); return 1; },
    hasTimedProducers: false, getDefinition: definition, routeProduction: () => false,
    gainChars: (amount, x, y) => { world.gainChars(amount); events.push(["produce", amount, x, y]); },
    storedEnemyCount: () => 0, earliestStoredWave: () => Infinity,
    completedWaves: wave => events.push(["completed", wave]),
    completeLevel: () => { world.gameOver = true; events.push(["complete"]); },
    spawnEnemy: spawn => {
      world.enemies.push(createEnemyState({ ...spawn,
        environmentHpMultiplier: endlessEnemyHpMultiplier(world.options.level, world.wave) }, () => world.random.next()));
      return spawn.waveWeight;
    },
    sealColumn: column => events.push(["column", column]),
    waveStarted: (wave, flag) => events.push(["wave", wave, flag]),
    ...changes
  });
  return { ports, events };
}

test("world instances own independent progress, rosters, occupancy, seals and configuration", () => {
  const input = options(), a = new BattleWorld(input, new BattleRandom(1)), b = makeWorld();
  input.level.enemyKinds.length = 0; input.difficulty.weightMultiplier = 999;
  assert.notEqual(a.options.difficulty.weightMultiplier, 999); assert.ok(a.options.level.enemyKinds.length);
  a.towers.push({ id: "tower:0" }); a.occupied.set("1:1", a.towers[0]); a.sealedCells.add("1:2");
  a.timedCellSeals.warn(1, 2, 0, 10, 100); a.gainChars(10);
  assert.deepEqual(b.towers, []); assert.equal(b.occupied.size, 0); assert.equal(b.sealedCells.size, 0);
  assert.deepEqual(b.timedCellSeals.snapshot(), []); assert.equal(a.chars, b.chars + 10);
  assert.equal(a.nextTowerOrder(), 0); assert.equal(a.nextTowerOrder(), 1); assert.equal(b.nextTowerOrder(), 0);
  assert.equal(makeWorld("5-10").chars, getLevelConfig("5-10").startingChars);
  assert.equal(makeWorld("1-9", { level: { ...getLevelConfig("1-9"), startingChars: undefined } }).chars, 300);
  assert.equal(makeWorld("IF-1", { resumed: true }).flawlessRun, false);
});

test("the real tutorial model controls world waves and restores without replaying entry effects", () => {
  const world = makeWorld("0-1"), { ports, events } = systems(world);
  world.tutorial = createTutorialController(world.options.level.specialMechanic, {
    getTowers: () => world.towers, getEnemies: () => world.enemies, getBattleTime: () => world.battleTime,
    getToolState: () => { throw Error("Basic lesson does not need tools"); },
    spawnWave: spawns => world.spawnTutorialWave(spawns, ports), finish: ports.completeLevel
  });
  world.step(ports); assert.equal(world.wave, 0);
  world.tutorial.advance();
  const producer = createTowerState(definition("X"), 1, 1, world.battleTime, 0);
  const attacker = createTowerState(definition("A"), 3, 2, world.battleTime, 1);
  world.entityIds.identify("tower", producer); world.entityIds.identify("tower", attacker);
  world.towers.push(producer, attacker); world.step(ports); world.step(ports);
  assert.equal(world.tutorial.snapshot().step, "incomingReady");
  world.tutorial.advance();
  assert.equal(world.wave, 1); assert.equal(world.enemies.length, 1);
  assert.equal(world.enemies[0].kind, "circle"); assert.equal(world.enemies[0].lane, 3);
  assert.equal(world.enemies[0].finalDamageReduction, 0); assert.equal(world.waveTracker.totalWeight, 10);
  assert.equal(world.waveTracker.spawnedAt, world.levelElapsed);
  const saved = world.tutorialSnapshot(), before = events.length;
  world.restoreTutorial(JSON.parse(JSON.stringify(saved)));
  assert.equal(events.length, before); assert.equal(world.wave, 1);
  assert.deepEqual(world.tutorialSnapshot(), saved);
  assert.throws(() => world.validateTutorial(undefined), /checkpoint/);
  assert.throws(() => world.restoreTutorial({ ...saved, state: { version: 1, kind: "tutorialPractice", started: true } }), /differs/);
  assert.deepEqual(world.tutorialSnapshot(), saved);
});

test("world executes the original full tick order and rejects reentrant steps", () => {
  const world = makeWorld(), { ports, events } = systems(world);
  world.step(ports);
  assert.deepEqual(events.map(event => event[0]), stages);
  assert.equal(world.levelElapsed, BATTLE_STEP_MS); assert.equal(world.battleTime, BATTLE_STEP_MS);
  assert.equal(world.cardTime, BATTLE_STEP_MS);
  assert.deepEqual(events.find(e => e[0] === "updateTowerSkills").slice(1), [BATTLE_STEP_MS / 1000, BATTLE_STEP_MS]);
  assert.throws(() => world.step({ ...ports, updateActions: () => world.step(ports) }), /already stepping/);
  assert.doesNotThrow(() => world.step(ports));
});

test("nullification and timed seals settle before queued actions, and expiry refreshes without erasing twice", () => {
  const world = makeWorld(), { ports, events } = systems(world);
  world.timedCellSeals.warn(2, 3, 0, 0, BATTLE_STEP_MS * 2);
  world.step(ports);
  assert.deepEqual(events.slice(0, 6).map(e => e[0]), ["updateNullification", "erase", "auras", "seals", "syncCopiedTowers", "updateActions"]);
  assert.equal(world.timedCellSeals.isSealed(2, 3), true);
  events.length = 0; world.step(ports);
  assert.equal(world.timedCellSeals.isSealed(2, 3), false);
  assert.equal(events.filter(e => e[0] === "erase").length, 0);
  assert.equal(events.filter(e => e[0] === "seals").length, 1);
});

test("resource clocks use this tick's skill multiplier and preserve raw/effective currency semantics", () => {
  const world = makeWorld(), { ports, events } = systems(world);
  let multiplier = 1;
  ports.updateTowerSkills = () => { multiplier = 2; };
  ports.cardCooldownMultiplier = () => multiplier;
  world.levelElapsed = NATURAL_PRODUCE_INTERVAL * 3 - BATTLE_STEP_MS;
  const initial = world.chars; world.step(ports);
  assert.equal(world.cardTime, BATTLE_STEP_MS * 2);
  assert.equal(world.chars, initial + NATURAL_PRODUCE_AMOUNT * 3);
  assert.equal(world.nextNaturalProduceAt, NATURAL_PRODUCE_INTERVAL * 4);
  assert.equal(events.filter(e => e[0] === "produce").length, 3);
  world.chars = 100000;
  const before = world.effectiveChars();
  assert.equal(world.gainChars(100), softcapChars(100100) - before);
  const effective = world.effectiveChars(); world.spendChars(500);
  assert.ok(Math.abs(world.effectiveChars() - (effective - 500)) < 1e-8);
  world.spendChars(1000000); assert.equal(world.chars, 0);
  while (world.baseIntegrity > 1) assert.equal(world.registerBreach(), false);
  assert.equal(world.registerBreach(), true); assert.equal(world.flawlessRun, false);
});

test("timed production advances deadlines, respects levels and routes pipeline production once", () => {
  const world = makeWorld(), card = { ...definition("X"), produceEvery: 1000, produceAmount: 10 };
  const tower = createTowerState(card, 2, 3, 0, 0); tower.nextProduceAt = 1000;
  world.towers.push(tower); world.battleTime = 3000 - BATTLE_STEP_MS;
  let calls = 0;
  const { ports, events } = systems(world, { hasTimedProducers: true, getDefinition: () => card,
    routeProduction: () => ++calls === 2 });
  world.step(ports);
  assert.equal(calls, 3); assert.equal(tower.nextProduceAt, 4000);
  assert.deepEqual(events.filter(e => e[0] === "produce").map(e => e[1]), [10, 10]);
  world.battleTime = 4000 - BATTLE_STEP_MS; tower.level = 2; world.step(ports);
  assert.equal(events.filter(e => e[0] === "produce").at(-1)[1], 18);
});

// Captured from 023b9e0's pre-extraction spawner with the real pure enemy factory,
// seed 4829 and difficulty 3. Includes interleaved initialization RNG, not just kinds.
const waveBaselines = [
  ["1-9", 1, "60424f0ebfc8fc4ad56d4c4c60f3a071cfea2602ae550fe963f7450b3668972c"],
  ["1-9", 10, "85ac9d8f7fdfbbf95cd6a3bb1867e77ef207025e35d3def6636fbf9b3e967fb8"],
  ["5-7", 20, "934545a2ebdd455f047b0fba7915186d013996d492ab9e9ee1be8bae302c194d"],
  ["IF-12", 30, "4453abeede8e9c26c3c9cbee5efe696258d8cbe1c735b0ca60de4b277e67b036"],
  ["IF-BE-4", 11, "faaa5b7a64c5503eac1733903f9677cd8adb07a28827ce9ae0f66e68b53aceaf"],
  ["AE-EX-1", 1, "9058fcd1b1dfce9fe44ef9b19969293fa7405f2f08342c83a6608fe927c3b156"],
  ["0-2", 5, "c682d9e66dfbd3ea50c88822bcecc49869174e8c26eae262656069899e63b48f"],
  ["AE-7", 9, "b72d9bbfac54c64aa8e11f3cdbef6e0d0d92e6f489992c2e45d55631414b496e"]
];
for (const [levelId, wave, expected] of waveBaselines) test(`real wave generation preserves the old ${levelId} wave ${wave} fixture`, () => {
  const world = makeWorld(levelId), { ports, events } = systems(world);
  world.wave = wave - 1; world.spawnWave(wave * 30000, wave * 30000, ports);
  const hash = createHash("sha256").update(JSON.stringify({ tracker: world.waveTracker,
    enemies: world.enemies, randomState: world.random.state })).digest("hex");
  assert.equal(hash, expected);
  assert.deepEqual(events.at(-1), ["wave", wave, wave % world.options.level.wavesPerFlag === 0]);
});

test("wave completion includes stored enemies and endless records include active passengers", () => {
  const final = makeWorld("1-9"), normal = systems(final, { storedEnemyCount: () => 1 });
  final.wave = final.options.level.totalWaves;
  final.updateWaveSchedule(100000, 100000, normal.ports); assert.equal(final.gameOver, false);
  normal.ports.storedEnemyCount = () => 0;
  final.updateWaveSchedule(100000, 100000, normal.ports); assert.equal(final.gameOver, true);
  const world = makeWorld("IF-1"), { ports, events } = systems(world, { earliestStoredWave: () => 7 });
  world.wave = 12; world.waveTracker = { totalWeight: 100, defeatedWeight: 0, spawnedAt: 50000, number: 12 };
  const carrier = { inPlay: true, waveNumber: 10 }, passenger = { inPlay: false, waveNumber: 3, parenthesisCarrier: carrier };
  carrier.parenthesisCargo = [passenger]; world.enemies.push(carrier);
  world.updateWaveSchedule(50000, 50000, ports); assert.deepEqual(events.at(-1), ["completed", 2]);
  carrier.parenthesisCargo.length = 0;
  world.updateWaveSchedule(50000, 50000, ports); assert.deepEqual(events.at(-1), ["completed", 6]);
});

test("column seals retain every-fourth-wave order and run after spawn, before notification", () => {
  const world = makeWorld("5-9"), { ports, events } = systems(world);
  const expected = [];
  for (let wave = 1; wave <= 40; wave++) {
    world.wave = wave; world.applyWaveStartMechanics(column => expected.push(column));
  }
  assert.deepEqual(expected, Array.from({ length: 10 }, (_, i) => COLUMNS - 1 - i));
  world.wave = 3; world.spawnWave(100000, 100000, ports);
  assert.deepEqual(events.slice(-2), [["column", COLUMNS - 1], ["wave", 4, false]]);
});

test("finale phases preserve wave growth, reset phase state and calculate stats without display objects", () => {
  const world = makeWorld("5-10"), boss = createBossState("icosahedron", .3);
  world.boss = boss; world.bossHomePosition = { x: boss.x, y: boss.y };
  const home = { ...world.bossHomePosition }; world.wave = 21; world.levelElapsed = 12345;
  const weight = waveWeightLimit(world.activeLevelConfig(), world.options.difficulty, world.wave + 1);
  for (let phase = 0; phase < 4; phase++) {
    if (phase) assert.equal(world.beginNextBossPhase(), true);
    boss.x = 5; boss.invincibleUntil = 88888; boss.halfHpTriggered = true; boss.octahedronCopies = [createBossState("icosahedron", 0)];
    Object.defineProperty(boss, "body", { get() { assert.fail("Phase rule accessed rendering"); }, configurable: true });
    world.resetBossForPhase(boss); world.applyBossPhaseStats(boss);
    const config = world.currentBossPhaseConfig();
    assert.equal(boss.hp, config.maxHp); assert.equal(boss.baseStats.armor, config.armor);
    assert.equal(boss.baseStats.magicResistance, config.magicResistance);
    assert.deepEqual({ x: boss.x, y: boss.y }, home); assert.equal(boss.invincibleUntil, 0);
    assert.deepEqual(boss.octahedronCopies, []); assert.equal(boss.halfHpTriggered, false);
    assert.equal(world.wave, 21); assert.equal(waveWeightLimit(world.activeLevelConfig(), world.options.difficulty, world.wave + 1), weight);
  }
  assert.equal(world.beginNextBossPhase(), false); assert.equal(world.bossPhaseIndex, 3);
  assert.equal(world.currentPhaseElapsed(world.levelElapsed), 0);
});

test("world progress restores legacy defaults without aliasing world collections", () => {
  const world = makeWorld("5-10"); world.battleTime = 100; world.levelElapsed = 200; world.wave = 12;
  world.bossPhaseIndex = 2; world.bossPhaseStartedAt = 50; world.towerOrder = 24;
  const snapshot = world.progressSnapshot(), restored = makeWorld("5-10"); restored.restoreProgress(snapshot);
  assert.deepEqual(restored.progressSnapshot(), snapshot); assert.notEqual(restored.enemies, world.enemies);
  delete snapshot.bossPhaseIndex; delete snapshot.bossPhaseStartedAt; delete snapshot.bossHomePosition;
  restored.restoreProgress(snapshot);
  assert.equal(restored.bossPhaseIndex, 0); assert.equal(restored.bossPhaseStartedAt, 0); assert.equal(restored.bossHomePosition, null);
  assert.equal(restored.nextTowerOrder(), 24);
});

test("session-driven worlds match across frame schedules, interleaved battles and checkpoint continuation", () => {
  const sessionOptions = { version: BATTLE_RULES_VERSION, levelId: "1-9", difficulty: 3, difficultyVersion: 2,
    unlimitedFirepower: false, selectedCards: ["A"], debug: false, seed: 4829 };
  function fixture() {
    const session = new BattleSession(sessionOptions), world = new BattleWorld(options(), session.random);
    const { ports } = systems(world, { waveSchedule: true });
    const runtime = { step: () => world.step(ports), executeCommand() {}, canAdvance: () => !world.gameOver };
    return { world, session, runtime };
  }
  const a = fixture(), b = fixture();
  for (let i = 0; i < 1800; i++) {
    a.session.advance(BATTLE_STEP_MS, a.runtime);
    if (i % 2) b.session.advance(BATTLE_STEP_MS * 2, b.runtime);
  }
  assert.deepEqual(a.world.progressSnapshot(), b.world.progressSnapshot());
  assert.deepEqual(a.world.enemies, b.world.enemies); assert.equal(a.session.random.state, b.session.random.state);
  const saved = JSON.parse(JSON.stringify(captureBattleSnapshot({ ...a.world.progressSnapshot(), enemies: a.world.enemies })));
  const decoded = decodeSaveGraph(saved, () => ({})), c = fixture();
  c.world.restoreProgress(decoded); c.world.enemies = decoded.enemies;
  c.session.restore(a.session.snapshot(), a.world.battleTime);
  for (const instance of [a, c]) for (let i = 0; i < 900; i++) instance.session.advance(BATTLE_STEP_MS * 2, instance.runtime);
  assert.deepEqual(c.world.progressSnapshot(), a.world.progressSnapshot());
  assert.deepEqual(captureBattleSnapshot({ enemies: c.world.enemies }), captureBattleSnapshot({ enemies: a.world.enemies }));
  assert.equal(c.session.random.state, a.session.random.state);
});
