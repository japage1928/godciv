// GodCiv sim: owns the truth. No DOM, no Three.js in here, so it can be
// tested headlessly with node. Ported from the Luanti mod in
// ~/workspace/godciv/mods/godciv/ — same rules: utility brain runs every
// villager, the god never directly controls a villager, a local model only
// ever advises the leader. The model never writes state directly.

// Save format version. v10 wrote version 2; v11 writes 3; v12 writes 4;
// v13 writes 5: chunked 320x320 world, guards, neighbor villages.
// See the migration pattern in deserialize().
export const SAVE_VERSION = 5;
// The world is cut into 16x16 chunks, Minecraft-style: only generated
// chunks hold cells, only active chunks tick. Map size 320x320
// (20x20 chunks, 102,400 cells, 44.4x the old 48x48 area). The old
// 48x48 block keeps its exact coordinates: center (24,24), chunk (1,1).
export const WORLD_SIZE = 320;
export const CHUNK = 16;
export const OLD_SIZE = 48;
export const SIZE = WORLD_SIZE; // map side; kept as the name the UI/tests already use
export const CHUNKS_ACROSS = WORLD_SIZE / CHUNK;
export const DAY_LENGTH = 180; // sim seconds per day: 45 real seconds at 4x, 22.5 at 8x
export const JOBS = ["farmer", "woodcutter", "miner", "fisher", "hunter", "builder", "hauler", "teacher", "guard"];
export const TRAITS = ["devout", "skeptic", "brave", "cautious", "industrious", "lazy", "kind", "greedy"];
export const NAMES = ["Ash", "Bram", "Cora", "Dun", "Elowen", "Fenn", "Greta", "Hob", "Ilsa", "Jory", "Kessa", "Lorn", "Mira", "Nils", "Odessa", "Perrin", "Quill", "Rosa", "Soren", "Tilda", "Ulric", "Vera", "Wren", "Yannick"];

// Economy: fixed market prices in coins. Villagers keep personal goods,
// trade them with each other at the town-center market, and buy food
// from the communal stockpile. Nobody starves for poverty: a villager
// with no coins still gets a communal ration.
export const PRICES = { food: 2, fish: 2, meat: 3, wood: 1, stone: 1, ore: 4 };
export const BUILD_COSTS = {
  hut: { wood: 12, stone: 6 },
  granary: { wood: 20, stone: 10 },
  well: { wood: 8, stone: 6 },
  workshop: { wood: 15, stone: 10, ore: 4 },
  shrine: { wood: 10, stone: 6 },
  marker: { wood: 2, stone: 0 },
  longhouse: { wood: 20, stone: 10 },
  greathall: { wood: 30, stone: 15 },
  farmhouse: { wood: 15, stone: 6 },
  school: { wood: 18, stone: 12 },
  healer: { wood: 16, stone: 8 },
  wall: { wood: 6, stone: 4 },
  tower: { wood: 10, stone: 14, ore: 2 },
};
export const CHILD_DAYS = 3; // a newborn works after 3 dawns
export const ELDER_DAYS = 45; // old-age death rolls start here
export const SCHOOL_MAX_AGE = 8; // students are 3..8 dawns old, then workers
export const SEASON_DAYS = 10; // days per season, 4 seasons per year
export const YEAR_DAYS = SEASON_DAYS * 4;
export const SEASONS = ["spring", "summer", "autumn", "winter"];
export const SEASON_NAMES = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };
export const SEASON_GROWTH = { spring: 1.2, summer: 1.3, autumn: 0.9, winter: 0.25 };
export const SEASON_HUNGER = { spring: 0, summer: 0.04, autumn: 0, winter: 0.08 };
export const SEASON_KEEP = { spring: 60, summer: 45, autumn: 60, winter: 80 }; // spoilage cap without a granary
// Festival days are days of the year (1-based): bloom, games, harvest, feast.
export const FESTIVALS = { 5: "Spring Bloom", 15: "Midsummer Games", 28: "Harvest Festival", 35: "Midwinter Feast" };
export const FESTIVAL_COST_FOOD = 10;
export const FESTIVAL_MIN_EDIBLE = 20;
export const FESTIVAL_MIN_FAITH = 25; // a village that has lost its faith does not feast
export const WEATHER_KINDS = ["clear", "rain", "storm", "snow", "heat"];
// Chance of each weather kind by season. Rows sum to 1.
export const WEATHER_BY_SEASON = {
  spring: { clear: 0.45, rain: 0.35, storm: 0.10, heat: 0.05, snow: 0.05 },
  summer: { clear: 0.45, rain: 0.25, storm: 0.15, heat: 0.15, snow: 0 },
  autumn: { clear: 0.45, rain: 0.30, storm: 0.15, heat: 0.05, snow: 0.05 },
  winter: { clear: 0.40, rain: 0.10, storm: 0.10, heat: 0, snow: 0.40 },
};
export const TOOL_NAMES = ["crude", "sturdy", "fine", "steel"];
export const TOOL_COSTS = [null, { coins: 6, ore: 1 }, { coins: 12, ore: 2 }, { coins: 20, ore: 4 }];
// Tech tiers are the long arc: hamlet to modern city. Each tier is an
// era step with a concrete unlock, not just paint. Thresholds rise so
// a 30-day run reaches the first one or two tiers and the modern city
// stays a long-term goal. Population gates the later tiers: a city
// needs citizens, not just clever ones.
export const TECH_TIERS = [
  { name: "Stone tools", era: "Hamlet", blurb: "Crude tools and open fires." },
  { name: "Bronze craft", era: "Hamlet", blurb: "Better harvests, steadier workshop work." },
  { name: "Iron craft", era: "Village", blurb: "Fine tools, a healer's hut, richer harvests." },
  { name: "Steel works", era: "Town", blurb: "Steel tools, stouter walls, richer harvests." },
  { name: "Steam and brick", era: "Town", blurb: "Builders work twice as fast, mills grind more grain." },
  { name: "Electric age", era: "City", blurb: "Lamps light the streets, work runs faster." },
  { name: "Modern city", era: "Modern city", blurb: "Glass towers, fast work, room for many more souls." },
];
export const TECH_THRESHOLD = 80; // progress points for the first tier; later tiers cost more
export function techThresholdFor(level) { return [80, 120, 200, 300, 420, 560][level] ?? 560; }
export const ERA_POP_GATE = [0, 0, 0, 14, 20, 26, 32]; // population needed to enter each tier
// Visual era stage the renderer reads: 0 timber/thatch, 1 stone/tile,
// 2 brick/paved, 3 concrete/glass. The village visibly grows up.
export function eraStageOf(level) { return level <= 1 ? 0 : level === 2 ? 1 : level <= 4 ? 2 : 3; }
export const ERA_STAGE_NAMES = ["Timber hamlet", "Stone village", "Brick town", "Modern city"];

