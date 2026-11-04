// GodCiv sim grid: chunked 320x320 world, cell access, indexes,
// pathfinding, targeting, and corridor generation.
import { ACTIVE_RADIUS_CHUNKS, CHUNK, CHUNKS_ACROSS, WORLD_SIZE, inBounds, key } from "./core.js";
import { chunkLake, hash01, oldBlockFor, terrainHeight } from "./terrain.js";

export function chunkKey(cx, cz) { return cx + "," + cz; }
export function chunkOf(x, z) { return [Math.floor(x / CHUNK), Math.floor(z / CHUNK)]; }

export function createGrid(seed) {
  return {
    seed, worldSize: WORLD_SIZE, chunks: new Map(),
    _oldBlock: null, _lattice: null,
    _genQueue: [], _genQueued: new Set(),
    _activeSet: new Set(),
    _indexDirty: true, _treeSet: new Set(), _stoneSet: new Set(), _oreSet: new Set(),
    _stoneSpots: [],
    _villageSites: [],
  };
}

function genChunkCells(grid, cx, cz) {
  if (cx >= 0 && cx < 3 && cz >= 0 && cz < 3) {
    const old = oldBlockFor(grid).cells;
    const cells = [];
    for (let lx = 0; lx < CHUNK; lx++) {
      cells.push([]);
      for (let lz = 0; lz < CHUNK; lz++) cells[lx].push(old[cx * CHUNK + lx][cz * CHUNK + lz]);
    }
    return cells;
  }
  const seed = grid.seed;
  const lake = chunkLake(seed, cx, cz);
  const cells = [];
  for (let lx = 0; lx < CHUNK; lx++) {
    cells.push([]);
    for (let lz = 0; lz < CHUNK; lz++) {
      const x = cx * CHUNK + lx, z = cz * CHUNK + lz;
      const h = terrainHeight(seed, x, z);
      const water = !!(lake && Math.hypot(x - lake.x, z - lake.z) < lake.r && h < 0.62);
      const cell = {
        h, water, blocked: water, road: false,
        tree: false, stone: 0, ore: 0, crop: -1, cropGrow: 0,
        building: null, farm: false,
      };
      if (!water) {
        const dCenter = Math.hypot(x - 24, z - 24);
        if (dCenter >= 8 && hash01(seed, x, z, 201) < 0.039) { cell.tree = true; cell.blocked = true; }
        else if (dCenter >= 7 && hash01(seed, x, z, 202) < 0.013) {
          cell.stone = 8 + Math.floor(hash01(seed, z, x, 202) * 5);
          cell.ore = h > 0.55 && hash01(seed, x, z, 203) < 0.6 ? 4 + Math.floor(hash01(seed, z, x, 203) * 3) : 0;
          cell.blocked = true;
        }
      }
      cells[lx].push(cell);
    }
  }
  // A neighbor-village site clears its ground the way the founding
  // clearing does: trees and stone out, water out, room to build.
  // No buildings yet: those arrive at activation (Phase F).
  for (const s of grid._villageSites || []) {
    const [scx, scz] = chunkOf(s.x, s.z);
    if (Math.abs(scx - cx) > 1 || Math.abs(scz - cz) > 1) continue;
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
      const x = cx * CHUNK + lx, z = cz * CHUNK + lz;
      if (Math.hypot(x - s.x, z - s.z) <= 6) {
        const c = cells[lx][lz];
        c.water = false; c.blocked = false; c.tree = false; c.stone = 0; c.ore = 0;
      }
    }
  }
  return cells;
}

