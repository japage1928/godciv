// Headless smoke test for src/sim.js. Run: npm test  (or: node tests/sim_smoke.mjs)
import assert from "node:assert";
import { newWorld, step, applyGod, serialize, deserialize, SIZE, makeVillager, delegateRoles, expandVillage, runMarket, computeDemands, dawnDemographics, demographicRates, homelessCount, assignHomes, PRICES, findPlannedSpot, scoreSpot, clearFarmBed, expandFarms } from "../src/sim.js";

const { state, grid } = newWorld(12345);
assert.equal(state.villagers.length, 6, "starts with 6 villagers");
assert.equal(grid.length, SIZE);
const startPos = new Map(state.villagers.map((v) => [v.id, [v.x, v.z]]));

// Run ~10 sim-minutes in 0.25s substeps.
for (let i = 0; i < 2400; i++) step(state, grid, 0.25);
assert.ok(state.elapsed >= 590, "elapsed advances, got " + state.elapsed);
const moved = state.villagers.filter((v) => { const s = startPos.get(v.id); return s && Math.hypot(v.x - s[0], v.z - s[1]) > 0.5; });
assert.ok(moved.length >= 3, "most villagers moved, moved=" + moved.length);
assert.ok(state.log.length > 0, "god log has entries");
assert.ok(state.villagers.every((v) => v.x >= 0 && v.x < SIZE && v.z >= 0 && v.z < SIZE), "villagers stay in bounds");

// God actions.
const foodBefore = state.stockpile.food;
let r = applyGod(state, grid, "bless");
assert.ok(r.ok, "bless works");
assert.equal(state.stockpile.food, foodBefore + 10, "bless adds 10 food");
r = applyGod(state, grid, "bless");
assert.ok(!r.ok, "bless is on cooldown immediately after");
r = applyGod(state, grid, "drought");
assert.ok(r.ok, "drought works");
r = applyGod(state, grid, "fire", 24, 24);
assert.ok(r.ok, "fire works with a target");
r = applyGod(state, grid, "fire");
assert.ok(!r.ok, "fire without a target is refused");

// Save / load round-trip.
const json = serialize(state, grid);
const loaded = deserialize(json);
assert.equal(loaded.state.day, state.day, "day survives round-trip");
assert.equal(loaded.state.villagers.length, state.villagers.length, "population survives round-trip");
assert.equal(loaded.state.stockpile.food, state.stockpile.food, "stockpile survives round-trip");
for (let i = 0; i < 400; i++) step(loaded.state, loaded.grid, 0.25);
assert.ok(loaded.state.elapsed > state.elapsed, "loaded world keeps running");

// Autonomous expansion: a crowded village with resources starts a hut
// with no god order, and a hungry village clears new farm ground.
{
  const w2 = newWorld(777);
  const s2 = w2.state;
  s2.stockpile.wood = 50; s2.stockpile.stone = 50; s2.stockpile.food = 0; s2.stockpile.fish = 0; s2.stockpile.meat = 0;
  while (s2.villagers.length < 11) s2.villagers.push(makeVillager(s2, 25, 25));
  const farmsBefore = s2._farmCells.length;
  for (let i = 0; i < 200; i++) step(s2, w2.grid, 0.25); // 50 sim-seconds, past two expansion checks
  assert.ok(s2.buildQueue.length > 0 || s2.populationCap > 12, "crowding must start a hut on its own, queue=" + s2.buildQueue.length + " cap=" + s2.populationCap);
  assert.ok(s2._farmCells.length > farmsBefore, "food shortage must clear new farm ground, before=" + farmsBefore + " after=" + s2._farmCells.length);
  assert.ok(s2.log.some((e) => /on their own|new ground|new bed/.test(e.text)), "expansion must be logged for the god to see");
}

console.log("sim smoke test passed: day", state.day, "villagers", state.villagers.length, "log", state.log.length, "entries");

