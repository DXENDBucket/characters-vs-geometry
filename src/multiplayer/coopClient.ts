import type { BattleTransportFactory } from "../game/battleConnection";

class CoopRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class CoopClient {
  token = "";
  constructor(readonly address: string) {}
  async request<T>(action: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.address}/api/coop/${action}`, { method: data === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data), signal: signal ?? AbortSignal.timeout(8000) });
    const result = await response.json();
    if (!response.ok) throw new CoopRequestError(result.error ?? `HTTP ${response.status}`, response.status);
    return result as T;
  }
  transport(): BattleTransportFactory {
    return events => {
      const connection = Array.from(crypto.getRandomValues(new Uint32Array(4))).join("_");
      const url = new URL("/api/coop/socket", this.address);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url);
      let closed = false;
      const timeout = setTimeout(() => { if (!closed) socket.close(); }, 10000);
      socket.onopen = () => {
        if (closed) return;
        clearTimeout(timeout);
        // Authenticate inside TLS, never put the session token in a URL/log.
        socket.send(JSON.stringify({ token: this.token, connection }));
        events.open();
      };
      socket.onmessage = event => { if (!closed) events.message(event.data); };
      socket.onerror = () => { /* onclose drives the existing reconnect policy. */ };
      socket.onclose = event => {
        clearTimeout(timeout);
        if (!closed) { closed = true; events.closed(![1008, 4001].includes(event.code)); }
      };
      return {
        send: text => {
          if (closed || socket.readyState !== WebSocket.OPEN) throw new Error("Battle connection closed");
          socket.send(text);
        },
        close: () => {
          if (closed) return;
          closed = true; clearTimeout(timeout); socket.close();
        }
      };
    };
  }
}

export function coopAddress(text: string) {
  const url = new URL(text.includes("://") ? text : `http://${text}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("请输入服务器地址，例如 http://192.168.1.2:5180");
  }
  return url.origin;
}
