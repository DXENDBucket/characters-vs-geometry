import Phaser from "phaser";
import { BOARD_X, CELL_HEIGHT, CELL_WIDTH } from "../config";
import { makeHealParticles, makeShiftEffect } from "../render/combatEffects";
import type { CubeBoss, Enemy, SkillState } from "../types";
import { enemyFamily, enemyIsBossCompanion, enemyRank } from "../registry/enemies";
import { enemyIgnoresLeaderRestrictedMechanics, enemyIsHighFlying, syncEnemyVisualScale } from "./enemyBehaviors";
import { createEnemySkillRegistry, enemySkillDefinitions, type EnemySkillRuntime } from "./enemySkillRegistry";
import { updateRegisteredSkills } from "./skillRegistry";
import { gainSkillSp, getEnemySkillState, isSkillReady, spendSkillSp } from "./skillState";
import { applyStatusEffect, hasStatusEffect, syncEnemyBodyPosition } from "./statusEffects";
import { bossRect } from "./targeting";

const HEX_ARMOR_RADIUS = CELL_WIDTH * 1.4;
const HEX_ARMOR_RANK_ONE_BONUS = 50;
const HEX_ARMOR_BONUS_PER_EXTRA_RANK = 30;
const HEX_SPELL_BULWARK_RANK_ONE_MAGIC_RESISTANCE_BONUS = 40;
const HEX_SPELL_BULWARK_MAGIC_RESISTANCE_BONUS_PER_EXTRA_RANK = 10;
const HEX_HEAL_SKILL_MAX = 20;
const HEX_HEAL_SKILL_COST = 20;
const HEX_HEAL_SKILL_REGEN_PER_SECOND = 1;
const HEX_HEAL_RATIO = 0.3;
const CHARGING_HEX_SPEED_MULTIPLIER = 1.5;
const LEADER_SPEED_MULTIPLIER = 1.5;
const HEART_LEAD_SKILL_MAX = 5;
const HEART_LEAD_SKILL_COST = 5;
const HEART_LEAD_REGEN_PER_SECOND = 1;
const HEART_LEAD_COLUMN_SPAN = 5;
const HEART_LEAD_LANE_RADIUS = 2;
const ANGEL_WINGS_SKILL_MAX = 15;
const ANGEL_WINGS_SKILL_COST = 15;
const ANGEL_WINGS_REGEN_PER_SECOND = 1;
const ANGEL_WINGS_DURATION = 3_000;
const ANGEL_WINGS_RANGE_X = CELL_WIDTH * 1.5;
const ANGEL_WINGS_RANGE_Y = CELL_HEIGHT * 1.5;
const ARCHANGEL_ASCENSION_SKILL_MAX = 15;
const ARCHANGEL_ASCENSION_SKILL_COST = 15;
const ARCHANGEL_ASCENSION_REGEN_PER_SECOND = 1;
const ARCHANGEL_ASCENSION_DURATION = 6_000;
const ARCHANGEL_ASCENSION_RADIUS = CELL_WIDTH * 2.5;
const ANGEL_WINGS_SPEED_MULTIPLIER = 2;

const enemySkillRegistry = createEnemySkillRegistry({
  updateHexHeal,
  updateAngelWings,
  updateArchangelAscension,
  updateHeartLead
});

export function hexArmorBonus(enemies: Enemy[], target: Enemy) {
  return hexArmorSources(enemies, target).reduce((total, enemy) => total + hexArmorAuraBonus(enemy), 0);
}

export function hexMagicResistanceBonus(enemies: Enemy[], target: Enemy) {
  return hexMagicResistanceSources(enemies, target)
    .reduce((total, enemy) => total + hexMagicResistanceAuraBonus(enemy), 0);
}

export function hexBossArmorBonus(enemies: Enemy[], boss: CubeBoss | null) {
  if (!boss) {
    return 0;
  }

  return enemies
    .filter((enemy) => !enemyIsHighFlying(enemy) && isHexagon(enemy) && bossBodyInRadius(boss, enemy.x, enemy.y, HEX_ARMOR_RADIUS))
    .reduce((total, enemy) => total + hexArmorAuraBonus(enemy), 0);
}

function bossBodyInRadius(boss: CubeBoss, x: number, y: number, radius: number) {
  const rect = bossRect(boss);
  const closestX = Phaser.Math.Clamp(x, rect.left, rect.right);
  const closestY = Phaser.Math.Clamp(y, rect.top, rect.bottom);
  return Math.hypot(x - closestX, y - closestY) <= radius;
}

