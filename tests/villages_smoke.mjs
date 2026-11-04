// Neighbor-village smoke test for the v13 Phase F build
// (DEFENSE-AND-MAP-DESIGN.md sections 11 and 13): abstract ticks stay
// bounded, activation/deactivation conserve exactly across cycles,
// trade conserves goods and coins exactly, refusals move nothing,
// robbery sours relations, drift follows the table, envoys discover,
// the leader weighs god suggestions, and the god cannot declare war
// through any path. Run: npm test (or: node tests/villages_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, serialize, deserialize, dispatchCaravan,
  activateVillage, deactivateVillage, abstractVillageTick, dawnVillages,
  applyGod, validateDiplomacyIntent, delegateRoles, getRelation,
  adjustRelation, villageRecord, removeVillager, makeRaider,
  cellAt, PRICES, SIZE, seasonKey,
} from "../src/sim.js";

// A world whose economy cannot move on its own: no villagers, no
// build queue, faith too low for festivals, stores below every
// spoilage cap. Only trade, raids, and the dawn hooks move numbers.
function frozenWorld(seed) {
  const { state, grid } = newWorld(seed);
  state.villagers = [];
  state.buildQueue = [];
  state.fund = 100;
  state.faith = 0;
  state.stockpile = { food: 20, wood: 50, stone: 20, ore: 10, fish: 10, meat: 10 };
  return { state, grid };
}

function stockTotal(state, rec, good) {
  const inCaravans = (state.caravans || []).reduce((a, c) => a + (c.load[good] || 0), 0);
  return state.stockpile[good] + (rec.stockpile[good] || 0) + inCaravans;
}

// Counts maps drop zero-count types: normalize before comparing.
function normCounts(c) {
  const out = {};
  for (const [k, v] of Object.entries(c)) if (v > 0) out[k] = v;
  return out;
}

// --- abstract ticks stay bounded and deterministic ---
{
  const { state } = newWorld(42);
  const rec = state.villages[0];
  for (let i = 0; i < 30; i++) abstractVillageTick(state, rec);
  assert.ok(rec.pop >= 3 && rec.pop <= rec.popCap, "pop stays within [3, cap], got " + rec.pop);
  for (const g of Object.keys(PRICES)) {
    assert.ok(rec.stockpile[g] >= 0 && rec.stockpile[g] <= 200, "stockpile " + g + " stays within [0, 200], got " + rec.stockpile[g]);
  }
  assert.ok(rec.coins >= 0 && rec.coins <= 80, "coins stay within [0, 80], got " + rec.coins);
  assert.ok(rec.techLevel >= 0 && rec.techLevel <= 5, "tech level stays capped, got " + rec.techLevel);
  assert.ok(rec.morale >= 0 && rec.morale <= 100, "morale stays within [0, 100], got " + rec.morale);
  // Starvation floor: an empty village at pop 3 stays at 3, never negative.
  rec.pop = 3;
  for (const g of Object.keys(PRICES)) rec.stockpile[g] = 0;
  for (let i = 0; i < 10; i++) abstractVillageTick(state, rec);
  assert.equal(rec.pop, 3, "a starving village holds its floor of 3");
  for (const g of Object.keys(PRICES)) assert.ok(rec.stockpile[g] >= 0, "no stockpile goes negative, " + g);
  // Determinism: two worlds from one seed tick identically.
  const a = newWorld(42), b = newWorld(42);
  for (let i = 0; i < 30; i++) { abstractVillageTick(a.state, a.state.villages[0]); abstractVillageTick(b.state, b.state.villages[0]); }
  assert.deepEqual(a.state.villages[0], b.state.villages[0], "abstract ticks are deterministic per seed");
  console.log("abstract tick: bounded, floored, deterministic");
}

