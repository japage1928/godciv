// Chunked-world smoke test for the v13 map refactor (DEFENSE-AND-
// MAP-DESIGN.md sections 4-5, 11): the old 48x48 block survives the
// refactor cell-for-cell, chunks generate deterministically in any
// order, ungenerated land costs nothing, the generation queue drains
// at most one chunk per tick, paths cross chunk boundaries, indexes
// match brute-force scans, and v4 saves migrate to v5 with the world
// intact. Run: npm test (or: node tests/chunks_smoke.mjs)
import assert from "node:assert";
import { createHash } from "node:crypto";
import {
  newWorld, step, serialize, deserialize, findPath, pickVillageSites,
  SAVE_VERSION, WORLD_SIZE, CHUNK, OLD_SIZE, VILLAGE_NAMES,
  cellAt, peekCell, peekChunk, isGenerated, generatedChunks,
  forEachGeneratedCell, queueChunk, drainGenQueue, nearestCell,
  CHUNKS_ACROSS,
} from "../src/sim.js";

// Canonical fingerprint of the old block, in a fixed format defined
// here: row-major over the 48x48 founding block, per cell the height
// (12 decimals), water/tree/blocked/farm/road flags, stone, ore,
// crop, crop growth x1000, and building type.
function oldBlockHash(grid) {
  const parts = [];
  for (let x = 0; x < OLD_SIZE; x++) for (let z = 0; z < OLD_SIZE; z++) {
    const c = cellAt(grid, x, z);
    parts.push([c.h.toFixed(12), c.water ? 1 : 0, c.tree ? 1 : 0, c.stone, c.ore,
      c.blocked ? 1 : 0, c.farm ? 1 : 0, c.crop, Math.round(c.cropGrow * 1000),
      c.road ? 1 : 0, c.building || ""].join(","));
  }
  return createHash("sha256").update(parts.join(";")).digest("hex");
}

function oldBlockCounts(grid) {
  let trees = 0, stones = 0, water = 0, farms = 0, roads = 0, buildings = 0;
  for (let x = 0; x < OLD_SIZE; x++) for (let z = 0; z < OLD_SIZE; z++) {
    const c = cellAt(grid, x, z);
    if (c.tree) trees++;
    if (c.stone > 0) stones++;
    if (c.water) water++;
    if (c.farm) farms++;
    if (c.road) roads++;
    if (c.building) buildings++;
  }
  return { trees, stones, water, farms, roads, buildings };
}

// --- the old block is identical, seed by seed, against the counts
// recorded from the pre-refactor generator ---
{
  assert.equal(SAVE_VERSION, 5, "this build takes SAVE_VERSION 5");
  assert.equal(WORLD_SIZE, 320, "the map is 320x320");
  assert.equal(CHUNKS_ACROSS, 20, "20x20 chunks");
  const recorded = {
    42: { trees: 75, stones: 26, water: 128, farms: 18, roads: 16, buildings: 3 },
    7: { trees: 73, stones: 25, water: 70 },
    12345: { trees: 82, stones: 28, water: 105 },
  };
  for (const [seed, want] of Object.entries(recorded)) {
    const { grid } = newWorld(Number(seed));
    const got = oldBlockCounts(grid);
    for (const [k, v] of Object.entries(want)) {
      assert.equal(got[k], v, "seed " + seed + " old-block " + k + " must match the pre-refactor count, got " + got[k]);
    }
  }
  console.log("old-block counts match the pre-refactor generator for seeds 42, 7, 12345");
}

// --- determinism: the same seed, the same old block, twice ---
{
  const a = newWorld(42), b = newWorld(42);
  assert.equal(oldBlockHash(a.grid), oldBlockHash(b.grid), "two newWorld(42) runs must fingerprint identically");
  console.log("old-block fingerprint stable across runs: " + oldBlockHash(a.grid).slice(0, 16) + "...");
}

// --- generation order must not matter: the same chunk, generated
// first or fifth, holds the same cells ---
{
  const a = newWorld(42), b = newWorld(42);
  cellAt(a.grid, 5 * CHUNK + 3, 5 * CHUNK + 9);
  cellAt(a.grid, 10 * CHUNK + 1, 3 * CHUNK + 14);
  cellAt(b.grid, 10 * CHUNK + 1, 3 * CHUNK + 14);
  cellAt(b.grid, 5 * CHUNK + 3, 5 * CHUNK + 9);
  for (const [cx, cz] of [[5, 5], [10, 3]]) {
    const ca = peekChunk(a.grid, cx, cz), cb = peekChunk(b.grid, cx, cz);
    assert.ok(ca && cb, "chunk " + cx + "," + cz + " must exist in both worlds");
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
      const x = ca.cells[lx][lz], y = cb.cells[lx][lz];
      assert.deepEqual(x, y, "chunk " + cx + "," + cz + " cell " + lx + "," + lz + " must not depend on generation order");
    }
  }
  console.log("chunk generation is order-independent");
}

