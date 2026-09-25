import type Phaser from "phaser";
import { ENEMY_SKILLS } from "../data/enemyAbilities";
import { updateIncitement } from "./incitement";
import { changeEnemyHealth } from "./enemyHealth";
import { relocateEnemyToLane } from "./oscillatingMovement";
import { enemiesWithPassengers, enemyMaximumHp } from "./enemyContainers";
import { BOARD_X, CELL_HEIGHT, CELL_WIDTH } from "../config";
import { makeHealParticles, makeShiftEffect } from "../render/combatEffects";
import { makeWingPulse } from "../render/enemySkillEffects";
import type { Enemy, SkillState } from "../types";
import { enemyFamily, enemyIsBossCompanion } from "../registry/enemies";
import { syncEnemyVisualScale } from "./enemyBehaviors";
import { enemyIgnoresLeaderRestrictedMechanics, enemyIsHighFlying } from "./enemyCombatRules";
import { createEnemySkillRegistry, enemySkillDefinitionsForFamily, type EnemySkillRuntime } from "./enemySkillRegistry";
import { getEnemySkillState, isSkillReady, spendSkillSp } from "./skillState";
import { chargeEnemySkill } from "./enemySkillRules";
import { applyStatusEffect, hasUnexpiredStatusEffect, syncEnemyBodyPosition } from "./statusEffects";

const HEAL_RADIUS = CELL_WIDTH * ENEMY_SKILLS.heal.range.shape.radius;
const HEAL_RADIUS_SQ = HEAL_RADIUS * HEAL_RADIUS;
const ASCENSION_RADIUS = CELL_WIDTH * ENEMY_SKILLS.ascension.range.shape.radius;
const ASCENSION_RADIUS_SQ = ASCENSION_RADIUS * ASCENSION_RADIUS;

interface HeartLeadCaster {
  caster: Enemy;
  skill: SkillState;
}

interface HeartLeadPlan extends HeartLeadCaster {
  targets: Enemy[];
}

interface EnemyPosition {
  x: number;
  y: number;
  lane: number;
}

const enemySkillRegistry = createEnemySkillRegistry({
  heal: updateHexHeal,
  wings: updateAngelWings,
  ascension: updateArchangelAscension,
  lead: updateHeartLead,
  incitement: updateIncitement
});
const activeEnemyBuffer: Enemy[] = [];
const heartLeadReadyCastersBuffer: HeartLeadCaster[] = [];
const heartLeadReadyCastersPool: HeartLeadCaster[] = [];
const heartLeadPlansBuffer: HeartLeadPlan[] = [];
const heartLeadPlansPool: HeartLeadPlan[] = [];
const heartLeadTargetsPool: Enemy[][] = [];
const heartLeadSingleTargetsBuffer: Enemy[] = [];
const heartLeadClaimedTargetsBuffer = new Set<Enemy>();
const heartLeadSingleClaimedTargetsBuffer = new Set<Enemy>();
const heartLeadPositionMapBuffer = new Map<Enemy, EnemyPosition>();
const heartLeadPositionPool: EnemyPosition[] = [];

export function updateEnemySkills(runtime: EnemySkillRuntime, seconds: number, time: number) {
  const all = enemiesWithPassengers(runtime.enemies);
  if (all !== runtime.enemies) runtime = { ...runtime, enemies: all };
  const activeHeartEnemies = activeEnemyBuffer;
  activeHeartEnemies.length = 0;

  try {
    for (const enemy of runtime.enemies) {
      if (enemyIsHighFlying(enemy)) {
        continue;
      }

      const family = enemyFamily(enemy.kind);
      const definitions = enemySkillDefinitionsForFamily(enemySkillRegistry, family);
      if (definitions.length === 0) {
        continue;
      }

      if (hasUnexpiredStatusEffect(enemy, "frozen", time) ||
        (enemy.parenthesisCarrier && hasUnexpiredStatusEffect(enemy.parenthesisCarrier, "frozen", time))) {
        continue;
      }

      for (const definition of definitions) {
        // Lead shares a position snapshot across casters; other skills still update normally.
        if (definition.stateKey === "lead") {
          activeHeartEnemies.push(enemy);
          continue;
        }
        definition.update(enemy, getEnemySkillState(enemy, definition.stateKey), seconds, time, runtime);
      }
    }
    if (activeHeartEnemies.length > 0) {
      updateHeartLeads(runtime.scene, runtime.enemies, activeHeartEnemies, seconds, time);
    }
  } finally {
    activeHeartEnemies.length = 0;
  }
}

function updateHexHeal(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (chargeEnemySkill("heal", state, seconds, time)) tryUseHexHeal(runtime.scene, runtime.enemies, enemy, state);
}

function updateAngelWings(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (chargeEnemySkill("wings", state, seconds, time)) {
    triggerAngelWings(runtime.scene, runtime.enemies, enemy, time, state);
  }
}

function updateArchangelAscension(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (chargeEnemySkill("ascension", state, seconds, time)) {
    triggerArchangelAscension(runtime.scene, runtime.enemies, enemy, time, state);
  }
}

