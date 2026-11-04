// Phase 5 smoke: class + housing ladder. Standing counts produced
// goods plus the coins and education the sim already tracks; classes
// fire only at the stated thresholds, ratchet up and never fall;
// housing tier follows the highest-class occupant, ratchets the
// same way, and is derived on load (never serialized); value is
// base x (tier + 1), capped at tier 2.
import assert from "node:assert/strict";
import {
  CLASS_NAMES, CLASS_THRESHOLDS, classOfStanding, deserialize, housingValue,
  makeVillager, newWorld, ownBuildings, ownVillagers, recomputeMorale,
  serialize, standingOf, step, tierOfClass, updateClasses, updateHousingTiers,
} from "../src/sim.js";

const DAY = 180 * 4;

function freshVillager(state, grid) {
  const v = makeVillager(state, state._cx, state._cz);
  v.goods = { food: 0, fish: 0, meat: 0, wood: 0, stone: 0, ore: 0, furniture: 0, pottery: 0, ironware: 0, wares: 0 };
  v.coins = 0; v.education = 0; v.class = 0;
  return v;
}

// Standing formula: products + floor(coins/10) + floor(education/2).
// Raw materials and food never count.
{
  const { state } = newWorld(11);
  const v = freshVillager(state);
  v.goods.furniture = 2; v.coins = 25; v.education = 5;
  assert.equal(standingOf(v), 2 + 2 + 2, "standing = products + coins/10 + education/2");
  v.goods.food = 20; v.goods.wood = 20; v.goods.stone = 20; v.goods.ore = 20;
  assert.equal(standingOf(v), 6, "food, wood, stone, ore add no standing");
  v.goods.pottery = 1; v.goods.ironware = 1; v.goods.wares = 1;
  assert.equal(standingOf(v), 9, "all four product goods count");
}

// Thresholds fire exactly at the stated standing values.
{
  const { state } = newWorld(11);
  const v = freshVillager(state);
  state.villagers.push(v);
  const cases = [[0, 0], [3, 0], [4, 1], [9, 1], [10, 2], [17, 2], [18, 3], [100, 3]];
  for (const [standing, want] of cases) {
    v.goods.wares = standing; v.class = 0;
    updateClasses(state);
    assert.equal(v.class, want, `standing ${standing} -> class ${want} (${CLASS_NAMES[want]})`);
  }
  assert.deepEqual(CLASS_THRESHOLDS, [0, 4, 10, 18], "thresholds are 0/4/10/18");
  assert.equal(tierOfClass(0), 0, "class 0 -> tier 0");
  assert.equal(tierOfClass(1), 1, "class 1 -> tier 1");
  assert.equal(tierOfClass(2), 1, "class 2 -> tier 1");
  assert.equal(tierOfClass(3), 2, "class 3 -> tier 2");
}

// Ratchet: class never falls when holdings drop; the cap holds —
// no standing, however large, promotes past gentry.
{
  const { state } = newWorld(11);
  const v = freshVillager(state);
  state.villagers.push(v);
  v.goods.wares = 18;
  updateClasses(state);
  assert.equal(v.class, 3, "promoted to gentry");
  v.goods.wares = 0;
  updateClasses(state);
  assert.equal(v.class, 3, "class holds after the fortune is spent");
  v.goods.wares = 100; v.coins = 1000; v.education = 10;
  updateClasses(state);
  assert.equal(v.class, 3, "class caps at gentry");
}

// Housing: tier follows the highest-class occupant; empty homes
// keep their tier; the town center is never tiered; value is
// base x (tier + 1), capped at tier 2.
{
  const { state } = newWorld(11);
  const hut = ownBuildings(state).find((b) => b.type === "hut");
  const center = ownBuildings(state).find((b) => b.type === "towncenter");
  const [a, b, c] = ownVillagers(state).slice(0, 3);
  for (const v of [a, b, c]) v.home = hut.x + "," + hut.z;
  a.class = 1; b.class = 3; c.class = 0;
  updateHousingTiers(state);
  assert.equal(hut.tier, 2, "highest occupant (gentry) sets tier 2");
  assert.equal(housingValue(hut), 10 * 3, "hut value = base 10 x (tier 2 + 1)");
  assert.equal(center.tier, undefined, "town center is not a tiered dwelling");
  for (const v of [a, b, c]) v.home = null;
  updateHousingTiers(state);
  assert.equal(hut.tier, 2, "empty home keeps its tier");
  const farmhouse = ownBuildings(state).find((b) => b.type === "farmhouse");
  if (farmhouse) {
    a.home = farmhouse.x + "," + farmhouse.z; a.class = 2;
    updateHousingTiers(state);
    assert.equal(farmhouse.tier, 1, "class 2 -> tier 1");
    assert.equal(housingValue(farmhouse), 8 * 2, "farmhouse value = base 8 x 2");
  }
  const longhouse = ownBuildings(state).find((b) => b.type === "longhouse");
  if (longhouse) assert.equal(housingValue({ type: "longhouse", tier: 2 }), 24 * 3, "longhouse value = base 24 x 3");
  assert.equal(housingValue({ type: "greathall", tier: 2 }), 40 * 3, "greathall value = base 40 x 3");
  assert.equal(housingValue({ type: "hut", tier: 0 }), 10, "tier 0 hut value = base 10");
}

