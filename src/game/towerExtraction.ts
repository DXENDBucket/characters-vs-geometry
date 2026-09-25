import type { CardDefinition } from "../types";
import type { TowerState as Tower } from "./towerState";

export interface DeploymentBatch {
  levels: number;
  cost: number;
  usesPool: boolean;
}

export class TowerExtractionPool {
  private amount = 0;

  get value() {
    return this.amount;
  }

  restore(amount: number) { this.amount = amount; }

  extract(target: Pick<Tower, "level">, baseCost: number, effectLevel: number) {
    const rate = 0.5 + 0.25 * (Math.max(1, Math.floor(effectLevel)) - 1);
    const extracted = baseCost * Math.max(1, Math.floor(target.level)) * rate;
    this.amount += extracted;
    return extracted;
  }

  plan(definition: Pick<CardDefinition, "cost"> & Partial<Pick<CardDefinition, "id">>): DeploymentBatch {
    const usesPool = this.amount > 0 && definition.cost > 0 && definition.cost <= 999;
    const levels = usesPool ? Math.max(1, Math.floor(this.amount / definition.cost)) : 1;
    return { levels, cost: definition.cost * levels, usesPool };
  }

  consume(batch: DeploymentBatch) {
    if (batch.usesPool) this.amount = 0;
  }
}
