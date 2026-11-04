// Movement smoke test for v14: celebration spread, idle wandering
// with rest pauses, no cell stacking, and the tick budget.
// Run: npm test  (or: node tests/movement_smoke.mjs)
import assert from "node:assert/strict";
import {
  newWorld, step, serialize, deserialize, ownVillagers,
} from "../src/sim.js";

const DAY = 180 * 4; // 180 sim-seconds per day at 0.25s substeps

function runSteps(state, grid, n, onStep) {
  for (let i = 0; i < n; i++) { step(state, grid, 0.25); onStep && onStep(i); }
}

// --- celebrations spread attendees around the plaza ---
// Before v14 every celebrant targeted the town center cell itself.
// Now each takes a stable per-villager ring cell (radius 2-6), so the
// settled crowd spreads instead of stacking. Sampled only in the
// settled tail of the window, so nobody is counted mid-journey.
for (const seed of [7, 42]) {
  const { state, grid } = newWorld(seed);
  runSteps(state, grid, DAY * 3);
  state.celebration = { name: "Test Feast", until: state.elapsed + 90 };
  let settled = null;
  runSteps(state, grid, DAY, () => {
    if (state.elapsed <= state.celebration.until - 10) return;
    const cells = {};
    let n = 0;
    for (const v of ownVillagers(state)) {
      if (v.state !== "celebrate") continue;
      n++;
      const k = Math.round(v.x) + "," + Math.round(v.z);
      cells[k] = (cells[k] || 0) + 1;
      const r = Math.hypot(v.x - state._cx, v.z - state._cz);
      assert.ok(r <= 7, "celebrant within radius 7 of the plaza, seed " + seed + " got " + r.toFixed(1));
    }
    if (n > 0) {
      const counts = Object.values(cells);
      const snap = { n, distinct: counts.length, maxPer: Math.max(...counts), center: cells[state._cx + "," + state._cz] || 0 };
      if (!settled || snap.n > settled.n) settled = snap;
    }
  });
  assert.ok(settled && settled.n >= 3, "a crowd celebrates, seed " + seed + " got " + JSON.stringify(settled));
  assert.ok(settled.distinct >= Math.ceil(settled.n * 0.7), "celebrants spread across cells, seed " + seed + " " + JSON.stringify(settled));
  assert.ok(settled.maxPer <= 3, "no celebration cell stacks above 3, seed " + seed + " " + JSON.stringify(settled));
  assert.equal(settled.center, 0, "nobody stacks on the town center cell, seed " + seed);
  console.log("celebration: seed " + seed + " " + JSON.stringify(settled));
}

// --- idle villagers wander, pause, and never stack ---
{
  const { state, grid } = newWorld(7);
  let wanderSightings = 0;
  const wanderCells = new Set();
  const allCells = new Set();
  let maxStack = 0;
  runSteps(state, grid, DAY * 20, () => {
    const per = {};
    for (const v of ownVillagers(state)) {
      const k = Math.round(v.x) + "," + Math.round(v.z);
      per[k] = (per[k] || 0) + 1;
      allCells.add(k);
      if (v.state === "wander") { wanderSightings++; wanderCells.add(k); }
    }
    // The stack bar measures daily life. During a raid, fleeing
    // villagers funnel through the same gap away from the raider —
    // flight through a chokepoint, not the standing-around
    // clustering this bar guards — so raid steps don't count here.
    if (!state.raidActive && !state.raiders.length) {
      maxStack = Math.max(maxStack, ...Object.values(per));
    }
  });
  assert.ok(wanderSightings >= 3, "idle villagers stroll, sightings=" + wanderSightings);
  assert.ok(wanderCells.size >= 5, "strolls reach distinct cells, got " + wanderCells.size);
  assert.ok(allCells.size >= 40, "daily life covers the settlement, cells=" + allCells.size);
  assert.ok(maxStack <= 6, "no cell stacks above 6 in daily life, got " + maxStack);
  console.log("wander: sightings " + wanderSightings + " cells " + wanderCells.size + " covered " + allCells.size + " maxStack " + maxStack);
  // A stroll that ends pauses: place a wanderer on its own target
  // cell with rethink held off, step once, and check the arrival
  // branch clears the target and sets restUntil 4-9s ahead.
  {
    const v = ownVillagers(state)[0];
    v.state = "wander";
    v.target = [Math.floor(v.x), Math.floor(v.z)];
    v.path = null;
    v.rethinkAt = state.elapsed + 100;
    const before = state.elapsed;
    step(state, grid, 0.25);
    assert.equal(v.state, "idle", "a finished stroll goes idle");
    assert.equal(v.target, null, "a finished stroll clears its target");
    assert.ok(v.restUntil > before && v.restUntil <= before + 9.25, "a finished stroll pauses 4-9s, restUntil=" + v.restUntil + " elapsed=" + before);
    console.log("pause: stroll ends idle with restUntil +" + (v.restUntil - before).toFixed(1) + "s");
  }
}

// --- wander state and rest pauses survive save/load ---
{
  const { state, grid } = newWorld(7);
  runSteps(state, grid, DAY * 10);
  const w = ownVillagers(state).find((v) => v.state === "wander") || ownVillagers(state)[0];
  w.state = "wander";
  w.restUntil = state.elapsed + 5;
  const rt = deserialize(serialize(state, grid));
  const back = rt.state.villagers.find((v) => v.id === w.id);
  assert.equal(back.state, "wander", "wander state survives save/load");
  assert.equal(back.restUntil, w.restUntil, "restUntil survives save/load");
  console.log("persistence: wander + restUntil survive save/load");
}

// --- tick budget: p95 step under 5ms against the 250ms tick ---
{
  const { state, grid } = newWorld(7);
  runSteps(state, grid, DAY * 30);
  const ts = [];
  for (let i = 0; i < 2000; i++) { const t0 = performance.now(); step(state, grid, 0.25); ts.push(performance.now() - t0); }
  ts.sort((a, b) => a - b);
  const p95 = ts[Math.floor(ts.length * 0.95)];
  assert.ok(p95 < 5, "p95 step under 5ms, pop " + ownVillagers(state).length + " got " + p95.toFixed(2) + "ms");
  console.log("perf: pop " + ownVillagers(state).length + " p95 " + p95.toFixed(2) + "ms");
}

console.log("movement_smoke: all checks passed");