export function getChunk(grid, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_ACROSS || cz >= CHUNKS_ACROSS) return null;
  const k = chunkKey(cx, cz);
  let ch = grid.chunks.get(k);
  if (!ch) {
    ch = { cx, cz, cells: genChunkCells(grid, cx, cz), generated: true, dirty: true, frozenAt: null, shore: null };
    grid.chunks.set(k, ch);
    grid._indexDirty = true;
    // A new chunk can put water beside a neighbor's land: its shore
    // flag must be recomputed, not trusted from before.
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const n = grid.chunks.get(chunkKey(cx + dx, cz + dz));
      if (n) n.shore = null;
    }
  }
  return ch;
}
export function peekChunk(grid, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_ACROSS || cz >= CHUNKS_ACROSS) return null;
  return grid.chunks.get(chunkKey(cx, cz)) || null;
}
// The one accessor that knows about chunks. cellAt generates the
// chunk on touch (generation is hash arithmetic, under the 10ms
// budget); peekCell never generates and returns null for
// ungenerated land, which pathfinding treats as blocked.
export function cellAt(grid, x, z) {
  if (!inBounds(x, z)) return null;
  const ch = getChunk(grid, Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  return ch ? ch.cells[x % CHUNK][z % CHUNK] : null;
}
export function peekCell(grid, x, z) {
  if (!inBounds(x, z)) return null;
  const ch = peekChunk(grid, Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  return ch ? ch.cells[x % CHUNK][z % CHUNK] : null;
}
export function isGenerated(grid, cx, cz) { return grid.chunks.has(chunkKey(cx, cz)); }
export function generatedChunks(grid) { return [...grid.chunks.values()]; }
export function generatedCellCount(grid) { return grid.chunks.size * CHUNK * CHUNK; }
export function forEachGeneratedCell(grid, fn) {
  for (const ch of grid.chunks.values()) {
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
      fn(ch.cx * CHUNK + lx, ch.cz * CHUNK + lz, ch.cells[lx][lz]);
    }
  }
}
// Queue a chunk for generation, at most one per tick (step drains
// the queue). Pathfinding into ungenerated land queues instead of
// generating inline, so no tick ever pays for the whole map.
export function queueChunk(grid, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_ACROSS || cz >= CHUNKS_ACROSS) return;
  const k = chunkKey(cx, cz);
  if (grid.chunks.has(k) || grid._genQueued.has(k)) return;
  grid._genQueued.add(k);
  grid._genQueue.push([cx, cz]);
}
export function drainGenQueue(grid, max = 1) {
  let n = 0;
  while (n < max && grid._genQueue.length) {
    const [cx, cz] = grid._genQueue.shift();
    grid._genQueued.delete(chunkKey(cx, cz));
    getChunk(grid, cx, cz);
    n++;
  }
  return n;
}
// Call after mutating a cell: marks the chunk dirty for render/save
// and invalidates the tree/stone indexes and the shore flag.
export function noteMutation(grid, x, z) {
  const ch = peekChunk(grid, Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  if (ch) { ch.dirty = true; ch.shore = null; }
  // Incremental index upkeep (v14 perf fix): when the indexes are
  // fresh, refresh just this cell's entries instead of flagging a
  // full rebuild — the rebuild scans every generated cell (50k+ on
  // a 194-chunk world) and was firing on ~20% of steps, pushing
  // p95 to ~10ms. Every runtime tree/stone/ore mutation calls here
  // AFTER the change, so reading the cell's current state is
  // correct. While a rebuild is already pending (a chunk was just
  // generated, or a save just loaded) the rebuild covers this cell
  // and the incremental work is skipped; ensureIndexes stays the
  // fallback for loads and for grids whose sets were never built.
  if (grid._indexDirty || !ch) return;
  if (!grid._treeSet || !grid._stoneSet || !grid._oreSet || !grid._stoneSpots) { grid._indexDirty = true; return; }
  const c = ch.cells[x % CHUNK] && ch.cells[x % CHUNK][z % CHUNK];
  if (!c) return;
  const k = key(x, z);
  if (c.tree) grid._treeSet.add(k); else grid._treeSet.delete(k);
  if (c.ore > 0) grid._oreSet.add(k); else grid._oreSet.delete(k);
  const hadStone = grid._stoneSet.has(k);
  if (c.stone > 0) {
    if (!hadStone) { grid._stoneSet.add(k); grid._stoneSpots.push([x, z]); }
  } else if (hadStone) {
    grid._stoneSet.delete(k);
    const i = grid._stoneSpots.findIndex(([sx, sz]) => sx === x && sz === z);
    if (i >= 0) grid._stoneSpots.splice(i, 1);
  }
}

// Spatial indexes, rebuilt lazily from generated chunks only. The
// rebuild is linear in generated cells and runs at most once per
// mutation batch; every lookup after that reads the sets.
export function ensureIndexes(grid) {
  if (!grid._indexDirty) return;
  const trees = new Set(), stones = new Set(), ores = new Set(), spots = [];
  forEachGeneratedCell(grid, (x, z, c) => {
    if (c.tree) trees.add(key(x, z));
    if (c.stone > 0) { stones.add(key(x, z)); spots.push([x, z]); }
    if (c.ore > 0) ores.add(key(x, z));
  });
  grid._treeSet = trees; grid._stoneSet = stones; grid._oreSet = ores; grid._stoneSpots = spots;
  grid._indexDirty = false;
}
export function chunkHasShore(grid, ch) {
  if (ch.shore != null) return ch.shore;
  let shore = false;
  for (let lx = 0; lx < CHUNK && !shore; lx++) for (let lz = 0; lz < CHUNK && !shore; lz++) {
    const x = ch.cx * CHUNK + lx, z = ch.cz * CHUNK + lz;
    const c = ch.cells[lx][lz];
    if (c.water || c.blocked) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = peekCell(grid, x + dx, z + dz);
      if (n && n.water) { shore = true; break; }
    }
  }
  ch.shore = shore;
  return shore;
}
export function hasShoreGrid(grid) {
  for (const ch of grid.chunks.values()) if (chunkHasShore(grid, ch)) return true;
  return false;
}

