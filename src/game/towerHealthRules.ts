import type { TowerHealthPool as HealthPool } from "../types";
import type { TowerState as Tower } from "./towerState";
import { towerCell } from "./towerTopology";

type TowerHealthPool = HealthPool<Tower>;
export type TowerHealthObserver = (tower: Tower) => void;

function ratio(hp: number, maxHp: number) {
  return maxHp > 0 ? Math.min(1, hp / maxHp) : 0;
}

export function towerMinimumHealth(tower: Tower) {
  const pool = tower.healthPool;
  if (pool) {
    return -pool.members.reduce((sum, member) =>
      sum + member.baseStats.maxHp * (member.unyieldingRatio ?? 0), 0
    ) / pool.linkCount;
  }
  return -tower.baseStats.maxHp * (tower.unyieldingRatio ?? 0);
}

export function towerHealthDepleted(tower: Tower) {
  return (tower.healthPool?.hp ?? tower.hp) <= towerMinimumHealth(tower);
}


function syncPool(pool: TowerHealthPool, changed?: TowerHealthObserver) {
  const fraction = ratio(pool.hp, pool.maxHp);
  for (const member of pool.members) {
    member.hp = member.finalStats.maxHp * fraction;
    changed?.(member);
  }
}

export function changeTowerHealth(tower: Tower, amount: number, changed?: TowerHealthObserver) {
  const pool = tower.healthPool;
  if (pool) {
    const before = pool.hp;
    pool.hp = Math.max(Math.min(pool.hp, towerMinimumHealth(tower)), Math.min(pool.maxHp, pool.hp + amount));
    syncPool(pool, changed);
    return pool.hp - before;
  }
  const before = tower.hp;
  tower.hp = Math.max(Math.min(tower.hp, towerMinimumHealth(tower)), Math.min(tower.finalStats.maxHp, tower.hp + amount));
  changed?.(tower);
  return tower.hp - before;
}

export function syncTowerHealthCapacity(tower: Tower, previousMaxHp: number, healIncrease: boolean, changed?: TowerHealthObserver) {
  const pool = tower.healthPool;
  const delta = tower.finalStats.maxHp - previousMaxHp;
  if (pool) {
    if (delta === 0) return;
    pool.maxHp += delta / pool.linkCount;
    pool.hp = Math.min(pool.maxHp, pool.hp + (healIncrease ? Math.max(0, delta) / pool.linkCount : 0));
    syncPool(pool, changed);
  } else {
    tower.hp = Math.min(tower.finalStats.maxHp, tower.hp + (healIncrease ? Math.max(0, delta) : 0));
  }
}

// Rebuild only after topology changes. Old pools remain snapshots until every
// new component is calculated, so a split cannot influence a later merge.
export function syncTowerHealthNetworks(towers: Tower[], changed?: TowerHealthObserver) {
  if (!towers.some(tower => tower.healthPool || (tower.inPlay && tower.type === "u"))) return;
  const active = towers.filter(tower => tower.inPlay && !tower.transient);
  const cells = new Map<string, Tower[]>();
  for (const tower of active) {
    const cell = towerCell(tower), key = `${cell.lane}:${cell.column}`;
    const members = cells.get(key) ?? []; members.push(tower); cells.set(key, members);
  }
  const edges = new Map<Tower, Tower[]>();
  const add = (a: Tower, b: Tower) => {
    const neighbors = edges.get(a) ?? [];
    neighbors.push(b);
    edges.set(a, neighbors);
  };
  for (const tower of active) {
    if (tower.type !== "u") continue;
    if (!edges.has(tower)) edges.set(tower, []);
    const cell = towerCell(tower);
    for (const [dl, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      for (const neighbor of cells.get(`${cell.lane + dl}:${cell.column + dc}`) ?? []) {
        add(tower, neighbor);
        add(neighbor, tower);
      }
    }
  }

  const seen = new Set<Tower>();
  const nextPools: TowerHealthPool[] = [];
  for (const start of edges.keys()) {
    if (seen.has(start)) continue;
    const members: Tower[] = [];
    const pending = [start];
    seen.add(start);
    while (pending.length) {
      const member = pending.pop()!;
      members.push(member);
      for (const neighbor of edges.get(member) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    const oldPools = new Set(members.flatMap(member => member.healthPool ? [member.healthPool] : []));
    let previousHp = 0;
    let previousMax = 0;
    if (oldPools.size) {
      for (const pool of oldPools) {
        previousHp += pool.hp;
        previousMax += pool.maxHp;
      }
    } else {
      for (const member of members) {
        previousHp += member.hp;
        previousMax += member.finalStats.maxHp;
      }
    }
    const linkCount = members.filter(member => member.type === "u").length;
    const maxHp = members.reduce((sum, member) => sum + member.finalStats.maxHp, 0) / linkCount;
    nextPools.push({ members, maxHp, hp: maxHp * ratio(previousHp, previousMax), linkCount });
  }

  const oldPools = new Set(towers.flatMap(tower => tower.healthPool ? [tower.healthPool] : []));
  for (const pool of oldPools) {
    syncPool(pool, changed);
    for (const member of pool.members) member.healthPool = undefined;
  }
  for (const pool of nextPools) {
    for (const member of pool.members) member.healthPool = pool;
    syncPool(pool, changed);
  }
}
