import assert from "node:assert/strict";
import { test } from "node:test";
import { createTypeScriptLoader } from "./helpers/load-typescript.mjs";

const load = createTypeScriptLoader();
const geometry = load("src/game/unitGeometry.ts");
const { BOSS_HITBOX_WIDTH, BOSS_HITBOX_HEIGHT, BOARD_X, BOARD_Y, CELL_WIDTH, CELL_HEIGHT } = load("src/config.ts");
const boss = (extra = {}) => ({ x: 700, y: 400, hitboxWidth: 120, hitboxHeight: 80, ...extra });

test("bounds use physical coordinates and explicit dimensions, including zero and legacy defaults", () => {
  assert.deepEqual(geometry.bossBounds(boss()), { left: 640, right: 760, top: 360, bottom: 440 });
  assert.deepEqual(geometry.bossBounds({ x: 0, y: 0 }), {
    left: -BOSS_HITBOX_WIDTH / 2, right: BOSS_HITBOX_WIDTH / 2,
    top: -BOSS_HITBOX_HEIGHT / 2, bottom: BOSS_HITBOX_HEIGHT / 2
  });
  assert.deepEqual(geometry.bossBounds(boss({ hitboxWidth: 0, hitboxHeight: 0 })), {
    left: 700, right: 700, top: 400, bottom: 400
  });
  const tower = { x: 300, y: 200, lane: 6, column: 12, topologyTarget: { lane: 0, column: 0 } };
  assert.deepEqual(geometry.towerBounds(tower), {
    left: 300 - CELL_WIDTH / 2, right: 300 + CELL_WIDTH / 2,
    top: 200 - CELL_HEIGHT / 2, bottom: 200 + CELL_HEIGHT / 2
  });
});

test("point and rectangle checks include touching edges and corners but exclude points just outside", () => {
  const part = boss(), b = geometry.bossBounds(part);
  for (const x of [b.left, part.x, b.right]) for (const y of [b.top, part.y, b.bottom]) {
    assert.equal(geometry.pointInBounds(b, x, y), true);
    assert.equal(geometry.pointInBossBounds(part, x, y), true);
    assert.equal(geometry.bossPartIntersectsRect(part, x, x, y, y), true);
  }
  for (const [x, y] of [[b.left - .001, part.y], [b.right + .001, part.y],
    [part.x, b.top - .001], [part.x, b.bottom + .001]]) {
    assert.equal(geometry.pointInBounds(b, x, y), false);
    assert.equal(geometry.pointInBossBounds(part, x, y), false);
    assert.equal(geometry.bossPartIntersectsRect(part, x, x, y, y), false);
  }
  assert.equal(geometry.rectBoundsIntersect(b, { left: b.right, right: b.right + 10, top: b.bottom, bottom: b.bottom + 10 }), true);
  assert.equal(geometry.rectBoundsIntersect(b, { left: b.right + .001, right: b.right + 10, top: b.top, bottom: b.bottom }), false);
  const tower = { x: 250, y: 350 }, t = geometry.towerBounds(tower);
  assert.equal(geometry.pointInTowerBounds(tower, t.left, t.bottom), true);
  assert.equal(geometry.pointInTowerBounds(tower, t.left - .001, t.bottom), false);
});

test("distance and clamping use the nearest hitbox surface rather than the Boss center", () => {
  const part = boss();
  assert.equal(geometry.bossPartDistanceSqToPoint(part, 700, 400), 0);
  assert.equal(geometry.bossPartDistanceSqToPoint(part, 640, 440), 0);
  assert.equal(geometry.bossPartDistanceSqToPoint(part, 630, 400), 100);
  assert.equal(geometry.bossPartDistanceSqToPoint(part, 763, 444), 25);
  assert.equal(geometry.bossPartInRadius(part, 763, 444, 5), part);
  assert.equal(geometry.bossPartInRadius(part, 763, 444, 4.999), undefined);
  assert.equal(geometry.clampXToBossPart(part, -1e9), 640);
  assert.equal(geometry.clampXToBossPart(part, 1e9), 760);
  assert.equal(geometry.clampXToBossPart(part, 700), 700);
  assert.equal(geometry.clampYToBossPart(part, -1e9), 360);
  assert.equal(geometry.clampYToBossPart(part, 1e9), 440);
});

test("geometry matches pre-extraction formulas across asymmetric, fractional and off-board hitboxes", () => {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  for (const width of [undefined, 0, .95 * CELL_WIDTH, 2.95 * CELL_WIDTH, 4.95 * CELL_WIDTH]) {
    for (const height of [undefined, 0, .95 * CELL_HEIGHT, 2.95 * CELL_HEIGHT]) {
      for (const offset of [-2000, -.125, 0, 777.25]) {
        const part = boss({ x: 400 + offset, y: 350 - offset, hitboxWidth: width, hitboxHeight: height });
        const hw = (width ?? BOSS_HITBOX_WIDTH) / 2, hh = (height ?? BOSS_HITBOX_HEIGHT) / 2;
        for (const [dx, dy] of [[0, 0], [-hw, hh], [hw + 1, hh + 2], [-1000, 1], [1, 1000]]) {
          const x = part.x + dx, y = part.y + dy;
          const px = clamp(x, part.x - hw, part.x + hw), py = clamp(y, part.y - hh, part.y + hh);
          assert.equal(geometry.clampXToBossPart(part, x), px);
          assert.equal(geometry.clampYToBossPart(part, y), py);
          assert.equal(geometry.bossPartDistanceSqToPoint(part, x, y), (x - px) ** 2 + (y - py) ** 2);
          assert.equal(geometry.pointInBossBounds(part, x, y),
            x >= part.x - hw && x <= part.x + hw && y >= part.y - hh && y <= part.y + hh);
        }
      }
    }
  }
});

