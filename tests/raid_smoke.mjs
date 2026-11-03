// Raid smoke test for v12: raiders spawn and resolve, walls block
// pathing, towers can kill, a walled village loses less than an
// identical unwalled one, and a mid-raid save loads with no raiders.
// Run: npm test  (or: node tests/raid_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, serialize, deserialize, findPath, spawnRaid, makeRaider,
  SIZE, WALL_RING_R,
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
  for (let z = 0; z < SIZE; z++) grid[20][z].blocked = true;
  const blocked = findPath(grid, 1, 24, 40, 24);
  assert.equal(blocked, null, "no path may cross a closed wall line");
  grid[20][24].blocked = false; // the gate
  const open = findPath(grid, 1, 24, 40, 24);
  assert.ok(open && open.length > 0, "a path must exist through the gate");
  assert.ok(open.some(([x, z]) => x === 20 && z === 24), "the path must use the gate cell, got " + JSON.stringify(open.slice(0, 4)));
  console.log("wall line blocks pathing; gate cell restores the route");
}

// --- (b2) a raider batters a wall down, given time and no towers ---
{
  const { state, grid } = newWorld(7);
  grid[20][5].building = "wall";
  grid[20][5].blocked = true;
  state.buildings.push({ type: "wall", x: 20, z: 5, hp: 30, maxHp: 30, done: true, builtDay: 1 });
  const r = makeRaider(state, 19.5, 5.5);
  state.raiders.push(r);
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0 };
  runSeconds(state, grid, 12);
  assert.equal(grid[20][5].building, null, "the wall cell must be cleared after battering");
  assert.ok(!state.buildings.some((b) => b.type === "wall" && b.x === 20 && b.z === 5), "the wall building must be gone");
  assert.ok(state.log.some((e) => /break through the wall/.test(e.text)), "the breakthrough must be logged");
  console.log("raider breaks through an undefended wall");
}

// --- (b3) tower damage can kill a raider ---
{
  const { state, grid } = newWorld(7);
  grid[24][24].building = "tower";
  grid[24][24].blocked = true;
  state.buildings.push({ type: "tower", x: 24, z: 24, hp: 60, maxHp: 60, done: true, builtDay: 1 });
  const r = makeRaider(state, 24.5, 25.5);
  r.hp = 2; // one volley (2 damage at era stage 0) fells it
  state.raiders.push(r);
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0 };
  runSeconds(state, grid, 2);
  assert.equal(state.raiders.length, 0, "the tower must fell the wounded raider");
  // resolveRaid nulls _raidStats once the field empties, so the kill is
  // read from the log line the volley writes, not the stats object.
  assert.ok(state.log.some((e) => /tower fells a raider/.test(e.text)), "the tower kill must be logged");
  console.log("tower volley kills a wounded raider");
}

// --- (c) walled + towered village loses less than identical unwalled ---
// Same seed, same raid placement, same 130 seconds. The only difference
// is the wall line and four towers. Theft is read from the raid-end log
// line, not the stockpile, so villager eating and farming cannot skew it.
function buildComparisonWorld(walled) {
  const { state, grid } = newWorld(42);
  state.stockpile.food = 100;
  state.stockpile.fish = 0;
  state.stockpile.meat = 0;
  if (walled) {
    for (let z = 0; z < SIZE; z++) {
      if (grid[20][z].water) continue;
      grid[20][z].building = "wall";
      grid[20][z].blocked = true;
      state.buildings.push({ type: "wall", x: 20, z, hp: 30, maxHp: 30, done: true, builtDay: 1 });
    }
    for (const tz of [10, 20, 30, 40]) {
      grid[22][tz].building = "tower";
      grid[22][tz].blocked = true;
      state.buildings.push({ type: "tower", x: 22, z: tz, hp: 60, maxHp: 60, done: true, builtDay: 1 });
    }
  }
  for (const rz of [10.5, 20.5, 30.5]) {
    const r = makeRaider(state, 1.5, rz);
    r.homeEdge = [1, Math.round(rz)];
    state.raiders.push(r);
  }
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0 };
  return { state, grid };
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

// --- the wall ring constant the renderer reads matches the sim ---
{
  assert.equal(WALL_RING_R, 9, "wall ring radius must be 9");
}

console.log("raid_smoke: all checks passed");
