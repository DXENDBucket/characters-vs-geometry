import { classifyBattleData } from "./battleDataSchema";
import { parseBattleEntityId, type BattleEntityKind } from "./battleEntityIds";
import { validateSaveGraph, type GraphNode, type SaveGraph, type Value, type NumberTag } from "./saveGraph";

export const BATTLE_WIRE_VERSION = 2;
const MAX_NODES = 250000, MAX_FIELDS = 2000000;
type WireValue = Exclude<Value, { ref: number }> | { entity: string } | { object: number };
interface WireObject { kind: "object" | "array"; data: Record<string, WireValue> }
interface WireEntity { id: string; kind: BattleEntityKind; data: Record<string, WireValue> }
export interface BattleWireGraph {
  version: typeof BATTLE_WIRE_VERSION;
  root: WireValue;
  objects: WireObject[];
  entities: WireEntity[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && Object.getPrototypeOf(value) === Object.prototype;
const fields = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const forbidden = new Set(["__proto__", "prototype", "constructor"]);

function entityKind(node: GraphNode) {
  const classification = node.kind === "array" ? { kind: "array" } : classifyBattleData(node.data);
  if (classification.kind !== node.kind) throw new Error("Battle wire node kind mismatch");
  return "entityKind" in classification ? classification.entityKind : undefined;
}

// Local saves keep their compatible graph format; network entity references never
// expose its traversal indices, including removed sources retained by queued actions.
export function encodeBattleWireGraph(input: SaveGraph): BattleWireGraph {
  validateSaveGraph(input);
  const objects: WireObject[] = [], entities: WireEntity[] = [];
  const references = new Map<number, { entity: string } | { object: number }>();
  const pending: Array<{ source: number; target: WireObject | WireEntity }> = [], ids = new Set<string>();
  // Discover records in sorted breadth-first order, just like canonicalSaveGraph,
  // but write wire records directly instead of allocating an intermediate graph.
  const encode = (value: Value): WireValue => {
    if (value === null || typeof value !== "object") return value;
    if ("number" in value) return { number: value.number };
    const existing = references.get(value.ref);
    if (existing) return { ...existing };
    const node = input.nodes[value.ref];
    const kind = entityKind(node), id = node.data.entityId;
    let entry: WireObject | WireEntity, reference: { entity: string } | { object: number };
    if (kind) {
      const parsed = parseBattleEntityId(id);
      if (!parsed || parsed.kind !== kind || typeof id !== "string" || ids.has(id)) throw new Error("Invalid battle wire identity");
      ids.add(id);
      entry = { id, kind, data: {} };
      entities.push(entry); reference = { entity: id };
    } else {
      if (id !== undefined) throw new Error("Identity on non-entity battle object");
      entry = { kind: node.kind as WireObject["kind"], data: {} };
      reference = { object: objects.length }; objects.push(entry);
    }
    references.set(value.ref, reference); pending.push({ source: value.ref, target: entry });
    return { ...reference };
  };
  const root = encode(input.root);
  for (let index = 0; index < pending.length; index++) {
    const { source, target } = pending[index], node = input.nodes[source];
    const keys = Object.keys(node.data).sort(node.kind === "array" ? (a, b) => Number(a) - Number(b) : undefined);
    for (const key of keys) if (key !== "entityId") target.data[key] = encode(node.data[key]);
  }
  entities.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { version: BATTLE_WIRE_VERSION, root, objects, entities };
}

// Validate before allocating battle entities or touching an existing world.
export function decodeBattleWireGraph(value: unknown): SaveGraph {
  if (!fields(value, ["version", "root", "objects", "entities"]) || value.version !== BATTLE_WIRE_VERSION ||
      !Array.isArray(value.objects) || !Array.isArray(value.entities) ||
      value.objects.length + value.entities.length > MAX_NODES) throw new Error("Invalid battle wire graph");
  const objects: unknown[] = value.objects, entities: unknown[] = value.entities;
  const nodes: GraphNode[] = [], ids = new Map<string, number>();
  for (const object of objects) {
    if (!fields(object, ["kind", "data"]) || !["object", "array"].includes(object.kind as string) || !record(object.data)) {
      throw new Error("Invalid battle wire object");
    }
    nodes.push({ kind: object.kind as WireObject["kind"], data: {} });
  }
  for (const entity of entities) {
    if (!fields(entity, ["id", "kind", "data"]) || !record(entity.data)) throw new Error("Invalid battle wire entity");
    const parsed = parseBattleEntityId(entity.id);
    if (!parsed || parsed.kind !== entity.kind || typeof entity.id !== "string" || ids.has(entity.id)) {
      throw new Error("Invalid battle wire identity");
    }
    ids.set(entity.id, nodes.length);
    nodes.push({ kind: parsed.kind === "edge" ? "object" : parsed.kind, data: { entityId: entity.id } });
  }
  const decode = (child: unknown): Value => {
    if (child === null || typeof child === "string" || typeof child === "boolean" || typeof child === "number" && Number.isFinite(child)) return child;
    if (fields(child, ["number"]) && ["Infinity", "-Infinity", "NaN", "-0"].includes(child.number as string)) return { number: child.number as NumberTag };
    if (fields(child, ["object"]) && Number.isSafeInteger(child.object) && (child.object as number) >= 0 && (child.object as number) < objects.length) return { ref: child.object as number };
    if (fields(child, ["entity"]) && typeof child.entity === "string" && ids.has(child.entity)) return { ref: ids.get(child.entity)! };
    throw new Error("Invalid battle wire reference or value");
  };
  let count = 0;
  [...objects, ...entities].forEach((entry, index) => {
    const node = nodes[index];
    for (const [key, child] of Object.entries((entry as WireObject | WireEntity).data)) {
      if (++count > MAX_FIELDS || forbidden.has(key) || key === "entityId") throw new Error("Invalid battle wire field");
      node.data[key] = decode(child);
    }
    const kind = entityKind(node);
    if (index < objects.length ? kind !== undefined : kind !== (entry as WireEntity).kind) throw new Error("Hidden or mismatched battle entity");
    if (kind) {
      const allowed = classifyBattleData(node.data).include!;
      if (Object.keys(node.data).some(key => !allowed.has(key))) throw new Error("Unknown battle entity field");
    }
  });
  const graph: SaveGraph = { root: decode(value.root), nodes };
  validateSaveGraph(graph);
  const seen = new Set<number>(), pending = [graph.root];
  while (pending.length) {
    const child = pending.pop()!;
    if (child === null || typeof child !== "object" || !("ref" in child) || seen.has(child.ref)) continue;
    seen.add(child.ref);
    for (const field of Object.values(nodes[child.ref].data)) if (field && typeof field === "object" && "ref" in field) pending.push(field);
  }
  if (seen.size !== nodes.length) throw new Error("Unreachable battle wire record");
  return graph;
}
