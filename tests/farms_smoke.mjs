// Phase 3 smoke: farm dispersion. New beds spread across the four farm
// districts (west + N/E/S satellites), keep a minimum 7-cell Chebyshev
// separation from every other bed, never sit on a street, and respect
// the 144-cell cap. Save/load preserves the bed record; an old save
// without farmBeds backfills clusters from its farm cells.
import assert from "node:assert/strict";
import {
  cellAt, deserialize, farmDistrictOf, isPlanStreet, newWorld,
  ownBuildings, serialize, step,
} from "../src/sim.js";

const DAY = 180 * 4;
const MIN_SEP = 7;
const CAP = 144;

function runDays(seed, days) {
  const { state, grid } = newWorld(seed);
  const founding = new Set(state.farmBeds.map((b) => b.join(",")));
  for (let d = 0; d < days; d++) for (let i = 0; i < DAY; i++) step(state, grid, 0.25);
  const added = state.farmBeds.filter((b) => !founding.has(b.join(",")));
  return { state, grid, founding, added };
}

for (const seed of [7, 42]) {
  const { state, grid, added } = runDays(seed, 60);

  // Spread: new beds appear in at least 3 of the 4 districts.
  const districts = new Set(added.map((b) => farmDistrictOf(state, b[0], b[1])));
  assert.ok(!districts.has(null), `seed ${seed}: every added bed sits in a district, got ${[...districts]}`);
  assert.ok(districts.size >= 3, `seed ${seed}: added beds span >=3 districts, got ${[...districts]}`);
  assert.ok(added.length >= 8, `seed ${seed}: expected >=8 added beds, got ${added.length}`);

  // Spacing: every pair involving an added bed keeps the minimum separation.
  const all = state.farmBeds;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i].join(","), b = all[j].join(",");
    const isAdded = added.some((x) => x.join(",") === a || x.join(",") === b);
    if (!isAdded) continue;
    const sep = Math.max(Math.abs(all[i][0] - all[j][0]), Math.abs(all[i][1] - all[j][1]));
    assert.ok(sep >= MIN_SEP, `seed ${seed}: beds ${a} and ${b} only ${sep} apart (< ${MIN_SEP})`);
  }

  // Cap: farm cells never exceed 144.
  assert.ok(state._farmCells.length <= CAP,
    `seed ${seed}: farm cells ${state._farmCells.length} exceed cap ${CAP}`);

  // No farm cell on a road or a planned street.
  for (const [x, z] of state._farmCells) {
    const c = cellAt(grid, x, z);
    assert.ok(!c.road && !isPlanStreet(state, x, z), `seed ${seed}: farm cell ${x},${z} on a street`);
  }

  // Anchoring: at least one satellite district has a farmhouse near a bed.
  const farmhouses = ownBuildings(state).filter((b) => b.type === "farmhouse");
  const anchoredSatellite = [...districts].some((dd) =>
    dd !== "west" && state.farmBeds.some((b) =>
      farmDistrictOf(state, b[0], b[1]) === dd &&
      farmhouses.some((f) => Math.hypot(f.x - b[0], f.z - b[1]) <= 5)));
  assert.ok(anchoredSatellite, `seed ${seed}: no satellite district has a farmhouse near a bed`);

  // Save/load: bed record and farm cells survive a round trip.
  const rt = deserialize(serialize(state, grid));
  assert.equal(rt.state.farmBeds.length, state.farmBeds.length, `seed ${seed}: farmBeds lost on round trip`);
  assert.equal(rt.state._farmCells.length, state._farmCells.length, `seed ${seed}: farm cells lost on round trip`);
  assert.deepEqual(
    rt.state.farmBeds.map((b) => b.join(",")).sort(),
    state.farmBeds.map((b) => b.join(",")).sort(),
    `seed ${seed}: farmBeds changed on round trip`);

  // Backfill: a save with farmBeds stripped rebuilds clusters from cells.
  const saved = JSON.parse(serialize(state, grid));
  delete saved.farmBeds;
  const backfilled = deserialize(JSON.stringify(saved));
  assert.ok(backfilled.state.farmBeds.length > 0, `seed ${seed}: backfill produced no beds`);
  for (const b of backfilled.state.farmBeds) {
    assert.ok(farmDistrictOf(backfilled.state, b[0], b[1]) !== null,
      `seed ${seed}: backfilled bed ${b} outside every district`);
  }
  console.log(`farms seed ${seed}: beds=${state.farmBeds.length} added=${added.length} districts=${[...districts].join(",")} farmCells=${state._farmCells.length} farmhouses=${farmhouses.length}`);
}

console.log("farms_smoke PASS");
