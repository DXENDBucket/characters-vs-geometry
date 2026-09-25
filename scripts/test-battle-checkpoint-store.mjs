import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const { createBattleCheckpointStore } = createRequire(import.meta.url)("../electron/battle-checkpoint.cjs");
async function fixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "charset-checkpoint-codec-"));
  const filename = path.join(directory, "battle.json");
  try { await run(filename, directory); }
  finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("charset-checkpoint-codec-"));
    await rm(directory, { recursive: true, force: true });
  }
}
const text = "\ufeff" + JSON.stringify({ description: "\u5b57\u91cc\u884c\u519b\ud83c\udf10",
  entities: Array.from({ length: 400 }, (_, id) => ({ id, hp: 1234.5, source: "tower:1" })) });

test("compressed checkpoints preserve exact UTF-8 text and report actual written bytes", () => fixture(async (filename, directory) => {
  const store = createBattleCheckpointStore(filename), size = await store.save(text), file = await readFile(filename);
  assert.deepEqual([...file.subarray(0, 2)], [0x1f, 0x8b]);
  assert.equal(size, file.length); assert.ok(size < Buffer.byteLength(text) / 4);
  assert.equal(gunzipSync(file).toString("utf8"), text); assert.equal(await store.read(), text);
  assert.deepEqual(await readdir(directory), ["battle.json"]);
}));

test("legacy plaintext, compressed files and explicit plaintext writers interoperate", () => fixture(async filename => {
  await writeFile(filename, text, "utf8");
  const store = createBattleCheckpointStore(filename);
  assert.equal(await store.read(), text); await store.save(text);
  const plain = createBattleCheckpointStore(filename, undefined, { compression: false });
  assert.equal(await plain.read(), text);
  assert.equal(await plain.save(text), Buffer.byteLength(text));
  assert.equal(await readFile(filename, "utf8"), text); assert.equal(await store.read(), text);
  assert.equal(await store.save("small"), 5); assert.equal(await readFile(filename, "utf8"), "small");
}));

test("truncated or corrupt compressed data and malformed UTF-8 are rejected", () => fixture(async filename => {
  const store = createBattleCheckpointStore(filename), encoded = gzipSync(text), corrupt = Buffer.from(encoded);
  corrupt[corrupt.length - 8] ^= 1;
  for (const data of [encoded.subarray(0, 2), encoded.subarray(0, -4), corrupt,
    Buffer.from([0xc3, 0x28]), gzipSync(Buffer.from([0xff]))]) {
    await writeFile(filename, data); await assert.rejects(store.read());
  }
}));

test("decompression limits bound expansion including concatenated gzip members", () => fixture(async filename => {
  const store = createBattleCheckpointStore(filename, 128);
  for (const encoded of [gzipSync("x".repeat(50000)), Buffer.concat([gzipSync("a".repeat(80)), gzipSync("b".repeat(80))])]) {
    assert.ok(encoded.length <= 128);
    await writeFile(filename, encoded); await assert.rejects(store.read(), { code: "ERR_BUFFER_TOO_LARGE" });
  }
}));

test("physical and logical size bounds reject oversized data without replacing the last save", () => fixture(async (filename, directory) => {
  const store = createBattleCheckpointStore(filename, 100);
  assert.equal(await store.read(), undefined); await store.save("before");
  for (const input of ["x".repeat(101), "\u5b57".repeat(34), null, Buffer.from("invalid")]) await assert.rejects(store.save(input));
  assert.equal(await store.read(), "before"); assert.deepEqual(await readdir(directory), ["battle.json"]);
  await writeFile(filename, "x".repeat(101)); await assert.rejects(store.read(), /too large/);
}));

test("checkpoint storage options reject invalid bounds and compression modes", () => {
  for (const limit of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => createBattleCheckpointStore("unused.json", limit));
  assert.throws(() => createBattleCheckpointStore("unused.json", 100, { compression: "gzip" }));
});
