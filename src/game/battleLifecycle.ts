import { BASE_INTEGRITY } from "../config";

export interface BattleResult {
  readonly outcome: "victory" | "defeat";
  readonly endedAt: number;
  readonly flawless: boolean;
}

export interface BattleLifecycleState {
  readonly version: 1;
  readonly flawlessEligible: boolean;
  readonly result: BattleResult | null;
}

export function createBattleLifecycle(flawlessEligible: boolean): BattleLifecycleState {
  return Object.freeze({ version: 1, flawlessEligible, result: null });
}

function exactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function copyBattleLifecycle(value: unknown, battleTime: number, baseIntegrity: number): BattleLifecycleState {
  if (!Number.isFinite(battleTime) || battleTime < 0 || !Number.isFinite(baseIntegrity) || baseIntegrity < 0 ||
      !exactRecord(value, ["version", "flawlessEligible", "result"]) || value.version !== 1 ||
      typeof value.flawlessEligible !== "boolean") throw new Error("Invalid battle lifecycle");
  const result = value.result;
  if (result === null) {
    if (baseIntegrity <= 0) throw new Error("Running battle has no base integrity");
    return createBattleLifecycle(value.flawlessEligible);
  }
  if (!exactRecord(result, ["outcome", "endedAt", "flawless"]) ||
      (result.outcome !== "victory" && result.outcome !== "defeat") ||
      typeof result.endedAt !== "number" || !Number.isFinite(result.endedAt) || result.endedAt < 0 || result.endedAt > battleTime ||
      typeof result.flawless !== "boolean" ||
      (result.flawless && (result.outcome !== "victory" || !value.flawlessEligible || baseIntegrity < BASE_INTEGRITY)) ||
      (baseIntegrity === 0 && result.outcome !== "defeat")) throw new Error("Invalid battle result");
  return Object.freeze({ version: 1, flawlessEligible: value.flawlessEligible,
    result: Object.freeze({ outcome: result.outcome, endedAt: result.endedAt, flawless: result.flawless }) });
}

export function restoredBattleLifecycle(value: unknown, battleTime: number, baseIntegrity: number) {
  // Legacy saves never recorded debug use or a terminal result. Do not invent flawless eligibility.
  return copyBattleLifecycle(value === undefined ? createBattleLifecycle(false) : value, battleTime, baseIntegrity);
}
