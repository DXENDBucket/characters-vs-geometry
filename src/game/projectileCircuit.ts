import { BOARD_X, BOARD_Y, CELL_HEIGHT, CELL_WIDTH, COLUMNS, LANES } from "../config";
import type { CardDefinition, CardId, EdgeTower, EnemyProjectile, MortarProjectile, Projectile, StoredTowerShot, Tower } from "../types";
import { consumeProjectileDamage, projectileDamageBudget, projectileVisualScale, segmentInInterceptionRange } from "./projectileIntegrity";
import { towerCell } from "./towerTopology";
import { isLiteralNumberType, numberTowerValue, towerFormType } from "./towerIdentity";
import { projectileBankCapacity } from "./projectileBank";

export { PROJECTILE_BANK_CAPACITY } from "./projectileBank";
export const CIRCUIT_RELEASE_INTERVAL = 40;
export const INTERCEPTION_RADIUS = 2.6;
export const INTERCEPTION_INTERVAL = 100;
export const BUNDLE_SHOTS = 5;

export function edgeKey(edge: EdgeTower) { return `${edge.axis}:${edge.lane}:${edge.column}`; }

export function edgeCells(edge: EdgeTower) {
  return [{ lane: edge.lane, column: edge.column },
    { lane: edge.lane + (edge.axis === "vertical" ? 1 : 0), column: edge.column + (edge.axis === "horizontal" ? 1 : 0) }];
}

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

interface Circuit { banks: Tower[]; outlets: Tower[]; interceptors: Tower[] }

function canBundle(a: StoredTowerShot, b: StoredTowerShot) {
  return a.type === b.type && a.sourceTower === b.sourceTower && a.sourceBehaviorType === b.sourceBehaviorType &&
    a.damage === b.damage && a.damageType === b.damageType && a.splashRadius === b.splashRadius &&
    a.debuff === b.debuff && a.debuffDuration === b.debuffDuration && a.vx === b.vx && a.vy === b.vy &&
    a.remainingRange === b.remainingRange && a.partialHitDamage === undefined && b.partialHitDamage === undefined;
}

export class ProjectileCircuitController {
  private circuits = new Map<Tower, Circuit>();
  private activeEdges = new Set<string>();
  private interceptors: Tower[] = [];
  constructor(private readonly runtime: () => CircuitRuntime) {}

  isEdgeActive(edge: EdgeTower) { return this.activeEdges.has(edgeKey(edge)); }

  sync() {
    const runtime = this.runtime();
    this.circuits.clear(); this.activeEdges.clear(); this.interceptors = [];
    const cells = new Map<string, Tower>(), graph = new Map<Tower, Set<Tower>>();
    for (const tower of runtime.towers) {
      if (!tower.inPlay || tower.transient) continue;
      const type = towerFormType(tower);
      if (type === "=" || (type !== "+" && type !== "-" && runtime.getDefinition(tower.type).cost > 999)) continue;
      const cell = towerCell(tower); cells.set(`${cell.lane}:${cell.column}`, tower);
      if (type === "0" && !tower.projectileBank) {
        tower.projectileBank = { shots: [], remaining: 0, nextAt: 0, outletIndex: 0 };
        runtime.changed(tower);
      }
    }
    const edges: Array<{ edge: EdgeTower; a: Tower; b: Tower }> = [];
    for (const edge of runtime.edges) {
      const [left, right] = edgeCells(edge);
      const a = cells.get(`${left.lane}:${left.column}`), b = cells.get(`${right.lane}:${right.column}`);
      if (!a || !b) continue;
      if (!graph.has(a)) graph.set(a, new Set());
      if (!graph.has(b)) graph.set(b, new Set());
      graph.get(a)!.add(b); graph.get(b)!.add(a); edges.push({ edge, a, b });
    }
    const seen = new Set<Tower>();
    for (const first of graph.keys()) {
      if (seen.has(first)) continue;
      const pending = [first], members: Tower[] = []; seen.add(first);
      while (pending.length) {
        const member = pending.pop()!; members.push(member);
        for (const next of graph.get(member) ?? []) if (!seen.has(next)) { seen.add(next); pending.push(next); }
      }
      members.sort((a, b) => a.placedOrder - b.placedOrder);
      const circuit = { banks: members.filter(t => towerFormType(t) === "0"),
        outlets: members.filter(t => ["1", "+"].includes(towerFormType(t))),
        interceptors: members.filter(t => towerFormType(t) === "-") };
      if (!circuit.banks.length || (!circuit.outlets.length && !circuit.interceptors.length)) continue;
      this.interceptors.push(...circuit.interceptors);
      for (const member of members) this.circuits.set(member, circuit);
    }
    for (const { edge, a, b } of edges) if (this.circuits.has(a) && this.circuits.get(a) === this.circuits.get(b)) {
      this.activeEdges.add(edgeKey(edge));
    }
    this.interceptors.sort((a, b) => a.placedOrder - b.placedOrder);
  }