// Pacing regression (seed 7, Nov 2): a village must grow over 6 days —
// births, a second hut, roads — with no starvation deaths from the
// setTarget freeze that used to strand villagers on unreachable targets.
// (Birth rolls are stochastic, so the bar is 6 days, not 4.)
{
  const w5 = newWorld(7);
  for (let i = 0; i < 4320; i++) step(w5.state, w5.grid, 0.25);
  assert.ok(w5.state.stats.births >= 2, "6 days must bring births, got " + w5.state.stats.births);
  assert.equal(w5.state.stats.deaths, 0, "no villager should starve in 6 days, deaths=" + w5.state.stats.deaths);
  assert.ok(w5.state.villagers.length > 6, "population must grow past the founding 6, got " + w5.state.villagers.length);
  assert.ok(w5.state.buildings.some((b) => b.type === "hut" && b.x !== w5.state._cx - 2), "a second hut must be built");
}

// Leader delegation: every villager gets an assignment, matched to needs.
{
  const w3 = newWorld(123);
  delegateRoles(w3.state);
  assert.ok(w3.state.villagers.every((v) => v.assignedJob), "every villager must be delegated a job");
  assert.ok(w3.state.villagers.some((v) => v.assignedJob === "farmer"), "delegation must include at least one farmer");
  assert.ok(w3.state.buildings.some((b) => b.type === "towncenter"), "village must start with a town center");
}

// Autonomous buildings: granary queued on surplus food, roads laid to a
// second hut, all with no god order.
{
  const w4 = newWorld(999);
  const s4 = w4.state, g4 = w4.grid;
  s4.stockpile.food = 50; s4.stockpile.wood = 50; s4.stockpile.stone = 50;
  s4.buildings.push({ type: "hut", x: s4._cx + 4, z: s4._cz, done: true });
  g4[s4._cx + 4][s4._cz].building = "hut";
  for (let i = 0; i < 120; i++) step(s4, g4, 0.25); // 30 sim-seconds
  assert.ok(s4.buildQueue.some((q) => q.type === "granary") || s4.buildings.some((b) => b.type === "granary"), "surplus food must start a granary on its own");
  let roads = 0;
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (g4[x][z].road) roads++;
  assert.ok(roads > 0, "roads must be laid toward the second hut, found " + roads);
  // Save/load keeps roads and the town center.
  const loaded = deserialize(serialize(s4, g4));
  assert.ok(loaded.state.buildings.some((b) => b.type === "towncenter"), "town center must survive save/load");
  let roads2 = 0;
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (loaded.grid[x][z].road) roads2++;
  assert.ok(roads2 > 0, "roads must survive save/load");
}

// Economy: the market moves goods for coins, and save/load keeps them.
{
  const { state: s } = newWorld(11);
  const [seller, buyer] = s.villagers;
  seller.goods.food = 5; buyer.goods.food = 0; buyer.hunger = 60; buyer.coins = 4; seller.coins = 0;
  const tradesBefore = s.stats.trades;
  runMarket(s);
  assert.ok(s.stats.trades > tradesBefore, "market must trade surplus food to a hungry buyer");
  assert.equal(seller.coins, PRICES.food, "seller must be paid the food price");
  assert.ok(buyer.goods.food >= 1, "buyer must receive the food");
  // Deposit split: hauling in keeps one unit as personal goods.
  const loaded = deserialize(serialize(s, newWorld(11).grid));
  assert.equal(loaded.state.villagers[0].coins, seller.coins, "coins must survive save/load");
}

// Demand: low faith demands a shrine, ore demands a workshop, and
// villagers queue the top demand on their own.
{
  const { state: s, grid: g } = newWorld(12);
  s.faith = 20; s.stockpile.ore = 10; s.stockpile.wood = 60; s.stockpile.stone = 60;
  const demands = computeDemands(s, g);
  assert.ok(demands.some((d) => d.type === "shrine"), "low faith must demand a shrine, got " + demands.map((d) => d.type).join(","));
  assert.ok(demands.some((d) => d.type === "workshop"), "ore must demand a workshop");
  s.buildings.push({ type: "marker", x: s._cx - 6, z: s._cz - 6 }, { type: "marker", x: s._cx + 6, z: s._cz - 6 }, { type: "marker", x: s._cx - 6, z: s._cz + 6 }, { type: "marker", x: s._cx + 6, z: s._cz + 6 });
  expandVillage(s, g);
  assert.ok(s.buildQueue.length > 0, "a demand must be queued by villagers, queue=" + s.buildQueue.length);
}

