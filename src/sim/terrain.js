// GodCiv sim terrain: seed-deterministic height, lakes, old-block
// generation, village sites and village records.
import { CHUNK, NAMES, OLD_SIZE, WORLD_SIZE, inBounds, mulberry32 } from "./core.js";

// --- chunks: the map, cut up (DEFENSE-AND-MAP-DESIGN.md sections 1-3) ---
// A chunk is 16x16 cells, generated deterministically from the seed the
// first time anything needs it. Ungenerated chunks cost nothing: no
// arrays, no save bytes. The old 48x48 block reproduces bit-for-bit
// from the original RNG stream (generateOldBlock); new land comes
// from integer hashes of (seed, chunk, cell), never from a shared
// stream, so generation order cannot change a cell.

// Pure integer hash -> [0,1). Same inputs, same output, every load.
export function hash01(seed, a, b, salt = 0) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ Math.imul(a | 0, 0x85ebca6b), 0xc2b2ae35);
  h = Math.imul(h ^ Math.imul(b | 0, 0x27d4eb2f), 0x165667b1);
  h = Math.imul(h ^ Math.imul(salt | 0, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

const _latticeCache = new Map();
function latticeForSeed(seed) {
  let coarse = _latticeCache.get(seed);
  if (!coarse) {
    const rng = mulberry32(seed);
    coarse = [];
    for (let i = 0; i < 9; i++) { coarse.push([]); for (let j = 0; j < 9; j++) coarse[i].push(rng()); }
    _latticeCache.set(seed, coarse);
  }
  return coarse;
}
function latticeValue(seed, lx, lz) {
  if (lx >= 0 && lx <= 8 && lz >= 0 && lz <= 8) return latticeForSeed(seed)[lx][lz];
  return hash01(seed, lx, lz, 101);
}
// Terrain height. The noise span stays pinned at 48 (OLD_SIZE): the
// formula is (x / 48) * 8 at every map size, so the old world's
// heights never shift. The lattice extends past 8x8 by hash.
export function terrainHeight(seed, x, z) {
  const gx = (x / OLD_SIZE) * 8, gz = (z / OLD_SIZE) * 8;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0;
  const s = (t) => t * t * (3 - 2 * t);
  const a = latticeValue(seed, x0, z0), b = latticeValue(seed, x0 + 1, z0);
  const c = latticeValue(seed, x0, z0 + 1), d = latticeValue(seed, x0 + 1, z0 + 1);
  return a + (b - a) * s(fx) + (c - a) * s(fz) + (a - b - c + d) * s(fx) * s(fz);
}
// A new-territory lake, if this chunk hashes to one: about 1 chunk in
// 12, a disc of radius 3-6 at a hashed center, only where the noise
// height is low. Pure function of (seed, chunk).
export function chunkLake(seed, cx, cz) {
  if (hash01(seed, cx, cz, 301) >= 1 / 12) return null;
  const lx = Math.floor(hash01(seed, cx, cz, 302) * CHUNK);
  const lz = Math.floor(hash01(seed, cz, cx, 302) * CHUNK);
  const r = 3 + Math.floor(hash01(seed, cx, cz, 303) * 4);
  return { x: cx * CHUNK + lx, z: cz * CHUNK + lz, r };
}
function isLandAt(seed, x, z) {
  const h = terrainHeight(seed, x, z);
  if (x < OLD_SIZE && z < OLD_SIZE) return !(Math.hypot(x - 36, z - 36) < 6.5 && h < 0.62);
  const lake = chunkLake(seed, Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  return !(lake && Math.hypot(x - lake.x, z - lake.z) < lake.r && h < 0.62);
}

// The original 48x48 generation, verbatim: same RNG draw order, same
// clearing, same farm plots, same tree/stone rejection loops. This is
// what the migration test proves identical against the snapshot.
function generateOldBlock(seed) {
  const S = OLD_SIZE;
  // The old code ran terrain and villagers off ONE rng: the village
  // stream starts where the terrain stream stops. Count the draws
  // so newWorld can fast-forward a fresh instance to the same spot
  // (the block is memoized, so the instance itself cannot be reused).
  const base = mulberry32(seed);
  let draws = 0;
  const rng = () => { draws++; return base(); };
  const cells = [];
  const coarse = [];
  for (let i = 0; i < 9; i++) { coarse.push([]); for (let j = 0; j < 9; j++) coarse[i].push(rng()); }
  const noiseAt = (x, z) => {
    const gx = (x / S) * 8, gz = (z / S) * 8;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = gx - x0, fz = gz - z0;
    const s = (t) => t * t * (3 - 2 * t);
    const a = coarse[x0][z0], b = coarse[Math.min(8, x0 + 1)][z0];
    const c = coarse[x0][Math.min(8, z0 + 1)], d = coarse[Math.min(8, x0 + 1)][Math.min(8, z0 + 1)];
    return a + (b - a) * s(fx) + (c - a) * s(fz) + (a - b - c + d) * s(fx) * s(fz);
  };
  const cx = 24, cz = 24;
  const lake = { x: 36, z: 36, r: 6.5 };
  const inB = (x, z) => x >= 0 && z >= 0 && x < S && z < S;
  for (let x = 0; x < S; x++) {
    cells.push([]);
    for (let z = 0; z < S; z++) {
      const h = noiseAt(x, z);
      const dLake = Math.hypot(x - lake.x, z - lake.z);
      const dCenter = Math.hypot(x - cx, z - cz);
      const water = dLake < lake.r && h < 0.62;
      cells[x].push({
        h, water, blocked: water, road: false,
        tree: false, stone: 0, ore: 0, crop: -1, cropGrow: 0,
        building: null, farm: false,
      });
      void dCenter;
    }
  }
  for (let x = cx - 6; x <= cx + 6; x++) for (let z = cz - 6; z <= cz + 6; z++) {
    if (!inB(x, z)) continue;
    cells[x][z].water = false; cells[x][z].blocked = false; cells[x][z].tree = false; cells[x][z].stone = 0;
  }
  const farmCells = [];
  for (let x = cx - 6; x <= cx - 4; x++) for (let z = cz - 1; z <= cz + 1; z++) { cells[x][z].farm = true; cells[x][z].crop = 0; cells[x][z].cropGrow = rng() * 20; farmCells.push([x, z]); }
  for (let x = cx - 6; x <= cx - 4; x++) for (let z = cz + 3; z <= cz + 5; z++) { cells[x][z].farm = true; cells[x][z].crop = 0; cells[x][z].cropGrow = rng() * 20; farmCells.push([x, z]); }
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rng() * S), z = Math.floor(rng() * S);
    if (cells[x][z].water || Math.hypot(x - cx, z - cz) < 8 || cells[x][z].farm) continue;
    cells[x][z].tree = true; cells[x][z].blocked = true;
  }
  const stoneSpots = [];
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(rng() * S), z = Math.floor(rng() * S);
    if (cells[x][z].water || Math.hypot(x - cx, z - cz) < 7 || cells[x][z].tree || cells[x][z].farm) continue;
    cells[x][z].stone = 8 + Math.floor(rng() * 5);
    cells[x][z].ore = cells[x][z].h > 0.55 && rng() < 0.6 ? 4 + Math.floor(rng() * 3) : 0;
    cells[x][z].blocked = true;
    stoneSpots.push([x, z]);
  }
  return { cells, farmCells, stoneSpots, draws };
}

