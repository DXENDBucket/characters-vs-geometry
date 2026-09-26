import * as battleMath from "./battleMath";
import { enemyAttackDamage } from "./combatStats";
import { towerIsFlying } from "./towerRules";
import { parenthesisInner } from "./towerOccupancy";
import { redirectOrientedTarget } from "./orientationRules";
import { segmentBoxHitTime } from "./oscillatingMovement";
import type { EnemyState } from "./enemyState";
import type { TowerState } from "./towerState";
import type { EnemyProjectileState } from "./projectileState";

export const MINUS_ATTACK = { multiplier: 0.25, speed: 620, acceleration: 420, maxSpeed: 1200, muzzleOffset: 24 } as const;

function canTarget(tower: TowerState) {
  return tower.inPlay && !tower.transient;
}

export function nearestEnemyHomingTarget(towers: readonly TowerState[], x: number, y: number, preferFlying = false) {
  let target: TowerState | undefined;
  let distance = Infinity, targetFlying = false;
  for (const tower of towers) {
    if (!canTarget(tower) || parenthesisInner(tower)) continue;
    const flying = preferFlying && towerIsFlying(tower);
    const nextDistance = battleMath.square(tower.x - x) + battleMath.square(tower.y - y);
    if ((!targetFlying && flying) || (targetFlying === flying && nextDistance < distance)) {
      target = tower; distance = nextDistance; targetFlying = flying;
    }
  }
  return target;
}

export function createMinusProjectiles(enemy: EnemyState, towers: TowerState[], time: number, hitCount: number): EnemyProjectileState[] {
  const target = redirectOrientedTarget(towers, nearestEnemyHomingTarget(towers, enemy.x, enemy.y, true), time);
  if (!target) return [];
  return [-1, 1].map(side => {
    const x = enemy.x + side * MINUS_ATTACK.muzzleOffset;
    const angle = battleMath.atan2(target.y - enemy.y, target.x - x);
    return { x, y: enemy.y, vx: battleMath.cos(angle) * MINUS_ATTACK.speed, vy: battleMath.sin(angle) * MINUS_ATTACK.speed,
      damage: enemyAttackDamage(enemy, time) * MINUS_ATTACK.multiplier, damageType: "magic", hitCount,
      appearance: "chevron", sourceLane: enemy.lane, targetTower: target,
      speed: MINUS_ATTACK.speed, acceleration: MINUS_ATTACK.acceleration, maxSpeed: MINUS_ATTACK.maxSpeed };
  });
}

export function steerEnemyHomingProjectile(projectile: EnemyProjectileState, towers: TowerState[], seconds: number, time: number) {
  let target = projectile.targetTower;
  if (!target || !canTarget(target)) target = nearestEnemyHomingTarget(towers, projectile.x, projectile.y);
  target = redirectOrientedTarget(towers, target, time);
  projectile.targetTower = target;
  const speed = Math.min(projectile.maxSpeed ?? MINUS_ATTACK.maxSpeed,
    (projectile.speed ?? MINUS_ATTACK.speed) + (projectile.acceleration ?? MINUS_ATTACK.acceleration) * seconds);
  projectile.speed = speed;
  const angle = target ? battleMath.atan2(target.y - projectile.y, target.x - projectile.x)
    : battleMath.atan2(projectile.vy ?? 0, projectile.vx);
  projectile.vx = battleMath.cos(angle) * speed;
  projectile.vy = battleMath.sin(angle) * speed;
  return angle;
}

export function enemyHomingHit(projectile: EnemyProjectileState, from: { x: number; y: number }) {
  const target = projectile.targetTower;
  if (!target || !canTarget(target)) return undefined;
  const hitTime = segmentBoxHitTime(from.x - target.x, from.y - target.y,
    projectile.x - from.x, projectile.y - from.y, 22, 22);
  return Number.isFinite(hitTime) ? target : undefined;
}