export function seasonOf(day) { return SEASONS[Math.floor((day - 1) / SEASON_DAYS) % 4]; }
export function yearOf(day) { return Math.floor((day - 1) / YEAR_DAYS) + 1; }
export function yearDayOf(day) { return ((day - 1) % YEAR_DAYS) + 1; }
// Night is 0.00-0.22 and 0.84-1.00; dawn 0.22-0.32, day 0.32-0.72, dusk 0.72-0.84.
export function phaseOf(time) {
  if (time < 0.22 || time >= 0.84) return "night";
  if (time < 0.32) return "dawn";
  if (time < 0.72) return "day";
  return "dusk";
}
export function nextFestival(day) {
  const yd = yearDayOf(day);
  for (let d = yd; d <= YEAR_DAYS; d++) if (FESTIVALS[d]) return { name: FESTIVALS[d], inDays: d - yd };
  const first = Number(Object.keys(FESTIVALS)[0]);
  return { name: FESTIVALS[first], inDays: YEAR_DAYS - yd + first };
}
export function rollWeather(state) {
  const table = WEATHER_BY_SEASON[seasonOf(state.day)];
  let r = state._rng();
  let kind = "clear";
  for (const k of WEATHER_KINDS) { r -= table[k] || 0; if (r <= 0) { kind = k; break; } }
  const until = state.elapsed + 30 + state._rng() * 60;
  return { kind, until };
}
export function isStudent(state, v) {
  const school = ownBuildings(state).some((b) => b.type === "school");
  return school && (v.ageDays ?? 25) >= CHILD_DAYS && (v.ageDays ?? 25) <= SCHOOL_MAX_AGE;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const key = (x, z) => x + "," + z;
const inBounds = (x, z) => x >= 0 && z >= 0 && x < SIZE && z < SIZE;

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

function oldBlockFor(grid) {
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

// --- diplomacy helpers: relations, bands, seasons, village scope ---

// The villages' own random stream: distant-village life (abstract
// ticks, activation spawns, foreign wandering) draws here, never
// from the player's stream, so a neighbor's dawn can never shift
// what the player's villagers do next. Deterministic per seed;
// rebuilt on load like the main stream.
export function villageRng(state) {
  if (!state._vrng) state._vrng = mulberry32(((state.seed || 0) ^ 0x5f3759df) >>> 0);
  return state._vrng;
}

export function villageRecord(state, id) {
  return (state.villages || []).find((r) => r.id === id) || null;
}

export function seasonKey(state) {
  return yearOf(state.day) * 4 + SEASONS.indexOf(state.season);
}

export function relationBand(value) {
  if (value <= -70) return "Hostile";
  if (value <= -40) return "Rival";
  if (value < 0) return "Wary";
  if (value < 30) return "Neutral";
  if (value < 60) return "Friendly";
  return "Allied";
}

// The relation value for a pair. Village 0 is the player's village,
// which has no record: its side of every pair lives in the neighbor's
// record (relations[0]). Neighbor pairs keep both views equal.
export function getRelation(state, a, b) {
  if (a === b) return 100;
  const rec = villageRecord(state, a === 0 ? b : a);
  if (!rec) return 0;
  return rec.relations[a === 0 ? 0 : b] ?? 0;
}

export function setRelation(state, a, b, value) {
  const v = clamp(Math.round(value), -100, 100);
  const write = (rec, key) => { if (rec) rec.relations[key] = v; };
  if (a === 0 || b === 0) {
    const rec = villageRecord(state, a === 0 ? b : a);
    const before = getRelation(state, a, b);
    write(rec, 0);
    if (rec && rec.known) logRelationBand(state, rec, before, v);
  } else {
    const ra = villageRecord(state, a), rb = villageRecord(state, b);
    write(ra, b); write(rb, a);
  }
  // An alliance breaks the moment relations fall under 20, no
  // matter what moved them: trade, robbery, drift, or mourning.
  if (a !== b && allied(state, a, b) && v < 20) {
    breakAlliance(state, a, b, "relations fell under 20");
  }
  return v;
}

function logRelationBand(state, rec, before, after) {
  const b0 = relationBand(before), b1 = relationBand(after);
  if (b0 !== b1) log(state, rec.name + " is now " + b1 + ".");
}

export function adjustRelation(state, a, b, delta) {
  return setRelation(state, a, b, getRelation(state, a, b) + delta);
}

export function villageName(state, id) {
  if (id === 0) return "Your village";
  const rec = villageRecord(state, id);
  return rec ? rec.name : "Village " + id;
}

// The live headcount of a village: real villagers while active,
// the record's pop while abstract.
export function villagePop(state, rec) {
  if (!rec) return 0;
  if (rec.active) return state.villagers.filter((v) => v.village === rec.id).length;
  return rec.pop || 0;
}

// Alliances live on the records, symmetric: the higher id's record
// is the pair's home, and both records list each other.
export function allied(state, a, b) {
  if (a === b) return false;
  const rec = villageRecord(state, Math.max(a, b));
  if (!rec) return false;
  return (rec.allies || []).includes(Math.min(a, b));
}

export function allianceCooldownOk(state, a, b) {
  const recs = [villageRecord(state, a), villageRecord(state, b)].filter(Boolean);
  return recs.every((r) => state.day >= (r.allyCooldownDay || 0));
}

export function formAlliance(state, a, b) {
  if (allied(state, a, b)) return false;
  for (const [id, other] of [[a, b], [b, a]]) {
    const rec = villageRecord(state, id);
    if (!rec) continue;
    if (!Array.isArray(rec.allies)) rec.allies = [];
    if (!rec.allies.includes(other)) rec.allies.push(other);
    if (rec.allyOffer && rec.allyOffer.from === other) rec.allyOffer = null;
  }
  log(state, villageName(state, a) + " and " + villageName(state, b) + " are allies. Caravans grow, and guards will answer a raid.");
  return true;
}

export function breakAlliance(state, a, b, reason, cooldownDays = ALLIANCE_COOLDOWN_DAYS) {
  if (!allied(state, a, b)) return false;
  for (const id of [a, b]) {
    const rec = villageRecord(state, id);
    if (!rec) continue;
    rec.allies = (rec.allies || []).filter((o) => o !== (id === a ? b : a));
    rec.allyCooldownDay = state.day + cooldownDays;
    if (rec.allyOffer && (rec.allyOffer.from === a || rec.allyOffer.from === b)) rec.allyOffer = null;
  }
  log(state, "The alliance between " + villageName(state, a) + " and " + villageName(state, b) + " breaks: " + reason + ".");
  return true;
}

export function ownVillagers(state) {
  return state.villagers.filter((v) => (v.village ?? 0) === 0);
}

export function ownBuildings(state) {
  return state.buildings.filter((b) => (b.village ?? 0) === 0);
}

// The stockpile a village trades from: the player's global pile, or
// the neighbor record's own pile (the same object the abstract tick
// and trade write, so activation never copies goods anywhere).
export function stockpileFor(state, villageId) {
  if (villageId === 0) return state.stockpile;
  const rec = villageRecord(state, villageId);
  return rec ? rec.stockpile : state.stockpile;
}

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
  grid._indexDirty = true;
  const ch = peekChunk(grid, Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  if (ch) { ch.dirty = true; ch.shore = null; }
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

// --- active chunks (design section 2) ---
export const ACTIVE_RADIUS_CHUNKS = 2;
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

export function newWorld(seed) {
  // The old 48x48 block generates from the original stream, untouched
  // (generateOldBlock); the sim's own RNG is the SAME stream the old
  // code ran, fast-forwarded past the terrain draws (generateOldBlock
  // counts them), so the village's luck is unchanged by the refactor.
  const grid = createGrid(seed);
  const block = oldBlockFor(grid);
  const rng = mulberry32(seed);
  for (let i = 0; i < block.draws; i++) rng();
  const sites = pickVillageSites(seed, 2);
  grid._villageSites = sites;
  // Materialize the 9 old chunks now: the village lives here.
  for (let cx = 0; cx < 3; cx++) for (let cz = 0; cz < 3; cz++) getChunk(grid, cx, cz);
  const cx = 24, cz = 24;
  const farmCells = [...block.farmCells];

  const state = {
    version: SAVE_VERSION, seed, day: 1, time: 0.3, speed: 1, paused: false,
    stockpile: { food: 24, wood: 24, stone: 12, ore: 0, fish: 0, meat: 0 },
    faith: 55, morale: 60, moraleReasons: [], populationCap: 12, expandAt: 10, delegateAt: 5,
    season: "spring", weather: { kind: "clear", until: 60 },
    celebration: null, celebrationBoostUntil: -1,
    tech: { level: 0, progress: 0 },
    lowMoraleDawns: 0, lastLeaveAt: -1e9, stormAt: -1e9,
    directive: null, // { focusJob } — a nudge, not an order
    buildQueue: [], // {type,x,z,progress,needWood,needStone}
    buildings: [
      { type: "towncenter", x: cx, z: cz, builtDay: 1 },
      { type: "altar", x: cx + 2, z: cz, builtDay: 1 },
      { type: "hut", x: cx - 2, z: cz - 3, done: true, builtDay: 1 },
    ],
    villagers: [], deer: [], log: [],
    // Raiders are transient: they live only in a running world, never
    // in a save. raidActive persists so a load mid-raid can log that
    // the raid scattered; the raiders themselves do not survive it.
    raiders: [], raidActive: false, raidPendingDay: 0, lastRaidDay: -1e9, raidUntil: -1,
    nextRaiderId: 1,
    effects: { droughtUntil: -1, floodUntil: -1, plagueUntil: -1 },
    cooldowns: {}, stats: { births: 0, deaths: 0, blessings: 0, trades: 0, leaves: 0, celebrations: 0, plagues: 0 },
    fund: 20, marketAt: 30, rateHistory: [], spoiled: 0,
    nextVillagerId: 1, nextDeerId: 1, elapsed: 0,
    // Neighbor villages: records only until Phase F wakes them.
    // The player's village is id 0; records 1 and 2 are neighbors.
    villageSites: sites,
    villages: sites.map((s, i) => makeVillageRecord(seed, i + 1, s, sites.map((_, j) => j + 1).filter((id) => id !== i + 1))),
    caravans: [], warParties: [], nextCaravanId: 1, nextWarPartyId: 1,
    pendingEnvoys: [], tradeSeasons: {}, _villageSeasonKey: -1,
  };
  for (const b of state.buildings) cellAt(grid, b.x, b.z).building = b.type;
  state.rngState = null; // runtime only, rebuilt on load
  state._rng = rng;
  state._vrng = mulberry32((seed ^ 0x5f3759df) >>> 0);
  state._farmCells = farmCells;
  state._oreSpots = oldBlockFor(grid).stoneSpots.filter(([x, z]) => cellAt(grid, x, z).ore > 0);
  state._cx = cx; state._cz = cz;

  const spawnSpots = [[cx + 1, cz + 1], [cx - 1, cz + 1], [cx + 1, cz - 1], [cx - 1, cz - 1], [cx, cz + 2], [cx + 2, cz + 2]];
  for (let i = 0; i < 6; i++) state.villagers.push(makeVillager(state, spawnSpots[i][0], spawnSpots[i][1], i === 0));
  for (let i = 0; i < 4; i++) state.deer.push(makeDeer(state, cx + 8 + i * 2, cz + 8));
  for (const b of state.buildings) { if (b.builtDay == null) b.builtDay = 1; if (b.village == null) b.village = 0; }
  pavePlaza(grid, cx, cz);
  assignHomes(state);
  delegateRoles(state, grid);
  log(state, "The village wakes. Six villagers look to the sky, waiting for a sign.");
  return { state, grid };
}

export function makeVillager(state, x, z, leader = false, opts = {}) {
  const rng = opts.rng || state._rng;
  const traits = [];
  while (traits.length < 2) { const t = TRAITS[Math.floor(rng() * TRAITS.length)]; if (!traits.includes(t)) traits.push(t); }
  const skills = {};
  for (const j of JOBS) skills[j] = Math.floor(rng() * 3);
  const id = state.nextVillagerId++;
  const goods = {};
  for (const g of Object.keys(PRICES)) goods[g] = 0;
  return {
    id, name: opts.name || NAMES[(id - 1) % NAMES.length] + (id > NAMES.length ? " " + Math.ceil(id / NAMES.length) : ""),
    x, z, path: null, pathTarget: null, job: opts.job || JOBS[Math.floor(rng() * JOBS.length)],
    village: opts.village ?? 0,
    traits, skills, leader,
    ageDays: opts.ageDays ?? (18 + Math.floor(rng() * 22)),
    sex: rng() < 0.5 ? "F" : "M",
    coins: opts.coins ?? 5, goods, home: null, toolTick: 0,
    // Adults arrive with some schooling; newborns start unschooled.
    education: opts.education ?? (opts.ageDays === 0 ? 0 : 2 + Math.floor(rng() * 4)),
    tool: opts.tool ?? 0, // 0 crude, 1 sturdy, 2 fine
    hunger: 15 + rng() * 20, energy: 75 + rng() * 20, health: 100, fear: 0,
    carry: null, carryCap: 5, state: "idle", workTimer: 0, target: null,
    sick: false, rethinkAt: 0, stuckAt: 0, lastX: x, lastZ: z, personalFocus: null,
    assignedJob: null, delegated: false,
  };
}

// --- homes: a hut houses 4, a longhouse 8, the town center shelters 4 ---

export function homeCapacity(b) {
  if (b.type === "longhouse") return 8;
  if (b.type === "greathall") return 14;
  if (b.type === "farmhouse") return 2;
  return 4;
}

export function assignHomes(state) {
  const homes = ownBuildings(state).filter((b) => ["towncenter", "hut", "longhouse", "greathall", "farmhouse"].includes(b.type));
  const occ = {};
  for (const v of ownVillagers(state)) {
    if (v.home) {
      const h = homes.find((b) => key(b.x, b.z) === v.home);
      if (h && (occ[v.home] || 0) < homeCapacity(h)) occ[v.home] = (occ[v.home] || 0) + 1;
      else v.home = null;
    }
  }
  for (const v of ownVillagers(state)) {
    if (!v.home) {
      const h = homes.find((b) => (occ[key(b.x, b.z)] || 0) < homeCapacity(b));
      if (h) { v.home = key(h.x, h.z); occ[v.home] = (occ[v.home] || 0) + 1; }
    }
  }
}

export function homelessCount(state) { return ownVillagers(state).filter((v) => !v.home).length; }

export function removeVillager(state, v, cause) {
  const foreign = (v.village ?? 0) !== 0;
  const wasLeader = v.leader;
  state.villagers = state.villagers.filter((o) => o !== v);
  if (foreign) {
    // A neighbor's loss is the neighbor's: no faith hit on the
    // player's village, no succession, no player death stat. The
    // home village's population drops when it deactivates. A
    // reinforcement who falls defending an ally is mourned by
    // both villages: relations cool by the combat rule.
    const rec = villageRecord(state, v.village);
    log(state, v.name + " of " + (rec ? rec.name : "a neighbor village") + " dies (" + cause + ").");
    if (v.reinforcement) {
      adjustRelation(state, 0, v.village, ALLIED_GUARD_DEATH_RELATION);
      log(state, (rec ? rec.name : "The neighbor village") + " mourns a guard fallen defending an ally (" + ALLIED_GUARD_DEATH_RELATION + ").");
    }
    return;
  }
  state.faith = clamp(state.faith - 3, 0, 100); state.stats.deaths++;
  log(state, v.name + " dies (" + cause + "). Faith falls.");
  if (wasLeader) {
    const next = ownVillagers(state)[0];
    if (next) {
      next.leader = true;
      log(state, next.name + " takes up the leader's staff.");
    }
  }
}

export function makeDeer(state, x, z) {
  const id = state.nextDeerId++;
  return { id, x: clamp(x, 1, SIZE - 2), z: clamp(z, 1, SIZE - 2), tx: null, tz: null, retargetAt: 0, fleeing: false };
}

export function log(state, text) {
  state.log.unshift({ day: state.day, time: state.time, text });
  if (state.log.length > 60) state.log.length = 60;
}

// --- brain: utility scoring, ported from brain.lua ---

function refusesDirective(state, v, job) {
  if (!state.directive || state.directive.focusJob !== job) return false;
  const faith = state.faith;
  let p = 0.05;
  if (v.traits.includes("skeptic")) p += 0.22;
  if (v.traits.includes("devout")) p -= 0.04;
  if (v.traits.includes("greedy")) p += 0.08;
  if (faith < 40) p += 0.15; else if (faith > 70) p -= 0.03;
  if (v.fear > 40) p += 0.1;
  return state._rng() < clamp(p, 0, 0.6);
}

function refusesAssignment(state, v) {
  let p = 0.08;
  if (v.traits.includes("skeptic")) p += 0.18;
  if (v.traits.includes("devout")) p -= 0.03;
  if (v.traits.includes("greedy")) p += 0.06;
  if (state.faith < 40) p += 0.12;
  if (v.fear > 40) p += 0.08;
  // Low morale makes villagers balk; high morale makes them follow.
  if ((state.morale ?? 60) < 35) p += 0.12;
  if ((state.morale ?? 60) > 75) p -= 0.04;
  return state._rng() < clamp(p, 0, 0.5);
}

// Is there any fishable shore on the map? (A land cell next to water.)
// Answered from per-chunk shore flags over generated chunks only.
export function hasShore(grid) {
  return hasShoreGrid(grid);
}

// Leader delegation: the leader looks at what the village needs and
// assigns a job to each villager. Delegation is a strong nudge, not an
// order — a villager can still refuse it (see think()). The god never
// assigns jobs; only the leader does, and only the leader is advised by
// the council/Ollama layer.
export function delegateRoles(state, grid = null) {
  // Students go to school, not to work; toddlers stay home. Only the
  // player's own villagers are delegated: neighbor villagers keep
  // their own hours under their own leader.
  const villagers = ownVillagers(state).filter((v) => (v.ageDays ?? 25) >= CHILD_DAYS && !isStudent(state, v));
  // A god-suggested trade waits for the leader's judgment at
  // delegation. The leader accepts only on a real surplus, a real
  // deficit, warm enough relations, and a free season; otherwise
  // the suggestion is refused with the reason in the log. The
  // suggestion clears either way: the leader has weighed it. This
  // runs before the empty-village return: the decision is the
  // leader's, not the workforce's. With no grid (a headless
  // delegation) the suggestion waits.
  const suggestion = state.directive && state.directive.suggestTrade;
  if (suggestion && grid) {
    state.directive.suggestTrade = null;
    weighTradeSuggestion(state, grid, suggestion);
  }
  // A god-suggested alliance waits for the same judgment: the
  // leader proposes only on warm enough relations, a free
  // cooldown, and no pending offer. The suggestion clears either
  // way. The neighbor leader answers at dawn.
  const allySuggestion = state.directive && state.directive.suggestAlliance;
  if (allySuggestion && grid) {
    state.directive.suggestAlliance = null;
    weighAllianceSuggestion(state, allySuggestion);
  }
  if (!villagers.length) return;
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const pop = villagers.length;
  const hutCount = state.buildings.filter((b) => b.type === "hut").length;
  const demands = grid ? computeDemands(state, grid) : [];
  const farmCells = state._farmCells ? state._farmCells.length : 18;
  const shore = grid ? hasShore(grid) : true;
  const hasSchool = state.buildings.some((b) => b.type === "school");
  const desired = {
    // Farmers scale with the fields, not just mouths: the labor force
    // has to keep up as farm beds are added.
    farmer: clamp(Math.max(Math.ceil(pop / 3), Math.ceil(farmCells / 9)), 1, 5),
    // Fishers are a standing food source, not an emergency measure:
    // one fisher once the village can spare them, two as it grows,
    // whenever a fishable shore exists. (Before v8, fishers were only
    // delegated when food was already short, so with a full stockpile
    // a village never saw a fisher at all.)
    fisher: shore ? (pop >= 14 ? 2 : pop >= 6 ? 1 : 0) : 0,
    hunter: edible < 25 || (s.meat === 0 && pop >= 10) ? 1 : 0,
    woodcutter: (s.wood < 25 || state.buildQueue.length) ? 2 : 1,
    miner: (s.stone < 20 || s.ore < 4 || state.buildQueue.length) ? 2 : 1,
    // Anticipate building: a builder is delegated while a demand is
    // open, or from day 2 while the village still has only its founding hut.
    builder: state.buildQueue.length ? Math.min(2, pop) : (demands.length || (state.day >= 2 && hutCount < 2) ? 1 : 0),
    hauler: pop >= 8 ? 1 : 0,
    teacher: hasSchool && pop >= 6 ? 1 : 0,
    // Guards: one per tower, plus one per gate once a real wall ring
    // exists (6+ wall segments), capped at GUARD_CAP and at one third
    // of the adults. No posts, no guards.
    guard: (() => {
      const towers = state.buildings.filter((b) => b.type === "tower").length;
      const walls = state.buildings.filter((b) => b.type === "wall").length;
      return Math.min(GUARD_CAP, towers + (walls >= 6 ? 2 : 0), Math.floor(pop / 3));
    })(),
  };
  const order = ["farmer", "fisher", "hunter", "woodcutter", "miner", "builder", "hauler", "teacher", "guard"];
  let total = order.reduce((a, j) => a + desired[j], 0);
  // Trimming must not zero a job the village needs while another job
  // still holds a surplus, and must not stall building or leave
  // standing towers unmanned: the builder is the only job that turns
  // the queue into buildings (villagers follow delegation unless they
  // refuse it), and a tower without a posted guard never shoots.
  const builderWanted = state.buildQueue.length > 0 || demands.length > 0 || (state.day >= 2 && hutCount < 2);
  const towersBuilt = state.buildings.filter((b) => b.type === "tower").length;
  const guardFloor = Math.min(towersBuilt, desired.guard);
  while (total > pop) {
    let trimmed = false;
    // First trim surpluses: a job holding 2+ slots (or guards above
    // the manned-tower floor) gives one up before any job is zeroed.
    for (let i = order.length - 1; i >= 0; i--) {
      const j = order[i];
      const floor = j === "guard" ? Math.max(1, guardFloor) : 1;
      if (desired[j] > floor) { desired[j]--; total--; trimmed = true; break; }
    }
    if (trimmed) continue;
    // Every wanted job is down to one slot (or the guard floor) and
    // the village is still over strength: cut from the end, sparing
    // the builder while building is wanted and the guards manning
    // standing towers.
    for (let i = order.length - 1; i >= 0; i--) {
      const j = order[i];
      if (desired[j] > 0
        && !(j === "builder" && builderWanted && desired.builder <= 1)
        && !(j === "guard" && desired.guard <= guardFloor)) {
        desired[j]--; total--; trimmed = true; break;
      }
    }
    if (!trimmed) {
      // Last resort: only protected slots remain. Trim one rather
      // than spin forever.
      for (let i = order.length - 1; i >= 0; i--) {
        if (desired[order[i]] > 0) { desired[order[i]]--; total--; break; }
      }
    }
  }
  while (total < pop) { desired.farmer++; total++; }
  const unassigned = [...villagers];
  const assignment = new Map();
  // Guards are picked first, so the brave-first rule means something:
  // filling the other jobs first would poach the brave villagers for
  // the fields before the towers are ever manned.
  const assignOrder = ["guard", ...order.filter((j) => j !== "guard")];
  for (const job of assignOrder) {
    for (let i = 0; i < desired[job]; i++) {
      if (!unassigned.length) break;
      let bestIdx = 0;
      for (let k = 1; k < unassigned.length; k++) {
        // Guards are picked brave first, then by tool tier, then skill:
        // a guard's courage and spear matter more than practice.
        const a = unassigned[k], b = unassigned[bestIdx];
        const better = job === "guard"
          ? (a.traits.includes("brave") !== b.traits.includes("brave") ? a.traits.includes("brave")
            : (a.tool || 0) !== (b.tool || 0) ? (a.tool || 0) > (b.tool || 0)
            : (a.skills[job] ?? 0) > (b.skills[job] ?? 0))
          : a.skills[job] > b.skills[job];
        if (better) bestIdx = k;
      }
      assignment.set(unassigned[bestIdx].id, job);
      unassigned.splice(bestIdx, 1);
    }
  }
  for (const v of unassigned) assignment.set(v.id, "hauler");
  const changes = [];
  for (const v of villagers) {
    const next = assignment.get(v.id);
    if (v.assignedJob && v.assignedJob !== next) changes.push(v.name + " to " + next);
    v.assignedJob = next;
  }
  for (const v of state.villagers) if ((v.ageDays ?? 25) < CHILD_DAYS || isStudent(state, v)) v.assignedJob = null;
  if (changes.length) {
    const l = leader(state);
    log(state, (l ? l.name + " delegates: " : "Delegation: ") + changes.slice(0, 3).join(", ") + (changes.length > 3 ? " and " + (changes.length - 3) + " more." : "."));
  }
  assignGuardPosts(state);
}

function weighTradeSuggestion(state, grid, suggestion) {
  const rec = villageRecord(state, suggestion.to);
  const l = leader(state);
  const who = l ? l.name : "The leader";
  const refuse = (reason) => log(state, who + " declines the trade with " + (rec ? rec.name : "the village") + ": " + reason + ".");
  if (!rec || !rec.known) return refuse("the village is unknown");
  if (getRelation(state, 0, rec.id) < 0) return refuse("relations are too cold");
  const s = state.stockpile;
  if ((s[suggestion.give.good] || 0) - suggestion.give.qty < 5) {
    return refuse("the village cannot spare " + suggestion.give.qty + " " + suggestion.give.good);
  }
  if ((s[suggestion.want.good] || 0) >= 15) {
    return refuse("the village has enough " + suggestion.want.good + " already");
  }
  const key = pairKey(0, rec.id) + ":" + seasonKey(state);
  if ((state.tradeSeasons || {})[key]) return refuse("those villages have already traded this season");
  if ((state.caravans || []).some((c) => pairKey(c.from, c.to) === pairKey(0, rec.id))) {
    return refuse("a caravan is already on the road");
  }
  const res = dispatchCaravan(state, grid, 0, rec.id, suggestion.give, suggestion.want, false);
  if (res.ok) {
    log(state, who + " agrees to the trade with " + rec.name + ": " + suggestion.give.qty + " " + suggestion.give.good + " for " + suggestion.want.qty + " " + suggestion.want.good + ".");
  } else refuse(res.reason || "the road cannot be found");
}

function weighAllianceSuggestion(state, suggestion) {
  const rec = villageRecord(state, suggestion.to);
  const l = leader(state);
  const who = l ? l.name : "The leader";
  const refuse = (reason) => log(state, who + " declines the alliance with " + (rec ? rec.name : "the village") + ": " + reason + ".");
  if (!rec || !rec.known) return refuse("the village is unknown");
  if (allied(state, 0, rec.id)) return refuse("the villages are already allies");
  if (getRelation(state, 0, rec.id) < ALLIANCE_MIN_RELATION) {
    return refuse("relations are too cold (need " + ALLIANCE_MIN_RELATION + ")");
  }
  if (!allianceCooldownOk(state, 0, rec.id)) return refuse("a recent break must cool first");
  if (rec.allyOffer) return refuse("a proposal is already before them");
  rec.allyOffer = { from: 0, day: state.day };
  log(state, who + " proposes an alliance with " + rec.name + ". Their leader answers within " + ALLIANCE_OFFER_DAWNS + " dawns.");
}

// --- guard posts: towers first, then the four gate cells on the wall
// ring. A post is a plain {x, z, kind} record on the villager; the
// tower-manning rule reads the assignment, not the villager's position.

export function guardPosts(state) {
  const posts = [];
  for (const b of ownBuildings(state)) if (b.type === "tower") posts.push({ x: b.x, z: b.z, kind: "tower" });
  const walls = ownBuildings(state).filter((b) => b.type === "wall").length;
  if (walls >= 1) {
    const cx = state._cx, cz = state._cz;
    for (const [dx, dz, dir] of [[1, 0, "east"], [-1, 0, "west"], [0, 1, "south"], [0, -1, "north"]]) {
      const x = cx + dx * WALL_RING_R, z = cz + dz * WALL_RING_R;
      if (x < 0 || x >= SIZE || z < 0 || z >= SIZE) continue;
      // A gate cell is open ground on the ring: no building stands there.
      if (state.buildings.some((b) => (b.village ?? 0) === 0 && b.x === x && b.z === z)) continue;
      posts.push({ x, z, kind: "gate", dir });
    }
  }
  posts.sort((a, b) => (a.x - b.x) || (a.z - b.z));
  return posts;
}

export function assignGuardPosts(state) {
  const posts = guardPosts(state);
  const guards = state.villagers.filter((v) => v.assignedJob === "guard" && (v.ageDays ?? 25) >= CHILD_DAYS && !isStudent(state, v));
  // Drop posts whose tower is gone, so the guard reassigns next round.
  for (const v of guards) {
    if (v.post && !posts.some((p) => p.x === v.post.x && p.z === v.post.z)) v.post = null;
  }
  const taken = new Set();
  for (const v of guards) if (v.post) taken.add(v.post.x + "," + v.post.z);
  for (const v of guards) {
    if (v.post) continue;
    const home = v.home ? v.home.split(",").map(Number) : [state._cx, state._cz];
    const free = posts.filter((p) => !taken.has(p.x + "," + p.z));
    const towers = free.filter((p) => p.kind === "tower");
    const pool = towers.length ? towers : free;
    if (!pool.length) { v.post = null; continue; }
    pool.sort((a, b) => Math.hypot(a.x - home[0], a.z - home[1]) - Math.hypot(b.x - home[0], b.z - home[1]));
    v.post = pool[0];
    taken.add(v.post.x + "," + v.post.z);
    log(state, v.post.kind === "gate"
      ? v.name + " takes the " + (v.post.dir || "") + " gate."
      : v.name + " takes the tower.");
  }
  for (const v of state.villagers) if (v.assignedJob !== "guard" && v.post) v.post = null;
}

// Is this tower manned by a guard working the post right now?
export function towerManned(state, t) {
  return ownVillagers(state).some((v) => v.job === "guard" && v.assignedJob === "guard" && v.health > 0
    && v.post && v.post.kind === "tower" && v.post.x === t.x && v.post.z === t.z);
}

export function defenseSummary(state) {
  const walls = ownBuildings(state).filter((b) => b.type === "wall").length;
  const towers = ownBuildings(state).filter((b) => b.type === "tower");
  const guards = ownVillagers(state).filter((v) => v.assignedJob === "guard");
  return {
    walls,
    towers: towers.length,
    manned: towers.filter((t) => towerManned(state, t)).length,
    guards: guards.length,
    posted: guards.filter((v) => v.post).length,
    lastRaid: state.lastRaidLine || null,
  };
}

// Muster: every guard to its post immediately. The god holds this one
// action; the leader's matching intent (call_to_arms) runs the same
// path with raid-season validation.
export function musterGuards(state, grid = null) {
  assignGuardPosts(state);
  let n = 0;
  for (const v of state.villagers) {
    if (v.assignedJob !== "guard" || !v.post) continue;
    n++;
    if (grid) setTarget(state, grid, v, v.post.x, v.post.z);
    v.state = "work";
  }
  return n;
}

export function callToArms(state, grid = null) {
  if (!state.raidActive && !(state.raidPendingDay && state.raidPendingDay > state.day)) {
    log(state, "The call to arms is refused: no raid threatens the village.");
    return { ok: false, reason: "No raid threatens the village." };
  }
  const n = musterGuards(state, grid);
  log(state, "The leader calls the guards to their posts.");
  return { ok: true, guards: n };
}

function scoreJob(state, v, job) {
  const s = state.stockpile;
  const deficit = (have, want) => Math.max(0, want - have);
  const skill = v.skills[job] ?? 1; // old saves predate the woodcutter job
  let score = 4 + skill * 2;
  if (v.traits.includes("industrious")) score += 1.5;
  if (v.traits.includes("lazy")) score -= 2;
  if (job === "farmer") { score += deficit(s.food + s.fish + s.meat, 40) * 0.35; if (state.elapsed < state.effects.droughtUntil) score -= state.buildings.some((b) => b.type === "well") ? 4 : 8; }
  if (job === "woodcutter") score += deficit(s.wood, 30) * 0.4 + (state.buildQueue.length ? 2 : 0);
  if (job === "fisher") score += deficit(s.food + s.fish + s.meat, 40) * 0.25 + deficit(s.fish, 10) * 0.3 + (s.fish < 5 ? 3 : 0) - (s.fish >= 30 ? 12 : s.fish >= 15 ? 6 : 0);
  if (job === "hunter") score += deficit(s.food + s.fish + s.meat, 40) * 0.22;
  if (job === "miner") score += deficit(s.stone, 24) * 0.25 + deficit(s.ore, 6) * 0.3;
  if (job === "builder") score += state.buildQueue.length ? 8 : -4;
  if (job === "hauler") score += v.carry ? 7 : 1.5;
  if (job === "teacher") {
    // No school, no teaching: the score stays far below real work.
    score += state.buildings.some((b) => b.type === "school") ? 5 : -30;
  }
  if (v.assignedJob === job) score += 12; // leader delegation: strong nudge, still refuseable
  if (job === "fisher" && v.assignedJob === "fisher") score += 6; // a standing post: the delegated fisher stays at the shore instead of drifting to building/hauling while fish are plentiful
  if (job === "guard") {
    // Guards are a delegation-only job: nobody drifts into it unless
    // there are posts to hold. A delegated guard stays at the post.
    score += state.buildings.some((b) => b.type === "tower" || b.type === "wall") ? 2 : -8;
    if (v.traits.includes("brave")) score += 2;
  }
  if (job === "guard" && v.assignedJob === "guard") score += 6; // standing post
  if (state.directive && state.directive.focusJob === job) score += refusesDirective(state, v, job) ? -6 : 6;
  if (v.personalFocus === job) score += 4;
  if (v.job === job) score += 1; // stickiness: don't churn jobs every tick
  return score;
}

function bestJob(state, v) {
  let best = v.job, bestScore = -Infinity;
  for (const j of JOBS) { const sc = scoreJob(state, v, j); if (sc > bestScore) { bestScore = sc; best = j; } }
  return best;
}

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

function setTarget(state, grid, v, x, z) {
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

// --- economy: the town-center market ---

// Producers keep a share of what they haul in as personal goods and
// trade the surplus with villagers who need it. runMarket matches
// buyers to sellers at fixed prices; it runs every 30 sim-seconds.
export function runMarket(state) {
  let trades = 0;
  const summaries = [];
  // The player's market only: neighbor villagers neither buy nor
  // sell in it (their goods live in their village's record).
  const own = ownVillagers(state);
  for (let round = 0; round < 3 && trades < 3; round++) {
    let done = false;
    for (const buyer of own) {
      if ((buyer.ageDays ?? 25) < CHILD_DAYS) continue;
      for (const g of Object.keys(PRICES)) {
        const price = PRICES[g];
        const hungry = buyer.hunger > 40;
        const wantsFood = (g === "food" || g === "fish" || g === "meat") && hungry
          && (buyer.goods.food + buyer.goods.fish + buyer.goods.meat) === 0;
        const wantsMaterial = (g === "wood" || g === "stone") && buyer.job === "builder" && (buyer.goods[g] || 0) === 0;
        const wantsOre = g === "ore" && buyer.traits.includes("greedy") && (buyer.goods.ore || 0) === 0;
        if ((!wantsFood && !wantsMaterial && !wantsOre) || buyer.coins < price) continue;
        const seller = own.find((s) => s !== buyer && (s.ageDays ?? 25) >= CHILD_DAYS && (s.goods[g] || 0) > 2);
        if (!seller) continue;
        seller.goods[g]--; buyer.goods[g] = (buyer.goods[g] || 0) + 1;
        buyer.coins -= price; seller.coins += price;
        state.stats.trades = (state.stats.trades || 0) + 1; trades++;
        summaries.push(seller.name + " trades " + g + " to " + buyer.name);
        done = true; break;
      }
      if (done) break;
    }
    if (!done) break;
  }
  // One log line per market round, so trades don't crowd births,
  // deaths, and building news out of the god log.
  // Tool buying: one upgrade per market round at most. A sturdy tool
  // needs a workshop; a fine tool needs a workshop and Bronze craft;
  // a steel tool needs a workshop and Steel works.
  // Coins go to the village fund, ore comes out of the stockpile.
  const hasWorkshop = ownBuildings(state).some((b) => b.type === "workshop");
  if (hasWorkshop) {
    const toolGate = (next) =>
      (next === 1) || (next === 2 && state.tech && state.tech.level >= 1) || (next === 3 && state.tech && state.tech.level >= 3);
    const buyer = own.find((v) => (v.ageDays ?? 25) >= CHILD_DAYS && !isStudent(state, v)
      && (v.tool || 0) < 3 && v.coins >= (TOOL_COSTS[(v.tool || 0) + 1].coins)
      && state.stockpile.ore >= TOOL_COSTS[(v.tool || 0) + 1].ore
      && toolGate((v.tool || 0) + 1));
    if (buyer) {
      const next = (buyer.tool || 0) + 1;
      const cost = TOOL_COSTS[next];
      buyer.coins -= cost.coins; state.fund += cost.coins; state.stockpile.ore -= cost.ore;
      buyer.tool = next;
      summaries.push(buyer.name + " buys " + TOOL_NAMES[next] + " tools");
    }
  }
  if (summaries.length) log(state, "At the market: " + summaries.join("; ") + ".");
}

// --- morale: how the village feels, and what it costs ---

// Morale drifts toward a target set by food, housing, variety, recent
// deaths, weather, and faith. Recomputed at dawn; celebrations and
// blessings bump it at once. It moves work speed, birth willingness,
// and refusals — never enough on its own to kill a village.
export function recomputeMorale(state) {
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const pop = Math.max(1, ownVillagers(state).length);
  const perMouth = edible / pop;
  const homeless = homelessCount(state);
  const kinds = ["food", "fish", "meat"].filter((k) => s[k] > 0).length;
  const recentDeaths = (state.rateHistory || []).reduce((a, r) => a + r.deaths, 0);
  const parts = [];
  const foodDelta = perMouth >= 8 ? 15 : perMouth >= 4 ? 5 : perMouth < 2 ? -15 : -25;
  parts.push({ label: perMouth >= 4 ? "Full stores" : "Empty stores", delta: foodDelta });
  parts.push({ label: homeless ? homeless + " homeless" : "Everyone housed", delta: homeless ? -Math.min(18, homeless * 6) : 10 });
  parts.push({ label: kinds >= 3 ? "Varied diet" : kinds === 2 ? "Two foods" : "One food", delta: kinds >= 3 ? 8 : kinds === 2 ? 5 : 0 });
  if (recentDeaths) parts.push({ label: recentDeaths + " recent deaths", delta: -Math.min(12, recentDeaths * 4) });
  const w = state.weather ? state.weather.kind : "clear";
  if (w === "storm" || w === "snow") parts.push({ label: w === "storm" ? "Storm overhead" : "Snow on the ground", delta: -5 });
  else if (w === "clear") parts.push({ label: "Clear skies", delta: 3 });
  if (state.faith >= 70) parts.push({ label: "Strong faith", delta: 5 });
  if (state.faith < 30) parts.push({ label: "Faith shaken", delta: -8 });
  if (state.elapsed < (state.celebrationBoostUntil || -1)) parts.push({ label: "Festival cheer", delta: 8 });
  const target = clamp(50 + parts.reduce((a, p) => a + p.delta, 0), 5, 95);
  state.morale = clamp((state.morale ?? 60) + clamp(target - (state.morale ?? 60), -4, 4), 0, 100);
  state.moraleReasons = parts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  return { target, parts };
}

// --- demographics: age-based birth and death rates ---

export function dawnDemographics(state, birthNeed) {
  let births = 0, deaths = 0;
  // The player's dawn only: neighbor villagers live in their own
  // records while abstract and keep their own hours while active.
  // Age a day, then death rolls: children and adults rarely, elders
  // increasingly, the sick more often.
  for (const v of [...ownVillagers(state)]) {
    v.ageDays = (v.ageDays ?? 25) + 1;
    let p = v.ageDays < CHILD_DAYS ? 0.003 : v.ageDays >= ELDER_DAYS ? 0.02 + (v.ageDays - ELDER_DAYS) * 0.004 : 0.002;
    // Plague kills the sick, not only the already weak: while a
    // wave runs and its death budget remains, every sick villager
    // faces a dawn death roll, steeper for the weak. A sick
    // villager who dies during the wave dies of the sickness and
    // spends the budget, so one wave can never take more than a
    // quarter of the village.
    const plagueActive = v.sick && state.elapsed <= (state.effects.plagueUntil || -1);
    const budgetLeft = plagueActive ? (state.effects.plagueBudget ?? disasterKillCap(state)) : 0;
    const weak = v.sick && (v.health < 50 || v.ageDays >= ELDER_DAYS || v.hunger >= 70);
    if (weak) p += 0.05;
    if (plagueActive && budgetLeft > 0) p += DISASTER_PLAGUE_DAWN_DEATH + (weak ? 0.1 : 0);
    if (state._rng() < p) {
      let cause;
      if (plagueActive && budgetLeft > 0) {
        cause = "sickness";
        state.effects.plagueBudget = budgetLeft - 1;
      } else if (v.ageDays >= ELDER_DAYS) cause = "old age";
      else if (weak) cause = "sickness";
      else cause = "a sudden illness";
      removeVillager(state, v, cause); deaths++;
    }
  }
  // Birth rolls: one roll per pair of fertile adults, scaled by food,
  // housing room, and faith. At most 3 births a dawn.
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const fertile = ownVillagers(state).filter((v) => v.ageDays >= CHILD_DAYS && v.ageDays < ELDER_DAYS);
  const pairs = Math.floor(fertile.length / 2);
  const foodFactor = edible >= birthNeed ? 1.4 : edible >= birthNeed / 2 ? 0.7 : 0.25;
  const housingFactor = ownVillagers(state).length >= state.populationCap ? 0
    : ownVillagers(state).length < state.populationCap * 0.7 ? 1.2 : 0.9;
  const faithFactor = 0.7 + state.faith / 200;
  // Morale moves willingness: a hopeful village has more babies.
  const moraleFactor = 0.7 + ((state.morale ?? 60) / 100) * 0.6;
  const pBirth = Math.min(0.9, 0.10 * foodFactor * housingFactor * faithFactor * moraleFactor);
  const maxBirths = 1 + Math.floor(ownVillagers(state).length / 12);
  for (let i = 0; i < pairs && births < maxBirths; i++) {
    if (ownVillagers(state).length >= state.populationCap) break;
    if (state._rng() < pBirth) {
      const v = makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 0, coins: 0 });
      state.villagers.push(v); births++; state.stats.births++;
      log(state, "A baby is born. " + v.name + " joins the village.");
    }
  }
  // Dawn share: every adult gets 1 coin from the village's surplus, so
  // no one is locked out of the market forever for being broke.
  for (const v of ownVillagers(state)) if (v.ageDays >= CHILD_DAYS) v.coins = Math.min(20, v.coins + 1);
  assignHomes(state);
  // The teacher is paid from the village fund for the day's lessons.
  const hasSchool = ownBuildings(state).some((b) => b.type === "school");
  const teacher = ownVillagers(state).find((v) => v.assignedJob === "teacher");
  if (hasSchool && teacher && state.fund >= 1) { state.fund -= 1; teacher.coins += 1; }
  // Schooling: students gain education at dawn, faster with a teacher.
  // Education caps at 10 and stays with the villager for life.
  if (hasSchool) {
    for (const v of ownVillagers(state)) {
      if (isStudent(state, v)) v.education = Math.min(10, (v.education || 0) + (teacher ? 2 : 1));
    }
  }
  // Tech: educated adults push the village forward. Founders arrive
  // with some schooling, so the first tier can come from them; later
  // tiers need school graduates. Progress caps each dawn so one
  // crowded dawn cannot skip a tier.
  if (!state.tech) state.tech = { level: 0, progress: 0 };
  if (state.tech.level < TECH_TIERS.length - 1) {
    let gain = 0;
    for (const v of ownVillagers(state)) {
      if ((v.ageDays ?? 25) <= SCHOOL_MAX_AGE) continue;
      if ((v.education || 0) >= 5) gain += 4;
      else if ((v.education || 0) >= 3) gain += 2;
    }
    state.tech.progress += Math.min(12, gain);
    // Later tiers cost more and need a bigger village: progress holds
    // at the threshold until the population gate is met.
    const need = techThresholdFor(state.tech.level);
    const popGate = ERA_POP_GATE[state.tech.level + 1] || 0;
    if (state.tech.progress >= need && ownVillagers(state).length >= popGate) {
      state.tech.level++;
      state.tech.progress = 0;
      if (state.tech.level === TECH_TIERS.length - 1) {
        state.populationCap += 10;
        log(state, "The modern city rises. Room for " + state.populationCap + " souls now.");
      }
      log(state, "The village learns " + TECH_TIERS[state.tech.level].name + ". " + TECH_TIERS[state.tech.level].blurb);
    }
  }
  state.rateHistory.push({ day: state.day, births, deaths });
  if (state.rateHistory.length > 10) state.rateHistory.shift();
  return { births, deaths };
}

export function demographicRates(state) {
  const h = state.rateHistory || [];
  if (!h.length) return { birthsPerDay: 0, deathsPerDay: 0, birthRate: 0, deathRate: 0 };
  const b = h.reduce((a, r) => a + r.births, 0), d = h.reduce((a, r) => a + r.deaths, 0);
  const pop = Math.max(1, ownVillagers(state).length);
  return { birthsPerDay: b / h.length, deathsPerDay: d / h.length, birthRate: (b / h.length / pop) * 100, deathRate: (d / h.length / pop) * 100 };
}

// --- demand: what the village needs built, scored ---

export function canAfford(state, type) {
  const c = BUILD_COSTS[type];
  if (!c) return false; // an unpriced type is never affordable: it must not crash the sim
  return state.stockpile.wood >= c.wood && state.stockpile.stone >= c.stone && (state.stockpile.ore || 0) >= (c.ore || 0);
}

export function computeDemands(state, grid) {
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const pop = ownVillagers(state).length;
  const built = (t) => ownBuildings(state).some((b) => b.type === t);
  const queued = (t) => state.buildQueue.some((q) => q.type === t);
  const homeless = homelessCount(state);
  const hutTotal = ownBuildings(state).filter((b) => b.type === "hut" || b.type === "longhouse").length
    + state.buildQueue.filter((q) => q.type === "hut" || q.type === "longhouse").length;
  const demands = [];
  const crowded = pop >= state.populationCap - 2;
  const dwellings = ownBuildings(state).filter((b) => ["hut", "longhouse", "greathall"].includes(b.type));
  const hutScore = homeless * 3 + (crowded ? 4 : 0) + (state.day >= 2 && hutTotal < 2 ? 3 : 0);
  if (hutScore > 0) {
    const spot = grid ? !!findHutSpot(state, grid) : true;
    demands.push(spot
      ? { type: "hut", score: hutScore, reason: homeless ? homeless + " homeless villager" + (homeless > 1 ? "s" : "") + " need" + (homeless > 1 ? "" : "s") + " a home." : "The village is outgrowing its huts." }
      : { type: "longhouse", score: hutScore, reason: "No room for new huts: an old hut must grow." });
  }
  // Housing evolution: as demand rises and the village spreads, growing
  // an existing dwelling beats sprawling further. A hut becomes a
  // longhouse (8 beds), a longhouse becomes a great hall (14 beds).
  // Two triggers: near-crowding, OR prosperity — several dwellings,
  // an old hut, and surplus wood and stone. The prosperity trigger
  // exists because in the 30-day playtest the cap always jumped ahead
  // of population, so crowding-only upgrades never fired at all.
  const huts = ownBuildings(state).filter((b) => b.type === "hut");
  const longhouses = ownBuildings(state).filter((b) => b.type === "longhouse");
  const oldestHutAge = huts.length ? state.day - Math.min(...huts.map((b) => b.builtDay || 1)) : 0;  const prosperous = s.wood >= 40 && s.stone >= 20 && oldestHutAge >= 8;
  const nearCrowded = pop >= state.populationCap - 4;
  if ((nearCrowded || prosperous) && dwellings.length >= 4 && huts.length && !queued("longhouse")) {
    demands.push({ type: "longhouse", score: 5 + dwellings.length * 0.5 + (prosperous ? 2 : 0), reason: "The village is spreading: grow a hut into a longhouse instead." });
  }
  if ((nearCrowded || prosperous) && longhouses.length && !queued("greathall")) {
    demands.push({ type: "greathall", score: 6 + dwellings.length * 0.5 + (prosperous ? 2 : 0), reason: "A longhouse must grow into a great hall for the growing village." });
  }
  // Farmsteads: a farmhouse anchors a farm district. Demand rises with
  // mouths to feed and with fields that have no farmhouse nearby.
  const farmhouses = ownBuildings(state).filter((b) => b.type === "farmhouse");
  const farmNeed = pop * 4;
  const unanchored = state._farmCells ? state._farmCells.filter(([x, z]) => !farmhouses.some((f) => Math.hypot(x - f.x, z - f.z) <= 5)).length : 0;
  if (!queued("farmhouse") && (edible < farmNeed || unanchored >= 12) && pop >= 8) {
    demands.push({ type: "farmhouse", score: 4 + Math.min(3, Math.floor(unanchored / 6)), reason: "The fields need a farmhouse to work from." });
  }
  if (!built("granary") && !queued("granary")) {
    const sc = edible >= 25 ? 3 : (state.spoiled > 0 ? 2 : 0);
    if (sc) demands.push({ type: "granary", score: sc, reason: "Surplus food needs storing." });
  }
  if (!built("well") && !queued("well") && (pop >= 10 || state.elapsed < state.effects.droughtUntil)) {
    demands.push({ type: "well", score: 3, reason: "The village needs water close at hand." });
  }
  if (!built("workshop") && !queued("workshop") && s.ore >= 4) {
    demands.push({ type: "workshop", score: 3, reason: "Ore is piling up: tools are needed." });
  }
  if (!built("shrine") && !queued("shrine") && (state.faith < 45 || pop >= 14)) {
    demands.push({ type: "shrine", score: 3, reason: state.faith < 45 ? "Faith is low: the people need a shrine." : "The village has grown: it needs a gathering shrine." });
  }
  // A school teaches the children, and schooled adults push the
  // village toward new tools. One school is enough for this village.
  if (!built("school") && !queued("school") && pop >= 8) {
    demands.push({ type: "school", score: 4, reason: "The children need a school." });
  }
  // A healer's hut, once the village knows iron craft: the sick
  // recover near it instead of fading.
  if (state.tech && state.tech.level >= 2 && !built("healer") && !queued("healer") && pop >= 10) {
    demands.push({ type: "healer", score: 4, reason: "Iron craft brings medicine: the village needs a healer's hut." });
  }
  // Defenses: a wall ring once the village knows iron craft and has
  // the hands to hold it; towers once a wall line exists to anchor.
  // Walls are capped so the ring never paves the whole map. Once the
  // inner ring is established, a bigger village raises a second ring
  // at OUTER_WALL_RING_R; a third ring is one more demand rule away.
  const ringCount = (R) => ownBuildings(state).filter((b) => b.type === "wall" && Math.max(Math.abs(b.x - state._cx), Math.abs(b.z - state._cz)) === R).length
    + state.buildQueue.filter((q) => q.type === "wall" && Math.max(Math.abs(q.x - state._cx), Math.abs(q.z - state._cz)) === R).length;
  const wallCount = ownBuildings(state).filter((b) => b.type === "wall").length
    + state.buildQueue.filter((q) => q.type === "wall").length;
  const towerCount = ownBuildings(state).filter((b) => b.type === "tower").length
    + state.buildQueue.filter((q) => q.type === "tower").length;
  if (state.tech && state.tech.level >= 2 && pop >= 12 && ringCount(WALL_RING_R) < 40 && !queued("wall")) {
    demands.push({ type: "wall", ring: WALL_RING_R, score: 3.5, reason: "Iron craft brings wariness: the village needs a wall ring." });
  }
  if (state.tech && state.tech.level >= 2 && pop >= 18 && ringCount(WALL_RING_R) >= 40 && ringCount(OUTER_WALL_RING_R) < 60 && !queued("wall")) {
    demands.push({ type: "wall", ring: OUTER_WALL_RING_R, score: 3.4, reason: "The village has outgrown its wall: a second ring will hold the fields." });
  }
  if (state.tech && state.tech.level >= 2 && pop >= 14 && wallCount >= 6 && towerCount < 4 && !queued("tower")) {
    demands.push({ type: "tower", score: 4, reason: "The wall needs towers to watch the gates." });
  }
  demands.sort((a, b) => b.score - a.score);
  return demands;
}

// --- one villager's think + act ---

function think(state, grid, v) {
  const cx = state._cx, cz = state._cz;
  // Urgent needs override jobs, exactly as in the Luanti brain.
  // Raiders send villagers running away from the threat, never
  // toward the center where the raiders are headed.
  const raiderNear = nearestRaider(state, v.x, v.z, 8);
  // A guard on duty holds the post while a raid is active, as long as
  // they are still standing: fear still accumulates, and a wounded
  // guard (below GUARD_BREAK_HEALTH) falls back like anyone else.
  const guardOnDuty = v.job === "guard" && state.raidActive && v.health >= GUARD_BREAK_HEALTH;
  if (!guardOnDuty && (v.fear >= 50 || raiderNear || (state.elapsed < state.effects.floodUntil && Math.hypot(v.x - cx, v.z - cz) < 14))) {
    v.state = "flee";
    if (v.job === "guard" && state.raidActive && v.health < GUARD_BREAK_HEALTH && !v.brokeOff) {
      v.brokeOff = true;
      log(state, v.name + " breaks off and falls back, wounded.");
    }
    if (raiderNear) {
      const dx = v.x - raiderNear.x, dz = v.z - raiderNear.z;
      const d = Math.hypot(dx, dz) || 1;
      setTarget(state, grid, v, clamp(Math.round(v.x + (dx / d) * 6), 1, SIZE - 2), clamp(Math.round(v.z + (dz / d) * 6), 1, SIZE - 2));
    } else {
      setTarget(state, grid, v, cx + (v.x > cx ? 6 : -6), cz + (v.z > cz ? 6 : -6));
    }
    return;
  }
  if (v.health <= 0) return;
  if (v.hunger >= 75) {
    v.state = "eat";
    const edible = state.stockpile.food + state.stockpile.fish + state.stockpile.meat;
    if (edible > 0) setTarget(state, grid, v, cx, cz);
    else { // nothing stored: forage — a farmer's plot or the lake shore
      const plot = nearestCell(grid, v.x, v.z, (c) => c.farm && c.crop === 3);
      if (plot) setTarget(state, grid, v, plot[0], plot[1]); else v.state = "idle";
    }
    return;
  }
  if (v.energy <= 18 || v.sick) {
    v.state = "rest";
    const home = v.home ? v.home.split(",").map(Number) : [cx - 2, cz - 3];
    setTarget(state, grid, v, home[0], home[1]); return;
  }
  if (v.carry && v.carry.amt >= v.carryCap) { v.state = "haul"; setTarget(state, grid, v, cx, cz); return; }

  // A festival gathers everyone at the town center: work pauses while
  // the village celebrates together.
  if (state.celebration && state.elapsed < state.celebration.until) {
    v.state = "celebrate"; setTarget(state, grid, v, cx, cz); return;
  }
  // Night is for sleep. Urgent needs above still win; everyone else
  // goes home until dawn.
  if (phaseOf(state.time) === "night") {
    v.state = "rest";
    const home = v.home ? v.home.split(",").map(Number) : [cx - 2, cz - 3];
    setTarget(state, grid, v, home[0], home[1]); return;
  }

  // Children stay near home and do no work yet.
  if ((v.ageDays ?? 25) < CHILD_DAYS) {
    v.job = "child"; v.state = "idle"; v.assignedJob = null;
    const home = v.home ? v.home.split(",").map(Number) : [cx, cz];
    if (Math.hypot(v.x - (home[0] + 0.5), v.z - (home[1] + 0.5)) > 3) setTarget(state, grid, v, home[0], home[1]);
    return;
  }

  // Students walk to the school and learn there instead of working.
  if (isStudent(state, v)) {
    v.job = "student"; v.state = "school"; v.assignedJob = null;
    const school = state.buildings.find((b) => b.type === "school");
    if (school) setTarget(state, grid, v, school.x, school.z);
    return;
  }

  let job = bestJob(state, v);
  // Delegation refusal: the leader's assignment wins the scoring, but a
  // villager can still ignore it and take their next-best work.
  v.delegated = job === v.assignedJob;
  if (v.assignedJob && job === v.assignedJob && refusesAssignment(state, v)) {
    let second = null, secondScore = -Infinity;
    for (const j of JOBS) {
      if (j === v.assignedJob) continue;
      const sc = scoreJob(state, v, j);
      if (sc > secondScore) { secondScore = sc; second = j; }
    }
    if (second) {
      job = second; v.delegated = false;
      if (state._rng() < 0.08) log(state, v.name + " ignores the leader's delegation and works as a " + job + " instead.");
    }
  }
  v.job = job;
  v.state = "work";
  if (job === "farmer") {
    const ripe = nearestCell(grid, v.x, v.z, (c) => c.farm && c.crop === 3);
    const empty = nearestCell(grid, v.x, v.z, (c) => c.farm && c.crop < 3);
    const plot = ripe || empty;
    if (plot) setTarget(state, grid, v, plot[0], plot[1]); else v.state = "idle";
  } else if (job === "woodcutter") {
    const tree = nearestCell(grid, v.x, v.z, (c) => c.tree);
    if (tree) setTarget(state, grid, v, tree[0], tree[1]); else v.state = "idle";
  } else if (job === "miner") {
    // Carry-aware targeting: a miner hauling stone goes to stone, a
    // miner hauling ore goes to ore. Targeting a node whose mineral
    // mismatches the carry would strand the miner there (see doWork).
    // A miner left holding a mismatched carry (old saves, hauler
    // fallback) hauls it home instead of idling.
    const node = nearestCell(grid, v.x, v.z, (c) => (c.stone > 0 && (!v.carry || v.carry.type === "stone")) || (c.ore > 0 && (!v.carry || v.carry.type === "ore")));
    if (node) setTarget(state, grid, v, node[0], node[1]);
    else if (v.carry) { v.state = "haul"; setTarget(state, grid, v, cx, cz); }
    else v.state = "idle";
  } else if (job === "fisher") {
    const shore = nearestCell(grid, v.x, v.z, (c, x, z) => !c.water && !c.blocked && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => { const n = inBounds(x + dx, z + dz) ? peekCell(grid, x + dx, z + dz) : null; return !!(n && n.water); }));
    if (shore) setTarget(state, grid, v, shore[0], shore[1]); else v.state = "idle";
  } else if (job === "hunter") {
    const deer = state.deer[0];
    if (deer) { v.target = [Math.round(deer.x), Math.round(deer.z)]; v.path = null; } // chase live: repath in step()
    else v.state = "idle";
  } else if (job === "builder") {
    const q = state.buildQueue[0];
    if (q) setTarget(state, grid, v, q.x, q.z); else v.state = "idle";
  } else if (job === "teacher") {
    const school = state.buildings.find((b) => b.type === "school");
    if (school) setTarget(state, grid, v, school.x, school.z); else v.state = "idle";
  } else if (job === "hauler") {
    // Haulers shuttle: go to the nearest productive cell, fill up, deposit.
    const ripe = nearestCell(grid, v.x, v.z, (c) => c.farm && c.crop === 3);
    const node = nearestCell(grid, v.x, v.z, (c) => c.stone > 0);
    const t = ripe || node;
    if (t) setTarget(state, grid, v, t[0], t[1]); else v.state = "idle";
  } else if (job === "guard") {
    // Guards hold their post. During a raid they engage the nearest
    // raider within GUARD_POST_RADIUS of the post, otherwise they hold
    // it; on a warning day they wait at the post; in quiet times they
    // patrol a fixed loop between their post, the nearest gate, and
    // the next post, never leaving the wall ring.
    const post = v.post;
    if (!post) {
      v.state = "idle";
    } else if (state.raidActive) {
      const r = nearestRaider(state, post.x + 0.5, post.z + 0.5, GUARD_POST_RADIUS);
      if (r && v.health >= GUARD_BREAK_HEALTH) setTarget(state, grid, v, Math.round(r.x), Math.round(r.z));
      else setTarget(state, grid, v, post.x, post.z);
    } else if (state.raidPendingDay && state.raidPendingDay > state.day) {
      setTarget(state, grid, v, post.x, post.z);
    } else {
      const posts = guardPosts(state);
      const gates = posts.filter((p) => p.kind === "gate");
      const idx = posts.findIndex((p) => p.x === post.x && p.z === post.z);
      const next = posts.length > 1 ? posts[(idx + 1) % posts.length] : post;
      const gate = gates.length ? gates.reduce((a, b) => Math.hypot(a.x - post.x, a.z - post.z) <= Math.hypot(b.x - post.x, b.z - post.z) ? a : b) : post;
      const route = [post, gate, next];
      v.patrolIdx = v.patrolIdx ?? 0;
      if (v.patrolIdx >= route.length) v.patrolIdx = 0;
      const wp = route[v.patrolIdx];
      if (Math.hypot(v.x - (wp.x + 0.5), v.z - (wp.z + 0.5)) < 1.2) v.patrolIdx = (v.patrolIdx + 1) % route.length;
      const dest = route[v.patrolIdx];
      setTarget(state, grid, v, dest.x, dest.z);
    }
  }
}

function workNeed(state, v, base) {
  // How long one work action takes. Morale, tools, and weather all
  // move it: a hopeful villager with fine tools in clear skies works
  // fastest; a miserable one in a snowstorm is slow.
  let n = base;
  if (v.job === "fisher" && state.weather && state.weather.kind === "rain") n = 6.5;
  const moraleEff = 0.85 + ((state.morale ?? 60) / 100) * 0.3;
  n /= moraleEff * (1 + 0.25 * (v.tool || 0));
  // Electric light and modern methods speed every job a little.
  if (state.tech && state.tech.level >= 5) n *= 0.9;
  if (state.weather) {
    if (state.weather.kind === "storm") n *= 1.25;
    if (state.weather.kind === "snow") n *= 1.5;
  }
  return n;
}

function doWork(state, grid, v, dt) {
  const [tx, tz] = v.target || [];
  const cell = tx != null ? cellAt(grid, tx, tz) : null;
  v.workTimer += dt;
  const baseNeed = v.job === "builder" ? 2.5 : v.job === "fisher" ? 9.0 : v.job === "teacher" ? 2.0 : 1.6;
  const need = workNeed(state, v, baseNeed);
  if (v.workTimer < need) return;
  v.workTimer = 0;
  const tech = state.tech || { level: 0, progress: 0 };
  const fineBonus = (v.tool || 0) >= 2 ? 1 : 0;
  const steelBonus = (v.tool || 0) >= 3 ? 1 : 0;
  const addCarry = (type, amt = 1) => {
    if (!v.carry) v.carry = { type, amt: 0 };
    if (v.carry.type !== type) return;
    v.carry.amt = Math.min(v.carryCap, v.carry.amt + amt);
  };
  const hasWorkshop = state.buildings.some((b) => b.type === "workshop");
  const workshopEvery = tech.level >= 1 ? 2 : 3;
  if (v.job === "teacher") {
    // Lessons land at dawn (see dawnDemographics). The teacher just
    // needs to be at the school, visible to the village.
  } else if (v.job === "farmer" && cell && cell.farm) {
    if (cell.crop === 3) { cell.crop = 0; cell.cropGrow = 0; addCarry("food", 2 + (tech.level >= 1 ? 1 : 0) + (tech.level >= 2 ? 1 : 0) + fineBonus + steelBonus); }
    else if (state.elapsed >= state.effects.droughtUntil) { cell.crop = Math.min(3, cell.crop + 1); }
  } else if (v.job === "woodcutter" && cell && cell.tree) {
    cell.tree = false; cell.blocked = false; noteMutation(grid, tx, tz); addCarry("wood", 2 + fineBonus + steelBonus);
    if (hasWorkshop) { v.toolTick++; if (v.toolTick % workshopEvery === 0) addCarry("wood", 1); }
  } else if ((v.job === "miner" || v.job === "hauler") && cell && (cell.stone > 0 || cell.ore > 0)) {
    // Carry-aware mining: a villager takes only the mineral matching
    // what they already carry (or anything on an empty carry). Taking
    // the other mineral would void it: addCarry drops a mismatched
    // type AFTER the cell is decremented, so the mineral vanished
    // from the world without ever reaching the stockpile.
    const carryOk = (type) => !v.carry || v.carry.type === type;
    if (cell.ore > 0 && carryOk("ore") && state._rng() < 0.35) { cell.ore--; addCarry("ore"); noteMutation(grid, tx, tz); }
    else if (cell.stone > 0 && carryOk("stone")) { cell.stone--; addCarry("stone", 1 + fineBonus + steelBonus); if (cell.stone <= 0 && cell.ore <= 0) cell.blocked = false; noteMutation(grid, tx, tz); }
    else if (v.job === "hauler" && !cell.stone && !cell.ore) addCarry("wood"); // hauler fallback at a spent node
    if (v.job === "hauler" && !cell.stone && !cell.ore) addCarry("wood");
    if (hasWorkshop && v.job === "miner") { v.toolTick++; if (v.toolTick % workshopEvery === 0) addCarry("stone", 1); }
  } else if (v.job === "fisher") {
    addCarry("fish", 1 + fineBonus + steelBonus);
  } else if (v.job === "hunter") {
    const deer = state.deer.find((d) => Math.hypot(d.x - v.x, d.z - v.z) < 2.2);
    if (deer) {
      state.deer = state.deer.filter((d) => d !== deer);
      addCarry("meat", 3 + fineBonus + steelBonus);
      log(state, v.name + " brings down a deer.");
    }
  } else if (v.job === "builder") {
    const q = state.buildQueue[0];
    if (q) {
      // Steam and brick doubles building speed: mills and cranes.
      q.progress += tech.level >= 4 ? 2 : 1;
      const needProgress = { granary: 8, marker: 3, well: 6, workshop: 8, shrine: 5, longhouse: 8, greathall: 10, farmhouse: 7, school: 8, healer: 6, wall: 4, tower: 8 }[q.type] || 6;
      if (q.progress >= needProgress) {
        state.buildQueue.shift();
        const cost = BUILD_COSTS[q.type] || { wood: 0, stone: 0, ore: 0 };
        if (state.stockpile.wood >= cost.wood && state.stockpile.stone >= cost.stone && state.stockpile.ore >= (cost.ore || 0)) {
          state.stockpile.wood -= cost.wood; state.stockpile.stone -= cost.stone; state.stockpile.ore -= cost.ore || 0;
          const type = q.type || "hut";
          if (type === "longhouse" || type === "greathall") {
            const from = type === "longhouse" ? "hut" : "longhouse";
            const old = state.buildings.find((b) => b.x === q.x && b.z === q.z && b.type === from);
            const target = old || state.buildings.find((b) => b.x === q.x && b.z === q.z);
            if (target) target.type = type;
            cellAt(grid, q.x, q.z).building = type;
            noteMutation(grid, q.x, q.z);
            state.populationCap += type === "longhouse" ? 4 : 6;
            log(state, type === "longhouse"
              ? "A hut grows into a longhouse. The village can hold " + state.populationCap + " souls."
              : "A longhouse grows into a great hall. The village can hold " + state.populationCap + " souls.");
          } else {
            state.buildings.push({ type, x: q.x, z: q.z, done: true, builtDay: state.day, village: 0 });
            cellAt(grid, q.x, q.z).building = type;
            noteMutation(grid, q.x, q.z);
            if (type === "hut") {
              cellAt(grid, q.x, q.z).blocked = true;
              state.populationCap += 4;
              log(state, "A new hut rises on the housing ring. The village can hold " + state.populationCap + " souls.");
            } else if (type === "granary") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A granary stands. Stored food will keep far longer now.");
            } else if (type === "marker") {
              state.faith = clamp(state.faith + 2, 0, 100);
              log(state, "A boundary marker is raised. The village knows its ground.");
            } else if (type === "well") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A well is dug. Water is close at hand now.");
            } else if (type === "workshop") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A workshop opens. Miners and woodcutters work with proper tools.");
            } else if (type === "shrine") {
              state.faith = clamp(state.faith + 5, 0, 100);
              log(state, "A shrine is raised. The people take heart.");
            } else if (type === "farmhouse") {
              cellAt(grid, q.x, q.z).blocked = true;
              state.populationCap += 2;
              const added = clearFarmBed(state, grid, q.x, q.z);
              log(state, "A farmhouse rises in the west fields, with " + added + " new field plots around it. It houses 2 farmhands.");
            } else if (type === "school") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A school opens its doors. The children will learn their letters.");
            } else if (type === "healer") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A healer's hut opens. The sick will mend faster near it.");
            } else if (type === "wall") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A stretch of wall rises on the wall ring.");
            } else if (type === "tower") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A watch tower rises. Its guard watches the gates.");
            }
          }
          assignHomes(state);
          // Builders are paid from the village fund for finished work.
          if (state.fund >= 2) { state.fund -= 2; v.coins += 2; }
        } else {
          log(state, "The " + (q.type || "hut") + " frame stands unfinished: not enough in the stockpile.");
          if (q.type !== "longhouse" && q.type !== "greathall") { cellAt(grid, q.x, q.z).building = null; cellAt(grid, q.x, q.z).blocked = false; }
        }
      }
    }
  }
  if (v.carry && v.carry.amt >= v.carryCap) { v.state = "haul"; setTarget(state, grid, v, state._cx, state._cz); }
}

