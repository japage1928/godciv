// Jobs smoke test for v14 Phase 4: production jobs, production
// buildings, era gates, delegation, market circulation, and the
// serialize/deserialize round-trip for the new product goods.
// Run: node tests/jobs_smoke.mjs
import assert from "node:assert";
import {
  newWorld, step, serialize, deserialize, computeDemands, delegateRoles,
  doWork, scoreJob, runMarket, makeVillager, cellAt, JOBS, PRICES,
  SAVE_VERSION,
} from "../src/sim.js";

// New jobs sit after teacher, before guard; every existing job keeps
// its relative order.
assert.deepEqual(
  JOBS,
  ["farmer", "woodcutter", "miner", "fisher", "hunter", "builder", "hauler", "teacher", "carpenter", "potter", "smith", "factory", "guard"],
  "JOBS must gain carpenter/potter/smith/factory after teacher, before guard",
);
assert.deepEqual(
  { furniture: PRICES.furniture, pottery: PRICES.pottery, ironware: PRICES.ironware, wares: PRICES.wares },
  { furniture: 6, pottery: 4, ironware: 8, wares: 10 },
  "new product prices must be furniture 6, pottery 4, ironware 8, wares 10",
);
assert.equal(SAVE_VERSION, 5, "Phase 4 must not bump SAVE_VERSION");

function placeBuilding(state, grid, type, x, z) {
  state.buildings.push({ type, x, z, done: true, builtDay: 1, village: 0 });
  cellAt(grid, x, z).building = type;
  cellAt(grid, x, z).blocked = true;
}

