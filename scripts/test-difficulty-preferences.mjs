import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const KEY = "characters-vs-geometry-preferences";
function fixture(initial = {}) {
  const values = new Map(Object.entries(initial)); let writes = 0;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes++; values.set(key, value); }, removeItem: key => values.delete(key) };
  const load = createTypeScriptLoader({}, { window: { localStorage: storage } });
  return { storage, load, preferences: load("src/settings/preferences.ts"), get writes() { return writes; } };
}
test("difficulty persists after preferences reload without erasing debug or audio settings", () => {
  const f = fixture(), p = f.preferences;
  assert.equal(p.getSelectedDifficulty(), 3);
  p.setDebugModeEnabled(true); p.setAudioSettings({ master: .25 }); p.setSelectedDifficulty(7);
  p.reloadPreferences(); assert.equal(p.getSelectedDifficulty(), 7);
  assert.equal(p.isDebugModeEnabled(), true); assert.equal(p.getAudioSettings().master, .25);
  const writes = f.writes; p.setSelectedDifficulty(7); assert.equal(f.writes, writes);
  p.setAudioSettings({ master: .5 }); p.reloadPreferences(); assert.equal(p.getSelectedDifficulty(), 7);
});
test("invalid or unavailable storage falls back safely and memory-only selections survive scene changes", () => {
  for (const difficulty of [null, "7", {}, undefined]) {
    assert.equal(fixture({ [KEY]: JSON.stringify({ difficulty }) }).preferences.getSelectedDifficulty(), 3);
  }
  const load = createTypeScriptLoader({}, { window: { localStorage: { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } } } });
  const p = load("src/settings/preferences.ts"); p.setSelectedDifficulty(8); assert.equal(p.getSelectedDifficulty(), 8);
  p.setSelectedDifficulty(NaN); assert.equal(p.getSelectedDifficulty(), 3);
});
test("difficulty preferences round-trip archives; old preferences remain supported", () => {
  for (const value of [{ debugMode: true }, { difficulty: 0 }, { difficulty: 7 }, { difficulty: 9 }]) {
    const f = fixture({ [KEY]: JSON.stringify(value) }), target = fixture();
    const archive = f.load("src/saveArchive.ts");
    archive.importSaveArchive(archive.exportSaveArchive(f.storage), target.storage);
    assert.deepEqual(JSON.parse(target.storage.getItem(KEY)), value);
  }
  const { parseSaveArchive } = fixture().load("src/saveArchive.ts");
  for (const difficulty of [-1, 10, 2.5, "3", null]) assert.throws(() => parseSaveArchive(JSON.stringify({
    format: "charset-save", version: 1, exportedAt: new Date().toISOString(), entries: { [KEY]: JSON.stringify({ difficulty }) }
  })));
});
