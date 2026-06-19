import Phaser from "phaser";
import { COLUMNS, LANES } from "../config";
import type { CardDefinition, CardId, Tower } from "../types";
import { forEachSnapshot } from "./iteration";
import { gridCellKey } from "./targeting";
import {
  createTower,
  setTowerFacing,
  syncTowerDerivedStats,
  syncTowerLevelText,
  towerFacingDirection
} from "./towers";

const MIRROR_CARD_ID: CardId = "m";
export const MIRROR_COST_LIMIT = 999;

export interface TowerMirrorRuntime {
  scene: Phaser.Scene;
  towers: Tower[];
  occupied: Map<string, Tower>;
  battleTime: number;
  getDefinition: (id: CardId) => CardDefinition;
  nextTowerOrder: () => number;
  isCellDeployable?: (lane: number, column: number) => boolean;
  updateLevelAuras: () => void;
}

type RemoveTower = (tower: Tower) => void;

export interface TowerMirrorShiftMove {
  tower: Tower;
  fromLane: number;
  fromColumn: number;
  toLane: number;
  toColumn: number;
}

export class TowerMirrorController {
  private nextGroupId = 1;
  private removalDepth = 0;
  private syncing = false;
  private suppressedGroups = new Set<number>();

  constructor(private readonly runtime: () => TowerMirrorRuntime) {}

  reset() {
    this.nextGroupId = 1;
    this.removalDepth = 0;
    this.syncing = false;
    this.suppressedGroups.clear();
  }

  syncMirrors() {
    if (this.syncing || this.removalDepth > 0) {
      return;
    }

    const runtime = this.runtime();
    this.syncing = true;
    try {
      forEachSnapshot(runtime.towers, (anchor) => {
        if (anchor.type !== MIRROR_CARD_ID || anchor.transient || !anchor.inPlay) {
          return;
        }

        this.syncMirrorAxis(anchor, 0, 1);
        this.syncMirrorAxis(anchor, 1, 0);
      });
    } finally {
      this.syncing = false;
    }
  }

  mirrorGroupFor(tower: Tower) {
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

  runMirrorGroupEvent(tower: Tower, action: (tower: Tower) => void) {
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
      tower.mirrorLevelBonus = 0;
    }

    for (const anchor of runtime.towers) {
      if (anchor.type !== MIRROR_CARD_ID || anchor.transient) {
        continue;
      }

      const bonus = Math.max(0, anchor.level - 1);
      if (bonus <= 0) {
        continue;
      }

      const groupIds = this.adjacentMirrorGroupIds(anchor);
      for (const member of runtime.towers) {
        if (member.mirrorGroupId && groupIds.has(member.mirrorGroupId)) {
          member.mirrorLevelBonus += bonus;
        }
      }
    }
  }