// Demographics: elders die of old age over time, and rates are reported.
{
  const { state: s, grid: g } = newWorld(13);
  for (const v of s.villagers) v.ageDays = 90;
  let deaths = 0;
  for (let d = 0; d < 20; d++) { const r = dawnDemographics(s, 14); deaths += r.deaths; }
  assert.ok(deaths > 0, "90-year-old villagers must die of old age over 20 dawns, deaths=" + deaths);
  assert.ok(s.stats.deaths > 0, "elder deaths must be counted in stats");
  const rates = demographicRates(s);
  assert.ok(typeof rates.deathRate === "number" && typeof rates.birthRate === "number", "rates must be numeric");
  // Homes: founding 6 fit the town center + hut; extra villagers are homeless.
  const w = newWorld(14);
  assert.equal(homelessCount(w.state), 0, "founding villagers must all be housed");
  w.state.villagers.push(makeVillager(w.state, 24, 24), makeVillager(w.state, 24, 24), makeVillager(w.state, 24, 24));
  assignHomes(w.state);
  assert.equal(homelessCount(w.state), 1, "9 villagers in 8 beds must leave 1 homeless, got " + homelessCount(w.state));
}

// Planning: a new hut spot must not sit cheek-by-jowl with the founding hut.
{
  const { state: s, grid: g } = newWorld(15);
  const spot = findPlannedSpot(s, g, "hut", 4, 12);
  assert.ok(spot, "a planned hut spot must exist");
  const founding = s.buildings.find((b) => b.type === "hut");
  assert.ok(Math.max(Math.abs(spot[0] - founding.x), Math.abs(spot[1] - founding.z)) > 1, "planned hut must keep breathing room from the founding hut, spot=" + spot);
  assert.ok(scoreSpot(s, g, founding.x, founding.z, "hut") === -Infinity, "an occupied cell must score as unusable");
}

// Farmhouses: demand appears with mouths to feed, and a finished
// farmhouse clears field plots around itself.
{
  const { state: s, grid: g } = newWorld(16);
  while (s.villagers.length < 10) s.villagers.push(makeVillager(s, 25, 25));
  s.stockpile.food = 0; s.stockpile.fish = 0; s.stockpile.meat = 0;
  const demands = computeDemands(s, g);
  assert.ok(demands.some((d) => d.type === "farmhouse"), "a hungry growing village must demand a farmhouse, got " + demands.map((d) => d.type).join(","));
  const before = s._farmCells.length;
  const added = clearFarmBed(s, g, s._cx - 9, s._cz);
  assert.ok(added >= 3, "a farm bed must add at least 3 new plots, added=" + added);
  assert.ok(s._farmCells.length > before, "farm bed must grow the farm list");
}

// Housing evolution: a crowded village with several dwellings demands
// an upgrade, not just another hut.
{
  const { state: s, grid: g } = newWorld(17);
  for (let i = 0; i < 4; i++) s.buildings.push({ type: "hut", x: s._cx + 5 + i, z: s._cz + 5, done: true });
  for (const b of s.buildings) g[b.x][b.z].building = b.type;
  while (s.villagers.length < s.populationCap - 1) s.villagers.push(makeVillager(s, 25, 25));
  const demands = computeDemands(s, g);
  assert.ok(demands.some((d) => d.type === "longhouse"), "a crowded spread-out village must demand a longhouse upgrade, got " + demands.map((d) => d.type).join(","));
}

// Fishers: with a shore and mouths to feed, the leader delegates a
// fisher, and fish reach the stockpile.
{
  const { state: s, grid: g } = newWorld(7);
  delegateRoles(s, g);
  assert.ok(s.villagers.some((v) => v.assignedJob === "fisher"), "a fisher must be delegated from the start, got " + s.villagers.map((v) => v.assignedJob).join(","));
  const fishBefore = s.stockpile.fish;
  for (let i = 0; i < 4320; i++) step(s, g, 0.25);
  assert.ok(s.stockpile.fish > fishBefore || s.villagers.some((v) => (v.goods.fish || 0) > 0), "fishers must produce fish over 6 days");
}
