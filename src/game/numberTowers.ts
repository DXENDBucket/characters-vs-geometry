import type { CardDefinition, CardId, Tower } from "../types";
import type { TowerActionEvent, ImitationBehavior } from "./towerActions";
import { isNumberTower, towerActionContext, towerFormType } from "./towerIdentity";
import { towerCell } from "./towerTopology";

export interface NumberTowerRuntime {
  towers: Tower[];
  getDefinition: (id: CardId) => CardDefinition;
  imitate: (tower: Tower, behavior: ImitationBehavior, event: TowerActionEvent) => void;
}

export class NumberTowerController {
  private plusPartners = new Map<Tower, Tower[]>();
  constructor(private readonly runtime: () => NumberTowerRuntime) {}

  sync() {
    const { towers, getDefinition } = this.runtime();
    this.plusPartners.clear();
    const numbers = towers.filter(tower => tower.inPlay && !tower.transient && isNumberTower(tower) && getDefinition(tower.type).cost <= 999);
    if (!numbers.length) return;
    const liveIds = new Set(towers.filter(tower => tower.inPlay).map(tower => tower.id));
    const cells = new Map<string, Tower[]>();
    for (const tower of towers) {
      if (!tower.inPlay) continue;
      const cell = towerCell(tower);
      const key = `${cell.lane}:${cell.column}`;
      const occupants = cells.get(key) ?? [];
      occupants.push(tower); cells.set(key, occupants);
    }
    const numberSet = new Set(numbers);
    const neighbors = new Map<Tower, Set<Tower>>();
    const plusNeighbors = new Map<Tower, Set<Tower>>();
    const operand = (tower: Tower) => getDefinition(tower.type).cost <= 999 && !["=", "+"].includes(towerFormType(tower));
    const connect = (a: Tower, b: Tower) => {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    };
    const learn = (number: Tower, type: CardId, ids: string[]) => {
      const memories = number.numberMemory ??= [];
      let entry = memories.find(entry => entry.type === type);
      if (!entry) { entry = { type, sourceIds: [], count: 0 }; memories.push(entry); }
      for (const id of ids) if (liveIds.has(id) && !entry.sourceIds.includes(id)) entry.sourceIds.push(id);
    };
    for (const number of numbers) {
      for (const entry of number.numberMemory ?? []) entry.sourceIds = entry.sourceIds.filter(id => liveIds.has(id));
    }
    for (const connector of towers) {
      const operator = towerFormType(connector);
      if (!connector.inPlay || connector.transient || (operator !== "=" && operator !== "+")) continue;
      const cell = towerCell(connector);
      for (const [dl, dc] of [[1, 0], [0, 1]]) {
        const a = cells.get(`${cell.lane + dl}:${cell.column + dc}`) ?? [];
        const b = cells.get(`${cell.lane - dl}:${cell.column - dc}`) ?? [];
        for (const left of a) for (const right of b) {
          if (!operand(left) || !operand(right)) continue;
          connect(left, right);
          if (operator === "+") {
            if (!plusNeighbors.has(left)) plusNeighbors.set(left, new Set());
            if (!plusNeighbors.has(right)) plusNeighbors.set(right, new Set());
            plusNeighbors.get(left)!.add(right); plusNeighbors.get(right)!.add(left);
          }
        }
      }
    }
    const plusSeen = new Set<Tower>();
    for (const start of plusNeighbors.keys()) {
      if (plusSeen.has(start)) continue;
      const group: Tower[] = [], pending = [start]; plusSeen.add(start);
      while (pending.length) {
        const member = pending.pop()!; group.push(member);
        for (const next of plusNeighbors.get(member) ?? []) if (!plusSeen.has(next)) { plusSeen.add(next); pending.push(next); }
      }
      for (const member of group) this.plusPartners.set(member, group);
    }
    // Ordinary towers also bridge equations, e.g. A=E=1. Traverse each entire
    // component once, sharing source memories but never action counters.
    const seen = new Set<Tower>();
    for (const number of numbers) {
      if (seen.has(number)) continue;
      const group: Tower[] = [], pending = [number];
      seen.add(number);
      while (pending.length) {
        const member = pending.pop()!; group.push(member);
        for (const next of neighbors.get(member) ?? []) if (!seen.has(next)) { seen.add(next); pending.push(next); }
      }
      const memories = new Map<CardId, Set<string>>();
      const remember = (type: CardId, sourceIds: string[]) => {
        const ids = memories.get(type) ?? new Set<string>();
        for (const id of sourceIds) ids.add(id);
        memories.set(type, ids);
      };
      for (const member of group) {
        if (numberSet.has(member)) {
          for (const entry of member.numberMemory ?? []) remember(entry.type, entry.sourceIds);
        } else if (getDefinition(member.type).cost <= 999) {
          remember(towerFormType(member), [member.id]);
        }
      }
      for (const member of group) if (numberSet.has(member)) {
        for (const [type, ids] of memories) learn(member, type, [...ids]);
      }
    }
  }

  record(source: Tower, event: TowerActionEvent) {
    if (towerActionContext(source) || isNumberTower(source)) return;
    const runtime = this.runtime();
    const type = towerFormType(source);
    if (runtime.getDefinition(source.type).cost > 999) return;
    for (const tower of runtime.towers) {
      if (!tower.inPlay || tower.transient || !isNumberTower(tower) || runtime.getDefinition(tower.type).cost > 999) continue;
      for (const entry of tower.numberMemory ?? []) {
        const native = entry.type === type && entry.sourceIds.includes(source.id);
        const shared = this.plusPartners.get(source)?.some(partner => !isNumberTower(partner) &&
          entry.type === towerFormType(partner) && entry.sourceIds.includes(partner.id));
        if (!native && !shared) continue;
        entry.count += 1;
        const n = Math.max(1, Math.floor(tower.level));
        if (entry.count < n) continue;
        entry.count = 0;
        runtime.imitate(tower, { type: entry.type, level: n }, native || event.kind === "combined" ? event : { kind: "combined", original: event });
      }
    }
  }
}
