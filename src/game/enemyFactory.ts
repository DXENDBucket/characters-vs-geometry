import type Phaser from "phaser";
import { battleRandom, isBattlePlayback } from "./battleSimulation";
import { recordEnemySeen } from "../progress";
import { createEnemyStatusVisuals } from "../render/enemyStatusVisuals";
import { enemyFamily } from "../registry/enemies";
import { createEnemyShape } from "../render/unitShapes";
import { syncEnemyFacingVisual } from "../render/enemyFacing";
import type { Enemy } from "../types";
import { createEnemyState, type CreateEnemyOptions } from "./enemyState";
import { identifyBattleEntity } from "./battleEntityIds";
import { enemyIsSolarBomb } from "./enemyIdentity";
import { syncSolarBombVisual } from "./solarBomb";
import { statusSpeedMultiplier } from "./statusEffects";
import { syncEnemyStatusVisuals } from "../render/enemyStatus";

export function createEnemy(scene: Phaser.Scene, options: CreateEnemyOptions): Enemy {
  if (!isBattlePlayback(scene)) recordEnemySeen(options.kind);
  const state = createEnemyState(options, () => battleRandom(scene).next());
  const body = scene.add.container(state.x, state.y).setDepth(60 + options.lane);
  const visuals = createEnemyStatusVisuals(scene);
  const shape = createEnemyShape(scene, options.kind, { squareSize: 42, shootingNoseX: -24 });
  body.add([visuals.frozenBorder, visuals.statusBorder, visuals.flyingHalo, shape,
    visuals.powerIcon, visuals.sunderIcon, visuals.armorIcon, visuals.magicResistanceIcon]);

  const enemy = {
    ...state,
    ...visuals,
    body,
    shape
  } as Enemy;

  if (enemyFamily(enemy.kind) === "archangelHeptagon") {
    statusSpeedMultiplier(enemy, options.time);
    syncEnemyStatusVisuals(enemy, options.time);
    enemy.body.setDepth(85 + enemy.lane);
  }
  if (enemyIsSolarBomb(enemy)) syncSolarBombVisual(enemy);
  syncEnemyFacingVisual(enemy);
  return identifyBattleEntity(scene, "enemy", enemy);
}