function markActive(set, x, z) {
  const [ccx, ccz] = chunkOf(Math.round(x), Math.round(z));
  for (let dx = -ACTIVE_RADIUS_CHUNKS; dx <= ACTIVE_RADIUS_CHUNKS; dx++) {
    for (let dz = -ACTIVE_RADIUS_CHUNKS; dz <= ACTIVE_RADIUS_CHUNKS; dz++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx >= 0 && cz >= 0 && cx < CHUNKS_ACROSS && cz < CHUNKS_ACROSS) set.add(chunkKey(cx, cz));
    }
  }
}
export function computeActiveSet(state) {
  const set = new Set();
  for (const v of state.villagers) markActive(set, v.x, v.z);
  for (const b of state.buildings) markActive(set, b.x, b.z);
  for (const r of state.raiders || []) markActive(set, r.x, r.z);
  for (const d of state.deer || []) markActive(set, d.x, d.z);
  for (const t of state.caravans || []) markActive(set, t.x, t.z);
  for (const w of state.warParties || []) for (const m of w.members || []) markActive(set, m.x, m.z);
  markActive(set, state._cx, state._cz);
  for (const rec of state.villages || []) if (rec.active) markActive(set, rec.center[0], rec.center[1]);
  return set;
}
// Freeze quiet chunks, wake returning ones with one bounded crop
// catch-up. A frozen chunk's cells do not change; crops catch up at
// most one growth stage on reactivation, never a miracle harvest.
export function updateActiveChunks(state, grid) {
  const next = computeActiveSet(state);
  const prev = grid._activeSet;
  for (const k of prev) {
    if (next.has(k)) continue;
    const ch = grid.chunks.get(k);
    if (!ch || ch.frozenAt != null) continue;
    ch.frozenAt = state.elapsed;
    // Deer in a freezing chunk are released; the dawn top-up rule
    // respawns them near the village.
    if (state.deer && state.deer.length) {
      state.deer = state.deer.filter((d) => {
        const [dcx, dcz] = chunkOf(Math.round(d.x), Math.round(d.z));
        return chunkKey(dcx, dcz) !== k;
      });
    }
  }
  for (const k of next) {
    if (prev.has(k)) continue;
    const ch = grid.chunks.get(k);
    if (!ch || ch.frozenAt == null) continue;
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
      const c = ch.cells[lx][lz];
      if (c.farm && c.crop >= 0 && c.crop < 3) {
        c.cropGrow += 28;
        if (c.cropGrow > 28) { c.cropGrow = 0; c.crop++; }
      }
    }
    ch.frozenAt = null;
  }
  grid._activeSet = next;
}

