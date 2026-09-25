import { BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, COLUMNS, LANES } from "../config";
import type { CardDefinition, CardId, EdgeTower } from "../types";
import type { TowerState } from "./towerState";
import { parseBattleEntityId, type BattleEntityRef } from "./battleEntityIds";

export interface BattleCell { lane: number; column: number }
export interface BattlePoint { x: number; y: number }
export type BattleControlTarget = BattleEntityRef<"tower" | "edge">;
export type BattleEdgePosition = Pick<EdgeTower, "axis" | "lane" | "column">;
export type BattleOperation =
  | { type: "deploy"; card: CardId; cell: BattleCell; expected: BattleEntityRef<"tower"> | null }
  | { type: "effect"; card: CardId; cell: BattleCell; target: BattleEntityRef<"tower"> | null }
  | { type: "edgeCard"; card: CardId; position: BattleEdgePosition; expected: BattleEntityRef<"edge"> | null }
  | { type: "erase"; target: BattleControlTarget }
  | { type: "autoUpgrade"; targets: BattleControlTarget[]; enabled: boolean }
  | { type: "edgeMode"; target: BattleEntityRef<"edge">; mode: NonNullable<EdgeTower["mode"]> }
  | { type: "skill"; skill: CardId; targets: BattleEntityRef<"tower">[]; point: BattlePoint | null }
  | { type: "trigger"; target: BattleEntityRef<"tower">; behavior: CardId }
  | { type: "push"; target: BattleEntityRef<"tower">; cell: BattleCell }
  | { type: "topology"; target: BattleEntityRef<"tower">; cell: BattleCell }
  | { type: "move"; sources: Array<BattleCell & { target: BattleEntityRef<"tower"> }>; destination: BattleCell };

export type BattleOperationPermission = "build" | "edit" | "move" | "skill";
export interface BattleOperationActor { id: string; permissions: readonly BattleOperationPermission[] }
export const LOCAL_BATTLE_ACTOR: BattleOperationActor = Object.freeze({ id: "local",
  permissions: Object.freeze(["build", "edit", "move", "skill"] as const) });
export type BattleOperationResult = "deployed" | "handled" | "moved" | "invalid" | "forbidden" | "unavailable" |
  "stale" | "occupied" | "cooldown" | "noChars" | "empty";
export interface BattleOperationTargets<T extends TowerState = TowerState> { towers: T[]; edges: EdgeTower[] }

export interface BattleOperationRuntime<T extends TowerState = TowerState> {
  ended: boolean;
  actor(id: string): BattleOperationActor | undefined;
  tower(id: string): T | undefined;
  edge(id: string): EdgeTower | undefined;
  card(id: CardId): CardDefinition | undefined;
  towerAt(cell: BattleCell, card: CardId): T | undefined;
  edgeAt(position: BattleEdgePosition): EdgeTower | undefined;
  // Include column deployments and mirror upgrades before authorization. This is a read-only query.
  affected(operation: BattleOperation, primary: BattleOperationTargets<T>): BattleOperationTargets<T>;
  authorize(actor: BattleOperationActor, operation: BattleOperation, affected: BattleOperationTargets<T>): boolean;
  apply(operation: BattleOperation, primary: BattleOperationTargets<T>): BattleOperationResult;
}

const maxTargets = LANES * COLUMNS * 4;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const fields = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const coordinate = (value: unknown, max: number) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < max;
export const validBattleActorId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const cardId = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 16;
const cell = (value: unknown) => fields(value, ["lane", "column"]) && coordinate(value.lane, LANES) && coordinate(value.column, COLUMNS);
const point = (value: unknown) => fields(value, ["x", "y"]) && typeof value.x === "number" && typeof value.y === "number" &&
  Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= BOARD_X && value.x < BOARD_X + BOARD_WIDTH &&
  value.y >= BOARD_Y && value.y < BOARD_Y + BOARD_HEIGHT;
