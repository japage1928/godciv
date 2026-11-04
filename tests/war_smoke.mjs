// War smoke tests — Phase H: rivalry, declaration gating, war parties,
// loot conservation, exhaustion, peace, white peace, betrayal.
import assert from "node:assert/strict";
import {
  newWorld, step, setRelation, discoverVillage, formAlliance, allied,
  validateDiplomacyIntent, declareWar, warWith, villageRecord, villagePop,
  ownVillagers, stockpileFor, applyGod, serialize, deserialize,
} from "../src/sim.js";

const DAY = 180 * 4;

function warWorld(seed = 42) {
  const { state, grid } = newWorld(seed);
  const a = state.villages[0], b = state.villages[1];
  discoverVillage(state, a, "test");
  discoverVillage(state, b, "test");
  return { state, grid, a, b };
}
function runDays(state, grid, n) {
  for (let i = 0; i < DAY * n; i++) step(state, grid, 0.25);
}
function pairKey(a, b) { return a < b ? a + "-" + b : b + "-" + a; }
function centerOf(state, id) {
  if (id === 0) return [state._cx, state._cz];
  return villageRecord(state, id).center;
}

// --- declaration gating ---
{
  const { state, grid, a } = warWorld();
  const cold = validateDiplomacyIntent(state, { kind: "declare_war", to: a.id });
  assert.equal(cold.ok, false, "war needs relations at -70 or worse");
  setRelation(state, 0, a.id, -65);
  const rival = validateDiplomacyIntent(state, { kind: "declare_war", to: a.id });
  assert.equal(rival.ok, false, "rivalry (-65) is not enough to declare war");
  setRelation(state, 0, a.id, -70);
  const hot = validateDiplomacyIntent(state, { kind: "declare_war", to: a.id });
  assert.equal(hot.ok, true, "at -70 the intent validates: " + (hot.reason || "ok"));
  console.log("gating: -65 refuses, -70 validates");
}

// --- a leader declares war at dawn when relations crater ---
{
  const { state, grid, a } = warWorld();
  setRelation(state, 0, a.id, -75);
  runDays(state, grid, 1);
  const war = warWith(state, 0, a.id);
  assert.ok(war, "a war record exists after the dawn decision");
  assert.equal(state.warParties.length, 1, "one war party marches");
  const party = state.warParties[0];
  assert.ok(party.size >= 3 && party.size <= 6, "party is 3-6 fighters: " + party.size);
  const fighters = state.villagers.filter((v) => v.warParty === party.id);
  assert.equal(fighters.length, party.size, "every fighter is flagged");
  assert.ok(state.log.some((l) => /declares war/.test(l.text)), "the declaration is logged");
  console.log("declaration: dawn decision spawns a 3-6 fighter party");
}

// --- combat: kills cost relations -8 and exhaustion +2; loot claims cap at 20 ---
{
  const { state, grid, a } = warWorld();
  setRelation(state, 0, a.id, -75);
  runDays(state, grid, 1);
  const party = state.warParties[0];
  const [tcx, tcz] = centerOf(state, party.to);
  // March the party to the target center, then let it fight.
  const fighters = state.villagers.filter((v) => v.warParty === party.id);
  const relBefore = state.villages[0].relations[0];
  for (const f of fighters) { f.x = tcx + 1; f.z = tcz + 1; f.target = null; f.path = null; }
  for (let i = 0; i < DAY * 2; i++) step(state, grid, 0.25);
  const war = warWith(state, 0, a.id);
  assert.ok(war.exhaustion > 0, "combat raises exhaustion: " + war.exhaustion);
  const relAfter = state.villages[0].relations[0];
  assert.ok(relAfter <= relBefore - 8, "war-party kills cost -8 relations: " + relBefore + " -> " + relAfter);
  assert.ok(party.load > 0 && party.load <= 20, "loot claims grow and cap at 20: " + party.load);
  console.log("combat: kills cost relations and exhaustion, loot claims capped");
}

// --- loot transfers only when the party arrives home alive ---
// Neighbor-vs-neighbor war: both stockpiles are frozen record
// piles (no live economy moves them), so conservation is exact.
// Caravans are held off so no trade moves the piles mid-test.
{
  const { state, grid, a, b } = warWorld();
  a.traderSent = true; b.traderSent = true;
  setRelation(state, a.id, b.id, -75);
  runDays(state, grid, 1);
  assert.ok(state.wars[0], "the neighbors go to war");
  const party = state.warParties[0];
  assert.ok(party, "a war party marches");
  const [tcx, tcz] = centerOf(state, party.to);
  const fighters = state.villagers.filter((v) => v.warParty === party.id);
  for (const f of fighters) { f.x = tcx + 1; f.z = tcz + 1; f.target = null; f.path = null; }
  const pileAtClaimStart = { ...stockpileFor(state, party.to) };
  // Short window: claims tick, but the party cannot walk home
  // (200+ cells) before the snapshot below.
  for (let i = 0; i < 300; i++) step(state, grid, 0.25);
  assert.ok(party.load > 0, "the party claimed loot: " + party.load);
  assert.deepEqual(stockpileFor(state, party.to), pileAtClaimStart, "claims do not deduct: goods leave only on arrival home");
  const claimed = { ...party.loot };
  const defBefore = { ...stockpileFor(state, party.to) };
  const homeBefore = { ...stockpileFor(state, party.from) };
  // Send the laden party home: retreat, teleport near home, let it arrive.
  party.retreating = true;
  const [hx, hz] = centerOf(state, party.from);
  for (const f of state.villagers.filter((v) => v.warParty === party.id)) {
    f.x = hx + 1; f.z = hz + 1; f.target = null; f.path = null;
  }
  for (let i = 0; i < DAY; i++) step(state, grid, 0.25);
  assert.equal(state.warParties.length, 0, "the party stands down on arrival");
  for (const [good, qty] of Object.entries(claimed)) {
    const moved = Math.min(qty, defBefore[good] || 0);
    assert.equal((stockpileFor(state, party.from)[good] || 0) - (homeBefore[good] || 0), moved,
      good + " moved home: " + moved);
    assert.equal((stockpileFor(state, party.to)[good] || 0), (defBefore[good] || 0) - moved,
      good + " left the defender: " + moved);
  }
  assert.ok(!state.villagers.some((v) => v.warParty), "no fighter flags remain");
  console.log("loot: transfers only on arrival home alive, exact conservation");
}

