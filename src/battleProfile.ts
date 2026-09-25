import { CARD_SLOT_COUNT } from "./config";
import { RESELECT_UNLOCK_LEVEL } from "./game/loadoutReselection";
import type { BattleResult } from "./game/battleLifecycle";
import type { BossKind, CardId, EnemyKind } from "./types";
import { completeLevel, isLevelCompleted, recordBossSeen, recordCompletedWaves, recordDefeatedBossRank,
  recordEnemySeen, unlockedCardSlotCount } from "./progress";
import { deleteSurvivalSave } from "./survivalSaves";

export interface BattleRewards {
  cards: CardId[];
  slots?: { current: number; total: number };
  reselect?: boolean;
}

// Local profile effects only. Neither this adapter nor reward acknowledgments belong in battle snapshots.
export class BattleProfile {
  private settled = false;

  constructor(readonly enabled: boolean, private readonly levelId: string,
    private readonly difficulty: number, private readonly survival: boolean) {}

  enemySeen(kind: EnemyKind) { if (this.enabled) recordEnemySeen(kind); }
  bossSeen(kind: BossKind) { if (this.enabled) recordBossSeen(kind); }
  completedWaves(count: number) { if (this.enabled) recordCompletedWaves(this.levelId, count, this.difficulty); }
  defeatedBoss(rank: number) { if (this.enabled) recordDefeatedBossRank(this.levelId, rank, this.difficulty); }
  clearSurvivalSave() { if (this.enabled && this.survival) deleteSurvivalSave(this.levelId); }

  restored(result: BattleResult | null) {
    if (result) this.settled = true;
  }

  settle(result: BattleResult): BattleRewards {
    if (!this.enabled || this.settled) return { cards: [] };
    this.settled = true;
    if (result.outcome === "defeat") {
      this.clearSurvivalSave();
      return { cards: [] };
    }
    const reselect = this.levelId === RESELECT_UNLOCK_LEVEL && !isLevelCompleted(RESELECT_UNLOCK_LEVEL);
    const previousSlots = unlockedCardSlotCount();
    const cards = completeLevel(this.levelId, { difficulty: this.difficulty, flawless: result.flawless });
    const currentSlots = unlockedCardSlotCount();
    return { cards, reselect, slots: currentSlots > previousSlots ? { current: currentSlots, total: CARD_SLOT_COUNT } : undefined };
  }
}
