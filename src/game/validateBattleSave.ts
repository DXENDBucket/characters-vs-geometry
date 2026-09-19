import type { BattleSaveState } from "./battleSaveState";
import { decodeSaveGraph, type NodeKind, type SaveGraph } from "./saveGraph";
import { rankedBossFamily } from "../bosses/bossRanks";
import type { BossKind } from "../types";
import { parseEnemyKind } from "./enemyIdentity";
import { BATTLE_RULES_VERSION, validBattleClock } from "./battleSimulation";

export function validateBattleSave(graph: SaveGraph, wave: number, expectedBossKind?: BossKind) {
  const units = new Map<NodeKind, Set<object>>();
  const state = decodeSaveGraph<BattleSaveState>(graph, node => {
    const value = {};
    const set = units.get(node.kind) ?? new Set<object>();
    set.add(value); units.set(node.kind, set);
    return value;
  });
  const require = (condition: unknown) => { if (!condition) throw new Error("Invalid battle save state"); };
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const timestamp = (value: unknown) => typeof value === "number" && !Number.isNaN(value);
  const array = (value: unknown, check: (item: unknown) => boolean): boolean => Array.isArray(value) && value.every(check);
  const member = (kind: NodeKind) => (value: unknown) => Boolean(value && typeof value === "object" && units.get(kind)?.has(value));
  require(record(state));
  if (state.simulation !== undefined) {
    const simulation = state.simulation;
    require(record(simulation) && simulation.version === BATTLE_RULES_VERSION && validBattleClock(simulation.clock) &&
      Number.isInteger(simulation.randomState) && simulation.randomState >= 0 && simulation.randomState <= 0xffffffff &&
      Number.isSafeInteger(simulation.mirrorNextGroupId) && simulation.mirrorNextGroupId >= 1);
  }
  for (const key of ["levelElapsed", "battleTime", "cardTime", "nextNaturalProduceAt", "chars", "baseIntegrity",
    "wave", "enemiesDefeated", "towerOrder", "gameSpeed", "autoUpgradeReserveChars", "extraction"] as const) {
    require(finite(state[key]) && state[key] >= 0);
  }
  require(state.wave === wave && state.baseIntegrity > 0 && state.gameSpeed > 0 && typeof state.autoUpgradeEnabled === "boolean");
  require(expectedBossKind ? member("boss")(state.boss) && state.boss!.hp > 0 : !state.boss);
  for (const object of units.get("boss") ?? []) {
    const boss = object as Record<string, unknown>;
    const family = rankedBossFamily(boss.kind);
    require(expectedBossKind && family && family === rankedBossFamily(expectedBossKind));
    require(Number.isSafeInteger(boss.rank) && (boss.rank as number) >= 1);
    require(finite(boss.hp) && boss.hp >= 0 && finite(boss.maxHp) && boss.maxHp > 0 && boss.hp <= boss.maxHp);
    if (!record(boss.baseStats) || !record(boss.finalStats) || !record(boss.skills)) throw new Error("Invalid boss state");
    for (const key of ["maxHp", "armor", "magicResistance", "speed", "finalDamageReduction"]) {
      require(finite(boss.baseStats[key]) && finite(boss.finalStats[key]));
    }
    const skillKeys = ["promotion", "advance", ...(family === "tetrahedron"
      ? ["charge", "impact", "suppression", "desperation"] : family === "dodecahedron" ? ["endlessWings"] : [])];
    for (const key of skillKeys) {
      const skill = boss.skills[key];
      require(record(skill) && [skill.sp, skill.spBuffer, skill.activeUntil, skill.maxSp, skill.cost].every(finite));
    }
    require(array(boss.statusEffects, effect => record(effect) && typeof effect.name === "string" && timestamp(effect.expiresAt)));
    if (family === "octahedron") {
      require(!boss.octahedronCopies || (Array.isArray(boss.octahedronCopies) && boss.octahedronCopies.length <= 3 &&
        new Set(boss.octahedronCopies).size === boss.octahedronCopies.length && boss.octahedronCopies.every(copy =>
          member("boss")(copy) && copy !== boss && copy.rank === boss.rank && copy.kind === boss.kind &&
          copy.hp === boss.hp && copy.maxHp === boss.maxHp && !copy.octahedronCopies?.length)));
      require(["x", "y"].includes(boss.movementAxis as string) && (boss.movementDirection === -1 || boss.movementDirection === 1));
      for (const key of ["octahedronSolarBombsInitialized", "octahedronSpawn75Triggered", "octahedronSpawn50Triggered", "octahedronSpawn25Triggered"])
        require(boss[key] === undefined || typeof boss[key] === "boolean");
    } else require(!boss.octahedronCopies || (Array.isArray(boss.octahedronCopies) && boss.octahedronCopies.length === 0));
    require(boss.advanceMinionKind === ((boss.rank as number) === 1 ? "square" : `square${boss.rank}`));
    for (const key of ["hitboxWidth", "hitboxHeight", "rotationX", "rotationY", "rotationZ", "velocityX", "velocityY", "velocityZ",
      "targetVelocityX", "targetVelocityY", "targetVelocityZ", "nextTurnIn", "contactAttackBuffer"]) require(finite(boss[key]));
    require(finite(boss.invincibleUntil) || (family === "octahedron" && boss.invincibleUntil === Infinity));
    if (family === "tetrahedron") {
      for (const key of ["halfHpTriggered", "criticalHpTriggered", "pendingCriticalSummon"]) require(typeof boss[key] === "boolean");
      for (const key of ["chargeExpiresAt", "bossHasteUntil", "nextBossHasteTrailAt"]) require(finite(boss[key]));
    }
    if (family === "dodecahedron") {
      require(typeof boss.companionsInitialized === "boolean");
      require(Number.isInteger(boss.companionDeathsHandled) && (boss.companionDeathsHandled as number) >= 0 &&
        (boss.companionDeathsHandled as number) <= 3);
    }
  }
  require(array(state.towers, member("tower")) && array(state.enemies, member("enemy")) &&
    array(state.projectiles, member("projectile")) && array(state.enemyProjectiles, member("enemyProjectile")) && array(state.mortarProjectiles, member("mortar")));
  for (const kind of ["tower", "enemy"] as const) {
    for (const object of units.get(kind) ?? []) {
      const value = object as Record<string, unknown>;
      require(finite(value.hp) && finite(value.maxHp) && value.maxHp > 0 && typeof value.inPlay === "boolean");
      require(record(value.baseStats) && record(value.finalStats) && record(value.skills));
      require(array(value.statusEffects, effect => record(effect) && typeof effect.name === "string" && timestamp(effect.expiresAt)));
      require(Number.isInteger(value.lane) && (value.lane as number) >= 0 && (value.lane as number) < 7);
      if (kind === "enemy" && parseEnemyKind(value.kind)?.family === "dodecahedronCompanion") {
        for (const key of ["bossOrbitAngle", "bossOrbitRadius", "bossCompanionIndex", "bossCompanionNextActionAt"]) require(finite(value[key]));
        require(["laser", "mortar", "wings"].includes(value.bossCompanionActionPhase as string));
      }
      if (kind === "tower") {
        if (value.moveVisual) {
          require(record(value.moveVisual) && [value.moveVisual.fromX, value.moveVisual.fromY,
            value.moveVisual.startedAt].every(finite) && finite(value.moveVisual.duration) && value.moveVisual.duration > 0);
        }
        require(typeof value.id === "string" && value.id.startsWith("tower:") && Number.isInteger(value.placedOrder));
        require(Number.isInteger(value.column) && (value.column as number) >= 0 && (value.column as number) < 13);
        require(timestamp(value.lastFire) && timestamp(value.nextProduceAt) && finite(value.level) && value.level >= 1);
        if (value.healthPool) {
          require(record(value.healthPool) && finite(value.healthPool.hp) && finite(value.healthPool.maxHp) &&
            finite(value.healthPool.linkCount) && value.healthPool.linkCount > 0 && array(value.healthPool.members, member("tower")));
        }
      }
    }
  }
  require(array(state.cardDeadlines, entry => record(entry) && typeof entry.id === "string" && timestamp(entry.readyAt)));
  require(array(state.actions, entry => record(entry) && finite(entry.at) && record(entry.action) &&
    ((["volley", "shock", "targetedEffect", "spellMortar"].includes(entry.action.type as string) && member("tower")(entry.action.tower)) ||
     (["enemyShot", "enemyLaser", "enemyMortar"].includes(entry.action.type as string) && member("enemy")(entry.action.enemy)) ||
     (["companionLaser", "companionMortar"].includes(entry.action.type as string) && member("boss")(entry.action.boss) &&
       member("enemy")(entry.action.companion) && finite(entry.action.hitCount) && entry.action.hitCount > 0) ||
     (entry.action.type === "bossDeathLaser" && member("boss")(entry.action.boss) &&
       finite(entry.action.hitCount) && entry.action.hitCount > 0 && finite(entry.action.laneRadius) && entry.action.laneRadius >= 0) ||
     (entry.action.type === "bossDeathMortar" && member("boss")(entry.action.boss) && member("tower")(entry.action.target)) ||
     (entry.action.type === "bossReinforcements" && member("boss")(entry.action.boss) &&
       ["hexSpellBulwark", "burrowArrow", "heart", "slopeTriangle", "archangelHeptagon"].includes(parseEnemyKind(entry.action.kind)?.family ?? "") &&
       array(entry.action.lanes, lane => Number.isInteger(lane) && (lane as number) >= 0 && (lane as number) < 7)))));
  require(array(state.storage, entry => record(entry) && member("enemy")(entry.enemy) && member("tower")(entry.carrier) && finite(entry.releaseAt)));
  require(array(state.spellMortarFlights, entry => record(entry) && member("tower")(entry.source) && finite(entry.progress) && entry.progress >= 0 && entry.progress <= 1));
  require(array(state.sealedCells, cell => typeof cell === "string"));
  require(record(state.shifter) && [state.shifter.readyAt, state.shifter.cooldownStartedAt, state.shifter.cooldownDuration].every(finite));
  require(record(state.reselection) && finite(state.reselection.readyAt) && array(state.reselection.cards,
    item => Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && timestamp(item[1])));
  if (state.waveTracker) require([state.waveTracker.number, state.waveTracker.totalWeight,
    state.waveTracker.defeatedWeight, state.waveTracker.spawnedAt].every(finite));
}
