const path = require("node:path");

const APP_URL = "charset://game/index.html";

function developmentUrl(value) {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.username || url.password) {
    throw new Error("Electron development URL must be a local HTTP server");
  }
  return url.href;
}

function allowedNavigation(value, devUrl) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (devUrl) return url.origin === new URL(devUrl).origin;
    return url.protocol === "charset:" && url.hostname === "game" && !url.port;
  } catch { return false; }
}

function assetPath(root, value) {
  const url = new URL(value);
  if (!allowedNavigation(value)) throw new Error("Invalid asset origin");
  const pathname = decodeURIComponent(url.pathname);
  if (/[\\:\0]/.test(pathname) || pathname.split("/").some(part => part === ".." || part === ".")) {
    throw new Error("Invalid asset path");
  }
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  const relative = path.relative(path.resolve(root), file);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("Asset outside distribution");
  return file;
}

function contentSecurityPolicy(dev = false) {
  return ["default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self' data:", "media-src 'self' blob:",
    `connect-src 'self'${dev ? " ws://127.0.0.1:* ws://localhost:*" : ""}`,
    "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"].join("; ");
}

module.exports = { APP_URL, developmentUrl, allowedNavigation, assetPath, contentSecurityPolicy };
