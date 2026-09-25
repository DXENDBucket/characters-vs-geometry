export type NodeKind = "object" | "array" | "tower" | "enemy" | "boss" | "projectile" | "enemyProjectile" | "mortar";
export type Value = null | boolean | string | number | { ref: number } | { number: "Infinity" | "-Infinity" | "NaN" };
export interface GraphNode { kind: NodeKind; data: Record<string, Value> }
export interface SaveGraph { root: Value; nodes: GraphNode[] }
const forbidden = new Set(["__proto__", "prototype", "constructor"]);

// References preserve shared health pools, targets and removed sources without copying Phaser objects.
export function encodeSaveGraph(root: unknown, classify: (object: object) => {
  kind: NodeKind; omit?: ReadonlySet<string>; include?: ReadonlySet<string>
}, options: { canonical?: boolean } = {}): SaveGraph {
  const nodes: GraphNode[] = [];
  const ids = new Map<object, number>();
  interface Pending { value: object; node: GraphNode; omit?: ReadonlySet<string>; include?: ReadonlySet<string> }
  const pending: Pending[] = [];
  function fill({ value, node, omit, include }: Pending) {
    const keys = Object.keys(value);
    if (options.canonical) keys.sort(node.kind === "array" ? (a, b) => Number(a) - Number(b) : undefined);
    for (const key of keys) {
      if (omit?.has(key) || (include && !include.has(key))) continue;
      if (forbidden.has(key)) throw new Error("Invalid save property");
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) node.data[key] = encode(child);
    }
  }
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
    const { kind, omit, include } = classify(value);
    const node: GraphNode = { kind, data: {} };
    nodes.push(node);
    const task = { value, node, omit, include };
    if (options.canonical) pending.push(task);
    else fill(task);
    return { ref: id };
  }
  const encodedRoot = encode(root);
  for (let index = 0; index < pending.length; index++) fill(pending[index]);
  return { root: encodedRoot, nodes };
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
    if (!node || !["object", "array", "tower", "enemy", "boss", "projectile", "enemyProjectile", "mortar"].includes(node.kind) ||
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

// Sorted breadth-first traversal normalizes keys AND reference numbers. Array order
// and object identity remain significant; insertion history and unreachable nodes do not.
export function canonicalSaveGraph(graph: SaveGraph): SaveGraph {
  validateSaveGraph(graph);
  const nodes: GraphNode[] = [], pending: number[] = [], ids = new Map<number, number>();
  const encode = (value: Value): Value => {
    if (value === null || typeof value !== "object") return value;
    if ("number" in value) return { number: value.number };
    let id = ids.get(value.ref);
    if (id === undefined) {
      id = nodes.length;
      ids.set(value.ref, id); pending.push(value.ref);
      nodes.push({ kind: graph.nodes[value.ref].kind, data: {} });
    }
    return { ref: id };
  };
  const root = encode(graph.root);
  for (let index = 0; index < pending.length; index++) {
    const source = graph.nodes[pending[index]], target = nodes[index];
    const keys = Object.keys(source.data).sort(source.kind === "array" ? (a, b) => Number(a) - Number(b) : undefined);
    for (const key of keys) target.data[key] = encode(source.data[key]);
  }
  return { root, nodes };
}
