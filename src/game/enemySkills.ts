import type Phaser from "phaser";
import type { Enemy, SkillState } from "../types";
import type { EnemySkillRuntime } from "./enemySkillRegistry";
import { updateEnemySkills as update, triggerAngelWings as wings, triggerArchangelAscension as ascension } from "./enemySkillExecution";
import { enemySkillPresentation } from "../render/enemySkills";

interface LiveEnemySkillRuntime { scene: Phaser.Scene; enemies: Enemy[] }
const adapters = new WeakMap<LiveEnemySkillRuntime, EnemySkillRuntime>();
export function updateEnemySkills(live: LiveEnemySkillRuntime, seconds: number, time: number) {
  let adapter = adapters.get(live);
  if (!adapter) {
    adapter = { get enemies() { return live.enemies; }, presentation: enemySkillPresentation(live.scene) };
    adapters.set(live, adapter);
  }
  update(adapter, seconds, time);
}
export function triggerAngelWings(scene: Phaser.Scene, enemies: Enemy[], caster: Enemy, time: number, skill?: SkillState) {
  wings(enemySkillPresentation(scene), enemies, caster, time, skill);
}
export function triggerArchangelAscension(scene: Phaser.Scene, enemies: Enemy[], caster: Enemy, time: number, skill?: SkillState) {
  ascension(enemySkillPresentation(scene), enemies, caster, time, skill);
}