// --- activation / deactivation conserve exactly, across 3 cycles ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  const pop0 = state.villagers.length, buildings0 = state.buildings.length;
  const stockBefore = { ...rec.stockpile };
  const buildingsBefore = { ...rec.buildings };
  let pop = rec.pop;
  for (let cycle = 0; cycle < 3; cycle++) {
    assert.equal(activateVillage(state, grid, rec), true, "activation succeeds, cycle " + cycle);
    assert.equal(state.villagers.filter((v) => v.village === rec.id).length, pop, "pop villagers materialize, cycle " + cycle);
    const counts = {};
    for (const b of state.buildings.filter((b) => b.village === rec.id)) counts[b.type] = (counts[b.type] || 0) + 1;
    assert.deepEqual(counts, normCounts(buildingsBefore), "building counts materialize exactly, cycle " + cycle);
    assert.deepEqual(rec.stockpile, stockBefore, "the stockpile is untouched by activation, cycle " + cycle);
    // One combat death and one lost building, then back to the record.
    const victim = state.villagers.find((v) => v.village === rec.id);
    const faithBefore = state.faith, deathsBefore = state.stats.deaths;
    removeVillager(state, victim, "test");
    assert.equal(state.faith, faithBefore, "a neighbor's death costs the player no faith");
    assert.equal(state.stats.deaths, deathsBefore, "a neighbor's death is not a player death");
    const lost = state.buildings.find((b) => b.village === rec.id && b.type === "hut")
      || state.buildings.find((b) => b.village === rec.id && b.type === "granary");
    const lostCell = cellAt(grid, lost.x, lost.z);
    lostCell.building = null; lostCell.blocked = false;
    state.buildings = state.buildings.filter((o) => o !== lost);
    buildingsBefore[lost.type] -= 1;
    assert.equal(deactivateVillage(state, grid, rec), true, "deactivation succeeds, cycle " + cycle);
    pop -= 1;
    assert.equal(rec.pop, pop, "pop converts back minus the death, cycle " + cycle);
    assert.deepEqual(normCounts(rec.buildings), normCounts(buildingsBefore), "building counts convert back minus the loss, cycle " + cycle);
    assert.deepEqual(rec.stockpile, stockBefore, "the stockpile converts back exactly, cycle " + cycle);
    assert.equal(state.villagers.filter((v) => v.village === rec.id).length, 0, "no foreign villagers remain, cycle " + cycle);
    assert.equal(state.buildings.filter((b) => b.village === rec.id).length, 0, "no foreign buildings remain, cycle " + cycle);
    assert.equal(state.villagers.length, pop0, "the player's villagers are never touched, cycle " + cycle);
    assert.equal(state.buildings.length, buildings0, "the player's buildings are never touched, cycle " + cycle);
  }
  assert.equal(deactivateVillage(state, grid, null), false, "deactivation with no record refuses");
  assert.equal(deactivateVillage(state, grid, rec), false, "deactivating a distant village refuses");
  console.log("activation conservation: 3 cycles, exact, player untouched");
}

// --- save/load keeps an active village's identity ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  activateVillage(state, grid, rec);
  const foreignIds = state.villagers.filter((v) => v.village === rec.id).map((v) => v.id).sort();
  const saved = serialize(state, grid);
  const { state: ls } = deserialize(saved);
  const lrec = ls.villages[0];
  assert.equal(lrec.active, true, "an active village loads active");
  assert.equal(lrec.pop, rec.pop, "pop survives save/load");
  assert.deepEqual(lrec.stockpile, rec.stockpile, "stockpile survives save/load");
  assert.deepEqual(ls.villagers.filter((v) => v.village === lrec.id).map((v) => v.id).sort(), foreignIds,
    "foreign villagers survive save/load with their village");
  console.log("save/load: active village identity intact");
}

// --- migration backfill: an early-v5 save gains the Phase F fields ---
{
  const { state, grid } = newWorld(42);
  const saved = JSON.parse(serialize(state, grid));
  for (const rec of saved.villages) {
    for (const f of ["traderDay", "traderSent", "lastEvent", "tradeSeason", "contactSeason", "activeDay", "lastTriggerDay"]) delete rec[f];
  }
  delete saved.pendingEnvoys;
  delete saved.tradeSeasons;
  const { state: ls } = deserialize(JSON.stringify(saved));
  for (const rec of ls.villages) {
    assert.equal(typeof rec.traderDay, "number", "traderDay backfilled");
    assert.equal(rec.traderSent, false, "traderSent backfilled");
    assert.equal(rec.lastEvent, null, "lastEvent backfilled");
    assert.equal(rec.tradeSeason, -1, "tradeSeason backfilled");
    assert.equal(rec.contactSeason, -1, "contactSeason backfilled");
    assert.equal(rec.activeDay, 0, "activeDay backfilled");
    assert.equal(rec.lastTriggerDay, 0, "lastTriggerDay backfilled");
  }
  assert.deepEqual(ls.pendingEnvoys, [], "pendingEnvoys backfilled");
  assert.deepEqual(ls.tradeSeasons, {}, "tradeSeasons backfilled");
  console.log("migration backfill: Phase F fields land on old saves");
}

