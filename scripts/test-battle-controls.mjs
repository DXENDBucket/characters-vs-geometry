import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { createBattleControlState, validBattleControl, executeBattleControl } = load("src/game/battleControls.ts");
const { LOCAL_BATTLE_ACTOR } = load("src/game/battleOperations.ts");
const { BattleSession } = load("src/game/battleSession.ts");
const { battleChecksum } = load("src/game/battleChecksum.ts");
const { captureBattleSnapshot } = load("src/game/captureBattleSnapshot.ts");
const { BATTLE_RULES_VERSION, BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const { BOARD_X, BOARD_Y, BOARD_WIDTH, GAME_SPEED_MIN, GAME_SPEED_MAX } = load("src/config.ts");
const { createTutorialInteraction, validTutorialInteraction, sameTutorialInteraction } = load("src/game/tutorialInteraction.ts");
const controls = () => [
  { type: "pause", paused: true }, { type: "speed", speed: 2.5 }, { type: "autoUpgradeEnabled", enabled: false },
  { type: "reserve", value: 1234 }, { type: "reselect", cards: ["A", "?A"] },
  { type: "debugMode", enabled: true }, { type: "debugChars" },
  { type: "debugDamage", mode: "super", point: { x: BOARD_X + 1.5, y: BOARD_Y + 20 } }, { type: "tutorialAdvance" },
  { type: "tutorialInput", input: { tool: "shifter", selected: ["tower:1"] } }
];
function fixture() {
  const state = createBattleControlState(), calls = [], actors = new Map([["local", LOCAL_BATTLE_ACTOR]]);
  const runtime = { state, ended: false, actor: id => actors.get(id), authorize: () => true,
    slotCount: 10, cardAllowed: id => ["A", "B", "?A", "?B"].includes(id),
    reselectAvailable: true, reselectReady: true, reselect: cards => { calls.push(["reselect", [...cards]]); return true; },
    tutorialAvailable: true, tutorialAdvance: () => calls.push(["tutorial"]), pauseChanged: () => calls.push(["pause"]),
    tutorialInput: input => { calls.push(["tutorialInput", structuredClone(input)]); return "handled"; },
    speedChanged: () => calls.push(["speed"]), autoUpgradeChanged: () => calls.push(["auto"]),
    debugChanged: () => calls.push(["debug"]), debugChars: () => calls.push(["chars"]),
    debugDamage: (point, mode) => calls.push(["damage", { ...point }, mode]) };
  return { state, runtime, calls, actors, send: control => executeBattleControl("local", control, runtime) };
}

test("all global controls are explicit bounded JSON, with isolated control state and no renderer dependency", () => {
  const a = fixture(), b = fixture(); a.state.debugEnabled = true;
  for (const control of controls()) {
    const copy = JSON.parse(JSON.stringify(control));
    assert.equal(validBattleControl(copy), true);
    assert.equal(a.send(copy), "handled"); assert.deepEqual(copy, control);
  }
  assert.deepEqual(b.state, createBattleControlState()); assert.deepEqual(b.calls, []);
  assert.equal(a.state.paused, true); assert.equal(a.state.speed, 2.5); assert.equal(a.state.reserveChars, 1234);
  assert.ok(a.calls.some(([kind]) => kind === "reselect"));
});

test("global control schemas reject unbounded, sparse, duplicate and client-computed inputs", () => {
  const invalid = [null, [], {}, { type: "pause", paused: 1 }, { type: "debugChars", amount: 1e9 },
    { ...controls()[7], damage: 9e9 }, { ...controls()[7], mode: "unlimited" },
    { ...controls()[7], point: { x: BOARD_X + BOARD_WIDTH, y: BOARD_Y } },
    { type: "reselect", cards: Array(1) }, { type: "reselect", cards: [] },
    { type: "reselect", cards: Array(11).fill("A") }, { type: "reselect", cards: ["A", "A"] },
    { type: "reselect", cards: ["?A", "?B"] }, { type: "reselect", cards: ["?"] },
    { type: "reselect", cards: ["A".repeat(17)] }, { type: "reserve", value: "5" }];
  for (const speed of [NaN, Infinity, GAME_SPEED_MIN - .1, GAME_SPEED_MAX + .1, 1.23]) invalid.push({ type: "speed", speed });
  for (const value of [NaN, Infinity, -1, .1, Number.MAX_SAFE_INTEGER + 1]) invalid.push({ type: "reserve", value });
  for (const control of invalid) {
    const f = fixture(); assert.equal(validBattleControl(control), false, JSON.stringify(control));
    assert.equal(f.send(control), "invalid"); assert.deepEqual(f.state, createBattleControlState()); assert.deepEqual(f.calls, []);
  }
});

test("time, settings, loadout, debug and tutorial are separate host-authorized capabilities", () => {
  const f = fixture(); f.state.debugEnabled = true;
  f.actors.set("builder", { id: "builder", permissions: ["build", "edit", "move", "skill"] });
  f.actors.set("clock", { id: "clock", permissions: ["time"] });
  for (const control of controls()) {
    assert.equal(executeBattleControl("visitor", control, f.runtime), "forbidden");
    assert.equal(executeBattleControl("builder", control, f.runtime), "forbidden");
  }
  assert.equal(executeBattleControl("clock", controls()[1], f.runtime), "handled");
  assert.equal(executeBattleControl("clock", controls()[3], f.runtime), "forbidden");
  const before = structuredClone(f.state), count = f.calls.length;
  f.runtime.authorize = () => false;
  for (const control of controls()) assert.equal(f.send(control), "forbidden");
  assert.deepEqual(f.state, before); assert.equal(f.calls.length, count);
  assert.equal(executeBattleControl("../local", controls()[0], f.runtime), "invalid");
});

test("reselection preflights every card, capacity, unlock and readiness before spending cooldown", () => {
  const f = fixture(), request = controls()[4];
  f.runtime.slotCount = 1; assert.equal(f.send(request), "forbidden"); f.runtime.slotCount = 10;
  assert.equal(f.send({ ...request, cards: ["A", "U"] }), "forbidden");
  f.runtime.reselectAvailable = false; assert.equal(f.send(request), "forbidden"); f.runtime.reselectAvailable = true;
  f.runtime.reselectReady = false; assert.equal(f.send(request), "cooldown");
  assert.deepEqual(f.calls, []);
  f.runtime.reselectReady = true; assert.equal(f.send(request), "handled");
  assert.deepEqual(f.calls, [["reselect", ["A", "?A"]]]);
});

test("desired control settings are idempotent; debug actions additionally require enabled debug mode", () => {
  const f = fixture();
  assert.equal(f.send({ type: "debugChars" }), "forbidden"); assert.equal(f.send(controls()[7]), "forbidden");
  for (const index of [0, 1, 2, 3, 5]) {
    assert.equal(f.send(controls()[index]), "handled"); const count = f.calls.length;
    assert.equal(f.send(controls()[index]), "handled"); assert.equal(f.calls.length, count);
  }
  assert.equal(f.send({ type: "debugChars" }), "handled");
  f.runtime.tutorialAvailable = false; assert.equal(f.send({ type: "tutorialAdvance" }), "unavailable");
  f.runtime.ended = true; const count = f.calls.length;
  for (const control of controls()) assert.equal(f.send(control), "unavailable");
  assert.equal(f.calls.length, count);
});

test("pause/resume controls replay at the same tick even when the restored host begins paused", () => {
  const options = { version: BATTLE_RULES_VERSION, levelId: "1-1", difficulty: 3, difficultyVersion: 2,
    selectedCards: ["A"], unlimitedFirepower: false, debug: false, seed: 9 };
  const f = fixture(), session = new BattleSession(options);
  const runtime = { step() {}, canAdvance: () => !f.state.paused,
    executeCommand: command => f.send(command.control) };
  session.submit({ type: "control", actorId: "local", control: controls()[0] }, runtime.executeCommand);
  session.advance(1000, runtime); assert.equal(session.clock.tick, 0);
  session.submit({ type: "control", actorId: "local", control: { type: "pause", paused: false } }, runtime.executeCommand);
  session.advance(BATTLE_STEP_MS * 3, runtime);
  const replay = session.exportReplay(), other = fixture(); other.state.paused = true;
  const playback = new BattleSession(options, replay);
  playback.advance(BATTLE_STEP_MS * 3, { step() {}, canAdvance: () => !other.state.paused,
    executeCommand: command => other.send(command.control) });
  assert.equal(playback.clock.tick, 3); assert.equal(other.state.paused, false);
  replay.commands[0].command.control.paused = "false";
  assert.throws(() => new BattleSession(options, replay), /Invalid battle control/);
});

test("local selected card is saved but is not part of the authoritative combat checksum", () => {
  const a = { selectedCardId: "A", gameSpeed: 1, autoUpgradeEnabled: true, autoUpgradeReserveChars: 500 };
  const b = { ...a, selectedCardId: "B" };
  const before = structuredClone(a);
  assert.equal(battleChecksum(a), battleChecksum(b));
  assert.notEqual(battleChecksum(a, { includeLocalUi: true }), battleChecksum(b, { includeLocalUi: true }));
  assert.notDeepEqual(captureBattleSnapshot(a), captureBattleSnapshot(b)); assert.deepEqual(a, before);
  assert.notEqual(battleChecksum(a), battleChecksum({ ...a, autoUpgradeReserveChars: 501 }));
  assert.notEqual(battleChecksum(a), battleChecksum({ ...a, debugModeEnabled: true }));
});

test("tutorial interactions are bounded lesson input with stable tower IDs, gated by tutorial policy", () => {
  const a = createTutorialInteraction(), b = createTutorialInteraction();
  assert.equal(sameTutorialInteraction(a, b), true);
  a.tool = "shifter"; a.selected.push("tower:1");
  assert.deepEqual(b, { tool: "none", selected: [] });
  assert.equal(sameTutorialInteraction(a, b), false);
  assert.equal(sameTutorialInteraction(a, structuredClone(a)), true);
  assert.equal(validTutorialInteraction(a), true);
  for (const input of [null, {}, { tool: "erase", selected: ["tower:1"] }, { tool: "debug", selected: [] },
    { tool: "shifter", selected: ["enemy:1"] }, { tool: "shifter", selected: Array(1) },
    { tool: "shifter", selected: ["tower:1", "tower:1"] }, { tool: "none", selected: [], x: 123 }]) {
    assert.equal(validBattleControl({ type: "tutorialInput", input }), false, JSON.stringify(input));
  }
  const f = fixture(); f.runtime.tutorialAvailable = false;
  assert.equal(f.send({ type: "tutorialInput", input: a }), "unavailable"); assert.deepEqual(f.calls, []);
});
