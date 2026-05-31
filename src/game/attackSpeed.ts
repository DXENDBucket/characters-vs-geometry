const ATTACK_SPEED_BASE_INTERVAL_MS = 60_000;

export function attackIntervalMs(attackSpeed?: number) {
  if (attackSpeed === undefined || !Number.isFinite(attackSpeed)) {
    return Number.POSITIVE_INFINITY;
  }

  return ATTACK_SPEED_BASE_INTERVAL_MS / Math.max(1, attackSpeed);
}

export function attackSpeedForIntervalMs(intervalMs: number) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return undefined;
  }

  return Math.max(1, ATTACK_SPEED_BASE_INTERVAL_MS / intervalMs);
}
