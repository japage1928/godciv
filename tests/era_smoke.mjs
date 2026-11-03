// Era smoke test for v12: tech tiers, thresholds, population gates,
// era stages the renderer reads, and the long-game pacing (a 30-day
// run reaches the first tiers, never the modern city).
// Run: npm test  (or: node tests/era_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, makeVillager, TECH_TIERS, techThresholdFor, ERA_POP_GATE,
  eraStageOf, ERA_STAGE_NAMES, canAfford,
} from "../src/sim.js";

const STEPS_PER_DAY = 180 * 4;
function runDays(state, grid, days) {
  for (let i = 0; i < days * STEPS_PER_DAY; i++) step(state, grid, 0.25);
}

// --- the tier list itself: plain names, hamlet to modern city ---
assert.deepEqual(
  TECH_TIERS.map((t) => t.name),
  ["Stone tools", "Bronze craft", "Iron craft", "Steel works", "Steam and brick", "Electric age", "Modern city"],
  "tech tiers must run Stone tools to Modern city"
);
assert.deepEqual(
  TECH_TIERS.map((t) => t.era),
  ["Hamlet", "Hamlet", "Village", "Town", "Town", "City", "Modern city"],
  "tier eras must run Hamlet to Modern city"
);
assert.deepEqual([0, 1, 2, 3, 4, 5].map(techThresholdFor), [80, 120, 200, 300, 420, 560], "thresholds must rise steeply");
assert.deepEqual(ERA_POP_GATE, [0, 0, 0, 14, 20, 26, 32], "population gates must guard the later tiers");
assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(eraStageOf), [0, 0, 1, 2, 2, 3, 3], "era stages must group tiers into 4 visual stages");
assert.deepEqual(ERA_STAGE_NAMES, ["Timber hamlet", "Stone village", "Brick town", "Modern city"], "era stage names must match the renderer");

// --- granting progress advances the era, stage by stage ---
{
  const { state, grid } = newWorld(5);
  assert.equal(state.tech.level, 0, "a new world starts at Stone tools");
  assert.equal(eraStageOf(state.tech.level), 0, "a new world renders as a timber hamlet");
  state.tech.progress = techThresholdFor(0) - 1;
  runDays(state, grid, 1);
  assert.equal(state.tech.level, 1, "progress past the threshold must unlock Bronze craft, level=" + state.tech.level);
  assert.equal(TECH_TIERS[state.tech.level].name, "Bronze craft");
  state.tech.progress = techThresholdFor(1) - 1;
  runDays(state, grid, 1);
  assert.equal(state.tech.level, 2, "a second threshold must unlock Iron craft");
  assert.equal(eraStageOf(state.tech.level), 1, "Iron craft must render as the stone village stage");
  // Population gate: Steel works needs 14 villagers. Six founders
  // cannot unlock it no matter how much progress they bank.
  state.tech.progress = techThresholdFor(2) - 1;
  runDays(state, grid, 1);
  assert.equal(state.tech.level, 2, "the population gate must hold Steel works at 6 villagers, level=" + state.tech.level);
  for (let i = 0; i < 8 && state.villagers.length < 14; i++) state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1));
  assert.ok(state.villagers.length >= 14, "the village must now meet the gate, pop=" + state.villagers.length);
  runDays(state, grid, 1);
  assert.equal(state.tech.level, 3, "meeting the gate must unlock Steel works");
  assert.equal(eraStageOf(state.tech.level), 2, "Steel works must render as the brick town stage");
  assert.ok(state.log.some((e) => /Steel works/.test(e.text)), "the unlock must be logged");
  console.log("era advance: Stone -> Bronze -> Iron -> Steel, gates hold, stage 0 -> 1 -> 2");
  // Regression: the healer demand at Iron craft once crashed canAfford
  // (no BUILD_COSTS entry). It must be priced, and an unpriced type
  // must answer false, never throw.
  {
    const { state: s2 } = newWorld(5);
    assert.equal(typeof canAfford(s2, "healer"), "boolean", "healer must have a price answer");
    assert.equal(canAfford(s2, "no-such-building"), false, "an unpriced type must be unaffordable, not a crash");
  }
}

// --- the modern era is a long-term goal, not a 30-day one ---
// Progress caps at 12 per dawn, so the full climb needs at least
// (80+120+200+300+420+560)/12 = 140 dawns of maximum progress.
{
  for (const seed of [7, 42, 1234, 999]) {
    const { state, grid } = newWorld(seed);
    runDays(state, grid, 30);
    assert.ok(state.tech.level >= 1, "a 30-day run should reach at least Bronze craft, seed " + seed + " level=" + state.tech.level);
    assert.ok(state.tech.level <= 3, "a 30-day run must not race to the modern city, seed " + seed + " level=" + state.tech.level);
    assert.ok(state.tech.level < 6, "the modern city must stay out of reach in 30 days, seed " + seed);
  }
  console.log("30-day runs reach the first tiers only; the modern city stays long-term");
}

console.log("era_smoke: all checks passed");