export function syncHexArmorAuras(enemies: Enemy[], time: number) {
  for (const enemy of enemies) {
    const armorStacks = enemyIsHighFlying(enemy) ? 0 : hexArmorStacks(enemies, enemy);
    const magicResistanceStacks = enemyIsHighFlying(enemy) ? 0 : hexMagicResistanceStacks(enemies, enemy);
    const hasArmorBonus = armorStacks > 0;
    const hasMagicResistanceBonus = magicResistanceStacks > 0;
    const iconY = -38 + Math.sin(time / 110) * 2;

    enemy.armorIcon.setVisible(hasArmorBonus);
    enemy.magicResistanceIcon.setVisible(hasMagicResistanceBonus);
    if (hasArmorBonus) {
      enemy.armorIcon.setPosition(hasMagicResistanceBonus ? -10 : 0, iconY);
    }
    if (hasMagicResistanceBonus) {
      enemy.magicResistanceIcon.setPosition(hasArmorBonus ? 10 : 0, iconY);
    }
  }
}

export function chargingHexSpeedMultiplier(enemies: Enemy[], target: Enemy) {
  const hasChargingHexBuff = enemies.some((enemy) => {
    return !enemyIsHighFlying(enemy) && enemyFamily(enemy.kind) === "chargingHexagon" && enemy.lane === target.lane && enemy.x < target.x;
  });
  const hasLeaderBuff = enemies.some((enemy) => {
    return !enemyIsHighFlying(enemy) && enemyFamily(enemy.kind) === "heart" && enemy.lane === target.lane && enemy.x < target.x;
  });

  return hasChargingHexBuff || hasLeaderBuff
    ? Math.max(CHARGING_HEX_SPEED_MULTIPLIER, LEADER_SPEED_MULTIPLIER)
    : 1;
}

export function updateEnemySkills(runtime: EnemySkillRuntime, seconds: number, time: number) {
  const activeEnemies = runtime.enemies.filter((enemy) => !enemyIsHighFlying(enemy) && !hasStatusEffect(enemy, "frozen", time));
  updateRegisteredSkills(
    activeEnemies.filter((enemy) => enemyFamily(enemy.kind) !== "heart"),
    (enemy) => enemySkillDefinitions(enemySkillRegistry, enemy),
    runtime,
    seconds,
    time
  );
  updateHeartLeads(runtime.scene, runtime.enemies, activeEnemies, seconds);
}

function hexArmorStacks(enemies: Enemy[], target: Enemy) {
  return hexArmorSources(enemies, target).length;
}

function hexArmorSources(enemies: Enemy[], target: Enemy) {
  return enemies.filter((enemy) => !enemyIsHighFlying(enemy) && isHexagon(enemy) && Math.hypot(enemy.x - target.x, enemy.y - target.y) <= HEX_ARMOR_RADIUS);
}

function hexArmorAuraBonus(enemy: Enemy) {
  return HEX_ARMOR_RANK_ONE_BONUS + Math.max(0, enemyRank(enemy.kind) - 1) * HEX_ARMOR_BONUS_PER_EXTRA_RANK;
}

function hexMagicResistanceStacks(enemies: Enemy[], target: Enemy) {
  return hexMagicResistanceSources(enemies, target).length;
}

function hexMagicResistanceSources(enemies: Enemy[], target: Enemy) {
  return enemies.filter((enemy) => {
    return (
      !enemyIsHighFlying(enemy) &&
      enemyFamily(enemy.kind) === "hexSpellBulwark" &&
      enemy.lane === target.lane
    );
  });
}

function hexMagicResistanceAuraBonus(enemy: Enemy) {
  return (
    HEX_SPELL_BULWARK_RANK_ONE_MAGIC_RESISTANCE_BONUS +
    Math.max(0, enemyRank(enemy.kind) - 1) * HEX_SPELL_BULWARK_MAGIC_RESISTANCE_BONUS_PER_EXTRA_RANK
  );
}

function updateHexHeal(enemy: Enemy, state: SkillState, seconds: number, _time: number, runtime: EnemySkillRuntime) {
  gainSkillSp(state, seconds * HEX_HEAL_SKILL_REGEN_PER_SECOND, HEX_HEAL_SKILL_MAX);
  tryUseHexHeal(runtime.scene, runtime.enemies, enemy, state);
}

