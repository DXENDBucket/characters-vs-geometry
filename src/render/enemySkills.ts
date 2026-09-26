import type Phaser from "phaser";
import type { Enemy } from "../types";
import type { EnemySkillPresentation } from "../game/enemySkillPresentation";
import { syncEnemyPositionVisual } from "./enemyStatus";
import { syncEnemyVisualScale } from "../game/enemyBehaviors";
import { makeHealParticles, makeShiftEffect, makeSupportWave } from "./combatEffects";
import { makeWingPulse } from "./enemySkillEffects";

const presentations = new WeakMap<object, EnemySkillPresentation>();
export function enemySkillPresentation(scene: Phaser.Scene): EnemySkillPresentation {
  let presentation = presentations.get(scene);
  if (!presentation) {
    presentation = {
      position: enemy => syncEnemyPositionVisual(enemy as Enemy),
      scale: enemy => syncEnemyVisualScale(enemy as Enemy),
      heal: (x, y) => makeHealParticles(scene, x, y),
      supportWave: (x, y, toX, toY) => makeSupportWave(scene, x, y, toX, toY),
      shift: (x, y, toX, toY) => makeShiftEffect(scene, x, y, toX, toY),
      wings: (x, y) => makeWingPulse(scene, x, y)
    };
    presentations.set(scene, presentation);
  }
  return presentation;
}
