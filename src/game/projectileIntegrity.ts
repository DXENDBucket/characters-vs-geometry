/** Damage is also a projectile's interception budget; judgments remain separate. */
export interface ProjectileIntegrity {
  damage: number;
  hitCount?: number;
  partialHitDamage?: number;
  initialDamageBudget?: number;
}

export function projectileDamageBudget(shot: ProjectileIntegrity) {
  const count = shot.hitCount ?? 1;
  return count > 0 ? shot.damage * (count - 1) + (shot.partialHitDamage ?? shot.damage) : 0;
}

export function consumeProjectileDamage(shot: ProjectileIntegrity, amount: number) {
  const total = projectileDamageBudget(shot);
  const consumed = Math.min(total, Math.max(0, amount));
  if (consumed <= 0) return 0;
  shot.initialDamageBudget ??= total;
  const remaining = total - consumed;
  if (remaining <= 0) {
    shot.hitCount = 0;
    delete shot.partialHitDamage;
  } else {
    shot.hitCount = Math.ceil(remaining / shot.damage);
    shot.partialHitDamage = remaining - (shot.hitCount - 1) * shot.damage;
    if (shot.partialHitDamage === shot.damage) delete shot.partialHitDamage;
  }
  return consumed;
}

export function forEachProjectileHit(shot: ProjectileIntegrity, hit: (damage: number) => void) {
  for (let i = 0; i < (shot.hitCount ?? 1); i++) hit(i === 0 ? shot.partialHitDamage ?? shot.damage : shot.damage);
}

export function projectileVisualScale(shot: ProjectileIntegrity) {
  const remaining = projectileDamageBudget(shot), initial = shot.initialDamageBudget ?? remaining;
  if (initial <= 0) return .65;
  const base = Math.min(2.5, Math.max(.65, (initial / 400) ** .2));
  return base * (.25 + .75 * Math.sqrt(Math.max(0, remaining / initial)));
}

export function segmentInInterceptionRange(from: { x: number; y: number }, to: { x: number; y: number },
  center: { x: number; y: number }, width: number, height: number, radius: number) {
  const x = (from.x - center.x) / width, y = (from.y - center.y) / height;
  const dx = (to.x - from.x) / width, dy = (to.y - from.y) / height;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, -(x * dx + y * dy) / length)) : 0;
  return (x + dx * t) ** 2 + (y + dy * t) ** 2 <= radius * radius;
}
