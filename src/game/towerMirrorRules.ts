import { syncTowerOccupancy, towerCellMembers, towerInPlacementLayer } from "./towerOccupancy";
import { logicalTowerCell, physicalTowerCell, towerCell, topologyKey } from "./towerTopology";
import { COLUMNS, LANES } from "../config";
import type { CardDefinition, CardId } from "../types";
import type { TowerState as Tower } from "./towerState";
import { forEachInitial, forEachSnapshot } from "./iteration";
import { isTargetedEffectCardId } from "./targetedEffectRules";
import { gridCellKey } from "./boardCells";
import { syncTowerDerivedStats, NO_TOWER_UPGRADE_PRESENTATION, type TowerUpgradePresentation } from "./towerUpgradeRules";
import { towerFacingDirection } from "./towerRules";

const MIRROR_CARD_ID: CardId = "m";
export const MIRROR_COST_LIMIT = 999;

export interface TowerMirrorRuntime<T extends Tower = Tower> {
  towers: T[];
  occupied: Map<string, T>;
  battleTime: number;
  getDefinition: (id: CardId) => CardDefinition;
  nextTowerOrder: () => number;
  isCellDeployable?: (lane: number, column: number) => boolean;
  createTargetedEffectMirror?: (source: T, target: T) => T | null;
  updateLevelAuras: () => void;
  createTower(definition: CardDefinition, lane: number, column: number, time: number, order: number): T;
}

type RemoveTower<T extends Tower> = (tower: T) => void;

export interface TowerMirrorShiftMove<T extends Tower = Tower> {
  tower: T;
  fromLane: number;
  fromColumn: number;
  toLane: number;
  toColumn: number;
}

export interface MirrorPresentation extends TowerUpgradePresentation {
  facing(tower: Tower): void;
  created(tower: Tower): void;
}
export const NO_MIRROR_PRESENTATION: MirrorPresentation = Object.freeze({
  ...NO_TOWER_UPGRADE_PRESENTATION, facing() {}, created() {}
});

export class TowerMirrorSimulation<T extends Tower = Tower> {
  private nextGroupId = 1;
  private removalDepth = 0;
  private syncing = false;
  private suppressedGroups = new Set<number>();
  private readonly adjacentGroupIdsBuffer = new Set<number>();
  private mirrorSyncSignature = "";
  private readonly mirrorSyncSignatureParts: string[] = [];

  constructor(private readonly runtime: () => TowerMirrorRuntime<T>, public presentation: MirrorPresentation = NO_MIRROR_PRESENTATION) {}

  snapshotNextGroupId() { return this.nextGroupId; }

  restoreGroups(nextGroupId = 1) {
    this.reset();
    this.nextGroupId = nextGroupId;
    for (const tower of this.runtime().towers) this.nextGroupId = Math.max(this.nextGroupId, (tower.mirrorGroupId ?? 0) + 1);
  }

  reset() {
    this.nextGroupId = 1;
    this.removalDepth = 0;
    this.syncing = false;
    this.suppressedGroups.clear();
    this.mirrorSyncSignature = "";
    this.mirrorSyncSignatureParts.length = 0;
  }

  syncMirrors() {
    if (this.syncing || this.removalDepth > 0) {
      return;
    }

    const runtime = this.runtime();
    const signature = this.mirrorStateSignature(runtime);
    if (signature === this.mirrorSyncSignature) {
      return;
    }

    this.syncing = true;
    try {
      forEachInitial(runtime.towers, (anchor) => {
        if (anchor.type !== MIRROR_CARD_ID || anchor.transient || !anchor.inPlay) {
          return;
        }

        this.syncMirrorAxis(runtime, anchor, 0, 1);
        this.syncMirrorAxis(runtime, anchor, 1, 0);
      });
    } finally {
      this.syncing = false;
      this.mirrorSyncSignature = this.mirrorStateSignature(runtime);
    }
  }

