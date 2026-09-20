import type { Enemy, EnemyHealthPool } from "../types";
import { enemyIsBossCompanion, enemyIsLeader, getEnemyDefinition } from "../registry/enemies";

function syncPool(pool: EnemyHealthPool) {
  const ratio = pool.maxHp > 0 ? Math.max(0, Math.min(1, pool.hp / pool.maxHp)) : 0;
  for (const member of pool.members) member.hp = member.baseStats.maxHp * ratio;
}

export function changeEnemyHealth(enemy: Enemy, amount: number) {
  const pool = enemy.healthPool;
  if (!pool) {
    const before = enemy.hp;
    enemy.hp = Math.min(enemy.baseStats.maxHp, enemy.hp + amount);
    return enemy.hp - before;
  }
  const before = pool.hp;
  pool.hp = Math.max(0, Math.min(pool.maxHp, pool.hp + amount));
  syncPool(pool);
  return pool.hp - before;
}

export function syncEnemyHealthCapacity(enemy: Enemy) {
  const pool = enemy.healthPool;
  if (!pool) return;
  const ratio = pool.hp / pool.maxHp;
  pool.maxHp = pool.members.reduce((sum, member) => sum + member.baseStats.maxHp, 0);
  pool.hp = pool.maxHp * ratio;
  syncPool(pool);
}

// Called only on creation, never on promotion, resume, or a stored enemy's return.
export function initializeEnemyHealthLinks(owner: Enemy, enemies: readonly Enemy[]) {
  const capacity = getEnemyDefinition(owner.kind).healthLinkCapacity ?? 0;
  if (capacity <= 0 || owner.healthLinksInitialized) return;
  owner.healthLinksInitialized = true;
  const distance = (enemy: Enemy) => (enemy.x - owner.x) ** 2 + (enemy.y - owner.y) ** 2;
  const targets = enemies.filter(enemy => enemy !== owner && enemy.inPlay && enemy.hp > 0 &&
    !enemy.healthPool && !getEnemyDefinition(enemy.kind).healthLinkCapacity &&
    !enemyIsLeader(enemy.kind) && !enemyIsBossCompanion(enemy.kind) && enemy.kind !== "solarBomb")
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, capacity);
  if (!targets.length) return;
  const members = [owner, ...targets];
  const pool: EnemyHealthPool = {
    owner, members,
    hp: members.reduce((sum, member) => sum + member.hp, 0),
    maxHp: members.reduce((sum, member) => sum + member.baseStats.maxHp, 0)
  };
  for (const member of members) member.healthPool = pool;
  syncPool(pool);
}

export function detachEnemyHealth(enemy: Enemy) {
  const pool = enemy.healthPool;
  if (!pool) return;
  syncPool(pool);
  enemy.healthPool = undefined;
  if (pool.owner === enemy) {
    for (const member of pool.members) member.healthPool = undefined;
    return;
  }
  const ratio = pool.hp / pool.maxHp;
  pool.members = pool.members.filter(member => member !== enemy);
  pool.maxHp = pool.members.reduce((sum, member) => sum + member.baseStats.maxHp, 0);
  pool.hp = pool.maxHp * ratio;
  if (pool.members.length === 1) pool.owner.healthPool = undefined;
  else syncPool(pool);
}
