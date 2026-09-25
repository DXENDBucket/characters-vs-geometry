import type { CardDefinition, CardId } from "../types";
import type { TowerState as Tower } from "./towerState";
import { syncTowerOccupancy } from "./towerOccupancy";
import { inFriendlyRange, syncTowerTopology } from "./towerTopology";
import { syncTowerCopies } from "./towerCopy";
import { towerFormType } from "./towerIdentity";
import { towerAuraSources } from "./towerAuras";
import { syncTowerDerivedStats, NO_TOWER_UPGRADE_PRESENTATION, type TowerUpgradePresentation } from "./towerUpgradeRules";
import { syncTowerHealthNetworks } from "./towerHealthRules";
import { MIRROR_COST_LIMIT } from "./towerMirrorRules";

interface LevelAuraTowerSignature {
  id: string;
  type: CardId;
  lane: number;
  column: number;
  level: number;
  transient: boolean;
  mirrorGroupId: number;
}

export interface TowerBoardRuntime<T extends Tower = Tower> {
  towers: T[];
  occupied: Map<string, T>;
  battleTime: number;
  getDefinition(id: CardId): CardDefinition;
  syncMirrorLevelBonuses(): void;
  settleHealth(): boolean;
  syncCircuits(): void;
}
export interface TowerBoardPresentation extends TowerUpgradePresentation {
  copy(tower: Tower, definition: CardDefinition, time: number): void;
  range(tower: Tower): void;
}
export const NO_TOWER_BOARD_PRESENTATION: TowerBoardPresentation = Object.freeze({
  ...NO_TOWER_UPGRADE_PRESENTATION, copy() {}, range() {}
});

export class TowerBoardSimulation<T extends Tower = Tower> {
  private levelBonusSnapshotTowers: T[] = [];
  private levelBonusSnapshotValues: number[] = [];
  private levelAuraCachedTowers: T[] = [];
  private levelAuraCachedStates: LevelAuraTowerSignature[] = [];
  private get towers() { return this.runtime().towers; }
  private get occupied() { return this.runtime().occupied; }
  private get battleTime() { return this.runtime().battleTime; }
  private getDefinition(id: CardId) { return this.runtime().getDefinition(id); }
  private readonly copyChanged = (tower: T, definition: CardDefinition) => this.presentation.copy(tower, definition, this.battleTime);
  constructor(private readonly runtime: () => TowerBoardRuntime<T>, public presentation: TowerBoardPresentation = NO_TOWER_BOARD_PRESENTATION) {}

  updateIfNeeded() {
    if (syncTowerTopology(this.towers) || this.levelAuraStateChanged()) {
      this.refresh();
    }
  }

  syncCopies() {
    syncTowerCopies({ towers: this.towers, occupied: this.occupied, battleTime: this.battleTime,
      getDefinition: id => this.getDefinition(id),
      onChanged: this.copyChanged });
  }

  refresh() {
    syncTowerOccupancy(this.towers, this.occupied);
    syncTowerTopology(this.towers);
    this.syncCopies();
    const snapshotTowers = this.levelBonusSnapshotTowers;
    const snapshotValues = this.levelBonusSnapshotValues;
    snapshotTowers.length = this.towers.length;
    snapshotValues.length = this.towers.length;

    for (let index = 0; index < this.towers.length; index += 1) {
      const tower = this.towers[index];
      snapshotTowers[index] = tower;
      snapshotValues[index] = tower.levelBonus + tower.mirrorLevelBonus;
      tower.levelBonus = 0;
    }

    for (const auraTower of this.towers) {
      if (auraTower.type !== "U") {
        continue;
      }

      for (const target of this.towers) {
        if (
          target === auraTower ||
          !inFriendlyRange(auraTower, target, 1)
        ) {
          continue;
        }

        const targetDefinition = this.getDefinition(target.type);
        if (targetDefinition.cost > MIRROR_COST_LIMIT) {
          continue;
        }

        target.levelBonus += auraTower.level;
      }
    }
    this.runtime().syncMirrorLevelBonuses();

    const auraSources = towerAuraSources(this.towers);
    for (let index = 0; index < this.towers.length; index += 1) {
      const tower = this.towers[index];
      if (snapshotTowers[index] !== tower || snapshotValues[index] !== tower.levelBonus + tower.mirrorLevelBonus) {
        this.presentation.level(tower);
      }

      syncTowerDerivedStats(tower, false, this.towers, auraSources, this.presentation);
      this.presentation.range(tower);
    }

    snapshotTowers.length = 0;
    snapshotValues.length = 0;
    syncTowerHealthNetworks(this.towers, this.presentation.health);
    if (this.runtime().settleHealth()) {
      this.refresh();
      return;
    }
    this.cacheLevelAuraState();
    this.runtime().syncCircuits();
  }

  private levelAuraStateChanged() {
    if (this.towers.length !== this.levelAuraCachedTowers.length) {
      return true;
    }

    for (let index = 0; index < this.towers.length; index += 1) {
      const tower = this.towers[index];
      const cached = this.levelAuraCachedStates[index];
      if (this.levelAuraCachedTowers[index] !== tower || !cached || !this.levelAuraTowerStateMatches(tower, cached)) {
        return true;
      }
    }
    return false;
  }

  private levelAuraTowerStateMatches(tower: T, cached: LevelAuraTowerSignature) {
    return (
      cached.id === tower.id &&
      cached.type === towerFormType(tower) &&
      cached.lane === tower.lane &&
      cached.column === tower.column &&
      cached.level === tower.level &&
      cached.transient === tower.transient &&
      cached.mirrorGroupId === (tower.mirrorGroupId ?? 0)
    );
  }

  private cacheLevelAuraState() {
    this.levelAuraCachedTowers.length = this.towers.length;
    this.levelAuraCachedStates.length = this.towers.length;
    for (let index = 0; index < this.towers.length; index += 1) {
      const tower = this.towers[index];
      const cached = this.levelAuraCachedStates[index] ?? this.createLevelAuraTowerState(tower);
      cached.id = tower.id;
      cached.type = towerFormType(tower);
      cached.lane = tower.lane;
      cached.column = tower.column;
      cached.level = tower.level;
      cached.transient = tower.transient;
      cached.mirrorGroupId = tower.mirrorGroupId ?? 0;
      this.levelAuraCachedTowers[index] = tower;
      this.levelAuraCachedStates[index] = cached;
    }
  }

  private createLevelAuraTowerState(tower: T): LevelAuraTowerSignature {
    return {
      id: tower.id,
      type: towerFormType(tower),
      lane: tower.lane,
      column: tower.column,
      level: tower.level,
      transient: tower.transient,
      mirrorGroupId: tower.mirrorGroupId ?? 0
    };
  }

}
