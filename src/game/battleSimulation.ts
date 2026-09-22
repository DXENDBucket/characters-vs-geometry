export const BATTLE_STEP_MS = 1000 / 60;
export const BATTLE_RULES_VERSION = 2;

// Version 1 saves have no pending copy warnings; their existing bodies and clock remain valid.
export function canRestoreBattleVersion(version: unknown) {
  return version === 1 || version === BATTLE_RULES_VERSION;
}

export class BattleRandom {
  constructor(public state: number) { this.state >>>= 0; }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }

  between(min: number, max: number) { return min + Math.floor(this.next() * (max - min + 1)); }
}

const randoms = new WeakMap<object, BattleRandom>();
const playbackOwners = new WeakSet<object>();
export function setBattlePlayback(owner: object, enabled: boolean) {
  if (enabled) playbackOwners.add(owner); else playbackOwners.delete(owner);
}
export function isBattlePlayback(owner: object) { return playbackOwners.has(owner); }
export function setBattleRandom(owner: object, random: BattleRandom) { randoms.set(owner, random); }
export function battleRandom(owner: object) {
  let random = randoms.get(owner);
  if (!random) { random = new BattleRandom(0); randoms.set(owner, random); }
  return random;
}

export interface BattleClockState { tick: number; remainder: number }

export class BattleClock {
  tick = 0;
  private remainder = 0;

  // Keep unprocessed time rather than dropping simulation ticks on a slow frame.
  advance(delta: number, step: () => boolean | void) {
    if (!Number.isFinite(delta) || delta < 0) return;
    this.remainder += delta;
    let count = 0;
    while (this.remainder + 1e-7 >= BATTLE_STEP_MS && count < 12) {
      this.remainder = Math.max(0, this.remainder - BATTLE_STEP_MS);
      this.tick++;
      count++;
      if (step() === false) break;
    }
  }

  snapshot(): BattleClockState { return { tick: this.tick, remainder: this.remainder }; }
  restore(state: BattleClockState) {
    if (!validBattleClock(state)) throw new Error("Invalid battle clock");
    this.tick = state.tick; this.remainder = state.remainder;
  }
}

export function validBattleClock(value: BattleClockState) {
  return value && Number.isSafeInteger(value.tick) && value.tick >= 0 &&
    Number.isFinite(value.remainder) && value.remainder >= 0;
}