// --- trade conserves goods and coins exactly, warms relations +2 ---
{
  const { state, grid } = frozenWorld(42);
  const rec = state.villages[0];
  rec.known = true;
  rec.stockpile = { food: 50, wood: 5, stone: 10, ore: 2, fish: 5, meat: 5 };
  rec.coins = 40;
  const res = dispatchCaravan(state, grid, 0, rec.id, { good: "wood", qty: 10 }, { good: "food", qty: 8 });
  assert.equal(res.ok, true, "a fair trade dispatches: " + (res.reason || ""));
  assert.equal(state.stockpile.wood, 40, "goods leave the origin at dispatch");
  assert.equal(state.caravans.length, 1, "one caravan in flight");
  const woodBefore = stockTotal(state, rec, "wood"), foodBefore = stockTotal(state, rec, "food");
  const coinsBefore = state.fund + rec.coins;
  for (let i = 0; i < 3000 && state.caravans.length; i++) step(state, grid, 0.25);
  assert.equal(state.caravans.length, 0, "the caravan comes home");
  assert.equal(stockTotal(state, rec, "wood"), woodBefore, "wood is conserved across the trade");
  assert.equal(stockTotal(state, rec, "food"), foodBefore, "food is conserved across the trade");
  assert.equal(state.fund + rec.coins, coinsBefore, "coins are conserved across the trade");
  assert.equal(rec.stockpile.wood, 15, "the destination gains the delivery");
  assert.equal(rec.stockpile.food, 42, "the destination loses the return goods");
  assert.equal(state.stockpile.food, 28, "the origin gains the return goods");
  assert.equal(state.fund, 94, "the origin pays the 6-coin difference (10 wood @1 vs 8 food @2)");
  assert.equal(rec.coins, 46, "the destination receives the 6 coins");
  assert.equal(getRelation(state, 0, rec.id), 2, "a completed trade warms relations +2");
  assert.equal(rec.tradeSeason, seasonKey(state), "the season's trade is marked");
  assert.ok(state.log.some((e) => e.text.includes("reaches")), "the arrival is logged");
  // Season limit: a second trade this season refuses and moves nothing.
  const woodNow = state.stockpile.wood, foodNow = rec.stockpile.food;
  const refused = dispatchCaravan(state, grid, 0, rec.id, { good: "wood", qty: 5 }, { good: "food", qty: 4 });
  assert.equal(refused.ok, false, "a second trade this season refuses");
  assert.equal(state.stockpile.wood, woodNow, "a refused trade moves no goods");
  assert.equal(rec.stockpile.food, foodNow, "a refused trade moves no goods at the destination");
  assert.equal(state.caravans.length, 0, "a refused trade sends no caravan");
  console.log("trade: exact conservation, +2 relations, season limit holds");
}

