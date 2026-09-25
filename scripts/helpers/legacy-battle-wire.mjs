// Frozen pre-fusion encoder for byte-for-byte compatibility and same-process cost comparisons.
export function legacyEncodeBattleWireGraph(input, { canonicalSaveGraph, classifyBattleData, parseBattleEntityId }) {
  const graph = canonicalSaveGraph(input);
  const objects = [], entities = [], references = [], records = [], ids = new Set();
  for (const node of graph.nodes) {
    const classification = node.kind === "array" ? { kind: "array" } : classifyBattleData(node.data);
    if (classification.kind !== node.kind) throw Error("Battle wire node kind mismatch");
    const kind = classification.entityKind, id = node.data.entityId;
    if (kind) {
      const parsed = parseBattleEntityId(id);
      if (!parsed || parsed.kind !== kind || typeof id !== "string" || ids.has(id)) throw Error("Invalid battle wire identity");
      ids.add(id);
      const entry = { id, kind, data: {} };
      entities.push(entry); records.push(entry); references.push({ entity: id });
    } else {
      if (id !== undefined) throw Error("Identity on non-entity battle object");
      const entry = { kind: node.kind, data: {} };
      references.push({ object: objects.length }); objects.push(entry); records.push(entry);
    }
  }
  const encode = value => value !== null && typeof value === "object"
    ? "ref" in value ? { ...references[value.ref] } : { number: value.number } : value;
  graph.nodes.forEach((node, index) => {
    for (const [key, value] of Object.entries(node.data)) if (key !== "entityId") records[index].data[key] = encode(value);
  });
  entities.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { version: 2, root: encode(graph.root), objects, entities };
}