// --- (a) Each production chain conserves exactly ---
const RECIPES = {
  carpenter: { workplace: "workshop", inputs: { wood: 2 }, output: "furniture", outAmt: 1 },
  potter: { workplace: "kiln", inputs: { stone: 2 }, output: "pottery", outAmt: 1 },
  smith: { workplace: "smithy", inputs: { ore: 1 }, output: "ironware", outAmt: 1 },
  factory: { workplace: "factory", inputs: { wood: 1, stone: 1, ore: 1 }, output: "wares", outAmt: 2 },
};
for (const [job, recipe] of Object.entries(RECIPES)) {
  const { state, grid } = newWorld(42);
  const bx = 24, bz = 27;
  placeBuilding(state, grid, recipe.workplace, bx, bz);
  state.stockpile = { food: 0, fish: 0, meat: 0, wood: 30, stone: 30, ore: 30, furniture: 0, pottery: 0, ironware: 0, wares: 0 };
  const v = state.villagers[0];
  v.job = job; v.state = "work"; v.carry = null; v.tool = 0; v.workTimer = 0;
  v.x = bx + 0.5; v.z = bz + 0.5;
  const K = 3;
  let produced = 0;
  for (let i = 0; i < K; i++) {
    v.target = [bx, bz]; v.workTimer = 0;
    doWork(state, grid, v, 5);
    assert.ok(v.carry && v.carry.type === recipe.output, job + " must carry " + recipe.output + " after work, got " + JSON.stringify(v.carry));
    assert.equal(v.carry.amt, recipe.outAmt, job + " must produce exactly " + recipe.outAmt + " per action");
    produced += v.carry.amt;
    v.carry = null; // hauled away: the stockpile delta below is inputs only
  }
  assert.equal(produced, K * recipe.outAmt, job + " must produce exactly " + (K * recipe.outAmt) + " over " + K + " actions");
  for (const [g, n] of Object.entries(recipe.inputs)) {
    assert.equal(state.stockpile[g], 30 - K * n, job + " must consume exactly " + (K * n) + " " + g + ", stockpile=" + state.stockpile[g]);
  }
  for (const g of ["furniture", "pottery", "ironware", "wares"]) {
    assert.equal(state.stockpile[g], 0, job + " must not deposit products itself; stockpile " + g + " stays 0 until a haul");
  }
  // Insufficient inputs: nothing is produced, nothing is consumed.
  for (const g of Object.keys(recipe.inputs)) state.stockpile[g] = recipe.inputs[g] - 1;
  v.target = [bx, bz]; v.workTimer = 0; v.carry = null;
  doWork(state, grid, v, 5);
  assert.equal(v.carry, null, job + " must not produce from thin air with insufficient inputs");
  for (const g of Object.keys(recipe.inputs)) assert.equal(state.stockpile[g], recipe.inputs[g] - 1, job + " must not consume inputs it cannot use");
  // Away from the workplace: no production, no consumption.
  for (const g of Object.keys(recipe.inputs)) state.stockpile[g] = 30;
  v.target = [state._cx, state._cz]; v.workTimer = 0; v.carry = null;
  doWork(state, grid, v, 5);
  assert.equal(v.carry, null, job + " must not produce away from the " + recipe.workplace);
  for (const g of Object.keys(recipe.inputs)) assert.equal(state.stockpile[g], 30, job + " must not consume inputs away from the workplace");
  // Carrying something else, or a full carry of the product: the
  // recipe waits rather than voiding inputs.
  v.target = [bx, bz]; v.workTimer = 0; v.carry = { type: "stone", amt: 1 };
  doWork(state, grid, v, 5);
  assert.deepEqual(v.carry, { type: "stone", amt: 1 }, job + " must not overwrite a mismatched carry");
  for (const g of Object.keys(recipe.inputs)) assert.equal(state.stockpile[g], 30, job + " must not consume inputs with a mismatched carry");
  v.workTimer = 0; v.carry = { type: recipe.output, amt: v.carryCap };
  doWork(state, grid, v, 5);
  assert.equal(v.carry.amt, v.carryCap, job + " must not overfill a full carry");
  for (const g of Object.keys(recipe.inputs)) assert.equal(state.stockpile[g], 30, job + " must not consume inputs with a full carry");
  // Stockpile want met: production stops, so raw materials stay
  // available for building instead of piling into surplus goods.
  state.stockpile[recipe.output] = 12;
  v.target = [bx, bz]; v.workTimer = 0; v.carry = null;
  doWork(state, grid, v, 5);
  assert.equal(v.carry, null, job + " must not produce once the stockpile holds the wanted 12 " + recipe.output);
  for (const g of Object.keys(recipe.inputs)) assert.equal(state.stockpile[g], 30, job + " must not consume inputs once the want is met");
  console.log(job + ": " + K + " actions conserve exactly (" + Object.entries(recipe.inputs).map(([g, n]) => n + " " + g).join(" + ") + " -> " + recipe.outAmt + " " + recipe.output + ")");
}

// --- (b) Era gates hold in computeDemands ---
function demandsAt(tech, pop) {
  const { state, grid } = newWorld(43);
  state.tech = { level: tech, progress: 0 };
  while (state.villagers.length < pop) {
    state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 25 }));
  }
  return computeDemands(state, grid).map((d) => d.type);
}
assert.ok(!demandsAt(0, 12).includes("kiln"), "no kiln demand below tech 1");
assert.ok(!demandsAt(1, 9).includes("kiln"), "no kiln demand below pop 10");
assert.ok(demandsAt(1, 10).includes("kiln"), "kiln demand at tech 1 + pop 10");
assert.ok(!demandsAt(1, 20).includes("smithy"), "no smithy demand below tech 2");
assert.ok(!demandsAt(2, 11).includes("smithy"), "no smithy demand below pop 12");
assert.ok(demandsAt(2, 12).includes("smithy"), "smithy demand at tech 2 + pop 12");
assert.ok(!demandsAt(4, 30).includes("factory"), "no factory demand below tech 5");
assert.ok(!demandsAt(5, 25).includes("factory"), "no factory demand below pop 26");
assert.ok(demandsAt(5, 26).includes("factory"), "factory demand at tech 5 + pop 26");
// One only: a built kiln/smithy/factory is never demanded again.
{
  const { state, grid } = newWorld(44);
  state.tech = { level: 5, progress: 0 };
  while (state.villagers.length < 26) state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 25 }));
  placeBuilding(state, grid, "kiln", 22, 27);
  placeBuilding(state, grid, "smithy", 27, 27);
  placeBuilding(state, grid, "factory", 21, 24);
  const types = computeDemands(state, grid).map((d) => d.type);
  assert.ok(!types.includes("kiln") && !types.includes("smithy") && !types.includes("factory"), "built production buildings must not be demanded again, got " + types);
}