// --- refusals: pair busy, cold relations, no path — nothing moves ---
{
  const { state, grid } = frozenWorld(42);
  const rec = state.villages[0];
  rec.known = true;
  const ok = dispatchCaravan(state, grid, 0, rec.id, { good: "wood", qty: 5 }, { good: "food", qty: 4 });
  assert.equal(ok.ok, true, "first dispatch succeeds");
  const busy = dispatchCaravan(state, grid, 0, rec.id, { good: "wood", qty: 5 }, { good: "food", qty: 4 });
  assert.equal(busy.ok, false, "a second caravan for the same pair refuses");
  assert.equal(state.caravans.length, 1, "only the first caravan travels");
  // Cold relations refuse on their own pair, with no caravan in the way.
  const other = state.villages[1];
  adjustRelation(state, 0, other.id, -10);
  const cold = dispatchCaravan(state, grid, other.id, 0, null, null, true);
  assert.equal(cold.ok, false, "cold relations refuse trade");
  assert.ok(/too cold/.test(cold.reason), "the refusal names the cold: " + cold.reason);
  console.log("refusals: pair busy + cold relations hold");
}
{
  // No path: a wall of blocked cells across the whole map refuses
  // the dispatch and moves nothing. Seed 42's sites sit east of the
  // wall (x 240/283), so the wall truly blocks the road.
  const { state, grid } = frozenWorld(42);
  const rec = state.villages[0];
  rec.known = true;
  for (let z = 0; z < SIZE; z++) { const c = cellAt(grid, 130, z); c.blocked = true; c.tree = false; c.water = false; }
  const woodBefore = state.stockpile.wood;
  const res = dispatchCaravan(state, grid, 0, rec.id, { good: "wood", qty: 5 }, { good: "food", qty: 4 });
  assert.equal(res.ok, false, "no path means no trade: " + (res.reason || ""));
  assert.equal(state.stockpile.wood, woodBefore, "a pathless dispatch moves no goods");
  assert.equal(state.caravans.length, 0, "a pathless dispatch sends no caravan");
  console.log("refusals: no path moves nothing");
}

// --- robbery: raiders divert, steal, and sour relations -3 ---
{
  const { state, grid } = frozenWorld(42);
  const rec = state.villages[0];
  rec.known = true;
  rec.stockpile = { food: 50, wood: 5, stone: 10, ore: 2, fish: 5, meat: 5 };
  const res = dispatchCaravan(state, grid, 0, rec.id, { good: "wood", qty: 10 }, { good: "food", qty: 8 });
  assert.equal(res.ok, true, "robbery-test caravan dispatches");
  const c = state.caravans[0];
  state.raidActive = true;
  state.raidUntil = 1e9;
  const raiders = [];
  for (let i = 0; i < 2; i++) {
    const r = makeRaider(state, c.x, c.z);
    r.homeEdge = [Math.round(c.x), Math.round(c.z)];
    state.raiders.push(r);
    raiders.push(r);
  }
  for (let i = 0; i < 200 && state.caravans.length && Object.keys(c.load).length; i++) step(state, grid, 0.25);
  assert.equal(Object.keys(c.load).length, 0, "the caravan is robbed bare");
  assert.equal(c.state, "fleeing", "a robbed caravan flees for home");
  assert.equal(c.robbed, 10, "all 10 goods were robbed from this caravan");
  assert.equal(getRelation(state, 0, rec.id), -3, "robbery sours relations -3");
  assert.ok(state.log.some((e) => e.text.includes("rob the trader bare")), "the robbery is logged");
  console.log("robbery: divert, steal, flee, -3 relations");
}

// --- relations move only through the drift table ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  rec.traderSent = true;
  state._villageSeasonKey = -1;
  adjustRelation(state, 0, rec.id, 5);
  dawnVillages(state, grid);
  assert.equal(getRelation(state, 0, rec.id), 4, "no-contact drift moves 1 per season toward 0");
  state._villageSeasonKey = -1;
  adjustRelation(state, 0, rec.id, -9);
  dawnVillages(state, grid);
  assert.equal(getRelation(state, 0, rec.id), -4, "drift moves toward 0 from below too");
  state._villageSeasonKey = -1;
  setRelationDirect(state, rec, 1);
  dawnVillages(state, grid);
  assert.equal(getRelation(state, 0, rec.id), 0, "drift stops at 0, never crosses it");
  console.log("drift: 1/season toward 0, stops at 0");
}
function setRelationDirect(state, rec, value) {
  rec.relations[0] = value;
}

