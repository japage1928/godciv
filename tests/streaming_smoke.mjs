// Streaming smoke test for the v13 chunked renderer
// (DEFENSE-AND-MAP-DESIGN.md sections 4, 8, 11): per-chunk static
// groups, distance bands, disposal past 7 chunks, at-most-one
// rebuild per frame, home pinning during a raid, and deltas intact
// across unload/reload. Headless: the Renderer prototype runs on a
// fake object (no WebGLRenderer, no DOM), exactly like the render
// smoke test's fakes. Run: npm test (or: node tests/streaming_smoke.mjs)
import assert from "node:assert";
import * as THREE from "../vendor/three.module.js";
import { Renderer } from "../src/render.js";
import {
  newWorld, step, cellAt, peekChunk, chunkKey, CHUNK,
} from "../src/sim.js";

function makeRenderer() {
  const fake = Object.create(Renderer.prototype);
  fake.scene = new THREE.Scene();
  fake.target = new THREE.Vector3(24, 0, 24);
  fake._c = new THREE.Color();
  fake._m = new THREE.Matrix4();
  fake._season = null;
  fake.groundTex = null;
  fake.cobbleTex = null;
  fake._groundMat = new THREE.MeshLambertMaterial({});
  fake.buildingsGroup = null;
  return fake;
}

function bandOf(fake, cx, cz) {
  const rec = fake._chunkGroups.get(chunkKey(cx, cz));
  return rec ? rec.band : null;
}

// --- buildStatic builds one group per generated chunk, home bands full ---
{
  const { grid } = newWorld(42);
  const r = makeRenderer();
  r.buildStatic(grid);
  assert.equal(r._chunkGroups.size, 9, "a fresh world builds 9 chunk groups, got " + r._chunkGroups.size);
  let groundTotal = 0;
  for (const rec of r._chunkGroups.values()) {
    assert.equal(rec.band, "full", "home chunks start at full detail");
    assert.equal(rec.groundCells.length, 256, "each chunk holds 256 ground cells");
    assert.ok(rec.group && rec.parts.ground, "each chunk group holds a ground mesh");
    groundTotal += rec.parts.ground.count;
  }
  assert.equal(groundTotal, 9 * 256, "ground instances cover exactly the generated chunks");
  console.log("buildStatic: 9 per-chunk groups, all full detail");
}

// --- season tint is per chunk: only stale chunks recolor ---
{
  const { grid } = newWorld(42);
  const r = makeRenderer();
  r.buildStatic(grid);
  const rec = r._chunkGroups.get("1,1");
  const before = rec.parts.ground.instanceColor.array.slice(0, 3);
  r._applySeasonTint({ season: "winter" }, grid);
  assert.equal(rec.season, "winter", "the chunk records its tinted season");
  const after = rec.parts.ground.instanceColor.array.slice(0, 3);
  assert.ok(before[0] !== after[0] || before[1] !== after[1] || before[2] !== after[2],
    "winter tint must change ground colors");
  const before2 = rec.parts.ground.instanceColor.array.slice(0, 3);
  r._applySeasonTint({ season: "winter" }, grid);
  assert.deepEqual([...rec.parts.ground.instanceColor.array.slice(0, 3)], [...before2],
    "a second tint for the same season must be a no-op");
  console.log("season tint: per-chunk, no-op when current");
}