// --- (c) Workplace gate: scoreJob penalizes -30 without the workplace ---
for (const [job, recipe] of Object.entries(RECIPES)) {
  const { state } = newWorld(45);
  state.stockpile[recipe.output] = 12; // no deficit: the gap is the gate alone
  const v = makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 25 });
  v.traits = [];
  for (const j of JOBS) v.skills[j] = 0;
  v.job = "hauler"; v.assignedJob = null; v.personalFocus = null;
  const without = scoreJob(state, v, job);
  assert.ok(without < 0, job + " without a workplace must score below real work, got " + without);
  state.buildings.push({ type: recipe.workplace, x: 24, z: 27, done: true, builtDay: 1, village: 0 });
  const withWorkplace = scoreJob(state, v, job);
  assert.equal(withWorkplace - without, 30, job + " workplace gate must be exactly 30, got " + withWorkplace + " - " + without);
  // Surplus pushes workers away: at 30 on hand the score must fall
  // below the at-want score, so production does not pile up goods.
  state.stockpile[recipe.output] = 30;
  const surplus = scoreJob(state, v, job);
  assert.ok(surplus < withWorkplace, job + " surplus must score below the at-want score, got " + surplus + " vs " + withWorkplace);
}

// --- (d) Delegation counts fire when the building exists ---
{
  const { state, grid } = newWorld(46);
  delegateRoles(state, grid);
  const count = (job) => state.villagers.filter((v) => v.assignedJob === job).length;
  for (const job of ["carpenter", "potter", "smith", "factory"]) {
    assert.equal(count(job), 0, "no " + job + " may be delegated without its workplace");
  }
}
{
  const { state, grid } = newWorld(47);
  while (state.villagers.length < 20) state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 25 }));
  placeBuilding(state, grid, "workshop", 24, 27);
  placeBuilding(state, grid, "kiln", 22, 27);
  placeBuilding(state, grid, "smithy", 27, 27);
  placeBuilding(state, grid, "factory", 21, 24);
  placeBuilding(state, grid, "school", 27, 21);
  state.stockpile = { food: 100, fish: 10, meat: 10, wood: 100, stone: 100, ore: 10, furniture: 0, pottery: 0, ironware: 0, wares: 0 };
  delegateRoles(state, grid);
  const count = (job) => state.villagers.filter((v) => v.assignedJob === job).length;
  assert.equal(count("carpenter"), 2, "two carpenters at pop >= 20 with a workshop, got " + count("carpenter"));
  assert.equal(count("potter"), 1, "one potter with a kiln, got " + count("potter"));
  assert.equal(count("smith"), 1, "one smith with a smithy, got " + count("smith"));
  assert.equal(count("factory"), 2, "two factory workers with a factory, got " + count("factory"));
}