  capture(projectile: Projectile) {
    if (projectile.circuitChecked) return false;
    projectile.circuitChecked = true;
    const source = projectile.sourceTower;
    if (!source?.inPlay || projectile.type === "chevron" || projectile.targetEnemy || projectile.targetBossPart ||
      isLiteralNumberType(towerFormType(source)) || ["+", "-"].includes(towerFormType(source)) || Math.abs(projectile.vx) < .001) return false;
    const circuit = this.circuits.get(source);
    if (!circuit || (!circuit.outlets.some(t => t.inPlay) && !circuit.interceptors.some(t => t.inPlay))) return false;
    const bank = circuit.banks.find(tower => tower.inPlay && tower.projectileBank!.shots.length < projectileBankCapacity(tower));
    if (!bank) return false;
    bank.projectileBank!.shots.push({ type: projectile.type, sourceTower: source,
      sourceBehaviorType: projectile.sourceBehaviorType, hitCount: projectile.hitCount ?? 1,
      partialHitDamage: projectile.partialHitDamage, initialDamageBudget: projectile.initialDamageBudget,
      vx: Math.abs(projectile.vx), vy: projectile.vy, damage: projectile.damage, damageType: projectile.damageType,
      splashRadius: projectile.splashRadius, debuff: projectile.debuff, debuffDuration: projectile.debuffDuration,
      remainingRange: Math.max(0, (projectile.maxX - projectile.x) * projectile.limitDirection) });
    projectile.body.destroy(); this.runtime().changed(bank);
    return true;
  }

  intercept(target: EnemyProjectile | MortarProjectile, from: { x: number; y: number }) {
    if (!this.interceptors.length || ("owner" in target && target.owner !== "enemy")) return false;
    const runtime = this.runtime();
    for (const tower of this.interceptors) {
      if (!tower.inPlay || runtime.battleTime < (tower.nextInterceptionAt ?? 0) ||
        !segmentInInterceptionRange(from, target, tower, CELL_WIDTH, CELL_HEIGHT, INTERCEPTION_RADIUS)) continue;
      const circuit = this.circuits.get(tower);
      const bankTower = circuit?.banks.find(t => t.inPlay && t.projectileBank?.shots.some(s => projectileDamageBudget(s) > 0));
      const bank = bankTower?.projectileBank;
      if (!bank || !bankTower || projectileDamageBudget(target) <= 0) continue;
      const index = bank.shots.findIndex(s => projectileDamageBudget(s) > 0), shot = bank.shots[index];
      const amount = Math.min(projectileDamageBudget(target), projectileDamageBudget(shot));
      consumeProjectileDamage(target, amount); consumeProjectileDamage(shot, amount);
      if (projectileDamageBudget(shot) <= 0) {
        bank.shots.splice(index, 1);
        if (index < bank.remaining) bank.remaining--;
      }
      tower.nextInterceptionAt = runtime.battleTime + INTERCEPTION_INTERVAL;
      const arc = "progress" in target ? 1 + Math.sin(target.progress * Math.PI) * .26 : 1;
      target.body.setScale(projectileVisualScale(target) * arc);
      runtime.changed(bankTower); runtime.intercepted?.(tower, target);
      if (projectileDamageBudget(target) <= 0) return true;
    }
    return false;
  }

  release(tower: Tower) {
    if (!tower.inPlay || towerFormType(tower) !== "0") return false;
    const bank = tower.projectileBank;
    if (!bank || bank.remaining > 0 || !this.circuits.get(tower)?.outlets.length) return true;
    bank.remaining = bank.shots.length; bank.nextAt = this.runtime().battleTime;
    this.runtime().changed(tower);
    return true;
  }

  update() {
    const runtime = this.runtime();
    for (const tower of runtime.towers) {
      const bank = tower.projectileBank;
      if (!tower.inPlay || towerFormType(tower) !== "0" || !bank?.remaining) continue;
      const circuit = this.circuits.get(tower);
      const outlets = circuit?.outlets.filter(t => t.inPlay) ?? [];
      if (!outlets.length) { bank.nextAt = runtime.battleTime; continue; }
      while (bank.remaining > 0 && bank.nextAt <= runtime.battleTime) {
        const outlet = outlets[bank.outletIndex % outlets.length];
        bank.outletIndex = (bank.outletIndex + 1) % outlets.length;
        const bundle = towerFormType(outlet) === "+";
        const count = Math.min(bank.remaining, bundle ? BUNDLE_SHOTS : Math.max(1, numberTowerValue(outlet)));
        const shots = bank.shots.splice(0, count);
        bank.remaining -= shots.length;
        if (!shots.length) { bank.remaining = 0; break; }
        const outputs: StoredTowerShot[] = [];
        for (const shot of shots) {
          const combined = bundle ? outputs.find(other => canBundle(other, shot)) : undefined;
          if (combined) {
            combined.hitCount += shot.hitCount;
            delete combined.initialDamageBudget;
          } else outputs.push(bundle ? { ...shot } : shot);
        }
        for (const shot of outputs) runtime.emit(shot, outlet);
        bank.nextAt += CIRCUIT_RELEASE_INTERVAL;
      }
      runtime.changed(tower);
    }
  }
}