  mirrorGroupFor(tower: T) {
    const runtime = this.runtime();
    const groupId = tower.mirrorGroupId;
    if (!groupId) {
      return [tower];
    }

    const group = runtime.towers
      .filter((candidate) => candidate.mirrorGroupId === groupId)
      .sort((a, b) => a.placedOrder - b.placedOrder);
    return group.length > 0 ? group : [tower];
  }

  runMirrorGroupEvent(tower: T, action: (tower: T) => void) {
    const groupId = tower.mirrorGroupId;
    if (!groupId) {
      action(tower);
      this.syncMirrors();
      return;
    }

    const group = this.mirrorGroupFor(tower);
    this.suppressedGroups.add(groupId);
    try {
      for (const member of group) {
        if (member.inPlay) {
          action(member);
        }
      }
    } finally {
      this.suppressedGroups.delete(groupId);
      this.syncMirrors();
    }
  }

  syncMirrorLevelBonuses() {
    const runtime = this.runtime();
    for (const tower of runtime.towers) {
      if (tower.mirrorLevelBonus !== 0) {
        tower.mirrorLevelBonus = 0;
      }
    }

    const groupIds = this.adjacentGroupIdsBuffer;
    for (const anchor of runtime.towers) {
      if (anchor.type !== MIRROR_CARD_ID || anchor.transient) {
        continue;
      }

      const bonus = Math.max(0, anchor.level - 1);
      if (bonus <= 0) {
        continue;
      }

      groupIds.clear();
      this.collectAdjacentMirrorGroupIds(runtime, anchor, groupIds);
      if (groupIds.size === 0) {
        continue;
      }

      for (const member of runtime.towers) {
        if (member.mirrorGroupId && groupIds.has(member.mirrorGroupId)) {
          member.mirrorLevelBonus += bonus;
        }
      }
    }
    groupIds.clear();
  }

  handleTowerRemoved(tower: T, removeTower: RemoveTower<T>) {
    this.removalDepth += 1;
    try {
      if (tower.type === MIRROR_CARD_ID) {
        this.removeAdjacentMirrorNetworks(tower, removeTower);
      }

      const groupId = tower.mirrorGroupId;
      if (groupId && !this.suppressedGroups.has(groupId)) {
        this.suppressedGroups.add(groupId);
        try {
          forEachSnapshot(this.runtime().towers, (member) => {
            if (member.mirrorGroupId === groupId) {
              removeTower(member);
            }
          });
        } finally {
          this.suppressedGroups.delete(groupId);
        }
      }
    } finally {
      this.removalDepth -= 1;
      if (this.removalDepth === 0 && this.suppressedGroups.size === 0) {
        this.syncMirrors();
      }
    }
  }

  handleTowersShifted(moves: TowerMirrorShiftMove<T>[], removeTower: RemoveTower<T>) {
    const impact = this.mirrorShiftImpact(moves);
    if (impact.groupIds.size === 0) {
      this.syncMirrors();
      return;
    }

    this.syncing = true;
    try {
      this.rebuildShiftedMirrorGroups(impact.groupIds, impact.detachedTowers, removeTower);
    } finally {
      this.syncing = false;
    }

    this.syncMirrors();
    this.runtime().updateLevelAuras();
  }

  private syncMirrorAxis(runtime: TowerMirrorRuntime<T>, anchor: T, laneDelta: number, columnDelta: number) {
    const origin = towerCell(anchor);
    const first = physicalTowerCell(anchor, { lane: origin.lane - laneDelta, column: origin.column - columnDelta });
    const second = physicalTowerCell(anchor, { lane: origin.lane + laneDelta, column: origin.column + columnDelta });
    if (!this.cellIsDeployable(runtime, first.lane, first.column) || !this.cellIsDeployable(runtime, second.lane, second.column)) {
      return;
    }

    const firstTower = runtime.occupied.get(gridCellKey(first.lane, first.column));
    const secondTower = runtime.occupied.get(gridCellKey(second.lane, second.column));
    this.syncTargetedEffectMirrors(runtime, first, secondTower);
    this.syncTargetedEffectMirrors(runtime, second, firstTower);

    for (const type of ["A", "()"] as const) {
      const a = towerInPlacementLayer(runtime.occupied, first.lane, first.column, type);
      const b = towerInPlacementLayer(runtime.occupied, second.lane, second.column, type);
      if (a && !b && this.canMirrorTowerSource(runtime, a)) this.createMirrorTower(runtime, a, second.lane, second.column);
      else if (b && !a && this.canMirrorTowerSource(runtime, b)) this.createMirrorTower(runtime, b, first.lane, first.column);
    }
  }

