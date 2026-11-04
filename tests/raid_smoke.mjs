// Raid smoke test for v12: raiders spawn and resolve, walls block
// pathing, towers can kill, a walled village loses less than an
// identical unwalled one, and a mid-raid save loads with no raiders.
// Run: npm test  (or: node tests/raid_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, serialize, deserialize, findPath, spawnRaid, makeRaider,
  SIZE, WALL_RING_R, cellAt, delegateRoles, applyGod, godCooldown,
  callToArms, guardPosts, assignGuardPosts, towerManned, defenseSummary,
} from "../src/sim.js";

const STEPS_PER_DAY = 180 * 4;

function runSeconds(state, grid, seconds) {
  for (let i = 0; i < seconds * 4; i++) step(state, grid, 0.25);
}

// --- (a) a raid spawns by direct call and resolves, village alive ---
{
  const { state, grid } = newWorld(42);
  state.day = 15;
  const spawned = spawnRaid(state, grid, 3);
  assert.equal(spawned.length, 3, "spawnRaid(3) must spawn 3 raiders");
  assert.equal(state.raiders.length, 3, "raiders must be live after spawn");
  assert.equal(state.raidActive, true, "raid must be active after spawn");
  assert.ok(state.log.some((e) => /Raiders attack/.test(e.text)), "raid must be telegraphed in the log");
  const popBefore = state.villagers.length;
  runSeconds(state, grid, 200);
  assert.equal(state.raidActive, false, "raid must resolve within 200s");
  assert.equal(state.raiders.length, 0, "no raiders left after resolution");
  assert.ok(state.villagers.length >= 4, "village must survive the raid, pop=" + state.villagers.length + " (was " + popBefore + ")");
  assert.ok(state.lastRaidDay >= 15, "lastRaidDay must be set after resolution");
  console.log("raid resolves: pop " + popBefore + " -> " + state.villagers.length + ", lastRaidDay " + state.lastRaidDay);
}

// --- (b) walls block pathing: no route across a closed wall line ---
{
  const { grid } = newWorld(7);
  for (let z = 0; z < 48; z++) cellAt(grid, 20, z).blocked = true;
  const blocked = findPath(grid, 1, 24, 40, 24);
  assert.equal(blocked, null, "no path may cross a closed wall line");
  cellAt(grid, 20, 24).blocked = false; // the gate
  const open = findPath(grid, 1, 24, 40, 24);
  assert.ok(open && open.length > 0, "a path must exist through the gate");
  assert.ok(open.some(([x, z]) => x === 20 && z === 24), "the path must use the gate cell, got " + JSON.stringify(open.slice(0, 4)));
  console.log("wall line blocks pathing; gate cell restores the route");
}

// --- (b2) a raider batters a wall down, given time and no towers ---
{
  const { state, grid } = newWorld(7);
  cellAt(grid, 20, 5).building = "wall";
  cellAt(grid, 20, 5).blocked = true;
  state.buildings.push({ type: "wall", x: 20, z: 5, hp: 30, maxHp: 30, done: true, builtDay: 1 });
  const r = makeRaider(state, 19.5, 5.5);
  state.raiders.push(r);
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0 };
  runSeconds(state, grid, 12);
  assert.equal(cellAt(grid, 20, 5).building, null, "the wall cell must be cleared after battering");
  assert.ok(!state.buildings.some((b) => b.type === "wall" && b.x === 20 && b.z === 5), "the wall building must be gone");
  assert.ok(state.log.some((e) => /break through the wall/.test(e.text)), "the breakthrough must be logged");
  console.log("raider breaks through an undefended wall");
}

// --- (b3a) an UNMANNED tower never shoots ---
{
  const { state, grid } = newWorld(7);
  state.delegateAt = Infinity; // isolate the tower rule from delegation
  cellAt(grid, 24, 24).building = "tower";
  cellAt(grid, 24, 24).blocked = true;
  state.buildings.push({ type: "tower", x: 24, z: 24, hp: 60, maxHp: 60, done: true, builtDay: 1 });
  const r = makeRaider(state, 24.5, 25.5);
  r.hp = 8; // above the 35% flee threshold: the raider stays and fights
  state.raiders.push(r);
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0, guardKills: 0, towerKills: 0, breaches: 0 };
  runSeconds(state, grid, 3);
  assert.equal(state.raiders.length, 1, "an unmanned tower must never shoot");
  assert.equal(r.hp, 8, "an unmanned tower must deal no damage");
  assert.ok(!state.log.some((e) => /tower fells a raider/.test(e.text)), "no tower kill may be logged without a guard");
  console.log("unmanned tower never shoots");
}

