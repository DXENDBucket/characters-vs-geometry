import type { CardDefinition, CardId, Tower } from "../types";
import type { TowerActionEvent, ImitationBehavior } from "./towerActions";
import { isNumberTower, towerActionContext, towerFormType } from "./towerIdentity";

export interface NumberTowerRuntime {
  towers: Tower[];
  getDefinition: (id: CardId) => CardDefinition;
  imitate: (tower: Tower, behavior: ImitationBehavior, event: TowerActionEvent) => void;
}

export class NumberTowerController {
  constructor(private readonly runtime: () => NumberTowerRuntime) {}

  sync() {
    const { towers, getDefinition } = this.runtime();
    const numbers = towers.filter(tower => tower.inPlay && !tower.transient && isNumberTower(tower));
    if (!numbers.length) return;
    const liveIds = new Set(towers.filter(tower => tower.inPlay).map(tower => tower.id));
    const cells = new Map<string, Tower[]>();
    for (const tower of towers) {
      if (!tower.inPlay) continue;
      const key = `${tower.lane}:${tower.column}`;
      const occupants = cells.get(key) ?? [];
      occupants.push(tower); cells.set(key, occupants);
    }
    const neighbors = new Map(numbers.map(tower => [tower, new Set<Tower>()]));
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
      if (!connector.inPlay || connector.transient || towerFormType(connector) !== "=") continue;
      for (const [dl, dc] of [[1, 0], [0, 1]]) {
        const a = cells.get(`${connector.lane + dl}:${connector.column + dc}`) ?? [];
        const b = cells.get(`${connector.lane - dl}:${connector.column - dc}`) ?? [];
        for (const [recipients, sources] of [[a, b], [b, a]]) {
          for (const number of recipients) {
            if (!neighbors.has(number)) continue;
            for (const source of sources) {
              if (neighbors.has(source)) neighbors.get(number)!.add(source);
              else if (getDefinition(source.type).cost <= 999) learn(number, towerFormType(source), [source.id]);
            }
          }
        }
      }
    }
    // Propagate the complete memory union through each numeric component once.
    const seen = new Set<Tower>();
    for (const number of numbers) {
      if (seen.has(number)) continue;
      const group: Tower[] = [], pending = [number];
      seen.add(number);
      while (pending.length) {
        const member = pending.pop()!; group.push(member);
        for (const next of neighbors.get(member)!) if (!seen.has(next)) { seen.add(next); pending.push(next); }
      }
      const memories = new Map<CardId, Set<string>>();
      for (const member of group) for (const entry of member.numberMemory ?? []) {
        const ids = memories.get(entry.type) ?? new Set<string>();
        for (const id of entry.sourceIds) ids.add(id);
        memories.set(entry.type, ids);
      }
      for (const member of group) for (const [type, ids] of memories) learn(member, type, [...ids]);
    }
  }

  record(source: Tower, event: TowerActionEvent) {
    if (towerActionContext(source) || isNumberTower(source)) return;
    const runtime = this.runtime();
    const type = towerFormType(source);
    if (runtime.getDefinition(source.type).cost > 999) return;
    for (const tower of runtime.towers) {
      if (!tower.inPlay || tower.transient || !isNumberTower(tower)) continue;
      const entry = tower.numberMemory?.find(entry => entry.type === type && entry.sourceIds.includes(source.id));
      if (!entry) continue;
      entry.count += 1;
      const n = Math.max(1, Math.floor(tower.level));
      if (entry.count < n) continue;
      entry.count = 0;
      runtime.imitate(tower, { type, level: n }, event);
    }
  }
}