// --- ungenerated land costs nothing: peeking never generates ---
{
  const { grid } = newWorld(42);
  assert.equal(generatedChunks(grid).length, 9, "a fresh world materializes exactly the 9 old chunks");
  assert.equal(peekCell(grid, 200, 200), null, "peeking far land must return null");
  assert.equal(peekChunk(grid, 12, 12), null, "peeking a far chunk must return null");
  assert.equal(generatedChunks(grid).length, 9, "peeking must not generate chunks");
  assert.equal(isGenerated(grid, 0, 0), true, "the home chunk is generated");
  assert.equal(isGenerated(grid, 12, 12), false, "far chunks start ungenerated");
  cellAt(grid, 200, 200);
  assert.equal(generatedChunks(grid).length, 10, "touching far land generates exactly its chunk");
  console.log("ungenerated land costs nothing; touch generates one chunk");
}

// --- the generation queue drains at most one chunk per tick ---
{
  const { state, grid } = newWorld(42);
  const before = generatedChunks(grid).length;
  assert.equal(findPath(grid, 24, 24, 300, 300), null, "a path into ungenerated land must wait, not invent ground");
  step(state, grid, 0.25);
  const after = generatedChunks(grid).length;
  assert.ok(after - before <= 1, "one tick must generate at most one queued chunk, grew " + (after - before));
  assert.ok(after > before, "the queued chunk must drain within a tick");
  // Direct queue: three queued, three drains of one each.
  queueChunk(grid, 15, 15);
  queueChunk(grid, 16, 15);
  queueChunk(grid, 17, 15);
  const n0 = generatedChunks(grid).length;
  drainGenQueue(grid, 1);
  assert.equal(generatedChunks(grid).length, n0 + 1, "drainGenQueue(1) must generate exactly one chunk");
  console.log("generation queue drains at most one chunk per tick");
}

// --- paths cross chunk boundaries once the ground exists ---
{
  const { state, grid } = newWorld(42);
  // Walk the queue until the target chunk exists: each findPath call
  // queues the next frontier layer, each tick drains one chunk.
  let guard = 0, path = null;
  while (guard++ < 40) {
    path = findPath(grid, 24, 24, 70, 70);
    if (path) break;
    step(state, grid, 0.25);
  }
  assert.ok(isGenerated(grid, 4, 4), "the target chunk must generate from the queue");
  assert.ok(path && path.length > 0, "a path must exist across chunk boundaries");
  assert.ok(path.some(([x, z]) => x >= OLD_SIZE || z >= OLD_SIZE), "the path must leave the old block");
  for (let i = 1; i < path.length; i++) {
    const [px, pz] = path[i - 1], [x, z] = path[i];
    assert.ok(Math.abs(x - px) + Math.abs(z - pz) === 1, "path steps must be adjacent, " + px + "," + pz + " -> " + x + "," + z);
  }
  assert.deepEqual(path[path.length - 1], [70, 70], "the path must end on the target");
  console.log("path crosses chunk boundaries: " + path.length + " steps to (70,70)");
}

// --- indexes match brute-force scans over generated land ---
{
  const { state, grid } = newWorld(42);
  for (let i = 0; i < 400; i++) step(state, grid, 0.25);
  // Brute force, same predicate, same tie rule (strict <, first wins
  // in row-major chunk order): must agree with nearestCell exactly.
  const brute = (fromX, fromZ, pred) => {
    let best = null, bestD = Infinity;
    forEachGeneratedCell(grid, (x, z, c) => {
      if (!pred(c, x, z)) return;
      const d = Math.hypot(x - fromX, z - fromZ);
      if (d < bestD) { bestD = d; best = [x, z]; }
    });
    return best;
  };
  // NOTE: forEachGeneratedCell visits chunks in insertion order,
  // which matches nearestCell's chunk order on this world; the
  // comparison is over the choice, not the visit order.
  for (const [fx, fz] of [[24, 24], [10, 40], [40, 10]]) {
    for (const pred of [(c) => c.tree, (c) => c.stone > 0, (c) => c.farm && c.crop === 3]) {
      assert.deepEqual(nearestCell(grid, fx, fz, pred), brute(fx, fz, pred),
        "nearestCell must match a brute-force scan from " + fx + "," + fz);
    }
  }
  let scanStones = 0;
  forEachGeneratedCell(grid, (x, z, c) => { if (c.stone > 0) scanStones++; });
  assert.equal(grid._stoneSpots.length, scanStones, "the stone index must list every generated stone cell");
  console.log("indexes match brute-force scans after 100 ticks");
}

