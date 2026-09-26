import { CELL_HEIGHT, CELL_WIDTH } from "../config";
import { getCardDefinition } from "../registry/cardDefinitions";
import { isTutorialMechanic } from "./tutorial";
import { battleCardAllowed, battlePolicyForActor } from "./battlePolicy";
import type { BattleControlRuntime } from "./battleControls";
import type { BattleRuntime } from "./battleRuntime";
import { forEachSnapshot } from "./iteration";
import { isBossInRect } from "./unitGeometry";
import { damageBoss, damageEnemy } from "./unitLifecycle";

// The live scene and a display-free host use the same control effects.
export function createBattleControlRuntime(runtime: BattleRuntime, actorId: () => string | undefined = () => undefined): BattleControlRuntime {
  const { world, session, observers } = runtime;
  return {
    state: {
      get paused() { return session.controls.paused; }, set paused(value: boolean) { session.controls.paused = value; },
      get speed() { return session.controls.speed; }, set speed(value: number) { session.controls.speed = value; },
      get debugEnabled() { return session.controls.debugEnabled; }, set debugEnabled(value: boolean) { session.controls.debugEnabled = value; },
      get autoUpgradeEnabled() { return runtime.currentResources.auto.autoUpgradeEnabled; },
      set autoUpgradeEnabled(value: boolean) { runtime.currentResources.auto.autoUpgradeEnabled = value; },
      get reserveChars() { return runtime.currentResources.auto.reserveChars; },
      set reserveChars(value: number) { runtime.currentResources.auto.reserveChars = value; }
    },
    get ended() { return world.gameOver; },
    actor: id => session.actor(id), authorize: (actor, control) =>
      (control.type !== "debugChars" || world.economy.hasWallet(actor.id)) &&
      (!["reselect", "reserve", "autoUpgradeEnabled", "debugChars"].includes(control.type) || runtime.players.has(actor.id)),
    get slotCount() { return battlePolicyForActor(session.policy, actorId()).slotCount; },
    cardAllowed: id => battleCardAllowed(battlePolicyForActor(session.policy, actorId()), id),
    get reselectAvailable() { return !isTutorialMechanic(world.options.level.specialMechanic) && battlePolicyForActor(session.policy, actorId()).reselectEnabled; },
    get reselectReady() { return runtime.currentResources.loadout.reselection.isReady(world.battleTime); },
    reselect: cards => {
      if (!runtime.currentResources.loadout.reselect(cards.map(getCardDefinition), runtime.cardClocks)) return false;
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
      runtime.currentResources.loadout.resetCooldowns(runtime.cardClocks);
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
