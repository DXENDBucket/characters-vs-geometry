import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length+3);
const { chromium } = await import(option("playwright") ? pathToFileURL(option("playwright")).href : "playwright");
const browser = await chromium.launch({ executablePath: option("browser"), headless: true });
fs.mkdirSync("logs",{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/src/main.ts*",async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+"\nwindow.__testGame=game;"});
  });
  await page.goto(option("url") ?? "http://127.0.0.1:5173");
  await page.waitForFunction(()=>window.__testGame?.scene.getScenes(true).length);
  await page.evaluate(async()=>{
    const moduleFor=path=>import(performance.getEntriesByType("resource").map(r=>r.name)
      .find(url=>new URL(url).pathname===path)??path);
    const progress=await moduleFor("/src/progress.ts"); progress.completeAllLevels(); progress.unlockAllCards();
    const { updateBossRuntime }=await moduleFor("/src/game/bossRuntime.ts");
    const { createTower }=await moduleFor("/src/game/towers.ts");
    const { createEnemy }=await moduleFor("/src/game/enemyFactory.ts");
    const { getBlockingTower, latestPlacedTower }=await moduleFor("/src/game/targeting.ts");
    const { syncTowerOccupancy }=await moduleFor("/src/game/towerOccupancy.ts");
    const { drawNullifiedTowers }=await moduleFor("/src/render/nullifiedTowers.ts");
    const { captureBattleSnapshot, restoreBattleSnapshot }=await moduleFor("/src/game/battleSnapshot.ts");
    const { validateBattleSave }=await moduleFor("/src/game/validateBattleSave.ts");
    const { identifyBattleEntity }=await moduleFor("/src/game/battleEntityIds.ts");
    const { removeTower }=await moduleFor("/src/game/unitLifecycle.ts");
    const game=window.__testGame; game.loop.stop();
    for(const active of game.scene.getScenes(true)) game.scene.stop(active.sys.settings.key);
    game.scene.start("GameScene",{levelId:"AE-10",seed:655,difficulty:1,selectedCards:["A","B","()","m","u","q","e","s","c","="]});
    const scene=game.scene.getScene("GameScene"), boss=scene.boss;
    scene.battlePaused=true; scene.chars=100000; scene.autoUpgradeEnabled=false;
    const check=(ok,message)=>{if(!ok)throw Error(message);};
    const place=(id,lane,column)=>{
      const tower=createTower(scene,scene.getDefinition(id),lane,column,scene.battleTime,++scene.towerOrder);
      scene.towers.push(tower); return tower;
    };
    const a=place("A",3,3), guard=place("()",3,3), m=place("m",3,4), b=place("A",3,5);
    const u=place("u",2,3), e=place("e",2,4), q=place("q",5,3), s=place("s",0,1);
    a.mirrorGroupId=b.mirrorGroupId=99;
    syncTowerOccupancy(scene.towers,scene.occupied); scene.updateLevelAuras();
    const edge={type:"=",axis:"horizontal",lane:3,column:3,mode:"=",level:1,autoUpgrade:false};
    identifyBattleEntity(scene,"edge",edge);
    scene.edgeTowers.push(edge); scene.numbers.sync();
    const enemy=createEnemy(scene,{kind:"circle",lane:3,x:a.x+25,time:0,waveNumber:0,waveWeight:0,finalDamageReduction:0});
    scene.enemies.push(enemy);
    check(getBlockingTower(scene.towers,enemy),"Test enemy not initially blocked");
    const cargo=createEnemy(scene,{kind:"triangle",lane:5,x:q.x,time:0,waveNumber:0,waveWeight:0,finalDamageReduction:0});
    cargo.inPlay=false; cargo.body.setVisible(false); scene.storage.restore([{enemy:cargo,carrier:q,releaseAt:7000}]);
    scene.actionQueue.schedule(0,7000,{type:"volley",tower:a,hitCount:1});
    boss.delSweep={phase:"complete",startedAt:0,homeX:boss.x,homeY:boss.y,previousInvincibleUntil:0,sealedCells:[]};
    boss.delLaneSweep={stage:"quarter",phase:"complete",startedAt:0,previousInvincibleUntil:0,sealedCells:[],parts:[],summons:1};
    boss.skills.deleteStack.sp=0;
    const skill=boss.skills.deleteFormat;
    check(skill.sp===0&&skill.maxSp===75&&skill.cost===75,"Wrong Format skill panel");
    boss.hp=boss.maxHp*.5; updateBossRuntime(scene.bossRuntime(),10);
    check(skill.sp===0,"Format charged at exactly 50% HP");
    boss.hp--; updateBossRuntime(scene.bossRuntime(),74);
    check(skill.sp===74&&!boss.deleteFormatReadyAt,"Format charged at wrong rate");
    updateBossRuntime(scene.bossRuntime(),1);
    check(skill.sp===0&&boss.deleteFormatReadyAt===3000&&skill.activeUntil===13000,"Format did not cast for 75 SP");
    const original=scene.towers.slice(), hp=original.map(t=>t.hp), levels=original.map(t=>t.level), pool=a.healthPool;
    check(pool&&pool===u.healthPool,"Health network not prepared");
    const roundTrip=()=>{
      const graph=JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
      validateBattleSave(graph,scene.wave,"del");
      const restored=restoreBattleSnapshot(scene,graph);
      if(scene.nullification.snapshot()) {
        check(restored.nullifiedTowers?.towers.length===original.length,"NUL towers lost from snapshot");
        check(restored.nullifiedTowers.towers.every(t=>!t.inPlay&&!t.body.visible&&t.body.scene),"NUL visuals destroyed or visible after restore");
      } else check(restored.boss.deleteFormatReadyAt===boss.deleteFormatReadyAt,"Format warning lost from snapshot");
      for(const t of [...restored.towers,...(restored.nullifiedTowers?.towers??[])])t.body.destroy();
      for(const en of [...restored.enemies,...restored.storage.map(entry=>entry.enemy)])en.body.destroy();
      restored.boss.body.destroy();
    };
    window.__formatWarning=time=>{scene.battleTime=time;updateBossRuntime(scene.bossRuntime(),0);roundTrip();};
    window.__formatActivate=()=>{
      scene.battleTime=2999;updateBossRuntime(scene.bossRuntime(),0);
      check(scene.towers.length===original.length&&!scene.nullification.snapshot(),"NUL started before 3s");
      scene.battleTime=3000;updateBossRuntime(scene.bossRuntime(),0);
      check(scene.towers.length===0&&scene.occupied.size===0,"Suspended towers stayed active");
      check(original.every(t=>!t.inPlay&&!t.body.visible&&t.nullified),"Original tower did not disappear");
      check(scene.edgeTowers[0]===edge&&edge.level===1,"Edge connector was nullified");
      scene.edgeControls.cycle(edge);check(edge.mode===">","Edge operations blocked");
      check(!getBlockingTower(scene.towers,enemy)&&!latestPlacedTower(scene.towers),"NUL remained a target or blocker");
      for(const tower of original) {
        scene.bossRuntime().damageTower(tower,999999,"true");
        removeTower(scene.unitLifecycleRuntime(),tower);
      }
      check(original.every((t,i)=>t.hp===hp[i]&&t.level===levels[i]&&t.body.scene),"NUL was damaged or erased");
      for(const id of ["A","()"]){
        scene.cardStatesById.get(id).readyAt=0;
        check(scene.deployment.useCard(scene.getDefinition(id),3,3)==="occupied","Deployment or upgrade bypassed NUL cell");
      }
      check(scene.shifter.executeMove({type:"moveTowers",sources:[{towerId:a.id,lane:3,column:3}],destination:{lane:1,column:7}})==="invalid","Shifter moved NUL");
      scene.cardStatesById.get("B").readyAt=0;
      check(scene.deployment.useCard(scene.getDefinition("B"),1,7)==="deployed","Empty-cell placement was blocked");
      check(scene.towers.length===1&&scene.towers[0].inPlay,"New tower was incorrectly nullified");
      scene.battleTime=8000; scene.storage.update();
      check(scene.storage.count===1&&scene.storage.snapshot()[0].releaseAt===17000,"Stored enemy escaped NUL");
      check(scene.actionQueue.snapshot().some(entry=>entry.action.tower===a&&entry.at===17000),"Queued action was not paused");
      check(a.healthPool===pool&&a.mirrorGroupId===99&&b.mirrorGroupId===99,"Suspension broke networks");
      scene.nullification.update(12999);check(!a.inPlay,"NUL ended before 10s");
      drawNullifiedTowers(scene.nullifiedTowerGraphics,scene.nullification.snapshot(),scene.battleTime); roundTrip();
    };
    window.__formatRecover=()=>{
      scene.battleTime=13000;scene.nullification.update(scene.battleTime);
      check(!scene.nullification.snapshot()&&scene.towers.length===original.length+1,"Original towers not restored");
      check(original.every((t,i)=>t.inPlay&&t.body.visible&&!t.nullified&&t.hp===hp[i]&&t.level===levels[i]),"Recovery changed tower state");
      check(a.parenthesisGuard===guard&&a.mirrorGroupId===99&&a.healthPool===u.healthPool,"Recovered shell/mirror/health links wrong");
      check(getBlockingTower(scene.towers,enemy)&&scene.cellIsDeployable(3,3),"Restored tower cannot block or upgrade");
      scene.storage.update();check(scene.storage.count===1,"Cargo delay lost on recovery");
      scene.battleTime=17000;scene.storage.update();check(scene.storage.count===0&&cargo.inPlay,"Cargo did not resume");
      roundTrip();
    };
    window.__formatResume=()=>{
      for(const en of scene.enemies)en.body.destroy();scene.enemies.length=0;
      scene.nullification.start(scene.battleTime,10000);
      const graph=JSON.parse(JSON.stringify(captureBattleSnapshot(scene.battleState())));
      validateBattleSave(graph,scene.wave,"del");
      const restored=restoreBattleSnapshot(scene,graph), expectedTowers=restored.nullifiedTowers.towers;
      for(const t of scene.nullification.snapshot().towers)t.body.destroy();
      scene.boss.body.destroy();
      scene.applyBattleSave(restored);
      check(scene.towers.length===0&&!scene.cellIsDeployable(3,3),"Loaded NUL cells became usable");
      for(let tick=0;tick<599;tick++)scene.stepBattle();
      check(scene.nullification.snapshot()&&scene.towers.length===0,"Loaded suspension ended early");
      for(let tick=0;tick<2;tick++)scene.stepBattle();
      check(!scene.nullification.snapshot()&&expectedTowers.every(t=>scene.towers.includes(t)&&t.inPlay&&t.body.scene),
        "Loaded NUL state failed to resume under fixed-step simulation");
    };
    game.loop.start(game.step.bind(game));
  });
  for(const time of [1280,1440]){
    await page.evaluate(time=>window.__formatWarning(time),time);await page.waitForTimeout(80);
    await page.screenshot({path:`logs/del-format-warning-${time}.png`});
  }
  await page.evaluate(()=>window.__formatActivate());await page.waitForTimeout(100);
  await page.screenshot({path:"logs/del-format-nul.png"});
  await page.setViewportSize({width:800,height:600});await page.waitForTimeout(100);
  await page.screenshot({path:"logs/del-format-nul-small.png"});
  await page.evaluate(()=>window.__formatRecover());await page.waitForTimeout(100);
  await page.screenshot({path:"logs/del-format-restored.png"});
  await page.evaluate(()=>window.__formatResume());
  assert.deepEqual(errors,[]);
  console.log("DEL Format SP, warning, NUL targeting/operations, edge exemption, networks, timers and snapshots passed");
} finally {await browser.close();}
