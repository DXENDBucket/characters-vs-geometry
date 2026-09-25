import { DIFFICULTY_VERSION, getDifficultyConfig, migrateDifficulty } from "../config";
import { levelConfigs } from "../data/levels";
import { getCardDefinition } from "../registry/cardDefinitions";
import { validateReplay, type BattleReplay } from "./battleCommands";
import { BattleSession, type BattleSessionOptions } from "./battleSession";
import { BattleWorld, type BattleWorldOptions } from "./battleWorld";
import { isLoadoutCardId } from "./cardEligibility";
import { isTutorialMechanic } from "./tutorial";

export function battleWorldOptions(options: Pick<BattleSessionOptions, "levelId" | "difficulty" | "unlimitedFirepower">): BattleWorldOptions {
  if (!Object.hasOwn(levelConfigs, options.levelId)) throw new Error("Unknown battle level");
  const level = levelConfigs[options.levelId], tutorial = isTutorialMechanic(level.specialMechanic);
  const unlimitedFirepower = !tutorial && options.unlimitedFirepower;
  const difficulty = getDifficultyConfig(tutorial ? 1 : options.difficulty);
  return { levelId: options.levelId, level, unlimitedFirepower,
    difficulty: unlimitedFirepower ? { ...difficulty, weightMultiplier: difficulty.weightMultiplier * 10 } : difficulty };
}

// Caller supplies captured loadout/access policy; this never reads the local profile.
export function createBattleContext(options: BattleSessionOptions, playback?: BattleReplay, replica = false) {
  const source = playback ?? { ...options, commands: [], endTick: 0 };
  validateReplay(source);
  const { commands: _commands, endTick: _endTick, checkpoint: _checkpoint, ...header } = structuredClone(source);
  const difficulty = migrateDifficulty(header.difficulty, header.difficultyVersion);
  const worldOptions = battleWorldOptions({ ...header, difficulty });
  if (!header.selectedCards.every(isLoadoutCardId)) throw new Error("Invalid battle cards");
  const normalized = { ...header, difficulty, difficultyVersion: DIFFICULTY_VERSION, unlimitedFirepower: worldOptions.unlimitedFirepower };
  const session = new BattleSession(normalized, playback ? { ...source, ...normalized } : undefined, replica);
  const world = new BattleWorld(worldOptions, session.random, normalized.selectedCards.map(getCardDefinition));
  return { session, world };
}
