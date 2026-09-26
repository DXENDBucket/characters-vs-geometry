import type { CubeBoss, Enemy, Tower } from "../types";
import type { BossRuntime } from "../game/bossRuntime";
import type { BossSimulationRuntime } from "../game/bossSimulationRuntime";
import { createCubeBoss, syncCubeBossMotionVisual } from "../bosses/cubeBoss";
import { battleRandom, isBattlePlayback } from "../game/battleSimulation";
import { observeBattleEnemy } from "../game/battleDiscovery";
import { spawnEnemyAt } from "../game/enemyRuntime";
import { syncPromotedEnemyVisual } from "../game/enemyBehaviors";
import { createMortarProjectile } from "../game/projectiles";
import {
  isTetrahedronBossKind, isDodecahedronBossKind, isSmallStellatedDodecahedronBossKind,
  isOctahedronBossKind, isIcosahedronBossKind
} from "../game/bossRules";
import { syncBossCopyWarnings } from "./bossCopyWarnings";
import { syncDelSweepWarning, syncEnvironmentalDelWarning } from "./delSweepWarning";
import { syncDodecahedronCompanionShape } from "./unitShapes";
import { makeWingPulse } from "./enemySkillEffects";
import {
  makeBossHasteTrail, makeCubeCollapse, makeDelCollapse, makeDodecahedronCollapse,
  makeEnemyHitShards, makeEnemyInvincibleFlash, makeEnemyLaserEffect,
  makeIcosahedronCollapse, makeOctahedronCollapse, makeSmallStellatedDodecahedronCollapse,
  makeTetrahedronCollapse
} from "./combatEffects";

const runtimes = new WeakMap<BossRuntime, BossSimulationRuntime>();

export function bindBossSimulationRuntime(live: BossRuntime, runtime: BossSimulationRuntime) {
  runtime.presentation = bossSimulationRuntime(live).presentation;
  runtimes.set(live, runtime);
}

export function bossSimulationRuntime(live: BossRuntime): BossSimulationRuntime {
  let runtime = runtimes.get(live);
  if (!runtime) {
    runtime = {
      get enemies() { return live.enemies; },
      get towers() { return live.towers; },
      get mortarProjectiles() { return live.mortarProjectiles; },
      get wave() { return live.wave; },
      get bossPhaseIndex() { return live.bossPhaseIndex; },
      get battleTime() { return live.battleTime; },
      get finalDamageReduction() { return live.finalDamageReduction; },
      getBoss: () => live.getBoss(),
      random: () => battleRandom(live.scene).next(),
      createBoss: (kind, reduction, options) => createCubeBoss(live.scene, kind, reduction, options),
      createMortar: spec => createMortarProjectile(live.scene, spec),
      spawnEnemy: options => { spawnEnemyAt(live, options); },
      onEnemyPromotion: kind => {
        if (!isBattlePlayback(live.scene)) observeBattleEnemy(live.scene, kind);
      },
      scheduleBattleAction: (delay, action) => live.scheduleBattleAction(delay, action),
      nullifyTowers: duration => live.nullifyTowers(duration),
      warnCellSeal: (lane, column, warning, duration, leadIn) => live.warnCellSeal(lane, column, warning, duration, leadIn),
      sealCell: (lane, column, duration) => live.sealCell(lane, column, duration),
      damageTower: (tower, damage, type) => live.damageTower(tower as Tower, damage, type),
      triggerTrapTower: (tower, target) => live.triggerTrapTower(tower as Tower, target as Enemy | CubeBoss | "boss"),
      triggerShockTower: tower => live.triggerShockTower(tower as Tower),
      endGame: () => live.endGame(),
      presentation: {
        motion: (boss, seconds, time) => syncCubeBossMotionVisual(boss as CubeBoss, seconds, time),
        bossDepth: (boss, depth) => { (boss as CubeBoss).body.setDepth(depth); },
        removeEcho: boss => { (boss as CubeBoss).body.destroy(); },
        sweepWarning: (boss, time) => syncDelSweepWarning(boss as CubeBoss, time),
        environmentalWarning: (lanes, progress, elapsed) => syncEnvironmentalDelWarning(live.scene, lanes, progress, elapsed),
        copyWarnings: (boss, time) => syncBossCopyWarnings(boss as CubeBoss, time),
        companionDepth: (enemy, depth) => { (enemy as Enemy).body.setDepth(depth); },
        companionPosition: enemy => { (enemy as Enemy).body.setPosition(enemy.x, enemy.y); },
        companionShape: (enemy, boss, invincible, appearance) =>
          syncDodecahedronCompanionShape((enemy as Enemy).shape, boss as CubeBoss, invincible, appearance),
        promoted: enemy => syncPromotedEnemyVisual(live.scene, enemy as Enemy),
        collapse: (kind, x, y, follow) => {
          const draw = kind === "del" ? makeDelCollapse
            : isTetrahedronBossKind(kind) ? makeTetrahedronCollapse
            : isDodecahedronBossKind(kind) ? makeDodecahedronCollapse
            : isSmallStellatedDodecahedronBossKind(kind) ? makeSmallStellatedDodecahedronCollapse
            : isOctahedronBossKind(kind) ? makeOctahedronCollapse
            : isIcosahedronBossKind(kind) ? makeIcosahedronCollapse : makeCubeCollapse;
          draw(live.scene, x, y, follow as Enemy | Tower | undefined);
        },
        laser: (x, y, endX) => makeEnemyLaserEffect(live.scene, x, y, endX),
        hit: (x, y) => makeEnemyHitShards(live.scene, x, y),
        invincible: (x, y) => makeEnemyInvincibleFlash(live.scene, x, y),
        haste: (x, y) => makeBossHasteTrail(live.scene, x, y),
        wings: (x, y) => makeWingPulse(live.scene, x, y)
      }
    };
    runtimes.set(live, runtime);
  }
  return runtime;
}
