// Plague smoke test for v12: the Plague god action fires, is
// cooldown-gated, sickens a share of the village, kills only the
// already weak, and passes without a death spiral.
// Run: npm test  (or: node tests/plague_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, makeVillager, applyGod, godCooldown,
} from "../src/sim.js";

const STEPS_PER_DAY = 180 * 4;
// Drain-count deaths as the run goes: the god log caps at 60 lines,
// so a cause counted only at the end would miss deaths that scrolled off.
// Also watches for the recovery line, which scrolls off the same way.
function runDaysCounted(state, grid, days, cause) {
  let deaths = 0, sawRecovery = false;
  const total = days * STEPS_PER_DAY;
  for (let i = 0; i < total; i++) {
    step(state, grid, 0.25);
    if (i % 180 === 0) {
      for (const l of state.log) {
        if (new RegExp("dies \\(" + cause + "\\)").test(l.text || "")) deaths++;
        if (/sickness passes/.test(l.text || "")) sawRecovery = true;
      }
      state.log.length = 0;
    }
  }
  for (const l of state.log) {
    if (new RegExp("dies \\(" + cause + "\\)").test(l.text || "")) deaths++;
    if (/sickness passes/.test(l.text || "")) sawRecovery = true;
  }
  return { deaths, sawRecovery };
}
function runDays(state, grid, days) {
  for (let i = 0; i < days * STEPS_PER_DAY; i++) step(state, grid, 0.25);
}

const { state, grid } = newWorld(7);
// A 20-soul village: at 40% each, at least one falling ill is near
// certain, and the weak-only death rule has room to show.
while (state.villagers.length < 20) {
  state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 20, coins: 0 }));
}
const popBefore = state.villagers.length;
const faithBefore = state.faith;

// --- the action fires and is cooldown-gated ---
const first = applyGod(state, grid, "plague");
assert.equal(first.ok, true, "plague must fire, got " + JSON.stringify(first));
assert.ok(state.effects.plagueUntil > state.elapsed, "the plague wave must be timed");
assert.equal(state.stats.plagues, 1, "the plague counter must increment");
assert.ok(state.faith < faithBefore, "plague must cost faith");
assert.equal(godCooldown(state, "plague"), 60, "plague cooldown must be 60s");
const second = applyGod(state, grid, "plague");
assert.equal(second.ok, false, "a second plague during cooldown must be refused");
assert.ok(/Wait/.test(second.reason), "the refusal must name the wait, got " + second.reason);
assert.equal(state.stats.plagues, 1, "a refused plague must not count twice");
const sickNow = state.villagers.filter((v) => v.sick).length;
assert.ok(sickNow >= 1, "at least one villager must fall ill, sick=" + sickNow + "/20");
assert.ok(sickNow < popBefore, "not the whole village at once, sick=" + sickNow + "/20");
assert.ok(state.log.some((e) => /Plague spreads/.test(e.text)), "the plague must be logged");
console.log("plague fires: " + sickNow + "/20 ill, cooldown 60s, second cast refused");

// --- 10 days: the wave passes, the village does not spiral ---
const counted = runDaysCounted(state, grid, 10, "sickness");
const plagueDeaths = counted.deaths;
assert.ok(state.effects.plagueUntil < state.elapsed, "the plague wave must end");
assert.equal(state.villagers.filter((v) => v.sick).length, 0, "everyone must recover after the wave");
assert.ok(counted.sawRecovery, "the recovery must be logged");
assert.ok(plagueDeaths <= 2, "plague must kill only a few of the weak, sickness deaths=" + plagueDeaths);
assert.ok(state.villagers.length >= popBefore - 3, "no death spiral: pop " + popBefore + " -> " + state.villagers.length);
console.log("10 days later: pop " + popBefore + " -> " + state.villagers.length + ", sickness deaths " + plagueDeaths);

// --- after the cooldown, plague can fire again ---
runDays(state, grid, 1);
assert.equal(godCooldown(state, "plague"), 0, "the cooldown must expire");
const third = applyGod(state, grid, "plague");
assert.equal(third.ok, true, "plague must fire again after cooldown");
assert.equal(state.stats.plagues, 2, "the counter must reach 2");

console.log("plague_smoke: all checks passed");
