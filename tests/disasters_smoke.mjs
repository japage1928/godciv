// Disaster smoke test: every disaster must visibly move the
// population, one use never takes more than a quarter of the
// village, and every disaster death counts in stats.deaths with a
// named log line. Bless is untouched. Cooldowns are unchanged.
// Run: npm test  (or: node tests/disasters_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, makeVillager, applyGod, godCooldown, cellAt,
  forEachGeneratedCell, ownVillagers, ownBuildings, disasterKillCap,
  DISASTER_MAX_FRACTION,
} from "../src/sim.js";

const STEPS_PER_DAY = 180 * 4;
function runDays(state, grid, days) {
  for (let i = 0; i < days * STEPS_PER_DAY; i++) step(state, grid, 0.25);
}
// Count deaths of one cause across a run, draining the capped log
// as it goes so no death scrolls off uncounted.
function runDaysCounted(state, grid, days, causeRe) {
  let deaths = 0;
  const total = days * STEPS_PER_DAY;
  for (let i = 0; i < total; i++) {
    step(state, grid, 0.25);
    if (i % 180 === 0) {
      for (const l of state.log) if (causeRe.test(l.text || "")) deaths++;
      state.log.length = 0;
    }
  }
  for (const l of state.log) if (causeRe.test(l.text || "")) deaths++;
  return deaths;
}
function growPop(state, n) {
  while (ownVillagers(state).length < n) {
    state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 20, coins: 0 }));
  }
}
function placeVillagers(state, spots) {
  const vs = ownVillagers(state);
  spots.forEach(([x, z], i) => { vs[i].x = x + 0.5; vs[i].z = z + 0.5; vs[i].health = 100; vs[i].hunger = 10; });
}

// --- fire: kills up to the cap in the radius, wounds the rest,
// burns structures, never touches the town center ---
{
  const { state, grid } = newWorld(7);
  growPop(state, 20);
  assert.equal(disasterKillCap(state), 5, "cap must be a quarter of 20");
  placeVillagers(state, [[24, 24], [25, 24], [24, 25], [25, 25], [23, 24], [24, 23], [26, 24], [24, 26]]);
  for (let i = 8; i < 20; i++) { ownVillagers(state)[i].x = 10.5; ownVillagers(state)[i].z = 10.5; }
  state.buildings.push({ type: "hut", x: 25, z: 25, done: true, builtDay: 1 });
  cellAt(grid, 25, 25).building = "hut"; cellAt(grid, 25, 25).blocked = true;
  const deathsBefore = state.stats.deaths;
  const res = applyGod(state, grid, "fire", 24, 24);
  assert.equal(res.ok, true, "fire must fire, got " + JSON.stringify(res));
  assert.equal(ownVillagers(state).length, 15, "fire must kill exactly the cap, pop 20 -> " + ownVillagers(state).length);
  assert.equal(state.stats.deaths - deathsBefore, 5, "fire deaths must count in stats.deaths");
  assert.ok(state.log.some((e) => /dies \(burned in the fire\)/.test(e.text)), "fire deaths must be named in the log");
  assert.ok(state.log.some((e) => /Fire falls/.test(e.text)), "fire must log its summary");
  assert.ok(!ownBuildings(state).some((b) => b.type === "hut" && b.x === 25 && b.z === 25), "the hut in the flames must burn");
  assert.equal(cellAt(grid, 25, 25).building, null, "the burned hut's cell must clear");
  assert.ok(ownBuildings(state).some((b) => b.type === "towncenter"), "the town center must survive the fire");
  for (const v of ownVillagers(state)) {
    if (Math.hypot(v.x - 24, v.z - 24) < 4) assert.equal(v.health, 75, "survivors in the radius must be wounded, " + v.name + " hp=" + v.health);
  }
  assert.ok(ownVillagers(state).some((v) => Math.hypot(v.x - 10.5, v.z - 10.5) < 1 && v.health === 100), "villagers far from the fire must be unhurt");
  assert.equal(godCooldown(state, "fire"), 30, "fire cooldown must stay 30s");
  assert.equal(applyGod(state, grid, "fire", 24, 24).ok, false, "a second fire during cooldown must be refused");
  console.log("fire: 20 -> 15, hut burned, town center stands, survivors at 75hp");
}