// Autonomous expansion: the village grows on demand, with no god order
// needed. Crowding starts a hut; surplus food starts a granary; the
// village marks its boundary; roads are laid toward the huts; a
// persistent food shortage clears new farm ground. The god's Order Hut
// is only ever an extra, faster hut.
// --- village planning: zoned placement, not first-free-cell ---
//
// Housing forms a ring around the town center with breathing room
// between dwellings; farms stay in the western farm district; the
// workshop sits near stone; the shrine hugs the altar; the well stays
// central; the granary sits near the center and the fields. Each
// candidate cell is scored for its type, and the best wins — so the
// village grows in districts instead of sprawling at random.
// District rules (v10, hard, not just scored): dwellings keep at
// least 3 cells from each other, never enter the western farm
// district, and farmhouses and farm beds stay west. The old scored
// version let the cluster bonus and road bonus pull huts into a
// 2-cell clump, which read as no organization at all.
const DWELLING_TYPES = ["hut", "longhouse", "greathall", "farmhouse"];
// --- settlement layout: streets, lots, and zones ---
// The village grows like a place, not a scatter. A street plan —
// plaza ring, spokes, outer rings — carries lots along its edges;
// houses stand on lots facing their street; farm fields live in
// their own western block; the center stays civic. The plan is
// DERIVED from the grid every time it is needed, never saved, so
// old worlds load unchanged and the new rules govern only new
// construction. Grandfathered buildings, roads, and fields are
// never moved, deleted, or rebuilt: a road laid through a field
// by the old scatter rules stays, and no new one ever joins it.