// --- (b3b) a MANNED tower kills a raider ---
{
  const { state, grid } = newWorld(7);
  state.delegateAt = Infinity; // isolate the tower rule from delegation
  cellAt(grid, 24, 24).building = "tower";
  cellAt(grid, 24, 24).blocked = true;
  state.buildings.push({ type: "tower", x: 24, z: 24, hp: 60, maxHp: 60, done: true, builtDay: 1 });
  const g = state.villagers[0];
  g.assignedJob = "guard"; g.job = "guard"; g.traits = ["brave"]; g.tool = 0;
  g.post = { x: 24, z: 24, kind: "tower" };
  assert.ok(towerManned(state, state.buildings[0]) || towerManned(state, { x: 24, z: 24 }), "the tower must read manned with a guard posted");
  const r = makeRaider(state, 24.5, 25.5);
  r.hp = 2; // one volley (2 damage at era stage 0) fells it
  state.raiders.push(r);
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0, guardKills: 0, towerKills: 0, breaches: 0 };
  runSeconds(state, grid, 2);
  assert.equal(state.raiders.length, 0, "the manned tower must fell the wounded raider");
  // resolveRaid nulls _raidStats once the field empties, so the kill is
  // read from the log line the volley writes, not the stats object.
  assert.ok(state.log.some((e) => /tower fells a raider/.test(e.text)), "the tower kill must be logged");
  console.log("manned tower volley kills a wounded raider");
}

// --- (c) walled + manned-tower village loses less than identical unwalled ---
// Same seed, same raid placement, same 130 seconds. The only difference
// is the wall line, four towers, and two guards posted on them.
// Theft is read from the raid-end log line, not the stockpile, so
// villager eating and farming cannot skew it.
function buildComparisonWorld(walled) {
  const { state, grid } = newWorld(42);
  state.delegateAt = Infinity; // delegation must not reshuffle the posts
  state.stockpile.food = 100;
  state.stockpile.fish = 0;
  state.stockpile.meat = 0;
  if (walled) {
    for (let z = 0; z < 48; z++) {
      if (cellAt(grid, 20, z).water) continue;
      cellAt(grid, 20, z).building = "wall";
      cellAt(grid, 20, z).blocked = true;
      state.buildings.push({ type: "wall", x: 20, z, hp: 30, maxHp: 30, done: true, builtDay: 1 });
    }
    for (const tz of [10, 20, 30, 40]) {
      cellAt(grid, 22, tz).building = "tower";
      cellAt(grid, 22, tz).blocked = true;
      state.buildings.push({ type: "tower", x: 22, z: tz, hp: 60, maxHp: 60, done: true, builtDay: 1 });
    }
    // Two guards posted on the two middle towers; the other two towers
    // stay unmanned, as the delegation cap would leave them.
    const towers = state.buildings.filter((b) => b.type === "tower");
    for (let i = 0; i < 2; i++) {
      const g = state.villagers[i];
      g.assignedJob = "guard"; g.job = "guard"; g.traits = ["brave"]; g.tool = 1;
      g.post = { x: towers[1 + i].x, z: towers[1 + i].z, kind: "tower" };
    }
  }
  for (const rz of [10.5, 20.5, 30.5]) {
    const r = makeRaider(state, 1.5, rz);
    r.homeEdge = [1, Math.round(rz)];
    state.raiders.push(r);
  }
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0, guardKills: 0, towerKills: 0, breaches: 0 };
  return { state, grid, popBefore: state.villagers.length };
}
function raidLosses(state) {
  const end = state.log.find((e) => /The raid ends/.test(e.text));
  if (end) {
    const m = /(\d+) slain, (\d+) food stolen, (\d+) raiders felled/.exec(end.text);
    if (m) return { deaths: +m[1], stolen: +m[2], killed: +m[3] };
  }
  if (state.log.some((e) => /without loss/.test(e.text))) return { deaths: 0, stolen: 0, killed: 0 };
  return null;
}
{
  const walled = buildComparisonWorld(true);
  runSeconds(walled.state, walled.grid, 130);
  const wLoss = raidLosses(walled.state);
  const unwalled = buildComparisonWorld(false);
  runSeconds(unwalled.state, unwalled.grid, 130);
  const uLoss = raidLosses(unwalled.state);
  assert.ok(wLoss, "walled raid must resolve with a log line");
  assert.ok(uLoss, "unwalled raid must resolve with a log line");
  console.log("walled losses: " + JSON.stringify(wLoss) + "; unwalled losses: " + JSON.stringify(uLoss));
  assert.ok(uLoss.stolen > 0, "unwalled raiders must steal food, got " + JSON.stringify(uLoss));
  assert.ok(wLoss.stolen < uLoss.stolen, "walls + towers must cut theft: walled " + wLoss.stolen + " vs unwalled " + uLoss.stolen);
  assert.ok(wLoss.deaths <= uLoss.deaths, "walls + towers must not cost more lives: walled " + wLoss.deaths + " vs unwalled " + uLoss.deaths);
  // Fairness invariant: no raid kills more than a third of the village.
  assert.ok(wLoss.deaths <= Math.floor(walled.popBefore / 3), "a defended raid must not wipe the village: " + wLoss.deaths + " deaths of " + walled.popBefore);
}