function updateAngelWings(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (time < state.activeUntil) {
    return;
  }

  gainSkillSp(state, seconds * ANGEL_WINGS_REGEN_PER_SECOND * skillRegenMultiplier(state), ANGEL_WINGS_SKILL_MAX);
  if (isSkillReady(state, ANGEL_WINGS_SKILL_MAX)) {
    triggerAngelWings(runtime.scene, runtime.enemies, enemy, time, state);
  }
}

function updateArchangelAscension(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (time < state.activeUntil) {
    return;
  }

  gainSkillSp(state, seconds * ARCHANGEL_ASCENSION_REGEN_PER_SECOND * skillRegenMultiplier(state), ARCHANGEL_ASCENSION_SKILL_MAX);
  if (isSkillReady(state, ARCHANGEL_ASCENSION_SKILL_MAX)) {
    triggerArchangelAscension(runtime.scene, runtime.enemies, enemy, time, state);
  }
}

function updateHeartLead(enemy: Enemy, state: SkillState, seconds: number, _time: number, runtime: EnemySkillRuntime) {
  gainSkillSp(state, seconds * HEART_LEAD_REGEN_PER_SECOND, HEART_LEAD_SKILL_MAX);
  if (!isSkillReady(state, HEART_LEAD_SKILL_MAX)) {
    return;
  }

  tryUseHeartLead(runtime.scene, runtime.enemies, enemy, state);
}

function updateHeartLeads(scene: Phaser.Scene, enemies: Enemy[], activeEnemies: Enemy[], seconds: number) {
  const originalPositions = new Map(enemies.map((enemy) => [enemy, { x: enemy.x, y: enemy.y, lane: enemy.lane }]));
  const claimedTargets = new Set<Enemy>();
  const leadPlans: Array<{ caster: Enemy; skill: SkillState; targets: Enemy[] }> = [];

  for (const caster of activeEnemies) {
    if (enemyFamily(caster.kind) !== "heart") {
      continue;
    }

    const skill = getEnemySkillState(caster, "lead");
    gainSkillSp(skill, seconds * HEART_LEAD_REGEN_PER_SECOND, HEART_LEAD_SKILL_MAX);
    if (!isSkillReady(skill, HEART_LEAD_SKILL_MAX)) {
      continue;
    }

    const targets = heartLeadTargets(enemies, caster, originalPositions, claimedTargets);
    if (targets.length === 0) {
      continue;
    }

    for (const target of targets) {
      claimedTargets.add(target);
    }
    leadPlans.push({ caster, skill, targets });
  }

  for (const plan of leadPlans) {
    spendSkillSp(plan.skill, HEART_LEAD_SKILL_COST);
    for (const target of plan.targets) {
      const previousY = target.y;
      target.lane = plan.caster.lane;
      target.y = plan.caster.y;
      syncEnemyBodyPosition(target);
      makeShiftEffect(scene, target.x, previousY, target.x, target.y);
    }
  }
}

function tryUseHexHeal(scene: Phaser.Scene, enemies: Enemy[], healer: Enemy, skill: SkillState) {
  if (!isSkillReady(skill, HEX_HEAL_SKILL_MAX)) {
    return;
  }

  const target = enemies
    .filter((enemy) => {
      return (
        !enemyIsHighFlying(enemy) &&
        enemy.hp < enemy.baseStats.maxHp &&
        Math.hypot(enemy.x - healer.x, enemy.y - healer.y) <= HEX_ARMOR_RADIUS
      );
    })
    .sort((a, b) => a.hp / a.baseStats.maxHp - b.hp / b.baseStats.maxHp)[0];
  if (!target) {
    return;
  }

  spendSkillSp(skill, HEX_HEAL_SKILL_COST);
  const previousHp = target.hp;
  target.hp = Math.min(target.baseStats.maxHp, target.hp + healer.baseStats.maxHp * HEX_HEAL_RATIO);
  if (target.hp <= previousHp) {
    return;
  }

  syncEnemyVisualScale(target);
  makeHealParticles(scene, target.x, target.y);
}

function isHexagon(enemy: Enemy) {
  return enemyFamily(enemy.kind) === "hexagon";
}

function tryUseHeartLead(scene: Phaser.Scene, enemies: Enemy[], caster: Enemy, skill: SkillState) {
  const originalPositions = new Map(enemies.map((enemy) => [enemy, { x: enemy.x, y: enemy.y, lane: enemy.lane }]));
  const targets = heartLeadTargets(enemies, caster, originalPositions, new Set());

  if (targets.length === 0) {
    return;
  }

  spendSkillSp(skill, HEART_LEAD_SKILL_COST);
  for (const target of targets) {
    const previousY = target.y;
    target.lane = caster.lane;
    target.y = caster.y;
    syncEnemyBodyPosition(target);
    makeShiftEffect(scene, target.x, previousY, target.x, target.y);
  }
}