function updateHeartLead(enemy: Enemy, state: SkillState, seconds: number, time: number, runtime: EnemySkillRuntime) {
  if (!chargeEnemySkill("lead", state, seconds, time)) {
    return;
  }

  tryUseHeartLead(runtime.scene, runtime.enemies, enemy, state);
}

function updateHeartLeads(scene: Phaser.Scene, enemies: Enemy[], activeHeartEnemies: Enemy[], seconds: number, time: number) {
  const readyCasters = heartLeadReadyCastersBuffer;
  const leadPlans = heartLeadPlansBuffer;
  const claimedTargets = heartLeadClaimedTargetsBuffer;
  readyCasters.length = 0;
  leadPlans.length = 0;
  claimedTargets.clear();

  try {
    for (const caster of activeHeartEnemies) {
      const skill = getEnemySkillState(caster, "lead");
      if (!chargeEnemySkill("lead", skill, seconds, time)) {
        continue;
      }

      readyCasters.push(heartLeadReadyCaster(readyCasters.length, caster, skill));
    }

    if (readyCasters.length === 0) {
      return;
    }

    const originalPositions = enemyPositionMap(enemies);
    for (const { caster, skill } of readyCasters) {
      const targets = heartLeadTargets(
        enemies,
        caster,
        originalPositions,
        claimedTargets,
        heartLeadTargetsPool[leadPlans.length] ?? createHeartLeadTargetBuffer(leadPlans.length)
      );
      if (targets.length === 0) {
        continue;
      }

      for (const target of targets) {
        claimedTargets.add(target);
      }
      leadPlans.push(heartLeadPlan(leadPlans.length, caster, skill, targets));
    }

    for (const plan of leadPlans) {
      spendSkillSp(plan.skill, ENEMY_SKILLS.lead.cost);
      for (const target of plan.targets) {
        const previousY = target.y;
        relocateEnemyToLane(target, plan.caster.lane, plan.caster.y);
        syncEnemyBodyPosition(target);
        makeShiftEffect(scene, target.x, previousY, target.x, target.y);
      }
    }
  } finally {
    readyCasters.length = 0;
    for (const plan of leadPlans) {
      plan.targets.length = 0;
    }
    leadPlans.length = 0;
    claimedTargets.clear();
    heartLeadPositionMapBuffer.clear();
  }
}

function tryUseHexHeal(scene: Phaser.Scene, enemies: Enemy[], healer: Enemy, skill: SkillState) {
  if (!isSkillReady(skill, ENEMY_SKILLS.heal.maxSp)) {
    return;
  }

  let target: Enemy | undefined;
  let targetHpRatio = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (
      enemyIsHighFlying(enemy) ||
      enemy.hp >= enemyMaximumHp(enemy) ||
      distanceSq(enemy.x, enemy.y, healer.x, healer.y) > HEAL_RADIUS_SQ
    ) {
      continue;
    }

    const hpRatio = enemy.hp / enemyMaximumHp(enemy);
    if (hpRatio < targetHpRatio) {
      target = enemy;
      targetHpRatio = hpRatio;
    }
  }
  if (!target) {
    return;
  }

  spendSkillSp(skill, ENEMY_SKILLS.heal.cost);
  if (changeEnemyHealth(target, enemyMaximumHp(healer) * ENEMY_SKILLS.heal.healRatio) <= 0) {
    return;
  }

  for (const member of target.healthPool?.members ?? [target]) syncEnemyVisualScale(member);
  makeHealParticles(scene, target.x, target.y);
}

function heartLeadReadyCaster(index: number, caster: Enemy, skill: SkillState) {
  const readyCaster = heartLeadReadyCastersPool[index] ?? createHeartLeadReadyCaster(index, caster, skill);
  readyCaster.caster = caster;
  readyCaster.skill = skill;
  return readyCaster;
}

function createHeartLeadReadyCaster(index: number, caster: Enemy, skill: SkillState) {
  const readyCaster: HeartLeadCaster = { caster, skill };
  heartLeadReadyCastersPool[index] = readyCaster;
  return readyCaster;
}

function heartLeadPlan(index: number, caster: Enemy, skill: SkillState, targets: Enemy[]) {
  const plan = heartLeadPlansPool[index] ?? createHeartLeadPlan(index, caster, skill, targets);
  plan.caster = caster;
  plan.skill = skill;
  plan.targets = targets;
  return plan;
}

function createHeartLeadPlan(index: number, caster: Enemy, skill: SkillState, targets: Enemy[]) {
  const plan: HeartLeadPlan = { caster, skill, targets };
  heartLeadPlansPool[index] = plan;
  return plan;
}

