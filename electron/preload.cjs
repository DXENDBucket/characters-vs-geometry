const { contextBridge, ipcRenderer } = require("electron");

let prepareClose = () => true;
ipcRenderer.on("charset:prepare-close", async (_event, requestId) => {
  let saved = false;
  try { saved = await prepareClose() !== false; } catch { /* Keep the window open on save errors. */ }
  ipcRenderer.send("charset:close-ready", requestId, saved);
});

contextBridge.exposeInMainWorld("charsetDesktop", {
  exportSave: text => ipcRenderer.invoke("charset:export-save", text),
  importSave: () => ipcRenderer.invoke("charset:import-save"),
  exportReplay: text => ipcRenderer.invoke("charset:export-save", text, "replay"),
  importReplay: () => ipcRenderer.invoke("charset:import-save", "replay"),
  runtime: Object.freeze({ electron: process.versions.electron, chromium: process.versions.chrome,
    v8: process.versions.v8, platform: process.platform, arch: process.arch }),
  onBeforeClose: callback => {
    if (typeof callback !== "function") throw new TypeError("Expected a close handler");
    prepareClose = callback;
  }
});
