import { WebSocket, WebSocketServer } from "ws";

export function attachCoopSockets(server, sessions) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536 + 128, perMessageDeflate: false });
  const upgrade = (req, socket, head) => {
    if (req.url !== "/api/coop/socket") { socket.destroy(); return; }
    sockets.handleUpgrade(req, socket, head, ws => sockets.emit("connection", ws));
  };
  server.on("upgrade", upgrade);
  sockets.on("connection", ws => {
    let session, connection, token, alive = true;
    const authTimeout = setTimeout(() => ws.close(4001, "Authentication required"), 5000);
    const heartbeat = setInterval(() => {
      if (!alive) { ws.terminate(); return; }
      alive = false; ws.ping();
    }, 5000);
    ws.on("pong", () => { alive = true; if (session) session.touched = Date.now(); });
    ws.on("error", () => ws.terminate());
    ws.on("message", (data, binary) => {
      try {
        if (binary) throw Error("Text messages required");
        const text = data.toString();
        if (!session) {
          const auth = JSON.parse(text);
          const found = sessions.get(auth?.token);
          if (!found || typeof auth.connection !== "string") { ws.close(4001, "Session expired"); return; }
          session = found; token = auth.token; connection = auth.connection;
          session.touched = Date.now(); clearTimeout(authTimeout);
          session.room.connect(session.actorId, connection, {
            send(message) {
              if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount + Buffer.byteLength(message) > 16 * 1024 * 1024) {
                throw Error("Battle socket backpressure");
              }
              ws.send(message);
            },
            close() { ws.close(4000, "Battle connection closed"); }
          });
        } else {
          if (sessions.get(token) !== session || !session.room.receive(session.actorId, connection, text)) throw Error("Battle message rejected");
          session.touched = Date.now();
        }
      } catch { ws.close(1008, "Invalid battle message"); }
    });
    ws.on("close", () => {
      clearTimeout(authTimeout); clearInterval(heartbeat);
      if (session) session.room.disconnect(session.actorId, connection);
    });
  });
  return () => {
    server.off("upgrade", upgrade);
    for (const ws of sockets.clients) ws.terminate();
    sockets.close();
  };
}
