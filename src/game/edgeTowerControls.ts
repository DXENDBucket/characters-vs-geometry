import type { EdgeTower } from "../types";
import type { BattleCardState } from "./battleLoadout";
import { edgeKey } from "./projectileCircuitRules";
import { refreshEdgeFlow } from "./pipelineRules";

interface EdgeControlRuntime {
  edges: EdgeTower[];
  card?: BattleCardState;
  time: number;
  cardTime: number;
  chars: number;
  autoEnabled: boolean;
  reserve: number;
  spend: (cost: number) => void;
  identify: (edge: EdgeTower) => EdgeTower;
  changed: () => void;
}

export class EdgeTowerControls {
  constructor(private readonly runtime: () => EdgeControlRuntime) {}

  cycle(edge: EdgeTower) {
    const modes = ["=", ">", "<", "!="] as const;
    edge.mode = modes[(modes.indexOf(edge.mode ?? "=") + 1) % modes.length];
    this.runtime().changed();
  }

  toggleAuto(edge: EdgeTower, all = false) {
    const enabled = !edge.autoUpgrade;
    for (const target of all ? this.runtime().edges : [edge]) target.autoUpgrade = enabled;
    this.runtime().changed();
  }

  use(position: EdgeTower, card = this.runtime().card): "handled" | "cooldown" | "noChars" {
    const runtime = this.runtime();
    if (!card || runtime.cardTime < card.readyAt) return "cooldown";
    if (runtime.chars < card.definition.cost) return "noChars";
    const existing = runtime.edges.find(edge => edgeKey(edge) === edgeKey(position));
    if (existing) {
      refreshEdgeFlow(existing, runtime.time);
      existing.level = (existing.level ?? 1) + 1;
    } else runtime.edges.push(runtime.identify({ type: "=", axis: position.axis, lane: position.lane,
      column: position.column, mode: "=", level: 1, autoUpgrade: false }));
    runtime.spend(card.definition.cost);
    card.readyAt = runtime.cardTime + card.definition.cooldown;
    runtime.changed();
    return "handled";
  }

  attemptAutoUpgrade(card = this.runtime().card) {
    const runtime = this.runtime();
    if (!runtime.autoEnabled || !card ||
      runtime.chars - card.definition.cost < runtime.reserve) return;
    let target: EdgeTower | undefined;
    for (const edge of runtime.edges) if (edge.autoUpgrade && (!target || (edge.level ?? 1) < (target.level ?? 1))) target = edge;
    if (target) this.use(target, card);
  }
}
