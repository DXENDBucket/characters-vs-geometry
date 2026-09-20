import { createServer } from "vite";
import { spawn } from "node:child_process";
import electron from "electron";

const server = await createServer({ clearScreen: false, server: { host: "127.0.0.1", port: 5174, strictPort: false } });
await server.listen();
server.printUrls();
const env = { ...process.env, CHARSET_DEV_URL: server.resolvedUrls.local[0] };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], { stdio: "inherit", windowsHide: true, env });
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null) child.kill();
  await server.close();
  process.exitCode = code;
}
child.on("error", error => { console.error(error); void stop(1); });
child.on("exit", code => void stop(code ?? 0));
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
