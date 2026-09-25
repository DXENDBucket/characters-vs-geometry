import { parseBattleEntityId } from "./battleEntityIds";
import { damageLessons } from "./damageTutorialLessons";
import { validTutorialInteraction, type TutorialInteraction } from "./tutorialInteraction";

export const TUTORIAL_STEPS = {
  tutorialBasics: ["welcome", "producer", "attacker", "incomingReady", "firstWave", "defender", "blockingReady", "blockingWave", "upgrade", "reinforce", "finalReady", "finalWave", "complete"],
  tutorialTowerTypes: ["categories", "functionClass", "deployF", "fReady", "fActive", "deployG", "armingG", "gReady", "gActive", "complete"],
  tutorialAutoUpgrade: ["intro", "deploy", "selectAuto", "mark", "waiting", "controls", "batchMark", "batchClear", "selectErase", "erase", "complete"],
  tutorialShifter: ["intro", "deploy", "singleTool", "singleSelect", "singleMove", "cooldown", "multiTool", "multiFirst", "multiSecond", "multiMove", "complete"]
} as const;

type StepState<K extends keyof typeof TUTORIAL_STEPS> = { kind: K; step: typeof TUTORIAL_STEPS[K][number] };
export type TutorialState = { version: 1 } & (
  StepState<"tutorialBasics"> |
  StepState<"tutorialTowerTypes"> & { fTowerId: string | null; gTowerId: string | null } |
  StepState<"tutorialAutoUpgrade"> & { towerId: string | null } |
  StepState<"tutorialShifter"> & { singleTowerId: string | null; groupATowerId: string | null; groupBTowerId: string | null } |
  { kind: "tutorialPractice"; started: boolean } |
  { kind: "tutorialDamage"; index: number; fired: boolean }
);
export type TutorialKind = TutorialState["kind"];
export interface TutorialCheckpoint { state: TutorialState; interaction: TutorialInteraction }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;
const fields = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const towerId = (value: unknown) => value === null || typeof value === "string" && value.length <= 40 &&
  parseBattleEntityId(value)?.kind === "tower";
const references = {
  tutorialBasics: [], tutorialTowerTypes: ["fTowerId", "gTowerId"],
  tutorialAutoUpgrade: ["towerId"], tutorialShifter: ["singleTowerId", "groupATowerId", "groupBTowerId"]
} as const;

export function copyTutorialState<K extends TutorialKind>(value: unknown, kind: K): Extract<TutorialState, { kind: K }> {
  if (!record(value) || value.version !== 1 || value.kind !== kind) throw new Error("Invalid tutorial state");
  if (kind === "tutorialPractice") {
    if (!fields(value, ["version", "kind", "started"]) || typeof value.started !== "boolean") throw new Error("Invalid tutorial state");
  } else if (kind === "tutorialDamage") {
    if (!fields(value, ["version", "kind", "index", "fired"]) || !Number.isInteger(value.index) ||
        (value.index as number) < -1 || (value.index as number) > damageLessons.length || typeof value.fired !== "boolean" ||
        ((value.index as number) < 0 || value.index === damageLessons.length) && value.fired) throw new Error("Invalid tutorial state");
  } else {
    if (!Object.hasOwn(TUTORIAL_STEPS, kind)) throw new Error("Invalid tutorial kind");
    const key = kind as keyof typeof TUTORIAL_STEPS, refs = references[key];
    if (!fields(value, ["version", "kind", "step", ...refs]) ||
        !(TUTORIAL_STEPS[key] as readonly unknown[]).includes(value.step) ||
        refs.some(ref => !towerId(value[ref]))) throw new Error("Invalid tutorial state");
  }
  return { ...value } as Extract<TutorialState, { kind: K }>;
}

export function copyTutorialCheckpoint(value: unknown): TutorialCheckpoint {
  if (!record(value) || !fields(value, ["state", "interaction"]) || !record(value.state) ||
      !validTutorialInteraction(value.interaction)) throw new Error("Invalid tutorial checkpoint");
  const state = copyTutorialState(value.state, value.state.kind as TutorialKind);
  if (state.kind !== "tutorialAutoUpgrade" && state.kind !== "tutorialShifter" &&
      (value.interaction.tool !== "none" || value.interaction.selected.length)) throw new Error("Unexpected tutorial interaction");
  return { state, interaction: { tool: value.interaction.tool, selected: [...value.interaction.selected] } };
}