// --- raider transience across save/load ---
{
  const { state, grid } = newWorld(42);
  state.day = 15;
  spawnRaid(state, grid, 3);
  assert.equal(state.raiders.length, 3, "raid must be live before the save");
  const rt = deserialize(serialize(state, grid));
  assert.equal(rt.state.raiders.length, 0, "a save taken mid-raid must load with zero raiders");
  assert.equal(rt.state.raidActive, false, "raidActive must be false after load");
  assert.ok(rt.state.log.some((e) => /raid scatters/.test(e.text)), "the scatter must be logged on load");
  console.log("mid-raid save loads with zero raiders and a scatter log line");
}

// --- (d) guard melee: a guard on duty strikes, the kill is split out ---
{
  const { state, grid } = newWorld(7);
  state.delegateAt = Infinity;
  const g = state.villagers[0];
  g.assignedJob = "guard"; g.job = "guard"; g.traits = ["brave"]; g.tool = 0;
  g.x = 24.5; g.z = 24.5;
  const r = makeRaider(state, 24.5, 25.5);
  r.hp = 3; // one guard strike (3 + tool 0) fells it
  state.raiders.push(r);
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0, guardKills: 0, towerKills: 0, breaches: 0 };
  runSeconds(state, grid, 2);
  assert.equal(state.raiders.length, 0, "the guard must fell the wounded raider");
  assert.ok(state.log.some((e) => /fells a raider/.test(e.text) && e.text.includes(g.name)), "the guard kill must be logged once, by name");
  const end = state.log.find((e) => /drives off the raiders without loss/.test(e.text));
  assert.ok(end && /1 by guards/.test(end.text), "the raid summary must split guard kills, got: " + (end ? end.text : "none"));
  console.log("guard melee kills and the summary splits it out");
}

// --- (d2) a wounded guard breaks off, once, and falls back ---
{
  const { state, grid } = newWorld(7);
  state.delegateAt = Infinity;
  const g = state.villagers[0];
  g.assignedJob = "guard"; g.job = "guard"; g.traits = ["brave"];
  g.health = 20; // below the 25 break-off line
  g.x = 24.5; g.z = 24.5;
  g.post = { x: 24, z: 24, kind: "tower" };
  g.rethinkAt = 0;
  const r = makeRaider(state, 26.5, 24.5);
  state.raiders.push(r);
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0, guardKills: 0, towerKills: 0, breaches: 0 };
  step(state, grid, 0.25); // first think: the wound must send the guard fleeing
  assert.equal(g.state, "flee", "a wounded guard must fall back at once, got state " + g.state);
  runSeconds(state, grid, 5);
  const breaks = state.log.filter((e) => /breaks off and falls back/.test(e.text));
  assert.equal(breaks.length, 1, "the break-off must be logged exactly once, got " + breaks.length);
  console.log("wounded guard breaks off once and falls back");
}