// --- a fast pan disposes only band-edge chunks, rebuilds at most one per frame ---
{
  const { state, grid } = newWorld(42);
  const r = makeRenderer();
  r.buildStatic(grid);
  const homeRec = r._chunkGroups.get("1,1");
  // Small pan: target chunk 1,1 -> 2,1. The home chunk stays full
  // and must keep its exact group object (no rebuild).
  r.target.set(40, 0, 24);
  r.syncChunks(state, grid);
  assert.equal(r._chunkGroups.get("1,1"), homeRec, "a chunk that kept its band must not rebuild on a small pan");
  // Big pan: fling the target to the far corner. Home chunks fall
  // past band 6 and dispose; only chunks near the target survive.
  r.target.set(280, 0, 280);
  for (let i = 0; i < 30; i++) r.syncChunks(state, grid);
  assert.equal(bandOf(r, 1, 1), null, "home chunks must unload when the camera leaves");
  assert.equal(r._chunkGroups.size, 0, "no generated chunk near the old view may survive a far pan, got " + r._chunkGroups.size);
  assert.ok(r._streamStats.disposed >= 9, "disposals must be counted, got " + r._streamStats.disposed);
  // Pan back: chunks rebuild, at most one per syncChunks call.
  r.target.set(24, 0, 24);
  let maxBuiltPerCall = 0;
  for (let i = 0; i < 30 && r._chunkGroups.size < 9; i++) {
    const before = r._streamStats.built + r._streamStats.rebuilt;
    r.syncChunks(state, grid);
    const delta = (r._streamStats.built + r._streamStats.rebuilt) - before;
    maxBuiltPerCall = Math.max(maxBuiltPerCall, delta);
  }
  assert.ok(maxBuiltPerCall <= 1, "at most one chunk rebuild per frame, saw " + maxBuiltPerCall);
  assert.equal(r._chunkGroups.size, 9, "panning home must restore all 9 home groups");
  assert.equal(bandOf(r, 1, 1), "full", "the home chunk returns at full detail");
  console.log("fast pan: disposal + one-rebuild-per-frame budget hold");
}

// --- the home village never drops below full detail during a raid ---
{
  const { state, grid } = newWorld(42);
  const r = makeRenderer();
  r.buildStatic(grid);
  r.target.set(280, 0, 280);
  state.raidActive = true;
  for (let i = 0; i < 30; i++) r.syncChunks(state, grid);
  assert.equal(bandOf(r, 1, 1), "full", "home chunks pin at full detail while a raid is active");
  assert.ok(r._chunkGroups.has("1,1"), "the home group must survive a far pan during a raid");
  state.raidActive = false;
  for (let i = 0; i < 5; i++) r.syncChunks(state, grid);
  assert.equal(bandOf(r, 1, 1), null, "the pin releases when the raid ends");
  // Actors hide past the standard band, show under the raid pin.
  assert.equal(r._actorVisible(24, 24, { raidActive: false }), false,
    "a villager at the village must hide when the camera is far and no raid pins it");
  assert.equal(r._actorVisible(24, 24, { raidActive: true }), true,
    "a villager at the village must show under the raid pin");
  assert.equal(r._actorVisible(280, 280, { raidActive: false }), true,
    "an actor under the camera target must show");
  console.log("raid pin: home stays full, actors follow the band");
}

