const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { promisify, TextDecoder } = require("node:util");
const { gzip, gunzip } = require("node:zlib");
const compress = promisify(gzip), decompress = promisify(gunzip);
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Host-owned storage, never an unrestricted renderer IPC endpoint. Requires one writer.
function createBattleCheckpointStore(filename, maxBytes = 32 * 1024 * 1024, { compression = true } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || typeof compression !== "boolean") throw new Error("Invalid checkpoint storage options");
  const target = path.resolve(filename);
  return {
    async read() {
      let file;
      try {
        file = await fs.open(target, "r");
        if ((await file.stat()).size > maxBytes) throw new Error("Host checkpoint is too large");
        const payload = await file.readFile();
        if (payload.length > maxBytes) throw new Error("Host checkpoint is too large");
        // Gzip's signature cannot begin a valid legacy UTF-8 document.
        const data = payload[0] === 0x1f && payload[1] === 0x8b
          ? await decompress(payload, { maxOutputLength: maxBytes }) : payload;
        return decoder.decode(data);
      } catch (error) {
        if (error.code === "ENOENT") return undefined;
        throw error;
      } finally { await file?.close(); }
    },
    async save(text) {
      if (typeof text !== "string" || Buffer.byteLength(text) > maxBytes) throw new Error("Invalid host checkpoint size");
      const input = Buffer.from(text, "utf8");
      let payload = input;
      if (compression && input.length >= 1024) {
        try {
          const encoded = await compress(input, { level: 1, maxOutputLength: input.length });
          if (encoded.length < input.length) payload = encoded;
        } catch (error) {
          // Incompressible data remains valid; other codec failures must stop the commit.
          if (error.code !== "ERR_BUFFER_TOO_LARGE") throw error;
        }
      }
      const directory = path.dirname(target), temporary = target + "." + randomUUID() + ".tmp";
      await fs.mkdir(directory, { recursive: true });
      let file;
      try {
        file = await fs.open(temporary, "wx", 0o600);
        await file.writeFile(payload); await file.sync(); await file.close(); file = undefined;
        await fs.rename(temporary, target);
        // Windows does not expose directory fsync through Node; file data was flushed before rename.
        if (process.platform !== "win32") {
          const parent = await fs.open(directory, "r");
          try { await parent.sync(); } finally { await parent.close(); }
        }
        return payload.length;
      } finally {
        await file?.close();
        await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
    }
  };
}

module.exports = { createBattleCheckpointStore };
