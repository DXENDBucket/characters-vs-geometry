import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const result = await page.evaluate(async () => {
    const mod = path => import(performance.getEntriesByType("resource").map(e => e.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const config = await mod("/src/config.ts"), progress = await mod("/src/progress.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await mod("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await mod("/src/game/validateBattleSave.ts");
    const { collectBattleEntities } = await mod("/src/game/battleEntityGraph.ts");
    const { spawnEnemyAt } = await mod("/src/game/enemyRuntime.ts");
    const { applyEnemyPromotion } = await mod("/src/game/enemyBehaviors.ts");
    const { collectParenthesisPassengers } = await mod("/src/game/parenthesisEnemies.ts");
    const { upgradeTowerLevel } = await mod("/src/game/towers.ts");
    const { removeTower } = await mod("/src/game/unitLifecycle.ts");
    const { updateBossRuntime } = await mod("/src/game/bossRuntime.ts");
    const shots = await mod("/src/game/projectiles.ts");
    const game = window.__testGame, check = (value, message) => { if (!value) throw Error(message); };
    const clone = value => JSON.parse(JSON.stringify(value));
    game.loop.stop(); progress.unlockAllCards(); progress.completeAllLevels();
    const start = (levelId = "IF-BE-4") => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.sys.settings.key);
      game.scene.start("GameScene", { levelId, seed: 379, selectedCards: ["A", "T", "0", "=", "x", "()"] });
      const scene = game.scene.getScene("GameScene"); scene.chars = 1e6;
      return scene;
    };
    let scene = start();
    const place = (id, lane, column) => {
      scene.cardStatesById.get(id).readyAt = 0;
      scene.submitBattleCommand({ type: "selectCard", id });
      scene.submitBattleCommand({ type: "pointer", pointer: {
        x: config.BOARD_X + (column + .5) * config.CELL_WIDTH,
        y: config.BOARD_Y + (lane + .5) * config.CELL_HEIGHT, ctrl: false, shift: false, right: false
      } });
      const tower = scene.towers.find(t => t.type === id && t.lane === lane && t.column === column);
      check(tower?.entityId, `Placement did not identify ${id}`); return tower;
    };
    const source = place("T", 0, 1), bank = place("0", 0, 2), removed = place("A", 2, 1), x = place("x", 3, 1);
    const shell = place("()", 3, 1);
    check(shell.entityId !== x.entityId, "Shell shares identity with inner tower");
    const sourceId = source.entityId;
    upgradeTowerLevel(source); check(source.entityId === sourceId, "Upgrade replaced identity");
    scene.edgeControls.use({ type: "=", axis: "horizontal", lane: 0, column: 1 });
    check(scene.edgeTowers[0]?.entityId?.startsWith("edge:"), "Live edge was not identified");
    const spawn = (kind, lane, column) => {
      spawnEnemyAt(scene.combatRuntime(), { kind, lane, x: config.BOARD_X + (column + .5) * config.CELL_WIDTH,
        time: scene.battleTime, waveNumber: 0, waveWeight: 0, finalDamageReduction: 0 });
      return scene.enemies.at(-1);
    };
    const carrier = spawn("parentheses", 4, 8), passenger = spawn("triangle", 4, 8);
    const passengerId = passenger.entityId;
    applyEnemyPromotion(scene, passenger, "triangle2", scene.battleTime);
    collectParenthesisPassengers(carrier, scene.enemies, scene.battleTime);
    check(passenger.entityId === passengerId && passenger.parenthesisCarrier === carrier, "Promotion/boarding lost identity");
    const boss = scene.boss;
    boss.hp = boss.maxHp * .75; updateBossRuntime(scene.bossRuntime(), 0);
    scene.battleTime = 4000; updateBossRuntime(scene.bossRuntime(), 0);
    const copy = boss.octahedronCopies[0];
    check(copy?.entityId && copy.entityId !== boss.entityId, "Boss copy was not assigned its own ID");
    const hostile = shots.createEnemyProjectile(scene, passenger, scene.battleTime, 3);
    check(scene.numbers.captureAction(source, { kind: "reflection", projectile: hostile }), "Reflection not routed into live pipe");
    hostile.body.destroy();
    const reflectedId = hostile.entityId;
    check(bank.projectileBank.shots[0]?.action.event.projectile === hostile, "Pipe lost historical projectile");
    const homing = shots.createHomingTowerProjectile(scene, { x: x.x, y: x.y, lane: x.lane,
      speed: 200, acceleration: 10, maxSpeed: 600, damage: 100, damageType: "magic", sourceTower: x, targetBossPart: copy });
    const flat = shots.createTowerProjectile(scene, { type: "bolt", x: removed.x, y: removed.y, lane: removed.lane,
      speed: 100, damage: 400, damageType: "physical", splashRadius: 0, maxX: Infinity, angleDegrees: 0, sourceTower: removed });
    const mortar = shots.createMortarProjectile(scene, { owner: "tower", fromX: removed.x, fromY: removed.y,
      targetX: passenger.x, targetY: passenger.y, damage: 100, damageType: "magic", rangeX: 30, rangeY: 30,
      sourceTower: removed, targetEnemy: passenger });
    const ion = shots.createIonProjectile(scene, passenger, scene.battleTime);
    scene.projectiles.push(homing, flat); scene.mortarProjectiles.push(mortar); scene.enemyProjectiles.push(ion);
    scene.scheduleBattleAction(1000, { type: "volley", tower: removed, hitCount: 2 });
    const removedId = removed.entityId;
    removeTower(scene.unitLifecycleRuntime(), removed);
    check(!removed.inPlay, "Historical source not removed");
    const before = scene.battleState(), index = scene.world.indexEntities(before);
    const expectedIds = collectBattleEntities(before).map(entry => entry.entity.entityId).sort();
    for (const id of expectedIds) check(id && index.resolve({ kind: id.split(":")[0], id }), `Unresolvable live ID ${id}`);
    const graph = clone(captureBattleSnapshot(before));
    validateBattleSave(graph, scene.wave, "octahedron");
    const counter = scene.world.entityIds.snapshot().nextId, hash = scene.battleChecksum();
    const storage = JSON.stringify(localStorage), bodies = scene.children.list.length;
    const invalid = clone(graph);
    invalid.nodes.find(node => node.kind === "enemy").data.entityId = "enemy:999999";
    for (const attempt of [() => validateBattleSave(invalid, scene.wave, "octahedron"), () => restoreBattleSnapshot(scene, invalid)]) {
      let rejected = false; try { attempt(); } catch { rejected = true; }
      check(rejected, "Malformed identity accepted");
      check(scene.world.entityIds.snapshot().nextId === counter && scene.battleChecksum() === hash, "Failed restore changed live simulation");
      check(scene.children.list.length === bodies, "Failed restore leaked display bodies");
      check(JSON.stringify(localStorage) === storage, "Failed restore wrote discovery");
    }
    const next = shots.createEnemyProjectile(scene, passenger, scene.battleTime).entityId;
    scene = start();
    scene.applyBattleSave(restoreBattleSnapshot(scene, graph));
    const restored = scene.battleState(), restoredIndex = scene.world.indexEntities(restored);
    check(JSON.stringify(collectBattleEntities(restored).map(e => e.entity.entityId).sort()) === JSON.stringify(expectedIds), "Restore changed entity set");
    const restoredPassenger = restoredIndex.resolve({ kind: "enemy", id: passengerId });
    const restoredSource = restoredIndex.resolve({ kind: "tower", id: removedId });
    check(restoredPassenger.parenthesisCarrier.parenthesisCargo.includes(restoredPassenger), "Passenger relation not shared");
    check(restoredSource === scene.projectiles[1].sourceTower && !restoredSource.inPlay, "Removed source reference duplicated");
    check(scene.projectiles[0].targetBossPart === scene.boss.octahedronCopies[0], "Homing target changed body");
    const payload = scene.towers.find(t => t.type === "0").projectileBank.shots[0];
    check(payload.action.event.projectile === restoredIndex.resolve({ kind: "enemyProjectile", id: reflectedId }), "Stored reflection ID missing");
    check(!payload.action.event.projectile.body.scene, "Historical projectile was rendered");
    check(shots.createEnemyProjectile(scene, restoredPassenger, scene.battleTime).entityId === next, "Counter continuation changed next ID");
    const legacy = clone(graph);
    for (const node of legacy.nodes) { delete node.data.entityId; delete node.data.entityIds; }
    scene = start(); scene.applyBattleSave(restoreBattleSnapshot(scene, legacy));
    const migrated = clone(captureBattleSnapshot(scene.battleState()));
    validateBattleSave(migrated, scene.wave, "octahedron");
    check(scene.world.indexEntities(scene.battleState()).size === expectedIds.length, "Legacy adoption missed references");
    const legacyIds = collectBattleEntities(scene.battleState()).map(e => e.entity.entityId).sort();
    scene = start(); scene.applyBattleSave(restoreBattleSnapshot(scene, legacy));
    check(JSON.stringify(collectBattleEntities(scene.battleState()).map(e => e.entity.entityId).sort()) === JSON.stringify(legacyIds), "Legacy assignment not deterministic");
    scene = start("AE-10");
    scene.boss.delSweep = { phase: "complete" };
    scene.boss.hp = scene.boss.maxHp * .5;
    updateBossRuntime(scene.bossRuntime(), 0); scene.battleTime = 3000; updateBossRuntime(scene.bossRuntime(), 0);
    const echoes = scene.boss.delLaneSweep.parts;
    check(echoes.length === 2 && echoes.every(e => e.entityId?.startsWith("boss:")), "DEL echoes unregistered");
    check(new Set([scene.boss.entityId, ...echoes.map(e => e.entityId)]).size === 3, "DEL echoes share identities");
    check(scene.world.indexEntities(scene.battleState()).size === 3, "DEL subparts missing from index");
    for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
    return { entities: expectedIds.length, nextId: next, legacy: true, historicalReferences: true, delEchoes: 2 };
  });
  assert.deepEqual(errors, []);
  console.log("Live entity identity/restore checks passed", result);
} finally { await browser.close(); }