function tryUseHeartLead(scene: Phaser.Scene, enemies: Enemy[], caster: Enemy, skill: SkillState) {
  const originalPositions = enemyPositionMap(enemies);
  const claimedTargets = heartLeadSingleClaimedTargetsBuffer;
  const targets = heartLeadTargets(enemies, caster, originalPositions, claimedTargets, heartLeadSingleTargetsBuffer);

  try {
    if (targets.length === 0) {
      return;
    }

    spendSkillSp(skill, ENEMY_SKILLS.lead.cost);
    for (const target of targets) {
      const previousY = target.y;
      relocateEnemyToLane(target, caster.lane, caster.y);
      syncEnemyBodyPosition(target);
      makeShiftEffect(scene, target.x, previousY, target.x, target.y);
    }
  } finally {
    targets.length = 0;
    claimedTargets.clear();
    heartLeadPositionMapBuffer.clear();
  }
}

function enemyPositionMap(enemies: Enemy[]) {
  const positions = heartLeadPositionMapBuffer;
  positions.clear();
  for (let index = 0; index < enemies.length; index += 1) {
    const enemy = enemies[index];
    const position = heartLeadPositionPool[index] ?? createEnemyPositionBuffer(index);
    position.x = enemy.x;
    position.y = enemy.y;
    position.lane = enemy.lane;
    positions.set(enemy, position);
  }
  return positions;
}

function heartLeadTargets(
  enemies: Enemy[],
  caster: Enemy,
  originalPositions: Map<Enemy, EnemyPosition>,
  claimedTargets: Set<Enemy>,
  targets: Enemy[]
) {
  targets.length = 0;
  const casterPosition = originalPositions.get(caster);
  if (!casterPosition) {
    return targets;
  }

  const casterColumn = Math.floor((casterPosition.x - BOARD_X) / CELL_WIDTH);
  const shape = ENEMY_SKILLS.lead.range.shape;
  const left = BOARD_X + (casterColumn + shape.left) * CELL_WIDTH;
  const right = BOARD_X + (casterColumn + shape.right + 1) * CELL_WIDTH;
  for (const enemy of enemies) {
    const position = originalPositions.get(enemy);
    if (
      position !== undefined &&
      enemy !== caster &&
      !claimedTargets.has(enemy) &&
      isOrdinaryLeadTarget(enemy) &&
      position.x >= left &&
      position.x < right &&
      position.y - casterPosition.y >= (shape.top - 0.5) * CELL_HEIGHT &&
      position.y - casterPosition.y <= (shape.bottom + 0.5) * CELL_HEIGHT &&
      Math.abs(position.y - casterPosition.y) > 0.001
    ) {
      targets.push(enemy);
    }
  }
  return targets;
}

function createHeartLeadTargetBuffer(index: number) {
  const targets: Enemy[] = [];
  heartLeadTargetsPool[index] = targets;
  return targets;
}

function createEnemyPositionBuffer(index: number) {
  const position = { x: 0, y: 0, lane: 0 };
  heartLeadPositionPool[index] = position;
  return position;
}

function isOrdinaryLeadTarget(enemy: Enemy) {
  return !enemy.parenthesisCarrier && !enemyIgnoresLeaderRestrictedMechanics(enemy) && !enemyIsBossCompanion(enemy.kind) && !enemyIsHighFlying(enemy);
}

export function triggerAngelWings(
  scene: Phaser.Scene,
  enemies: Enemy[],
  caster: Enemy,
  time: number,
  skill = getEnemySkillState(caster, "wings")
) {
  triggerWingsEffect(scene, enemies, caster, time, skill, {
    cost: ENEMY_SKILLS.wings.cost,
    duration: ENEMY_SKILLS.wings.duration,
    speedMultiplier: ENEMY_SKILLS.wings.speedMultiplier,
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
    cost: ENEMY_SKILLS.ascension.cost,
    duration: ENEMY_SKILLS.ascension.duration,
    speedMultiplier: ENEMY_SKILLS.ascension.speedMultiplier,
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
    speedMultiplier: number;
    inRange: (caster: Enemy, target: Enemy) => boolean;
  }
) {
  spendSkillSp(skill, options.cost);
  skill.activeUntil = time + options.duration;
  const affected = new Set<Enemy>();
  for (const target of enemies) {
    if (enemyIsHighFlying(target)) {
      continue;
    }

    if (!options.inRange(caster, target)) {
      continue;
    }

    const recipient = target.parenthesisCarrier ?? target;
    if (affected.has(recipient)) continue;
    affected.add(recipient);
    applyStatusEffect(recipient, "flying", options.duration, time, options.speedMultiplier, true);
    makeWingPulse(scene, recipient.x, recipient.y);
  }
}

function isInAngelWingsRange(caster: Enemy, target: Enemy) {
  return Math.abs(target.x - caster.x) <= (CELL_WIDTH * ENEMY_SKILLS.wings.range.shape.halfWidth) && Math.abs(target.y - caster.y) <= (CELL_HEIGHT * ENEMY_SKILLS.wings.range.shape.halfHeight);
}

function isInArchangelAscensionRange(caster: Enemy, target: Enemy) {
  return distanceSq(target.x, target.y, caster.x, caster.y) <= ASCENSION_RADIUS_SQ;
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