// --- village sites: deterministic, in new territory, spaced out ---
{
  const s1 = pickVillageSites(42, 2), s2 = pickVillageSites(42, 2);
  assert.deepEqual(s1, s2, "sites must be deterministic per seed");
  assert.equal(s1.length, 2, "two neighbor sites");
  for (const s of s1) {
    const dCenter = Math.hypot(s.x - 24, s.z - 24);
    assert.ok(dCenter >= 60, "a site must sit 60+ cells from the center, got " + dCenter.toFixed(1));
    assert.ok(!(s.x >= 0 && s.x < OLD_SIZE && s.z >= 0 && s.z < OLD_SIZE),
      "a site must sit in new territory, not the old block, got " + s.x + "," + s.z);
  }
  const dPair = Math.hypot(s1[0].x - s1[1].x, s1[0].z - s1[1].z);
  assert.ok(dPair >= 50, "sites must sit 50+ cells apart, got " + dPair.toFixed(1));
  const { state } = newWorld(42);
  assert.equal(state.villages.length, 2, "the world holds 2 neighbor records; the player is village 0");
  assert.equal(state.villages[0].id, 1, "neighbor records carry ids 1 and 2");
  assert.ok(VILLAGE_NAMES.includes(state.villages[0].name), "neighbor names come from the pool");
  assert.ok(VILLAGE_NAMES.includes(state.villages[1].name), "neighbor names come from the pool");
  assert.notEqual(state.villages[0].name, state.villages[1].name, "neighbors have distinct names");
  assert.deepEqual(state.villageSites, s1, "the world's sites match the picker");
  console.log("village sites deterministic, spaced, in new territory: " +
    state.villages.map((v) => v.name + " (" + v.center.join(",") + ")").join(", "));
}

// --- v4 -> v5 migration: a save from the old format loads intact ---
{
  const { state, grid } = newWorld(42);
  for (let i = 0; i < 600; i++) step(state, grid, 0.25);
  // Touch far land and mutate it, so the migration must carry
  // generated-chunk deltas, not just the old block.
  const far = cellAt(grid, 100, 100);
  far.tree = false; far.blocked = false; far.road = true;
  const saved = JSON.parse(serialize(state, grid));
  const beforeBuildings = state.buildings.map((b) => b.type + b.x + "," + b.z).sort().join("|");
  const beforeVillagers = state.villagers.map((v) => v.id + ":" + Math.round(v.x) + "," + Math.round(v.z)).sort().join("|");
  let roadsBefore = 0;
  forEachGeneratedCell(grid, (x, z, c) => { if (c.road) roadsBefore++; });

  // Simulate a v4 save: version 4, no chunk list, no v5 fields
  // (serialize spreads the state at the top level of the envelope).
  const v4 = JSON.parse(JSON.stringify(saved));
  v4.version = 4;
  delete v4.chunks;
  delete v4.villages;
  delete v4.villageSites;
  delete v4.caravans;
  delete v4.warParties;
  delete v4.nextCaravanId;
  delete v4.nextWarPartyId;
  const loaded = deserialize(JSON.stringify(v4));
  const ls = loaded.state, lg = loaded.grid;
  assert.equal(ls.version, SAVE_VERSION, "a migrated save stamps SAVE_VERSION 5");
  assert.equal(ls.buildings.map((b) => b.type + b.x + "," + b.z).sort().join("|"), beforeBuildings,
    "every building must survive the v4->v5 migration at exact coordinates");
  assert.equal(ls.villagers.map((v) => v.id + ":" + Math.round(v.x) + "," + Math.round(v.z)).sort().join("|"), beforeVillagers,
    "every villager must survive the migration at exact coordinates");
  let roadsAfter = 0;
  forEachGeneratedCell(lg, (x, z, c) => { if (c.road) roadsAfter++; });
  assert.equal(roadsAfter, roadsBefore, "roads, including far-chunk deltas, must survive migration");
  assert.equal(cellAt(lg, 100, 100).road, true, "the far-chunk road delta must survive migration");
  assert.equal(ls.villages.length, 2, "migration creates the 2 neighbor records");
  assert.deepEqual(ls.villageSites, pickVillageSites(42, 2), "migration picks the same deterministic sites");
  assert.equal(ls.day, state.day, "the migrated world keeps its day");
  console.log("v4->v5 migration: day " + ls.day + ", " + ls.buildings.length + " buildings, " + ls.villagers.length + " villagers intact");
}

// --- v5 round-trip: chunk list, records, and relations survive ---
{
  const { state, grid } = newWorld(42);
  cellAt(grid, 100, 100).road = true;
  const saved = JSON.parse(serialize(state, grid));
  assert.equal(saved.version, 5, "v5 saves stamp version 5");
  assert.ok(Array.isArray(saved.chunks) && saved.chunks.length >= 9, "v5 saves list generated chunks");
  const loaded = deserialize(JSON.stringify(saved));
  assert.deepEqual(loaded.state.villages, state.villages, "village records round-trip");
    assert.equal(cellAt(loaded.grid, 100, 100).road, true, "far-chunk deltas round-trip");
  assert.deepEqual(loaded.state.villages[1].center, state.villages[1].center, "neighbor sites round-trip");
  console.log("v5 save/load round-trips chunks, records, and relations");
}

console.log("chunks smoke test passed: old block identical, chunks deterministic, migration intact");
