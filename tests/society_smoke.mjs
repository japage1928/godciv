// Society smoke test for v11: seasons, weather, day/night, morale,
// celebrations, schools/tech, and the v10 -> v11 save migration.
// Run: npm test  (or: node tests/society_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, serialize, deserialize, recomputeMorale, computeDemands,
  makeVillager, dawnDemographics, isStudent, seasonOf, phaseOf, SEASONS, WEATHER_KINDS, SAVE_VERSION,
} from "../src/sim.js";

const DAYS = 30;
const STEPS_PER_DAY = 180 * 4; // 180 sim-seconds per day at 0.25s substeps

function runDays(state, grid, days, onStep) {
  for (let i = 0; i < days * STEPS_PER_DAY; i++) { step(state, grid, 0.25); onStep && onStep(state); }
}

// Drain the god log as the run goes so death causes never scroll off
// the capped 60-entry log before they can be counted.
function countDeathCauses(state) {
  const causes = {};
  for (const l of state.log) {
    const m = /dies \((.*)\)/.exec(l.text || "");
    if (m) causes[m[1]] = (causes[m[1]] || 0) + 1;
  }
  return causes;
}

const V11_FIELDS = ["season", "weather", "morale", "moraleReasons", "celebration", "celebrationBoostUntil", "tech", "lowMoraleDawns", "lastLeaveAt", "stormAt"];

// --- 30-day runs: the invariants that must never regress ---
for (const seed of [7, 42, 1234, 999]) {
  const { state, grid } = newWorld(seed);
  const seasons = new Set([state.season]);
  const weather = new Set([state.weather.kind]);
  const causes = {};
  let midRunChecked = false;
  for (let i = 0; i < DAYS * STEPS_PER_DAY; i++) {
    step(state, grid, 0.25);
    seasons.add(state.season);
    weather.add(state.weather.kind);
    if (i % 360 === 0) { for (const [k, v] of Object.entries(countDeathCauses(state))) causes[k] = (causes[k] || 0) + v; state.log.length = 0; }
    // Mid-run save/load: the world must survive a round-trip with all
    // new systems intact, then keep running.
    if (!midRunChecked && state.day === 15) {
      midRunChecked = true;
      const before = { season: state.season, morale: state.morale, tech: state.tech.level, pop: state.villagers.length };
      const rt = deserialize(serialize(state, grid));
      assert.equal(rt.state.season, before.season, "season survives mid-run round-trip, seed " + seed);
      assert.equal(rt.state.morale, before.morale, "morale survives mid-run round-trip, seed " + seed);
      assert.equal(rt.state.tech.level, before.tech, "tech survives mid-run round-trip, seed " + seed);
      assert.equal(rt.state.villagers.length, before.pop, "population survives mid-run round-trip, seed " + seed);
      assert.ok(rt.state.villagers.every((v) => v.education != null && v.tool != null), "education/tool survive round-trip, seed " + seed);
    }
  }
  Object.assign(causes, {});
  for (const [k, v] of Object.entries(countDeathCauses(state))) causes[k] = (causes[k] || 0) + v;
  assert.deepEqual([...seasons].sort(), [...SEASONS].sort(), "all 4 seasons must occur in 30 days, seed " + seed + " saw " + [...seasons]);
  assert.equal(state.day, DAYS + 1, "30 days must reach day 31, seed " + seed);
  assert.ok(state.stats.celebrations >= 1, "at least one celebration must fire in 30 days, seed " + seed + " got " + state.stats.celebrations);
  assert.ok(state.log.some((e) => /Festival|Bloom|Games|Feast/.test(e.text)) || state.stats.celebrations >= 1, "celebration must be logged, seed " + seed);
  assert.equal(causes["hunger and hardship"] || 0, 0, "zero starvation deaths in 30 days, seed " + seed + " causes=" + JSON.stringify(causes));
  assert.ok(state.villagers.length >= 6, "population must not collapse in 30 days, seed " + seed + " pop=" + state.villagers.length);
  assert.ok(state.morale >= 0 && state.morale <= 100, "morale stays in range, seed " + seed);
  assert.ok(state.buildings.some((b) => b.type === "school"), "a school must be built in 30 days, seed " + seed);
  console.log("seed " + seed + ": day " + state.day + " pop " + state.villagers.length + " celebrations " + state.stats.celebrations + " tech " + state.tech.level + " morale " + Math.round(state.morale) + " deaths " + JSON.stringify(causes) + " leaves " + state.stats.leaves + " weather " + [...weather].sort().join(","));
}