export function oldBlockFor(grid) {
  if (!grid._oldBlock) grid._oldBlock = generateOldBlock(grid.seed);
  return grid._oldBlock;
}

// Neighbor-village sites, picked deterministically from the seed.
// Pure functions only: no chunk is generated to pick a site, so this
// is cheap enough to run on every load (and memoized per seed).
const _siteCache = new Map();
export function pickVillageSites(seed, count = 2) {
  const cached = _siteCache.get(seed);
  if (cached) return cached;
  const scored = [];
  for (let x = 0; x < WORLD_SIZE; x++) for (let z = 0; z < WORLD_SIZE; z++) {
    if (Math.hypot(x - 24, z - 24) < 60) continue;
    if (x < OLD_SIZE && z < OLD_SIZE) continue;
    if (!isLandAt(seed, x, z)) continue;
    let trees = 0, stones = 0;
    for (let i = 0; i < 16; i++) {
      const sx = x + Math.floor(hash01(seed, i, x, 401) * 21) - 10;
      const sz = z + Math.floor(hash01(seed, i, z, 402) * 21) - 10;
      if (!inBounds(sx, sz) || !isLandAt(seed, sx, sz)) continue;
      if (hash01(seed, sx, sz, 201) < 0.039) trees++;
      if (hash01(seed, sx, sz, 202) < 0.013) stones++;
    }
    scored.push({ x, z, score: trees * 2 + stones * 3 + hash01(seed, x, z, 403) });
  }
  scored.sort((a, b) => b.score - a.score);
  const sites = [];
  for (const c of scored) {
    if (sites.length >= count) break;
    if (sites.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 50)) continue;
    sites.push({ x: c.x, z: c.z });
  }
  _siteCache.set(seed, sites);
  return sites;
}