// --- exhaustion peace: offer at 10, accepted next dawn, -10 + truce ---
{
  const { state, grid, a } = warWorld();
  setRelation(state, 0, a.id, -75);
  runDays(state, grid, 1);
  const war = warWith(state, 0, a.id);
  war.exhaustion = 10;
  runDays(state, grid, 1);
  assert.ok(war.peaceOffer, "a peace offer is made at exhaustion 10");
  runDays(state, grid, 1);
  assert.equal(warWith(state, 0, a.id), null, "the war ends on accepted peace");
  assert.equal(state.villages[0].relations[0], -10, "peace sets relations to -10");
  assert.ok(state.truces[pairKey(0, a.id)] > state.day, "a 30-day truce is set");
  const blocked = validateDiplomacyIntent(state, { kind: "declare_war", to: a.id });
  assert.equal(blocked.ok, false, "the truce blocks a new war");
  console.log("peace: offer, acceptance, -10, 30-day truce");
}

// --- white peace: 30 days without battle ends the war ---
{
  const { state, grid, a } = warWorld();
  setRelation(state, 0, a.id, -75);
  runDays(state, grid, 1);
  const war = warWith(state, 0, a.id);
  war.lastBattleDay = state.day - 31;
  // Keep the party far from battle so no new fight resets the clock.
  runDays(state, grid, 1);
  assert.equal(warWith(state, 0, a.id), null, "white peace ends a quiet war");
  assert.equal(state.villages[0].relations[0], -10, "white peace sets relations to -10");
  assert.ok(state.log.some((l) => /white peace/i.test(l.text)), "white peace is logged");
  console.log("white peace: 30 quiet days end the war at -10");
}

// --- betrayal: declaring on a current ally breaks it and sets -40 ---
{
  const { state, grid, a } = warWorld();
  setRelation(state, 0, a.id, 65);
  formAlliance(state, 0, a.id);
  assert.ok(allied(state, 0, a.id), "allied before the betrayal");
  declareWar(state, grid, 0, a.id);
  assert.ok(!allied(state, 0, a.id), "the alliance breaks on betrayal");
  assert.equal(state.villages[0].relations[0], -40, "betrayal sets relations to -40");
  assert.ok(warWith(state, 0, a.id), "the betrayal starts a war");
  assert.ok(state.log.some((l) => /betrayal/i.test(l.text)), "the betrayal is logged");
  console.log("betrayal: ally broken, relations -40, war declared");
}

// --- rivalry: trade stops, at most one border incident per season ---
{
  const { state, grid, a } = warWorld();
  setRelation(state, 0, a.id, -45);
  const offer = validateDiplomacyIntent(state, { kind: "trade_offer", to: a.id, give: { good: "wood", qty: 5 }, want: { good: "food", qty: 5 } });
  assert.equal(offer.ok, false, "trade stops at rivalry");
  // Border incidents are capped at one per season: count the flags,
  // not the rolling log (newest-first, capped at 60 lines).
  for (let d = 0; d < 14; d++) runDays(state, grid, 1);
  const incidents = Object.keys(state.borderIncidents).length;
  assert.ok(incidents >= 1 && incidents <= 2, "1-2 border incidents over two seasons: " + incidents);
  console.log("rivalry: trade stops, border incidents capped at one per season");
}

// --- the god still cannot declare war; no-wipe fairness; war survives save/load ---
{
  const { state, grid } = newWorld(42);
  const no = applyGod(state, grid, "declare_war");
  assert.equal(no.ok, false, "applyGod still refuses declare_war");
  const { state: s2, grid: g2, a } = warWorld(7);
  setRelation(s2, 0, a.id, -75);
  runDays(s2, g2, 10);
  assert.ok(villagePop(s2, s2.villages[0]) >= 3, "the neighbor survives a 10-day war");
  assert.ok(ownVillagers(s2).length >= 3, "the player's village survives a 10-day war");
  const back = deserialize(serialize(s2, g2));
  assert.ok(warWith(back.state, 0, a.id), "the war survives save/load");
  assert.equal(back.state.warParties.length, s2.warParties.length, "war parties survive save/load");
  console.log("god-cannot-declare-war, no-wipe fairness, war persists across save/load");
}

console.log("war_smoke: all checks passed");
