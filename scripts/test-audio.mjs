import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const { soundDefinitions, synthesizeSound } = load("src/audio/sounds.ts");
const { normalizeAudioSettings, validAudioSettings, DEFAULT_AUDIO_SETTINGS } = load("src/audio/settings.ts");
const KEY = "characters-vs-geometry-preferences";
const fixture = () => {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test("synthesized cues have finite audible PCM, headroom, and silent edges", () => {
  for (const id of Object.keys(soundDefinitions)) {
    const samples = synthesizeSound(id);
    assert(samples.length > 1000 && samples.length < 22050, id);
    assert(samples.every(Number.isFinite), id);
    assert.equal(samples[0], 0, id);
    assert.equal(samples.at(-1), 0, id);
    const peak = samples.reduce((max, n) => Math.max(max, Math.abs(n)), 0);
    const rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
    assert(peak < .9 && rms > .01, `${id}: peak ${peak}, rms ${rms}`);
  }
});

test("sound generation is repeatable and does not consume gameplay randomness", () => {
  const random = Math.random;
  try {
    Math.random = () => { throw Error("Audio consumed global randomness"); };
    for (const id of Object.keys(soundDefinitions)) assert.deepEqual(synthesizeSound(id), synthesizeSound(id));
  } finally { Math.random = random; }
});

test("audio settings normalize corrupt local values and strictly validate archives", () => {
  assert.deepEqual(normalizeAudioSettings(null), DEFAULT_AUDIO_SETTINGS);
  assert.deepEqual(normalizeAudioSettings({ master: 9, ui: -1, battle: NaN, muted: "yes" }),
    { master: 1, ui: 0, battle: DEFAULT_AUDIO_SETTINGS.battle, music: DEFAULT_AUDIO_SETTINGS.music, muted: false });
  assert(validAudioSettings({ muted: true, master: .2 }));
  for (const invalid of [null, [], { master: 2 }, { ui: "1" }, { battle: NaN }, { muted: 1 }, { unknown: 1 }]) {
    assert.equal(validAudioSettings(invalid), false);
  }
});

test("audio and debug preferences persist independently, including unavailable storage", () => {
  const storage = fixture();
  const prefs = createTypeScriptLoader({}, { window: { localStorage: storage } })("src/settings/preferences.ts");
  prefs.setDebugModeEnabled(true);
  prefs.setAudioSettings({ master: .37, muted: true });
  prefs.reloadPreferences();
  assert.equal(prefs.isDebugModeEnabled(), true);
  assert.equal(prefs.getAudioSettings().master, .37);
  prefs.setDebugModeEnabled(false);
  prefs.reloadPreferences();
  assert.equal(prefs.getAudioSettings().muted, true);
  storage.setItem = () => { throw Error("Quota"); };
  prefs.setAudioSettings({ muted: false });
  assert.equal(prefs.getAudioSettings().muted, false);
});

test("save archives round-trip audio settings and retain old preferences compatibility", () => {
  const archive = load("src/saveArchive.ts");
  for (const preferences of [{ debugMode: true }, { debugMode: false, audio: { ...DEFAULT_AUDIO_SETTINGS, master: .3 } }]) {
    const source = fixture(), target = fixture();
    source.setItem(KEY, JSON.stringify(preferences));
    archive.importSaveArchive(archive.exportSaveArchive(source), target);
    assert.deepEqual(JSON.parse(target.getItem(KEY)), preferences);
  }
  for (const audio of [{ master: 2 }, { muted: 1 }, { unknown: true }]) {
    assert.throws(() => archive.parseSaveArchive(JSON.stringify({ format: "charset-save", version: 1,
      entries: { [KEY]: JSON.stringify({ audio }) } })));
  }
});
