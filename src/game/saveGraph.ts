export type NodeKind = "object" | "array" | "tower" | "enemy" | "projectile" | "enemyProjectile" | "mortar";
type Value = null | boolean | string | number | { ref: number } | { number: "Infinity" | "-Infinity" | "NaN" };
export interface GraphNode { kind: NodeKind; data: Record<string, Value> }
export interface SaveGraph { root: Value; nodes: GraphNode[] }
const forbidden = new Set(["__proto__", "prototype", "constructor"]);

// References preserve shared health pools, targets and removed sources without copying Phaser objects.
export function encodeSaveGraph(root: unknown, classify: (object: object) => { kind: NodeKind; omit?: ReadonlySet<string> }): SaveGraph {
  const nodes: GraphNode[] = [];
  const ids = new Map<object, number>();
  function encode(value: unknown): Value {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : { number: String(value) as "Infinity" | "-Infinity" | "NaN" };
    }
    if (typeof value !== "object") throw new Error("Unsupported save value");
    const existing = ids.get(value);
    if (existing !== undefined) return { ref: existing };
    const id = nodes.length;
    ids.set(value, id);
    const { kind, omit } = classify(value);
    const node: GraphNode = { kind, data: {} };
    nodes.push(node);
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined || omit?.has(key)) continue;
      if (forbidden.has(key)) throw new Error("Invalid save property");
      node.data[key] = encode(child);
    }
    return { ref: id };
  }
  return { root: encode(root), nodes };
}

export function validateSaveGraph(value: unknown): asserts value is SaveGraph {
  if (!value || typeof value !== "object") throw new Error("Invalid save graph");
  const graph = value as SaveGraph;
  if (!Array.isArray(graph.nodes) || graph.nodes.length > 250000) throw new Error("Invalid save nodes");
  const validValue = (value: Value): boolean => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (!value || typeof value !== "object" || Object.keys(value).length !== 1) return false;
    if ("ref" in value) return Number.isInteger(value.ref) && value.ref >= 0 && value.ref < graph.nodes.length;
    return "number" in value && ["Infinity", "-Infinity", "NaN"].includes(value.number);
  };
  if (!validValue(graph.root)) throw new Error("Invalid save root");
  for (const node of graph.nodes) {
    if (!node || !["object", "array", "tower", "enemy", "projectile", "enemyProjectile", "mortar"].includes(node.kind) ||
        !node.data || typeof node.data !== "object" || Array.isArray(node.data)) throw new Error("Invalid save node");
    for (const [key, child] of Object.entries(node.data)) {
      if (forbidden.has(key) || !validValue(child)) throw new Error("Invalid save field");
      if (node.kind === "array" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) > 250000)) throw new Error("Invalid save array");
    }
  }
}

export function decodeSaveGraph<T>(graph: SaveGraph, create: (node: GraphNode) => object): T {
  validateSaveGraph(graph);
  const objects = graph.nodes.map(node => node.kind === "array" ? [] : node.kind === "object" ? {} : create(node));
  function decode(value: Value): unknown {
    if (value !== null && typeof value === "object") {
      return "ref" in value ? objects[value.ref] : Number(value.number);
    }
    return value;
  }
  graph.nodes.forEach((node, index) => {
    for (const [key, value] of Object.entries(node.data)) Object.defineProperty(objects[index], key,
      { value: decode(value), writable: true, enumerable: true, configurable: true });
  });
  return decode(graph.root) as T;
}