  handleTowerRemoved(tower: Tower, removeTower: RemoveTower) {
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
      if (this.removalDepth === 0) {
        this.syncMirrors();
      }
    }
  }

  handleTowersShifted(moves: TowerMirrorShiftMove[], removeTower: RemoveTower) {
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

  private syncMirrorAxis(anchor: Tower, laneDelta: number, columnDelta: number) {
    const first = { lane: anchor.lane - laneDelta, column: anchor.column - columnDelta };
    const second = { lane: anchor.lane + laneDelta, column: anchor.column + columnDelta };
    if (!this.cellIsDeployable(first.lane, first.column) || !this.cellIsDeployable(second.lane, second.column)) {
      return;
    }

    const runtime = this.runtime();
    const firstTower = runtime.occupied.get(gridCellKey(first.lane, first.column));
    const secondTower = runtime.occupied.get(gridCellKey(second.lane, second.column));
    if (firstTower && !secondTower && this.canMirrorSource(firstTower)) {
      this.createMirrorTower(firstTower, second.lane, second.column);
      return;
    }

    if (secondTower && !firstTower && this.canMirrorSource(secondTower)) {
      this.createMirrorTower(secondTower, first.lane, first.column);
    }
  }

  private createMirrorTower(source: Tower, lane: number, column: number) {
    const runtime = this.runtime();
    if (
      !this.cellIsDeployable(lane, column) ||
      runtime.occupied.has(gridCellKey(lane, column)) ||
      !this.canMirrorSource(source)
    ) {
      return null;
    }

    const definition = runtime.getDefinition(source.type);
    const mirror = createTower(runtime.scene, definition, lane, column, runtime.battleTime, runtime.nextTowerOrder());
    mirror.level = source.level;
    setTowerFacing(mirror, towerFacingDirection(source));
    syncTowerLevelText(mirror);

    runtime.towers.push(mirror);
    runtime.occupied.set(gridCellKey(lane, column), mirror);
    this.linkMirrors(source, mirror);
    syncTowerDerivedStats(mirror, true, runtime.towers);
    runtime.updateLevelAuras();

    mirror.body.setAlpha(0.45);
    mirror.body.setScale(0.86);
    runtime.scene.tweens.add({
      targets: mirror.body,
      alpha: 1,
      scale: 1,
      duration: 140,
      ease: "Quad.easeOut"
    });
    return mirror;
  }

  private linkMirrors(first: Tower, second: Tower) {
    const firstGroupId = first.mirrorGroupId;
    const secondGroupId = second.mirrorGroupId;
    const nextGroupId = firstGroupId ?? secondGroupId ?? this.nextGroupId++;

    if (firstGroupId && secondGroupId && firstGroupId !== secondGroupId) {
      for (const member of this.runtime().towers) {
        if (member.mirrorGroupId === secondGroupId) {
          member.mirrorGroupId = nextGroupId;
        }
      }
    }

    first.mirrorGroupId = nextGroupId;
    second.mirrorGroupId = nextGroupId;
  }

  private mirrorShiftImpact(moves: TowerMirrorShiftMove[]) {
    const runtime = this.runtime();
    const groupIds = new Set<number>();
    const detachedTowers = new Set<Tower>();
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

  private rebuildShiftedMirrorGroups(affectedGroupIds: Set<number>, detachedTowers: Set<Tower>, removeTower: RemoveTower) {
    const runtime = this.runtime();
    const members = runtime.towers.filter((tower) => tower.mirrorGroupId && affectedGroupIds.has(tower.mirrorGroupId));
    if (members.length === 0) {
      return;
    }

    const memberSet = new Set(members);
    const edges = new Map<Tower, Set<Tower>>();
    for (const member of members) {
      edges.set(member, new Set());
    }

    for (const anchor of runtime.towers) {
      if (anchor.type !== MIRROR_CARD_ID || anchor.transient) {
        continue;
      }

      this.addMirrorSupportEdge(anchor, 0, 1, memberSet, edges);
      this.addMirrorSupportEdge(anchor, 1, 0, memberSet, edges);
    }

    const validMembers = new Set<Tower>();
    const visited = new Set<Tower>();
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
      syncTowerLevelText(member);
      removeTower(member);
    }
  }

  private addMirrorSupportEdge(
    anchor: Tower,
    laneDelta: number,
    columnDelta: number,
    memberSet: Set<Tower>,
    edges: Map<Tower, Set<Tower>>
  ) {
    const first = this.runtime().occupied.get(gridCellKey(anchor.lane - laneDelta, anchor.column - columnDelta));
    const second = this.runtime().occupied.get(gridCellKey(anchor.lane + laneDelta, anchor.column + columnDelta));
    if (
      !first ||
      !second ||
      first === second ||
      first.type !== second.type ||
      first.mirrorGroupId !== second.mirrorGroupId ||
      !memberSet.has(first) ||
      !memberSet.has(second)
    ) {
      return;
    }

    edges.get(first)?.add(second);
    edges.get(second)?.add(first);
  }

  private connectedMirrorComponent(start: Tower, edges: Map<Tower, Set<Tower>>, visited: Set<Tower>) {
    const component: Tower[] = [];
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

  private canMirrorSource(tower: Tower) {
    if (tower.transient || tower.type === MIRROR_CARD_ID || !tower.inPlay) {
      return false;
    }

    return this.runtime().getDefinition(tower.type).cost <= MIRROR_COST_LIMIT;
  }

  private removeAdjacentMirrorNetworks(anchor: Tower, removeTower: RemoveTower) {
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

  private adjacentMirrorGroupIds(anchor: Tower) {
    const groupIds = new Set<number>();
    for (const tower of this.adjacentMirrorTowers(anchor)) {
      if (tower.mirrorGroupId) {
        groupIds.add(tower.mirrorGroupId);
      }
    }
    return groupIds;
  }

  private adjacentMirrorTowers(anchor: Tower) {
    return this.adjacentMirrorTowersAt(anchor.lane, anchor.column);
  }

  private adjacentMirrorTowersAt(lane: number, column: number) {
    const runtime = this.runtime();
    const towers: Tower[] = [];
    this.addAdjacentMirrorTower(runtime, towers, lane, column - 1);
    this.addAdjacentMirrorTower(runtime, towers, lane, column + 1);
    this.addAdjacentMirrorTower(runtime, towers, lane - 1, column);
    this.addAdjacentMirrorTower(runtime, towers, lane + 1, column);
    return towers;
  }

  private addAdjacentMirrorTower(runtime: TowerMirrorRuntime, towers: Tower[], lane: number, column: number) {
    if (!this.cellIsDeployable(lane, column)) {
      return;
    }

    const tower = runtime.occupied.get(gridCellKey(lane, column));
    if (tower?.mirrorGroupId) {
      towers.push(tower);
    }
  }

  private cellIsDeployable(lane: number, column: number) {
    return (
      lane >= 0 &&
      lane < LANES &&
      column >= 0 &&
      column < COLUMNS &&
      (this.runtime().isCellDeployable?.(lane, column) ?? true)
    );
  }
}
