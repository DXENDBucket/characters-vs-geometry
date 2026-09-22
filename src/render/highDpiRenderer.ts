import Phaser from "phaser";
import { MAX_RENDER_DIMENSION, renderSizeForViewport } from "./renderResolution";

// Phaser's renderer uses this matrix, but its private field is omitted from the 3.90 declarations.
type RenderCamera = Phaser.Cameras.Scene2D.Camera & { matrix: Phaser.GameObjects.Components.TransformMatrix };

/** Phaser 3.90 keeps FIT/input in logical pixels; adapt only the framebuffer and render-time camera. */
export function installHighDpiRenderer(game: Phaser.Game) {
  const renderer = game.renderer;
  if (!renderer) return;
  const originalRender = renderer.render;
  const canvas = game.canvas;
  let scaleX = 1, scaleY = 1;
  let lastDpr = window.devicePixelRatio;
  let maxDimension = MAX_RENDER_DIMENSION;
  if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
    const gl = renderer.gl;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    maxDimension = Math.min(maxDimension, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_TEXTURE_SIZE), viewport[0], viewport[1]);
  }

  const resize = () => {
    const scale = game.scale;
    const bounds = scale.canvasBounds;
    if (!bounds.width || !bounds.height) return;
    lastDpr = window.devicePixelRatio;
    const size = renderSizeForViewport({ logicalWidth: scale.width, logicalHeight: scale.height,
      displayWidth: bounds.width, displayHeight: bounds.height, devicePixelRatio: lastDpr, maxDimension });
    scaleX = size.width / scale.width;
    scaleY = size.height / scale.height;
    // Do not change gameSize/baseSize/displayScale: Phaser input must stay in logical coordinates.
    const canvasChanged = canvas.width !== size.width || canvas.height !== size.height;
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    // The native resize listener can run before us with the old framebuffer height.
    if (canvasChanged || renderer.width !== size.width || renderer.height !== size.height) renderer.resize(size.width, size.height);
  };

  renderer.render = (scene, children, camera) => {
    if (scaleX === 1 && scaleY === 1) {
      originalRender.call(renderer, scene, children, camera);
      return;
    }
    const { x, y, width, height } = camera;
    const matrix = (camera as RenderCamera).matrix;
    const { a, b, c, d, e, f } = matrix;
    camera.setViewport(x * scaleX, y * scaleY, width * scaleX, height * scaleY);
    matrix.setTransform(a * scaleX, b * scaleY, c * scaleX, d * scaleY, e * scaleX, f * scaleY);
    try {
      originalRender.call(renderer, scene, children, camera);
    } finally {
      const dirty = camera.dirty;
      camera.setViewport(x, y, width, height);
      matrix.setTransform(a, b, c, d, e, f);
      camera.dirty = dirty;
    }
  };

  const checkDpi = () => {
    // Some display/zoom changes do not emit a resize or media-query event.
    if (lastDpr !== window.devicePixelRatio) resize();
  };
  game.scale.on(Phaser.Scale.Events.RESIZE, resize);
  renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, resize);
  game.events.on(Phaser.Core.Events.PRE_RENDER, checkDpi);
  resize();
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    game.scale.off(Phaser.Scale.Events.RESIZE, resize);
    renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, resize);
    game.events.off(Phaser.Core.Events.PRE_RENDER, checkDpi);
    renderer.render = originalRender;
  });
}
