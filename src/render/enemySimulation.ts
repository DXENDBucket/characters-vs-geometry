import type Phaser from "phaser";
import { FLYING_DISPLAY_OFFSET_Y, palette } from "../config";
import { enemyFamily } from "../registry/enemies";
import type { CubeBoss, Enemy, Tower } from "../types";
import type { EnemyAdvanceRuntime } from "../game/combatRuntime";
import type { EnemySimulationRuntime } from "../game/enemySimulationRuntime";
import type { EnemySimulationPresentation } from "../game/enemySimulationPresentation";
import { restoreEnemyProjectile, createMortarProjectile } from "../game/projectiles";
import { syncSolarBombVisual, rotateSolarBombVisual } from "../game/solarBomb";
import { syncEnemyFacingVisual } from "./enemyFacing";
import { syncChevronVisual } from "./chevronLeader";
import { syncParenthesisVisual } from "./parenthesisEnemy";
import { enemyReleasePresentation } from "./enemyRelease";
import { enemySkillPresentation } from "./enemySkills";
import {
  makeEnemyHitShards, makeEnemyLaserEffect, makeHasteTrail, makeHeartPulse,
  makeReflectFlash, makeSolarBombCollisionEffect, makeShellBurst, makeShockPulse
} from "./combatEffects";

const presentations = new WeakMap<Phaser.Scene, EnemySimulationPresentation>();

export function enemySimulationPresentation(scene: Phaser.Scene): EnemySimulationPresentation {
  let presentation = presentations.get(scene);
  if (!presentation) {
    presentation = {
      ...enemyReleasePresentation,
      ...enemySkillPresentation(scene),
      carrier: enemy => syncParenthesisVisual(enemy as Enemy),
      facing: enemy => syncEnemyFacingVisual(enemy as Enemy),
      chevron: enemy => syncChevronVisual(enemy as Enemy),
      solarBomb: enemy => syncSolarBombVisual(enemy as Enemy),
      rotateSolarBomb: (enemy, seconds) => rotateSolarBombVisual(enemy as Enemy, seconds),
      depth: (enemy, depth) => { (enemy as Enemy).body.setDepth(depth); },
      alpha: (enemy, alpha) => { (enemy as Enemy).body.setAlpha(alpha); },
      visible: (enemy, visible) => { (enemy as Enemy).body.setVisible(visible); },
      remove: enemy => { (enemy as Enemy).body.destroy(); },
      burrowTip: (state, visible) => {
        const enemy = state as Enemy;
        type VisiblePart = Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };
        const fullShape = enemy.shape.getData("burrowFull") as VisiblePart[] | undefined;
        const tip = enemy.shape.getData("burrowTip") as VisiblePart | undefined;
        fullShape?.forEach(part => part.setVisible(!visible));
        tip?.setVisible(visible);
      },
      highFlightHalo: (state, time) => {
        const enemy = state as Enemy;
        if (enemyFamily(enemy.kind) === "archangelHeptagon") {
          enemy.flyingHalo.setVisible(false);
          return;
        }
        enemy.flyingHalo.setVisible(true);
        enemy.flyingHalo.setStrokeStyle(2, palette.gold, 0.94);
        enemy.flyingHalo.setY(-44 + Math.sin(time / 95) * 2);
        enemy.flyingHalo.setScale(1 + Math.sin(time / 140) * 0.06, 1);
      },
      highFlightHover: (enemy, time) => {
        (enemy as Enemy).body.setPosition(enemy.x, enemy.y + FLYING_DISPLAY_OFFSET_Y + Math.sin(time / 130) * 2);
      },
      landHighFlight: state => {
        const enemy = state as Enemy;
        const regularHaloActive = enemy.statusEffects.some(effect => effect.name === "flying" && effect.showHalo);
        enemy.flyingHalo.setVisible(regularHaloActive);
        if (!regularHaloActive) enemy.flyingHalo.setScale(1, 1);
        enemy.body.setDepth(60 + enemy.lane);
      },
      hasteTrail: (x, y) => makeHasteTrail(scene, x, y),
      heartPulse: (x, y, radius) => makeHeartPulse(scene, x, y, radius),
      reflect: (x, y) => makeReflectFlash(scene, x, y),
      solarCollision: (x, y) => makeSolarBombCollisionEffect(scene, x, y),
      burst: (x, y, radius, type) => makeShellBurst(scene, x, y, radius, type),
      pulse: (x, y, rangeX, rangeY, type) => makeShockPulse(scene, x, y, rangeX, rangeY, type),
      laser: (x, y, endX) => makeEnemyLaserEffect(scene, x, y, endX),
      hit: (x, y) => makeEnemyHitShards(scene, x, y)
    };
    presentations.set(scene, presentation);
  }
  return presentation;
}

const runtimes = new WeakMap<EnemyAdvanceRuntime, EnemySimulationRuntime>();

export function bindEnemySimulationRuntime(live: EnemyAdvanceRuntime, runtime: EnemySimulationRuntime) {
  runtime.presentation = enemySimulationRuntime(live).presentation;
  runtimes.set(live, runtime);
}

export function enemySimulationRuntime(live: EnemyAdvanceRuntime): EnemySimulationRuntime {
  let runtime = runtimes.get(live);
  if (!runtime) {
    runtime = {
      get enemies() { return live.enemies; },
      get towers() { return live.towers; },
      get boss() { return live.boss; },
      get occupied() { return live.occupied; },
      get enemyProjectiles() { return live.enemyProjectiles; },
      get mortarProjectiles() { return live.mortarProjectiles; },
      get battleTime() { return live.battleTime; },
      get projectileMotion() { return live.projectileMotion; },
      presentation: enemySimulationPresentation(live.scene),
      scheduleBattleAction: (delay, action) => live.scheduleBattleAction(delay, action),
      createProjectile: state => restoreEnemyProjectile(live.scene, state),
      createMortar: spec => createMortarProjectile(live.scene, spec),
      damageTower: (tower, amount, type) => live.damageTower(tower as Tower, amount, type),
      damageEnemy: (enemy, amount, type, source) => live.damageEnemy(enemy as Enemy, amount, type, source as Tower | undefined),
      damageBoss: (amount, type, part) => live.damageBoss(amount, type, part as CubeBoss | undefined),
      onRetaliation: (tower, enemy) => live.onTowerAction?.(tower as Tower, { kind: "retaliation", target: enemy as Enemy }) ?? false,
      triggerTrapTower: (tower, target) => live.triggerTrapTower(tower as Tower, target as Enemy | CubeBoss | "boss"),
      triggerShockTower: tower => live.triggerShockTower(tower as Tower),
      onEnemyReachedBase: enemy => live.onEnemyReachedBase(enemy as Enemy)
    };
    runtimes.set(live, runtime);
  }
  return runtime;
}
