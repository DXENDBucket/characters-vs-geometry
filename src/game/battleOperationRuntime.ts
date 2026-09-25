import { LANES } from "../config";
import type { EdgeTower, Tower } from "../types";
import type { TowerState } from "./towerState";
import type { MoveTowersCommand } from "./rules/towerMovement";
import type { BattleCardState } from "./battleLoadout";
import { deploymentCardId } from "./cardIdentity";
import { executeBattleOperation, type BattleOperation, type BattleOperationActor,
  type BattleOperationResult, type BattleOperationTargets } from "./battleOperations";
import type { TowerDeploymentSimulation } from "./towerDeploymentRules";
import type { TargetedEffectSimulation } from "./targetedEffectRules";
import type { EdgeTowerControls } from "./edgeTowerControls";
import type { TowerSkillSimulation } from "./towerSkillSimulation";
import type { TowerPushSimulation } from "./towerPushRules";
import { towerInPlacementLayer } from "./towerOccupancy";
import { canUpgradeTowerWithCard, supportsTowerAutoUpgrade, towerBehaviorType } from "./towerIdentity";
import { isShockTower } from "./towerRules";
import { edgeKey, edgePosition } from "./projectileCircuitRules";

export interface BattleOperationExecutionRuntime<T extends TowerState = TowerState> {
  towers: T[];
  edges: EdgeTower[];
  occupied: Map<string, T>;
  cards: readonly BattleCardState[];
  unlimitedFirepower: boolean;
  autoUpgradeEnabled: boolean;
  ended: boolean;
  actor(id: string): BattleOperationActor | undefined;
  authorize(actor: BattleOperationActor, operation: BattleOperation, affected: BattleOperationTargets<T>): boolean;
  deployment: Pick<TowerDeploymentSimulation<T>, "useCard">;
  targetedEffects: Pick<TargetedEffectSimulation<T>, "deploymentTargets" | "canHandle" | "use">;
  edgeControls: Pick<EdgeTowerControls, "use">;
  shifter: { executeMove(command: MoveTowersCommand, updateSelection?: boolean): "moved" | "invalid" | "cooldown" };
  skills: Pick<TowerSkillSimulation, "activateManualSkills">;
  push: Pick<TowerPushSimulation<T>, "plan" | "push">;
  topology: { connect(tower: T, lane: number, column: number): boolean };
  triggerShockTower(tower: T): void;
  mirrorGroupFor(tower: T): T[];
  removeTower(tower: T): void;
  erasedAt(x: number, y: number): void;
  autoUpgradeChanged?(tower: T, active: boolean): void;
  refreshPlacement(): void;
  refreshEdges(): void;
  updateLevelAuras(): void;
  updateCards(): void;
  attemptAutoUpgrades(): void;
}

export type LiveBattleOperationRuntime = BattleOperationExecutionRuntime<Tower>;
export const executeLiveBattleOperation = executeBattleOperationRules;