const reference = (value: unknown, kinds: readonly string[]) => {
  if (!fields(value, ["kind", "id"]) || typeof value.id !== "string" || value.id.length > 40) return false;
  const parsed = parseBattleEntityId(value.id);
  return !!parsed && parsed.kind === value.kind && kinds.includes(parsed.kind);
};
const targets = (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= maxTargets &&
  Array.from(value).every(item => reference(item, ["tower", "edge"])) && new Set(value.map(item => item.id)).size === value.length;

export function validBattleOperation(value: unknown): value is BattleOperation {
  if (!record(value)) return false;
  switch (value.type) {
    case "deploy": return fields(value, ["type", "card", "cell", "expected"]) && cardId(value.card) && cell(value.cell) &&
      (value.expected === null || reference(value.expected, ["tower"]));
    case "effect": return fields(value, ["type", "card", "cell", "target"]) && cardId(value.card) && cell(value.cell) &&
      (value.target === null || reference(value.target, ["tower"]));
    case "edgeCard": {
      if (!fields(value, ["type", "card", "position", "expected"]) || !cardId(value.card) ||
          !fields(value.position, ["axis", "lane", "column"])) return false;
      const edge = value.position;
      return (edge.axis === "horizontal" || edge.axis === "vertical") &&
        coordinate(edge.lane, LANES - (edge.axis === "vertical" ? 1 : 0)) &&
        coordinate(edge.column, COLUMNS - (edge.axis === "horizontal" ? 1 : 0)) &&
        (value.expected === null || reference(value.expected, ["edge"]));
    }
    case "erase": return fields(value, ["type", "target"]) && reference(value.target, ["tower", "edge"]);
    case "autoUpgrade": return fields(value, ["type", "targets", "enabled"]) && targets(value.targets) && typeof value.enabled === "boolean";
    case "edgeMode": return fields(value, ["type", "target", "mode"]) && reference(value.target, ["edge"]) &&
      ["=", ">", "<", "!="].includes(value.mode as string);
    case "skill": return fields(value, ["type", "skill", "targets", "point"]) && cardId(value.skill) && targets(value.targets) &&
      (value.targets as unknown[]).every(target => reference(target, ["tower"])) && (value.point === null || point(value.point));
    case "trigger": return fields(value, ["type", "target", "behavior"]) && reference(value.target, ["tower"]) && cardId(value.behavior);
    case "push": case "topology": return fields(value, ["type", "target", "cell"]) && reference(value.target, ["tower"]) && cell(value.cell);
    case "move": return fields(value, ["type", "sources", "destination"]) && cell(value.destination) && Array.isArray(value.sources) &&
      value.sources.length > 0 && value.sources.length <= LANES * COLUMNS * 2 && Array.from(value.sources).every(source =>
        fields(source, ["target", "lane", "column"]) && reference(source.target, ["tower"]) &&
        coordinate(source.lane, LANES) && coordinate(source.column, COLUMNS)) &&
      new Set(value.sources.map(source => source.target.id)).size === value.sources.length;
    default: return false;
  }
}

// The authenticated actor is supplied by the host. A caller's claimed identity is not authentication.
export function executeBattleOperation<T extends TowerState>(actorId: string, operation: unknown,
  runtime: BattleOperationRuntime<T>): BattleOperationResult {
  if (!validBattleActorId(actorId) || !validBattleOperation(operation)) return "invalid";
  if (runtime.ended) return "unavailable";
  const actor = runtime.actor(actorId);
  const permission: BattleOperationPermission = operation.type === "move" ? "move" :
    ["deploy", "effect", "edgeCard"].includes(operation.type) ? "build" :
    ["skill", "trigger", "push"].includes(operation.type) ? "skill" : "edit";
  if (!actor || actor.id !== actorId || !actor.permissions.includes(permission)) return "forbidden";
  if ("card" in operation && !runtime.card(operation.card)) return "forbidden";

  const primary: BattleOperationTargets<T> = { towers: [], edges: [] };
  const add = (ref: BattleControlTarget) => {
    if (ref.kind === "tower") {
      const tower = runtime.tower(ref.id);
      if (!tower || tower.entityId !== ref.id || !tower.inPlay || tower.transient || tower.nullified) return false;
      primary.towers.push(tower);
    } else {
      const edge = runtime.edge(ref.id);
      if (!edge || edge.entityId !== ref.id) return false;
      primary.edges.push(edge);
    }
    return true;
  };
  switch (operation.type) {
    case "deploy": {
      const occupant = runtime.towerAt(operation.cell, operation.card);
      if (occupant ? !operation.expected || occupant.entityId !== operation.expected.id : operation.expected !== null) return "stale";
      if (operation.expected && !add(operation.expected)) return "stale";
      break;
    }
    case "effect":
      if (operation.target) {
        if (!add(operation.target)) return "stale";
        const tower = primary.towers[0];
        if (tower.lane !== operation.cell.lane || tower.column !== operation.cell.column) return "stale";
      }
      break;
    case "edgeCard": {
      const edge = runtime.edgeAt(operation.position);
      if (edge ? !operation.expected || edge.entityId !== operation.expected.id : operation.expected !== null) return "stale";
      if (operation.expected && !add(operation.expected)) return "stale";
      break;
    }
    case "erase": case "edgeMode": case "trigger": case "push": case "topology":
      if (!add(operation.target)) return "stale"; break;
    case "autoUpgrade": case "skill": if (!operation.targets.every(add)) return "stale"; break;
    case "move":
      for (const source of operation.sources) {
        if (!add(source.target)) return "stale";
        const tower = primary.towers.at(-1)!;
        if (tower.lane !== source.lane || tower.column !== source.column) return "stale";
      }
      break;
  }
  if (!runtime.authorize(actor, operation, runtime.affected(operation, primary))) return "forbidden";
  return runtime.apply(operation, primary);
}

export function towerOperationRef(tower: TowerState): BattleEntityRef<"tower"> {
  if (parseBattleEntityId(tower.entityId)?.kind !== "tower") throw new Error("Unidentified operation target");
  return { kind: "tower", id: tower.entityId! };
}
export function edgeOperationRef(edge: EdgeTower): BattleEntityRef<"edge"> {
  if (parseBattleEntityId(edge.entityId)?.kind !== "edge") throw new Error("Unidentified operation target");
  return { kind: "edge", id: edge.entityId! };
}