test("Boss-part traversal is root-first, stable, shallow and independent of health or invincibility", () => {
  const a = boss({ hp: 0 }), b = boss({ invincibleUntil: Infinity }), nested = boss();
  a.octahedronCopies = [nested];
  const root = boss({ octahedronCopies: [a, b] });
  assert.equal(geometry.secondaryBossParts(root), root.octahedronCopies);
  assert.deepEqual(geometry.bossParts(root), [root, a, b]);
  const visited = [];
  geometry.forEachBossPart(root, part => visited.push(part));
  assert.deepEqual(visited, [root, a, b]);
  assert.equal(geometry.findBossPart(root, () => true), root);
  const calls = [];
  assert.equal(geometry.findBossPart(root, part => { calls.push(part); return part === a; }), a);
  assert.deepEqual(calls, [root, a]);
  assert.equal(geometry.findBossPart(root, part => part === nested), undefined);
  const snapshot = geometry.bossParts(root); snapshot.pop();
  assert.deepEqual(root.octahedronCopies, [a, b]);
});

test("DEL echoes take precedence over copies, including an explicitly empty echo list", () => {
  const copy = boss(), echo = boss(), root = boss({ octahedronCopies: [copy], delLaneSweep: { parts: [echo] } });
  assert.deepEqual(geometry.bossParts(root), [root, echo]);
  root.delLaneSweep.parts = [];
  assert.deepEqual(geometry.bossParts(root), [root]);
  root.delLaneSweep = undefined;
  assert.deepEqual(geometry.bossParts(root), [root, copy]);
  root.octahedronCopies = undefined;
  assert.deepEqual(geometry.secondaryBossParts(root), []);
});

test("all Boss-part searches return the first matching identity, not the closest or newest part", () => {
  const a = boss({ x: 900 }), b = boss({ x: 905 }), root = boss({ octahedronCopies: [a, b] });
  assert.equal(geometry.bossPartAtPoint(root, 904, 400), a);
  assert.equal(geometry.bossPartInRadius(root, 904, 400, 0), a);
  assert.equal(geometry.bossPartInRect(root, 904, 400, 0, 0), a);
  assert.equal(geometry.bossPartInRadius(root, 800, 400, 100), root);
  assert.equal(geometry.bossPartInRect(root, 630, 350, 400, 100), root);
  assert.equal(geometry.isPointInBossHitbox(root, 904, 400), true);
  assert.equal(geometry.isBossInRadius(root, 904, 400, 0), true);
  assert.equal(geometry.isBossInRect(root, 904, 400, 1, 1), true);
  assert.equal(geometry.bossPartAtPoint(root, 5000, 400), undefined);
});

test("null Boss queries return empty results and never invoke callbacks", () => {
  assert.deepEqual(geometry.bossParts(null), []);
  assert.equal(geometry.findBossPart(null, () => assert.fail("No Boss")), undefined);
  geometry.forEachBossPart(null, () => assert.fail("No Boss"));
  assert.equal(geometry.bossPartAtPoint(null, 0, 0), undefined);
  assert.equal(geometry.bossPartInRadius(null, 0, 0, 1), undefined);
  assert.equal(geometry.bossPartInRect(null, 0, 0, 1, 1), undefined);
  assert.equal(geometry.isPointInBossHitbox(null, 0, 0), false);
  assert.equal(geometry.isBossInRadius(null, 0, 0, 1), false);
  assert.equal(geometry.isBossInRect(null, 0, 0, 1, 1), false);
});

test("DEL's inset 3x3 and 1x1 hitboxes do not reach adjacent rows", () => {
  const tower = lane => ({ x: BOARD_X + CELL_WIDTH * 5.5, y: BOARD_Y + CELL_HEIGHT * (lane + .5) });
  for (const [size, expected] of [[2.95, [2, 3, 4]], [.95, [3]]]) {
    const part = boss({ ...tower(3), hitboxWidth: CELL_WIDTH * size, hitboxHeight: CELL_HEIGHT * size });
    const rows = Array.from({ length: 7 }, (_, lane) => lane).filter(lane => geometry.towerIntersectsBoss(tower(lane), part));
    assert.deepEqual(rows, expected);
  }
});

test("Boss armor support loads headlessly and measures the individual part's nearest surface", () => {
  const { hexBossArmorBonus } = load("src/game/enemySupport.ts");
  const radius = CELL_WIDTH * load("src/data/enemyAbilities.ts").ENEMY_AURAS.armor.range.shape.radius;
  const part = boss({ x: 0, y: 0, hitboxWidth: 120, hitboxHeight: 80 });
  const hex = { kind: "hexagon", x: 60 + radius, y: 0, lane: 3, inPlay: true, statusEffects: [] };
  assert.equal(hexBossArmorBonus([hex], part), 50, "armor reaches the edge even outside center radius");
  hex.x += .01; assert.equal(hexBossArmorBonus([hex], part), 0);
  hex.x -= .01; hex.kind = "hexagon3";
  assert.equal(hexBossArmorBonus([hex], part), 110);
  hex.highFlightUntil = 0; assert.equal(hexBossArmorBonus([hex], part), 0);
  hex.highFlightUntil = undefined;
  const remote = boss({ x: 3000, y: 0, octahedronCopies: [part] });
  assert.equal(hexBossArmorBonus([hex], remote), 0, "each Boss part gets its own support query");
  assert.equal(hexBossArmorBonus([hex], null), 0);
  hex.parenthesisCarrier = { inPlay: true, statusEffects: [], highFlightUntil: 1000 };
  assert.equal(hexBossArmorBonus([hex], part), 0, "passengers inherit carrier high flight");
});
