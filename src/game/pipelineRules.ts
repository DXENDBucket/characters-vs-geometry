import type { CardId, DamageType, EdgeTower, Tower } from "../types";

export const PIPELINE_RATE = 25;
export const HEALING_RATE = 25;
export const BUNDLE_SHOTS = 5;

const shieldDamageTypes: Partial<Record<CardId, DamageType>> = { "*": "magic", "/": "physical" };
export function pipelineShieldDamageType(type: CardId) { return shieldDamageTypes[type]; }
export function isDamageOutlet(type: CardId) { return type === "+" || type === "-" || pipelineShieldDamageType(type) !== undefined; }

export function edgeCells(edge: EdgeTower) {
  return [{ lane: edge.lane, column: edge.column },
    { lane: edge.lane + (edge.axis === "vertical" ? 1 : 0), column: edge.column + (edge.axis === "horizontal" ? 1 : 0) }];
}

export function edgeFlowRate(edge: EdgeTower) { return PIPELINE_RATE * (edge.level ?? 1); }

export function edgeAllows(edge: EdgeTower, forward: boolean) {
  const mode = edge.mode ?? "=";
  return mode === "=" || mode === (forward ? ">" : "<");
}

export function refreshEdgeFlow(edge: EdgeTower, time: number) {
  const rate = edgeFlowRate(edge);
  edge.flowCredit = Math.min(rate, (edge.flowCredit ?? rate) + Math.max(0, time - (edge.flowUpdatedAt ?? time)) * rate / 1000);
  edge.flowUpdatedAt = time;
}

export function nodeOccupancy(tower: Tower) {
  const node = tower.projectileNode;
  return node ? node.input.length + node.output.length + (node.processing?.count ?? 0) : 0;
}
