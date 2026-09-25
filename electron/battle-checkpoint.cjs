const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// Host-owned storage, never an unrestricted renderer IPC endpoint. Requires one writer.
function createBattleCheckpointStore(filename, maxBytes = 32 * 1024 * 1024) {
  const target = path.resolve(filename);
  return {
    async read() {
      let file;
      try {
        file = await fs.open(target, "r");
        if ((await file.stat()).size > maxBytes) throw new Error("Host checkpoint is too large");
        const text = await file.readFile("utf8");
        if (Buffer.byteLength(text) > maxBytes) throw new Error("Host checkpoint is too large");
        return text;
      } catch (error) {
        if (error.code === "ENOENT") return undefined;
        throw error;
      } finally { await file?.close(); }
    },
    async save(text) {
      if (typeof text !== "string" || Buffer.byteLength(text) > maxBytes) throw new Error("Invalid host checkpoint size");
      const directory = path.dirname(target), temporary = target + "." + randomUUID() + ".tmp";
      await fs.mkdir(directory, { recursive: true });
      let file;
      try {
        file = await fs.open(temporary, "wx", 0o600);
        await file.writeFile(text, "utf8"); await file.sync(); await file.close(); file = undefined;
        await fs.rename(temporary, target);
        // Windows does not expose directory fsync through Node; file data was flushed before rename.
        if (process.platform !== "win32") {
          const parent = await fs.open(directory, "r");
          try { await parent.sync(); } finally { await parent.close(); }
        }
      } finally {
        await file?.close();
        await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
    }
  };
}

module.exports = { createBattleCheckpointStore };
