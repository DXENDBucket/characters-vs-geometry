import type { EdgeTower } from "../types";
import type { TowerState as Tower } from "./towerState";
import { edgeAllows, edgeCells, refreshEdgeFlow } from "./pipelineRules";
import { towerCell } from "./towerTopology";

interface Link { to: string; edge: EdgeTower; forward: boolean }
interface Traversed { from: string; to: string; edge: EdgeTower }
const cellKey = (cell: { lane: number; column: number }) => `${cell.lane}:${cell.column}`;

// Empty cells and ordinary towers are transparent. Only storage/processing nodes stop a route.
export class PipelineRouting {
  private graph = new Map<string, Link[]>();
  private receivers = new Map<string, Tower>();
  private sources = new Set<Tower>();
  private active = new Set<EdgeTower>();
  private cachedPaths = new Map<Tower, Map<Tower, EdgeTower[]>>();
  private cacheTime = -Infinity;

  rebuild(edges: EdgeTower[], sources: Tower[], receivers: Tower[]) {
    this.graph.clear(); this.receivers.clear(); this.active.clear(); this.cachedPaths.clear();
    this.sources = new Set(sources);
    for (const tower of receivers) this.receivers.set(cellKey(towerCell(tower)), tower);
    for (const edge of edges) {
      const [a, b] = edgeCells(edge).map(cellKey);
      const add = (from: string, to: string, forward: boolean) => {
        const links = this.graph.get(from) ?? [];
        links.push({ to, edge, forward }); this.graph.set(from, links);
      };
      add(a, b, true); add(b, a, false);
    }
    for (const source of sources) {
      const { paths, traversed } = this.search(source);
      const incoming = new Map<string, Traversed[]>();
      for (const link of traversed) {
        const links = incoming.get(link.to) ?? [];
        links.push(link); incoming.set(link.to, links);
      }
      const queue = [...paths.keys()].map(tower => cellKey(towerCell(tower))), reached = new Set(queue);
      for (let i = 0; i < queue.length; i++) for (const link of incoming.get(queue[i]) ?? []) {
        this.active.add(link.edge);
        if (!reached.has(link.from)) { reached.add(link.from); queue.push(link.from); }
      }
    }
  }

  isActive(edge: EdgeTower) { return edge.mode !== "!=" && this.active.has(edge); }

  pathsFrom(source: Tower, time: number) {
    if (time !== this.cacheTime) { this.cachedPaths.clear(); this.cacheTime = time; }
    let paths = this.cachedPaths.get(source);
    if (!paths) {
      paths = this.sources.has(source) ? this.search(source, time).paths : new Map<Tower, EdgeTower[]>();
      this.cachedPaths.set(source, paths);
    }
    return paths;
  }

  consume(path: EdgeTower[]) {
    for (const edge of path) edge.flowCredit! -= 1;
    // A saturated link can expose an alternate route. Other shots reuse the search until then.
    if (path.some(edge => edge.flowCredit! < 1)) this.cachedPaths.clear();
  }

  private search(source: Tower, time?: number) {
    const origin = cellKey(towerCell(source)), queue = [origin];
    const visited = new Map<string, EdgeTower[]>([[origin, []]]);
    const paths = new Map<Tower, EdgeTower[]>(), traversed: Traversed[] = [];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const link of this.graph.get(from) ?? []) {
        if (link.to === origin || !edgeAllows(link.edge, link.forward)) continue;
        if (time !== undefined) {
          refreshEdgeFlow(link.edge, time);
          if (link.edge.flowCredit! < 1) continue;
        } else traversed.push({ from, to: link.to, edge: link.edge });
        if (visited.has(link.to)) continue;
        const path = [...visited.get(from)!, link.edge];
        visited.set(link.to, path);
        const receiver = this.receivers.get(link.to);
        if (receiver) paths.set(receiver, path);
        else queue.push(link.to);
      }
    }
    return { paths, traversed };
  }
}
