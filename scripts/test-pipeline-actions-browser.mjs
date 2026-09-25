import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const result = await page.evaluate(async () => {
    const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const progress = await mod("/src/progress.ts"), c = await mod("/src/config.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { validateSurvivalSave } = await mod("/src/survivalSaves.ts");
    const { createEnemy } = await mod("/src/game/enemyFactory.ts");
    const { getTowerSkillState } = await mod("/src/game/skillState.ts");
    const { towerHasSkillBehavior } = await mod("/src/game/towerIdentity.ts");
    const { removeTower } = await mod("/src/game/unitLifecycle.ts");
    const { createTowerProjectile } = await mod("/src/game/projectiles.ts");
    const game = window.__testGame; game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const check = (ok, text) => { if (!ok) throw Error(text); };
    const selectedCards = ["A", "0", "1", "=", "+", "-", "b", "t", "!", "S"];
    let scene, assertions = 0;
    const start = () => {
      for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
      game.scene.start("GameScene", { levelId: "IF-1", seed: 417, selectedCards });
      scene = game.scene.getScene("GameScene"); scene.chars = 50000;
    };
    const place = (type, col, lane = 3, level = 1) => scene.spawnGeneratedTower(type, lane, col, level);
    const connect = (from, to) => {
      for (let column = from; column < to; column++) scene.edgeTowers.push(scene.world.entityIds.identify("edge",
        { type: "=", column, lane: 3, axis: "horizontal", mode: ">", level: 10 }));
      scene.numbers.sync();
    };
    const tick = (dt = 40) => { scene.battleTime += dt; scene.numbers.update(); };
    const flush = () => scene.actionQueue.update(scene.battleTime, action => scene.executeBattleAction(action));
    const enemyAt = tower => {
      const enemy = createEnemy(scene, { kind: "circle", lane: tower.lane, x: tower.x, time: 0, waveNumber: 1, waveWeight: 10, finalDamageReduction: 0 });
      scene.enemies.push(enemy); return enemy;
    };
    const attack = (tower, hitCount = 1) => scene.executeBattleAction({ type: "volley", tower, copyRevision: tower.copyRevision, hitCount });
    const snapshot = () => {
      const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
      validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
        unlimitedFirepower: false, selectedCards, graph });
      return graph;
    };

    // Consuming the source must not execute its effect until a numeric outlet receives it.
    for (const type of ["i", "f", "F", "l", "r"]) {
      start(); const source = place(type, 1), bank = place("0", 2), outlet = place("1", 7);
      connect(1, 7); scene.edgeTowers.at(-1).mode = "!="; scene.numbers.sync();
      const local = enemyAt(source), remote = enemyAt(outlet), localHp = local.hp;
      scene.triggerShockTower(source); flush();
      check(!source.inPlay && bank.projectileBank.shots.length === 1, `${type}: source not consumed or effect lost`);
      check(local.hp === localHp && !local.statusEffects.length && !remote.statusEffects.length, `${type}: effect leaked at input`);
      const saved = snapshot(); start(); scene.applyBattleSave(restoreBattleSnapshot(scene, saved));
      const restoredOutlet = scene.towers.find(t => t.type === "1"), restoredLocal = scene.enemies.find(e => e.x === source.x);
      const restoredRemote = scene.enemies.find(e => e.x === outlet.x), hpBefore = restoredRemote.hp;
      scene.edgeTowers.at(-1).mode = ">"; scene.numbers.sync(); tick(); flush();
      check(restoredOutlet.inPlay, `${type}: outlet was consumed instead of source`);
      if (type !== "f") check(restoredLocal.hp === localHp && !restoredLocal.statusEffects.length, `${type}: source effect repeated after restore`);
      check(type === "i" || type === "f" ? restoredRemote.statusEffects.length > 0 : restoredRemote.hp < hpBefore,
        `${type}: outlet effect failed after source removal and restore`);
      const hpAfter = restoredRemote.hp; tick(); flush();
      if (type !== "F") check(restoredRemote.hp === hpAfter, `${type}: effect emitted twice`);
      assertions++;
    }

    start(); const standalone = place("i", 1), normalEnemy = enemyAt(standalone); place("0", 2);
    connect(1, 2); scene.edgeTowers[0].mode = "!="; scene.numbers.sync();
    scene.triggerShockTower(standalone);
    check(!standalone.inPlay && normalEnemy.statusEffects.length > 0, "Closed pipes swallowed ordinary one-shot effect");

    for (const type of ["b", "t", "!"]) {
      start(); const target = place("A", 1), bank = place("0", 2), outlet = place("1", 4);
      connect(1, 4); const originalDirection = target.facingDirection;
      check(scene.targetedEffects.use(scene.getDefinition(type), 3, 1, target) === "handled", `${type}: placement failed`);
      flush();
      check(!scene.towers.some(t => t.transient) && bank.projectileBank.shots.length === 1, `${type}: attachment not consumed/routed`);
      check(target.facingDirection === originalDirection && !target.continuousAttack && target.trueDamageUntil <= scene.battleTime,
        `${type}: attachment applied at source`);
      tick();
      check(type === "b" ? outlet.facingDirection === -1 : type === "t" ? outlet.trueDamageUntil > scene.battleTime : outlet.continuousAttack,
        `${type}: attachment missing at outlet`);
      assertions++;
    }

    start(); const producer = place("X", 1, 3, 3), storage = place("0", 2); place("1", 4);
    connect(1, 4); const money = scene.effectiveChars(); attack(producer);
    check(scene.effectiveChars() === money && storage.projectileBank.shots.length === 1, "Production was duplicated at input");
    tick(); check(scene.effectiveChars() > money, "Stored production did not execute");
    const afterProduction = scene.effectiveChars(); tick(); check(scene.effectiveChars() === afterProduction, "Production executed repeatedly");

    start(); const caster = place("S", 1), spellBank = place("0", 2), spellOutlet = place("1", 4);
    connect(1, 4); getTowerSkillState(caster, "spellMortar").sp = c.SPELL_MORTAR_SKILL_MAX;
    check(scene.towerSkills.activateManualSkills([caster], "S", { x: spellOutlet.x + 100, y: spellOutlet.y }) === "handled",
      "S command was rejected");
    flush();
    check(getTowerSkillState(caster, "spellMortar").sp === 0 && !scene.towerSkills.snapshotFlights().length &&
      spellBank.projectileBank.shots.length === 1, "S failed to pay SP or fired before pipeline output");
    snapshot(); tick(); flush();
    check(scene.towerSkills.snapshotFlights().length === 1 && scene.towerSkills.snapshotFlights()[0].source === spellOutlet,
      "S failed to launch from outlet");
    tick(c.SPELL_MORTAR_SHOT_INTERVAL * 3); flush();
    check(scene.towerSkills.snapshotFlights().length === c.SPELL_MORTAR_SHOT_COUNT, "S lost or duplicated its salvo");
    assertions++;

    start(); const pusher = place("N", 1), pushBank = place("0", 2), pushOutlet = place("1", 4);
    connect(1, 4); const sourceEnemy = enemyAt(pusher), outputEnemy = enemyAt(pushOutlet), sourceX = sourceEnemy.x;
    const sourceHp = pusher.hp, outletHp = pushOutlet.hp; attack(pusher);
    check(pusher.hp === sourceHp - 400 && sourceEnemy.x === sourceX && pushBank.projectileBank.shots.length === 1,
      "N failed to pay its original self-damage or moved the source target");
    const outputX = outputEnemy.x; tick();
    check(pushOutlet.hp === outletHp && outputEnemy.x !== outputX, "N output charged self-damage twice or failed to push");
    assertions++;

    start(); const trap = place("G", 1), trapBank = place("0", 2); place("1", 4); connect(1, 4);
    const trapTarget = enemyAt(trap), trapHp = trapTarget.hp; scene.triggerTrapTower(trap, trapTarget);
    check(!trap.inPlay && trapTarget.hp === trapHp && trapBank.projectileBank.shots.length === 1, "Trap was not consumed/routed");
    tick(); check(trapTarget.hp < trapHp, "Stored trap lost its selected target"); assertions++;

    for (const type of ["d", "v", "x"]) {
      start(); const source = place(type, 1), bank = place("0", 2), outlet = place("1", 4);
      connect(1, 4); const enemy = enemyAt(place("B", 6)); const hp = enemy.hp;
      attack(source, 2);
      check(bank.projectileBank.shots.length === 1 && !scene.projectiles.length && !scene.mortarProjectiles.length && enemy.hp === hp,
        `${type}: non-bullet attack was not exclusively routed`);
      tick();
      check(type === "d" ? enemy.hp < hp : type === "v" ? scene.mortarProjectiles.length === 2 : scene.projectiles.length === 8,
        `${type}: output lost action or multi-hit count`);
      check(!scene.projectiles.some(p => !p.circuitChecked), `${type}: output can be recaptured`);
      assertions++;
    }

    for (const type of ["w", "j", "o"]) {
      start(); const source = place(type, 1), bank = place("0", 2), outlet = place("1", 4);
      connect(1, 4); const key = { w: "airPatrol", c: "clock", j: "gathering", o: "orientation" }[type];
      getTowerSkillState(source, key).sp = 100;
      scene.towerSkills.tryActivateManualSkill(source, { x: source.x, y: source.y, allReady: false });
      const state = getTowerSkillState(source, key);
      check(state.sp < 100 && source.routedSkills?.[type] > 0 && bank.projectileBank.shots.length === 1, `${type}: skill cost/routing failed`);
      if (type === "w") check(source.flyingUntil === 0, "Source flies despite routed flight");
      if (type === "o" || type === "j") check(!towerHasSkillBehavior(source, type), `${type}: source retained routed skill`);
      tick(); scene.towerSkills.update(0, scene.battleTime);
      check(getTowerSkillState(outlet, key).activeUntil > scene.battleTime && outlet.pipelineSkillContexts[type], `${type}: outlet skill failed`);
      const saved = snapshot(); start(); scene.applyBattleSave(restoreBattleSnapshot(scene, saved));
      scene.towerSkills.update(0, scene.battleTime);
      check(scene.towers.find(t => t.type === "1").pipelineSkillContexts[type], `${type}: active skill lost after restore`);
      scene.battleTime += 60000; scene.towerSkills.update(0, scene.battleTime);
      check(getTowerSkillState(scene.towers.find(t => t.type === "1"), key).activeUntil === 0, `${type}: skill did not expire`);
      assertions++;
    }

    start(); const healer = place("+", 4), nearby = place("B", 6), corner = place("B", 6, 5), far = place("B", 10);
    for (const tower of [healer, nearby, corner, far]) tower.hp -= 500;
    scene.numbers.runtime().heal(healer, 80);
    check(healer.hp === healer.maxHp - 420 && nearby.hp === nearby.maxHp - 420 && corner.hp === corner.maxHp - 500,
      "Healing outlet does not match small e's self-inclusive missing-corner range");
    const swap = place("&", 3); swap.topologyTarget = { lane: 3, column: 10 }; scene.updateLevelAuras();
    scene.numbers.runtime().heal(healer, 80);
    check(far.hp === far.maxHp - 420 && !healer.rangeBorder?.visible, "Healing ignores topology or displays an aura");
    assertions++;

    start(); const clearSource = place("T", 1), clearBank = place("0", 2), clearOutlet = place("1", 7);
    connect(1, 7);
    for (const tower of [clearSource, clearOutlet]) scene.projectiles.push(createTowerProjectile(scene, { type: "bolt", x: tower.x, y: tower.y,
      lane: 3, speed: 0, damage: 1, damageType: "physical", splashRadius: 0, angleDegrees: 0, maxX: Infinity }));
    removeTower(scene.unitLifecycleRuntime(), clearSource);
    check(!clearSource.inPlay && clearBank.projectileBank.shots.length === 1 && scene.projectiles.length === 2, "T cleared at source");
    tick(); check(scene.projectiles.length === 1 && scene.projectiles[0].x === clearSource.x, "T did not clear at outlet");
    assertions++;

    // Pending actions retain their frozen source panel even after the source is gone.
    start(); const delayed = place("i", 1), replayBank = place("0", 2); place("1", 4); connect(1, 4);
    scene.triggerShockTower(delayed); const replaySave = snapshot();
    const corrupt = JSON.parse(JSON.stringify(replaySave));
    const payload = corrupt.nodes.find(node => node.kind === "object" && node.data.baseDamage !== undefined);
    payload.data.level = -1;
    let rejected = false;
    try { validateSurvivalSave({ version: 1, levelId: "IF-1", wave: scene.wave, savedAt: 1, difficulty: scene.difficulty,
      unlimitedFirepower: false, selectedCards, graph: corrupt }); } catch { rejected = true; }
    check(rejected, "Invalid action snapshot accepted");
    const replay = delta => {
      start(); scene.applyBattleSave(restoreBattleSnapshot(scene, replaySave)); scene.battlePaused = false;
      while (scene.simulation.tick < 120) scene.update(0, delta);
      return scene.battleChecksum();
    };
    const hash = replay(1000 / 60); check(replay(1000 / 144) === hash, "Routed actions depend on rendering frame rate");
    return { assertions };
  });
  assert.deepEqual(errors, []); console.log("Pipeline action browser checks passed", result);
} finally { await browser.close(); }