// The actual command application path uses data and rule ports, independent of local picking.
export function executeBattleOperationRules<T extends TowerState>(runtime: BattleOperationExecutionRuntime<T>, actorId: string, operation: BattleOperation): BattleOperationResult {
  return executeBattleOperation(actorId, operation, {
    ended: runtime.ended,
    actor: id => runtime.actor(id),
    card: id => runtime.cards.find(card => card.definition.id === id)?.definition,
    tower: id => runtime.towers.find(tower => tower.entityId === id),
    edge: id => runtime.edges.find(edge => edge.entityId === id),
    towerAt: (cell, card) => towerInPlacementLayer(runtime.occupied, cell.lane, cell.column, card),
    edgeAt: position => runtime.edges.find(edge => edgeKey(edge) === edgeKey({ type: "=", ...position })),
    affected: (op, primary) => {
      const towers = new Set(primary.towers);
      if (op.type === "deploy") {
        const lanes = runtime.unlimitedFirepower ? Array.from({ length: LANES }, (_, lane) => lane) : [op.cell.lane];
        for (const lane of lanes) {
          const tower = towerInPlacementLayer(runtime.occupied, lane, op.cell.column, op.card);
          if (!tower || !canUpgradeTowerWithCard(tower, op.card)) continue;
          for (const member of runtime.mirrorGroupFor(tower)) if (member.inPlay && member.type === tower.type) towers.add(member);
        }
      } else if (op.type === "effect") {
        for (const tower of runtime.targetedEffects.deploymentTargets(op.cell.lane, op.cell.column, primary.towers[0])) towers.add(tower);
      } else if (op.type === "trigger") {
        for (const tower of runtime.mirrorGroupFor(primary.towers[0])) if (tower.inPlay) towers.add(tower);
      } else if (op.type === "push") {
        for (const move of runtime.push.plan(primary.towers[0], op.cell.lane, op.cell.column)?.moves ?? []) towers.add(move.tower);
      } else if (op.type === "topology") {
        const source = primary.towers[0];
        for (const tower of runtime.towers) if (tower.inPlay &&
          ((tower.lane === source.lane && tower.column === source.column) ||
           (tower.lane === op.cell.lane && tower.column === op.cell.column))) towers.add(tower);
      }
      return { towers: [...towers], edges: primary.edges };
    },
    authorize: (actor, op, targets) => runtime.authorize(actor, op, targets),
    apply: (op, primary) => {
      switch (op.type) {
        case "deploy": {
          const card = runtime.cards.find(card => card.definition.id === op.card)!;
          if (card.definition.category === "special" || runtime.targetedEffects.canHandle(op.card)) return "invalid";
          const result = runtime.deployment.useCard(card.definition, op.cell.lane, op.cell.column);
          if (result === "deployed") runtime.refreshPlacement();
          return result;
        }
        case "effect": {
          if (!runtime.targetedEffects.canHandle(op.card)) return "invalid";
          const card = runtime.cards.find(card => card.definition.id === op.card)!;
          const result = runtime.targetedEffects.use(card.definition, op.cell.lane, op.cell.column, primary.towers[0]);
          if (result === "handled") runtime.refreshPlacement();
          return result;
        }
        case "edgeCard": {
          if (deploymentCardId(op.card) !== "=") return "invalid";
          return runtime.edgeControls.use({ type: "=", ...op.position }, runtime.cards.find(card => card.definition.id === op.card)!);
        }
        case "erase": {
          const edge = primary.edges[0], tower = primary.towers[0];
          if (edge) {
            runtime.edges.splice(runtime.edges.indexOf(edge), 1); runtime.refreshEdges();
            const position = edgePosition(edge); runtime.erasedAt(position.x, position.y);
          } else {
            const { x, y } = tower;
            runtime.removeTower(tower); runtime.updateLevelAuras(); runtime.erasedAt(x, y);
          }
          return "handled";
        }
        case "autoUpgrade":
          if (primary.towers.some(tower => !supportsTowerAutoUpgrade(tower))) return "invalid";
          for (const tower of primary.towers) {
            tower.autoUpgrade = op.enabled;
            runtime.autoUpgradeChanged?.(tower, runtime.autoUpgradeEnabled);
          }
          for (const edge of primary.edges) edge.autoUpgrade = op.enabled;
          if (primary.edges.length) runtime.refreshEdges();
          runtime.attemptAutoUpgrades(); runtime.updateCards();
          return "handled";
        case "edgeMode":
          primary.edges[0].mode = op.mode; runtime.refreshEdges(); return "handled";
        case "skill": {
          const result = runtime.skills.activateManualSkills(primary.towers, op.skill, op.point);
          if (result === "handled") runtime.updateCards();
          return result;
        }
        case "trigger": {
          const tower = primary.towers[0];
          if (towerBehaviorType(tower) !== op.behavior) return "stale";
          if (!isShockTower(tower)) return "invalid";
          runtime.triggerShockTower(tower); return "handled";
        }
        case "push":
          if (towerBehaviorType(primary.towers[0]) !== "#") return "invalid";
          return runtime.push.push(primary.towers[0], op.cell.lane, op.cell.column) ? "handled" : "unavailable";
        case "topology":
          return runtime.topology.connect(primary.towers[0], op.cell.lane, op.cell.column) ? "handled" : "unavailable";
        case "move":
          return runtime.shifter.executeMove({ type: "moveTowers", destination: op.destination,
            sources: op.sources.map((source, index) => ({ towerId: primary.towers[index].id, lane: source.lane, column: source.column })) }, false);
      }
    }
  });
}