// --- quake: crushes up to the cap, collapses at most two structures ---
{
  const { state, grid } = newWorld(7);
  growPop(state, 20);
  placeVillagers(state, [[24, 24], [25, 24], [24, 25], [25, 25], [23, 24], [24, 23], [26, 24], [24, 26]]);
  for (let i = 8; i < 20; i++) { ownVillagers(state)[i].x = 10.5; ownVillagers(state)[i].z = 10.5; }
  state.buildings.push({ type: "hut", x: 25, z: 25, done: true, builtDay: 1 });
  cellAt(grid, 25, 25).building = "hut"; cellAt(grid, 25, 25).blocked = true;
  // The wall sits nearest the epicenter so it is inside the
  // two-collapse budget; the altar, farther out, is damaged
  // but held standing by the same budget.
  state.buildings.push({ type: "wall", x: 25, z: 24, done: true, builtDay: 1 });
  cellAt(grid, 25, 24).building = "wall"; cellAt(grid, 25, 24).blocked = true;
  const deathsBefore = state.stats.deaths;
  const res = applyGod(state, grid, "quake", 24, 24);
  assert.equal(res.ok, true, "quake must fire, got " + JSON.stringify(res));
  assert.equal(ownVillagers(state).length, 15, "quake must kill exactly the cap, pop 20 -> " + ownVillagers(state).length);
  assert.equal(state.stats.deaths - deathsBefore, 5, "quake deaths must count in stats.deaths");
  assert.ok(state.log.some((e) => /dies \(crushed in the quake\)/.test(e.text)), "quake deaths must be named in the log");
  assert.ok(!ownBuildings(state).some((b) => b.type === "hut" && b.x === 25), "the hut must collapse");
  assert.ok(!ownBuildings(state).some((b) => b.type === "wall" && b.x === 25), "the wall must collapse");
  const altar = ownBuildings(state).find((b) => b.type === "altar");
  assert.ok(altar, "the altar must stand (damaged, held by the collapse budget)");
  assert.ok((altar.damage || 0) > 0, "the altar must carry damage, damage=" + (altar.damage || 0));
  assert.ok(ownBuildings(state).some((b) => b.type === "towncenter"), "the town center must survive the quake");
  for (const v of ownVillagers(state)) {
    if (Math.hypot(v.x - 24, v.z - 24) < 6) assert.equal(v.health, 70, "survivors in the radius must be wounded, " + v.name + " hp=" + v.health);
  }
  assert.equal(godCooldown(state, "quake"), 40, "quake cooldown must stay 40s");
  console.log("quake: 20 -> 15, hut + wall collapsed, town center stands, survivors at 70hp");
}

// --- flood: drowns only on low ground (capped), ruins flooded
// crops, batters flooded buildings, spares high ground ---
{
  const { state, grid } = newWorld(7);
  growPop(state, 20);
  // Low cells near the center: height under the flood line.
  const lowCells = [];
  forEachGeneratedCell(grid, (x, z, c) => {
    if (lowCells.length >= 8) return;
    if (Math.hypot(x - state._cx, z - state._cz) < 14 && c.h < 0.35 && !c.water && !c.building) lowCells.push([x, z]);
  });
  assert.equal(lowCells.length, 8, "the fixture needs 8 low cells near the center, found " + lowCells.length);
  const highCells = [];
  forEachGeneratedCell(grid, (x, z, c) => {
    if (highCells.length >= 8) return;
    if (Math.hypot(x - state._cx, z - state._cz) < 14 && c.h >= 0.35 && !c.water && !c.building) highCells.push([x, z]);
  });
  assert.equal(highCells.length, 8, "the fixture needs 8 high cells near the center, found " + highCells.length);
  lowCells.forEach(([x, z], i) => { const v = ownVillagers(state)[i]; v.x = x + 0.5; v.z = z + 0.5; v.health = 100; v.hunger = 10; });
  highCells.forEach(([x, z], i) => { const v = ownVillagers(state)[8 + i]; v.x = x + 0.5; v.z = z + 0.5; v.health = 100; v.hunger = 10; });
  for (let i = 16; i < 20; i++) { ownVillagers(state)[i].x = 2.5; ownVillagers(state)[i].z = 2.5; }
  // Ripe crops on low ground, and a hut on low ground.
  for (const [x, z] of lowCells.slice(0, 3)) { const c = cellAt(grid, x, z); c.farm = true; c.crop = 3; c.cropGrow = 0; }
  const hutCell = lowCells[3];
  state.buildings.push({ type: "hut", x: hutCell[0], z: hutCell[1], done: true, builtDay: 1 });
  cellAt(grid, hutCell[0], hutCell[1]).building = "hut"; cellAt(grid, hutCell[0], hutCell[1]).blocked = true;
  const deathsBefore = state.stats.deaths;
  const res = applyGod(state, grid, "flood");
  assert.equal(res.ok, true, "flood must fire, got " + JSON.stringify(res));
  assert.equal(ownVillagers(state).length, 15, "flood must drown exactly the cap, pop 20 -> " + ownVillagers(state).length);
  assert.equal(state.stats.deaths - deathsBefore, 5, "flood deaths must count in stats.deaths");
  assert.ok(state.log.some((e) => /dies \(drowned in the flood\)/.test(e.text)), "flood deaths must be named in the log");
  for (const [x, z] of lowCells.slice(0, 3)) assert.equal(cellAt(grid, x, z).crop, 0, "flooded crops must be ruined at " + x + "," + z);
  const hut = ownBuildings(state).find((b) => b.type === "hut" && b.x === hutCell[0]);
  assert.ok(hut, "the flooded hut must stand (battered, not washed away)");
  assert.ok((hut.damage || 0) > 0, "the flooded hut must carry damage, damage=" + (hut.damage || 0));
  assert.ok(state.log.some((e) => /crops are ruined/.test(e.text)), "ruined crops must be logged");
  assert.equal(godCooldown(state, "flood"), 45, "flood cooldown must stay 45s");
  console.log("flood: 20 -> 15, low ground drowned, crops ruined, hut battered");
}

