import type { CardDefinition, CardId, EquationAxis, NumberTowerState, Tower } from "../types";
import type { TowerActionEvent, ImitationBehavior } from "./towerActions";
import { isLiteralNumberType, isNumberTower, isNumericOperatorType, numberTowerActionLevel, numberTowerMultiplier,
  numberTowerStates, numberTowerValue, towerActionContext, towerFormType } from "./towerIdentity";
import { towerCell } from "./towerTopology";

export interface NumberTowerRuntime {
  towers: Tower[];
  getDefinition: (id: CardId) => CardDefinition;
  imitate: (tower: Tower, behavior: ImitationBehavior, event: TowerActionEvent) => void;
  onNumberChanged?: (tower: Tower) => void;
}

interface EquationNode { tower: Tower; state: NumberTowerState; numeric: boolean }
type EquationGraph = Map<EquationNode, Set<EquationNode>>;
const AXES: ReadonlyArray<[EquationAxis, number, number]> = [["horizontal", 0, 1], ["vertical", 1, 0]];

function connect(graph: EquationGraph, a: EquationNode, b: EquationNode) {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b); graph.get(b)!.add(a);
}

function component(start: EquationNode, graph: EquationGraph, seen: Set<EquationNode>) {
  const group: EquationNode[] = [], pending = [start]; seen.add(start);
  while (pending.length) {
    const member = pending.pop()!; group.push(member);
    for (const next of graph.get(member) ?? []) if (!seen.has(next)) { seen.add(next); pending.push(next); }
  }
  return group;
}

function numberDisplayKey(tower: Tower) {
  return [tower.numberValue, tower.equationLevel, ...Object.values(tower.numberChannels ?? {}).flatMap(state =>
    [state.numberValue, state.equationLevel])].join(":");
}

export class NumberTowerController {
  private plusPartners = new Map<Tower, Tower[]>();
  constructor(private readonly runtime: () => NumberTowerRuntime) {}

  sync() {
    const { towers, getDefinition, onNumberChanged } = this.runtime();
    this.plusPartners.clear();
    const previous = new Map(towers.map(tower => [tower, numberDisplayKey(tower)]));
    const liveIds = new Set(towers.filter(tower => tower.inPlay).map(tower => tower.id));
    const cells = new Map<string, Tower[]>();
    const operands = new Map<Tower, EquationNode>();
    const numbers: EquationNode[] = [];
    const neighbors: EquationGraph = new Map(), plusNeighbors: EquationGraph = new Map();
    const equationLevels = new Map<EquationNode, number>();

    for (const tower of towers) {
      delete tower.numberValue; delete tower.equationLevel;
      for (const state of Object.values(tower.numberChannels ?? {})) {
        delete state.numberValue; delete state.equationLevel;
      }
      if (!tower.inPlay) continue;
      const cell = towerCell(tower), key = `${cell.lane}:${cell.column}`;
      const occupants = cells.get(key) ?? []; occupants.push(tower); cells.set(key, occupants);
      const type = towerFormType(tower);
      if (getDefinition(tower.type).cost > 999 || type === "=" || isNumericOperatorType(type)) continue;
      const node = { tower, state: tower, numeric: !tower.transient && isLiteralNumberType(type) };
      operands.set(tower, node);
      if (node.numeric) numbers.push(node);
    }

    for (const connector of towers) {
      const operator = towerFormType(connector);
      if (!connector.inPlay || connector.transient || (operator !== "=" && !isNumericOperatorType(operator))) continue;
      const cell = towerCell(connector);
      for (const [axis, dl, dc] of AXES) {
        const a = cells.get(`${cell.lane + dl}:${cell.column + dc}`) ?? [];
        const b = cells.get(`${cell.lane - dl}:${cell.column - dc}`) ?? [];
        for (const left of a) for (const right of b) {
          const l = operands.get(left), r = operands.get(right);
          if (!l || !r) continue;
          if (operator === "+" && l.numeric !== r.numeric) continue;
          if (operator === "-" && (!l.numeric || !r.numeric)) continue;
          if (isNumericOperatorType(operator) && l.numeric) {
            // Each numeric axis is a node, not the shared physical operator.
            // Migrate pre-channel saves once, without duplicating counters.
            connector.numberChannels ??= { [axis]: { numberMemory: connector.numberMemory } };
            const state = connector.numberChannels[axis] ??= {};
            if (state.numberValue !== undefined) continue;
            const x = numberTowerValue(left), y = numberTowerValue(right);
            state.numberValue = operator === "+" ? x + y : Math.abs(x - y);
            const node = { tower: connector, state, numeric: true };
            numbers.push(node); connect(neighbors, node, l);
          }
          connect(neighbors, l, r);
          if (operator === "=") {
            for (const node of [l, r]) equationLevels.set(node, Math.max(connector.level, equationLevels.get(node) ?? 1));
          } else if (operator === "+" && !l.numeric) connect(plusNeighbors, l, r);
        }
      }
    }
    const plusSeen = new Set<EquationNode>();
    for (const start of plusNeighbors.keys()) {
      if (plusSeen.has(start)) continue;
      const group = component(start, plusNeighbors, plusSeen).map(node => node.tower);
      for (const tower of group) this.plusPartners.set(tower, group);
    }
    for (const tower of towers) {
      for (const state of tower.numberChannels ? Object.values(tower.numberChannels) : [tower]) {
        for (const entry of state.numberMemory ?? []) entry.sourceIds = entry.sourceIds.filter(id => liveIds.has(id));
      }
    }
    const seen = new Set<EquationNode>();
    for (const number of numbers) {
      if (seen.has(number)) continue;
      const group = component(number, neighbors, seen), memories = new Map<CardId, Set<string>>();
      let level = 1;
      const remember = (type: CardId, ids: string[]) => {
        const known = memories.get(type) ?? new Set<string>();
        for (const id of ids) known.add(id);
        memories.set(type, known);
      };
      for (const node of group) {
        level = Math.max(level, equationLevels.get(node) ?? 1);
        if (node.numeric) {
          for (const entry of node.state.numberMemory ?? []) remember(entry.type, entry.sourceIds);
        } else remember(towerFormType(node.tower), [node.tower.id]);
      }
      for (const node of group) if (node.numeric) {
        if (level > 1) node.state.equationLevel = level;
        for (const [type, ids] of memories) {
          const entries = node.state.numberMemory ??= [];
          let entry = entries.find(item => item.type === type);
          if (!entry) { entry = { type, sourceIds: [], count: 0 }; entries.push(entry); }
          for (const id of ids) if (liveIds.has(id) && !entry.sourceIds.includes(id)) entry.sourceIds.push(id);
        }
      }
    }
    for (const tower of towers) {
      if (tower.numberChannels) {
        // Primary fields alias one channel for older saves and UI consumers.
        const state = numberTowerStates(tower)[0];
        if (state) {
          tower.numberValue = state.numberValue;
          tower.equationLevel = state.equationLevel;
          tower.numberMemory = state.numberMemory;
        }
      }
      if (tower.inPlay && numberDisplayKey(tower) !== previous.get(tower)) onNumberChanged?.(tower);
    }
  }