// --- (e) New goods survive serialize/deserialize; old saves still run ---
{
  const { state, grid } = newWorld(48);
  const v = state.villagers[0];
  v.goods.furniture = 3; v.goods.pottery = 2; v.goods.ironware = 1; v.goods.wares = 4;
  state.stockpile.furniture = 5; state.stockpile.pottery = 6; state.stockpile.ironware = 7; state.stockpile.wares = 8;
  const rt = deserialize(serialize(state, grid));
  const rv = rt.state.villagers.find((o) => o.id === v.id);
  assert.deepEqual(
    { furniture: rv.goods.furniture, pottery: rv.goods.pottery, ironware: rv.goods.ironware, wares: rv.goods.wares },
    { furniture: 3, pottery: 2, ironware: 1, wares: 4 },
    "personal product goods must survive a round-trip",
  );
  assert.deepEqual(
    { furniture: rt.state.stockpile.furniture, pottery: rt.state.stockpile.pottery, ironware: rt.state.stockpile.ironware, wares: rt.state.stockpile.wares },
    { furniture: 5, pottery: 6, ironware: 7, wares: 8 },
    "stockpile product goods must survive a round-trip",
  );
  // A save written before the products existed has no stockpile keys
  // for them: it still loads, goods backfill to 0, and production
  // runs without NaN (the stockpile reads in doWork/scoreJob are
  // || 0, and the haul deposit in step.js creates the key).
  const saved = JSON.parse(serialize(state, grid));
  for (const g of ["furniture", "pottery", "ironware", "wares"]) delete saved.stockpile[g];
  for (const sv of saved.villagers) for (const g of ["furniture", "pottery", "ironware", "wares"]) delete sv.goods[g];
  const old = deserialize(JSON.stringify(saved));
  assert.ok(old.state.villagers.every((o) => o.goods.furniture === 0 && o.goods.pottery === 0 && o.goods.ironware === 0 && o.goods.wares === 0),
    "goods backfill must cover the new PRICES keys on an old save");
  placeBuilding(old.state, old.grid, "workshop", 24, 27);
  old.state.stockpile.wood = 10;
  const w = old.state.villagers[0];
  w.job = "carpenter"; w.state = "work"; w.carry = null; w.tool = 0; w.workTimer = 0;
  w.x = 24.5; w.z = 27.5; w.target = [24, 27];
  doWork(old.state, old.grid, w, 5);
  assert.equal(w.carry && w.carry.type, "furniture", "production must work on a migrated old save");
  assert.equal(old.state.stockpile.wood, 8, "production on a migrated save must consume exactly 2 wood");
  assert.ok(Number.isFinite(old.state.stockpile.wood), "no NaN in a migrated stockpile");
}

// --- Market: products circulate between villagers ---
{
  const { state } = newWorld(49);
  for (const v of state.villagers) {
    v.hunger = 10; v.coins = 0; v.job = "hauler"; v.traits = [];
    for (const g of Object.keys(PRICES)) v.goods[g] = 0;
  }
  const buyer = state.villagers[0], seller = state.villagers[1];
  buyer.coins = 10; buyer.goods.furniture = 0;
  seller.goods.furniture = 5;
  const tradesBefore = state.stats.trades || 0;
  runMarket(state);
  assert.equal(buyer.goods.furniture, 1, "buyer with <2 furniture and coins must buy one");
  assert.equal(buyer.coins, 10 - PRICES.furniture, "buyer must pay the furniture price");
  assert.equal(seller.goods.furniture, 4, "seller with >2 furniture must sell one");
  assert.equal(seller.coins, PRICES.furniture, "seller must receive the furniture price");
  assert.equal(state.stats.trades, tradesBefore + 1, "exactly one product trade must be counted");
}

// --- End to end through step(): a carpenter at a workshop produces ---
{
  const { state, grid } = newWorld(50);
  placeBuilding(state, grid, "workshop", 24, 27);
  state.stockpile = { food: 100, fish: 10, meat: 10, wood: 50, stone: 50, ore: 10, furniture: 0, pottery: 0, ironware: 0, wares: 0 };
  state.time = 0.35;
  state.expandAt = 1e9; state.delegateAt = 1e9; // isolate: no new builds or redelegation mid-test
  for (const v of state.villagers) {
    for (const j of JOBS) v.skills[j] = 0;
    v.skills.carpenter = 2;
    v.job = "carpenter"; v.assignedJob = "carpenter";
  }
  let produced = false;
  for (let i = 0; i < 600 && !produced; i++) {
    step(state, grid, 0.25);
    produced = state.stockpile.furniture > 0
      || state.villagers.some((v) => v.goods.furniture > 0 || (v.carry && v.carry.type === "furniture"));
  }
  assert.ok(produced, "a carpenter walking to a workshop must produce furniture through step()");
  assert.ok(Number.isFinite(state.stockpile.wood) && state.stockpile.wood < 50, "wood must be consumed by production through step()");
}

console.log("jobs smoke test passed");
