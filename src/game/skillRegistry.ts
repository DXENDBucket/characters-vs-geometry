import type { SkillState } from "../types";
import { getSkillState } from "./skillState";

export interface SkillUnit {
  skills: Record<string, SkillState>;
}

export interface RegisteredSkillDefinition<Unit extends SkillUnit, Runtime> {
  stateKey: string;
  update: (unit: Unit, state: SkillState, seconds: number, time: number, runtime: Runtime) => void;
  reset?: (unit: Unit, state: SkillState, runtime: Runtime) => void;
}

export function updateRegisteredSkills<Unit extends SkillUnit, Runtime>(
  units: Iterable<Unit>,
  definitionsForUnit: (unit: Unit) => readonly RegisteredSkillDefinition<Unit, Runtime>[],
  runtime: Runtime,
  seconds: number,
  time: number
) {
  for (const unit of units) {
    for (const definition of definitionsForUnit(unit)) {
      definition.update(unit, getSkillState(unit, definition.stateKey), seconds, time, runtime);
    }
  }
}