  private createMirrorTower(runtime: TowerMirrorRuntime<T>, source: T, lane: number, column: number) {
    if (
      !this.cellIsDeployable(runtime, lane, column) ||
      towerInPlacementLayer(runtime.occupied, lane, column, source.type) ||
      !this.canMirrorTowerSource(runtime, source)
    ) {
      return null;
    }

    const definition = runtime.getDefinition(source.type);
    const mirror = runtime.createTower(definition, lane, column, runtime.battleTime, runtime.nextTowerOrder());
    mirror.level = source.level;
    mirror.facingDirection = towerFacingDirection(source);
    this.presentation.facing(mirror);
    this.presentation.level(mirror);

    runtime.towers.push(mirror);
    syncTowerOccupancy(runtime.towers, runtime.occupied);
    this.linkMirrors(runtime, source, mirror);
    syncTowerDerivedStats(mirror, true, runtime.towers, undefined, this.presentation);
    runtime.updateLevelAuras();

    this.presentation.created(mirror);
    return mirror;
  }

  private linkMirrors(runtime: TowerMirrorRuntime<T>, first: T, second: T) {
    const firstGroupId = first.mirrorGroupId;
    const secondGroupId = second.mirrorGroupId;
    const nextGroupId = firstGroupId ?? secondGroupId ?? this.nextGroupId++;

    if (firstGroupId && secondGroupId && firstGroupId !== secondGroupId) {
      for (const member of runtime.towers) {
        if (member.mirrorGroupId === secondGroupId) {
          member.mirrorGroupId = nextGroupId;
        }
      }
    }

    first.mirrorGroupId = nextGroupId;
    second.mirrorGroupId = nextGroupId;
  }

  private mirrorShiftImpact(moves: TowerMirrorShiftMove<T>[]) {
    const runtime = this.runtime();
    const groupIds = new Set<number>();
    const detachedTowers = new Set<T>();
    for (const move of moves) {
      if (move.tower.mirrorGroupId) {
        groupIds.add(move.tower.mirrorGroupId);
      }

      if (move.tower.type !== MIRROR_CARD_ID) {
        continue;
      }

      for (const tower of this.adjacentMirrorTowersAt(move.fromLane, move.fromColumn)) {
        if (tower.mirrorGroupId) {
          groupIds.add(tower.mirrorGroupId);
          detachedTowers.add(tower);
        }
      }
      for (const tower of this.adjacentMirrorTowersAt(move.toLane, move.toColumn)) {
        if (tower.mirrorGroupId) {
          groupIds.add(tower.mirrorGroupId);
        }
      }
    }

    for (const groupId of groupIds) {
      if (!runtime.towers.some((tower) => tower.mirrorGroupId === groupId)) {
        groupIds.delete(groupId);
      }
    }
    return { groupIds, detachedTowers };
  }