// Street rings (Chebyshev distance from the town center). The plaza
// ring at 2 exists from founding; outer rings open as the village
// grows. The wall ring sits at 9, between rings 8 and 11.
export const STREET_RINGS = [2, 5, 8, 11, 14, 17, 20, 23];
const RING_STEP = 3;

// The farm district: the western block. Streets never enter it, and
// farm beds never leave it.
export function isFieldZone(state, x, z) {
  const cx = state._cx, cz = state._cz;
  return x <= cx - 4 && Math.hypot(x - cx, z - cz) <= 14;
}

// How far the street plan reaches: the smallest ring that contains
// every settled building (plus one), so the plan always wraps the
// village as it stands. Walls, towers, and boundary markers do not
// count: they are the edge, not the settlement.
export function streetExtent(state) {
  const cx = state._cx, cz = state._cz;
  let maxD = 2;
  const settled = (b) => b.type !== "wall" && b.type !== "tower" && b.type !== "marker";
  for (const b of state.buildings) if (settled(b)) maxD = Math.max(maxD, Math.max(Math.abs(b.x - cx), Math.abs(b.z - cz)));
  for (const q of state.buildQueue) if (settled(q)) maxD = Math.max(maxD, Math.max(Math.abs(q.x - cx), Math.abs(q.z - cz)));
  for (const r of STREET_RINGS) if (r >= maxD + 1) return r;
  return STREET_RINGS[STREET_RINGS.length - 1];
}

// A cell is on the street plan when it sits on a ring or a spoke,
// outside the farm district. Spokes are the four axes; the west
// spoke stops at the field-zone edge, so no street ever leads into
// the fields — the farm road ends at the plaza ring.
export function isPlanStreet(state, x, z, extent = streetExtent(state)) {
  const cx = state._cx, cz = state._cz;
  const dx = x - cx, dz = z - cz;
  const d = Math.max(Math.abs(dx), Math.abs(dz));
  if (d > extent || d < 2) return false;
  if (isFieldZone(state, x, z)) return false;
  if (STREET_RINGS.includes(d)) return true;
  return dx === 0 || dz === 0;
}

// Plan cells in paving order: nearest first, spokes before ring
// cells at the same distance, so a new ring is always reached by
// its spokes and streets extend outward from the plaza.
export function planStreetCells(state, extent = streetExtent(state)) {
  const cx = state._cx, cz = state._cz;
  const seen = new Set();
  const cells = [];
  const push = (x, z) => {
    if (!inBounds(x, z)) return;
    if (!isPlanStreet(state, x, z, extent)) return;
    const k = key(x, z);
    if (seen.has(k)) return;
    seen.add(k);
    cells.push([x, z]);
  };
  for (let d = 2; d <= extent; d++) {
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) push(cx + dx * d, cz + dz * d);
    if (STREET_RINGS.includes(d)) {
      for (let dx = -d; dx <= d; dx++) { push(cx + dx, cz - d); push(cx + dx, cz + d); }
      for (let dz = -d + 1; dz <= d - 1; dz++) { push(cx - d, cz + dz); push(cx + d, cz + dz); }
    }
  }
  return cells;
}

// Street frontage: the direction from a cell to a paved street next
// door, or null. Fixed neighbour order (N, E, S, W) so facing is
// deterministic. Grandfathered roads count: a house beside an old
// road faces it, same as a new street.
export function streetFrontage(grid, x, z) {
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const nx = x + dx, nz = z + dz;
    if (inBounds(nx, nz)) { const nc = peekCell(grid, nx, nz); if (nc && nc.road) return [dx, dz]; }
  }
  return null;
}

// A lot is a free cell with street frontage, off the street plan
// itself and out of the fields. Dwellings keep their old spacing:
// no dwelling within 2 cells (Chebyshev) of another.
function lotFree(state, grid, x, z, type, extent) {
  if (!inBounds(x, z)) return false;
  const c = peekCell(grid, x, z);
  if (!c) return false;
  if (c.blocked || c.water || c.farm || c.building || c.tree || c.road) return false;
  if (c.stone > 0 || c.ore > 0) return false;
  if (isPlanStreet(state, x, z, extent)) return false;
  if (isFieldZone(state, x, z)) return false;
  if (state.buildQueue.some((q) => q.x === x && q.z === z)) return false;
  if (DWELLING_TYPES.includes(type)) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      const n = inBounds(nx, nz) ? peekCell(grid, nx, nz) : null;
      if (n && n.building && DWELLING_TYPES.includes(n.building)) return false;
      // A queued dwelling counts too: the grid is only marked when
      // a build completes, so without this two huts queued on
      // successive ticks could land cheek by jowl.
      if (state.buildQueue.some((q) => q.x === nx && q.z === nz && DWELLING_TYPES.includes(q.type))) return false;
    }
  }
  if (type === "farmhouse") {
    // A farmhouse anchors the farm district: it stands on the
    // western half, within reach of worked fields. Without this
    // hard rule the lot system could site one anywhere, and the
    // field bed cleared around it on completion would scatter
    // farm plots across the map — the old farmhouse scoring kept
    // them west, and the lot system must keep that promise.
    if (x >= state._cx) return false;
    let nearFarm = false;
    for (let dx = -3; dx <= 3 && !nearFarm; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (inBounds(x + dx, z + dz)) { const fc = peekCell(grid, x + dx, z + dz); if (fc && fc.farm) nearFarm = true; }
    }
    if (!nearFarm) return false;
  }
  return streetFrontage(grid, x, z) !== null;
}

export function lotScore(state, grid, x, z, type, extent = streetExtent(state)) {
  if (!lotFree(state, grid, x, z, type, extent)) return -Infinity;
  const cx = state._cx, cz = state._cz;
  const dist = Math.hypot(x - cx, z - cz);
  // Infill first: distance dominates, so empty lots near the center
  // fill before the village sprawls outward.
  let score = -dist * 10;
  // Cluster, at arm's length: buildings three to four cells away are
  // good neighbours; closer than that is already hard-rejected above.
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) < 3) continue;
    const n = inBounds(x + dx, z + dz) ? peekCell(grid, x + dx, z + dz) : null;
    if (n && n.building) score += 1.0;
  }
  if (type === "hut" || type === "longhouse" || type === "greathall") {
    if (dist < 4) score -= 6; // the civic core stays civic
  } else if (type === "farmhouse") {
    // District anchors sit at the field edge, not in the civic
    // core: cancel the infill pull, prefer the western edge at
    // middle distance, and stay near worked ground.
    score += dist * 10;
    score -= Math.abs(dist - 7) * 2.0;
    score += x < cx ? 4 : -4; // farm district is west
    let farmsNear = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (inBounds(x + dx, z + dz)) { const fc = peekCell(grid, x + dx, z + dz); if (fc && fc.farm) farmsNear++; }
    }
    score += farmsNear * 0.4;
  } else if (type === "granary") {
    score -= Math.abs(dist - 4) * 1.0;
    let farmsNear = 0;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      if (inBounds(x + dx, z + dz)) { const fc = peekCell(grid, x + dx, z + dz); if (fc && fc.farm) farmsNear++; }
    }
    score += farmsNear * 0.4;
  } else if (type === "well") {
    score -= dist * 1.5; // as central as possible
  } else if (type === "shrine") {
    const altar = state.buildings.find((b) => b.type === "altar");
    if (altar) score -= Math.hypot(x - altar.x, z - altar.z) * 3;
  } else if (type === "workshop") {
    let nearestStone = Infinity;
    for (const [sx, sz] of grid._stoneSpots || []) nearestStone = Math.min(nearestStone, Math.hypot(x - sx, z - sz));
    if (nearestStone !== Infinity) score -= nearestStone * 0.8;
    score -= Math.abs(dist - 7) * 0.5;
  } else if (type === "school" || type === "healer") {
    // Civic buildings sit near the center, within easy reach of homes.
    score -= Math.abs(dist - 5) * 1.0;
  }
  return score;
}

export function findLotSpot(state, grid, type) {
  ensureIndexes(grid);
  const extent = streetExtent(state);
  let best = null, bestScore = -Infinity;
  // Lots live beside streets, and the street plan never reaches past
  // ring 23: scan the settled bbox, not the whole map.
  const R = 32, cx = state._cx, cz = state._cz;
  for (let x = Math.max(0, cx - R); x <= Math.min(SIZE - 1, cx + R); x++) for (let z = Math.max(0, cz - R); z <= Math.min(SIZE - 1, cz + R); z++) {
    const sc = lotScore(state, grid, x, z, type, extent);
    if (sc > bestScore) { bestScore = sc; best = [x, z]; }
  }
  return bestScore > -Infinity ? best : null;
}

// Compatibility: older code and tests asked for a scored spot in a
// radius band. Lots now bound placement instead of radii, so the
// radius arguments are accepted and ignored, and the score of a
// cell is its lot score: unusable cells score -Infinity, as before.
export function scoreSpot(state, grid, x, z, type) { return lotScore(state, grid, x, z, type); }
export function findPlannedSpot(state, grid, type) { return findLotSpot(state, grid, type); }

// --- walls and towers: a ring with gates, not a sprawl ---
// The wall ring sits 9 cells out from the town center. The four axis
// cells stay open as gates: villagers, and raiders, funnel through
// them, and towers watch them. Farm beds, water, roads, and trees
// break the ring elsewhere, so a finished ring still has gaps: a
// wall slows raiders and channels them, it never seals the village
// in. Walls block movement through the grid blocked mechanism, so
// villagers path through the gates like everyone else.
export const WALL_RING_R = 9;
export const OUTER_WALL_RING_R = 18;

function ringCellFree(state, grid, x, z) {
  if (!inBounds(x, z)) return false;
  const c = cellAt(grid, x, z);
  return !c.blocked && !c.water && !c.farm && !c.building && !c.tree && c.stone <= 0 && c.ore <= 0 && !c.road;
}

export function findWallSpot(state, grid, R = WALL_RING_R) {
  const cx = state._cx, cz = state._cz;
  let best = null, bestScore = -Infinity;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
    if (dx === 0 || dz === 0) continue; // gate cells stay open
    const x = cx + dx, z = cz + dz;
    if (!ringCellFree(state, grid, x, z)) continue;
    if (state.buildQueue.some((q) => q.x === x && q.z === z)) continue;
    let score = 0;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = inBounds(x + ax, z + az) ? cellAt(grid, x + ax, z + az) : null;
      if (n && n.building === "wall") score += 3;
      if (n && n.building === "tower") score += 1;
    }
    // Grow out from the gates first, so the ring reads as one wall.
    score -= Math.min(Math.abs(dx), Math.abs(dz)) * 0.1;
    if (score > bestScore) { bestScore = score; best = [x, z]; }
  }
  return best;
}

export function findTowerSpot(state, grid) {
  // Towers sit on the ring beside a gate, spaced from other towers.
  const cx = state._cx, cz = state._cz, R = WALL_RING_R;
  let best = null, bestScore = -Infinity;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
    if (dx === 0 || dz === 0) continue; // never block a gate
    const x = cx + dx, z = cz + dz;
    if (!ringCellFree(state, grid, x, z)) continue;
    if (state.buildQueue.some((q) => q.x === x && q.z === z)) continue;
    const nearGate = (Math.abs(dx) === 1 && Math.abs(dz) === R) || (Math.abs(dx) === R && Math.abs(dz) === 1);
    let score = nearGate ? 5 : 0;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = inBounds(x + ax, z + az) ? cellAt(grid, x + ax, z + az) : null;
      if (n && n.building === "wall") score += 2;
    }
    for (const b of state.buildings) {
      if (b.type === "tower" && Math.hypot(b.x - x, b.z - z) < 5) score -= 8;
    }
    if (score > bestScore) { bestScore = score; best = [x, z]; }
  }
  return best;
}

// The village square: a road ring two cells out from the town
// center, plus a straight farm road west to the fields. Laid at
// founding so the village has visible structure from day one, and
// re-laid once for older saves that were founded without it.
export function pavePlaza(grid, cx, cz) {
  let laid = 0;
  const lay = (x, z) => {
    if (!inBounds(x, z)) return;
    const c = cellAt(grid, x, z);
    if (c.water || c.building || c.farm || c.road) return;
    if (c.tree) { c.tree = false; c.blocked = false; }
    if (c.stone > 0) { c.stone = 0; c.ore = 0; c.blocked = false; }
    c.road = true; laid++; noteMutation(grid, x, z);
  };
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) === 2) lay(cx + dx, cz + dz);
  }
  for (let x = cx - 3; x >= cx - 6; x--) lay(x, cz);
  return laid;
}

// Streets grow just in time: pave the next stretch of the street
// plan, in order, clearing trees and stone the way the founding
// plaza did. Never paves over water, buildings, or farm plots, and
// never paves a cell that is not on the plan — so a road can never
// again cut through a field. The working extent runs one ring past
// the settled village, so streets always lead and houses follow;
// the order plus the must-touch-pavement rule keeps growth
// contiguous instead of leapfrogging outward.
export function paveStreets(state, grid) {
  const extent = Math.min(STREET_RINGS[STREET_RINGS.length - 1], streetExtent(state) + RING_STEP);
  const plan = planStreetCells(state, extent);
  let paved = 0;
  for (const [x, z] of plan) {
    if (paved >= 8) break;
    const c = cellAt(grid, x, z);
    if (c.road) continue;
    if (c.water || c.building || c.farm) continue;
    let touchesRoad = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = inBounds(x + dx, z + dz) ? cellAt(grid, x + dx, z + dz) : null;
      if (n && n.road) { touchesRoad = true; break; }
    }
    if (!touchesRoad) continue;
    if (c.tree) c.tree = false;
    if (c.stone > 0) { c.stone = 0; c.ore = 0; }
    c.blocked = false;
    c.road = true;
    paved++; noteMutation(grid, x, z);
  }
  if (paved && (state._streetLogAt == null || state.elapsed - state._streetLogAt > 120)) {
    state._streetLogAt = state.elapsed;
    log(state, "Villagers extend the street through the growing village.");
  }
  return paved;
}

export function expandVillage(state, grid) {
  // Demand-scored building: the highest-scored need the village can
  // afford is queued for the builders. Nothing here is a god order.
  const demands = computeDemands(state, grid);
  if (state.buildQueue.length < 2 && demands.length) {
    const top = demands[0];
    if (canAfford(state, top.type)) {
      let spot = null;
      if (top.type === "longhouse") {
        const hut = [...state.buildings].filter((b) => b.type === "hut").sort((a, b) => (a.builtDay || 1) - (b.builtDay || 1))[0];
        if (hut) spot = [hut.x, hut.z];
      } else if (top.type === "greathall") {
        const lh = [...state.buildings].filter((b) => b.type === "longhouse").sort((a, b) => (a.builtDay || 1) - (b.builtDay || 1))[0];
        if (lh) spot = [lh.x, lh.z];
      } else if (top.type === "wall") spot = findWallSpot(state, grid, top.ring || WALL_RING_R);
      else if (top.type === "tower") spot = findTowerSpot(state, grid);
      else if (top.type === "hut") spot = findHutSpot(state, grid);
      else spot = findLotSpot(state, grid, top.type);
      if (spot) {
        // Never queue two builds on the same cell: the grid is only
        // marked when a build completes, so a second demand would
        // otherwise pick the same best spot and duplicate the building.
        const alreadyQueued = state.buildQueue.some((q) => q.x === spot[0] && q.z === spot[1]);
        if (!alreadyQueued) {
          const c = BUILD_COSTS[top.type];
          state.buildQueue.push({ type: top.type, x: spot[0], z: spot[1], progress: 0, needWood: c.wood, needStone: c.stone, needOre: c.ore || 0 });
          log(state, "The builders start a " + top.type + ": " + top.reason);
        }
      }
    }
  }
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const markers = state.buildings.filter((b) => b.type === "marker").length + state.buildQueue.filter((q) => q.type === "marker").length;
  if (state.villagers.length >= 6 && markers < 4 && state.buildQueue.length < 2 && s.wood >= 2) {
    const cx = state._cx, cz = state._cz;
    const corners = [[cx - 6, cz - 6], [cx + 6, cz - 6], [cx - 6, cz + 6], [cx + 6, cz + 6]];
    const spot = corners.find(([x, z]) => inBounds(x, z) && !cellAt(grid, x, z).blocked && !cellAt(grid, x, z).water && !cellAt(grid, x, z).farm && !cellAt(grid, x, z).building && !cellAt(grid, x, z).tree && !state.buildQueue.some((q) => q.x === x && q.z === z));
    if (spot) {
      state.buildQueue.push({ type: "marker", x: spot[0], z: spot[1], progress: 0, needWood: 2, needStone: 0, needOre: 0 });
      log(state, "The villagers raise a boundary marker.");
    }
  }
  paveStreets(state, grid);
  expandFarms(state, grid);
}