// --- envoys discover and warm relations +3 ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  assert.equal(rec.known, false, "villages start unknown");
  const res = applyGod(state, grid, "envoy");
  assert.equal(res.ok, true, "an envoy sets out: " + (res.reason || ""));
  assert.equal(state.pendingEnvoys.length, 1, "one envoy on the road");
  const target = villageRecord(state, state.pendingEnvoys[0].to);
  const second = applyGod(state, grid, "envoy");
  assert.equal(second.ok, false, "the envoy has a 5-day cooldown");
  dawnVillages(state, grid);
  assert.equal(target.known, true, "the envoy discovers its village");
  assert.equal(getRelation(state, 0, target.id), 3, "the envoy warms relations +3");
  assert.ok(state.log.some((e) => e.text.includes("welcomes your envoy")), "the envoy arrival is logged");
  // A second envoy goes to the coldest known village.
  state.cooldowns = {};
  const other = state.villages.find((r) => r.id !== target.id);
  other.known = true;
  adjustRelation(state, 0, other.id, -5);
  adjustRelation(state, 0, target.id, 4);
  const res2 = applyGod(state, grid, "envoy");
  assert.equal(res2.ok, true, "a second envoy sets out");
  assert.equal(state.pendingEnvoys[0].to, other.id, "the envoy goes to the coldest known village");
  console.log("envoy: discovery +3, cooldown, coldest-first");
}

// --- the leader weighs god trade suggestions ---
{
  const { state, grid } = frozenWorld(42);
  const rec = state.villages[0];
  rec.known = true;
  rec.stockpile = { food: 50, wood: 5, stone: 10, ore: 2, fish: 5, meat: 5 };
  // Scarce food at home (below the leader's plenty line of 15),
  // surplus wood: the leader should agree.
  state.stockpile.food = 10;
  // The directive's focus job survives a suggestion: the god's
  // proposal is a separate field, not a directive overwrite.
  applyGod(state, grid, "directive", null, null, { focusJob: "farmer" });
  const suggested = applyGod(state, grid, "suggest_trade", null, null,
    { to: rec.id, give: { good: "wood", qty: 10 }, want: { good: "food", qty: 8 } });
  assert.equal(suggested.ok, true, "a well-formed suggestion is carried");
  assert.equal(state.directive.focusJob, "farmer", "the focus directive survives the suggestion");
  delegateRoles(state, grid);
  assert.equal(state.caravans.length, 1, "the leader agrees: surplus wood, scarce food");
  assert.ok(state.log.some((e) => e.text.includes("agrees to the trade")), "the agreement is logged");
  assert.equal(state.directive.suggestTrade, null, "the suggestion clears once weighed");
  console.log("suggest-trade: leader agrees on surplus + deficit");
}
{
  // Refusals, each with the reason in the log.
  const { state, grid } = frozenWorld(42);
  const rec = state.villages[0];
  rec.known = true;
  rec.stockpile = { food: 50, wood: 5, stone: 10, ore: 2, fish: 5, meat: 5 };
  state.stockpile.wood = 5;
  applyGod(state, grid, "suggest_trade", null, null,
    { to: rec.id, give: { good: "wood", qty: 10 }, want: { good: "food", qty: 8 } });
  delegateRoles(state, grid);
  assert.equal(state.caravans.length, 0, "no surplus means no caravan");
  assert.ok(state.log.some((e) => e.text.includes("declines the trade")), "the refusal is logged");
  assert.ok(state.log.some((e) => e.text.includes("cannot spare")), "the refusal names the reason");
  state.stockpile.wood = 50;
  state.stockpile.food = 50;
  state.elapsed += 11; // past the suggestion's 10s cooldown
  applyGod(state, grid, "suggest_trade", null, null,
    { to: rec.id, give: { good: "wood", qty: 10 }, want: { good: "food", qty: 8 } });
  delegateRoles(state, grid);
  assert.equal(state.caravans.length, 0, "plenty of the wanted good means no caravan");
  assert.ok(state.log.some((e) => e.text.includes("enough food")), "the refusal names the plenty");
  // Unknown village and over-capacity offers never reach the leader.
  const unknown = applyGod(state, grid, "suggest_trade", null, null,
    { to: 99, give: { good: "wood", qty: 5 }, want: { good: "food", qty: 5 } });
  assert.equal(unknown.ok, false, "suggestions go only to villages met");
  const over = applyGod(state, grid, "suggest_trade", null, null,
    { to: rec.id, give: { good: "wood", qty: 100 }, want: { good: "food", qty: 5 } });
  assert.equal(over.ok, false, "an over-capacity offer refuses at the gate");
  console.log("suggest-trade: refusals carry reasons");
}

