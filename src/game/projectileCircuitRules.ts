import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import type { CardDefinition, CardId, DamageType, EdgeTower, StoredTowerShot } from "../types";
import type { TowerState as Tower } from "./towerState";
import type { EnemyProjectileState as EnemyProjectile, MortarProjectileState as MortarProjectile, ProjectileState as Projectile } from "./projectileState";
import { consumeProjectileDamage, projectileDamageBudget, segmentInInterceptionRange } from "./projectileIntegrity";
import { isLiteralNumberType, numberTowerValue, towerFormType, towerActionContext } from "./towerIdentity";
import type { TowerActionDataEvent } from "./towerActions";
import { storeTowerAction } from "./pipelineActionPayload";
import { projectileBankCapacity } from "./projectileBank";
import { HEALING_RATE, isDamageOutlet, nodeOccupancy, pipelineShieldDamageType } from "./pipelineRules";
import { PipelineRouting } from "./pipelineRouting";
import { inFriendlyRange } from "./towerTopology";

export { PROJECTILE_BANK_CAPACITY } from "./projectileBank";
export const INTERCEPTION_RADIUS = 2.6;
export const INTERCEPTION_INTERVAL = 100;
export const INTERCEPTION_DAMAGE_COST = 5;
export const SHIELD_DAMAGE_COST = 3;
export { BUNDLE_SHOTS, edgeCells } from "./pipelineRules";

export function edgeKey(edge: EdgeTower) { return `${edge.axis}:${edge.lane}:${edge.column}`; }

export function edgePosition(edge: EdgeTower) {
  return { x: BOARD_X + (edge.column + (edge.axis === "horizontal" ? 1 : .5)) * CELL_WIDTH,
    y: BOARD_Y + (edge.lane + (edge.axis === "vertical" ? 1 : .5)) * CELL_HEIGHT };
}

export function edgeAtPoint(x: number, y: number): EdgeTower | undefined {
  const col = (x - BOARD_X) / CELL_WIDTH, row = (y - BOARD_Y) / CELL_HEIGHT;
  if (col < 0 || col >= COLUMNS || row < 0 || row >= LANES) return;
  const cx = Math.round(col), ry = Math.round(row);
  const dx = cx > 0 && cx < COLUMNS ? Math.abs(col - cx) * CELL_WIDTH : Infinity;
  const dy = ry > 0 && ry < LANES ? Math.abs(row - ry) * CELL_HEIGHT : Infinity;
  if (Math.min(dx, dy) > 12) return;
  return dx <= dy ? { type: "=", axis: "horizontal", lane: Math.floor(row), column: cx - 1 }
    : { type: "=", axis: "vertical", lane: ry - 1, column: Math.floor(col) };
}

export interface CircuitRuntime {
  towers: Tower[];
  edges: EdgeTower[];
  battleTime: number;
  getDefinition: (id: CardId) => CardDefinition;
  emit: (shot: StoredTowerShot, outlet: Tower) => void;
  heal?: (tower: Tower, amount: number) => boolean;
}

export interface CircuitPresentation {
  captured(projectile: Projectile): void;
  intercepted(tower: Tower, target: EnemyProjectile | MortarProjectile): void;
  changed(tower: Tower): void;
  shielded(target: Tower, damageType: DamageType): void;
}
export const NO_CIRCUIT_PRESENTATION: CircuitPresentation = Object.freeze({
  captured() {}, intercepted() {}, changed() {}, shielded() {}
});

export class ProjectileCircuitSimulation {
  private routing = new PipelineRouting();
  private nodes: Tower[] = [];
  private interceptors: Tower[] = [];
  private shields: Tower[] = [];
  constructor(private readonly runtime: () => CircuitRuntime, public presentation: CircuitPresentation = NO_CIRCUIT_PRESENTATION) {}

  isEdgeActive(edge: EdgeTower) { return this.routing.isActive(edge); }