// Farms grow in beds, not single cells: a 3x3 bed cleared next to the
// existing farm district, biased west, as mouths to feed grow. A bed
// near a farmhouse grows faster (see the crop loop in step()).
export function findFarmBed(state, grid) {
  const cx = state._cx, cz = state._cz;
  let best = null, bestScore = -Infinity;
  for (let x = Math.max(2, cx - 20); x <= cx - 4; x++) for (let z = Math.max(2, cz - 20); z <= Math.min(SIZE - 3, cz + 20); z++) {
    if (Math.hypot(x - cx, z - cz) > 14) continue;
    if (x > cx - 5) continue; // farm beds stay in the western district
    if (x + 1 > cx - 3) continue; // the whole bed stays west of the plaza
    let free = 0, farmsNear = 0, trees = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const bx = x + dx, bz = z + dz;
      // Beds stay inside the field blocks and off the street plan.
      if (!isFieldZone(state, bx, bz) || isPlanStreet(state, bx, bz)) { free = -99; break; }
      const c = cellAt(grid, bx, bz);
      if (c.water || c.building || c.road) { free = -99; break; }
      if (c.farm) farmsNear++;
      else if (!c.blocked) free++;
      else if (c.tree) trees++;
    }
    if (free < 0) continue;
    // A bed keeps one cell clear of roads on every side, so fields
    // read as blocks and no road ever threads between the beds.
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) < 2) continue;
      if (cellAt(grid, x + dx, z + dz).road) { free = -99; break; }
    }
    if (free < 0) continue;
    const newCells = free + trees;
    if (newCells < 3) continue; // a bed must add ground, not re-pick existing fields
    if (free + farmsNear + trees < 9) continue;
    // Rows: a bed that lines up with an existing bed row reads as
    // fields, not scattered plots.
    let rowBonus = 0;
    for (const [fx, fz] of state._farmCells) if (Math.abs(fz - z) <= 1 && fx < cx) rowBonus += 0.4;
    const score = farmsNear * 3 + newCells * 1.5 + rowBonus - Math.hypot(x - cx, z - cz) * 0.3 - trees * 0.5;
    if (score > bestScore) { bestScore = score; best = [x, z]; }
  }
  return best;
}

export function clearFarmBed(state, grid, cx0, cz0) {
  let added = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const x = cx0 + dx, z = cz0 + dz;
    if (!inBounds(x, z)) continue;
    const c = cellAt(grid, x, z);
    if (c.water || c.building || c.road || c.farm) continue;
    if (isPlanStreet(state, x, z)) continue;
    // Fields belong in the field blocks: a bed cleared around a
    // farmhouse at the district edge farms only its western cells,
    // never the street side or the open village.
    if (!isFieldZone(state, x, z)) continue;
    if (c.tree) { c.tree = false; }
    if (c.stone > 0) { c.stone = 0; c.ore = 0; }
    c.blocked = false; c.farm = true; c.crop = 0; c.cropGrow = 0;
    state._farmCells.push([x, z]);
    noteMutation(grid, x, z);
    added++;
  }
  return added;
}

export function expandFarms(state, grid) {
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const pop = state.villagers.length;
  const plotsPerPerson = state._farmCells.length / Math.max(1, pop);
  if ((edible < 20 || edible < pop * 4 || plotsPerPerson < 2) && state._farmCells.length < 54) {
    const bed = findFarmBed(state, grid);
    if (bed) {
      const added = clearFarmBed(state, grid, bed[0], bed[1]);
      if (added) log(state, "The farmers clear a new bed of fields.");
    }
  }
}

// Weather rolls when its timer runs out. A god-sent drought or flood
// holds its own weather until it passes, then the sky rolls fresh.
function updateWeather(state) {
  if (!state.weather) state.weather = { kind: "clear", until: 0 };
  if (state.elapsed < state.effects.droughtUntil) {
    if (state.weather.kind !== "heat") state.weather = { kind: "heat", until: state.effects.droughtUntil };
    return;
  }
  if (state.elapsed < state.effects.floodUntil) {
    if (state.weather.kind !== "storm") state.weather = { kind: "storm", until: state.effects.floodUntil };
    return;
  }
  if (state.elapsed >= state.weather.until) {
    const prev = state.weather.kind;
    state.weather = rollWeather(state);
    if (state.weather.kind !== prev) log(state, "The sky changes: " + state.weather.kind + ".");
  }
}

// --- raiders: periodic hostile arrivals, gated until established ---
// A raid is telegraphed a dawn ahead, capped small, and always ends:
// raiders leave hurt, full, or out of time. Villagers flee, never
// fight unarmed; towers shoot; walls channel and delay. A prepared
// village comes through with minor losses; an unprepared one loses
// some food and, at worst, a villager or two. Never a wipe.
export const RAID_MIN_DAY = 12;
export const RAID_MIN_POP = 12;
export const RAID_MIN_TECH = 2;
export const RAID_GAP_DAYS = 8;
export const RAID_WARN_DAYS = 1;
export const RAID_SIZE_CAP = 10;
export const VILLAGE_COUNT = 3;
export const CARAVAN_CAPACITY = 20;
export const CARAVAN_BAND_BONUS = 10;
export const CARAVAN_PATH_STEPS = 60000;
export const ENVOY_COOLDOWN_DAYS = 5;
export const DEACTIVATE_AFTER_DAYS = 5;
export const GUARD_DAMAGE_BASE = 3;
export const GUARD_POST_RADIUS = 12;
export const GUARD_CAP = 6;
export const GUARD_BREAK_HEALTH = 25;
export const TOWER_RANGE = 7;
// Alliances (design section 13.5-13.7): relation 60+, both
// leaders' intents, 10-day cooldown between formations. An ally
// adds caravan capacity and sends two guards when its partner is
// raided. An alliance breaks when relations fall under 20, when a
// leader ends it, or when war is declared (Phase H).
export const ALLIANCE_MIN_RELATION = 60;
export const ALLIANCE_OFFER_DAWNS = 3;
export const ALLIANCE_COOLDOWN_DAYS = 10;
export const ALLIANCE_CAPACITY_BONUS = 10;
export const ALLIED_GUARDS = 2;
export const ALLIED_GUARD_MIN_POP = 5;
export const ALLIED_GUARD_DEATH_RELATION = -2;
// Disasters must move the population, visibly, but one use never
// wipes the village: no single disaster kills more than a quarter
// of the player's people (at least 1 in a tiny village). The same
// cap bounds the plague wave's dawn deaths.
export const DISASTER_MAX_FRACTION = 0.25;
export const DISASTER_FIRE_RADIUS = 4;
export const DISASTER_FIRE_DAMAGE = 30;
export const DISASTER_FIRE_MAX_BURNED = 3;
export const DISASTER_QUAKE_RADIUS = 6;
export const DISASTER_QUAKE_DAMAGE = 60;
export const DISASTER_QUAKE_MAX_COLLAPSED = 2;
export const DISASTER_FLOOD_RADIUS = 14;
export const DISASTER_FLOOD_LOW_H = 0.35;
export const DISASTER_FLOOD_DAMAGE = 20;
export const DISASTER_PLAGUE_DAYS = 1;
export const DISASTER_PLAGUE_SICK_CHANCE = 0.4;
export const DISASTER_PLAGUE_DAWN_DEATH = 0.35;
export function disasterKillCap(state) {
  return Math.max(1, Math.floor(ownVillagers(state).length * DISASTER_MAX_FRACTION));
}
const BUILDING_HP = { wall: 30, tower: 60 };
function buildingHp(b) { return BUILDING_HP[b.type] || 25; }

// Remove one building from the world: the list, its cell, and the
// renderer's chunk indexes. Callers re-home villagers afterwards.
function removeBuilding(state, grid, b) {
  state.buildings = state.buildings.filter((o) => o !== b);
  const c = cellAt(grid, b.x, b.z);
  if (c) { c.building = null; c.blocked = false; noteMutation(grid, b.x, b.z); }
}

// Damage the player's buildings in `targets` order (nearest first).
// At most maxCollapse may fall to this one disaster; the rest take
// their damage but are held just short of collapse, so one use
// scars the village without levelling it. The town center never
// falls to a disaster. Returns { destroyed, damaged }.
function damageBuildings(state, grid, targets, dmg, maxCollapse, verb) {
  let destroyed = 0, damaged = 0;
  for (const b of targets) {
    if (b.type === "towncenter") continue;
    b.damage = (b.damage || 0) + dmg;
    if (b.damage >= buildingHp(b) && destroyed < maxCollapse) {
      removeBuilding(state, grid, b);
      log(state, "The " + b.type + " " + verb + "!");
      destroyed++;
    } else {
      if (b.damage >= buildingHp(b)) b.damage = buildingHp(b) - 1;
      damaged++;
    }
  }
  if (destroyed || damaged) assignHomes(state);
  return { destroyed, damaged };
}

// Kill up to `cap` villagers from `candidates` (the player's own),
// weakest first, through the normal death path: a named log line,
// a faith hit, and stats.deaths. Returns the villagers killed.
function disasterKill(state, candidates, cause, cap) {
  const killed = [];
  const sorted = [...candidates].sort((a, b) => a.health - b.health);
  for (const v of sorted) {
    if (killed.length >= cap) break;
    removeVillager(state, v, cause);
    killed.push(v);
  }
  return killed;
}

export function nearestRaider(state, x, z, maxD) {
  let best = null, bestD = maxD;
  for (const r of state.raiders || []) {
    const d = Math.hypot(r.x - x, r.z - z);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

export function makeRaider(state, x, z) {
  const hp = 10 + eraStageOf(state.tech ? state.tech.level : 0) * 2;
  return {
    id: state.nextRaiderId++, x, z, path: null, direct: null,
    hp, maxHp: hp, loot: 0, state: "approach",
    retargetAt: 0, stealAt: 0, leaveAt: state.elapsed + 120,
    homeEdge: [Math.round(x), Math.round(z)],
  };
}

// An allied village sends two guards to a raid: the village is
// stirred if it was distant, the road is generated so the march
// can be pathed, and the two nearest able villagers march. They
// fight by the guard rules (stepRaiders strikes any villager with
// job "guard"), walk home when the raid ends, and keep their old
// job when they get there. Too small a village sends no one.
export function dispatchAlliedGuards(state, grid, rec) {
  touchVillage(state, grid, rec);
  const live = state.villagers.filter((v) => v.village === rec.id && !v.reinforcement);
  if (live.length < ALLIED_GUARD_MIN_POP) {
    log(state, rec.name + " is too small to send aid.");
    return 0;
  }
  generateCorridor(grid, rec.center[0], rec.center[1], state._cx, state._cz);
  const [cx, cz] = rec.center;
  const picked = [...live]
    .sort((a, b) => (Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))
      || ((b.ageDays ?? 25) - (a.ageDays ?? 25)));
  let sent = 0;
  for (const v of picked) {
    if (sent >= ALLIED_GUARDS) break;
    if ((v.ageDays ?? 25) < CHILD_DAYS || v.health <= 0) continue;
    v.reinforcement = true;
    v._homeJob = v.job;
    v.job = "guard";
    v.state = "idle";
    setTarget(state, grid, v, state._cx, state._cz);
    sent++;
  }
  if (sent) log(state, rec.name + " sends " + sent + " guard" + (sent > 1 ? "s" : "") + " to aid the village.");
  return sent;
}

export function spawnRaid(state, grid, size = null) {
  const pop = state.villagers.length;
  // Raid size scales with the village and the era, capped: bigger
  // villages with better tools draw bigger raids, never more than
  // RAID_SIZE_CAP at once.
  const n = size ?? Math.min(RAID_SIZE_CAP, 2 + Math.floor(pop / 10) + eraStageOf(state.tech ? state.tech.level : 0));
  const dirs = ["north", "south", "east", "west"];
  const dir = dirs[Math.floor(state._rng() * 4)];
  // Original spawn pattern: the old block's edge, one draw per
  // raider. Every edge cell sits 23+ cells from the center, which
  // is the doc's >=20 active-region-edge rule on the settled map,
  // and the cells are always generated land. (Phase E may push the
  // spawn outward as the settled region grows; the pattern stays.)
  const spawned = [];
  for (let i = 0; i < n; i++) {
    let x, z;
    if (dir === "north") { x = 2 + Math.floor(state._rng() * (OLD_SIZE - 4)); z = 1; }
    else if (dir === "south") { x = 2 + Math.floor(state._rng() * (OLD_SIZE - 4)); z = OLD_SIZE - 2; }
    else if (dir === "west") { x = 1; z = 2 + Math.floor(state._rng() * (OLD_SIZE - 4)); }
    else { x = OLD_SIZE - 2; z = 2 + Math.floor(state._rng() * (OLD_SIZE - 4)); }
    let tries = 0;
    let cell = peekCell(grid, x, z);
    while (cell && cell.water && tries < 10) { x = clamp(x + 1, 1, OLD_SIZE - 2); z = clamp(z + 1, 1, OLD_SIZE - 2); tries++; cell = peekCell(grid, x, z); }
    const r = makeRaider(state, x + 0.5, z + 0.5);
    r.homeEdge = [x, z];
    state.raiders.push(r);
    spawned.push(r);
  }
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0, guardKills: 0, towerKills: 0, breaches: 0 };
  // Allied villages answer a raid: each ally with enough people
  // sends two guards, who walk over, fight by the guard rules,
  // and walk home when the raid ends.
  for (const rec of state.villages || []) {
    if (!allied(state, 0, rec.id)) continue;
    dispatchAlliedGuards(state, grid, rec);
  }
  // Guards rethink immediately: posts are taken in seconds, not on
  // the next 4-7s rethink cycle.
  for (const v of state.villagers) if (v.assignedJob === "guard") v.rethinkAt = state.elapsed;
  log(state, "Raiders attack! " + n + " raiders come from the " + dir + ". The villagers flee.");
  return spawned;
}

function nearestWallCell(state, r) {
  // The building list is the wall index: walls and towers are few,
  // and the list is always current. No full-grid scan.
  let best = null, bestD = Infinity;
  for (const b of state.buildings) {
    if (b.type !== "wall" && b.type !== "tower") continue;
    const d = Math.hypot(b.x - r.x, b.z - r.z);
    if (d < bestD) { bestD = d; best = [b.x, b.z]; }
  }
  return best;
}

function moveRaider(state, grid, r, tx, tz, dt) {
  if (state.elapsed >= r.retargetAt || (!r.path && !r.direct)) {
    r.retargetAt = state.elapsed + 3;
    const path = findPath(grid, Math.round(r.x), Math.round(r.z), clamp(Math.round(tx), 0, SIZE - 1), clamp(Math.round(tz), 0, SIZE - 1), 4000);
    if (path && path.length) { r.path = path; r.direct = null; }
    else { r.path = null; r.direct = nearestWallCell(state, r); }
  }
  let dest = null;
  if (r.path && r.path.length) dest = r.path[0];
  else if (r.direct) dest = r.direct;
  if (!dest) return;
  const dx = dest[0] + 0.5 - r.x, dz = dest[1] + 0.5 - r.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.3) {
    if (r.path && r.path.length) r.path.shift();
    return;
  }
  const sp = 2.0 * dt; // slower than a fleeing villager: flight works
  r.x += (dx / dist) * Math.min(sp, dist);
  r.z += (dz / dist) * Math.min(sp, dist);
}

function destructibleNear(state, grid, r) {
  // A building in an adjacent cell, excluding the town center and
  // altar: raiders sack and break, they do not raze the heart.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
    const x = Math.round(r.x) + dx, z = Math.round(r.z) + dz;
    if (!inBounds(x, z)) continue;
    const t = cellAt(grid, x, z).building;
    if (!t || t === "towncenter" || t === "altar") continue;
    const b = state.buildings.find((o) => o.x === x && o.z === z);
    if (b) return b;
  }
  return null;
}

function resolveRaid(state) {
  state.raidActive = false;
  state.lastRaidDay = state.day;
  const st = state._raidStats || { deaths: 0, stolen: 0, killed: 0, guardKills: 0, towerKills: 0, breaches: 0 };
  const gk = st.guardKills || 0, tk = st.towerKills || 0, br = st.breaches || 0;
  const defense = (st.killed || br)
    ? " (" + st.killed + " felled" + ((gk || tk) ? ", " + gk + " by guards, " + tk + " by towers" : "") + (br ? ", " + br + (br === 1 ? " breach" : " breaches") : "") + ")"
    : "";
  if (st.deaths === 0 && st.stolen === 0) {
    state.morale = clamp((state.morale ?? 60) + 8, 0, 100);
    state.faith = clamp(state.faith + 5, 0, 100);
    state.lastRaidLine = "The village drives off the raiders without loss." + defense;
    log(state, state.lastRaidLine + " Morale soars.");
  } else {
    state.morale = clamp((state.morale ?? 60) - 8, 0, 100);
    state.faith = clamp(state.faith - 3, 0, 100);
    state.lastRaidLine = "The raid ends. " + st.deaths + " slain, " + st.stolen + " food stolen, " + st.killed + " raiders felled." + defense;
    log(state, state.lastRaidLine);
  }
  for (const v of state.villagers) { v.brokeOff = false; v._guardKillLogged = false; }
  assignGuardPosts(state);
  state._raidStats = null;
}

// --- neighbor villages (Phase F): abstract life, activation, trade ---
// A neighbor village lives in its record while distant (one abstract
// tick per dawn) and as real villagers and buildings while the god
// is near. The two forms hold the same numbers: activation converts
// exactly, deactivation converts back exactly. Nothing is created
// or destroyed at the boundary except the villagers' positions.

function stepForeignVillager(state, grid, v, dt) {
  const rec = villageRecord(state, v.village);
  const [cx, cz] = rec ? rec.center : [state._cx, state._cz];
  const phase = phaseOf(state.time);
  // Reinforcements do not flee or mill about: while the raid runs
  // they close with raiders or hold the village center, and when
  // it ends they walk home. Arrival home clears the flag and
  // restores the job they marched away from.
  if (v.reinforcement) {
    if (state.raidActive) {
      if (!v.target && state.elapsed >= v.rethinkAt) {
        v.rethinkAt = state.elapsed + 2 + villageRng(state)() * 2;
        const r = nearestRaider(state, v.x, v.z, 12);
        if (r) setTarget(state, grid, v, Math.round(r.x), Math.round(r.z));
        else setTarget(state, grid, v, state._cx, state._cz);
      }
    } else {
      if (Math.hypot(v.x - (cx + 0.5), v.z - (cz + 0.5)) < 3) {
        v.reinforcement = false; v.job = v._homeJob || "hauler"; v._homeJob = null;
        v.target = null; v.path = null; v.state = "idle";
      } else if (!v.target && state.elapsed >= v.rethinkAt) {
        v.rethinkAt = state.elapsed + 2 + villageRng(state)() * 2;
        setTarget(state, grid, v, cx, cz);
      }
    }
  } else {
    // A raider close by sends a neighbor villager running now, not
    // at the next rethink: the same rule the player's villagers get.
    if (state.raiders.length && v.state !== "flee" && nearestRaider(state, v.x, v.z, 5)) {
      v.state = "flee"; v.rethinkAt = state.elapsed;
    }
    if (v.state === "flee") {
    if (v.fear < 20) { v.state = "idle"; v.target = null; v.path = null; }
    else if (!v.target) {
      const r = nearestRaider(state, v.x, v.z, 30);
      const ax = r ? r.x : cx, az = r ? r.z : cz;
      const ang = Math.atan2(v.z - az, v.x - ax);
      setTarget(state, grid, v, clamp(Math.round(v.x + Math.cos(ang) * 6), 0, SIZE - 1), clamp(Math.round(v.z + Math.sin(ang) * 6), 0, SIZE - 1));
    }
  } else if (!v.target && state.elapsed >= v.rethinkAt) {
    const vrng = villageRng(state);
    v.rethinkAt = state.elapsed + 4 + vrng() * 3;
    // Mill around home: a short wander inside the cleared site.
    if (phase !== "night" || vrng() < 0.3) {
      setTarget(state, grid, v, clamp(Math.round(cx + (vrng() * 10 - 5)), 0, SIZE - 1), clamp(Math.round(cz + (vrng() * 10 - 5)), 0, SIZE - 1));
    }
  }
  }
  // Movement: the same path-following the player's villagers use,
  // minus work. Arrival clears the target and settles the villager.
  if (v.path && v.path.length) {
    const [px, pz] = v.path[0];
    const dx = px + 0.5 - v.x, dz = pz + 0.5 - v.z, dist = Math.hypot(dx, dz);
    if (dist < 0.25) v.path.shift();
    else {
      const wkind = state.weather ? state.weather.kind : "clear";
      const moveFactor = wkind === "snow" ? 0.85 : wkind === "storm" ? 0.9 : 1;
      const sp = (v.state === "flee" ? 3.4 : 2.2) * moveFactor * dt;
      v.x += (dx / dist) * Math.min(sp, dist); v.z += (dz / dist) * Math.min(sp, dist);
    }
  } else if (v.target) {
    const dx = v.target[0] + 0.5 - v.x, dz = v.target[1] + 0.5 - v.z, dist = Math.hypot(dx, dz);
    const tc = peekCell(grid, v.target[0], v.target[1]);
    if (dist < 1.1 || !tc || tc.blocked) { v.target = null; v.path = null; v.state = "idle"; }
    else { const sp = (v.state === "flee" ? 3.4 : 2.2) * dt; v.x += (dx / dist) * Math.min(sp, dist); v.z += (dz / dist) * Math.min(sp, dist); }
  }
  if (v.state === "flee") v.fear = clamp(v.fear - dt * 8, 0, 100);
}

// One dawn of abstract life for a distant village: the fixed job mix
// produces and eats at the player's per-worker rates, capped so a
// village left alone for a season cannot balloon or starve to zero
// in a single tick. Births and deaths are small chances, bounded.
export function abstractVillageTick(state, rec) {
  const rng = villageRng(state);
  const pop = Math.max(0, rec.pop);
  const mix = rec.jobMix;
  const produce = {
    food: pop * (mix.farmer * 2.4 + mix.fisher * 1.2 + mix.hunter * 1.5),
    fish: pop * mix.fisher * 0.8,
    meat: pop * mix.hunter * 0.6,
    wood: pop * mix.woodcutter * 1.8,
    stone: pop * mix.miner * 0.8,
    ore: pop * mix.miner * 0.3,
  };
  const consume = {
    food: pop * 1.1, fish: pop * 0.1, meat: pop * 0.05,
    wood: pop * 0.1, stone: 0, ore: 0,
  };
  for (const g of Object.keys(produce)) {
    rec.stockpile[g] = clamp((rec.stockpile[g] || 0) + produce[g] - (consume[g] || 0), 0, 200);
  }
  if (rng() < pop * 0.012 && pop < rec.popCap) rec.pop = pop + 1;
  if (rng() < pop * 0.01 && pop > 3) rec.pop = Math.max(3, pop - 1);
  rec.coins = clamp(rec.coins + 1, 0, 80);
  const need = techThresholdFor(rec.techLevel);
  if (rec.techLevel < TECH_TIERS.length - 1) {
    rec.techProgress = (rec.techProgress || 0) + 2;
    if (rec.techProgress >= need) { rec.techLevel++; rec.techProgress = 0; }
  }
  rec.morale = clamp(rec.morale + (50 - rec.morale) * 0.1, 0, 100);
}

// Discovery: the god learns a village exists. First trader arrival,
// an envoy, or walking within 3 chunks all discover it. Discovery
// is one-way and logged once.
export function discoverVillage(state, rec, how) {
  if (!rec || rec.known) return false;
  rec.known = true;
  rec.lastContactDay = state.day;
  log(state, "You discover " + rec.name + ", led by " + rec.leaderName + " (" + how + ").");
  return true;
}

// A trigger keeps a village active: a caravan moving, an envoy, or
// the camera dwelling nearby. The dawn hook converts triggers into
// activations and stale villages back into records.
export function touchVillage(state, grid, rec) {
  if (!rec) return;
  rec.lastTriggerDay = state.day;
  if (!rec.active && grid) activateVillage(state, grid, rec, false);
}

