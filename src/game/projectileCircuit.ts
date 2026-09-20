import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import type { CardDefinition, CardId, EdgeTower, EnemyProjectile, MortarProjectile, Projectile, StoredTowerShot, Tower } from "../types";
import { consumeProjectileDamage, projectileDamageBudget, projectileVisualScale, segmentInInterceptionRange } from "./projectileIntegrity";
import { isLiteralNumberType, numberTowerValue, towerFormType } from "./towerIdentity";
import { projectileBankCapacity } from "./projectileBank";
import { BUNDLE_SHOTS, nodeOccupancy, processorCapacity, processorRate } from "./pipelineRules";
import { PipelineRouting } from "./pipelineRouting";

export { PROJECTILE_BANK_CAPACITY } from "./projectileBank";
export const INTERCEPTION_RADIUS = 2.6;
export const INTERCEPTION_INTERVAL = 100;
export const INTERCEPTION_DAMAGE_COST = 5;
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

interface CircuitRuntime {
  towers: Tower[];
  edges: EdgeTower[];
  battleTime: number;
  getDefinition: (id: CardId) => CardDefinition;
  emit: (shot: StoredTowerShot, outlet: Tower) => void;
  changed: (tower: Tower) => void;
  intercepted?: (tower: Tower, target: EnemyProjectile | MortarProjectile) => void;
}

function bundleKey(shot: StoredTowerShot) {
  if (shot.partialHitDamage !== undefined) return undefined;
  return JSON.stringify([shot.type, shot.sourceTower?.id, shot.sourceBehaviorType, shot.damage, shot.damageType,
    shot.splashRadius, shot.debuff, shot.debuffDuration, shot.vx, shot.vy, String(shot.remainingRange)]);
}

export class ProjectileCircuitController {
  private routing = new PipelineRouting();
  private nodes: Tower[] = [];
  private interceptors: Tower[] = [];
  constructor(private readonly runtime: () => CircuitRuntime) {}

  isEdgeActive(edge: EdgeTower) { return this.routing.isActive(edge); }

  sync() {
    const runtime = this.runtime();
    this.nodes = []; this.interceptors = [];
    const sources: Tower[] = [];
    for (const tower of runtime.towers) {
      if (!tower.inPlay || tower.transient) continue;
      const type = towerFormType(tower);
      if (type === "=" || (type !== "+" && type !== "-" && runtime.getDefinition(tower.type).cost > 999)) continue;
      if (type !== "1" && type !== "-") sources.push(tower);
      if (type === "0") {
        tower.projectileBank ??= { shots: [], remaining: 0, nextAt: 0, outletIndex: 0 };
        tower.projectileBank.remaining = 0;
      }
      if (["0", "1", "+", "-"].includes(type)) {
        tower.projectileNode ??= { input: [], output: [] };
        this.nodes.push(tower); runtime.changed(tower);
        if (type === "-") this.interceptors.push(tower);
      }
    }
    this.nodes.sort((a, b) => a.placedOrder - b.placedOrder);
    this.interceptors.sort((a, b) => a.placedOrder - b.placedOrder);
    this.routing.rebuild(runtime.edges, sources, this.nodes);
  }

  private capacity(tower: Tower) {
    switch (towerFormType(tower)) {
      case "0": return projectileBankCapacity(tower);
      case "1": return Math.max(1, numberTowerValue(tower));
      case "+": return processorCapacity(tower);
      case "-": return projectileBankCapacity(tower);
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
      const queue = towerFormType(target) === "0" ? target.projectileBank?.shots : target.projectileNode?.input;
      if (!queue) continue;
      this.routing.consume(path);
      shot.pipelineMovedAt = runtime.battleTime;
      queue.push(shot); source.projectileRouteIndex = (index + 1) % this.nodes.length;
      runtime.changed(target);
      return true;
    }
    return false;
  }

  capture(projectile: Projectile) {
    if (projectile.circuitChecked) return false;
    projectile.circuitChecked = true;
    const source = projectile.sourceTower;
    if (!source?.inPlay || projectile.type === "chevron" || projectile.targetEnemy || projectile.targetBossPart ||
      isLiteralNumberType(towerFormType(source)) || ["+", "-"].includes(towerFormType(source)) || Math.abs(projectile.vx) < .001) return false;
    const shot: StoredTowerShot = { type: projectile.type, sourceTower: source,
      sourceBehaviorType: projectile.sourceBehaviorType, hitCount: projectile.hitCount ?? 1,
      partialHitDamage: projectile.partialHitDamage, initialDamageBudget: projectile.initialDamageBudget,
      vx: Math.abs(projectile.vx), vy: projectile.vy, damage: projectile.damage, damageType: projectile.damageType,
      splashRadius: projectile.splashRadius, debuff: projectile.debuff, debuffDuration: projectile.debuffDuration,
      remainingRange: Math.max(0, (projectile.maxX - projectile.x) * projectile.limitDirection) };
    if (!this.transfer(source, shot)) return false;
    projectile.body.destroy();
    return true;
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
      const arc = "progress" in target ? 1 + Math.sin(target.progress * Math.PI) * .26 : 1;
      target.body.setScale(projectileVisualScale(target) * arc);
      runtime.changed(tower); runtime.intercepted?.(tower, target);
      if (projectileDamageBudget(target) <= 0) return true;
    }
    return false;
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
    if (changed) this.runtime().changed(tower);
  }

  private startProcessing(tower: Tower, earliest: number) {
    const node = tower.projectileNode!, groups = new Map<string, StoredTowerShot[]>();
    // Finished ammunition gets an output attempt before it can enter another five-to-one recipe.
    for (const shot of [...node.output, ...node.input]) {
      const key = bundleKey(shot);
      if (key === undefined) continue;
      const group = groups.get(key) ?? [];
      group.push(shot); groups.set(key, group);
      if (group.length !== BUNDLE_SHOTS) continue;
      const hitCount = group.reduce((sum, item) => sum + item.hitCount, 0);
      if (!Number.isSafeInteger(hitCount)) continue;
      const chosen = new Set(group);
      node.input = node.input.filter(item => !chosen.has(item));
      node.output = node.output.filter(item => !chosen.has(item));
      const result = { ...group[0], hitCount };
      delete result.initialDamageBudget;
      const start = Math.max(earliest, ...group.map(item => item.pipelineMovedAt ?? earliest));
      node.processing = { shots: [result], count: BUNDLE_SHOTS, completeAt: start + BUNDLE_SHOTS * 1000 / processorRate(tower) };
      return true;
    }
    return false;
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
        runtime.changed(tower);
      } else if (type === "+") {
        this.forwardQueue(tower, node.output);
        let earliest = time, changed = false;
        while (true) {
          if (!node.processing) {
            if (!this.startProcessing(tower, earliest)) break;
            changed = true;
          }
          const job = node.processing!;
          if (job.completeAt > time) break;
          earliest = job.completeAt;
          node.output.push(...job.shots);
          delete node.processing; changed = true;
          this.forwardQueue(tower, node.output);
        }
        if (changed) runtime.changed(tower);
      }
    }
  }
}