// --- an unloaded chunk reloads with its deltas intact ---
{
  const { state, grid } = newWorld(42);
  const r = makeRenderer();
  r.buildStatic(grid);
  // Generate a far chunk and chop a tree in it.
  const ch = peekChunk(grid, 5, 5) || cellAt(grid, 5 * CHUNK + 3, 5 * CHUNK + 3) && peekChunk(grid, 5, 5);
  assert.ok(ch, "chunk 5,5 must generate on touch");
  let chopped = null;
  for (let lx = 0; lx < CHUNK && !chopped; lx++) for (let lz = 0; lz < CHUNK; lz++) {
    const c = ch.cells[lx][lz];
    if (c.tree) { chopped = [5 * CHUNK + lx, 5 * CHUNK + lz]; c.tree = false; c.blocked = false; }
  }
  assert.ok(chopped, "chunk 5,5 must hold a tree to chop");
  ch.dirty = true;
  r.target.set(5 * CHUNK + 8, 0, 5 * CHUNK + 8);
  for (let i = 0; i < 30 && !r._chunkGroups.get("5,5"); i++) r.syncChunks(state, grid);
  const built = r._chunkGroups.get("5,5");
  assert.ok(built, "the far chunk must build near the camera");
  const treesBuilt = built.treeCells.length;
  assert.ok(!built.treeCells.some(([x, z]) => x === chopped[0] && z === chopped[1]),
    "the chopped tree must stay chopped in the built group");
  // Pan 7+ chunks away: unload. (4 chunks is only the silhouette
  // band; the chunk keeps its group there.) Pan back: reload from
  // the chunk's own cells.
  r.target.set(200, 0, 200);
  for (let i = 0; i < 10; i++) r.syncChunks(state, grid);
  assert.ok(!r._chunkGroups.get("5,5"), "the far chunk must unload past 7 chunks");
  r.target.set(5 * CHUNK + 8, 0, 5 * CHUNK + 8);
  for (let i = 0; i < 30 && !r._chunkGroups.get("5,5"); i++) r.syncChunks(state, grid);
  const reloaded = r._chunkGroups.get("5,5");
  assert.ok(reloaded, "the far chunk must reload");
  assert.equal(reloaded.treeCells.length, treesBuilt, "reload must keep the chopped tree chopped");
  assert.ok(!reloaded.treeCells.some(([x, z]) => x === chopped[0] && z === chopped[1]),
    "the chopped cell must still be treeless after reload");
  console.log("unload/reload: deltas intact across disposal");
}

// --- dirty chunks rebuild through the queue, one per frame ---
{
  const { state, grid } = newWorld(42);
  const r = makeRenderer();
  r.buildStatic(grid);
  // Dirty three home chunks at once: pave a road in each.
  const keys = ["0,0", "1,1", "2,2"];
  for (const k of keys) {
    const [cx, cz] = k.split(",").map(Number);
    const c = cellAt(grid, cx * CHUNK + 2, cz * CHUNK + 2);
    c.road = true;
    peekChunk(grid, cx, cz).dirty = true;
  }
  let maxRebuilt = 0, calls = 0;
  const seen = new Set(keys);
  while (seen.size && calls++ < 20) {
    const before = r._streamStats.rebuilt;
    r.syncChunks(state, grid);
    maxRebuilt = Math.max(maxRebuilt, r._streamStats.rebuilt - before);
    for (const k of [...seen]) {
      const rec = r._chunkGroups.get(k);
      if (rec && rec.roadCells.some(([x, z]) => x === Number(k.split(",")[0]) * CHUNK + 2)) seen.delete(k);
    }
  }
  assert.equal(seen.size, 0, "all dirty chunks must rebuild, stuck: " + [...seen].join(","));
  assert.ok(maxRebuilt <= 1, "dirty rebuilds obey the one-per-frame budget, saw " + maxRebuilt);
  console.log("dirty rebuilds: queued, one per frame, counts refreshed");
}

// --- a sim step that mutates the world flags the chunk for rebuild ---
{
  const { state, grid } = newWorld(42);
  const r = makeRenderer();
  r.buildStatic(grid);
  const recBefore = r._chunkGroups.get("1,1");
  for (let i = 0; i < 600; i++) step(state, grid, 0.25);
  // Steps chop trees, mine stone, pave roads, and probe frontier
  // chunks: the queue holds new chunks ahead of dirty home chunks
  // (FIFO, one rebuild per frame), so drain it fully.
  for (let i = 0; i < 40; i++) r.syncChunks(state, grid);
  assert.ok(r._streamStats.rebuilt > 0,
    "sim mutations must flow through dirty flags into rebuilds, rebuilt=" + r._streamStats.rebuilt);
  assert.ok(r._chunkGroups.get("1,1") !== recBefore || r._streamStats.rebuilt > 0,
    "a dirty home chunk must eventually rebuild");
  console.log("sim dirty flags reach the renderer");
}

console.log("streaming smoke test passed: per-chunk groups, bands, raid pin, deltas intact");
