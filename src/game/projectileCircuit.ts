import type { CardDefinition, CardId, DamageType, EdgeTower, EnemyProjectile, MortarProjectile, StoredTowerShot, Tower } from "../types";
import { ProjectileCircuitSimulation } from "./projectileCircuitRules";
import type { TowerState } from "./towerState";
import { circuitPresentation } from "../render/projectileCircuit";
export { PROJECTILE_BANK_CAPACITY, INTERCEPTION_RADIUS, INTERCEPTION_INTERVAL, INTERCEPTION_DAMAGE_COST,
  SHIELD_DAMAGE_COST, BUNDLE_SHOTS, edgeCells, edgeKey, edgePosition, edgeAtPoint } from "./projectileCircuitRules";

export interface CircuitRuntime {
  towers: Tower[];
  edges: EdgeTower[];
  battleTime: number;
  getDefinition(id: CardId): CardDefinition;
  emit(shot: StoredTowerShot, outlet: Tower): void;
  heal?(tower: Tower, amount: number): boolean;
  changed(tower: Tower): void;
  intercepted?(tower: Tower, target: EnemyProjectile | MortarProjectile): void;
  shielded?(target: Tower, damageType: DamageType): void;
}

export class ProjectileCircuitController extends ProjectileCircuitSimulation {
  constructor(live: () => CircuitRuntime) {
    super(() => liveRuntime, circuitPresentation(live));
    const liveRuntime = {
      get towers() { return live().towers; }, get edges() { return live().edges; },
      get battleTime() { return live().battleTime; },
      getDefinition: (id: CardId) => live().getDefinition(id),
      emit: (shot: StoredTowerShot, outlet: TowerState) => live().emit(shot, outlet as Tower),
      heal: (tower: TowerState, amount: number) => live().heal?.(tower as Tower, amount) ?? false
    };
  }
}