// --- plague: a healthy village loses a visible fraction to the
// dawn roll, never more than the cap, and the wave ends ---
{
  const { state, grid } = newWorld(7);
  growPop(state, 20);
  const res = applyGod(state, grid, "plague");
  assert.equal(res.ok, true, "plague must fire, got " + JSON.stringify(res));
  assert.ok(state.effects.plagueUntil > state.elapsed, "the plague wave must be timed");
  assert.equal(state.effects.plagueBudget, 5, "the plague budget must be the cap");
  const sickNow = ownVillagers(state).filter((v) => v.sick).length;
  assert.ok(sickNow >= 1 && sickNow < 20, "plague must sicken part of the village, sick=" + sickNow + "/20");
  assert.equal(godCooldown(state, "plague"), 60, "plague cooldown must stay 60s");
  // Every villager sick: the dawn roll itself must kill some, but
  // never more than the budget, even with the whole village ill.
  for (const v of ownVillagers(state)) { v.sick = true; v.health = 100; v.hunger = 10; }
  const sicknessDeaths = runDaysCounted(state, grid, 1, /dies \(sickness\)/);
  assert.ok(sicknessDeaths >= 1, "plague must kill a visible fraction, sickness deaths=" + sicknessDeaths);
  assert.ok(sicknessDeaths <= 5, "one plague wave must not exceed the cap, sickness deaths=" + sicknessDeaths);
  assert.equal(ownVillagers(state).filter((v) => v.sick).length, 0, "everyone must recover after the wave");
  // One second past the day: the wave's end is strictly behind us.
  for (let i = 0; i < 4; i++) step(state, grid, 0.25);
  assert.ok(state.effects.plagueUntil < state.elapsed, "the plague wave must end");
  console.log("plague: sickness deaths " + sicknessDeaths + " in one wave, capped at 5");
}

// --- drought + famine: crops stand still, the stores empty, the
// village hears warnings at dawn, and hunger deaths follow ---
{
  const { state, grid } = newWorld(7);
  growPop(state, 20);
  // A plot on the edge of ripening must not advance in a drought.
  state.weather = { kind: "clear", until: state.elapsed + 600 };
  const [fx, fz] = state._farmCells[0];
  const fc = cellAt(grid, fx, fz);
  fc.crop = 2; fc.cropGrow = 27.9;
  const res = applyGod(state, grid, "drought");
  assert.equal(res.ok, true, "drought must fire, got " + JSON.stringify(res));
  assert.equal(state.effects.droughtUntil, state.elapsed + 60, "drought must hold 60s");
  assert.equal(godCooldown(state, "drought"), 45, "drought cooldown must stay 45s");
  for (let i = 0; i < 40; i++) step(state, grid, 0.25);
  assert.equal(cellAt(grid, fx, fz).crop, 2, "crops must not advance during drought");
  console.log("drought: crops frozen for the 60s hold");
}
{
  // Empty stores, empty hands, bare plots, near-starving villagers:
  // the famine chain must fire — a dawn warning, then hunger deaths.
  const { state, grid } = newWorld(7);
  growPop(state, 20);
  state.stockpile.food = 0; state.stockpile.fish = 0; state.stockpile.meat = 0;
  forEachGeneratedCell(grid, (x, z, c) => { if (c.farm) { c.crop = 0; c.cropGrow = 0; } });
  for (const v of ownVillagers(state)) {
    for (const g of Object.keys(v.goods)) v.goods[g] = 0;
    v.hunger = 99; v.health = 5;
  }
  const deathsBefore = state.stats.deaths;
  // Run the whole day: the near-starving die in the first seconds,
  // and the dawn warning fires at the time wrap whether or not
  // foragers find a meal by then.
  let warned = false;
  for (let i = 0; i < STEPS_PER_DAY; i++) {
    step(state, grid, 0.25);
    if (state.log.some((e) => /stores stand empty|Food runs low/.test(e.text))) warned = true;
    if (i % 180 === 0) state.log.length = 0;
  }
  assert.ok(state.stats.deaths > deathsBefore, "empty stores must kill by hunger");
  assert.ok(warned, "falling stores must be warned at dawn");
  console.log("famine: empty stores warned, hunger deaths followed");
}

// --- bless is untouched by the disaster rework ---
{
  const { state, grid } = newWorld(7);
  const foodBefore = state.stockpile.food;
  const res = applyGod(state, grid, "bless");
  assert.equal(res.ok, true, "bless must still fire");
  assert.equal(state.stockpile.food, foodBefore + 10, "bless must still grant +10 food");
  assert.equal(godCooldown(state, "bless"), 20, "bless cooldown must stay 20s");
  console.log("bless: unchanged");
}

assert.ok(DISASTER_MAX_FRACTION === 0.25, "the disaster cap fraction must be 0.25");
console.log("disasters_smoke: all checks passed");
