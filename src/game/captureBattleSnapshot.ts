import type { BattleSaveData } from "./battleSaveState";
import { classifyBattleData } from "./battleDataSchema";
import { parseBattleEntityId, validateBattleEntityIdState } from "./battleEntityIds";
import { encodeSaveGraph } from "./saveGraph";

const identityFields = new Set(["entityId"]);

export function captureBattleSnapshot(state: BattleSaveData, options: { includeEntityIds?: boolean } = {}) {
  const includeIds = options.includeEntityIds !== false;
  const allocator = includeIds ? state.entityIds : undefined;
  if (allocator !== undefined) validateBattleEntityIdState(allocator);
  const ids = new Set<string>();
  return encodeSaveGraph(includeIds ? state : { ...state, entityIds: undefined }, object => {
    const classification = classifyBattleData(object);
    if (allocator && classification.entityKind) {
      const id = (object as { entityId?: string }).entityId, parsed = parseBattleEntityId(id);
      if (!parsed || parsed.kind !== classification.entityKind || parsed.sequence >= allocator.nextId || ids.has(id!)) {
        throw new Error("Missing, invalid or duplicate battle entity ID");
      }
      ids.add(id!);
    }
    return includeIds ? classification : { ...classification, omit: identityFields };
  });
}
