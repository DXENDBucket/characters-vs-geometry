export const MAX_VOLLEY_SHOTS = 5;

export function volleyTimingCount(totalHits: number) {
  return Math.min(MAX_VOLLEY_SHOTS, Math.max(1, Math.floor(totalHits)));
}

export function volleyHitsAt(totalHits: number, shotIndex: number) {
  const timings = volleyTimingCount(totalHits);
  if (shotIndex < 0 || shotIndex >= timings) return 0;
  return Math.floor(totalHits / timings) + (shotIndex < totalHits % timings ? 1 : 0);
}

export function repeatHits(hitCount: number | undefined, hit: () => void) {
  for (let index = 0; index < (hitCount ?? 1); index += 1) hit();
}