// Breadth-first pathfinding on the walkable grid. Cheap at 48x48, and it
// means villagers walk around water and buildings instead of steering
// blindly through them (the Luanti v1 steer-to-target weakness).
export function findPath(grid, sx, sz, tx, tz, maxSteps = null, avoidFarm = false) {
  if (!inBounds(tx, tz)) return null;
  // Chunk-aware: the search never generates. Cells in ungenerated
  // chunks read as blocked, and the target's chunk is queued for
  // generation (one chunk per tick, drained by step()), so the next
  // rethink finds the way. The step cap scales with the active
  // region instead of a fixed 4,000: a path across the settled area
  // is longer than a path across the old 48-grid.
  if (maxSteps == null) maxSteps = 4000 + (grid._activeSet ? grid._activeSet.size : 9) * 512;
  const targetCell = peekCell(grid, tx, tz);
  if (!targetCell) { queueChunk(grid, Math.floor(tx / CHUNK), Math.floor(tz / CHUNK)); return null; }
  // A blocked target (a finished building) is still reachable: the
  // path ends on its doorstep. Before this fix, findPath returned
  // null for every building target, so paveRoads could only ever
  // pave toward farm plots and no road ever reached a hut.
  if (sx === tx && sz === tz) return [];
  const prev = new Map();
  const q = [[sx, sz]];
  let qi = 0; // index-based queue: Array.shift() is O(n) and tanked frames on phones
  prev.set(key(sx, sz), null);
  let steps = 0;
  while (qi < q.length && steps < maxSteps) {
    const [x, z] = q[qi++]; steps++;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!inBounds(nx, nz)) continue;
      const isTarget = nx === tx && nz === tz;
      const nc = peekCell(grid, nx, nz);
      if (!nc) { queueChunk(grid, Math.floor(nx / CHUNK), Math.floor(nz / CHUNK)); continue; }
      if (nc.blocked && !isTarget) continue;
      if (avoidFarm && nc.farm && !isTarget) continue;
      const k = key(nx, nz);
      if (prev.has(k)) continue;
      prev.set(k, key(x, z));
      if (nx === tx && nz === tz) {
        const path = []; let cur = k;
        while (cur && cur !== key(sx, sz)) { const [px, pz] = cur.split(",").map(Number); path.unshift([px, pz]); cur = prev.get(cur); }
        return path;
      }
      q.push([nx, nz]);
    }
  }
  return null;
}

export function hasShore(grid) {
  return hasShoreGrid(grid);
}

// Leader delegation: the leader looks at what the village needs and
// assigns a job to each villager. Delegation is a strong nudge, not an
// order — a villager can still refuse it (see think()). The god never
// assigns jobs; only the leader does, and only the leader is advised by
// the council/Ollama layer.
export function nearestCell(grid, fromX, fromZ, pred) {
  // Chunk-pruned scan: only generated chunks are searched, and a
  // chunk whose nearest cell cannot beat the best match found is
  // skipped whole. Same result as a full-grid scan on generated
  // land, at a cost that follows settlement, not map size.
  let best = null, bestD = Infinity;
  for (const ch of grid.chunks.values()) {
    const x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK;
    const x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
    const dx = fromX < x0 ? x0 - fromX : fromX > x1 ? fromX - x1 : 0;
    const dz = fromZ < z0 ? z0 - fromZ : fromZ > z1 ? fromZ - z1 : 0;
    if (Math.hypot(dx, dz) >= bestD) continue;
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
      const c = ch.cells[lx][lz];
      const x = x0 + lx, z = z0 + lz;
      if (!pred(c, x, z)) continue;
      const d = Math.hypot(x - fromX, z - fromZ);
      if (d < bestD) { bestD = d; best = [x, z]; }
    }
  }
  return best;
}

export function setTarget(state, grid, v, x, z) {
  if (x == null) { v.target = null; v.path = null; return; }
  // Stand on a walkable neighbour if the cell itself is blocked.
  let tx = x, tz = z;
  if (cellAt(grid, tx, tz).blocked) {
    const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [tx + dx, tz + dz])
      .find(([nx, nz]) => inBounds(nx, nz) && !cellAt(grid, nx, nz).blocked);
    if (!free) { v.target = null; v.path = null; return; }
    [tx, tz] = free;
  }
  v.target = [x, z];
  v.path = findPath(grid, Math.round(v.x), Math.round(v.z), tx, tz);
  // If no path exists (villager enclosed by blocked cells, or target
  // cut off), keep the target: the step loop walks directly toward it.
  // Clearing the target here froze villagers in place until they
  // starved — the bug behind the day-2 deaths in seed 7.
}

export function generateCorridor(grid, x0, z0, x1, z1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0), 1);
  const seen = new Set();
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (x1 - x0) * (i / steps));
    const z = Math.round(z0 + (z1 - z0) * (i / steps));
    const [ccx, ccz] = chunkOf(x, z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const nx = ccx + dx, nz = ccz + dz;
      if (nx < 0 || nz < 0 || nx >= CHUNKS_ACROSS || nz >= CHUNKS_ACROSS) continue;
      const k = chunkKey(nx, nz);
      if (!seen.has(k)) { seen.add(k); getChunk(grid, nx, nz); }
    }
  }
}

// Send a caravan from one village to another. The path is computed
// FIRST: no path means no trade and nothing moves. Goods leave the
// origin stockpile at dispatch; the exchange settles at arrival.
