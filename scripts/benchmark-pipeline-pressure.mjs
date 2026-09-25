import assert from "node:assert/strict";
import { load, captureBattleSnapshot, battleChecksum } from "./helpers/battle-runtime.mjs";
import { PRESSURE_CARDS, populatePipelinePressure, pipelinePressureCensus } from "./helpers/pipeline-pressure.mjs";

const { createIndependentBattle } = load("src/game/independentBattle.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { BattleAuthority } = load("src/game/battleAuthority.ts");
const { BattleSyncHost } = load("src/game/battleSyncHost.ts");
const { BattleSyncClient } = load("src/game/battleSyncClient.ts");
const { LEGACY_BATTLE_POLICY } = load("src/game/battlePolicy.ts");
const config = load("src/config.ts");
const { upgradeTowerLevel, applyTowerUpgradeStats } = load("src/game/towerUpgradeRules.ts");
const { getCardDefinition } = load("src/registry/cardDefinitions.ts");
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const seconds = Number(arg("seconds") ?? 120), mortars = Number(arg("mortars") ?? 0);
assert.ok(Number.isSafeInteger(seconds) && seconds >= 10 && seconds <= 3600);
assert.ok(Number.isSafeInteger(mortars) && mortars >= 0 && mortars <= 140);
const hash = runtime => battleChecksum(runtime.snapshot(PRESSURE_CARDS[0]));
const capture = runtime => runtime.session.captureCheckpointReplay(
  () => captureBattleSnapshot(runtime.snapshot(PRESSURE_CARDS[0])), PRESSURE_CARDS);
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
};
const host = createIndependentBattle({ version: BATTLE_RULES_VERSION, levelId: "IF-1", difficultyVersion: config.DIFFICULTY_VERSION,
  difficulty: 3, seed: 178, debug: false, unlimitedFirepower: false, selectedCards: PRESSURE_CARDS, policy: LEGACY_BATTLE_POLICY });
const { closedEdges } = populatePipelinePressure(host, { config, BATTLE_STEP_MS, upgradeTowerLevel, applyTowerUpgradeStats, getCardDefinition }, mortars);
const packets = [], upstream = [];
let replica, reference, restores = 0, restoredWithMortars = 0;
const initial = capture(host);
reference = createIndependentBattle(initial, { checkpoint: initial.checkpoint });
assert.equal(hash(reference), hash(host), "Initial pressure checkpoint differs");
const authority = new BattleAuthority("pressure", host.session, { inputTime: () => 0,
  available: () => !host.world.gameOver, execute: command => host.executeCommand(command) });
const sync = new BattleSyncHost(host.session, authority, { inputTime: () => 0, checkpoint: () => capture(host), checksum: () => hash(host) });
const client = new BattleSyncClient({ restore: ({ replay }) => {
  restores++; replica = createIndependentBattle(replay, { replica: true, checkpoint: replay.checkpoint });
}, follow: (tick, commands) => replica.session.followFrame(tick, commands, replica.sessionRuntime), checksum: () => hash(replica) }, 2);
client.connect(message => upstream.push(message));
let peer = sync.connect("local", message => packets.push(JSON.stringify(message)));
const applyCosts = [], tickCosts = [], circuitCosts = [];
const drain = () => {
  for (const text of packets.splice(0)) {
    let result, first = true;
    do {
      const start = performance.now(); result = first ? client.receiveText(text) : client.continueFrame();
      applyCosts.push(performance.now() - start); first = false;
    } while (result === "pending");
    assert.equal(result, "applied");
  }
  assert.deepEqual(upstream, [], "Unexpected divergence or retry");
  assert.ok(client.ready);
};
const counters = { captured: 0, intercepted: 0, shielded: 0 };
host.circuit.presentation = { captured() { counters.captured++; }, intercepted() { counters.intercepted++; },
  shielded() { counters.shielded++; }, changed() {} };
const update = host.circuit.update.bind(host.circuit);
host.circuit.update = () => { const start = performance.now(); update(); circuitCosts.push(performance.now() - start); };
const peaks = { stored: 0, fullBanks: 0, mortars: 0, projectiles: 0, actions: 0 };
drain();
try {
  console.log(JSON.stringify({ diagnostic: "Synthetic initial board; real IF-1 rules, no renderer/network timing or immortal units", seconds, mortars }));
  for (let second = 0; second < seconds; second++) {
    // Drain a previously saturated network through actual semantic edge operations.
    if (!mortars && second === Math.floor(seconds * .75)) {
      for (const id of closedEdges) {
        const command = { type: "operation", actorId: "local", operation: { type: "edgeMode", target: { kind: "edge", id }, mode: "=" } };
        host.session.submit(command, value => host.executeCommand(value));
        reference.session.submit(command, value => reference.executeCommand(value));
      }
    }
    for (let tick = 0; tick < 60; tick++) {
      const start = performance.now(); host.session.advance(BATTLE_STEP_MS, host.sessionRuntime); tickCosts.push(performance.now() - start);
      reference.session.advance(BATTLE_STEP_MS, reference.sessionRuntime);
      const census = pipelinePressureCensus(host);
      for (const key of Object.keys(peaks)) peaks[key] = Math.max(peaks[key], census[key]);
      assert.equal(host.world.gameOver, false, "Pressure fixture ended; do not treat inactive time as workload");
    }
    sync.publish(); drain();
    assert.equal(hash(replica), hash(host)); assert.equal(hash(reference), hash(host));
    if ((second + 1) % (mortars ? 5 : 30) === 0 || mortars && !restoredWithMortars && host.world.mortarProjectiles.length > 0) {
      // Recreate the independent reference and join a fresh replica while payloads are live.
      const replay = capture(reference);
      reference = createIndependentBattle(replay, { checkpoint: replay.checkpoint });
      sync.disconnect(peer); client.disconnect(); client.connect(message => upstream.push(message));
      peer = sync.connect("local", message => packets.push(JSON.stringify(message))); drain();
      if (host.world.mortarProjectiles.length) restoredWithMortars++;
      if ((second + 1) % 30 === 0) console.log(JSON.stringify({ elapsedSeconds: second + 1, ...pipelinePressureCensus(host), checksum: hash(host) }));
    }
  }
  assert.ok(counters.captured > 0, "No routed projectile workload");
  if (mortars) {
    assert.ok(peaks.mortars >= 10, "No dense mortar workload");
    assert.ok(counters.intercepted > 0 && counters.shielded > 0, `No actual interception/shield workload: ${JSON.stringify(counters)}`);
    assert.ok(restoredWithMortars > 0, "No restoration with in-flight mortars");
  }
  if (!mortars && seconds >= 120) assert.ok(peaks.fullBanks > 0, "No actual bank saturation");
  console.log(JSON.stringify({ final: pipelinePressureCensus(host), peaks, counters, restores, restoredWithMortars, checksum: hash(host),
    tick: summary(tickCosts), circuit: summary(circuitCosts), syncTask: summary(applyCosts) }));
} finally { client.dispose(); sync.close(); authority.close(); }