// --- (e) combat determinism: the same seeded raid plays out identically ---
{
  function runRaid() {
    const { state, grid } = newWorld(42);
    state.day = 15;
    spawnRaid(state, grid, 4);
    runSeconds(state, grid, 130);
    const end = state.log.find((e) => /The raid ends/.test(e.text) || /without loss/.test(e.text));
    return JSON.stringify({
      end: end ? end.text : null,
      pop: state.villagers.length,
      food: state.stockpile.food,
      raiders: state.raiders.length,
      raidActive: state.raidActive,
    });
  }
  const a = runRaid();
  const b = runRaid();
  assert.equal(a, b, "identical seeded raids must resolve identically:\n" + a + "\n" + b);
  console.log("seeded raid is deterministic");
}

// --- (f) delegation fills guard posts: towers first, brave first ---
{
  const { state, grid } = newWorld(42);
  for (const tz of [10, 30]) {
    cellAt(grid, 22, tz).building = "tower";
    cellAt(grid, 22, tz).blocked = true;
    state.buildings.push({ type: "tower", x: 22, z: tz, hp: 60, maxHp: 60, done: true, builtDay: 1 });
  }
  for (let i = 0; i < 8; i++) {
    const z = 5 + i * 5;
    cellAt(grid, 20, z).building = "wall";
    cellAt(grid, 20, z).blocked = true;
    state.buildings.push({ type: "wall", x: 20, z, hp: 30, maxHp: 30, done: true, builtDay: 1 });
  }
  state.villagers[0].traits = ["brave"];
  for (let i = 1; i < state.villagers.length; i++) state.villagers[i].traits = ["lazy"];
  delegateRoles(state, grid);
  const guards = state.villagers.filter((v) => v.assignedJob === "guard");
  // 2 towers + 8 walls, pop/3 cap: min(6, 2 + 2, floor(pop/3)).
  const want = Math.min(6, 4, Math.floor(state.villagers.length / 3));
  assert.equal(guards.length, want, "delegation must fill " + want + " guard slots, got " + guards.length);
  assert.ok(guards.some((v) => v.traits.includes("brave")), "the brave villager must be picked for guard duty");
  assert.ok(guards.every((v) => v.post), "every guard must hold a post");
  assert.ok(guards.every((v) => v.post.kind === "tower"), "towers fill before gates, got " + JSON.stringify(guards.map((v) => v.post)));
  const def = defenseSummary(state);
  assert.equal(def.guards, want, "defenseSummary must count the guards");
  assert.equal(def.posted, want, "defenseSummary must count the posts");
  assert.equal(def.manned, 0, "no tower is manned until the guards take the job");
  console.log("delegation fills " + want + " guard posts, towers first, brave first");
}

// --- (f2) muster sends guards to posts on a cooldown; call_to_arms is gated ---
{
  const { state, grid } = newWorld(7);
  cellAt(grid, 24, 24).building = "tower";
  cellAt(grid, 24, 24).blocked = true;
  state.buildings.push({ type: "tower", x: 24, z: 24, hp: 60, maxHp: 60, done: true, builtDay: 1 });
  delegateRoles(state, grid);
  const guards = state.villagers.filter((v) => v.assignedJob === "guard");
  assert.ok(guards.length >= 1, "delegation must post at least one guard");
  const refused = callToArms(state, grid);
  assert.equal(refused.ok, false, "call_to_arms must be refused with no raid");
  assert.ok(state.log.some((e) => /call to arms is refused/.test(e.text)), "the refusal must be logged");
  const res = applyGod(state, grid, "muster");
  assert.equal(res.ok, true, "muster must succeed, got " + JSON.stringify(res));
  assert.ok(godCooldown(state, "muster") > 0 && godCooldown(state, "muster") <= 30, "muster must set a 30s cooldown");
  const again = applyGod(state, grid, "muster");
  assert.equal(again.ok, false, "muster must respect its cooldown");
  for (const g of guards) assert.equal(g.state, "work", "muster must send guards to work their posts");
  assert.ok(state.log.some((e) => /muster sounds/.test(e.text)), "the muster must be logged");
  state.raidActive = true;
  const armed = callToArms(state, grid);
  assert.equal(armed.ok, true, "call_to_arms must work during a raid");
  console.log("muster + call_to_arms behave: cooldown, gating, posts");
}

// --- the wall ring constant the renderer reads matches the sim ---
{
  assert.equal(WALL_RING_R, 9, "wall ring radius must be 9");
}

console.log("raid_smoke: all checks passed");