  sync() {
    const runtime = this.runtime();
    this.nodes = []; this.interceptors = []; this.shields = [];
    const sources: Tower[] = [];
    for (const tower of runtime.towers) {
      if (!tower.inPlay) continue;
      const type = towerFormType(tower);
      if (type === "=" || (!isDamageOutlet(type) && runtime.getDefinition(tower.type).cost > 999)) continue;
      if (type !== "1" && !isDamageOutlet(type)) sources.push(tower);
      if (tower.transient) continue;
      if (type === "0") {
        tower.projectileBank ??= { shots: [], remaining: 0, nextAt: 0, outletIndex: 0 };
        tower.projectileBank.remaining = 0;
      }
      if (isLiteralNumberType(type) || isDamageOutlet(type)) {
        tower.projectileNode ??= { input: [], output: [] };
        if (type === "+") {
          // Preserve ammunition in saves from the old bundler without executing the old recipe.
          tower.projectileNode.input.push(...tower.projectileNode.output.splice(0), ...(tower.projectileNode.processing?.shots ?? []));
          delete tower.projectileNode.processing;
        }
        this.nodes.push(tower); this.presentation.changed(tower);
        if (type === "-") this.interceptors.push(tower);
        if (pipelineShieldDamageType(type)) this.shields.push(tower);
      }
    }
    this.nodes.sort((a, b) => a.placedOrder - b.placedOrder);
    this.interceptors.sort((a, b) => a.placedOrder - b.placedOrder);
    this.shields.sort((a, b) => a.placedOrder - b.placedOrder);
    this.routing.rebuild(runtime.edges, sources, this.nodes);
  }

  private capacity(tower: Tower) {
    if (isDamageOutlet(towerFormType(tower))) return projectileBankCapacity(tower);
    switch (towerFormType(tower)) {
      case "0": return projectileBankCapacity(tower);
      case "1": return Math.max(1, numberTowerValue(tower));
      default: return 0;
    }
  }

  private occupancy(tower: Tower) {
    return towerFormType(tower) === "0" ? tower.projectileBank?.shots.length ?? 0 : nodeOccupancy(tower);
  }

  private transfer(source: Tower, shot: StoredTowerShot) {
    const runtime = this.runtime(), paths = this.routing.pathsFrom(source, runtime.battleTime);
    const start = source.projectileRouteIndex ?? 0;
    for (let offset = 0; offset < this.nodes.length; offset++) {
      const index = (start + offset) % this.nodes.length, target = this.nodes[index], path = paths.get(target);
      if (!path || !target.inPlay || this.occupancy(target) >= this.capacity(target)) continue;
      if (isDamageOutlet(towerFormType(target)) && projectileDamageBudget(shot) <= 0) continue;
      const queue = towerFormType(target) === "0" ? target.projectileBank?.shots : target.projectileNode?.input;
      if (!queue) continue;
      this.routing.consume(path);
      shot.pipelineMovedAt = runtime.battleTime;
      queue.push(shot); source.projectileRouteIndex = (index + 1) % this.nodes.length;
      this.presentation.changed(target);
      return true;
    }
    return false;
  }

  capture(projectile: Projectile) {
    if (projectile.circuitChecked) return false;
    projectile.circuitChecked = true;
    const source = projectile.sourceTower;
    if (!source?.inPlay || projectile.type === "chevron" || projectile.targetEnemy || projectile.targetBossPart ||
      isLiteralNumberType(towerFormType(source)) || isDamageOutlet(towerFormType(source)) || Math.abs(projectile.vx) < .001) return false;
    const shot: StoredTowerShot = { type: projectile.type, sourceTower: source,
      sourceBehaviorType: projectile.sourceBehaviorType, hitCount: projectile.hitCount ?? 1,
      partialHitDamage: projectile.partialHitDamage, initialDamageBudget: projectile.initialDamageBudget,
      vx: Math.abs(projectile.vx), vy: projectile.vy, damage: projectile.damage, damageType: projectile.damageType,
      splashRadius: projectile.splashRadius, debuff: projectile.debuff, debuffDuration: projectile.debuffDuration,
      remainingRange: Math.max(0, (projectile.maxX - projectile.x) * projectile.limitDirection) };
    if (!this.transfer(source, shot)) return false;
    this.presentation.captured(projectile);
    return true;
  }

  captureAction(source: Tower, event: TowerActionDataEvent) {
    if (!this.nodes.length || !source.inPlay || towerActionContext(source) || event.kind === "combined" ||
      isLiteralNumberType(towerFormType(source)) || isDamageOutlet(towerFormType(source)) || towerFormType(source) === "=") return false;
    if (!this.routing.pathsFrom(source, this.runtime().battleTime).size) return false;
    return this.transfer(source, storeTowerAction(source, this.runtime().getDefinition(towerFormType(source)), event, this.runtime().battleTime));
  }