  private rebuildShiftedMirrorGroups(affectedGroupIds: Set<number>, detachedTowers: Set<T>, removeTower: RemoveTower<T>) {
    const runtime = this.runtime();
    const members = runtime.towers.filter((tower) => tower.mirrorGroupId && affectedGroupIds.has(tower.mirrorGroupId));
    if (members.length === 0) {
      return;
    }

    const memberSet = new Set(members);
    const edges = new Map<T, Set<T>>();
    for (const member of members) {
      edges.set(member, new Set());
    }

    for (const anchor of runtime.towers) {
      if (anchor.type !== MIRROR_CARD_ID || anchor.transient) {
        continue;
      }

      this.addMirrorSupportEdge(runtime, anchor, 0, 1, memberSet, edges);
      this.addMirrorSupportEdge(runtime, anchor, 1, 0, memberSet, edges);
    }

    const validMembers = new Set<T>();
    const visited = new Set<T>();
    for (const member of members) {
      if (visited.has(member)) {
        continue;
      }

      const component = this.connectedMirrorComponent(member, edges, visited);
      if (component.length < 2 || component.some((tower) => detachedTowers.has(tower))) {
        continue;
      }

      const groupId = this.nextGroupId++;
      for (const tower of component) {
        tower.mirrorGroupId = groupId;
        validMembers.add(tower);
      }
    }

    for (const member of members) {
      if (validMembers.has(member) || !member.inPlay) {
        continue;
      }

      member.mirrorGroupId = undefined;
      member.mirrorLevelBonus = 0;
      this.presentation.level(member);
      removeTower(member);
    }
  }

  private addMirrorSupportEdge(
    runtime: TowerMirrorRuntime<T>,
    anchor: T,
    laneDelta: number,
    columnDelta: number,
    memberSet: Set<T>,
    edges: Map<T, Set<T>>
  ) {
    const origin = towerCell(anchor);
    const firstCell = physicalTowerCell(anchor, { lane: origin.lane - laneDelta, column: origin.column - columnDelta });
    const secondCell = physicalTowerCell(anchor, { lane: origin.lane + laneDelta, column: origin.column + columnDelta });
    for (const layer of ["A", "()"] as const) {
      const first = towerInPlacementLayer(runtime.occupied, firstCell.lane, firstCell.column, layer);
      const second = towerInPlacementLayer(runtime.occupied, secondCell.lane, secondCell.column, layer);
      if (!first || !second || first === second || first.type !== second.type ||
          first.mirrorGroupId !== second.mirrorGroupId || !memberSet.has(first) || !memberSet.has(second)) continue;
      edges.get(first)?.add(second);
      edges.get(second)?.add(first);
    }
  }

  private connectedMirrorComponent(start: T, edges: Map<T, Set<T>>, visited: Set<T>) {
    const component: T[] = [];
    const pending = [start];
    visited.add(start);

    while (pending.length > 0) {
      const tower = pending.pop()!;
      component.push(tower);
      for (const neighbor of edges.get(tower) ?? []) {
        if (visited.has(neighbor)) {
          continue;
        }

        visited.add(neighbor);
        pending.push(neighbor);
      }
    }

    return component;
  }

  private syncTargetedEffectMirrors(
    runtime: TowerMirrorRuntime<T>,
    sourceCell: { lane: number; column: number },
    target: T | undefined
  ) {
    if (!target || target.transient || !target.inPlay || !runtime.createTargetedEffectMirror) {
      return;
    }

    for (const source of this.targetedEffectSourcesAt(runtime, sourceCell.lane, sourceCell.column)) {
      if (!this.canMirrorTargetedEffectSource(runtime, source) || this.targetedEffectMirrorExists(runtime, source, target)) {
        continue;
      }

      const mirror = runtime.createTargetedEffectMirror(source, target);
      if (mirror) {
        this.linkMirrors(runtime, source, mirror);
      }
    }
  }

  private targetedEffectSourcesAt(runtime: TowerMirrorRuntime<T>, lane: number, column: number) {
    return runtime.towers.filter((tower) => {
      return tower.transient && tower.lane === lane && tower.column === column && isTargetedEffectCardId(tower.type);
    });
  }

  private targetedEffectMirrorExists(runtime: TowerMirrorRuntime<T>, source: T, target: T) {
    return runtime.towers.some((tower) => {
      return (
        tower.transient &&
        tower.type === source.type &&
        tower.lane === target.lane &&
        tower.column === target.column &&
        tower.turnTargetId === target.id &&
        Boolean(source.mirrorGroupId) &&
        tower.mirrorGroupId === source.mirrorGroupId
      );
    });
  }

