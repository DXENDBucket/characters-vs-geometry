import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
const { developmentUrl, allowedNavigation, assetPath, contentSecurityPolicy } = createRequire(import.meta.url)("../electron/policy.cjs");

test("desktop renderer only loads its packaged origin or the selected loopback dev server", () => {
  assert.equal(developmentUrl("http://127.0.0.1:5174"), "http://127.0.0.1:5174/");
  for (const url of ["https://example.com", "file:///secret", "http://localhost.evil:5174", "http://user@localhost:5174"])
    assert.throws(() => developmentUrl(url));
  assert.ok(allowedNavigation("charset://game/index.html"));
  assert.ok(allowedNavigation("http://127.0.0.1:5174/", "http://127.0.0.1:5174/"));
  assert.equal(allowedNavigation("http://127.0.0.1:5175/", "http://127.0.0.1:5174/"), false);
  assert.equal(allowedNavigation("charset://evil/index.html"), false);
});

test("packaged resource paths cannot escape distribution or access Windows alternate streams", () => {
  const root = path.resolve("dist");
  assert.equal(assetPath(root, "charset://game/assets/index-abc.js"), path.join(root, "assets", "index-abc.js"));
  for (const url of ["charset://game/%2e%2e%2fpackage.json", "charset://game/C:%5csecret", "charset://game/index.html:secret",
    "charset://other/index.html", "file:///etc/passwd", "charset://game/%00"])
    assert.throws(() => assetPath(root, url));
  assert.ok(contentSecurityPolicy().includes("script-src 'self'"));
  assert.ok(!contentSecurityPolicy().includes("unsafe-eval"));
  assert.ok(!contentSecurityPolicy().includes("ws://"));
});