function heartLeadTargets(
  enemies: Enemy[],
  caster: Enemy,
  originalPositions: Map<Enemy, { x: number; y: number; lane: number }>,
  claimedTargets: Set<Enemy>
) {
  const casterPosition = originalPositions.get(caster);
  if (!casterPosition) {
    return [];
  }

  const casterColumn = Math.floor((casterPosition.x - BOARD_X) / CELL_WIDTH);
  const left = BOARD_X + casterColumn * CELL_WIDTH;
  const right = left + HEART_LEAD_COLUMN_SPAN * CELL_WIDTH;
  return enemies.filter((enemy) => {
    const position = originalPositions.get(enemy);
    return (
      position !== undefined &&
      enemy !== caster &&
      !claimedTargets.has(enemy) &&
      isOrdinaryLeadTarget(enemy) &&
      position.x >= left &&
      position.x < right &&
      Math.abs(position.lane - casterPosition.lane) <= HEART_LEAD_LANE_RADIUS &&
      position.lane !== casterPosition.lane
    );
  });
}

function isOrdinaryLeadTarget(enemy: Enemy) {
  return !enemyIgnoresLeaderRestrictedMechanics(enemy) && !enemyIsBossCompanion(enemy.kind) && !enemyIsHighFlying(enemy);
}

function skillRegenMultiplier(state: SkillState) {
  return state.regenMultiplier ?? 1;
}

export function triggerAngelWings(
  scene: Phaser.Scene,
  enemies: Enemy[],
  caster: Enemy,
  time: number,
  skill = getEnemySkillState(caster, "wings")
) {
  triggerWingsEffect(scene, enemies, caster, time, skill, {
    cost: ANGEL_WINGS_SKILL_COST,
    duration: ANGEL_WINGS_DURATION,
    inRange: isInAngelWingsRange
  });
}

export function triggerArchangelAscension(
  scene: Phaser.Scene,
  enemies: Enemy[],
  caster: Enemy,
  time: number,
  skill = getEnemySkillState(caster, "ascension")
) {
  triggerWingsEffect(scene, enemies, caster, time, skill, {
    cost: ARCHANGEL_ASCENSION_SKILL_COST,
    duration: ARCHANGEL_ASCENSION_DURATION,
    inRange: isInArchangelAscensionRange
  });
}

function triggerWingsEffect(
  scene: Phaser.Scene,
  enemies: Enemy[],
  caster: Enemy,
  time: number,
  skill: SkillState,
  options: {
    cost: number;
    duration: number;
    inRange: (caster: Enemy, target: Enemy) => boolean;
  }
) {
  spendSkillSp(skill, options.cost);
  skill.activeUntil = time + options.duration;
  for (const target of enemies) {
    if (enemyIsHighFlying(target)) {
      continue;
    }

    if (!options.inRange(caster, target)) {
      continue;
    }

    applyStatusEffect(target, "flying", options.duration, time, ANGEL_WINGS_SPEED_MULTIPLIER, true);
    makeWingPulse(scene, target.x, target.y);
  }
}

function isInAngelWingsRange(caster: Enemy, target: Enemy) {
  return Math.abs(target.x - caster.x) <= ANGEL_WINGS_RANGE_X && Math.abs(target.y - caster.y) <= ANGEL_WINGS_RANGE_Y;
}

function isInArchangelAscensionRange(caster: Enemy, target: Enemy) {
  return Math.hypot(target.x - caster.x, target.y - caster.y) <= ARCHANGEL_ASCENSION_RADIUS;
}

export function makeWingPulse(scene: Phaser.Scene, x: number, y: number) {
  const halo = scene.add.ellipse(x, y - 28, 34, 10, 0x000000, 0).setStrokeStyle(2, 0xf5f5f5, 0.9).setDepth(109);
  const lift = scene.add.graphics().setDepth(108);
  lift.lineStyle(2, 0xf5f5f5, 0.65);
  lift.lineBetween(x - 18, y - 8, x - 34, y - 22);
  lift.lineBetween(x + 18, y - 8, x + 34, y - 22);
  scene.tweens.add({
    targets: [halo, lift],
    y: "-=18",
    alpha: 0,
    duration: 320,
    ease: "Quad.easeOut",
    onComplete: () => {
      halo.destroy();
      lift.destroy();
    }
  });
}