  private canImitate(tower: Tower, runtime: NumberTowerRuntime) {
    return tower.inPlay && !tower.transient && isNumberTower(tower) &&
      (isNumericOperatorType(towerFormType(tower)) || runtime.getDefinition(tower.type).cost <= 999);
  }

  record(source: Tower, event: TowerActionEvent) {
    if (towerActionContext(source) || isNumberTower(source)) return;
    const runtime = this.runtime(), type = towerFormType(source);
    if (runtime.getDefinition(source.type).cost > 999) return;
    for (const tower of runtime.towers) {
      if (!this.canImitate(tower, runtime)) continue;
      let changed = false;
      for (const state of numberTowerStates(tower)) for (const entry of state.numberMemory ?? []) {
        const native = entry.type === type && entry.sourceIds.includes(source.id);
        const shared = this.plusPartners.get(source)?.some(partner => !isNumberTower(partner) &&
          entry.type === towerFormType(partner) && entry.sourceIds.includes(partner.id));
        if (!native && !shared) continue;
        entry.count += 1;
        const n = numberTowerValue(tower, state);
        const action = native || event.kind === "combined" ? event : { kind: "combined" as const, original: event };
        if (n === 0) { entry.storedEvent = action; changed = true; continue; }
        if (entry.count < n) continue;
        entry.count = 0; delete entry.storedEvent;
        runtime.imitate(tower, { type: entry.type, level: numberTowerActionLevel(tower, state) }, action);
      }
      if (changed) runtime.onNumberChanged?.(tower);
    }
  }

  release(tower: Tower) {
    const runtime = this.runtime();
    if (!this.canImitate(tower, runtime)) return false;
    const states = numberTowerStates(tower).filter(state => numberTowerValue(tower, state) === 0);
    if (!states.length) return false;
    const actions: Array<{ behavior: ImitationBehavior; event: TowerActionEvent }> = [];
    for (const state of states) for (const entry of state.numberMemory ?? []) {
      if (entry.count > 0) actions.push({ behavior: { type: entry.type, level: entry.count * numberTowerMultiplier(tower, state) },
        event: entry.storedEvent ?? { kind: "combined", original: { kind: "attack" } } });
      // Clear first: copied actions can remove sources or alter the network.
      entry.count = 0; delete entry.storedEvent;
    }
    runtime.onNumberChanged?.(tower);
    for (const action of actions) runtime.imitate(tower, action.behavior, action.event);
    return true;
  }
}