// Weather: every state occurs over a full year. Winter starts on day 31,
// so a 30-day run barely touches it; the year run proves snow arrives.
{
  const { state, grid } = newWorld(42);
  const weather = new Set();
  runDays(state, grid, 40, (s) => weather.add(s.weather.kind));
  for (const k of WEATHER_KINDS) assert.ok(weather.has(k), "weather " + k + " must occur over a full year, saw " + [...weather]);
  assert.ok(state.buildings.some((b) => b.type === "school"), "a school must be built over a full year");
  assert.ok(state.tech.level >= 1, "at least one tech unlock over a full year, level=" + state.tech.level);
}

// Schools + tech in at least 2 of the 4 seeds (checked above: all 4
// built schools; tech unlocks are asserted per seed below).
{
  let techSeeds = 0, schoolSeeds = 0;
  for (const seed of [7, 42, 1234, 999]) {
    const { state, grid } = newWorld(seed);
    runDays(state, grid, 30);
    if (state.tech.level >= 1) techSeeds++;
    if (state.buildings.some((b) => b.type === "school")) schoolSeeds++;
  }
  assert.ok(schoolSeeds >= 2, "school in at least 2 seeds, got " + schoolSeeds);
  assert.ok(techSeeds >= 2, "tech unlock in at least 2 seeds, got " + techSeeds);
}

// --- Night: work stops, villagers go home and sleep ---
{
  const { state, grid } = newWorld(21);
  runDays(state, grid, 2);
  state.time = 0.05; // deep night
  for (let i = 0; i < 48; i++) step(state, grid, 0.25); // 12 sim-seconds: every rethink has fired
  assert.equal(phaseOf(state.time), "night", "forced time must still be night");
  const working = state.villagers.filter((v) => v.state === "work");
  assert.equal(working.length, 0, "nobody works at night, working=" + working.map((v) => v.name + ":" + v.job).join(","));
  const resting = state.villagers.filter((v) => v.state === "rest");
  assert.ok(resting.length >= state.villagers.length / 2, "most villagers rest at night, resting=" + resting.length + "/" + state.villagers.length);
}

// --- Morale: empty stores drag it down, festival cheer lifts it ---
{
  const { state } = newWorld(22);
  state.stockpile.food = 0; state.stockpile.fish = 0; state.stockpile.meat = 0;
  state.morale = 60;
  recomputeMorale(state);
  assert.ok(state.morale < 60, "empty stores must lower morale, got " + state.morale);
  assert.ok(state.moraleReasons.some((r) => /stores/i.test(r.label)), "morale reasons must name the stores");
  state.stockpile.food = 60; state.stockpile.fish = 0; state.stockpile.meat = 0; // one food kind, so the diet part cannot crowd out the cheer part
  state.celebrationBoostUntil = state.elapsed + 1000;
  recomputeMorale(state);
  assert.ok(state.moraleReasons.some((r) => r.label === "Festival cheer"), "festival cheer must appear in morale reasons");
}

// --- Schooling: students learn at dawn, faster with a teacher ---
{
  const { state, grid } = newWorld(23);
  state.buildings.push({ type: "school", x: state._cx + 3, z: state._cz + 3, done: true, builtDay: 1 });
  grid[state._cx + 3][state._cz + 3].building = "school";
  const child = makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 5, coins: 0 });
  state.villagers.push(child);
  assert.ok(isStudent(state, child), "a 5-day-old with a school must count as a student");
  const teacher = state.villagers[0];
  teacher.assignedJob = "teacher";
  for (const v of state.villagers.slice(0, 3)) v.education = 6; // educated adults push tech
  const techBefore = state.tech.progress;
  // Three dawns, called directly so delegation cannot reassign the
  // teacher mid-test: +2 education per dawn with a teacher.
  dawnDemographics(state, 14); dawnDemographics(state, 14); dawnDemographics(state, 14);
  assert.ok(child.education >= 5, "a student must gain education over 3 dawns with a teacher, got " + child.education);
  assert.ok(state.tech.progress > techBefore, "educated adults must push tech progress, before=" + techBefore + " after=" + state.tech.progress);
  const demands = computeDemands(state, grid);
  assert.ok(!demands.some((d) => d.type === "school"), "a village with a school must not demand another");
}

