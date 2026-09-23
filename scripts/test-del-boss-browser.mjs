import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
fs.mkdirSync("logs", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/src/main.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + "\nwindow.__testGame=game;" });
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__testGame?.scene.getScenes(true).length);
  const result = await page.evaluate(async () => {
    const moduleFor = path => import(performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const config = await moduleFor("/src/config.ts");
    const progress = await moduleFor("/src/progress.ts");
    const { updateCubeBossMotion } = await moduleFor("/src/bosses/cubeBoss.ts");
    const { updateBossRuntime } = await moduleFor("/src/game/bossRuntime.ts");
    const { removeTower } = await moduleFor("/src/game/unitLifecycle.ts");
    const { drawTimedCellSeals } = await moduleFor("/src/render/timedCellSeals.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await moduleFor("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await moduleFor("/src/game/validateBattleSave.ts");
    const game = window.__testGame;
    game.loop.stop(); progress.completeAllLevels(); progress.unlockAllCards();
    for (const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
    game.scene.start("GameScene", { levelId: "AE-10", seed: 512, difficulty: 1, selectedCards: ["A", "B", "O", "()"] });
    const scene = game.scene.getScene("GameScene"), boss = scene.boss;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    check(boss?.kind === "del", "DEL did not spawn");
    check(boss.hp === 120000 && boss.baseStats.armor === 150 && boss.baseStats.magicResistance === 20, "Wrong panel");
    check(boss.hitboxWidth === config.CELL_WIDTH * 3 && boss.hitboxHeight === config.CELL_HEIGHT * 3, "Wrong hitbox");
    check(boss.hasSkills && boss.skills.deleteStack.sp === 40 && !boss.labelText.visible, "Skill or label mismatch");
    const position = [boss.x, boss.y];
    updateCubeBossMotion(boss, 60, 1, 60000);
    check(boss.x === position[0] && boss.y === position[1], "Stationary boss moved");
    const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateBattleSave(graph, scene.wave, "del");
    const restored = restoreBattleSnapshot(scene, graph);
    check(restored.boss.kind === "del" && restored.boss.hp === boss.hp, "Snapshot lost DEL");
    restored.boss.body.destroy();
    scene.combatRuntime().damageBoss(1000, "physical");
    check(boss.hp < 120000 && boss.hp > 119000, "DEL cannot receive damage");
    updateBossRuntime(scene.bossRuntime(), 1);
    check(boss.skills.deleteStack.sp === 40 && !scene.timedCellSeals.entries.length, "No-target cast spent SP");
    scene.chars = 50000;
    const place = (id, lane, column) => {
      scene.cardStatesById.get(id).readyAt = 0;
      check(scene.deployment.useCard(scene.getDefinition(id), lane, column) === "deployed", `Cannot place ${id}`);
      return scene.towers.find(t => t.type === id && t.lane === lane && t.column === column);
    };
    const older = place("A", 1, 2); older.level = 50;
    place("B", 3, 4);
    updateBossRuntime(scene.bossRuntime(), 0);
    check(boss.deleteStackPending && boss.skills.deleteStack.sp === 0 && scene.timedCellSeals.entries.length === 0,
      "Cue locked a target too early or did not spend SP");
    const cueGraph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateBattleSave(cueGraph, scene.wave, "del");
    const cueState = restoreBattleSnapshot(scene, cueGraph);
    check(cueState.boss.deleteStackPending && cueState.boss.skills.deleteStack.activeUntil === 1000, "Pending cue lost in save");
    for (const tower of cueState.towers) tower.body.destroy();
    cueState.boss.body.destroy();
    const newest = place("B", 3, 5), shell = place("()", 3, 5);
    scene.battleTime = 999; updateBossRuntime(scene.bossRuntime(), 0);
    check(!scene.timedCellSeals.entries.length, "Target locked before cue ended");
    scene.battleTime = 1000; updateBossRuntime(scene.bossRuntime(), 0);
    const seal = scene.timedCellSeals.entries[0];
    check(seal.lane === 3 && seal.column === 5 && seal.warnedAt === 1000 && seal.sealsAt === 6000 &&
      seal.expiresAt === 96000 && boss.skills.deleteStack.sp === 0, "Wrong target, SP cost or timing");
    drawTimedCellSeals(scene.timedCellSealGraphics, scene.timedCellSeals.entries, 999, scene.timedCellWarningGraphics);
    check(scene.timedCellWarningGraphics.commandBuffer.length === 0, "Cell warning appeared during initial cue");
    drawTimedCellSeals(scene.timedCellSealGraphics, scene.timedCellSeals.entries, 1000, scene.timedCellWarningGraphics);
    check(scene.timedCellWarningGraphics.commandBuffer.length > 0, "Cell warning missing after cue");
    check(scene.shifter.executeMove({ type: "moveTowers", sources: [newest, shell].map(t => ({ towerId: t.id, lane: t.lane, column: t.column })),
      destination: { lane: 3, column: 6 } }) === "moved", "Cannot escape warning with shifter");
    const replacement = place("O", 3, 5), replacementShell = place("()", 3, 5);
    scene.battleTime = 2000;
    const warningGraph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateBattleSave(warningGraph, scene.wave, "del");
    const warningState = restoreBattleSnapshot(scene, warningGraph);
    check(warningState.timedCellSeals[0].sealsAt === 6000, "Warning lost in snapshot");
    for (const tower of warningState.towers) tower.body.destroy();
    warningState.boss.body.destroy();
    scene.battleTime = 5999 - 1000 / 60; scene.stepBattle();
    check(replacement.inPlay && scene.cellIsDeployable(3, 5), "Sealed before 6s");
    scene.battleTime = 6000 - 1000 / 60; scene.stepBattle();
    check(!replacement.inPlay && !replacementShell.inPlay && newest.inPlay && shell.inPlay && older.inPlay,
      "Seal followed moved target or failed to erase both layers");
    check(!scene.cellIsDeployable(3, 5), "Active seal allows placement");
    scene.cardStatesById.get("B").readyAt = 0;
    check(scene.deployment.useCard(scene.getDefinition("B"), 3, 5) !== "deployed", "Deployment bypassed seal");
    scene.shifter.reset();
    check(scene.shifter.executeMove({ type: "moveTowers", sources: [{ towerId: newest.id, lane: 3, column: 6 }],
      destination: { lane: 3, column: 5 } }) === "invalid", "Shifter bypassed seal");
    scene.sealCell(0, 0);
    scene.timedCellSeals.warn(0, 0, 0, 5000, 90000, 1000);
    scene.battleTime = 95999 - 1000 / 60; scene.stepBattle();
    check(!scene.cellIsDeployable(3, 5), "Seal expired before 90s");
    scene.battleTime = 96000 - 1000 / 60; scene.stepBattle();
    check(scene.cellIsDeployable(3, 5) && !scene.cellIsDeployable(0, 0), "Expiry removed permanent seal or failed to restore cell");
    boss.skills.deleteStack.sp = 39; boss.skills.deleteStack.spBuffer = 0;
    updateBossRuntime(scene.bossRuntime(), 1);
    check(boss.skills.deleteStack.sp === 0 && boss.deleteStackPending && !scene.timedCellSeals.entries.length,
      "SP did not recharge and recast");
    for (const tower of [...scene.towers]) removeTower(scene.unitLifecycleRuntime(), tower);
    scene.battleTime = 97000; updateBossRuntime(scene.bossRuntime(), 0);
    check(!boss.deleteStackPending && boss.skills.deleteStack.sp === 0 && !scene.timedCellSeals.entries.length,
      "No-target cue did not cancel or refunded SP");
    place("B", 3, 5);
    boss.skills.deleteStack.sp = 40;
    updateBossRuntime(scene.bossRuntime(), 0);
    scene.battleTime = 98000; updateBossRuntime(scene.bossRuntime(), 0);
    const visualSeal = scene.timedCellSeals.entries[0];
    window.__delSkillFrame = lead => {
      const time = 97000 + lead;
      updateCubeBossMotion(boss, 0, 1, time);
      drawTimedCellSeals(scene.timedCellSealGraphics, [visualSeal], time, scene.timedCellWarningGraphics);
    };
    scene.battlePaused = true;
    window.__drawDelAt = time => updateCubeBossMotion(boss, 0, 1, 200000 + time);
    window.__drawDelAt(500);
    game.loop.start(game.step.bind(game));
    return { hp: boss.maxHp, hitbox: [boss.hitboxWidth, boss.hitboxHeight] };
  });
  for (const [name, width, height] of [["desktop", 1440, 900], ["small", 800, 600]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    const images = [];
    for (const time of [500, 3300]) {
      await page.evaluate(time => window.__drawDelAt(time), time);
      await page.waitForTimeout(100);
      await page.screenshot({ path: `logs/del-${name}-${time}.png` });
      const clip = await page.evaluate(() => {
        const game = window.__testGame, boss = game.scene.getScene("GameScene").boss;
        const bounds = game.canvas.getBoundingClientRect(), sx = bounds.width / game.scale.gameSize.width;
        const sy = bounds.height / game.scale.gameSize.height;
        return { x: bounds.x + (boss.x - boss.hitboxWidth / 2) * sx,
          y: bounds.y + (boss.y - boss.hitboxHeight / 2) * sy,
          width: boss.hitboxWidth * sx, height: boss.hitboxHeight * sy };
      });
      const image = await page.screenshot({ clip });
      const bright = await page.evaluate(async base64 => {
        const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, image.width, image.height).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] > 130 && data[i + 1] > 130 && data[i + 2] > 130) count++;
        return count;
      }, image.toString("base64"));
      assert.ok(bright > 100, `${name}: empty DEL rendering`);
      images.push(image);
    }
    assert.notDeepEqual(images[0], images[1], `${name}: animation is static`);
  }
  for (const [phase, time] of [["cue", 400], ["warning", 1800]]) {
    await page.evaluate(time => window.__delSkillFrame(time), time);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `logs/del-stack-${phase}.png` });
  }
  const sweepResult = await page.evaluate(async () => {
    const moduleFor = path => import(performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const config = await moduleFor("/src/config.ts");
    const { updateBossRuntime } = await moduleFor("/src/game/bossRuntime.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await moduleFor("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await moduleFor("/src/game/validateBattleSave.ts");
    const game = window.__testGame; game.loop.stop();
    const scene = game.scene.getScene("GameScene"), boss = scene.boss;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const startedAt = scene.battleTime, homeX = boss.x;
    const { drawTimedCellSeals } = await moduleFor("/src/render/timedCellSeals.ts");
    check(scene.timedCellSealGraphics.depth === 1 && scene.timedCellWarningGraphics.depth > boss.body.depth,
      "Seals and warnings do not use separate layers");
    check([...scene.sealedCellMarks.values()].every(mark => mark.depth === 1), "Permanent seal is not at the bottom");
    scene.combatRuntime().damageBoss(boss.hp - 90001, "true");
    check(!boss.delSweep, "Sweep triggered above 75%");
    scene.combatRuntime().damageBoss(1, "true");
    check(boss.hp === 90000 && boss.invincibleUntil === Infinity && boss.delSweep.phase === "warning", "Threshold did not shield immediately");
    check(boss.body.list.some(child => child.name === "del-sweep-warning"), "Three-lane warning missing");
    const children = scene.battlefield.worldLayer.list.length;
    scene.combatRuntime().damageBoss(1000000, "true");
    check(boss.hp === 90000 && scene.battlefield.worldLayer.list.length === children, "Invulnerability failed or spawned conventional invulnerability VFX");
    const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
    validateBattleSave(graph, scene.wave, "del");
    const restored = restoreBattleSnapshot(scene, graph);
    check(restored.boss.invincibleUntil === Infinity && restored.boss.delSweep.phase === "warning" &&
      restored.boss.body.list.some(child => child.name === "del-sweep-warning"), "Sweep warning did not restore");
    for (const tower of restored.towers) tower.body.destroy();
    restored.boss.body.destroy();
    window.__sweepWarningShot = () => {
      scene.battleTime = startedAt + 160;
      updateBossRuntime(scene.bossRuntime(), 0);
    };
    window.__finishSweepCheck = () => {
      scene.battleTime = startedAt + 2999; updateBossRuntime(scene.bossRuntime(), 0);
      check(boss.x === homeX, "Sweep moved during warning");
      const expected = 3 * config.COLUMNS;
      let wrapped = false;
      for (let elapsed = 3000; elapsed < 40000; elapsed += 20) {
        scene.battleTime = startedAt + elapsed;
        scene.timedCellSeals.update(scene.battleTime, (lane, column) => scene.eraseTowersInCell(lane, column));
        updateBossRuntime(scene.bossRuntime(), .02);
        if (boss.delSweep.phase === "returning") wrapped = true;
        check(!scene.gameOver && scene.baseIntegrity === 6, "Sweep breached the base");
        if (boss.delSweep.phase === "complete") break;
      }
      check(wrapped && boss.delSweep.phase === "complete" && boss.x === homeX, "Sweep did not wrap and return");
      check(boss.invincibleUntil !== Infinity && boss.finalStats.speed === 0, "Return did not remove shield or stop");
      const seals = scene.timedCellSeals.entries.filter(s => s.active);
      check(new Set(seals.map(s => `${s.lane}:${s.column}`)).size === expected, "Wrong number of swept cells");
      check(seals.every(s => s.lane >= 2 && s.lane <= 4), "Sweep hit outside the middle three lanes");
      check(!scene.towers.some(t => t.lane === 3 && t.column === 5), "Swept tower survived erasure");
      check(!boss.body.list.some(child => child.name === "del-sweep-warning"), "Warning leaked after sweep");
      scene.combatRuntime().damageBoss(1000, "true");
      check(boss.hp === 89000 && boss.delSweep.phase === "complete", "Return retained invulnerability or retriggered");
      drawTimedCellSeals(scene.timedCellSealGraphics, scene.timedCellSeals.entries, scene.battleTime, scene.timedCellWarningGraphics);
      return { cells: expected, phase: boss.delSweep.phase };
    };
    window.__sweepWarningShot();
    game.loop.start(game.step.bind(game));
    return { hp: boss.hp };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "logs/del-sweep-warning.png" });
  const swept = await page.evaluate(() => window.__finishSweepCheck());
  await page.waitForTimeout(100);
  await page.screenshot({ path: "logs/del-sweep-return.png" });
  await page.evaluate(async () => {
    const moduleFor = path => import(performance.getEntriesByType("resource").map(r => r.name)
      .find(url => new URL(url).pathname === path) ?? path);
    const c = await moduleFor("/src/config.ts");
    const { updateBossRuntime } = await moduleFor("/src/game/bossRuntime.ts");
    const { bossParts, bossPartAtPoint, bossPartInRadius, bossPartInRect } = await moduleFor("/src/game/targeting.ts");
    const { createTowerProjectile } = await moduleFor("/src/game/projectiles.ts");
    const { updateTowerProjectiles } = await moduleFor("/src/game/projectileRuntime.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot } = await moduleFor("/src/game/battleSnapshot.ts");
    const { validateBattleSave } = await moduleFor("/src/game/validateBattleSave.ts");
    const game = window.__testGame; game.loop.stop();
    const scene = game.scene.getScene("GameScene"), boss = scene.boss;
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const home = [boss.x,boss.y], startedAt = scene.battleTime;
    scene.combatRuntime().damageBoss(boss.hp-60001, "true");
    check(!boss.delLaneSweep, "Half sweep triggered early");
    scene.combatRuntime().damageBoss(1,"true");
    check(boss.delLaneSweep?.phase === "warning" && boss.invincibleUntil === Infinity, "Half threshold not immediately shielded");
    const roundTrip = () => {
      const graph = JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
      validateBattleSave(graph, scene.wave, "del");
      const restored = restoreBattleSnapshot(scene, graph);
      check(restored.boss.delLaneSweep.phase === boss.delLaneSweep.phase, "Lost half phase in save");
      check(bossParts(restored.boss).length === bossParts(boss).length, "Lost echoes in save");
      for (const part of bossParts(restored.boss)) {
        check(!!part.body.scene, "Restore destroyed active echo");
        if (part.delEcho) check(part.hitboxWidth === 78 && part.hitboxHeight === 78, "Restore lost echo size");
        part.body.destroy();
      }
      for (const tower of restored.towers) tower.body.destroy();
      for (const enemy of restored.enemies) enemy.body.destroy();
    };
    window.__halfFrame = step => {
      if (step === "warning") {
        scene.battleTime = startedAt+160; updateBossRuntime(scene.bossRuntime(),0); roundTrip();
      } else if (step === "sweep") {
        scene.battleTime = startedAt+2999; updateBossRuntime(scene.bossRuntime(),0);
        check(bossParts(boss).length === 1, "Echo spawned during warning");
        scene.battleTime = startedAt+4000; updateBossRuntime(scene.bossRuntime(),0);
        check(bossParts(boss).length === 3 && boss.x === home[0] && boss.y === home[1], "Wrong echo count or main Boss moved");
        for (const part of boss.delLaneSweep.parts) {
          check(part.hitboxWidth === 78 && part.hitboxHeight === 78 && part.invincibleUntil === Infinity, "Wrong echo hitbox or invulnerability");
          check(bossPartAtPoint(boss,part.x,part.y) === part && bossPartInRadius(boss,part.x,part.y,1) === part &&
            bossPartInRect(boss,part.x-1,part.y-1,2,2) === part, "Echo omitted from Boss target queries");
          const shot = createTowerProjectile(scene,{type:"bolt",x:part.x,y:part.y,lane:Math.floor((part.y-c.BOARD_Y)/78),
            speed:0,damage:999999,damageType:"true",splashRadius:0,angleDegrees:0,maxX:Infinity});
          scene.projectiles.push(shot); updateTowerProjectiles(scene.projectileRuntime(),0);
          check(!scene.projectiles.includes(shot) && boss.hp === 60000, "Echo failed to block shot invulnerably");
        }
        roundTrip();
      } else {
        const exitAt = startedAt+3000+(c.BOARD_WIDTH+c.CELL_WIDTH+33)/600*1000;
        scene.battleTime = exitAt+.01; updateBossRuntime(scene.bossRuntime(),0);
        check(boss.delLaneSweep.phase === "summoning" && bossParts(boss).length === 1 && boss.invincibleUntil !== Infinity,
          "Echoes failed to leave or shield lingered");
        const rams = () => scene.enemies.filter(e => e.kind === "triangleRam5");
        check(rams().length === 2, "First pair missing"); roundTrip();
        scene.battleTime = exitAt+1000; updateBossRuntime(scene.bossRuntime(),0);
        check(rams().length === 4, "Second pair missing");
        scene.battleTime = exitAt+2000; updateBossRuntime(scene.bossRuntime(),0);
        check(rams().length === 6 && [1,5].every(lane => rams().filter(e => e.lane === lane).length === 3), "Wrong rank-V summon lanes/count");
        check(boss.delLaneSweep.sealedCells.length === 26 && !scene.gameOver && scene.baseIntegrity === 6,
          "Half sweep skipped cells or breached base");
        check(boss.x === home[0] && boss.y === home[1], "Main moved during half sweep");
      }
    };
    game.loop.start(game.step.bind(game));
  });
  for (const step of ["warning", "sweep", "summon"]) {
    await page.evaluate(step => window.__halfFrame(step), step);
    await page.waitForTimeout(100);
    await page.screenshot({path:`logs/del-half-${step}.png`});
  }
  assert.deepEqual(errors, []);
  console.log("DEL half-health sweep, projectile collision, summons and snapshot checks passed");
  console.log("DEL sweep checks passed", sweepResult, swept);
  console.log("DEL browser checks passed", result);
} finally {
  await browser.close();
}
