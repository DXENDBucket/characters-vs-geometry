export interface TimedCellSeal {
  lane: number;
  column: number;
  warnedAt: number;
  sealsAt: number;
  expiresAt: number;
  active: boolean;
}

// Battle-time deadlines keep warnings, erasure and expiry deterministic and pause-aware.
export class TimedCellSeals {
  private seals: TimedCellSeal[] = [];

  warn(lane: number, column: number, now: number, warningMs: number, durationMs: number, leadInMs = 0) {
    const warnedAt = now + leadInMs;
    this.seals.push({ lane, column, warnedAt, sealsAt: warnedAt + warningMs,
      expiresAt: warnedAt + warningMs + durationMs, active: false });
  }

  update(now: number, eraseCell: (lane: number, column: number) => void) {
    if (this.seals.length === 0) return false;
    let changed = false;
    for (const seal of this.seals) {
      if (!seal.active && now >= seal.sealsAt) {
        seal.active = true;
        eraseCell(seal.lane, seal.column);
        changed = true;
      }
    }
    const count = this.seals.length;
    this.seals = this.seals.filter(seal => now < seal.expiresAt);
    return changed || count !== this.seals.length;
  }

  seal(lane: number, column: number, now: number, durationMs: number, eraseCell: (lane: number, column: number) => void) {
    const existing = this.seals.find(seal => seal.active && now < seal.expiresAt && seal.lane === lane && seal.column === column);
    if (existing) {
      if (existing.expiresAt < now + durationMs) {
        existing.warnedAt = existing.sealsAt = now;
        existing.expiresAt = now + durationMs;
      }
      return;
    }
    this.seals.push({ lane, column, warnedAt: now, sealsAt: now, expiresAt: now + durationMs, active: true });
    eraseCell(lane, column);
  }

  isSealed(lane: number, column: number) {
    return this.seals.some(seal => seal.active && seal.lane === lane && seal.column === column);
  }

  get entries(): readonly TimedCellSeal[] { return this.seals; }
  snapshot() { return this.seals.map(seal => ({ ...seal })); }
  restore(seals: readonly TimedCellSeal[] = []) { this.seals = seals.map(seal => ({ ...seal })); }
}

export function timedCellSealScale(seal: TimedCellSeal, time: number) {
  return .5 + .5 * Math.max(0, Math.min(1, (seal.expiresAt - time) / (seal.expiresAt - seal.sealsAt)));
}