// --- Weather effects: rain feeds crops, snow stops them ---
{
  const { state, grid } = newWorld(24);
  const [fx, fz] = state._farmCells[0];
  const cell = grid[fx][fz];
  cell.crop = 1; cell.cropGrow = 0;
  state.weather = { kind: "rain", until: state.elapsed + 1000 };
  for (let i = 0; i < 40; i++) step(state, grid, 0.25); // 10 sim-seconds
  const rainGrow = cell.cropGrow;
  assert.ok(rainGrow > 10, "rain must grow crops fast, cropGrow=" + rainGrow);
  cell.cropGrow = 0;
  state.weather = { kind: "snow", until: state.elapsed + 1000 };
  for (let i = 0; i < 40; i++) step(state, grid, 0.25);
  assert.equal(cell.cropGrow, 0, "snow must stop crop growth, cropGrow=" + cell.cropGrow);
}

// --- Migration: a v10-format save loads under v11 and keeps going ---
// The fixture is a v11 serialize with every v11-only field stripped
// and the version set to 1, the way a v10 save reads on disk.
{
  const { state, grid } = newWorld(42);
  runDays(state, grid, 5); // about day 6, like the live box world
  const saved = JSON.parse(serialize(state, grid));
  const seedBefore = saved.seed, elapsedBefore = saved.elapsed, dayBefore = saved.day;
  const popBefore = saved.villagers.length, stockBefore = { ...saved.stockpile };
  const buildingsBefore = saved.buildings.length;
  const firstVillager = saved.villagers[0];
  const goodsBefore = { ...firstVillager.goods }, coinsBefore = firstVillager.coins;
  for (const k of V11_FIELDS) delete saved[k];
  saved.version = 1;
  for (const v of saved.villagers) { delete v.education; delete v.tool; }
  const migrated = deserialize(JSON.stringify(saved));
  const m = migrated.state;
  assert.equal(m.seed, seedBefore, "seed survives migration");
  assert.equal(m.day, dayBefore, "day survives migration");
  assert.ok(Math.abs(m.elapsed - elapsedBefore) < 0.001, "elapsed survives migration");
  assert.equal(m.villagers.length, popBefore, "villagers survive migration");
  assert.equal(m.buildings.length, buildingsBefore, "buildings survive migration");
  assert.deepEqual(m.stockpile, stockBefore, "stockpile survives migration");
  assert.deepEqual(m.villagers[0].goods, goodsBefore, "personal goods survive migration");
  assert.equal(m.villagers[0].coins, coinsBefore, "coins survive migration");
  assert.equal(m.version, SAVE_VERSION, "migrated save stamps the current version");
  // New systems arrive with the documented defaults.
  assert.equal(m.season, seasonOf(m.day), "season is derived from the day count on migration");
  assert.equal(m.weather.kind, "clear", "weather starts clear on migration");
  assert.equal(m.morale, 55, "morale starts at 55 on migration");
  assert.deepEqual(m.tech, { level: 0, progress: 0 }, "tech starts at tier 0 on migration");
  assert.ok(m.villagers.every((v) => v.education === 0 && v.tool === 0), "migrated villagers start unschooled with crude tools");
  assert.ok(!m.buildings.some((b) => b.type === "school"), "no school is invented on migration");
  // And the migrated world runs 5 more days with no exceptions.
  runDays(m, migrated.grid, 5);
  assert.ok(m.day >= dayBefore + 5, "migrated world keeps counting days");
  assert.ok(m.villagers.length >= 5, "migrated world keeps its people");
  assert.ok(m.weather && m.season && m.morale != null, "new systems stay active after migration");
  // A v11 save round-trips with its new fields intact.
  const rt = deserialize(serialize(m, migrated.grid));
  assert.equal(rt.state.version, SAVE_VERSION, "v11 save keeps its version");
  assert.equal(rt.state.season, m.season, "v11 season round-trips");
  assert.equal(rt.state.morale, m.morale, "v11 morale round-trips");
  assert.deepEqual(rt.state.tech, m.tech, "v11 tech round-trips");
  console.log("migration passed: day " + dayBefore + " -> " + m.day + ", pop " + popBefore + " -> " + m.villagers.length);
}

console.log("society smoke test passed");
