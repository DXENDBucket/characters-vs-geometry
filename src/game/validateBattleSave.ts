import type { BattleSaveState } from "./battleSaveState";
import { decodeSaveGraph, type NodeKind, type SaveGraph } from "./saveGraph";
import { rankedBossFamily } from "../bosses/bossRanks";
import type { BossKind, Enemy } from "../types";
import { cardDefinitions } from "../data/cards";
import { parseEnemyKind } from "./enemyIdentity";
import { getEnemyDefinition } from "../registry/enemies";
import { BATTLE_RULES_VERSION, validBattleClock } from "./battleSimulation";
import { BUNDLE_SHOTS, PIPELINE_RATE } from "./pipelineRules";

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
  const integrity = (value: Record<string, unknown>) =>
    (value.partialHitDamage === undefined || finite(value.partialHitDamage) && value.partialHitDamage > 0 &&
      finite(value.damage) && value.partialHitDamage <= value.damage) &&
    (value.initialDamageBudget === undefined || finite(value.initialDamageBudget) && value.initialDamageBudget > 0 &&
      finite(value.damage) && value.initialDamageBudget >= value.damage * ((value.hitCount as number ?? 1) - 1) +
        ((value.partialHitDamage ?? value.damage) as number));
  const array = (value: unknown, check: (item: unknown) => boolean): boolean => Array.isArray(value) && value.every(check);
  const member = (kind: NodeKind) => (value: unknown) => Boolean(value && typeof value === "object" && units.get(kind)?.has(value));
  const storedShot = (shot: unknown) => record(shot) && integrity(shot) && ["bolt", "star", "shell", "hash", "dollar"].includes(shot.type as string) &&
    ["physical", "magic", "true"].includes(shot.damageType as string) &&
    ["vx", "vy", "damage", "splashRadius"].every(key => finite(shot[key])) &&
    (shot.vx as number) > 0 && (shot.damage as number) >= 0 && (shot.splashRadius as number) >= 0 &&
    Number.isSafeInteger(shot.hitCount) && (shot.hitCount as number) >= 1 &&
    timestamp(shot.remainingRange) && (shot.remainingRange as number) >= 0 &&
    (shot.sourceTower === undefined || member("tower")(shot.sourceTower)) &&
    (shot.sourceBehaviorType === undefined || cardDefinitions.some(card => card.id === shot.sourceBehaviorType)) &&
    (shot.debuff === undefined || typeof shot.debuff === "string") &&
    (shot.debuffDuration === undefined || finite(shot.debuffDuration) && shot.debuffDuration >= 0) &&
    (shot.pipelineMovedAt === undefined || finite(shot.pipelineMovedAt) && shot.pipelineMovedAt >= 0) &&
    (shot.action === undefined || pipelineAction(shot.action));
  const learnable = (type: unknown) => cardDefinitions.some(card => card.id === type && card.cost <= 999 && card.id !== "1" && card.id !== "0");
  const behavior = (value: unknown) => record(value) && learnable(value.type) && Number.isSafeInteger(value.level) && (value.level as number) >= 1;
  const nativeTowerEvent = (value: unknown) => record(value) && (
    ["production", "hitProduction", "shock", "detonation", "targeted"].includes(value.kind as string) ||
    (value.kind === "attack" && (value.hitCount === undefined || Number.isSafeInteger(value.hitCount) && (value.hitCount as number) >= 1)) ||
    (value.kind === "trap" && (value.target === "boss" || member("enemy")(value.target) || member("boss")(value.target))) ||
    (value.kind === "retaliation" && member("enemy")(value.target)) ||
    (value.kind === "reflection" && (member("enemyProjectile")(value.projectile) || member("mortar")(value.projectile))) ||
    (value.kind === "skill" && ["x", "y", "laneOffset", "columnOffset"].every(key => value[key] === undefined || finite(value[key])))
  );
  const actionStats = (value: unknown) => record(value) &&
    ["maxHp", "armor", "magicResistance", "attackPower"].every(key => finite(value[key])) &&
    (value.maxHp as number) > 0 && (value.attackPower as number) >= 0 &&
    (value.attackSpeed === undefined || finite(value.attackSpeed) && value.attackSpeed >= 0) &&
    (value.damageType === undefined || ["physical", "magic", "true"].includes(value.damageType as string));
  const actionContext = (value: unknown) => record(value) && Number.isSafeInteger(value.level) &&
    (value.level as number) >= 1 && actionStats(value.stats);
  const pipelineAction = (value: unknown) => record(value) && learnable(value.type) && actionContext(value) &&
    nativeTowerEvent(value.event) && finite(value.baseDamage) && value.baseDamage >= 0;
  const towerEvent = (value: unknown) => nativeTowerEvent(value) ||
    (record(value) && value.kind === "combined" && nativeTowerEvent(value.original));
  const numberMemory = (value: unknown) => array(value, entry => record(entry) && learnable(entry.type) &&
    Number.isSafeInteger(entry.count) && (entry.count as number) >= 0 &&
    (entry.storedEvent === undefined || towerEvent(entry.storedEvent)) &&
    array(entry.sourceIds, id => typeof id === "string" && /^tower:\d+$/.test(id)));
  require(record(state));
  if (state.edgeTowers !== undefined) {
    const edgeKeys = new Set<string>();
    require(array(state.edgeTowers, edge => {
      if (!record(edge) || edge.type !== "=" || !["horizontal", "vertical"].includes(edge.axis as string) ||
        !Number.isInteger(edge.lane) || !Number.isInteger(edge.column)) return false;
      if (edge.mode !== undefined && !["=", ">", "<", "!="].includes(edge.mode as string)) return false;
      if (edge.level !== undefined && (!Number.isSafeInteger(edge.level) || (edge.level as number) < 1)) return false;
      if (edge.autoUpgrade !== undefined && typeof edge.autoUpgrade !== "boolean") return false;
      if (edge.flowCredit !== undefined && (!finite(edge.flowCredit) || edge.flowCredit < 0 || edge.flowCredit > PIPELINE_RATE * ((edge.level as number) ?? 1))) return false;
      if (edge.flowUpdatedAt !== undefined && (!finite(edge.flowUpdatedAt) || edge.flowUpdatedAt < 0)) return false;
      const lane = edge.lane as number, column = edge.column as number;
      const key = `${edge.axis}:${lane}:${column}`;
      if (edgeKeys.has(key)) return false;
      edgeKeys.add(key);
      return lane >= 0 && lane < (edge.axis === "vertical" ? 6 : 7) && column >= 0 && column < (edge.axis === "horizontal" ? 12 : 13);
    }));
  }
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
  const towerCells = new Set<string>();
  for (const tower of state.towers) {
    if (!tower.inPlay || tower.transient) continue;
    const key = `${tower.lane}:${tower.column}:${tower.type === "()" ? "shell" : "main"}`;
    require(!towerCells.has(key)); towerCells.add(key);
  }
  for (const shot of [...state.projectiles, ...state.enemyProjectiles, ...state.mortarProjectiles]) {
    require(integrity(shot as unknown as Record<string, unknown>));
  }
  for (const kind of ["tower", "enemy"] as const) {
    for (const object of units.get(kind) ?? []) {
      const value = object as Record<string, unknown>;
      require(finite(value.hp) && finite(value.maxHp) && value.maxHp > 0 && typeof value.inPlay === "boolean");
      require(record(value.baseStats) && record(value.finalStats) && record(value.skills));
      require(array(value.statusEffects, effect => record(effect) && typeof effect.name === "string" && timestamp(effect.expiresAt)));
      require(Number.isInteger(value.lane) && (value.lane as number) >= 0 && (value.lane as number) < 7);
      if (kind === "enemy") {
        if (value.parenthesisCargo !== undefined) {
          const identity = parseEnemyKind(value.kind);
          require(Array.isArray(value.parenthesisCargo));
          const cargo = value.parenthesisCargo as Enemy[];
          require(!cargo.length || (identity?.family === "parentheses" && cargo.length <= identity.rank + 1));
          require(new Set(cargo).size === cargo.length && cargo.every(passenger => member("enemy")(passenger) &&
            passenger !== object && passenger.inPlay === false && passenger.parenthesisCarrier === object &&
            parseEnemyKind(passenger.kind)?.family !== "parentheses" && !passenger.healthPool));
        }
        if (value.parenthesisCarrier !== undefined) {
          const carrier = value.parenthesisCarrier as Enemy;
          require(member("enemy")(carrier) && parseEnemyKind(carrier.kind)?.family === "parentheses" &&
            carrier.parenthesisCargo?.includes(object as Enemy) && value.inPlay === false && !state.enemies.includes(object as Enemy));
        }
        if (value.parenthesisHpBonus !== undefined) require(finite(value.parenthesisHpBonus) && value.parenthesisHpBonus >= 0);
        require(value.healthLinksInitialized === undefined || typeof value.healthLinksInitialized === "boolean");
        if (value.healthPool) {
          const pool = value.healthPool;
          if (!record(pool) || !Array.isArray(pool.members) || !record(pool.owner)) throw new Error("Invalid enemy health pool");
          const owner = pool.owner as unknown as Enemy;
          require(member("enemy")(owner) && parseEnemyKind(owner.kind) && owner.healthLinksInitialized === true);
          require(finite(pool.hp) && finite(pool.maxHp) && pool.hp > 0 && pool.maxHp > 0 && pool.hp <= pool.maxHp);
          require(pool.members.length >= 2 && pool.members.length <= (getEnemyDefinition(owner.kind).healthLinkCapacity ?? 0) + 1 &&
            new Set(pool.members).size === pool.members.length && pool.members.includes(owner) && pool.members.includes(value));
          require(pool.members.every(item => member("enemy")(item) && record(item) && item.healthPool === pool && item.inPlay === true));
        }
      }
      if (kind === "enemy" && parseEnemyKind(value.kind)?.family === "dodecahedronCompanion") {
        for (const key of ["bossOrbitAngle", "bossOrbitRadius", "bossCompanionIndex", "bossCompanionNextActionAt"]) require(finite(value[key]));
        require(["laser", "mortar", "wings"].includes(value.bossCompanionActionPhase as string));
      }
      if (kind === "tower") {
        if (value.parenthesisGuard !== undefined) {
          const guard = value.parenthesisGuard;
          require(member("tower")(guard) && record(guard) && guard.type === "()" && value.type !== "()" &&
            guard.lane === value.lane && guard.column === value.column);
        }
        if (value.parenthesisInner !== undefined) {
          const inner = value.parenthesisInner;
          require(member("tower")(inner) && record(inner) && value.type === "()" && inner.type !== "()" &&
            inner.lane === value.lane && inner.column === value.column);
        }
        for (const key of ["healingCredit", "healingUpdatedAt"]) {
          require(value[key] === undefined || finite(value[key]) && (value[key] as number) >= 0);
        }
        if (value.routedSkills !== undefined) require(record(value.routedSkills) &&
          Object.entries(value.routedSkills).every(([type, until]) => learnable(type) && finite(until) && until >= 0));
        if (value.pipelineSkillContexts !== undefined) require(record(value.pipelineSkillContexts) &&
          Object.entries(value.pipelineSkillContexts).every(([type, context]) => learnable(type) && actionContext(context)));
        require(value.continuousAttack === undefined || typeof value.continuousAttack === "boolean");
        if (value.nextInterceptionAt !== undefined) require(finite(value.nextInterceptionAt) && value.nextInterceptionAt >= 0);
        if (value.projectileBank !== undefined) {
          const bank = value.projectileBank;
          // Temporary levels can expire while a full bank retains its existing ammunition.
          require(record(bank) && Array.isArray(bank.shots) &&
            Number.isSafeInteger(bank.remaining) && (bank.remaining as number) >= 0 && (bank.remaining as number) <= bank.shots.length &&
            finite(bank.nextAt) && Number.isSafeInteger(bank.outletIndex) && (bank.outletIndex as number) >= 0 &&
            array(bank.shots, storedShot));
        }
        if (value.projectileRouteIndex !== undefined) require(Number.isSafeInteger(value.projectileRouteIndex) && (value.projectileRouteIndex as number) >= 0);
        if (value.projectileNode !== undefined) {
          const node = value.projectileNode;
          require(record(node) && array(node.input, storedShot) && array(node.output, storedShot));
          if (record(node) && node.processing !== undefined) {
            const job = node.processing;
            require(record(job) && array(job.shots, storedShot) && (job.shots as unknown[]).length === 1 &&
              job.count === BUNDLE_SHOTS && finite(job.completeAt) && job.completeAt >= 0);
          }
        }
        if (value.numberValue !== undefined) require(Number.isSafeInteger(value.numberValue) && (value.numberValue as number) >= 0);
        if (value.equationLevel !== undefined) require(Number.isSafeInteger(value.equationLevel) && (value.equationLevel as number) >= 1);
        if (value.topologyTarget !== undefined) {
          const cell = value.topologyTarget;
          require(value.type === "&" && record(cell) && Number.isInteger(cell.lane) && (cell.lane as number) >= 0 && (cell.lane as number) < 7 &&
            Number.isInteger(cell.column) && (cell.column as number) >= 0 && (cell.column as number) < 13 && finite(value.topologyOrder) && value.topologyOrder >= 0);
        }
        if (value.numberMemory !== undefined) {
          require(numberMemory(value.numberMemory));
        }
        if (value.numberChannels !== undefined) require(record(value.numberChannels) &&
          (value.type === "+" || value.type === "-") && Object.entries(value.numberChannels).every(([axis, state]) =>
            ["horizontal", "vertical"].includes(axis) && record(state) &&
            (state.numberValue === undefined || Number.isSafeInteger(state.numberValue) && (state.numberValue as number) >= 0) &&
            (state.equationLevel === undefined || Number.isSafeInteger(state.equationLevel) && (state.equationLevel as number) >= 1) &&
            (state.numberMemory === undefined || numberMemory(state.numberMemory))));
        if (value.imitatedSkills !== undefined) require(array(value.imitatedSkills, learnable));
        if (value.imitatedSkillLevels !== undefined) require(record(value.imitatedSkillLevels) &&
          Object.entries(value.imitatedSkillLevels).every(([type, level]) => learnable(type) && Number.isSafeInteger(level) && (level as number) >= 1));
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
    ((["volley", "shock", "targetedEffect", "spellMortar"].includes(entry.action.type as string) && member("tower")(entry.action.tower) &&
       (entry.action.behavior === undefined || behavior(entry.action.behavior))) ||
     (entry.action.type === "imitation" && member("tower")(entry.action.tower) && behavior(entry.action.behavior) && towerEvent(entry.action.event)) ||
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
