import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const { renderSizeForViewport, MAX_RENDER_PIXELS, MAX_RENDER_SCALE, MAX_RENDER_DIMENSION } =
  createTypeScriptLoader()("src/render/renderResolution.ts");
const base = { logicalWidth: 1280, logicalHeight: 760, displayWidth: 1818, displayHeight: 1080, devicePixelRatio: 1 };

test("framebuffer matches visible physical pixels without changing logical size", () => {
  assert.deepEqual(renderSizeForViewport(base), { width: 1818, height: 1080 });
  assert.deepEqual(renderSizeForViewport({ ...base, displayWidth: 1280, displayHeight: 760, devicePixelRatio: 2 }), { width: 2560, height: 1520 });
  assert.deepEqual(renderSizeForViewport({ ...base, displayWidth: 800, displayHeight: 475 }), { width: 1280, height: 760 });
  assert.equal(base.logicalWidth, 1280);
});

test("high-DPI and ultrawide sizes obey pixel, scale and GPU limits", () => {
  for (const logicalWidth of [640, 1280, 2700, 8000]) {
    for (const devicePixelRatio of [1, 1.25, 1.5, 2, 3, 4]) {
      for (const maxDimension of [2048, 4096]) {
        const size = renderSizeForViewport({ ...base, logicalWidth, displayWidth: logicalWidth * 3,
          displayHeight: 2280, devicePixelRatio, maxDimension });
        assert(size.width * size.height <= MAX_RENDER_PIXELS);
        assert(size.width <= logicalWidth * MAX_RENDER_SCALE && size.height <= 760 * MAX_RENDER_SCALE);
        assert(size.width <= Math.min(MAX_RENDER_DIMENSION, maxDimension) && size.height <= maxDimension);
        assert(Number.isInteger(size.width) && Number.isInteger(size.height) && size.width > 0 && size.height > 0);
      }
    }
  }
});

test("fractional DPI follows OS scaling and invalid DPI falls back safely", () => {
  assert.deepEqual(renderSizeForViewport({ ...base, displayWidth: 1280, displayHeight: 760, devicePixelRatio: 1.25 }), { width: 1600, height: 950 });
  for (const devicePixelRatio of [NaN, Infinity, 0, -1]) {
    assert.deepEqual(renderSizeForViewport({ ...base, devicePixelRatio }), renderSizeForViewport(base));
  }
});