  intercept(target: EnemyProjectile | MortarProjectile, from: { x: number; y: number }) {
    if (!this.interceptors.length || ("owner" in target && target.owner !== "enemy")) return false;
    const runtime = this.runtime();
    for (const tower of this.interceptors) {
      if (!tower.inPlay || runtime.battleTime < (tower.nextInterceptionAt ?? 0) ||
        !segmentInInterceptionRange(from, target, tower, CELL_WIDTH, CELL_HEIGHT, INTERCEPTION_RADIUS)) continue;
      const shots = tower.projectileNode?.input;
      const index = shots?.findIndex(s => projectileDamageBudget(s) > 0) ?? -1;
      if (!shots || index < 0 || projectileDamageBudget(target) <= 0) continue;
      const shot = shots[index], amount = Math.min(projectileDamageBudget(target), projectileDamageBudget(shot) / INTERCEPTION_DAMAGE_COST);
      consumeProjectileDamage(target, amount); consumeProjectileDamage(shot, amount * INTERCEPTION_DAMAGE_COST);
      if (projectileDamageBudget(shot) <= 0) shots.splice(index, 1);
      tower.nextInterceptionAt = runtime.battleTime + INTERCEPTION_INTERVAL;
      this.presentation.changed(tower); this.presentation.intercepted(tower, target);
      if (projectileDamageBudget(target) <= 0) return true;
    }
    return false;
  }

  absorbDamage(target: Tower, damage: number, damageType: DamageType) {
    if (!target.inPlay || damage <= 0 || damageType === "true" || !this.shields.length) return damage;
    const runtime = this.runtime();
    let remaining = damage;
    for (const tower of this.shields) {
      if (!tower.inPlay || pipelineShieldDamageType(towerFormType(tower)) !== damageType || !inFriendlyRange(tower, target, 2, true)) continue;
      const shots = tower.projectileNode?.input;
      if (!shots?.length) continue;
      const before = remaining;
      let exhausted = 0;
      for (const shot of shots) {
        const budget = projectileDamageBudget(shot);
        const spent = consumeProjectileDamage(shot, Math.min(budget, remaining * SHIELD_DAMAGE_COST));
        remaining = Math.max(0, remaining - spent / SHIELD_DAMAGE_COST);
        if (projectileDamageBudget(shot) <= 0) exhausted++;
        if (remaining <= 0) break;
      }
      if (exhausted) shots.splice(0, exhausted);
      if (before > remaining) this.presentation.changed(tower);
      if (remaining <= 0) break;
    }
    if (remaining < damage) this.presentation.shielded(target, damageType);
    return remaining;
  }

  // Zero is now an automatic buffer; clicking it never flushes an incomplete outlet batch.
  release(tower: Tower) { return tower.inPlay && towerFormType(tower) === "0"; }

  private forwardQueue(tower: Tower, shots: StoredTowerShot[]) {
    let changed = false;
    for (let i = 0; i < shots.length;) {
      // Transparent routes take no storage time; actual nodes forward at most once per tick.
      if ((shots[i].pipelineMovedAt ?? -Infinity) >= this.runtime().battleTime || !this.transfer(tower, shots[i])) { i++; continue; }
      shots.splice(i, 1); changed = true;
    }
    if (changed) this.presentation.changed(tower);
  }

  update() {
    const runtime = this.runtime(), time = runtime.battleTime;
    for (const tower of this.nodes) {
      if (!tower.inPlay) continue;
      const type = towerFormType(tower), node = tower.projectileNode!;
      if (type === "0") this.forwardQueue(tower, tower.projectileBank!.shots);
      else if (type === "1") {
        const count = Math.max(1, numberTowerValue(tower));
        if (node.input.length < count) continue;
        for (const shot of node.input.splice(0, count)) runtime.emit(shot, tower);
        this.presentation.changed(tower);
      } else if (type === "+") {
        const rate = HEALING_RATE;
        tower.healingCredit = Math.min(rate, (tower.healingCredit ?? rate) + Math.max(0, time - (tower.healingUpdatedAt ?? time)) * rate / 1000);
        tower.healingUpdatedAt = time;
        let changed = false;
        while (node.input.length && tower.healingCredit >= 1) {
          const amount = projectileDamageBudget(node.input[0]) / 5;
          if (amount <= 0 || !runtime.heal?.(tower, amount)) break;
          node.input.shift(); tower.healingCredit -= 1; changed = true;
        }
        if (changed) this.presentation.changed(tower);
      }
    }
  }
}
