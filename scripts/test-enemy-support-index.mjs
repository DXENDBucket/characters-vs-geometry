import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader({ phaser: { default: {} }, "src/render/unitShapes.ts": {} });
const { enemySupportCandidates } = load("src/game/enemySupportIndex.ts");
const { addEnemyToField, removeEnemyFromField, removeEnemyAt, clearEnemyField, invalidateEnemyRoster } = load("src/game/enemyRoster.ts");
const { enemySupportBonuses, enemySupportSources } = load("src/game/enemySupport.ts");
const { enemyKindAtRank } = load("src/registry/enemies.ts");
const { CELL_WIDTH } = load("src/config.ts");
const enemy = (kind = "circle", x = 400) => ({ kind, x, y: 300, lane: 3, inPlay: true, statusEffects: [] });
const bonuses = (enemies, target) => enemySupportBonuses(enemies, target, { includeDefense: true, includeMovement: true });

test("support membership is reused without scanning unrelated enemies on every hit", () => {
  const target = enemy(), hex = enemy("hexagon"), heart = enemy("heart", 200);
  const field = [target, ...Array.from({ length: 800 }, () => enemy()), hex, heart];
  const candidates = enemySupportCandidates(field);
  assert.deepEqual(candidates, [hex, heart]);
  field[Symbol.iterator] = function* () { throw Error("Unexpected full-field scan"); };
  for (let i = 0; i < 100; i++) {
    assert.equal(enemySupportCandidates(field), candidates);
    assert.deepEqual(bonuses(field, target), { armor: 50, magicResistance: 0, speedMultiplier: 1.5 });
    assert.equal(enemySupportSources(field).hexagons[0], hex);
  }
});

test("moving, changing lanes, dying and flight take effect immediately within a volley", () => {
  const target = enemy(), hex = enemy("hexagon"), bulwark = enemy("hexSpellBulwark"), heart = enemy("heart", 200);
  const field = [target, hex, bulwark, heart];
  const check = expected => assert.deepEqual(bonuses(field, target), expected);
  check({ armor: 50, magicResistance: 40, speedMultiplier: 1.5 });
  hex.x += CELL_WIDTH * 2; bulwark.lane = 2; heart.x = 500;
  check({ armor: 0, magicResistance: 0, speedMultiplier: 1 });
  hex.x = target.x; bulwark.lane = 3; heart.x = 200;
  hex.highFlightUntil = 1000; bulwark.statusEffects.push({ name: "highFlying", expiresAt: 1000 }); heart.inPlay = false;
  check({ armor: 0, magicResistance: 0, speedMultiplier: 1 });
  delete hex.highFlightUntil; bulwark.statusEffects = []; heart.inPlay = true;
  check({ armor: 50, magicResistance: 40, speedMultiplier: 1.5 });
  hex.kind = enemyKindAtRank("hexagon", 40);
  bulwark.kind = enemyKindAtRank("hexSpellBulwark", 40);
  check({ armor: 50 + 39 * 30, magicResistance: 40 + 39 * 10, speedMultiplier: 1.5 });
});

test("roster replacement with the same length, family promotion and clear invalidate membership", () => {
  const hex = enemy("hexagon"), field = [hex];
  assert.deepEqual(enemySupportCandidates(field), [hex]);
  removeEnemyFromField(field, hex);
  const other = enemy(); addEnemyToField(field, other);
  assert.deepEqual(enemySupportCandidates(field), []);
  other.kind = "hexagon"; invalidateEnemyRoster(field);
  assert.deepEqual(enemySupportCandidates(field), [other]);
  removeEnemyFromField(field, hex);
  assert.deepEqual(field, [other], "removing a missing unit must not remove another one");
  clearEnemyField(field); addEnemyToField(field, enemy());
  assert.deepEqual(enemySupportCandidates(field), []);
});

test("parenthesis passengers retain support, inherit carrier eligibility and return in field order", () => {
  const host = enemy("parentheses"), hex = enemy("hexagon"), target = enemy();
  const field = [target, host, hex];
  assert.equal(bonuses(field, target).armor, 50);
  host.parenthesisCargo = [hex]; hex.parenthesisCarrier = host; hex.inPlay = false;
  removeEnemyAt(field, 2);
  assert.deepEqual(enemySupportCandidates(field), [hex]);
  assert.equal(bonuses(field, target).armor, 50);
  host.highFlightUntil = 1000;
  assert.equal(bonuses(field, target).armor, 0);
  delete host.highFlightUntil; host.inPlay = false;
  assert.equal(bonuses(field, target).armor, 0);
  host.parenthesisCargo = []; hex.parenthesisCarrier = undefined; hex.inPlay = true;
  addEnemyToField(field, hex); removeEnemyFromField(field, host);
  assert.equal(bonuses(field, target).armor, 50);
});

test("burrow/storage removal excludes cargo; release restores it without poisoning another battle", () => {
  const target = enemy(), carrier = enemy("burrowArrow"), hex = enemy("hexagon");
  const field = [target, carrier, hex], otherField = [enemy("hexSpellBulwark")];
  assert.equal(bonuses(field, target).armor, 50);
  const otherIndex = enemySupportCandidates(otherField);
  carrier.burrowCargo = [hex]; removeEnemyFromField(field, hex); hex.inPlay = false;
  assert.equal(bonuses(field, target).armor, 0);
  carrier.burrowCargo = []; hex.inPlay = true; addEnemyToField(field, hex);
  assert.equal(bonuses(field, target).armor, 50);
  assert.equal(enemySupportCandidates(otherField), otherIndex);
});

test("direct and lane-indexed queries agree across ranks, positions and mutations", () => {
  const field = Array.from({ length: 60 }, (_, i) => ({
    ...enemy(enemyKindAtRank(["hexagon", "heart", "circle", "hexSpellBulwark", "chargingHexagon"][i % 5], i + 1), 100 + i * 21),
    lane: i % 7, y: (i % 7) * 68
  }));
  for (let step = 0; step < 20; step++) {
    const source = field[step];
    source.x += 37; source.lane = (source.lane + 1) % 7; source.y = source.lane * 68;
    source.highFlightUntil = step % 2 ? undefined : 1000;
    for (const target of field) {
      assert.deepEqual(bonuses(field, target), enemySupportBonuses(field, target, {
        includeDefense: true, includeMovement: true, sources: enemySupportSources(field)
      }));
    }
  }
});
