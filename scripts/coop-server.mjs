import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { networkInterfaces } from "node:os";
import { build } from "vite";
import { attachCoopSockets } from "./coop-sockets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.argv.find(arg => arg.startsWith("--port="))?.slice(7) ?? 5180);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw Error("Invalid port");
await build({ root, configFile: false, build: { ssr: "src/multiplayer/coopRoom.ts", outDir: ".coop-server",
  rollupOptions: { output: { entryFileNames: "coopRoom.mjs" } } } });
const { CoopRoom } = await import(pathToFileURL(path.join(root, ".coop-server/coopRoom.mjs")).href);
const rooms = new Map(), sessions = new Map();
const json = (res, status, value) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
const body = async req => {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 128 * 1024) throw Error("Request too large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};
function admit(room, actorId) {
  const token = randomUUID(); sessions.set(token, { room, actorId, touched: Date.now() });
  return { token, actorId, state: room.state() };
}
function remove(room) {
  room.close(); rooms.delete(room.code);
  for (const [key, session] of sessions) if (session.room === room) sessions.delete(key);
}
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && (/^https?:\/\//.test(origin) || origin === "charset://app")) {
    res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/coop/")) {
      if (req.method !== "GET") { res.writeHead(405).end(); return; }
      const relative = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
      const base = path.join(root, "dist"), file = path.resolve(base, relative);
      if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mp3": "audio/mpeg", ".png": "image/png", ".svg": "image/svg+xml" };
      try { const data = await readFile(file); res.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" }); res.end(data); }
      catch { res.writeHead(404).end(); }
      return;
    }
    if (!["POST", "GET"].includes(req.method)) { json(res, 405, { error: "Method not allowed" }); return; }
    const action = url.pathname.slice("/api/coop/".length);
    if ((action === "room" || action === "poll") !== (req.method === "GET")) throw Error("Invalid method");
    const data = req.method === "POST" ? await body(req) : {};
    if (action === "create") {
      if (rooms.size >= 8) throw Error("Server has too many rooms");
      const code = randomBytes(6).toString("hex").toUpperCase();
      const room = new CoopRoom(code, data.profile); rooms.set(code, room);
      json(res, 200, admit(room, "host")); return;
    }
    if (action === "join") {
      const room = typeof data.code === "string" && rooms.get(data.code.toUpperCase());
      if (!room) throw Error("Room not found");
      room.join(data.profile); json(res, 200, admit(room, "guest")); return;
    }
    const session = sessions.get(req.headers.authorization?.replace(/^Bearer /, ""));
    if (!session) { json(res, 401, { error: "Room closed or session expired" }); return; }
    const { room, actorId } = session; session.touched = Date.now();
    switch (action) {
      case "room": json(res, 200, room.state()); return;
      case "configure": room.configure(actorId, data.levelId, data.difficulty); break;
      case "loadout": room.select(actorId, data.cards); break;
      case "ready": room.ready(actorId, data.ready); break;
      case "start": room.start(actorId, randomBytes(4).readUInt32LE()); break;
      case "connect": room.connect(actorId, data.connection); break;
      case "poll": json(res, 200, room.poll(actorId, url.searchParams.get("connection"))); return;
      case "send":
        if (typeof data.text !== "string" || !room.receive(actorId, data.connection, data.text)) throw Error("Battle message rejected");
        break;
      case "disconnect": room.disconnect(actorId, data.connection); break;
      case "leave": remove(room); json(res, 200, {}); return;
      default: json(res, 404, { error: "Not found" }); return;
    }
    json(res, 200, room.state());
  } catch (error) { if (!res.headersSent) json(res, 400, { error: error instanceof Error ? error.message : "Request failed" }); }
});
const closeSockets = attachCoopSockets(server, sessions);
server.requestTimeout = 15000;
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const peers = [...sessions.values()].filter(s => s.room === room);
    for (const peer of peers) if (now - peer.touched > 15000) room.disconnect(peer.actorId);
    if (room.phase === "closed" || peers.every(s => now - s.touched > 120000)) remove(room);
  }
}, 5000);
server.on("error", error => { console.error(error.message); clearInterval(cleanup); process.exitCode = 1; });
server.listen(port, "0.0.0.0", () => {
  console.log(`Charset co-op: http://127.0.0.1:${port}`);
  for (const entries of Object.values(networkInterfaces())) for (const address of entries ?? []) {
    if (address.family === "IPv4" && !address.internal) console.log(`LAN: http://${address.address}:${port}`);
  }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  clearInterval(cleanup); for (const room of rooms.values()) remove(room);
  closeSockets();
  server.close(); server.closeAllConnections();
});
