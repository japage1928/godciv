// Phase E smoke test: raid size scales with population and era up to
// the cap, and the second wall ring rises at R=18 once the inner ring
// is established. Run: npm test (or: node tests/rings_smoke.mjs)
import assert from "node:assert";
import {
  newWorld, step, serialize, deserialize, spawnRaid, makeVillager,
  computeDemands, expandVillage, findWallSpot, cellAt,
  WALL_RING_R, OUTER_WALL_RING_R, RAID_SIZE_CAP,
} from "../src/sim.js";

function withPop(seed, pop, techLevel) {
  const { state, grid } = newWorld(seed);
  while (state.villagers.length < pop) state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1));
  state.tech.level = techLevel;
  return { state, grid };
}

// --- raid size: scales with pop and era, never above the cap ---
{
  const cases = [
    { pop: 6, tech: 0, want: 2 },
    { pop: 30, tech: 0, want: 5 },
    { pop: 60, tech: 3, want: 10 },
    { pop: 100, tech: 5, want: 10 },
  ];
  for (const c of cases) {
    const { state, grid } = withPop(42, c.pop, c.tech);
    const spawned = spawnRaid(state, grid);
    assert.equal(spawned.length, c.want, "raid size for pop " + c.pop + " tech " + c.tech + " must be " + c.want + ", got " + spawned.length);
    assert.ok(spawned.length <= RAID_SIZE_CAP, "raid size must never exceed the cap");
  }
  assert.equal(RAID_SIZE_CAP, 10, "raid size cap must be 10");
  console.log("raid size scales with pop + era and caps at 10");
}

// --- second ring: demanded at R=18 once the inner ring is established ---
function ringCells(R) {
  const cells = [];
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
    if (dx === 0 || dz === 0) continue; // gate cells stay open
    cells.push([dx, dz]);
  }
  return cells;
}
function placeBuilding(state, grid, type, x, z) {
  cellAt(grid, x, z).building = type;
  cellAt(grid, x, z).blocked = true;
  state.buildings.push({ type, x, z, hp: 30, maxHp: 30, done: true, builtDay: 1 });
}
{
  const { state, grid } = withPop(42, 18, 2);
  assert.equal(OUTER_WALL_RING_R, 18, "outer ring radius must be 18");
  // Inner ring still open: the demand is for the inner ring.
  const inner = computeDemands(state, grid).find((d) => d.type === "wall");
  assert.ok(inner && inner.ring === WALL_RING_R, "with an open inner ring the wall demand must target R=9, got " + JSON.stringify(inner));
  // Establish the inner ring: 40 walls on ring cells.
  const cx = state._cx, cz = state._cz;
  for (const [dx, dz] of ringCells(WALL_RING_R).slice(0, 40)) placeBuilding(state, grid, "wall", cx + dx, cz + dz);
  const outer = computeDemands(state, grid).find((d) => d.type === "wall");
  assert.ok(outer && outer.ring === OUTER_WALL_RING_R, "with the inner ring established the wall demand must target R=18, got " + JSON.stringify(outer));
  // A mature village: housed, fed, and every higher-scored need met,
  // so the outer wall is the top demand and expandVillage queues it.
  for (const v of state.villagers) v.home = cx + "," + cz;
  state.populationCap = 40;
  state.stockpile.food = 80;
  state.faith = 60;
  state._farmCells = [];
  for (const [type, dx, dz] of [["school", 5, 5], ["healer", -5, 5], ["well", 5, -5], ["shrine", -5, -5], ["granary", 3, 6]]) {
    placeBuilding(state, grid, type, cx + dx, cz + dz);
  }
  for (const [dx, dz] of ringCells(WALL_RING_R).slice(40, 44)) placeBuilding(state, grid, "tower", cx + dx, cz + dz);
  const top = computeDemands(state, grid)[0];
  assert.ok(top && top.type === "wall" && top.ring === OUTER_WALL_RING_R, "the outer wall must be the top demand in a mature village, got " + JSON.stringify(top));
  expandVillage(state, grid);
  const queued = state.buildQueue.find((q) => q.type === "wall");
  assert.ok(queued, "the outer ring wall must be queued");
  const qdx = queued.x - cx, qdz = queued.z - cz;
  assert.equal(Math.max(Math.abs(qdx), Math.abs(qdz)), OUTER_WALL_RING_R, "the queued wall must sit on the R=18 ring, got " + queued.x + "," + queued.z);
  assert.ok(qdx !== 0 && qdz !== 0, "the outer ring must leave its gate cells open");
  console.log("second ring demanded and queued at R=18 with open gates");
}

// --- findWallSpot serves each ring, never a gate cell ---
{
  const { state, grid } = withPop(7, 18, 2);
  const cx = state._cx, cz = state._cz;
  for (const R of [WALL_RING_R, OUTER_WALL_RING_R]) {
    for (let i = 0; i < 10; i++) {
      const spot = findWallSpot(state, grid, R);
      assert.ok(spot, "a wall spot must exist on ring R=" + R);
      const dx = spot[0] - cx, dz = spot[1] - cz;
      assert.equal(Math.max(Math.abs(dx), Math.abs(dz)), R, "spot must sit on ring R=" + R);
      assert.ok(dx !== 0 && dz !== 0, "spot must never be a gate cell");
      cellAt(grid, spot[0], spot[1]).building = "wall";
      cellAt(grid, spot[0], spot[1]).blocked = true;
      state.buildings.push({ type: "wall", x: spot[0], z: spot[1], hp: 30, maxHp: 30, done: true, builtDay: 1 });
    }
  }
  console.log("findWallSpot serves both rings, gates stay open");
}

// --- outer-ring walls survive save/load ---
{
  const { state, grid } = withPop(7, 18, 2);
  const cx = state._cx, cz = state._cz;
  cellAt(grid, cx + 18, cz + 5).building = "wall";
  cellAt(grid, cx + 18, cz + 5).blocked = true;
  state.buildings.push({ type: "wall", x: cx + 18, z: cz + 5, hp: 30, maxHp: 30, done: true, builtDay: 1 });
  const rt = deserialize(serialize(state, grid));
  assert.ok(rt.state.buildings.some((b) => b.type === "wall" && b.x === cx + 18 && b.z === cz + 5), "the outer-ring wall must survive save/load");
  console.log("outer-ring wall survives save/load");
}

console.log("rings_smoke: all checks passed");
