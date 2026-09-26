import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { attachCoopSockets } from "./coop-sockets.mjs";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";
const load = createTypeScriptLoader({}, { WebSocket, crypto: globalThis.crypto });
const { CoopRoom } = load("src/multiplayer/coopRoom.ts");
const { CoopClient } = load("src/multiplayer/coopClient.ts");
const { BATTLE_STEP_MS } = load("src/game/battleSimulation.ts");
const profile = { name: "Test", completed: ["1-1"], policy: { version: 1, slotCount: 6,
  allowedCards: ["A"], reselectEnabled: false, pauseOnLocalModal: false } };

async function fixture(t) {
  const room = new CoopRoom("SOCKET", profile);
  room.join(profile);
  for (const actor of ["host", "guest"]) { room.select(actor, ["A"]); room.ready(actor, true); }
  room.start("host", 123, false);
  let requests = 0;
  const server = createServer((_req, res) => { requests++; res.writeHead(404).end(); });
  const session = { room, actorId: "host", touched: Date.now() };
  const close = attachCoopSockets(server, new Map([["test-token", session]]));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { room.close(); close(); await new Promise(resolve => server.close(resolve)); });
  return { room, session, url, get requests() { return requests; } };
}

async function connect(f, id, token = "test-token") {
  const socket = new WebSocket(f.url.replace("http:", "ws:") + "/api/coop/socket");
  await once(socket, "open");
  const first = once(socket, token === "test-token" ? "message" : "close");
  socket.send(JSON.stringify({ token, connection: id }));
  return { socket, first: await first };
}

test("battle WebSocket authenticates and pushes frames without HTTP polling", { timeout: 10000 }, async t => {
  const f = await fixture(t), client = new CoopClient(f.url); client.token = "test-token";
  const messages = []; let wake;
  const next = () => new Promise(resolve => { wake = resolve; });
  const initial = next();
  const transport = client.transport()({ open() {}, message(text) { messages.push(JSON.parse(text)); wake?.(); }, closed() {} });
  t.after(() => transport.close());
  await initial;
  assert.equal(messages[0].type, "snapshot");
  const frame = next();
  f.room.runtime.session.advance(BATTLE_STEP_MS * 2, f.room.runtime.sessionRuntime); f.room.sync.publish();
  await frame;
  assert.equal(messages[1].type, "frame"); assert.equal(messages[1].to.tick, 2);
  assert.equal(f.requests, 0);
  const link = f.room.links.get("host"); assert.equal(link.queue.length, 0);
  const disconnected = new Promise(resolve => {
    const disconnect = f.room.disconnect.bind(f.room);
    f.room.disconnect = (...args) => { disconnect(...args); resolve(); };
  });
  transport.close();
  await disconnected;
  assert.equal(f.room.links.has("host"), false);
});

test("socket replacement fences old close callbacks and room closure closes the current socket", { timeout: 10000 }, async t => {
  const f = await fixture(t), old = await connect(f, "old");
  const oldClosed = once(old.socket, "close");
  const current = await connect(f, "new");
  await oldClosed;
  assert.equal(f.room.links.get("host").id, "new");
  const frame = once(current.socket, "message");
  f.room.runtime.session.advance(BATTLE_STEP_MS * 2, f.room.runtime.sessionRuntime); f.room.sync.publish();
  assert.equal(JSON.parse((await frame)[0].toString()).type, "frame");
  const closed = once(current.socket, "close"); f.room.close(); await closed;
});

test("invalid socket credentials are rejected without occupying a player link", { timeout: 10000 }, async t => {
  const f = await fixture(t), denied = await connect(f, "bad", "invalid-token");
  assert.equal(denied.first[0], 4001); assert.equal(f.room.links.size, 0);
});
