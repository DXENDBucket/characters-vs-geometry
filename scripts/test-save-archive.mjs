import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const archive = load("src/saveArchive.ts");
const LANGUAGE = "characters-vs-geometry-language";
const PROGRESS = "characters-vs-geometry-progress-v1";
const LOADOUT = "characters-vs-geometry:last-card-loadout";
const JOURNAL = "charset-save-import-recovery-v1";
const envelope = entries => JSON.stringify({ format: "charset-save", version: 1, exportedAt: "2026-09-20T00:00:00.000Z", entries });
function fixture(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { values, get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test("save archive round-trips progress, controls, language and empty loadouts without unrelated data", () => {
  const storage = fixture({ [LANGUAGE]: "zh-CN", [LOADOUT]: "[]", foreign: "keep",
    [PROGRESS]: JSON.stringify({ version: 1, completedLevelIds: ["1-1"], allCardsUnlocked: false, seenEnemyKinds: ["circle"] }),
    "characters-vs-geometry-keybindings": JSON.stringify({ "card:#": "KeyH", "card:@": "KeyM", "card:()": "KeyP", "tool:shifter": "Digit3" }) });
  const exported = archive.exportSaveArchive(storage);
  assert.equal(archive.parseSaveArchive(exported).entries.foreign, undefined);
  const restored = fixture({ foreign: "untouched", [LANGUAGE]: "en" });
  archive.importSaveArchive(exported, restored);
  assert.equal(restored.getItem(LANGUAGE), "zh-CN");
  assert.equal(restored.getItem(LOADOUT), "[]");
  assert.equal(restored.getItem("foreign"), "untouched");
  assert.equal(restored.getItem(JOURNAL), null);
});

test("invalid files are rejected before any storage mutation", () => {
  const storage = fixture({ [LANGUAGE]: "en" });
  for (const text of ["broken", "{}", envelope({ unrelated: "x" }), envelope({ [LANGUAGE]: "xx" }),
    envelope({ [PROGRESS]: '{"version":999,"completedLevelIds":[],"allCardsUnlocked":false}' }),
    envelope({ [LOADOUT]: '["unknown"]' }), envelope({ "charset-survival-v1:IF-1": '{"version":1}' })]) {
    assert.throws(() => archive.importSaveArchive(text, storage));
    assert.deepEqual([...storage.values], [[LANGUAGE, "en"]]);
  }
});

test("endless battle archives survive export/import and reject mismatched level keys", () => {
  const { encodeSaveGraph } = load("src/game/saveGraph.ts");
  const save = { version: 1, levelId: "IF-1", savedAt: 123, wave: 5, difficulty: 3,
    unlimitedFirepower: false, selectedCards: ["A"], graph: encodeSaveGraph({
      battleTime: 1500, levelElapsed: 1500, cardTime: 1500, nextNaturalProduceAt: 5000, chars: 100,
      baseIntegrity: 6, wave: 5, waveTracker: null, enemiesDefeated: 0, towerOrder: 0, gameSpeed: 1,
      autoUpgradeEnabled: true, autoUpgradeReserveChars: 0, extraction: 0, towers: [], enemies: [],
      projectiles: [], enemyProjectiles: [], mortarProjectiles: [], cardDeadlines: [], actions: [],
      storage: [], spellMortarFlights: [], sealedCells: [], shifter: { readyAt: 0, cooldownStartedAt: 0, cooldownDuration: 15000 },
      reselection: { readyAt: 240000, cards: [] }
    }, value => ({ kind: Array.isArray(value) ? "array" : "object" })) };
  const raw = JSON.stringify(save);
  const storage = fixture({ "charset-survival-v1:IF-1": raw });
  const target = fixture();
  archive.importSaveArchive(archive.exportSaveArchive(storage), target);
  assert.equal(target.getItem("charset-survival-v1:IF-1"), raw);
  assert.throws(() => archive.parseSaveArchive(envelope({ "charset-survival-v1:IF-2": raw })));
});

test("quota failure rolls back partial import; journal allocation failure never erases originals", () => {
  for (const failAt of [1, 3]) {
    const storage = fixture({ [LANGUAGE]: "en", [LOADOUT]: '["A"]' });
    const write = storage.setItem;
    let writes = 0;
    storage.setItem = (key, value) => { if (++writes === failAt) throw new Error("Quota"); write(key, value); };
    assert.throws(() => archive.importSaveArchive(envelope({ [LANGUAGE]: "zh-CN", [LOADOUT]: '["B"]' }), storage));
    assert.deepEqual(Object.fromEntries(storage.values), { [LANGUAGE]: "en", [LOADOUT]: '["A"]' });
  }
});

test("startup restores an interrupted import and leaves unrelated browser storage alone", () => {
  const storage = fixture({ [LANGUAGE]: "zh-CN", foreign: "keep", [JOURNAL]: JSON.stringify({ [LANGUAGE]: "en", [LOADOUT]: '["X"]' }) });
  archive.recoverSaveImport(storage);
  assert.deepEqual(Object.fromEntries(storage.values), { foreign: "keep", [LANGUAGE]: "en", [LOADOUT]: '["X"]' });
  archive.recoverSaveImport(storage);
  assert.equal(storage.getItem(JOURNAL), null);
});
