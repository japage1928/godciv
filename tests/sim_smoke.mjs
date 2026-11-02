// Headless smoke test for src/sim.js. Run: npm test  (or: node tests/sim_smoke.mjs)
import assert from "node:assert";
import { newWorld, step, applyGod, serialize, deserialize, SIZE } from "../src/sim.js";

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

console.log("sim smoke test passed: day", state.day, "villagers", state.villagers.length, "log", state.log.length, "entries");
