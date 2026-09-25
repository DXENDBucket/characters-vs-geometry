import { rawCharsForSoftcapped, softcapChars } from "./charSoftcap";
import { battleBuilderIds, DEFAULT_BATTLE_PARTICIPANTS, type BattleOperationActor } from "./battleParticipants";
import type { BattlePolicy } from "./battlePolicy";

export interface BattleWallet { actorId: string; chars: number }

export function validateBattleWallets(chars: number, wallets: unknown,
  policy?: BattlePolicy, participants: readonly BattleOperationActor[] = DEFAULT_BATTLE_PARTICIPANTS) {
  if (policy?.walletMode !== "individual") {
    if (wallets !== undefined) throw new Error("Unexpected individual wallets");
    return;
  }
  const actors = battleBuilderIds(participants);
  if (!actors.length || !Array.isArray(wallets) || wallets.length !== actors.length ||
    !Array.from(wallets).every((wallet, index) => wallet && Object.getPrototypeOf(wallet) === Object.prototype &&
      Object.keys(wallet).length === 2 && Object.hasOwn(wallet, "actorId") && Object.hasOwn(wallet, "chars") &&
      wallet.actorId === actors[index] && typeof wallet.chars === "number" && Number.isFinite(wallet.chars) && wallet.chars >= 0) ||
    wallets.reduce((total, wallet) => total + wallet.chars, 0) !== chars) {
    throw new Error("Invalid individual wallets");
  }
}

// Account order is canonical, independent of connection/command arrival order.
export class BattleEconomy {
  private wallets?: Map<string, number>;
  constructor(private sharedChars: number) {}

  get individual() { return this.wallets !== undefined; }
  balance(actorId: string) { return this.wallets ? this.wallets.get(actorId) ?? 0 : this.sharedChars; }
  hasWallet(actorId: string) { return !this.wallets || this.wallets.has(actorId); }
  get actorIds(): Iterable<string> { return this.wallets?.keys() ?? []; }
  get totalChars() {
    if (!this.wallets) return this.sharedChars;
    let total = 0;
    for (const value of this.wallets.values()) total += value;
    return total;
  }
  set sharedBalance(value: number) {
    if (this.wallets) throw new Error("Individual balance requires an actor");
    this.sharedChars = value;
  }

  initialize(policy: BattlePolicy, participants: readonly BattleOperationActor[]) {
    if (policy.walletMode !== "individual") return;
    const actors = battleBuilderIds(participants);
    if (!actors.length) throw new Error("Individual economy requires a builder");
    if (this.wallets) return;
    this.wallets = new Map(actors.map(id => [id, 0]));
    this.gain(this.sharedChars);
    this.sharedChars = 0;
  }

  available(actorId?: string) {
    if (!this.wallets) return softcapChars(this.sharedChars);
    if (actorId !== undefined) return softcapChars(this.wallets.get(actorId) ?? 0);
    let total = 0;
    for (const value of this.wallets.values()) total += softcapChars(value);
    return total;
  }

  gain(amount: number, actorId?: string) {
    const before = this.available(actorId);
    if (!this.wallets) this.sharedChars += amount;
    else if (actorId !== undefined) {
      const balance = this.wallets.get(actorId);
      if (balance === undefined) throw new Error("Unknown wallet actor");
      this.wallets.set(actorId, balance + amount);
    } else {
      const share = amount / this.wallets.size;
      let index = 0;
      for (const [id, balance] of this.wallets) {
        this.wallets.set(id, balance + (++index === this.wallets.size ? amount - share * (index - 1) : share));
      }
    }
    return Math.max(0, this.available(actorId) - before);
  }

  spend(amount: number, actorId?: string) {
    if (this.wallets && (actorId === undefined || !this.wallets.has(actorId))) throw new Error("Spending requires a wallet actor");
    const remaining = rawCharsForSoftcapped(Math.max(0, this.available(actorId) - amount));
    if (this.wallets) this.wallets.set(actorId!, remaining);
    else this.sharedChars = remaining;
  }

  snapshot(): BattleWallet[] | undefined {
    return this.wallets ? Array.from(this.wallets, ([actorId, chars]) => ({ actorId, chars })) : undefined;
  }

  restore(chars: number, wallets: BattleWallet[] | undefined, policy: BattlePolicy, participants: readonly BattleOperationActor[]) {
    validateBattleWallets(chars, wallets, policy, participants);
    this.wallets = wallets ? new Map(wallets.map(wallet => [wallet.actorId, wallet.chars])) : undefined;
    this.sharedChars = wallets ? 0 : chars;
  }
}