// Materialize a village: generate its chunks, place its buildings,
// spawn its people. Exact conversion: pop villagers, building
// counts from the record, the stockpile stays in the record.
export function activateVillage(state, grid, rec, silent = false) {
  if (!rec || rec.active) return false;
  if (!grid) return false;
  const [cx, cz] = rec.center;
  // Generate the 3x3 chunks around the center first: the founding
  // buildings land on real, cleared ground.
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const gx = cx + dx * CHUNK, gz = cz + dz * CHUNK;
    if (gx >= 0 && gz >= 0 && gx < SIZE && gz < SIZE) {
      const [ccx, ccz] = chunkOf(gx, gz);
      getChunk(grid, ccx, ccz);
    }
  }
  const placed = placeVillageBuildings(state, grid, rec);
  const rng = villageRng(state);
  const jobs = Object.keys(rec.jobMix);
  let spawned = 0;
  for (let i = 0; i < rec.pop; i++) {
    const job = jobs[Math.floor(rng() * jobs.length)] || "hauler";
    const v = makeVillager(state, cx + Math.round(rng() * 6 - 3), cz + Math.round(rng() * 6 - 3), false, {
      village: rec.id, job, ageDays: 18 + Math.floor(rng() * 30), rng,
    });
    if (i === 0) { v.leader = true; v.name = rec.leaderName; }
    state.villagers.push(v);
    spawned++;
  }
  rec.active = true;
  rec.activeDay = state.day;
  rec.lastTriggerDay = state.day;
  if (!silent) log(state, rec.name + " stirs. " + spawned + " villagers go about their day.");
  return true;
}

function placeVillageBuildings(state, grid, rec) {
  // Fixed offsets from the center: town center at home, huts and
  // granary around it. Cells are already cleared by site generation;
  // buildings land on land, never on water.
  const [cx, cz] = rec.center;
  const layout = [];
  layout.push(["towncenter", 0, 0]);
  const huts = rec.buildings.hut || 0;
  const hutOffsets = [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -3], [0, 3], [-3, 0], [3, 0]];
  for (let i = 0; i < huts; i++) layout.push(["hut", hutOffsets[i % hutOffsets.length][0], hutOffsets[i % hutOffsets.length][1]]);
  if (rec.buildings.granary) layout.push(["granary", -3, 3]);
  if (rec.buildings.longhouse) layout.push(["longhouse", 3, -3]);
  if (rec.buildings.workshop) layout.push(["workshop", -3, -3]);
  let placed = 0;
  for (const [type, dx, dz] of layout) {
    const x = cx + dx, z = cz + dz;
    const c = cellAt(grid, x, z);
    if (!c || c.water || c.building) continue;
    c.building = type; c.blocked = true; noteMutation(grid, x, z);
    state.buildings.push({ type, x, z, done: true, builtDay: state.day, village: rec.id });
    placed++;
  }
  return placed;
}

// Send a village back to its record: pop becomes the live count,
// building counts become the live counts, villagers and buildings
// despawn. Exact conversion, silent unless a battle just ended.
export function deactivateVillage(state, grid, rec) {
  if (!rec || !rec.active) return false;
  const live = state.villagers.filter((v) => v.village === rec.id);
  rec.pop = clamp(live.length, 3, rec.popCap);
  const counts = {};
  for (const b of state.buildings.filter((b) => b.village === rec.id)) {
    counts[b.type] = (counts[b.type] || 0) + 1;
  }
  rec.buildings = counts;
  state.villagers = state.villagers.filter((v) => v.village !== rec.id);
  for (const b of state.buildings.filter((b) => b.village === rec.id)) {
    const c = peekCell(grid, b.x, b.z);
    if (c && c.building === b.type) { c.building = null; c.blocked = c.water; noteMutation(grid, b.x, b.z); }
  }
  state.buildings = state.buildings.filter((b) => b.village !== rec.id);
  rec.active = false;
  return true;
}

export function dawnVillages(state, grid) {
  const sKey = seasonKey(state);
  const sChanged = state._villageSeasonKey !== sKey;
  state._villageSeasonKey = sKey;
  for (const rec of state.villages || []) {
    if (!rec.active) abstractVillageTick(state, rec);
    // First trader: one caravan per village in the first season,
    // staggered by the deterministic traderDay.
    if (!rec.traderSent && state.day >= rec.traderDay) {
      const res = dispatchCaravan(state, grid, rec.id, 0, null, null, true);
      if (res.ok) rec.traderSent = true;
    }
    // Season drift: relations drift 1 per season toward 0 when
    // there has been no contact this season; completed trades and
    // envoy contact count as contact. Allies instead warm by 2
    // every season: the alliance itself is the contact.
    if (sChanged) {
      if (allied(state, 0, rec.id)) {
        adjustRelation(state, 0, rec.id, 2);
      } else if (rec.contactSeason !== sKey) {
        const cur = getRelation(state, 0, rec.id);
        if (cur !== 0) adjustRelation(state, 0, rec.id, cur > 0 ? -1 : 1);
      }
      rec.contactSeason = -1;
    }
    // Envoy arrivals resolve at dawn.
    if (state.pendingEnvoys) {
      for (const e of [...state.pendingEnvoys]) {
        if (e.to !== rec.id) continue;
        state.pendingEnvoys = state.pendingEnvoys.filter((o) => o !== e);
        discoverVillage(state, rec, "your envoy arrives");
        adjustRelation(state, 0, rec.id, 3);
        rec.lastEvent = "Envoy exchanged greetings (+3).";
        rec.contactSeason = sKey;
        log(state, rec.leaderName + " of " + rec.name + " welcomes your envoy. Relations warm (+3).");
      }
    }
    // Alliance proposals: the neighbor leader answers within
    // three dawns. Acceptance needs warm relations, a free
    // cooldown, and enough people to spare guards; otherwise the
    // offer waits, and lapses past its window.
    if (rec.allyOffer) {
      const offer = rec.allyOffer;
      if (state.day - offer.day > ALLIANCE_OFFER_DAWNS) {
        rec.allyOffer = null;
        log(state, rec.leaderName + " of " + rec.name + " lets the alliance offer lapse.");
      } else if (!allied(state, offer.from, rec.id) && getRelation(state, offer.from, rec.id) >= ALLIANCE_MIN_RELATION
        && allianceCooldownOk(state, offer.from, rec.id) && villagePop(state, rec) >= ALLIED_GUARD_MIN_POP) {
        formAlliance(state, offer.from, rec.id);
        rec.lastEvent = "Allied with " + villageName(state, offer.from) + ".";
      }
    }
    // A leader ends an alliance whose relations have soured under
    // 30: the end_alliance intent, with its longer cooldown. The
    // player's leader speaks here too, at dawn, in the leader's name.
    if (allied(state, 0, rec.id) && getRelation(state, 0, rec.id) < 30) {
      const l = leader(state);
      breakAlliance(state, 0, rec.id, (l ? l.name : "The leader") + " ends it: relations have soured", 30);
    }
    // Deactivation: five quiet game-days with no trigger, no
    // caravan in flight to or from the village, and no raiders
    // within 20 cells of its center.
    if (rec.active && state.day - (rec.lastTriggerDay || 0) >= DEACTIVATE_AFTER_DAYS) {
      const busy = (state.caravans || []).some((c) => c.from === rec.id || c.to === rec.id);
      const raidersNear = (state.raiders || []).some((r) => Math.hypot(r.x - rec.center[0], r.z - rec.center[1]) < 20);
      const deployed = state.villagers.some((v) => v.village === rec.id && v.reinforcement);
      if (!busy && !raidersNear && !deployed) deactivateVillage(state, grid, rec);
    }
  }
}

export function caravanCapacity(state, a, b) {
  const rel = getRelation(state, a, b);
  let cap = CARAVAN_CAPACITY;
  if (rel >= 60) cap += 2 * CARAVAN_BAND_BONUS;
  else if (rel >= 30) cap += CARAVAN_BAND_BONUS;
  if (allied(state, a, b)) cap += ALLIANCE_CAPACITY_BONUS;
  return cap;
}

function pairKey(a, b) { return Math.min(a, b) + "-" + Math.max(a, b); }

