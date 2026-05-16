import Phaser from "phaser";
import { BOARD_X, CUBE_BOSS_CONTACT_DAMAGE, CUBE_BOSS_CONTACT_INTERVAL } from "../config";
import {
  bossAdvanceSpawnPoints,
  chargeBossSkill,
  isBossSkillReady,
  spendBossSkill,
  updateCubeBossMotion
} from "../bosses/cubeBoss";
import { makeCubeCollapse } from "../render/combatEffects";
import type { CubeBoss, DamageType, Enemy, Tower } from "../types";
import { applyEnemyPromotion, findPromotionTarget, promotedKind } from "./enemyBehaviors";
import { spawnEnemyAt } from "./enemyRuntime";
import { movementSpeedMultiplier } from "./slowAura";
import { bossRect, towerRect } from "./targeting";
import { isTrapArmed } from "./towers";

export interface BossRuntime {
  scene: Phaser.Scene;
  enemies: Enemy[];
  towers: Tower[];
  getBoss: () => CubeBoss | null;
  wave: number;
  battleTime: number;
  finalDamageReduction: number;
  damageTower: (tower: Tower, damage: number, damageType: DamageType) => void;
  triggerTrapTower: (tower: Tower, target: Enemy | "boss") => void;
  triggerShockTower: (tower: Tower) => void;
  endGame: () => void;
}

export function updateBossRuntime(runtime: BossRuntime, seconds: number) {
  const boss = runtime.getBoss();
  if (!boss) {
    return;
  }

  updateCubeBossMotion(boss, seconds, movementSpeedMultiplier(runtime.towers, boss.x, boss.y));
  updateBossSkills(runtime, boss, seconds);
  triggerFunctionalTowersTouchingBoss(runtime, boss);
  if (!runtime.getBoss()) {
    return;
  }
  damageBossTouchingTowers(runtime, boss, seconds);

  if (bossRect(boss).left <= BOARD_X - 20) {
    runtime.endGame();
  }
}

function triggerFunctionalTowersTouchingBoss(runtime: BossRuntime, boss: CubeBoss) {
  const rect = bossRect(boss);
  for (const tower of [...runtime.towers]) {
    if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, towerRect(tower))) {
      continue;
    }

    if (tower.type === "G" && isTrapArmed(tower, runtime.battleTime)) {
      runtime.triggerTrapTower(tower, "boss");
      if (!runtime.getBoss()) {
        return;
      }
      continue;
    }

    if (tower.type === "F") {
      runtime.triggerShockTower(tower);
    }
  }
}

function damageBossTouchingTowers(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  boss.contactAttackBuffer += seconds;
  if (boss.contactAttackBuffer < CUBE_BOSS_CONTACT_INTERVAL) {
    return;
  }

  const rect = bossRect(boss);
  while (boss.contactAttackBuffer >= CUBE_BOSS_CONTACT_INTERVAL) {
    const targets = runtime.towers.filter((tower) => {
      return Phaser.Geom.Intersects.RectangleToRectangle(rect, towerRect(tower));
    });

    for (const tower of targets) {
      makeCubeCollapse(runtime.scene, tower.x, tower.y, tower, runtime.enemies, runtime.towers);
      runtime.damageTower(tower, CUBE_BOSS_CONTACT_DAMAGE, "physical");
    }

    boss.contactAttackBuffer -= CUBE_BOSS_CONTACT_INTERVAL;
  }
}

function updateBossSkills(runtime: BossRuntime, boss: CubeBoss, seconds: number) {
  chargeBossSkill(boss.skills.promotion, seconds);
  chargeBossSkill(boss.skills.advance, seconds);
  if (boss.skills.promotion2) {
    chargeBossSkill(boss.skills.promotion2, seconds);
    tryUsePromotionSkill(runtime, boss, boss.skills.promotion2, 2);
  }
  tryUsePromotionSkill(runtime, boss, boss.skills.promotion, 1);
  tryUseAdvanceSkill(runtime, boss);
}

function tryUsePromotionSkill(
  runtime: BossRuntime,
  boss: CubeBoss,
  skill: CubeBoss["skills"]["promotion"] | NonNullable<CubeBoss["skills"]["promotion2"]>,
  fromRank: number
) {
  if (!isBossSkillReady(skill)) {
    return;
  }

  const target = findPromotionTarget(boss, runtime.enemies, fromRank);
  if (!target) {
    return;
  }

  spendBossSkill(skill);
  promoteEnemy(runtime, target);
}

function tryUseAdvanceSkill(runtime: BossRuntime, boss: CubeBoss) {
  const skill = boss.skills.advance;
  if (!isBossSkillReady(skill)) {
    return;
  }

  spendBossSkill(skill);
  summonBossAdvanceMinions(runtime, boss);
}

function promoteEnemy(runtime: BossRuntime, enemy: Enemy) {
  const nextKind = promotedKind(enemy.kind);
  if (!nextKind || !runtime.enemies.includes(enemy)) {
    return;
  }

  applyEnemyPromotion(runtime.scene, enemy, nextKind, runtime.battleTime);
  makeCubeCollapse(runtime.scene, enemy.x, enemy.y, enemy, runtime.enemies, runtime.towers);
}

function summonBossAdvanceMinions(runtime: BossRuntime, boss: CubeBoss) {
  const waveNumber = runtime.wave || 0;
  for (const point of bossAdvanceSpawnPoints(boss)) {
    spawnEnemyAt(runtime, {
      kind: boss.advanceMinionKind,
      waveNumber,
      time: runtime.battleTime,
      lane: point.lane,
      x: point.x,
      waveWeight: 0,
      finalDamageReduction: runtime.finalDamageReduction
    });
    makeCubeCollapse(runtime.scene, point.x, point.y);
  }
}