// --- the god cannot declare war through any path ---
{
  const { state, grid } = newWorld(42);
  const war = applyGod(state, grid, "declare_war");
  assert.equal(war.ok, false, "applyGod refuses declare_war");
  assert.ok(/cannot declare war/i.test(war.reason), "the refusal says so: " + war.reason);
  const intent = validateDiplomacyIntent(state, { kind: "declare_war", to: 1 });
  assert.equal(intent.ok, false, "intent validation refuses declare_war");
  const move = validateDiplomacyIntent(state, { kind: "relation_move", to: 1, delta: 10 });
  assert.equal(move.ok, false, "relation moves go only to villages met");
  assert.ok(/met/.test(move.reason), "the refusal says so: " + move.reason);
  const rec0 = state.villages[0];
  rec0.known = true;
  const noMove = validateDiplomacyIntent(state, { kind: "relation_move", to: rec0.id, delta: 10 });
  assert.equal(noMove.ok, false, "a relation move without a named move refuses");
  assert.ok(/Unknown relation move/.test(noMove.reason), "the refusal names the valid moves: " + noMove.reason);
  rec0.known = false; // the stranger check below needs an unmet village
  const weird = validateDiplomacyIntent(state, { kind: "annex", to: 1 });
  assert.equal(weird.ok, false, "unknown intents refuse");
  const rec = state.villages[0];
  const stranger = validateDiplomacyIntent(state, { kind: "trade_offer", to: rec.id, give: { good: "wood", qty: 5 }, want: { good: "food", qty: 5 } });
  assert.equal(stranger.ok, false, "trade offers go only to villages met");
  rec.known = true;
  const fair = validateDiplomacyIntent(state, { kind: "trade_offer", to: rec.id, give: { good: "wood", qty: 5 }, want: { good: "food", qty: 5 } });
  assert.equal(fair.ok, true, "a fair offer to a known village validates");
  const envoy = validateDiplomacyIntent(state, { kind: "envoy", to: rec.id });
  assert.equal(envoy.ok, true, "an envoy intent validates");
  console.log("god-cannot-declare-war: every path refuses");
}

// --- foreign villagers keep their own hours: no hunger, no delegation ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  activateVillage(state, grid, rec);
  const foreign = state.villagers.filter((v) => v.village === rec.id);
  const hungerBefore = foreign.map((v) => v.hunger);
  for (let i = 0; i < 100; i++) step(state, grid, 0.25);
  const foreignAfter = state.villagers.filter((v) => v.village === rec.id);
  assert.equal(foreignAfter.length, foreign.length, "no foreign villager is born or dies on the player's clock");
  assert.deepEqual(foreignAfter.map((v) => v.hunger), hungerBefore, "foreign hunger never moves");
  assert.ok(foreignAfter.every((v) => v.assignedJob == null), "no foreign villager is delegated");
  assert.ok(foreignAfter.every((v) => v.job !== "guard"), "no foreign villager takes a guard post");
  console.log("foreign villagers: own hours, no hunger, no delegation");
}

// --- visit: walking there stirs and discovers, idempotently ---
{
  const { state, grid } = newWorld(42);
  const rec = state.villages[0];
  const nowhere = applyGod(state, grid, "visit", 24, 24);
  assert.equal(nowhere.ok, false, "visiting the home village finds no neighbor");
  const res = applyGod(state, grid, "visit", rec.center[0], rec.center[1]);
  assert.equal(res.ok, true, "visiting a neighbor's center stirs it");
  assert.equal(rec.known, true, "walking there discovers the village");
  assert.equal(rec.active, true, "walking there activates the village");
  const again = applyGod(state, grid, "visit", rec.center[0], rec.center[1]);
  assert.equal(again.ok, true, "a repeat visit is a harmless refresh");
  console.log("visit: stir + discover, idempotent");
}

console.log("villages_smoke: all checks passed");
