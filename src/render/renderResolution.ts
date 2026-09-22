export const MAX_RENDER_SCALE = 2;
export const MAX_RENDER_PIXELS = 4_000_000;
export const MAX_RENDER_DIMENSION = 4096;

export function renderSizeForViewport(viewport: {
  logicalWidth: number;
  logicalHeight: number;
  displayWidth: number;
  displayHeight: number;
  devicePixelRatio: number;
  maxDimension?: number;
}) {
  const { logicalWidth, logicalHeight, displayWidth, displayHeight } = viewport;
  const dpr = Number.isFinite(viewport.devicePixelRatio) ? Math.max(1, viewport.devicePixelRatio) : 1;
  const width = Math.max(logicalWidth, Math.round(displayWidth * dpr));
  const height = Math.max(logicalHeight, Math.round(displayHeight * dpr));
  const limit = Math.min(MAX_RENDER_DIMENSION, viewport.maxDimension ?? MAX_RENDER_DIMENSION);
  const scale = Math.min(1, logicalWidth * MAX_RENDER_SCALE / width, logicalHeight * MAX_RENDER_SCALE / height,
    Math.sqrt(MAX_RENDER_PIXELS / (width * height)), limit / width, limit / height);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
