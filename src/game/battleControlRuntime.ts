import { CELL_HEIGHT, CELL_WIDTH } from "../config";
import { getCardDefinition } from "../registry/cardDefinitions";
import { isTutorialMechanic } from "./tutorial";
import { battleCardAllowed } from "./battlePolicy";
import type { BattleControlRuntime } from "./battleControls";
import type { BattleRuntime } from "./battleRuntime";
import { forEachSnapshot } from "./iteration";
import { isBossInRect } from "./unitGeometry";
import { damageBoss, damageEnemy } from "./unitLifecycle";

// The live scene and a display-free host use the same control effects.
export function createBattleControlRuntime(runtime: BattleRuntime, actorId: () => string | undefined = () => undefined): BattleControlRuntime {
  const { world, session, observers } = runtime;
  return {
    state: session.controls,
    get ended() { return world.gameOver; },
    actor: id => session.actor(id), authorize: (actor, control) =>
      control.type !== "debugChars" || world.economy.hasWallet(actor.id),
    get slotCount() { return session.policy.slotCount; },
    cardAllowed: id => battleCardAllowed(session.policy, id),
    get reselectAvailable() { return !isTutorialMechanic(world.options.level.specialMechanic) && session.policy.reselectEnabled; },
    get reselectReady() { return world.loadout.reselection.isReady(world.battleTime); },
    reselect: cards => {
      if (!world.loadout.reselect(cards.map(getCardDefinition), world)) return false;
      observers.controlChanged?.("reselect");
      return true;
    },
    get tutorialAvailable() { return !!world.tutorial; },
    tutorialAdvance: () => { world.tutorial?.advance(); observers.controlChanged?.("tutorialAdvance"); },
    tutorialInput: input => {
      if (!world.tutorial?.usesToolInteraction) return "unavailable";
      if (input.selected.some(id => !world.towers.some(tower => tower.entityId === id && tower.inPlay && !tower.transient && !tower.nullified))) return "stale";
      world.tutorialInteraction = { tool: input.tool, selected: [...input.selected] };
      return "handled";
    },
    pauseChanged: () => observers.controlChanged?.("pause"),
    speedChanged: () => observers.controlChanged?.("speed"),
    autoUpgradeChanged: () => { runtime.autoUpgrade(); observers.controlChanged?.("autoUpgradeEnabled"); },
    debugChanged: () => observers.controlChanged?.("debugMode"),
    debugChars: () => {
      world.loadout.resetCooldowns(world);
      world.baseIntegrity += 1000;
      world.invalidateFlawless();
      const amount = world.gainChars(10000, actorId());
      runtime.autoUpgrade();
      observers.debugChars?.(Math.floor(amount));
    },
    debugDamage: (point, mode) => {
      world.invalidateFlawless();
      const rangeX = CELL_WIDTH / 2, rangeY = CELL_HEIGHT / 2;
      const damage = mode === "super" ? 105000 : 15000;
      observers.debugDamage?.(point);
      forEachSnapshot(world.enemies, enemy => {
        if (Math.abs(enemy.x - point.x) <= rangeX && Math.abs(enemy.y - point.y) <= rangeY) {
          damageEnemy(runtime.lifecycle, enemy, damage, "true");
        }
      });
      if (isBossInRect(world.boss, point.x - rangeX, point.y - rangeY, rangeX * 2, rangeY * 2)) {
        damageBoss(runtime.lifecycle, damage, "true");
      }
    }
  };
}