// Dawn hook: classes promote on the dawn pass and hold; the tier
// follows in the same dawn.
{
  const { state, grid } = newWorld(12);
  const v = ownVillagers(state)[0];
  const hut = ownBuildings(state).find((b) => b.type === "hut");
  v.home = hut.x + "," + hut.z;
  v.goods.furniture = 4; v.coins = 10; v.education = 4;
  assert.equal(v.class, 0, "starts commoner");
  for (let i = 0; i < DAY; i++) step(state, grid, 0.25);
  assert.equal(v.class, 1, "dawn promotes on holdings");
  assert.equal(hut.tier, 1, "home tiers up in the same dawn");
  v.goods.furniture = 0; v.coins = 0; v.education = 0;
  for (let i = 0; i < DAY * 5; i++) step(state, grid, 0.25);
  assert.equal(v.class, 1, "no flapping: class holds over 5 dawns");
  assert.equal(hut.tier, 1, "no flapping: tier holds over 5 dawns");
}

// Save/load: class persists as a villager field; tier is derived
// on load; a save without the class field backfills to commoner.
{
  const { state, grid } = newWorld(12);
  const v = ownVillagers(state)[0];
  const hut = ownBuildings(state).find((b) => b.type === "hut");
  v.home = hut.x + "," + hut.z;
  v.goods.wares = 18;
  updateClasses(state);
  updateHousingTiers(state);
  assert.equal(v.class, 3, "setup: gentry");
  assert.equal(hut.tier, 2, "setup: tier 2");
  const rt = deserialize(serialize(state, grid));
  const back = rt.state.villagers.find((o) => o.id === v.id);
  const backHut = rt.state.buildings.find((b) => b.x === hut.x && b.z === hut.z);
  assert.equal(back.class, 3, "class survives save/load");
  assert.equal(backHut.tier, 2, "tier is re-derived on load");
  const saved = JSON.parse(serialize(state, grid));
  for (const sv of saved.villagers) delete sv.class;
  const old = deserialize(JSON.stringify(saved));
  assert.ok(old.state.villagers.every((o) => o.class === 0), "old saves backfill to commoner");
  const first = old.state.villagers[0];
  first.goods.wares = 10;
  updateClasses(old.state);
  assert.equal(first.class, 2, "backfilled villager promotes on the next dawn pass");
}

// Morale: the housing part fires only when a quarter or more of
// dwellings are upgraded.
{
  const { state } = newWorld(11);
  const dwellings = ownBuildings(state).filter((b) => ["hut", "longhouse", "greathall", "farmhouse"].includes(b.type));
  for (const b of dwellings) b.tier = 0;
  let m = recomputeMorale(state);
  assert.ok(!m.parts.some((p) => p.label === "Comfortable homes"), "no housing part below a quarter upgraded");
  const n = Math.ceil(dwellings.length / 4);
  dwellings.slice(0, n).forEach((b) => { b.tier = 1; });
  m = recomputeMorale(state);
  const part = m.parts.find((p) => p.label === "Comfortable homes");
  assert.ok(part && part.delta === 4, "housing part is +4 at a quarter upgraded");
}

// Natural run: classes and tiers stay in range, holdings
// accumulate, and the dawn pass keeps every record consistent.
{
  const { state, grid } = newWorld(7);
  for (let d = 0; d < 30; d++) for (let i = 0; i < DAY; i++) step(state, grid, 0.25);
  assert.ok(ownVillagers(state).every((v) => Number.isInteger(v.class) && v.class >= 0 && v.class <= 3), "every class in 0..3");
  assert.ok(ownBuildings(state).every((b) => b.tier == null || (b.tier >= 0 && b.tier <= 2)), "every tier in 0..2");
  const withStanding = ownVillagers(state).filter((v) => standingOf(v) > 0).length;
  assert.ok(withStanding >= ownVillagers(state).length / 2, `holdings accumulate: ${withStanding}/${ownVillagers(state).length} villagers hold standing`);
  console.log(`natural run: pop ${ownVillagers(state).length}, classes ${CLASS_NAMES.map((n, i) => n + " " + ownVillagers(state).filter((v) => v.class === i).length).join(", ")}, upgraded dwellings ${ownBuildings(state).filter((b) => (b.tier || 0) >= 1).length}`);
}

console.log("class_smoke PASS");