  private canMirrorTowerSource(runtime: TowerMirrorRuntime<T>, tower: T) {
    return !tower.transient && this.canMirrorCardSource(runtime, tower);
  }

  private canMirrorTargetedEffectSource(runtime: TowerMirrorRuntime<T>, tower: T) {
    return tower.transient && isTargetedEffectCardId(tower.type) && this.canMirrorCardSource(runtime, tower);
  }

  private canMirrorCardSource(runtime: TowerMirrorRuntime<T>, tower: T) {
    if (tower.type === MIRROR_CARD_ID || !tower.inPlay) {
      return false;
    }

    return runtime.getDefinition(tower.type).cost <= MIRROR_COST_LIMIT;
  }

  private removeAdjacentMirrorNetworks(anchor: T, removeTower: RemoveTower<T>) {
    const removedGroups = new Set<number>();
    for (const tower of this.adjacentMirrorTowers(anchor)) {
      const groupId = tower.mirrorGroupId;
      if (!groupId || removedGroups.has(groupId) || !tower.inPlay) {
        continue;
      }

      removedGroups.add(groupId);
      removeTower(tower);
    }
  }

  private collectAdjacentMirrorGroupIds(runtime: TowerMirrorRuntime<T>, anchor: T, groupIds: Set<number>) {
    const origin = towerCell(anchor);
    for (const [dl, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const cell = physicalTowerCell(anchor, { lane: origin.lane + dl, column: origin.column + dc });
      this.addAdjacentMirrorGroupId(runtime, groupIds, cell.lane, cell.column);
    }
  }

  private addAdjacentMirrorGroupId(runtime: TowerMirrorRuntime<T>, groupIds: Set<number>, lane: number, column: number) {
    if (!this.cellIsDeployable(runtime, lane, column)) {
      return;
    }

    for (const tower of towerCellMembers(runtime.occupied.get(gridCellKey(lane, column)))) {
      if (tower.mirrorGroupId) groupIds.add(tower.mirrorGroupId);
    }
  }

  private adjacentMirrorTowers(anchor: T) {
    return this.adjacentMirrorTowersAt(anchor.lane, anchor.column);
  }

  private adjacentMirrorTowersAt(lane: number, column: number) {
    const runtime = this.runtime();
    const towers: T[] = [];
    const anchor = runtime.towers[0];
    const origin = anchor ? logicalTowerCell(anchor, { lane, column }) : { lane, column };
    for (const [dl, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const logical = { lane: origin.lane + dl, column: origin.column + dc };
      const cell = anchor ? physicalTowerCell(anchor, logical) : logical;
      this.addAdjacentMirrorTower(runtime, towers, cell.lane, cell.column);
    }
    return towers;
  }

  private addAdjacentMirrorTower(runtime: TowerMirrorRuntime<T>, towers: T[], lane: number, column: number) {
    if (!this.cellIsDeployable(runtime, lane, column)) {
      return;
    }

    for (const tower of towerCellMembers(runtime.occupied.get(gridCellKey(lane, column)))) {
      if (tower.mirrorGroupId) towers.push(tower);
    }
  }

  private cellIsDeployable(runtime: TowerMirrorRuntime<T>, lane: number, column: number) {
    return (
      lane >= 0 &&
      lane < LANES &&
      column >= 0 &&
      column < COLUMNS &&
      (runtime.isCellDeployable?.(lane, column) ?? true)
    );
  }

  private mirrorStateSignature(runtime: TowerMirrorRuntime<T>) {
    const parts = this.mirrorSyncSignatureParts;
    parts.length = 0;
    parts.push(`${runtime.towers.length}`);
    if (runtime.towers[0]) parts.push(topologyKey(runtime.towers[0]));
    for (const tower of runtime.towers) {
      parts.push(
        tower.id,
        tower.type,
        `${tower.lane}`,
        `${tower.column}`,
        `${tower.level}`,
        `${tower.transient ? 1 : 0}`,
        `${tower.inPlay ? 1 : 0}`,
        `${tower.mirrorGroupId ?? 0}`
      );
    }
    return parts.join("|");
  }
}
