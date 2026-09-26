const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { APP_URL, developmentUrl, allowedNavigation, assetPath, contentSecurityPolicy } = require("./policy.cjs");

const devUrl = app.isPackaged ? undefined : developmentUrl(process.env.CHARSET_DEV_URL);
const profile = process.env.CHARSET_USER_DATA || path.join(app.getPath("appData"), app.isPackaged ? "Charset" : "Charset Dev");
app.setPath("userData", profile);
app.setPath("sessionData", profile);
app.setAppUserModelId("com.charset.game");
protocol.registerSchemesAsPrivileged([{ scheme: "charset", privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true
} }]);

let mainWindow;
let quitRequested = false;

async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    title: "Charset", width: Math.min(1280, width), height: Math.min(800, height),
    minWidth: Math.min(800, width), minHeight: Math.min(500, height),
    backgroundColor: "#050505", show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true }
  });
  mainWindow = window;
  const contents = window.webContents;
  const checkSender = event => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame || !allowedNavigation(event.senderFrame.url, devUrl)) {
      throw new Error("Untrusted save request");
    }
  };
  ipcMain.handle("charset:export-save", async (event, text, kind = "save") => {
    checkSender(event);
    if (!["save", "replay"].includes(kind)) throw new Error("Invalid file kind");
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 32 * 1024 * 1024) throw new Error("Invalid save size");
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: kind === "replay" ? "Export Charset Replay" : "Export Charset Save", defaultPath: `Charset-${kind}-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: kind === "replay" ? "Charset Replay" : "Charset Save", extensions: ["json"] }]
    });
    if (canceled || !filePath) return false;
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, text, { encoding: "utf8", flag: "wx" }); await fs.rename(temporary, filePath); }
    finally { await fs.rm(temporary, { force: true }); }
    return true;
  });
  ipcMain.handle("charset:import-save", async (event, kind = "save") => {
    checkSender(event);
    if (!["save", "replay"].includes(kind)) throw new Error("Invalid file kind");
    const { canceled, filePaths } = await dialog.showOpenDialog(window, { title: kind === "replay" ? "Import Charset Replay" : "Import Charset Save",
      properties: ["openFile"], filters: [{ name: kind === "replay" ? "Charset Replay" : "Charset Save", extensions: ["json"] }] });
    if (canceled || !filePaths[0]) return null;
    if ((await fs.stat(filePaths[0])).size > 32 * 1024 * 1024) throw new Error("Save file too large");
    return fs.readFile(filePaths[0], "utf8");
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => { if (!allowedNavigation(url, devUrl)) event.preventDefault(); });
  contents.on("will-redirect", (event, url) => { if (!allowedNavigation(url, devUrl)) event.preventDefault(); });
  contents.on("will-attach-webview", event => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  contents.session.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders, "Content-Security-Policy": [contentSecurityPolicy(Boolean(devUrl))]
  } }));
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11" && !input.isAutoRepeat) {
      event.preventDefault(); window.setFullScreen(!window.isFullScreen());
    }
    if (app.isPackaged && (input.key === "F5" || ((input.control || input.meta) && input.key.toLowerCase() === "r"))) event.preventDefault();
    if (!app.isPackaged && input.key === "F12") { event.preventDefault(); contents.toggleDevTools(); }
  });

  let pendingClose = 0;
  let closeCounter = 0;
  let closeTimer;
  let closing = false;
  const finishClose = () => {
    closing = true;
    clearTimeout(closeTimer);
    contents.session.flushStorageData();
    window.close();
  };
  const onCloseReady = (event, requestId, saved) => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame ||
        !pendingClose || requestId !== pendingClose || !allowedNavigation(event.senderFrame.url, devUrl)) return;
    clearTimeout(closeTimer);
    pendingClose = 0;
    if (saved === true) finishClose();
    else {
      quitRequested = false;
      void dialog.showMessageBox(window, { type: "error", title: "Charset", message: "Could not save the battle.",
        detail: "The window will stay open. Please free some disk space and try again.", buttons: ["OK"] });
    }
  };
  ipcMain.on("charset:close-ready", onCloseReady);
  window.on("close", event => {
    if (closing) return;
    event.preventDefault();
    if (pendingClose) return;
    const requestId = ++closeCounter;
    pendingClose = requestId;
    try { contents.send("charset:prepare-close", requestId); }
    catch { /* A crashed renderer falls through to the close-without-saving prompt. */ }
    closeTimer = setTimeout(async () => {
      if (window.isDestroyed() || pendingClose !== requestId) return;
      const { response } = await dialog.showMessageBox(window, { type: "warning", title: "Charset",
        message: "The game has not finished saving.", detail: "Closing now may lose the current battle.",
        buttons: ["Keep Open", "Close Without Saving"], defaultId: 0, cancelId: 0 });
      if (window.isDestroyed() || pendingClose !== requestId) return;
      pendingClose = 0;
      if (response === 1) finishClose(); else quitRequested = false;
    }, 10_000);
  });
  window.once("closed", () => {
    clearTimeout(closeTimer);
    ipcMain.removeListener("charset:close-ready", onCloseReady);
    ipcMain.removeHandler("charset:export-save"); ipcMain.removeHandler("charset:import-save");
    mainWindow = undefined;
  });
  window.once("ready-to-show", () => { if (process.env.CHARSET_TEST !== "1") window.show(); });
  await window.loadURL(devUrl ?? APP_URL);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.on("before-quit", () => { quitRequested = true; });
  app.on("window-all-closed", () => { if (process.platform !== "darwin" || quitRequested) app.quit(); });
  app.on("activate", () => { if (!mainWindow) void createWindow(); });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    protocol.handle("charset", async request => {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
      try { return await net.fetch(pathToFileURL(assetPath(path.join(app.getAppPath(), "dist"), request.url)).href); }
      catch { return new Response("Not found", { status: 404 }); }
    });
    await createWindow();
  }).catch(error => {
    dialog.showErrorBox("Charset could not start", String(error));
    app.exit(1);
  });
}
