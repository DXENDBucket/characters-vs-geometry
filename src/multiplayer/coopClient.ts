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
      let closed = false, timer: ReturnType<typeof setTimeout> | undefined;
      const abort = new AbortController();
      let tail = Promise.resolve();
      const failed = (error: unknown) => {
        if (!closed) events.closed(!(error instanceof CoopRequestError && [401, 403].includes(error.status)));
      };
      const poll = async () => {
        try {
          const messages = await this.request<string[]>(`poll?connection=${connection}`, undefined,
            AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]));
          if (closed) return;
          for (const message of messages) { if (closed) break; events.message(message); }
          if (!closed) timer = setTimeout(() => void poll(), 35);
        } catch (error) { failed(error); }
      };
      tail = this.request("connect", { connection }, AbortSignal.any([abort.signal, AbortSignal.timeout(8000)])).then(() => {
        if (!closed) { events.open(); void poll(); }
      }).catch(failed);
      return {
        send: text => {
          tail = tail.then(async () => {
            if (!closed) await this.request("send", { connection, text }, AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]));
          }).catch(failed);
        },
        close: () => {
          if (closed) return;
          closed = true; clearTimeout(timer); abort.abort();
          void this.request("disconnect", { connection }).catch(() => {});
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