export const VILLAGE_NAMES = ["Emberford", "Stonehollow", "Millbrook", "Aldergate", "Fenwick", "Cinderhold"];
// A neighbor village's abstract record (design section 13.2). Data
// only: the abstract dawn tick, activation, and diplomacy arrive in
// Phase F. Age-matched backstory, derived from the seed: the same
// seed gives the same neighbors every time, no roll at load.
export function makeVillageRecord(seed, id, site, otherIds = []) {
  const stockpile = {
    food: 40 + Math.floor(hash01(seed, id, 11, 501) * 41),
    wood: 30 + Math.floor(hash01(seed, id, 12, 501) * 31),
    stone: 10 + Math.floor(hash01(seed, id, 13, 501) * 21),
    ore: Math.floor(hash01(seed, id, 14, 501) * 8),
    fish: Math.floor(hash01(seed, id, 15, 501) * 20),
    meat: Math.floor(hash01(seed, id, 16, 501) * 12),
  };
  const relations = {};
  for (const oid of otherIds) relations[oid] = 0;
  relations[0] = 0;
  return {
    id, name: VILLAGE_NAMES[(id - 1) % VILLAGE_NAMES.length],
    center: [site.x, site.z],
    leaderName: NAMES[Math.floor(hash01(seed, id, 1, 503) * NAMES.length)],
    known: false, active: false,
    pop: 8 + Math.floor(hash01(seed, id, 2, 501) * 9),
    popCap: 20,
    stockpile, coins: 10 + Math.floor(hash01(seed, id, 3, 501) * 21),
    techLevel: 1 + Math.floor(hash01(seed, id, 4, 501) * 2), techProgress: 0,
    morale: 45 + Math.floor(hash01(seed, id, 5, 501) * 11),
    buildings: { towncenter: 1, hut: 2, granary: 1 },
    relations, foundedDay: 1, lastContactDay: 0, warExhaustion: 0,
    jobMix: { farmer: 0.4, woodcutter: 0.2, miner: 0.15, fisher: 0.1, hunter: 0.05, builder: 0.05, hauler: 0.05 },
    // Phase F diplomacy state. traderDay is deterministic from the
    // seed: the village's one first-season trader visit, staggered.
    traderDay: 2 + Math.floor(hash01(seed, id, 7, 504) * 8),
    traderSent: false, lastEvent: null, tradeSeason: -1, contactSeason: -1,
    activeDay: 0, lastTriggerDay: 0,
    // Phase G alliance state. allies holds village ids (0 is the
    // player's village); allyOffer is a pending proposal from
    // another leader; allyCooldownDay is the first day a new
    // alliance with anyone may form after a break.
    allies: [], allyOffer: null, allyCooldownDay: 0,
  };
}