// Generate every chunk the straight line between two points
// crosses, plus its neighbors, so a caravan's pathfinding sees
// real terrain instead of the ungenerated void (which reads as
// blocked) and has room to route around lakes.
function generateCorridor(grid, x0, z0, x1, z1) {
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
export function dispatchCaravan(state, grid, from, to, give = null, want = null, scheduled = false) {
  const fromRec = villageRecord(state, from), toRec = villageRecord(state, to);
  if (from === to) return { ok: false, reason: "A village cannot trade with itself." };
  if ((state.caravans || []).some((c) => pairKey(c.from, c.to) === pairKey(from, to))) {
    return { ok: false, reason: "A caravan is already traveling between those villages." };
  }
  if (getRelation(state, from, to) < 0) {
    return { ok: false, reason: "Relations are too cold for trade." };
  }
  const sKey = seasonKey(state);
  if (!scheduled) {
    const key = pairKey(from, to) + ":" + sKey;
    if ((state.tradeSeasons || {})[key]) return { ok: false, reason: "Those villages have already traded this season." };
  }
  const fromStock = stockpileFor(state, from);
  const toStock = stockpileFor(state, to);
  const cap = caravanCapacity(state, from, to);
  let giveGood, giveQty, wantGood, wantQty;
  if (!give) {
    // First trader / auto offer: send the largest surplus, ask for
    // the scarcest staple.
    let best = null;
    for (const g of Object.keys(PRICES)) if ((fromStock[g] || 0) >= 10 && (!best || fromStock[g] > fromStock[best])) best = g;
    if (!best) {
      log(state, (fromRec ? fromRec.name : "The village") + " has nothing to spare for a trader.");
      return { ok: false, reason: "Nothing to spare." };
    }
    giveGood = best; giveQty = Math.min(10, Math.floor(fromStock[best]), cap);
    const scarcest = ["food", "fish", "meat", "wood", "stone", "ore"].reduce((a, b) => (fromStock[a] || 0) <= (fromStock[b] || 0) ? a : b);
    wantGood = scarcest; wantQty = Math.min(giveQty, cap);
  } else {
    giveGood = give.good; giveQty = Math.floor(give.qty);
    wantGood = want.good; wantQty = Math.floor(want.qty);
    if (!PRICES[giveGood] || !PRICES[wantGood]) return { ok: false, reason: "Unknown goods." };
    if (giveQty < 1 || wantQty < 1 || giveQty > cap || wantQty > cap) {
      return { ok: false, reason: "The load is outside the caravan's capacity (" + cap + ")." };
    }
    if ((fromStock[giveGood] || 0) < giveQty) return { ok: false, reason: "The origin does not hold that much " + giveGood + "." };
    if ((toStock[wantGood] || 0) < wantQty) return { ok: false, reason: "The destination does not hold that much " + wantGood + "." };
  }
  const [fx, fz] = from === 0 ? [state._cx, state._cz] : fromRec.center;
  const [tx, tz] = to === 0 ? [state._cx, state._cz] : toRec.center;
  generateCorridor(grid, fx, fz, tx, tz);
  // The default step cap scales with the settled active set and
  // starves a cross-map BFS: the corridor band floods before the
  // target is reached. A caravan dispatch is rare (one per pair
  // per season), so it gets an explicit generous cap.
  const path = findPath(grid, fx, fz, tx, tz, CARAVAN_PATH_STEPS);
  if (!path || !path.length) {
    log(state, "No road can be found between the villages. The caravan stays home.");
    return { ok: false, reason: "No path between the villages." };
  }
  fromStock[giveGood] -= giveQty;
  const caravan = {
    id: state.nextCaravanId++, from, to,
    give: giveGood, giveQty, want: wantGood, wantQty,
    load: { [giveGood]: giveQty },
    path, x: fx + 0.5, z: fz + 0.5, state: "out",
    scheduled: !!scheduled, robbed: 0, held: false, fled: false,
  };
  state.caravans.push(caravan);
  if (!scheduled) {
    if (!state.tradeSeasons) state.tradeSeasons = {};
    state.tradeSeasons[pairKey(from, to) + ":" + sKey] = true;
  }
  // A departure stirs both ends: villages activate on the trigger.
  if (fromRec) touchVillage(state, grid, fromRec);
  if (toRec) touchVillage(state, grid, toRec);
  return { ok: true, caravan };
}

function caravanDestination(state, c) {
  const leg = (c.state === "waiting" ? (c.prevState || "out") : c.state) === "out" ? c.to : c.from;
  if (leg === 0) return [state._cx, state._cz];
  const rec = villageRecord(state, leg);
  return rec ? rec.center : [state._cx, state._cz];
}

function moveCoins(state, fromId, toId, amount) {
  if (amount <= 0) return 0;
  const get = (id) => id === 0 ? state.fund : ((villageRecord(state, id) || {}).coins || 0);
  const set = (id, v) => { if (id === 0) state.fund = v; else { const r = villageRecord(state, id); if (r) r.coins = v; } };
  const paid = Math.min(amount, get(fromId));
  set(fromId, get(fromId) - paid);
  set(toId, get(toId) + paid);
  return paid;
}

function arriveCaravan(state, grid, c) {
  const destRec = villageRecord(state, c.to);
  const fromRec = villageRecord(state, c.from);
  const destStock = stockpileFor(state, c.to);
  // Deliver the load, take the return goods, settle the coin
  // difference between the two funds. Quantities clamp to what is
  // actually there: stocks move while a caravan is on the road.
  const deliverQty = c.load[c.give] || 0;
  destStock[c.give] = (destStock[c.give] || 0) + deliverQty;
  const takeQty = Math.min(c.wantQty, destStock[c.want] || 0);
  destStock[c.want] = (destStock[c.want] || 0) - takeQty;
  const coinsDue = deliverQty * PRICES[c.give] - takeQty * PRICES[c.want];
  if (coinsDue > 0) moveCoins(state, c.to, c.from, coinsDue);
  else if (coinsDue < 0) moveCoins(state, c.from, c.to, -coinsDue);
  // A completed trade warms relations, at most +2 per season per pair.
  const sKey = seasonKey(state);
  const pairRec = fromRec || destRec;
  if (pairRec && pairRec.tradeSeason !== sKey) {
    pairRec.tradeSeason = sKey;
    adjustRelation(state, c.from, c.to, 2);
  }
  if (pairRec) {
    pairRec.lastEvent = "Traded " + deliverQty + " " + c.give + " for " + takeQty + " " + c.want + ".";
    pairRec.contactSeason = sKey;
    pairRec.lastContactDay = state.day;
  }
  // Arrival discovers: the first trader, or the god's own trader
  // reaching a village the god has never seen.
  if (c.to === 0 && fromRec) discoverVillage(state, fromRec, "a trader arrives");
  if (c.from === 0 && destRec) discoverVillage(state, destRec, "your trader arrives");
  const fromName = fromRec ? fromRec.name : "your village";
  const toName = destRec ? destRec.name : "your village";
  log(state, "A trader from " + fromName + " reaches " + toName + ": " + deliverQty + " " + c.give + " for " + takeQty + " " + c.want + ".");
  c.load = takeQty > 0 ? { [c.want]: takeQty } : {};
  c.state = "home";
  const [hx, hz] = caravanDestination(state, c);
  const path = findPath(grid, Math.round(c.x), Math.round(c.z), hx, hz, CARAVAN_PATH_STEPS);
  if (path && path.length) c.path = path;
  else { c.prevState = "home"; c.state = "waiting"; c.path = null; }
  if (fromRec) touchVillage(state, grid, fromRec);
  if (destRec) touchVillage(state, grid, destRec);
}

function returnCaravan(state, c) {
  const originStock = stockpileFor(state, c.from);
  for (const [g, q] of Object.entries(c.load)) originStock[g] = (originStock[g] || 0) + q;
  state.caravans = state.caravans.filter((o) => o !== c);
  const fromRec = villageRecord(state, c.from);
  log(state, "The trader returns to " + (fromRec ? fromRec.name : "your village")
    + (c.robbed ? ", robbed of " + c.robbed + " goods on the road." : "."));
}

export function stepCaravans(state, grid, dt) {
  for (const c of [...(state.caravans || [])]) {
    // Arrival is positional, not path-emptiness: a path recomputed
    // from an adjacent cell always returns one more step, so a
    // caravan waiting on an empty path would oscillate forever.
    // Within a cell and a half of the leg's destination, the leg
    // resolves: the trader has reached the village.
    const dest = caravanDestination(state, c);
    if (Math.hypot(c.x - (dest[0] + 0.5), c.z - (dest[1] + 0.5)) < 1.5) {
      const leg = c.state === "waiting" ? (c.prevState || "out") : c.state;
      if (leg === "out") arriveCaravan(state, grid, c);
      else returnCaravan(state, c);
      continue;
    }
    // Held up: a raider adjacent to a laden caravan stops it cold.
    c.held = (state.raiders || []).some((r) => Math.hypot(r.x - c.x, r.z - c.z) < 1.3) && Object.keys(c.load).length > 0;
    if (c.held) continue;
    if (c.state === "waiting") {
      const dest = caravanDestination(state, c);
      const path = findPath(grid, Math.round(c.x), Math.round(c.z), dest[0], dest[1], CARAVAN_PATH_STEPS);
      if (path && path.length) { c.path = path; c.state = c.prevState || "out"; }
      continue;
    }
    if (!c.path || !c.path.length) {
      if (c.state === "out") { arriveCaravan(state, grid, c); continue; }
      // Home or fleeing with no route: route home, or if already
      // there, deposit the load and leave.
      const dest = caravanDestination(state, c);
      const path = findPath(grid, Math.round(c.x), Math.round(c.z), dest[0], dest[1], CARAVAN_PATH_STEPS);
      if (path && path.length) { c.path = path; continue; }
      returnCaravan(state, c);
      continue;
    }
    const [px, pz] = c.path[0];
    const dx = px + 0.5 - c.x, dz = pz + 0.5 - c.z, dist = Math.hypot(dx, dz);
    if (dist < 0.25) { c.path.shift(); continue; }
    const sp = (c.state === "fleeing" ? 3.4 : 2.2) * dt;
    c.x += (dx / dist) * Math.min(sp, dist);
    c.z += (dz / dist) * Math.min(sp, dist);
  }
}

function nearestLadenCaravan(state, x, z, maxD) {
  let best = null, bestD = maxD;
  for (const c of state.caravans || []) {
    if (!Object.keys(c.load).length || c.state === "fleeing") continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function stealFromCaravan(state, c, n) {
  const g = Object.keys(c.load)[0];
  if (!g) return 0;
  const take = Math.min(n, c.load[g]);
  c.load[g] -= take;
  if (c.load[g] <= 0) delete c.load[g];
  c.robbed = (c.robbed || 0) + take;
  if (!Object.keys(c.load).length && !c.fled) {
    c.fled = true;
    c.state = "fleeing";
    adjustRelation(state, c.from, c.to, -3);
    log(state, "Raiders rob the trader bare. Word of it sours relations (-3).");
  }
  return take;
}

function stepRaiders(state, grid, dt) {
  if (!state.raiders.length) {
    if (state.raidActive) resolveRaid(state);
    return;
  }
  const cx = state._cx, cz = state._cz;
  // Towers shoot: one volley per second per MANNED tower, range
  // TOWER_RANGE. An unmanned tower never shoots: its guard is the
  // weapon, and the post is what makes the tower dangerous.
  if (state.elapsed >= (state.towerAt || 0)) {
    state.towerAt = state.elapsed + 1;
    for (const t of state.buildings.filter((b) => b.type === "tower")) {
      if (!towerManned(state, t)) continue;
      let best = null, bestD = TOWER_RANGE;
      for (const r of state.raiders) {
        const d = Math.hypot(r.x - (t.x + 0.5), r.z - (t.z + 0.5));
        if (d < bestD) { bestD = d; best = r; }
      }
      if (best) {
        best.hp -= 2 + eraStageOf(state.tech ? state.tech.level : 0);
        if (best.hp <= 0) {
          state.raiders = state.raiders.filter((o) => o !== best);
          if (state._raidStats) { state._raidStats.killed++; state._raidStats.towerKills = (state._raidStats.towerKills || 0) + 1; }
          log(state, "A tower fells a raider.");
        }
      }
    }
  }
  // Guards strike: once per second, a guard on duty hits the nearest
  // raider within 1.3 cells for GUARD_DAMAGE_BASE + tool tier.
  if (state.elapsed >= (state.guardAt || 0)) {
    state.guardAt = state.elapsed + 1;
    for (const v of state.villagers) {
      if (v.job !== "guard" || v.health <= 0) continue;
      const r = nearestRaider(state, v.x, v.z, 1.3);
      if (!r) continue;
      r.hp -= GUARD_DAMAGE_BASE + (v.tool || 0);
      if (r.hp <= 0) {
        state.raiders = state.raiders.filter((o) => o !== r);
        if (state._raidStats) { state._raidStats.killed++; state._raidStats.guardKills = (state._raidStats.guardKills || 0) + 1; }
        if (!v._guardKillLogged) { v._guardKillLogged = true; log(state, v.name + " fells a raider."); }
      }
    }
  }
  for (const r of [...state.raiders]) {
    if (r.hp <= r.maxHp * 0.35 || r.loot >= 8 || state.elapsed >= state.raidUntil) r.state = "leave";
    if (r.state === "leave") {
      if (Math.hypot(r.x - r.homeEdge[0], r.z - r.homeEdge[1]) < 2 || state.elapsed >= state.raidUntil + 40) {
        state.raiders = state.raiders.filter((o) => o !== r);
        continue;
      }
      moveRaider(state, grid, r, r.homeEdge[0], r.homeEdge[1], dt);
      continue;
    }
    // A villager in reach is attacked. Villagers flee, so contact is
    // usually brief; a cornered or sleeping villager can be slain.
    const victim = state.villagers.find((v) => Math.hypot(v.x - r.x, v.z - r.z) < 1.3);
    if (victim) {
      victim.health = clamp(victim.health - 10 * dt, 0, 100);
      victim.fear = 85;
      if (victim.health <= 0) {
        removeVillager(state, victim, "slain by raiders");
        if (state._raidStats) state._raidStats.deaths++;
      }
      continue;
    }
    // Caravans on the road are worth robbing: a raider within 8
    // cells of a laden caravan diverts to it and steals 2 goods
    // per 2 seconds while adjacent. A caravan robbed empty flees.
    const caravan = nearestLadenCaravan(state, r.x, r.z, 8);
    if (caravan) {
      const d = Math.hypot(caravan.x - r.x, caravan.z - r.z);
      if (d < 1.3) {
        if (state.elapsed >= r.stealAt) {
          r.stealAt = state.elapsed + 2;
          const stolen = stealFromCaravan(state, caravan, 2);
          r.loot += stolen;
          if (state._raidStats) state._raidStats.stolen += stolen;
        }
        caravan.held = true;
      } else {
        moveRaider(state, grid, r, Math.round(caravan.x), Math.round(caravan.z), dt);
      }
      continue;
    }
    // Break through: batter an adjacent wall, tower, or building.
    const target = destructibleNear(state, grid, r);
    if (target) {
      target.damage = (target.damage || 0) + 6 * dt;
      if (target.damage >= buildingHp(target)) {
        state.buildings = state.buildings.filter((o) => o !== target);
        cellAt(grid, target.x, target.z).building = null;
        cellAt(grid, target.x, target.z).blocked = false;
        noteMutation(grid, target.x, target.z);
        if (state._raidStats && (target.type === "wall" || target.type === "tower")) state._raidStats.breaches = (state._raidStats.breaches || 0) + 1;
        log(state, target.type === "wall" ? "Raiders break through the wall!"
          : target.type === "tower" ? "Raiders topple a tower!"
          : "Raiders sack the " + target.type + "!");
        assignHomes(state);
      }
      continue;
    }
    // Steal at the center: food, then leave with it.
    if (Math.hypot(r.x - (cx + 0.5), r.z - (cz + 0.5)) < 3) {
      if (state.elapsed >= r.stealAt) {
        r.stealAt = state.elapsed + 2;
        const s = state.stockpile;
        const kind = s.food > 0 ? "food" : s.fish > 0 ? "fish" : s.meat > 0 ? "meat" : null;
        if (kind) {
          s[kind] = Math.max(0, s[kind] - 2);
          r.loot += 2;
          if (state._raidStats) state._raidStats.stolen += 2;
        } else r.state = "leave";
      }
      continue;
    }
    moveRaider(state, grid, r, cx, cz, dt);
  }
  if (state.raidActive && !state.raiders.length) resolveRaid(state);
}

export function step(state, grid, dt) {
  if (state.paused) return;
  state.elapsed += dt;
  // Chunk machinery, once per substep: drain one queued generation,
  // refresh the active set (freeze/catch-up), refresh the indexes.
  drainGenQueue(grid, 1);
  updateActiveChunks(state, grid);
  ensureIndexes(grid);
  updateWeather(state);
  if (state.elapsed >= state.expandAt) { state.expandAt = state.elapsed + 20; expandVillage(state, grid); }
  if (state.elapsed >= state.delegateAt) { state.delegateAt = state.elapsed + 15; delegateRoles(state, grid); }
  if (state.elapsed >= (state.marketAt || 30)) { state.marketAt = state.elapsed + 30; runMarket(state); }
  if (state.elapsed >= (state.treeAt || 60)) {
    state.treeAt = state.elapsed + 30;
    // Trees regrow in spring, rest in summer, and not at all in winter.
    const attempts = state.season === "winter" ? 0 : state.season === "spring" ? 6 : 3;
    for (let i = 0; i < attempts; i++) {
      // Two draws per attempt, exactly as the old code: blind
      // coordinates across the settled 48-block. Rolling across the
      // whole 320-grid would plant almost nothing (9/400 attempts
      // land on generated ground) and starve the woodcutters; new
      // territory already grows its hash-scattered trees.
      const x = Math.floor(state._rng() * OLD_SIZE), z = Math.floor(state._rng() * OLD_SIZE);
      const ch = grid.chunks.get(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
      if (!ch) continue;
      const c = ch.cells[x % CHUNK][z % CHUNK];
      if (!c.water && !c.blocked && !c.tree && !c.farm && !c.building && c.stone <= 0 && Math.hypot(x - state._cx, z - state._cz) > 8) { c.tree = true; c.blocked = true; noteMutation(grid, x, z); }
    }
  }
  state.time += dt / DAY_LENGTH;
  if (state.time >= 1) {
    state.time -= 1; state.day += 1;
    // The year turns: seasons change the village, and a new year is
    // worth a line in the log.
    const prevDay = state.day - 1;
    if (yearOf(state.day) !== yearOf(prevDay)) log(state, "Year " + yearOf(state.day) + " begins.");
    const newSeason = seasonOf(state.day);
    if (newSeason !== state.season) {
      state.season = newSeason;
      log(state, SEASON_NAMES[newSeason] + " arrives" + (newSeason === "winter" ? ". The cold bites; food keeps longer, but hunger grows." : newSeason === "summer" ? ". The heat is heavy; water and food needs rise." : "."));
    }
    // Dawn: surplus food spoils in the open air unless a granary holds
    // it. A granary doubles the kept surplus and lowers the birth
    // threshold. Winter cold preserves more; summer heat spoils more.
    const hasGranary = ownBuildings(state).some((b) => b.type === "granary");
    const keepCap = SEASON_KEEP[state.season] * (hasGranary ? 2 : 1);
    const birthNeed = hasGranary ? 10 : 14;
    const s = state.stockpile;
    let edible = s.food + s.fish + s.meat;
    state.spoiled = 0;
    if (edible > keepCap) {
      let over = edible - keepCap;
      state.spoiled = over;
      for (const k of ["food", "fish", "meat"]) { const take = Math.min(s[k], over); s[k] -= take; over -= take; if (!over) break; }
      if (!hasGranary && edible - keepCap >= 5) log(state, "Surplus food spoils in the open air. A granary would keep it.");
      edible = keepCap;
    }
    // Age-based births and deaths, then a shrine's dawn blessing.
    dawnDemographics(state, birthNeed);
    // Neighbor villages live their own dawn: abstract ticks,
    // envoy arrivals, first traders, season drift, deactivation.
    dawnVillages(state, grid);
    if (ownBuildings(state).some((b) => b.type === "shrine")) state.faith = clamp(state.faith + 3, 0, 100);
    // Calendar: a festival fires when the village can afford it.
    const fest = FESTIVALS[yearDayOf(state.day)];
    if (fest) {
      const edibleNow = s.food + s.fish + s.meat;
      if (edibleNow >= FESTIVAL_MIN_EDIBLE && state.faith >= FESTIVAL_MIN_FAITH) {
        let costLeft = FESTIVAL_COST_FOOD;
        for (const k of ["food", "fish", "meat"]) { const take = Math.min(s[k], costLeft); s[k] -= take; costLeft -= take; if (!costLeft) break; }
        state.celebration = { name: fest.name, until: state.elapsed + 0.25 * DAY_LENGTH };
        state.celebrationBoostUntil = state.elapsed + 3 * DAY_LENGTH;
        state.morale = clamp((state.morale ?? 60) + 10, 0, 100);
        state.faith = clamp(state.faith + 5, 0, 100);
        state.stats.celebrations = (state.stats.celebrations || 0) + 1;
        log(state, fest.name + "! The village gathers at the town center and feasts. Morale soars.");
      } else {
        log(state, fest.name + " passes quietly. The stores cannot spare a feast.");
      }
    }
    // Morale is felt at dawn, then acted on.
    recomputeMorale(state);
    if ((state.morale ?? 60) < 20) {
      state.lowMoraleDawns = (state.lowMoraleDawns || 0) + 1;
      if (state.lowMoraleDawns >= 3 && ownVillagers(state).length > 4 && state.elapsed - (state.lastLeaveAt || -Infinity) > 5 * DAY_LENGTH) {
        const leaver = [...ownVillagers(state)].sort((a, b) => (a.hunger + (100 - a.energy)) - (b.hunger + (100 - b.energy)))[0];
        removeVillager(state, leaver, "walks away, seeking a kinder village");
        state.lastLeaveAt = state.elapsed;
        state.lowMoraleDawns = 0;
      }
    } else state.lowMoraleDawns = 0;
    // Raiders: gated until the village is established, telegraphed a
    // dawn ahead, and never more than one raid per gap of days.
    if (!state.raidActive && !state.raiders.length) {
      if (state.raidPendingDay && state.day >= state.raidPendingDay) {
        state.raidPendingDay = 0;
        spawnRaid(state, grid);
      } else if (!state.raidPendingDay && state.day >= RAID_MIN_DAY
        && state.villagers.length >= RAID_MIN_POP
        && state.tech && state.tech.level >= RAID_MIN_TECH
        && state.day - (state.lastRaidDay || -1e9) >= RAID_GAP_DAYS
        && state._rng() < 0.14) {
        state.raidPendingDay = state.day + 1;
        log(state, "Scouts report raiders in the hills. They come at dawn.");
      }
    }
    // Deer top-up, as in world.lua. Winter herds are thinner.
    const deerCap = state.season === "winter" ? 2 : 4;
    while (state.deer.length < deerCap) state.deer.push(makeDeer(state, state._cx + 8, state._cz + 8));
    if (state.elapsed >= state.effects.droughtUntil && state.effects.droughtUntil > 0) log(state, "The drought breaks. Rain returns to the fields.");
    state.effects.droughtUntil = Math.min(state.effects.droughtUntil, state.elapsed);
    // Famine warnings, at dawn, before hunger deaths start: as
    // the stores fall the village hears it, and an empty store
    // means the next hungry villager finds nothing to eat.
    {
      const edibleNow = s.food + s.fish + s.meat;
      const mouths = ownVillagers(state).length;
      const droughtHolds = state.elapsed < state.effects.droughtUntil;
      if (edibleNow <= 0) log(state, "The stores stand empty. Hunger stalks the village." + (droughtHolds ? " The drought holds the fields still." : ""));
      else if (edibleNow < mouths) log(state, "Food runs low: " + edibleNow + " meals for " + mouths + " mouths." + (droughtHolds ? " The drought holds the fields still." : ""));
    }
  }

  // Crops grow. Plots within 5 cells of a farmhouse grow half again
  // as fast — the farmhouse anchors the district. Rain feeds the
  // fields; snow stops growth; the season sets the pace.
  if (state.elapsed >= state.effects.droughtUntil && state.weather.kind !== "snow") {
    const farmhouses = state.buildings.filter((b) => b.type === "farmhouse");
    const eraGrowth = (state.tech && state.tech.level >= 4 ? 1.25 : 1) * (state.tech && state.tech.level >= 5 ? 1.15 : 1);
    const growth = SEASON_GROWTH[state.season] * (state.weather.kind === "rain" ? 1.5 : 1) * eraGrowth;
    for (const [x, z] of state._farmCells) {
      const c = cellAt(grid, x, z);
      const nearHouse = farmhouses.some((f) => Math.hypot(x - f.x, z - f.z) <= 5);
      if (c.crop >= 0 && c.crop < 3) { c.cropGrow += dt * growth * (nearHouse ? 1.5 : 1); if (c.cropGrow > 28) { c.cropGrow = 0; c.crop++; } }
    }
  }
  // Storms tear at the crops: one plot loses a growth stage.
  if (state.weather && state.weather.kind === "storm" && state.elapsed >= (state.stormAt || 0)) {
    state.stormAt = state.elapsed + 10;
    const grown = state._farmCells.filter(([x, z]) => cellAt(grid, x, z).crop > 0);
    if (grown.length) {
      const [x, z] = grown[Math.floor(state._rng() * grown.length)];
      const c = cellAt(grid, x, z); c.crop--; c.cropGrow = 0;
      if (state._rng() < 0.25) log(state, "The storm batters the fields.");
    }
  }
  // Stone slowly weathers back, on a timer, so building never stalls
  // forever once the first clusters are mined out.
  if (state.elapsed >= (state.stoneAt || 30)) {
    state.stoneAt = state.elapsed + 30;
    ensureIndexes(grid);
    const spots = grid._stoneSpots || [];
    if (spots.length) {
      const [x, z] = spots[Math.floor(state._rng() * spots.length)];
      const c = cellAt(grid, x, z);
      if (c && c.stone < 10) { c.stone += 2; c.blocked = true; noteMutation(grid, x, z); }
    }
    // Ore weathers back slowly too, so a workshop stays reachable.
    if (state._oreSpots && state._oreSpots.length && state._rng() < 0.3) {
      const [ox, oz] = state._oreSpots[Math.floor(state._rng() * state._oreSpots.length)];
      const oc = cellAt(grid, ox, oz);
      if (oc && oc.ore < 6) { oc.ore++; oc.blocked = true; noteMutation(grid, ox, oz); }
    }
  }

  // Deer wander / flee.
  for (const d of state.deer) {
    const threat = state.villagers.find((v) => v.job === "hunter" && Math.hypot(v.x - d.x, v.z - d.z) < 6);
    d.fleeing = !!threat;
    if (state.elapsed > d.retargetAt) {
      d.retargetAt = state.elapsed + 2 + state._rng() * 4;
      if (threat) { d.tx = clamp(d.x + (d.x - threat.x) * 2, 1, SIZE - 2); d.tz = clamp(d.z + (d.z - threat.z) * 2, 1, SIZE - 2); }
      else { d.tx = clamp(d.x + (state._rng() - 0.5) * 8, 1, SIZE - 2); d.tz = clamp(d.z + (state._rng() - 0.5) * 8, 1, SIZE - 2); }
    }
    if (d.tx != null) {
      const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz);
      if (dist > 0.3) { const sp = (d.fleeing ? 1.9 : 0.8) * dt; d.x += (dx / dist) * sp; d.z += (dz / dist) * sp; }
    }
  }

  // Villagers.
  const hasWell = ownBuildings(state).some((b) => b.type === "well");
  const healer = ownBuildings(state).find((b) => b.type === "healer");
  const phase = phaseOf(state.time);
  const wkind = state.weather ? state.weather.kind : "clear";
  let plagueCleared = 0;
  for (const v of [...state.villagers]) {
    // Neighbor villagers keep their own hours and their own
    // hunger: they mill around home, flee danger, and never work
    // the player's economy or starve on its clock. They branch
    // before the shared vitals so the player's hunger, wells, and
    // healers never touch them.
    if ((v.village ?? 0) !== 0) { stepForeignVillager(state, grid, v, dt); continue; }
    // Hunger rises faster in winter cold and summer heat; water from a
    // well and rain both take the edge off. Snow and storms slow feet.
    let hungerRate = (v.ageDays ?? 25) < CHILD_DAYS ? 0.23 : hasWell ? 0.34 : 0.38;
    hungerRate += SEASON_HUNGER[state.season] || 0;
    if (wkind === "heat") hungerRate += 0.05;
    if (wkind === "rain") hungerRate -= 0.03;
    if (phase === "night" && v.state === "rest") hungerRate *= 0.4;
    v.hunger = clamp(v.hunger + dt * hungerRate, 0, 100);
    if (v.state === "rest") v.energy = clamp(v.energy + dt * (phase === "night" ? 10 : 6), 0, 100);
    else v.energy = clamp(v.energy - dt * 0.4, 0, 100);
    const nearHealer = healer && Math.hypot(v.x - (healer.x + 0.5), v.z - (healer.z + 0.5)) <= 8;
    if (v.sick) {
      v.hunger = clamp(v.hunger + dt * (nearHealer ? 0.2 : 0.4), 0, 100);
      // The sickness weakens but does not itself finish a healthy
      // villager: the dawn roll above is what kills. A healer
      // nearby still mends faster than the sickness drains.
      v.health = clamp(v.health - dt * (nearHealer ? 0.1 : 0.3) + (nearHealer ? dt * 1.5 : 0), 0, 100);
    }
    if (v.hunger >= 100) v.health = clamp(v.health - dt * 1.2, 0, 100);
    if (state.elapsed >= state.effects.plagueUntil && v.sick) { v.sick = false; plagueCleared++; }
    v.fear = clamp(v.fear - dt * 3, 0, 100);
    if (wkind === "storm") v.fear = clamp(v.fear + dt * 0.5, 0, 100);
    // A raider close by sends a villager running now, not at the
    // next rethink: villagers never seek combat unarmed.
    if (state.raiders.length && v.state !== "flee" && nearestRaider(state, v.x, v.z, 5)) {
      v.state = "flee"; v.rethinkAt = state.elapsed;
    }
    if (v.health <= 0) {
      removeVillager(state, v, "hunger and hardship");
      continue;
    }
    if (state.elapsed >= v.rethinkAt) { v.rethinkAt = state.elapsed + 4 + state._rng() * 3; think(state, grid, v); }
    // Hunter chase: retarget live every step.
    if (v.job === "hunter" && v.state === "work" && state.deer[0]) {
      const d = state.deer.reduce((a, b) => Math.hypot(a.x - v.x, a.z - v.z) < Math.hypot(b.x - v.x, b.z - v.z) ? a : b);
      v.target = [Math.round(d.x), Math.round(d.z)];
    }
    // Movement along the path, or direct chase for hunters.
    let moving = false;
    if (v.path && v.path.length) {
      const [px, pz] = v.path[0];
      const dx = px + 0.5 - v.x, dz = pz + 0.5 - v.z, dist = Math.hypot(dx, dz);
      if (dist < 0.25) v.path.shift();
      else { const onRoad = cellAt(grid, clamp(Math.round(v.x), 0, SIZE - 1), clamp(Math.round(v.z), 0, SIZE - 1)).road; const moveFactor = wkind === "snow" ? 0.85 : wkind === "storm" ? 0.9 : 1; const sp = (v.state === "flee" ? 3.4 : 2.2) * (onRoad ? 1.35 : 1) * moveFactor * dt; v.x += (dx / dist) * Math.min(sp, dist); v.z += (dz / dist) * Math.min(sp, dist); moving = true; }
    } else if (v.target) {
      const dx = v.target[0] + 0.5 - v.x, dz = v.target[1] + 0.5 - v.z, dist = Math.hypot(dx, dz);
      // Don't walk into a blocked target cell: stop at working distance.
      const stopAt = cellAt(grid, v.target[0], v.target[1]).blocked ? 1.0 : 0.4;
      if (dist > stopAt) {
        const cell = cellAt(grid, clamp(Math.round(v.x), 0, SIZE - 1), clamp(Math.round(v.z), 0, SIZE - 1));
        void cell;
        const moveFactor = wkind === "snow" ? 0.85 : wkind === "storm" ? 0.9 : 1;
        const sp = (v.job === "hunter" && v.state === "work" ? 3.0 : 2.2) * moveFactor * dt; v.x += (dx / dist) * Math.min(sp, dist - stopAt + 0.05); v.z += (dz / dist) * Math.min(sp, dist - stopAt + 0.05); moving = true;
      }
    }
    v._moving = moving;
    // Arrived?
    if (v.target && Math.hypot(v.target[0] + 0.5 - v.x, v.target[1] + 0.5 - v.z) < 1.1 && !(v.path && v.path.length)) {
      if (v.state === "eat") {
        // Eat personal goods first, then buy from the stockpile with
        // coins; a villager with no coins still gets a communal ration.
        // Most-abundant kind first, so a fish surplus gets eaten
        // instead of sitting in storage while food spoils away at dawn.
        const s = state.stockpile;
        const mostAbundant = (store) => [["food", store.food || 0], ["fish", store.fish || 0], ["meat", store.meat || 0]]
          .sort((a, b) => b[1] - a[1]).find(([, n]) => n > 0);
        const personal = mostAbundant(v.goods);
        const pile = mostAbundant(s);
        const eatKind = personal ? personal[0] : pile ? pile[0] : null;
        let ate = false;
        if (eatKind) {
          if (v.goods[eatKind] > 0) v.goods[eatKind]--;
          else {
            s[eatKind]--;
            if (v.coins >= PRICES[eatKind]) { v.coins -= PRICES[eatKind]; state.fund += PRICES[eatKind]; }
          }
          ate = true;
        } else if (v.target && cellAt(grid, v.target[0], v.target[1]).farm && cellAt(grid, v.target[0], v.target[1]).crop === 3) { cellAt(grid, v.target[0], v.target[1]).crop = 0; ate = true; }
        // No food anywhere means no meal: hunger stands, the
        // villager tries again at the next rethink, and starvation
        // takes its course through the hunger/health drain. An
        // empty store used to feed everyone anyway.
        if (ate) v.hunger = clamp(v.hunger - 45, 0, 100);
        v.state = "idle"; v.target = null; v.rethinkAt = state.elapsed + 1;
      } else if (v.state === "haul") {
        if (v.carry) {
          // Deposit split: most goes to the communal stockpile, one
          // unit is kept as personal goods to trade at the market.
          const amt = v.carry.amt, type = v.carry.type;
          const keep = amt >= 2 ? 1 : 0;
          state.stockpile[type] = (state.stockpile[type] || 0) + (amt - keep);
          if (keep) v.goods[type] = Math.min(6, (v.goods[type] || 0) + keep);
          v.carry = null;
        }
        v.state = "idle"; v.target = null; v.rethinkAt = state.elapsed + 0.5;
      } else if (v.state === "work") {
        doWork(state, grid, v, dt * 3); // work ticks faster once in place
      } else if (v.state === "rest") {
        v.energy = clamp(v.energy + dt * 4, 0, 100);
        // At night, rest holds until dawn even at full energy.
        if (v.energy > 80 && !v.sick && phaseOf(state.time) !== "night") { v.state = "idle"; v.target = null; }
      } else if (v.state === "flee") {
        v.fear = clamp(v.fear - dt * 8, 0, 100);
        if (v.fear < 20) { v.state = "idle"; v.target = null; }
      }
    }
    // Stuck detection: if a path keeps failing, rethink sooner.
    if (Math.hypot(v.x - v.lastX, v.z - v.lastZ) < 0.01 && moving === false && v.target) v.stuckAt += dt; else v.stuckAt = 0;
    v.lastX = v.x; v.lastZ = v.z;
    if (v.stuckAt > 6) { v.rethinkAt = state.elapsed; v.stuckAt = 0; }
  }
  if (plagueCleared > 0) log(state, "The sickness passes. The village breathes again.");
  // Raiders move, fight, steal, and leave on their own schedule.
  stepRaiders(state, grid, dt);
  // Caravans walk after raiders move, so a held-up caravan reacts
  // to the raiders' current positions, not last tick's.
  stepCaravans(state, grid, dt);
}

// --- diplomacy intents: the validation every leader decision ---
// passes through. Village leaders decide; the god proposes and
// sends envoys. In Phase F the only live intents are trade offers
// and envoys: relation moves (alliances, war) are validated as
// rejected, honestly, until their phases land. A war declaration
// is rejected through every path, including this one.
export function validateDiplomacyIntent(state, intent) {
  if (!intent || typeof intent.kind !== "string") return { ok: false, reason: "An intent needs a kind." };
  if (intent.kind === "declare_war") {
    return { ok: false, reason: "The god cannot declare war, and no leader intent declares war in this phase." };
  }
  if (intent.kind === "relation_move") {
    // Alliance moves validate; they do not execute here. A
    // proposal is weighed by the player's leader and answered by
    // the neighbor's at dawn; ending one is a leader's decision
    // with its longer cooldown. War moves stay refused: war is
    // a later phase, and the god never declares it.
    const rec = villageRecord(state, intent.to);
    if (!rec || !rec.known) return { ok: false, reason: "Relations move only with villages you have met." };
    if (intent.move === "propose_alliance") {
      if (allied(state, 0, intent.to)) return { ok: false, reason: "The villages are already allies." };
      if (getRelation(state, 0, intent.to) < ALLIANCE_MIN_RELATION) return { ok: false, reason: "Relations are too cold for an alliance (need " + ALLIANCE_MIN_RELATION + ")." };
      if (!allianceCooldownOk(state, 0, intent.to)) return { ok: false, reason: "A recent break must cool first." };
      if (rec.allyOffer) return { ok: false, reason: "A proposal is already before them." };
      return { ok: true };
    }
    if (intent.move === "accept_alliance") {
      if (!rec.allyOffer || rec.allyOffer.from !== intent.from) return { ok: false, reason: "No proposal from that village is waiting." };
      if (state.day - rec.allyOffer.day > ALLIANCE_OFFER_DAWNS) return { ok: false, reason: "The proposal has lapsed." };
      if (getRelation(state, 0, intent.to) < ALLIANCE_MIN_RELATION) return { ok: false, reason: "Relations are too cold for an alliance." };
      if (!allianceCooldownOk(state, 0, intent.to)) return { ok: false, reason: "A recent break must cool first." };
      return { ok: true };
    }
    if (intent.move === "end_alliance") {
      if (!allied(state, 0, intent.to)) return { ok: false, reason: "The villages are not allies." };
      return { ok: true };
    }
    return { ok: false, reason: "Unknown relation move: " + intent.move + ". Moves are propose_alliance, accept_alliance, end_alliance." };
  }
  if (intent.kind === "envoy") {
    const rec = villageRecord(state, intent.to);
    if (!rec) return { ok: false, reason: "No such village." };
    if ((state.pendingEnvoys || []).some((e) => e.to === intent.to)) return { ok: false, reason: "An envoy is already on the road." };
    return { ok: true };
  }
  if (intent.kind === "trade_offer") {
    const rec = villageRecord(state, intent.to);
    if (!rec || !rec.known) return { ok: false, reason: "Trade offers go to villages you have met." };
    if (getRelation(state, 0, intent.to) < 0) return { ok: false, reason: "Relations are too cold for trade." };
    if ((state.caravans || []).some((c) => pairKey(c.from, c.to) === pairKey(0, intent.to))) {
      return { ok: false, reason: "A caravan is already traveling between those villages." };
    }
    const cap = caravanCapacity(state, 0, intent.to);
    if (!intent.give || !intent.want || !PRICES[intent.give.good] || !PRICES[intent.want.good]) {
      return { ok: false, reason: "Name the goods to give and to ask for." };
    }
    if (intent.give.qty < 1 || intent.want.qty < 1 || intent.give.qty > cap || intent.want.qty > cap) {
      return { ok: false, reason: "The load is outside the caravan's capacity (" + cap + ")." };
    }
    const key = pairKey(0, intent.to) + ":" + seasonKey(state);
    if ((state.tradeSeasons || {})[key]) return { ok: false, reason: "Those villages have already traded this season." };
    return { ok: true };
  }
  return { ok: false, reason: "Unknown diplomacy intent: " + intent.kind + "." };
}

// --- god actions: nudges and catastrophes. Never direct control. ---

export function godCooldown(state, action) {
  const until = state.cooldowns[action] || 0;
  return Math.max(0, until - state.elapsed);
}

export function applyGod(state, grid, action, x = null, z = null, opts = {}) {
  const cd = godCooldown(state, action);
  if (cd > 0) return { ok: false, reason: "Wait " + Math.ceil(cd) + "s." };
  const setCd = (s) => { state.cooldowns[action] = state.elapsed + s; };
  switch (action) {
    case "bless":
      state.stockpile.food += 10; state.faith = clamp(state.faith + 5, 0, 100); state.morale = clamp((state.morale ?? 60) + 2, 0, 100); state.stats.blessings++;
      log(state, "A blessing falls. +10 food, the people take heart."); setCd(20); break;
    case "drought":
      state.effects.droughtUntil = state.elapsed + 60;
      log(state, "Drought. The crops stop growing for a time."); setCd(45); break;
    case "flood": {
      // Low ground floods: villagers standing on flooded cells can
      // drown (capped), the rest are swept and wounded; flooded
      // crops are ruined and flooded buildings battered.
      state.effects.floodUntil = state.elapsed + 30;
      for (const v of ownVillagers(state)) v.fear = clamp(v.fear + 45, 0, 100);
      const cx = state._cx, cz = state._cz;
      const cap = disasterKillCap(state);
      const inZone = ownVillagers(state).filter((v) => Math.hypot(v.x - (cx + 0.5), v.z - (cz + 0.5)) < DISASTER_FLOOD_RADIUS);
      const flooded = inZone.filter((v) => {
        const c = peekCell(grid, Math.floor(v.x), Math.floor(v.z));
        return c && c.h < DISASTER_FLOOD_LOW_H;
      });
      const drowned = disasterKill(state, flooded, "drowned in the flood", cap);
      const drownedSet = new Set(drowned);
      for (const v of inZone) {
        if (drownedSet.has(v)) continue;
        v.health = Math.max(1, v.health - 20);
        v.fear = 80;
      }
      let cropsLost = 0;
      forEachGeneratedCell(grid, (x, z, c) => {
        if (!c.farm || c.crop <= 0) return;
        if (Math.hypot(x - cx, z - cz) >= DISASTER_FLOOD_RADIUS || c.h >= DISASTER_FLOOD_LOW_H) return;
        c.crop = 0; c.cropGrow = 0; cropsLost++; noteMutation(grid, x, z);
      });
      const wetBuildings = ownBuildings(state).filter((b) => {
        const c = peekCell(grid, b.x, b.z);
        return c && c.h < DISASTER_FLOOD_LOW_H && Math.hypot(b.x - cx, b.z - cz) < DISASTER_FLOOD_RADIUS;
      }).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
      const dmg = damageBuildings(state, grid, wetBuildings, DISASTER_FLOOD_DAMAGE, 99, "is washed away");
      log(state, "Flood waters rise. The villagers flee to high ground."
        + (drowned.length ? " " + drowned.length + " drown." : "")
        + (cropsLost ? " " + cropsLost + " crops are ruined." : "")
        + (dmg.damaged ? " " + dmg.damaged + " buildings battered." : ""));
      setCd(45); break;
    }
    case "fire": {
      if (x == null) return { ok: false, reason: "Tap the ground to place the fire." };
      const cap = disasterKillCap(state);
      const inRadius = ownVillagers(state).filter((v) => Math.hypot(v.x - x, v.z - z) < DISASTER_FIRE_RADIUS);
      const burned = disasterKill(state, inRadius, "burned in the fire", cap);
      const burnedSet = new Set(burned);
      for (const v of inRadius) {
        if (burnedSet.has(v)) continue;
        v.fear = 80; v.health = Math.max(1, v.health - 25);
      }
      const inFlames = ownBuildings(state).filter((b) => Math.hypot(b.x - x, b.z - z) < DISASTER_FIRE_RADIUS)
        .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      const dmg = damageBuildings(state, grid, inFlames, DISASTER_FIRE_DAMAGE, DISASTER_FIRE_MAX_BURNED, "burns down");
      state._fire = { x, z, until: state.elapsed + 12 };
      log(state, "Fire falls from the sky."
        + (burned.length ? " " + burned.length + " caught in the flames." : "")
        + (dmg.destroyed ? " " + dmg.destroyed + " structures burn." : ""));
      setCd(30); break;
    }
    case "plague":
      // A full day's wave, so it always spans a dawn: the sick
      // face the dawn death roll (budget-capped), not only the
      // already weak. The budget is set here, at cast.
      state.effects.plagueUntil = state.elapsed + DISASTER_PLAGUE_DAYS * DAY_LENGTH;
      state.effects.plagueBudget = disasterKillCap(state);
      for (const v of ownVillagers(state)) if (state._rng() < DISASTER_PLAGUE_SICK_CHANCE) v.sick = true;
      state.faith = clamp(state.faith - 8, 0, 100);
      state.stats.plagues = (state.stats.plagues || 0) + 1;
      log(state, "Plague spreads through the village."); setCd(60); break;
    case "quake": {
      if (x == null) return { ok: false, reason: "Tap the ground for the quake's center." };
      state._quake = { x, z, until: state.elapsed + 2 };
      const cap = disasterKillCap(state);
      const inRadius = ownVillagers(state).filter((v) => Math.hypot(v.x - x, v.z - z) < DISASTER_QUAKE_RADIUS);
      const crushed = disasterKill(state, inRadius, "crushed in the quake", cap);
      const crushedSet = new Set(crushed);
      for (const v of inRadius) {
        if (crushedSet.has(v)) continue;
        v.fear = clamp(v.fear + 55, 0, 100);
        v.health = Math.max(1, v.health - 30);
      }
      const shaken = ownBuildings(state).filter((b) => Math.hypot(b.x - x, b.z - z) < DISASTER_QUAKE_RADIUS)
        .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      const dmg = damageBuildings(state, grid, shaken, DISASTER_QUAKE_DAMAGE, DISASTER_QUAKE_MAX_COLLAPSED, "collapses");
      state.faith = clamp(state.faith - 4, 0, 100);
      log(state, "The earth shakes."
        + (crushed.length ? " " + crushed.length + " crushed." : "")
        + (dmg.destroyed ? " " + dmg.destroyed + " structures collapse." : ""));
      setCd(40); break;
    }
    case "hut": {
      const spot = findHutSpot(state, grid);
      if (!spot) return { ok: false, reason: "No clear ground near the village for a hut." };
      if (state.buildQueue.some((q) => q.x === spot[0] && q.z === spot[1])) return { ok: false, reason: "Builders are already raising a hut there." };
      if (state.stockpile.wood < 12 || state.stockpile.stone < 6) return { ok: false, reason: "Need 12 wood and 6 stone in the stockpile first." };
      state.buildQueue.push({ type: "hut", x: spot[0], z: spot[1], progress: 0, needWood: 12, needStone: 6, needOre: 0 });
      log(state, "You order a hut. A builder will take it up, if they choose."); setCd(10); break;
    }
    case "villager":
      if (state.villagers.length >= state.populationCap) return { ok: false, reason: "The village is full. Builders raise a hut on their own once they have wood and stone." };
      if (state.faith < 20) return { ok: false, reason: "Faith too low. The people will not follow a stranger in." };
      state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1));
      assignHomes(state);
      state.faith = clamp(state.faith - 10, 0, 100);
      log(state, "A wanderer joins the village."); setCd(30); break;
    case "directive": {
      // The focus nudge is one field of the directive, not the
      // whole of it: pending trade and alliance suggestions
      // survive a directive change, and lifting the nudge keeps
      // them too.
      if (!state.directive) state.directive = {};
      if (opts.focusJob) state.directive.focusJob = opts.focusJob;
      else delete state.directive.focusJob;
      if (!state.directive.focusJob && !state.directive.suggestTrade && !state.directive.suggestAlliance) state.directive = null;
      log(state, opts.focusJob ? "Whispered through the leader: focus on " + opts.focusJob + ". Some may disobey." : "The directive is lifted.");
      break;
    }
    case "muster": {
      const n = musterGuards(state, grid);
      log(state, n ? "The muster sounds. Guards to their posts." : "The muster sounds, but no guards are posted.");
      setCd(30); break;
    }
    case "envoy": {
      // An envoy walks to the nearest village the god has not met,
      // or the coldest known one. It arrives at the next dawn.
      const recs = state.villages || [];
      if (!recs.length) return { ok: false, reason: "No other villages are known to exist." };
      const unknown = recs.filter((r) => !r.known);
      let target = null;
      if (unknown.length) {
        target = unknown.reduce((a, b) => Math.hypot(a.center[0] - state._cx, a.center[1] - state._cz) < Math.hypot(b.center[0] - state._cx, b.center[1] - state._cz) ? a : b);
      } else {
        target = [...recs].sort((a, b) => getRelation(state, 0, a.id) - getRelation(state, 0, b.id))[0];
      }
      if (!state.pendingEnvoys) state.pendingEnvoys = [];
      if (state.pendingEnvoys.some((e) => e.to === target.id)) return { ok: false, reason: "An envoy is already on the road to " + target.name + "." };
      state.pendingEnvoys.push({ to: target.id, sentDay: state.day });
      touchVillage(state, grid, target);
      log(state, "An envoy sets out for " + target.name + ".");
      setCd(ENVOY_COOLDOWN_DAYS * DAY_LENGTH); break;
    }
    case "suggest_trade": {
      // The god proposes; the leader decides at the next delegation.
      // Validation here only checks the proposal is well-formed and
      // the village is known. The leader weighs surplus, deficit,
      // relations, and the season limit before any caravan moves.
      const to = opts.to, give = opts.give, want = opts.want;
      const rec = villageRecord(state, to);
      if (!rec || !rec.known) return { ok: false, reason: "Suggest trade to a village you have met." };
      if (!give || !want || !PRICES[give.good] || !PRICES[want.good]) return { ok: false, reason: "Name the goods to give and to ask for." };
      const cap = caravanCapacity(state, 0, to);
      if (give.qty < 1 || want.qty < 1 || give.qty > cap || want.qty > cap) {
        return { ok: false, reason: "The load must fit the caravan's capacity (" + cap + ")." };
      }
      if (!state.directive) state.directive = {};
      state.directive.suggestTrade = { to, give: { good: give.good, qty: Math.floor(give.qty) }, want: { good: want.good, qty: Math.floor(want.qty) } };
      log(state, "You suggest trading " + give.qty + " " + give.good + " for " + want.qty + " " + want.good + " with " + rec.name + ". The leader will weigh it.");
      setCd(10); break;
    }
    case "suggest_alliance": {
      // The god proposes; both leaders decide. Validation here
      // only checks the proposal is well-formed and the village is
      // known. The player's leader weighs it at the next
      // delegation, and the neighbor's leader answers at dawn.
      const rec = villageRecord(state, opts.to);
      if (!rec || !rec.known) return { ok: false, reason: "Suggest an alliance to a village you have met." };
      if (allied(state, 0, rec.id)) return { ok: false, reason: "The villages are already allies." };
      if (!state.directive) state.directive = {};
      state.directive.suggestAlliance = { to: rec.id };
      log(state, "You suggest an alliance with " + rec.name + ". The leaders will weigh it.");
      setCd(10); break;
    }
    case "declare_war":
      // There is no path for the god to declare war: war is a
      // leaders' decision, in a later phase. This case exists so the
      // refusal is explicit and testable, not a silent unknown.
      return { ok: false, reason: "The god cannot declare war. War is for village leaders, in a later phase." };
    case "visit": {
      // Walking there: the camera dwelling near a village stirs it
      // and discovers it. Idempotent: a village already known and
      // active simply has its trigger refreshed.
      if (x == null || z == null) return { ok: false, reason: "Visit needs a place." };
      const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
      const rec = (state.villages || []).find((r) => Math.max(Math.abs(Math.floor(r.center[0] / CHUNK) - ccx), Math.abs(Math.floor(r.center[1] / CHUNK) - ccz)) <= 3);
      if (!rec) return { ok: false, reason: "No village near here." };
      touchVillage(state, grid, rec);
      discoverVillage(state, rec, "you walk the land");
      return { ok: true };
    }
    case "whisper":
      if (opts.text) log(state, "Whisper: \"" + String(opts.text).slice(0, 200) + "\"");
      break;
    default:
      return { ok: false, reason: "Unknown god action." };
  }
  return { ok: true };
}

function findHutSpot(state, grid) {
  return findLotSpot(state, grid, "hut");
}

export function leader(state) {
  const own = ownVillagers(state);
  return own.find((v) => v.leader) || own[0] || null;
}

// --- save / load: only plain data, grid is rebuilt from the seed ---

export function serialize(state, grid) {
  ensureIndexes(grid);
  const crops = [], stones = [], buildings = [], roads = [];
  // Only generated chunks contribute: ungenerated land is the seed's
  // business, and costs zero save bytes.
  forEachGeneratedCell(grid, (x, z, c) => {
    if (c.crop >= 0) crops.push([x, z, c.crop, c.cropGrow]);
    if (c.stone > 0 || c.ore > 0) stones.push([x, z, c.stone, c.ore, c.blocked ? 1 : 0]);
    if (c.building) buildings.push([x, z, c.building]);
    if (c.road) roads.push([x, z]);
  });
  const chunks = [...grid.chunks.keys()].map((k) => k.split(",").map(Number));
  const { _rng, _vrng, _farmCells, _oreSpots, _fire, _quake, raiders, _raidStats, ...rest } = state;
  void _rng; void _vrng; void _farmCells; void _oreSpots; void raiders; void _raidStats;
  // The save version is stamped here, not trusted to state, so every
  // file on disk carries the version its writer used.
  return JSON.stringify({ ...rest, version: SAVE_VERSION, crops, stones, buildings, roads, chunks, fire: _fire || null, quake: _quake || null });
}

export function deserialize(json) {
  const data = JSON.parse(json);
  const fromVersion = data.version == null ? 1 : data.version;
  const { state, grid } = newWorld(data.seed);
  // Overlay saved dynamic state, keeping the regenerated grid's statics.
  const savedCrops = data.crops, savedStones = data.stones, savedBuildings = data.buildings;
  const savedFire = data.fire, savedQuake = data.quake, savedRoads = data.roads || [];
  const savedChunks = data.chunks || null;
  delete data.crops; delete data.stones; delete data.buildings; delete data.fire; delete data.quake; delete data.roads; delete data.chunks;
  Object.assign(state, data);
  // Migrations for saves made before a feature existed: a missing
  // delegateAt would stall delegation forever, and villagers saved
  // before the woodcutter job have no skill for it (NaN scores).
  if (state.delegateAt == null) state.delegateAt = 5;
  if (state.expandAt == null) state.expandAt = 10;
  if (state.fund == null) state.fund = 20;
  if (state.marketAt == null) state.marketAt = 30;
  if (!state.rateHistory) state.rateHistory = [];
  if (state.stats && state.stats.trades == null) state.stats.trades = 0;
  if (state.stats && state.stats.celebrations == null) state.stats.celebrations = 0;
  if (state.spoiled == null) state.spoiled = 0;
  // MIGRATION PATTERN. Read this before v13. Updates must never
  // restart the world: serialize() stamps SAVE_VERSION, and
  // deserialize() migrates older saves forward in place, one step
  // per release, oldest first. Every new field gets a sensible
  // default in its step. Existing state (seed, elapsed, day,
  // villagers with goods/coins/homes, buildings, stockpile, roads,
  // farms, faith, cooldowns, log) is never dropped or reset. Never
  // add a new save key, never wipe or ignore an old save: migrate it.
  // v11 (fromVersion < 3): seasons, weather, morale, celebrations,
  // schools/tech arrive. A v10 world keeps its day count, and the
  // season is derived from it.
  if (fromVersion < 3) {
    state.season = seasonOf(state.day);
    state.weather = { kind: "clear", until: state.elapsed + 60 };
    state.morale = 55;
    state.moraleReasons = [];
    state.celebration = null;
    state.celebrationBoostUntil = -1;
    state.tech = { level: 0, progress: 0 };
    state.lowMoraleDawns = 0;
    state.lastLeaveAt = -1e9;
    state.stormAt = -1e9;
  }
  // v12 (fromVersion < 4): raids, walls, eras, plague counts. Raiders
  // never persist: a save taken mid-raid loads with an empty field,
  // and the raid is logged as scattered below.
  if (fromVersion < 4) {
    if (state.stats && state.stats.plagues == null) state.stats.plagues = 0;
    if (state.nextRaiderId == null) state.nextRaiderId = 1;
    if (state.raidActive == null) state.raidActive = false;
    if (state.raidPendingDay == null) state.raidPendingDay = 0;
    if (state.lastRaidDay == null) state.lastRaidDay = -1e9;
    if (state.raidUntil == null) state.raidUntil = -1;
  }
  // v13 (fromVersion < 5): the chunked world, guards, neighbor
  // villages. This build takes SAVE_VERSION 5; the leader design's
  // own 4-to-5 step lands later and takes 6. Sites and records are
  // deterministic from the seed, so a v4 save gains the same
  // neighbors newWorld would have picked; a v5 save keeps its own.
  // SAVE_VERSION coordination decision (build log, Nov 3, 2026).
  if (fromVersion < 5) {
    if (!state.villageSites || !state.villageSites.length) {
      state.villageSites = pickVillageSites(data.seed, 2);
    }
    if (!state.villages || !state.villages.length) {
      state.villages = state.villageSites.map((s, i) => makeVillageRecord(data.seed, i + 1, s, state.villageSites.map((_, j) => j + 1).filter((id) => id !== i + 1)));
    }
    if (!state.caravans) state.caravans = [];
    if (!state.warParties) state.warParties = [];
    if (state.nextCaravanId == null) state.nextCaravanId = 1;
    if (state.nextWarPartyId == null) state.nextWarPartyId = 1;
  }
  // Phase F record fields: backfilled on every load, so a save
  // written by an earlier v5 build gains them without a bump.
  for (const rec of state.villages || []) {
    if (rec.traderDay == null) rec.traderDay = 2 + Math.floor(hash01(data.seed, rec.id, 7, 504) * 8);
    if (rec.traderSent == null) rec.traderSent = false;
    if (rec.lastEvent === undefined) rec.lastEvent = null;
    if (rec.tradeSeason == null) rec.tradeSeason = -1;
    if (rec.contactSeason == null) rec.contactSeason = -1;
    if (rec.activeDay == null) rec.activeDay = 0;
    if (rec.lastTriggerDay == null) rec.lastTriggerDay = 0;
    if (!Array.isArray(rec.allies)) rec.allies = [];
    if (rec.allyOffer === undefined) rec.allyOffer = null;
    if (rec.allyCooldownDay == null) rec.allyCooldownDay = 0;
  }
  if (!state.pendingEnvoys) state.pendingEnvoys = [];
  if (!state.tradeSeasons) state.tradeSeasons = {};
  if (state._villageSeasonKey == null) state._villageSeasonKey = -1;
  grid._villageSites = state.villageSites || [];
  // Regenerate every chunk the save had generated, so chunks with no
  // deltas still count as generated (render + save round-trips).
  if (savedChunks) for (const [cx, cz] of savedChunks) getChunk(grid, cx, cz);
  if (state.raidActive) log(state, "The raid scatters as the world is remade.");
  state.raidActive = false;
  state.raiders = [];
  state._raidStats = null;
  state.version = SAVE_VERSION;
  for (const v of state.villagers) {
    for (const j of JOBS) if (v.skills[j] == null) v.skills[j] = 1;
    if (v.assignedJob == null) v.assignedJob = null;
    if (v.delegated == null) v.delegated = false;
    if (v.ageDays == null) v.ageDays = 25;
    if (!v.sex) v.sex = v.id % 2 ? "F" : "M";
    if (v.coins == null) v.coins = 5;
    if (!v.goods) { v.goods = {}; for (const g of Object.keys(PRICES)) v.goods[g] = 0; }
    for (const g of Object.keys(PRICES)) if (v.goods[g] == null) v.goods[g] = 0;
    if (v.toolTick == null) v.toolTick = 0;
    if (v.village == null) v.village = 0;
    // v11 fields: a migrated villager starts unschooled, with crude tools.
    if (v.education == null) v.education = 0;
    if (v.tool == null) v.tool = 0;
    if (!("home" in v)) v.home = null;
  }
  for (const b of state.buildings) { if (b.builtDay == null) b.builtDay = 1; if (b.village == null) b.village = 0; }
  assignHomes(state);
  state._rng = mulberry32((data.seed ^ 0x9e3779b9) + Math.floor(state.elapsed * 1000));
  state._vrng = mulberry32((data.seed ^ 0x5f3759df) + Math.floor(state.elapsed * 1000));
  for (const [x, z, crop, grow] of savedCrops) { cellAt(grid, x, z).farm = true; cellAt(grid, x, z).crop = crop; cellAt(grid, x, z).cropGrow = grow; }
  for (const [x, z] of savedRoads) cellAt(grid, x, z).road = true;
  // Rebuild the farm list from the grid so farms cleared by expansion
  // before the save keep growing after load.
  state._farmCells = [];
  forEachGeneratedCell(grid, (x, z, c) => { if (c.farm) state._farmCells.push([x, z]); });
  for (const [x, z, stone, ore, blocked] of savedStones) { cellAt(grid, x, z).stone = stone; cellAt(grid, x, z).ore = ore; cellAt(grid, x, z).blocked = !!blocked; }
  for (const [x, z, type] of savedBuildings) cellAt(grid, x, z).building = type;
  // Rebuild the building list from the grid. serialize() stores
  // buildings as grid triples and deletes the object list before the
  // overlay, so a load that trusted the fresh founding list dropped
  // every building raised after founding (granaries, markers, later
  // huts) from state on every load. The grid is the truth: restore
  // all of it, then reassign homes to the full village.
  {
    const seen = new Set(state.buildings.map((b) => b.x + "," + b.z));
    forEachGeneratedCell(grid, (x, z, c) => {
      const t = c.building;
      if (t && !seen.has(x + "," + z)) {
        state.buildings.push({ type: t, x, z, done: true, builtDay: 1, village: 0 });
        seen.add(x + "," + z);
      }
    });
  }
  assignHomes(state);
  // Older saves were founded without a plaza: lay it once so the
  // old village gains the same visible square and farm road.
  let roadCount = 0;
  forEachGeneratedCell(grid, (x, z, c) => { if (c.road) roadCount++; });
  if (roadCount < 10) pavePlaza(grid, state._cx, state._cz);
  state._fire = savedFire || null; state._quake = savedQuake || null;
  return { state, grid };
}
