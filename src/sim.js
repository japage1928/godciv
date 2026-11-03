// GodCiv sim: owns the truth. No DOM, no Three.js in here, so it can be
// tested headlessly with node. Ported from the Luanti mod in
// ~/workspace/godciv/mods/godciv/ — same rules: utility brain runs every
// villager, the god never directly controls a villager, a local model only
// ever advises the leader. The model never writes state directly.

// Save format version. v10 wrote version 2; v11 writes 3; v12 writes 4.
// See migrateSave in deserialize() for the migration pattern.
export const SAVE_VERSION = 4;
export const SIZE = 48;
export const DAY_LENGTH = 180; // sim seconds per day: 45 real seconds at 4x, 22.5 at 8x
export const JOBS = ["farmer", "woodcutter", "miner", "fisher", "hunter", "builder", "hauler", "teacher"];
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
  const school = state.buildings.some((b) => b.type === "school");
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

// Breadth-first pathfinding on the walkable grid. Cheap at 48x48, and it
// means villagers walk around water and buildings instead of steering
// blindly through them (the Luanti v1 steer-to-target weakness).
export function findPath(grid, sx, sz, tx, tz, maxSteps = 4000, avoidFarm = false) {
  if (!inBounds(tx, tz)) return null;
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
      if (grid[nx][nz].blocked && !isTarget) continue;
      if (avoidFarm && grid[nx][nz].farm && !isTarget) continue;
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
  const rng = mulberry32(seed);
  const grid = [];
  // Smooth value-noise heightfield.
  const coarse = [];
  for (let i = 0; i < 9; i++) { coarse.push([]); for (let j = 0; j < 9; j++) coarse[i].push(rng()); }
  const noiseAt = (x, z) => {
    const gx = (x / SIZE) * 8, gz = (z / SIZE) * 8;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const fx = gx - x0, fz = gz - z0;
    const s = (t) => t * t * (3 - 2 * t);
    const a = coarse[x0][z0], b = coarse[Math.min(8, x0 + 1)][z0];
    const c = coarse[x0][Math.min(8, z0 + 1)], d = coarse[Math.min(8, x0 + 1)][Math.min(8, z0 + 1)];
    return a + (b - a) * s(fx) + (c - a) * s(fz) + (a - b - c + d) * s(fx) * s(fz);
  };
  const cx = 24, cz = 24;
  const lake = { x: 36, z: 36, r: 6.5 };
  for (let x = 0; x < SIZE; x++) {
    grid.push([]);
    for (let z = 0; z < SIZE; z++) {
      const h = noiseAt(x, z);
      const dLake = Math.hypot(x - lake.x, z - lake.z);
      const dCenter = Math.hypot(x - cx, z - cz);
      const water = dLake < lake.r && h < 0.62;
      grid[x].push({
        h, water, blocked: water, road: false,
        tree: false, stone: 0, ore: 0, crop: -1, cropGrow: 0,
        building: null, farm: false,
      });
    }
  }
  // Village clearing.
  for (let x = cx - 6; x <= cx + 6; x++) for (let z = cz - 6; z <= cz + 6; z++) {
    if (!inBounds(x, z)) continue;
    grid[x][z].water = false; grid[x][z].blocked = false; grid[x][z].tree = false; grid[x][z].stone = 0;
  }
  // Farm plots: two 3x3 beds west of the stockpile.
  const farmCells = [];
  for (let x = cx - 6; x <= cx - 4; x++) for (let z = cz - 1; z <= cz + 1; z++) { grid[x][z].farm = true; grid[x][z].crop = 0; grid[x][z].cropGrow = rng() * 20; farmCells.push([x, z]); }
  for (let x = cx - 6; x <= cx - 4; x++) for (let z = cz + 3; z <= cz + 5; z++) { grid[x][z].farm = true; grid[x][z].crop = 0; grid[x][z].cropGrow = rng() * 20; farmCells.push([x, z]); }
  // Trees, away from the clearing and the lake shore.
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rng() * SIZE), z = Math.floor(rng() * SIZE);
    if (grid[x][z].water || Math.hypot(x - cx, z - cz) < 8 || grid[x][z].farm) continue;
    grid[x][z].tree = true; grid[x][z].blocked = true;
  }
  // Stone / ore clusters on high ground.
  const stoneSpots = [];
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(rng() * SIZE), z = Math.floor(rng() * SIZE);
    if (grid[x][z].water || Math.hypot(x - cx, z - cz) < 7 || grid[x][z].tree || grid[x][z].farm) continue;
    grid[x][z].stone = 8 + Math.floor(rng() * 5);
    grid[x][z].ore = grid[x][z].h > 0.55 && rng() < 0.6 ? 4 + Math.floor(rng() * 3) : 0;
    grid[x][z].blocked = true;
    stoneSpots.push([x, z]);
  }

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
  };
  for (const b of state.buildings) grid[b.x][b.z].building = b.type;
  state.rngState = null; // runtime only, rebuilt on load
  state._rng = rng;
  state._farmCells = farmCells;
  state._stoneSpots = stoneSpots;
  state._oreSpots = stoneSpots.filter(([x, z]) => grid[x][z].ore > 0);
  state._cx = cx; state._cz = cz;

  const spawnSpots = [[cx + 1, cz + 1], [cx - 1, cz + 1], [cx + 1, cz - 1], [cx - 1, cz - 1], [cx, cz + 2], [cx + 2, cz + 2]];
  for (let i = 0; i < 6; i++) state.villagers.push(makeVillager(state, spawnSpots[i][0], spawnSpots[i][1], i === 0));
  for (let i = 0; i < 4; i++) state.deer.push(makeDeer(state, cx + 8 + i * 2, cz + 8));
  for (const b of state.buildings) if (b.builtDay == null) b.builtDay = 1;
  pavePlaza(grid, cx, cz);
  assignHomes(state);
  delegateRoles(state, grid);
  log(state, "The village wakes. Six villagers look to the sky, waiting for a sign.");
  return { state, grid };
}

export function makeVillager(state, x, z, leader = false, opts = {}) {
  const rng = state._rng;
  const traits = [];
  while (traits.length < 2) { const t = TRAITS[Math.floor(rng() * TRAITS.length)]; if (!traits.includes(t)) traits.push(t); }
  const skills = {};
  for (const j of JOBS) skills[j] = Math.floor(rng() * 3);
  const id = state.nextVillagerId++;
  const goods = {};
  for (const g of Object.keys(PRICES)) goods[g] = 0;
  return {
    id, name: NAMES[(id - 1) % NAMES.length] + (id > NAMES.length ? " " + Math.ceil(id / NAMES.length) : ""),
    x, z, path: null, pathTarget: null, job: JOBS[Math.floor(rng() * JOBS.length)],
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
  const homes = state.buildings.filter((b) => ["towncenter", "hut", "longhouse", "greathall", "farmhouse"].includes(b.type));
  const occ = {};
  for (const v of state.villagers) {
    if (v.home) {
      const h = homes.find((b) => key(b.x, b.z) === v.home);
      if (h && (occ[v.home] || 0) < homeCapacity(h)) occ[v.home] = (occ[v.home] || 0) + 1;
      else v.home = null;
    }
  }
  for (const v of state.villagers) {
    if (!v.home) {
      const h = homes.find((b) => (occ[key(b.x, b.z)] || 0) < homeCapacity(b));
      if (h) { v.home = key(h.x, h.z); occ[v.home] = (occ[v.home] || 0) + 1; }
    }
  }
}

export function homelessCount(state) { return state.villagers.filter((v) => !v.home).length; }

export function removeVillager(state, v, cause) {
  const wasLeader = v.leader;
  state.villagers = state.villagers.filter((o) => o !== v);
  state.faith = clamp(state.faith - 3, 0, 100); state.stats.deaths++;
  log(state, v.name + " dies (" + cause + "). Faith falls.");
  if (wasLeader && state.villagers.length) {
    state.villagers[0].leader = true;
    log(state, state.villagers[0].name + " takes up the leader's staff.");
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
export function hasShore(grid) {
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    const c = grid[x][z];
    if (c.water || c.blocked) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => inBounds(x + dx, z + dz) && grid[x + dx][z + dz].water)) return true;
  }
  return false;
}

// Leader delegation: the leader looks at what the village needs and
// assigns a job to each villager. Delegation is a strong nudge, not an
// order — a villager can still refuse it (see think()). The god never
// assigns jobs; only the leader does, and only the leader is advised by
// the council/Ollama layer.
export function delegateRoles(state, grid = null) {
  // Students go to school, not to work; toddlers stay home.
  const villagers = state.villagers.filter((v) => (v.ageDays ?? 25) >= CHILD_DAYS && !isStudent(state, v));
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
  };
  const order = ["farmer", "fisher", "hunter", "woodcutter", "miner", "builder", "hauler", "teacher"];
  let total = order.reduce((a, j) => a + desired[j], 0);
  while (total > pop) {
    for (let i = order.length - 1; i >= 0; i--) {
      if (desired[order[i]] > 0) { desired[order[i]]--; total--; break; }
    }
  }
  while (total < pop) { desired.farmer++; total++; }
  const unassigned = [...villagers];
  const assignment = new Map();
  for (const job of order) {
    for (let i = 0; i < desired[job]; i++) {
      if (!unassigned.length) break;
      let bestIdx = 0;
      for (let k = 1; k < unassigned.length; k++) if (unassigned[k].skills[job] > unassigned[bestIdx].skills[job]) bestIdx = k;
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

function nearestCell(grid, fromX, fromZ, pred) {
  let best = null, bestD = Infinity;
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    if (!pred(grid[x][z], x, z)) continue;
    const d = Math.hypot(x - fromX, z - fromZ);
    if (d < bestD) { bestD = d; best = [x, z]; }
  }
  return best;
}

function setTarget(state, grid, v, x, z) {
  if (x == null) { v.target = null; v.path = null; return; }
  // Stand on a walkable neighbour if the cell itself is blocked.
  let tx = x, tz = z;
  if (grid[tx][tz].blocked) {
    const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [tx + dx, tz + dz])
      .find(([nx, nz]) => inBounds(nx, nz) && !grid[nx][nz].blocked);
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
  for (let round = 0; round < 3 && trades < 3; round++) {
    let done = false;
    for (const buyer of state.villagers) {
      if ((buyer.ageDays ?? 25) < CHILD_DAYS) continue;
      for (const g of Object.keys(PRICES)) {
        const price = PRICES[g];
        const hungry = buyer.hunger > 40;
        const wantsFood = (g === "food" || g === "fish" || g === "meat") && hungry
          && (buyer.goods.food + buyer.goods.fish + buyer.goods.meat) === 0;
        const wantsMaterial = (g === "wood" || g === "stone") && buyer.job === "builder" && (buyer.goods[g] || 0) === 0;
        const wantsOre = g === "ore" && buyer.traits.includes("greedy") && (buyer.goods.ore || 0) === 0;
        if ((!wantsFood && !wantsMaterial && !wantsOre) || buyer.coins < price) continue;
        const seller = state.villagers.find((s) => s !== buyer && (s.ageDays ?? 25) >= CHILD_DAYS && (s.goods[g] || 0) > 2);
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
  const hasWorkshop = state.buildings.some((b) => b.type === "workshop");
  if (hasWorkshop) {
    const toolGate = (next) =>
      (next === 1) || (next === 2 && state.tech && state.tech.level >= 1) || (next === 3 && state.tech && state.tech.level >= 3);
    const buyer = state.villagers.find((v) => (v.ageDays ?? 25) >= CHILD_DAYS && !isStudent(state, v)
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
  const pop = Math.max(1, state.villagers.length);
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
  // Age a day, then death rolls: children and adults rarely, elders
  // increasingly, the sick more often.
  for (const v of [...state.villagers]) {
    v.ageDays = (v.ageDays ?? 25) + 1;
    let p = v.ageDays < CHILD_DAYS ? 0.003 : v.ageDays >= ELDER_DAYS ? 0.02 + (v.ageDays - ELDER_DAYS) * 0.004 : 0.002;
    // Plague kills only the already weak: the sick with low health,
    // the old, or the starving. A healthy villager rides it out.
    const weak = v.sick && (v.health < 50 || v.ageDays >= ELDER_DAYS || v.hunger >= 70);
    if (weak) p += 0.05;
    if (state._rng() < p) {
      const cause = v.ageDays >= ELDER_DAYS ? "old age" : weak ? "sickness" : "a sudden illness";
      removeVillager(state, v, cause); deaths++;
    }
  }
  // Birth rolls: one roll per pair of fertile adults, scaled by food,
  // housing room, and faith. At most 3 births a dawn.
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const fertile = state.villagers.filter((v) => v.ageDays >= CHILD_DAYS && v.ageDays < ELDER_DAYS);
  const pairs = Math.floor(fertile.length / 2);
  const foodFactor = edible >= birthNeed ? 1.4 : edible >= birthNeed / 2 ? 0.7 : 0.25;
  const housingFactor = state.villagers.length >= state.populationCap ? 0
    : state.villagers.length < state.populationCap * 0.7 ? 1.2 : 0.9;
  const faithFactor = 0.7 + state.faith / 200;
  // Morale moves willingness: a hopeful village has more babies.
  const moraleFactor = 0.7 + ((state.morale ?? 60) / 100) * 0.6;
  const pBirth = Math.min(0.9, 0.10 * foodFactor * housingFactor * faithFactor * moraleFactor);
  const maxBirths = 1 + Math.floor(state.villagers.length / 12);
  for (let i = 0; i < pairs && births < maxBirths; i++) {
    if (state.villagers.length >= state.populationCap) break;
    if (state._rng() < pBirth) {
      const v = makeVillager(state, state._cx + 1, state._cz + 1, false, { ageDays: 0, coins: 0 });
      state.villagers.push(v); births++; state.stats.births++;
      log(state, "A baby is born. " + v.name + " joins the village.");
    }
  }
  // Dawn share: every adult gets 1 coin from the village's surplus, so
  // no one is locked out of the market forever for being broke.
  for (const v of state.villagers) if (v.ageDays >= CHILD_DAYS) v.coins = Math.min(20, v.coins + 1);
  assignHomes(state);
  // The teacher is paid from the village fund for the day's lessons.
  const hasSchool = state.buildings.some((b) => b.type === "school");
  const teacher = state.villagers.find((v) => v.assignedJob === "teacher");
  if (hasSchool && teacher && state.fund >= 1) { state.fund -= 1; teacher.coins += 1; }
  // Schooling: students gain education at dawn, faster with a teacher.
  // Education caps at 10 and stays with the villager for life.
  if (hasSchool) {
    for (const v of state.villagers) {
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
    for (const v of state.villagers) {
      if ((v.ageDays ?? 25) <= SCHOOL_MAX_AGE) continue;
      if ((v.education || 0) >= 5) gain += 4;
      else if ((v.education || 0) >= 3) gain += 2;
    }
    state.tech.progress += Math.min(12, gain);
    // Later tiers cost more and need a bigger village: progress holds
    // at the threshold until the population gate is met.
    const need = techThresholdFor(state.tech.level);
    const popGate = ERA_POP_GATE[state.tech.level + 1] || 0;
    if (state.tech.progress >= need && state.villagers.length >= popGate) {
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
  const pop = Math.max(1, state.villagers.length);
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
  const pop = state.villagers.length;
  const built = (t) => state.buildings.some((b) => b.type === t);
  const queued = (t) => state.buildQueue.some((q) => q.type === t);
  const homeless = homelessCount(state);
  const hutTotal = state.buildings.filter((b) => b.type === "hut" || b.type === "longhouse").length
    + state.buildQueue.filter((q) => q.type === "hut" || q.type === "longhouse").length;
  const demands = [];
  const crowded = pop >= state.populationCap - 2;
  const dwellings = state.buildings.filter((b) => ["hut", "longhouse", "greathall"].includes(b.type));
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
  const huts = state.buildings.filter((b) => b.type === "hut");
  const longhouses = state.buildings.filter((b) => b.type === "longhouse");
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
  const farmhouses = state.buildings.filter((b) => b.type === "farmhouse");
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
  // Walls are capped so the ring never paves the whole map.
  const wallCount = state.buildings.filter((b) => b.type === "wall").length
    + state.buildQueue.filter((q) => q.type === "wall").length;
  const towerCount = state.buildings.filter((b) => b.type === "tower").length
    + state.buildQueue.filter((q) => q.type === "tower").length;
  if (state.tech && state.tech.level >= 2 && pop >= 12 && wallCount < 40 && !queued("wall")) {
    demands.push({ type: "wall", score: 3.5, reason: "Iron craft brings wariness: the village needs a wall ring." });
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
  if (v.fear >= 50 || raiderNear || (state.elapsed < state.effects.floodUntil && Math.hypot(v.x - cx, v.z - cz) < 14)) {
    v.state = "flee";
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
    const node = nearestCell(grid, v.x, v.z, (c) => c.stone > 0 || c.ore > 0);
    if (node) setTarget(state, grid, v, node[0], node[1]); else v.state = "idle";
  } else if (job === "fisher") {
    const shore = nearestCell(grid, v.x, v.z, (c, x, z) => !c.water && !c.blocked && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => inBounds(x + dx, z + dz) && grid[x + dx][z + dz].water));
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
  const cell = tx != null ? grid[tx][tz] : null;
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
    cell.tree = false; cell.blocked = false; addCarry("wood", 2 + fineBonus + steelBonus);
    if (hasWorkshop) { v.toolTick++; if (v.toolTick % workshopEvery === 0) addCarry("wood", 1); }
  } else if ((v.job === "miner" || v.job === "hauler") && cell && (cell.stone > 0 || cell.ore > 0)) {
    if (cell.ore > 0 && state._rng() < 0.35) { cell.ore--; addCarry("ore"); }
    else if (cell.stone > 0) { cell.stone--; addCarry("stone", 1 + fineBonus + steelBonus); if (cell.stone <= 0 && cell.ore <= 0) cell.blocked = false; }
    else addCarry("wood"); // hauler fallback at a spent node: gather firewood nearby
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
            grid[q.x][q.z].building = type;
            state.populationCap += type === "longhouse" ? 4 : 6;
            log(state, type === "longhouse"
              ? "A hut grows into a longhouse. The village can hold " + state.populationCap + " souls."
              : "A longhouse grows into a great hall. The village can hold " + state.populationCap + " souls.");
          } else {
            state.buildings.push({ type, x: q.x, z: q.z, done: true, builtDay: state.day });
            grid[q.x][q.z].building = type;
            if (type === "hut") {
              grid[q.x][q.z].blocked = true;
              state.populationCap += 4;
              log(state, "A new hut rises on the housing ring. The village can hold " + state.populationCap + " souls.");
            } else if (type === "granary") {
              grid[q.x][q.z].blocked = true;
              log(state, "A granary stands. Stored food will keep far longer now.");
            } else if (type === "marker") {
              state.faith = clamp(state.faith + 2, 0, 100);
              log(state, "A boundary marker is raised. The village knows its ground.");
            } else if (type === "well") {
              grid[q.x][q.z].blocked = true;
              log(state, "A well is dug. Water is close at hand now.");
            } else if (type === "workshop") {
              grid[q.x][q.z].blocked = true;
              log(state, "A workshop opens. Miners and woodcutters work with proper tools.");
            } else if (type === "shrine") {
              state.faith = clamp(state.faith + 5, 0, 100);
              log(state, "A shrine is raised. The people take heart.");
            } else if (type === "farmhouse") {
              grid[q.x][q.z].blocked = true;
              state.populationCap += 2;
              const added = clearFarmBed(state, grid, q.x, q.z);
              log(state, "A farmhouse rises in the west fields, with " + added + " new field plots around it. It houses 2 farmhands.");
            } else if (type === "school") {
              grid[q.x][q.z].blocked = true;
              log(state, "A school opens its doors. The children will learn their letters.");
            } else if (type === "healer") {
              grid[q.x][q.z].blocked = true;
              log(state, "A healer's hut opens. The sick will mend faster near it.");
            } else if (type === "wall") {
              grid[q.x][q.z].blocked = true;
              log(state, "A stretch of wall rises on the wall ring.");
            } else if (type === "tower") {
              grid[q.x][q.z].blocked = true;
              log(state, "A watch tower rises. Its guard watches the gates.");
            }
          }
          assignHomes(state);
          // Builders are paid from the village fund for finished work.
          if (state.fund >= 2) { state.fund -= 2; v.coins += 2; }
        } else {
          log(state, "The " + (q.type || "hut") + " frame stands unfinished: not enough in the stockpile.");
          if (q.type !== "longhouse" && q.type !== "greathall") { grid[q.x][q.z].building = null; grid[q.x][q.z].blocked = false; }
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
export function scoreSpot(state, grid, x, z, type) {
  const cx = state._cx, cz = state._cz;
  const dist = Math.hypot(x - cx, z - cz);
  const c = grid[x][z];
  if (c.blocked || c.water || c.farm || c.building || c.tree) return -Infinity;
  // Hard spacing: no dwelling within 2 cells (Chebyshev) of another.
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (!dx && !dz) continue;
    const n = inBounds(x + dx, z + dz) ? grid[x + dx][z + dz] : null;
    if (n && n.building && DWELLING_TYPES.includes(n.building)) return -Infinity;
  }
  if ((type === "hut" || type === "longhouse" || type === "greathall") && x < cx - 3) return -Infinity;
  if (type === "farmhouse" && x > cx - 5) return -Infinity;
  let score = 0;
  // Road access: a road right next door is worth building beside.
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (!dx && !dz) continue;
    const n = inBounds(x + dx, z + dz) ? grid[x + dx][z + dz] : null;
    if (n && n.road) score += 2;
  }
  // Cluster, at arm's length: buildings three to four cells away are
  // good neighbours; closer than that is already hard-rejected above.
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) < 3) continue;
    const n = inBounds(x + dx, z + dz) ? grid[x + dx][z + dz] : null;
    if (n && n.building) score += 1.0;
  }
  if (type === "hut" || type === "longhouse" || type === "greathall") {
    score -= Math.abs(dist - 7) * 2.0; // housing ring, radius ~7
  } else if (type === "farmhouse") {
    score += x < cx ? 4 : -4; // farm district is west
    let farmsNear = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (inBounds(x + dx, z + dz) && grid[x + dx][z + dz].farm) farmsNear++;
    }
    score += farmsNear * 1.2;
    score -= Math.abs(dist - 10) * 0.6;
  } else if (type === "granary") {
    score -= Math.abs(dist - 4) * 1.0;
    let farmsNear = 0;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      if (inBounds(x + dx, z + dz) && grid[x + dx][z + dz].farm) farmsNear++;
    }
    score += farmsNear * 0.4;
  } else if (type === "well") {
    score -= dist * 1.5; // as central as possible
  } else if (type === "shrine") {
    const altar = state.buildings.find((b) => b.type === "altar");
    if (altar) score -= Math.hypot(x - altar.x, z - altar.z) * 3;
  } else if (type === "workshop") {
    let nearestStone = Infinity;
    for (const [sx, sz] of state._stoneSpots || []) nearestStone = Math.min(nearestStone, Math.hypot(x - sx, z - sz));
    score -= nearestStone * 0.8;
    score -= Math.abs(dist - 7) * 0.5;
  } else if (type === "school" || type === "healer") {
    // Civic buildings sit near the center, within easy reach of homes.
    score -= Math.abs(dist - 5) * 1.0;
  }
  return score;
}

export function findPlannedSpot(state, grid, type, minR = 3, maxR = 14) {
  const cx = state._cx, cz = state._cz;
  let best = null, bestScore = -Infinity;
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    if (Math.hypot(x - cx, z - cz) < minR || Math.hypot(x - cx, z - cz) > maxR) continue;
    const sc = scoreSpot(state, grid, x, z, type);
    if (sc > bestScore) { bestScore = sc; best = [x, z]; }
  }
  return bestScore > -Infinity ? best : null;
}

// --- walls and towers: a ring with gates, not a sprawl ---
// The wall ring sits 9 cells out from the town center. The four axis
// cells stay open as gates: villagers, and raiders, funnel through
// them, and towers watch them. Farm beds, water, roads, and trees
// break the ring elsewhere, so a finished ring still has gaps: a
// wall slows raiders and channels them, it never seals the village
// in. Walls block movement through the grid blocked mechanism, so
// villagers path through the gates like everyone else.
export const WALL_RING_R = 9;

function ringCellFree(state, grid, x, z) {
  if (!inBounds(x, z)) return false;
  const c = grid[x][z];
  return !c.blocked && !c.water && !c.farm && !c.building && !c.tree && c.stone <= 0 && c.ore <= 0 && !c.road;
}

export function findWallSpot(state, grid) {
  const cx = state._cx, cz = state._cz, R = WALL_RING_R;
  let best = null, bestScore = -Infinity;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
    if (dx === 0 || dz === 0) continue; // gate cells stay open
    const x = cx + dx, z = cz + dz;
    if (!ringCellFree(state, grid, x, z)) continue;
    if (state.buildQueue.some((q) => q.x === x && q.z === z)) continue;
    let score = 0;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = inBounds(x + ax, z + az) ? grid[x + ax][z + az] : null;
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
      const n = inBounds(x + ax, z + az) ? grid[x + ax][z + az] : null;
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
    const c = grid[x][z];
    if (c.water || c.building || c.farm || c.road) return;
    if (c.tree) { c.tree = false; c.blocked = false; }
    if (c.stone > 0) { c.stone = 0; c.ore = 0; c.blocked = false; }
    c.road = true; laid++;
  };
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) === 2) lay(cx + dx, cz + dz);
  }
  for (let x = cx - 3; x >= cx - 6; x--) lay(x, cz);
  return laid;
}

function findBuildSpot(state, grid, minR, maxR) {
  return findPlannedSpot(state, grid, "granary", minR, maxR);
}

function paveRoads(state, grid) {
  const targets = state.buildings.filter((b) => ["hut", "longhouse", "greathall", "farmhouse", "workshop", "granary"].includes(b.type));
  if (!targets.length) return;
  const cx = state._cx, cz = state._cz;
  // Finish one road at a time: pave the whole path to the target
  // with the fewest unpaved cells left, instead of scattering short
  // stubs. The old version picked the path with the fewest road
  // cells, which paved new ground every check and never completed
  // a single road.
  const allTargets = [...targets];
  if (state._farmCells.length) allTargets.push({ x: state._farmCells[0][0], z: state._farmCells[0][1] });
  let bestPath = null, bestUnpaved = Infinity;
  for (const t of allTargets) {
    const path = findPath(grid, cx, cz, t.x, t.z, 4000, true); // roads route around fields, never through them
    if (!path) continue;
    const unpaved = path.filter(([x, z]) => { const c = grid[x][z]; return !c.road && !c.building && !c.water && !c.farm; }).length;
    if (unpaved > 0 && unpaved < bestUnpaved) { bestUnpaved = unpaved; bestPath = path; }
  }
  if (!bestPath) return;
  let paved = 0;
  for (const [x, z] of bestPath) {
    if (paved >= 16) break;
    const c = grid[x][z];
    if (c.road || c.building || c.water || c.farm) continue;
    c.road = true;
    if (c.tree) { c.tree = false; c.blocked = false; }
    paved++;
  }
  if (paved) log(state, "Villagers lay a dirt road toward the " + (bestPath ? "village districts." : "huts."));
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
      } else if (top.type === "wall") spot = findWallSpot(state, grid);
      else if (top.type === "tower") spot = findTowerSpot(state, grid);
      else if (top.type === "hut") spot = findHutSpot(state, grid);
      else spot = findPlannedSpot(state, grid, top.type, 2, 14);
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
    const spot = corners.find(([x, z]) => inBounds(x, z) && !grid[x][z].blocked && !grid[x][z].water && !grid[x][z].farm && !grid[x][z].building && !grid[x][z].tree && !state.buildQueue.some((q) => q.x === x && q.z === z));
    if (spot) {
      state.buildQueue.push({ type: "marker", x: spot[0], z: spot[1], progress: 0, needWood: 2, needStone: 0, needOre: 0 });
      log(state, "The villagers raise a boundary marker.");
    }
  }
  paveRoads(state, grid);
  expandFarms(state, grid);
}

// Farms grow in beds, not single cells: a 3x3 bed cleared next to the
// existing farm district, biased west, as mouths to feed grow. A bed
// near a farmhouse grows faster (see the crop loop in step()).
export function findFarmBed(state, grid) {
  const cx = state._cx, cz = state._cz;
  let best = null, bestScore = -Infinity;
  for (let x = 4; x < SIZE - 4; x++) for (let z = 4; z < SIZE - 4; z++) {
    if (Math.hypot(x - cx, z - cz) > 14) continue;
    if (x > cx - 5) continue; // farm beds stay in the western district
    if (x + 1 > cx - 3) continue; // the whole bed stays west of the plaza
    let free = 0, farmsNear = 0, trees = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = grid[x + dx][z + dz];
      if (c.water || c.building || c.road) { free = -99; break; }
      if (c.farm) farmsNear++;
      else if (!c.blocked) free++;
      else if (c.tree) trees++;
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
    const c = grid[x][z];
    if (c.water || c.building || c.road || c.farm) continue;
    if (c.tree) { c.tree = false; }
    if (c.stone > 0) { c.stone = 0; c.ore = 0; }
    c.blocked = false; c.farm = true; c.crop = 0; c.cropGrow = 0;
    state._farmCells.push([x, z]);
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
const BUILDING_HP = { wall: 30, tower: 60 };
function buildingHp(b) { return BUILDING_HP[b.type] || 25; }

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

export function spawnRaid(state, grid, size = null) {
  const pop = state.villagers.length;
  const n = size ?? Math.min(6, 2 + Math.floor(pop / 12));
  const dirs = ["north", "south", "east", "west"];
  const dir = dirs[Math.floor(state._rng() * 4)];
  const spawned = [];
  for (let i = 0; i < n; i++) {
    let x, z;
    if (dir === "north") { x = 2 + Math.floor(state._rng() * (SIZE - 4)); z = 1; }
    else if (dir === "south") { x = 2 + Math.floor(state._rng() * (SIZE - 4)); z = SIZE - 2; }
    else if (dir === "west") { x = 1; z = 2 + Math.floor(state._rng() * (SIZE - 4)); }
    else { x = SIZE - 2; z = 2 + Math.floor(state._rng() * (SIZE - 4)); }
    let tries = 0;
    while (grid[x][z].water && tries < 10) { x = clamp(x + 1, 1, SIZE - 2); z = clamp(z + 1, 1, SIZE - 2); tries++; }
    const r = makeRaider(state, x + 0.5, z + 0.5);
    r.homeEdge = [x, z];
    state.raiders.push(r);
    spawned.push(r);
  }
  state.raidActive = true;
  state.raidUntil = state.elapsed + 120;
  state._raidStats = { deaths: 0, stolen: 0, killed: 0 };
  log(state, "Raiders attack! " + n + " raiders come from the " + dir + ". The villagers flee.");
  return spawned;
}

function nearestWallCell(grid, r) {
  let best = null, bestD = Infinity;
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    if (grid[x][z].building !== "wall" && grid[x][z].building !== "tower") continue;
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < bestD) { bestD = d; best = [x, z]; }
  }
  return best;
}

function moveRaider(state, grid, r, tx, tz, dt) {
  if (state.elapsed >= r.retargetAt || (!r.path && !r.direct)) {
    r.retargetAt = state.elapsed + 3;
    const path = findPath(grid, Math.round(r.x), Math.round(r.z), clamp(Math.round(tx), 0, SIZE - 1), clamp(Math.round(tz), 0, SIZE - 1), 4000);
    if (path && path.length) { r.path = path; r.direct = null; }
    else { r.path = null; r.direct = nearestWallCell(grid, r); }
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
    const t = grid[x][z].building;
    if (!t || t === "towncenter" || t === "altar") continue;
    const b = state.buildings.find((o) => o.x === x && o.z === z);
    if (b) return b;
  }
  return null;
}

function resolveRaid(state) {
  state.raidActive = false;
  state.lastRaidDay = state.day;
  const st = state._raidStats || { deaths: 0, stolen: 0, killed: 0 };
  if (st.deaths === 0 && st.stolen === 0) {
    state.morale = clamp((state.morale ?? 60) + 8, 0, 100);
    state.faith = clamp(state.faith + 5, 0, 100);
    log(state, "The village drives off the raiders without loss. Morale soars.");
  } else {
    state.morale = clamp((state.morale ?? 60) - 8, 0, 100);
    state.faith = clamp(state.faith - 3, 0, 100);
    log(state, "The raid ends. " + st.deaths + " slain, " + st.stolen + " food stolen, " + st.killed + " raiders felled.");
  }
  state._raidStats = null;
}

function stepRaiders(state, grid, dt) {
  if (!state.raiders.length) {
    if (state.raidActive) resolveRaid(state);
    return;
  }
  const cx = state._cx, cz = state._cz;
  // Towers shoot: one volley per second per tower, range 7.
  if (state.elapsed >= (state.towerAt || 0)) {
    state.towerAt = state.elapsed + 1;
    for (const t of state.buildings.filter((b) => b.type === "tower")) {
      let best = null, bestD = 7;
      for (const r of state.raiders) {
        const d = Math.hypot(r.x - (t.x + 0.5), r.z - (t.z + 0.5));
        if (d < bestD) { bestD = d; best = r; }
      }
      if (best) {
        best.hp -= 2 + eraStageOf(state.tech ? state.tech.level : 0);
        if (best.hp <= 0) {
          state.raiders = state.raiders.filter((o) => o !== best);
          if (state._raidStats) state._raidStats.killed++;
          log(state, "A tower fells a raider.");
        }
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
    // Break through: batter an adjacent wall, tower, or building.
    const target = destructibleNear(state, grid, r);
    if (target) {
      target.damage = (target.damage || 0) + 6 * dt;
      if (target.damage >= buildingHp(target)) {
        state.buildings = state.buildings.filter((o) => o !== target);
        grid[target.x][target.z].building = null;
        grid[target.x][target.z].blocked = false;
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
  updateWeather(state);
  if (state.elapsed >= state.expandAt) { state.expandAt = state.elapsed + 20; expandVillage(state, grid); }
  if (state.elapsed >= state.delegateAt) { state.delegateAt = state.elapsed + 15; delegateRoles(state, grid); }
  if (state.elapsed >= (state.marketAt || 30)) { state.marketAt = state.elapsed + 30; runMarket(state); }
  if (state.elapsed >= (state.treeAt || 60)) {
    state.treeAt = state.elapsed + 30;
    // Trees regrow in spring, rest in summer, and not at all in winter.
    const attempts = state.season === "winter" ? 0 : state.season === "spring" ? 6 : 3;
    for (let i = 0; i < attempts; i++) {
      const x = Math.floor(state._rng() * SIZE), z = Math.floor(state._rng() * SIZE);
      const c = grid[x][z];
      if (!c.water && !c.blocked && !c.tree && !c.farm && !c.building && c.stone <= 0 && Math.hypot(x - state._cx, z - state._cz) > 8) { c.tree = true; c.blocked = true; }
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
    const hasGranary = state.buildings.some((b) => b.type === "granary");
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
    if (state.buildings.some((b) => b.type === "shrine")) state.faith = clamp(state.faith + 3, 0, 100);
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
      if (state.lowMoraleDawns >= 3 && state.villagers.length > 4 && state.elapsed - (state.lastLeaveAt || -Infinity) > 5 * DAY_LENGTH) {
        const leaver = [...state.villagers].sort((a, b) => (a.hunger + (100 - a.energy)) - (b.hunger + (100 - b.energy)))[0];
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
  }

  // Crops grow. Plots within 5 cells of a farmhouse grow half again
  // as fast — the farmhouse anchors the district. Rain feeds the
  // fields; snow stops growth; the season sets the pace.
  if (state.elapsed >= state.effects.droughtUntil && state.weather.kind !== "snow") {
    const farmhouses = state.buildings.filter((b) => b.type === "farmhouse");
    const eraGrowth = (state.tech && state.tech.level >= 4 ? 1.25 : 1) * (state.tech && state.tech.level >= 5 ? 1.15 : 1);
    const growth = SEASON_GROWTH[state.season] * (state.weather.kind === "rain" ? 1.5 : 1) * eraGrowth;
    for (const [x, z] of state._farmCells) {
      const c = grid[x][z];
      const nearHouse = farmhouses.some((f) => Math.hypot(x - f.x, z - f.z) <= 5);
      if (c.crop >= 0 && c.crop < 3) { c.cropGrow += dt * growth * (nearHouse ? 1.5 : 1); if (c.cropGrow > 28) { c.cropGrow = 0; c.crop++; } }
    }
  }
  // Storms tear at the crops: one plot loses a growth stage.
  if (state.weather && state.weather.kind === "storm" && state.elapsed >= (state.stormAt || 0)) {
    state.stormAt = state.elapsed + 10;
    const grown = state._farmCells.filter(([x, z]) => grid[x][z].crop > 0);
    if (grown.length) {
      const [x, z] = grown[Math.floor(state._rng() * grown.length)];
      const c = grid[x][z]; c.crop--; c.cropGrow = 0;
      if (state._rng() < 0.25) log(state, "The storm batters the fields.");
    }
  }
  // Stone slowly weathers back, on a timer, so building never stalls
  // forever once the first clusters are mined out.
  if (state.elapsed >= (state.stoneAt || 30)) {
    state.stoneAt = state.elapsed + 30;
    const [x, z] = state._stoneSpots[Math.floor(state._rng() * state._stoneSpots.length)];
    if (grid[x][z].stone < 10) { grid[x][z].stone += 2; grid[x][z].blocked = true; }
    // Ore weathers back slowly too, so a workshop stays reachable.
    if (state._oreSpots && state._oreSpots.length && state._rng() < 0.3) {
      const [ox, oz] = state._oreSpots[Math.floor(state._rng() * state._oreSpots.length)];
      if (grid[ox][oz].ore < 6) { grid[ox][oz].ore++; grid[ox][oz].blocked = true; }
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
  const hasWell = state.buildings.some((b) => b.type === "well");
  const healer = state.buildings.find((b) => b.type === "healer");
  const phase = phaseOf(state.time);
  const wkind = state.weather ? state.weather.kind : "clear";
  let plagueCleared = 0;
  for (const v of [...state.villagers]) {
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
      v.health = clamp(v.health - dt * (nearHealer ? 0.2 : 0.8) + (nearHealer ? dt * 1.5 : 0), 0, 100);
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
      else { const onRoad = grid[clamp(Math.round(v.x), 0, SIZE - 1)][clamp(Math.round(v.z), 0, SIZE - 1)].road; const moveFactor = wkind === "snow" ? 0.85 : wkind === "storm" ? 0.9 : 1; const sp = (v.state === "flee" ? 3.4 : 2.2) * (onRoad ? 1.35 : 1) * moveFactor * dt; v.x += (dx / dist) * Math.min(sp, dist); v.z += (dz / dist) * Math.min(sp, dist); moving = true; }
    } else if (v.target) {
      const dx = v.target[0] + 0.5 - v.x, dz = v.target[1] + 0.5 - v.z, dist = Math.hypot(dx, dz);
      // Don't walk into a blocked target cell: stop at working distance.
      const stopAt = grid[v.target[0]][v.target[1]].blocked ? 1.0 : 0.4;
      if (dist > stopAt) {
        const cell = grid[clamp(Math.round(v.x), 0, SIZE - 1)][clamp(Math.round(v.z), 0, SIZE - 1)];
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
        if (eatKind) {
          if (v.goods[eatKind] > 0) v.goods[eatKind]--;
          else {
            s[eatKind]--;
            if (v.coins >= PRICES[eatKind]) { v.coins -= PRICES[eatKind]; state.fund += PRICES[eatKind]; }
          }
        } else if (v.target && grid[v.target[0]][v.target[1]].farm && grid[v.target[0]][v.target[1]].crop === 3) { grid[v.target[0]][v.target[1]].crop = 0; }
        v.hunger = clamp(v.hunger - 45, 0, 100);
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
    case "flood":
      state.effects.floodUntil = state.elapsed + 30;
      for (const v of state.villagers) v.fear = clamp(v.fear + 45, 0, 100);
      log(state, "Flood waters rise. The villagers flee to high ground."); setCd(45); break;
    case "fire": {
      if (x == null) return { ok: false, reason: "Tap the ground to place the fire." };
      for (const v of state.villagers) if (Math.hypot(v.x - x, v.z - z) < 4) { v.fear = 80; v.health = clamp(v.health - 25, 0, 100); }
      state._fire = { x, z, until: state.elapsed + 12 };
      log(state, "Fire falls from the sky."); setCd(30); break;
    }
    case "plague":
      state.effects.plagueUntil = state.elapsed + 45;
      for (const v of state.villagers) if (state._rng() < 0.4) v.sick = true;
      state.faith = clamp(state.faith - 8, 0, 100);
      state.stats.plagues = (state.stats.plagues || 0) + 1;
      log(state, "Plague spreads through the village."); setCd(60); break;
    case "quake": {
      if (x == null) return { ok: false, reason: "Tap the ground for the quake's center." };
      state._quake = { x, z, until: state.elapsed + 2 };
      for (const v of state.villagers) if (Math.hypot(v.x - x, v.z - z) < 6) v.fear = clamp(v.fear + 55, 0, 100);
      state.faith = clamp(state.faith - 4, 0, 100);
      log(state, "The earth shakes."); setCd(40); break;
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
    case "directive":
      state.directive = opts.focusJob ? { focusJob: opts.focusJob } : null;
      log(state, opts.focusJob ? "Whispered through the leader: focus on " + opts.focusJob + ". Some may disobey." : "The directive is lifted.");
      break;
    case "whisper":
      if (opts.text) log(state, "Whisper: \"" + String(opts.text).slice(0, 200) + "\"");
      break;
    default:
      return { ok: false, reason: "Unknown god action." };
  }
  return { ok: true };
}

function findHutSpot(state, grid) {
  return findPlannedSpot(state, grid, "hut", 4, 12);
}

export function leader(state) {
  return state.villagers.find((v) => v.leader) || state.villagers[0] || null;
}

// --- save / load: only plain data, grid is rebuilt from the seed ---

export function serialize(state, grid) {
  const crops = [], stones = [], buildings = [], roads = [];
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
    const c = grid[x][z];
    if (c.crop >= 0) crops.push([x, z, c.crop, c.cropGrow]);
    if (c.stone > 0 || c.ore > 0) stones.push([x, z, c.stone, c.ore, c.blocked ? 1 : 0]);
    if (c.building) buildings.push([x, z, c.building]);
    if (c.road) roads.push([x, z]);
  }
  const { _rng, _farmCells, _stoneSpots, _oreSpots, _fire, _quake, raiders, _raidStats, ...rest } = state;
  void _rng; void _farmCells; void _stoneSpots; void _oreSpots; void raiders; void _raidStats;
  // The save version is stamped here, not trusted to state, so every
  // file on disk carries the version its writer used.
  return JSON.stringify({ ...rest, version: SAVE_VERSION, crops, stones, buildings, roads, fire: _fire || null, quake: _quake || null });
}

export function deserialize(json) {
  const data = JSON.parse(json);
  const fromVersion = data.version == null ? 1 : data.version;
  const { state, grid } = newWorld(data.seed);
  // Overlay saved dynamic state, keeping the regenerated grid's statics.
  const savedCrops = data.crops, savedStones = data.stones, savedBuildings = data.buildings;
  const savedFire = data.fire, savedQuake = data.quake, savedRoads = data.roads || [];
  delete data.crops; delete data.stones; delete data.buildings; delete data.fire; delete data.quake; delete data.roads;
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
    // v11 fields: a migrated villager starts unschooled, with crude tools.
    if (v.education == null) v.education = 0;
    if (v.tool == null) v.tool = 0;
    if (!("home" in v)) v.home = null;
  }
  for (const b of state.buildings) if (b.builtDay == null) b.builtDay = 1;
  assignHomes(state);
  state._rng = mulberry32((data.seed ^ 0x9e3779b9) + Math.floor(state.elapsed * 1000));
  for (const [x, z, crop, grow] of savedCrops) { grid[x][z].farm = true; grid[x][z].crop = crop; grid[x][z].cropGrow = grow; }
  for (const [x, z] of savedRoads) grid[x][z].road = true;
  // Rebuild the farm list from the grid so farms cleared by expansion
  // before the save keep growing after load.
  state._farmCells = [];
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (grid[x][z].farm) state._farmCells.push([x, z]);
  for (const [x, z, stone, ore, blocked] of savedStones) { grid[x][z].stone = stone; grid[x][z].ore = ore; grid[x][z].blocked = !!blocked; }
  for (const [x, z, type] of savedBuildings) grid[x][z].building = type;
  // Rebuild the building list from the grid. serialize() stores
  // buildings as grid triples and deletes the object list before the
  // overlay, so a load that trusted the fresh founding list dropped
  // every building raised after founding (granaries, markers, later
  // huts) from state on every load. The grid is the truth: restore
  // all of it, then reassign homes to the full village.
  {
    const seen = new Set(state.buildings.map((b) => b.x + "," + b.z));
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
      const t = grid[x][z].building;
      if (t && !seen.has(x + "," + z)) {
        state.buildings.push({ type: t, x, z, done: true, builtDay: 1 });
        seen.add(x + "," + z);
      }
    }
  }
  assignHomes(state);
  // Older saves were founded without a plaza: lay it once so the
  // old village gains the same visible square and farm road.
  let roadCount = 0;
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (grid[x][z].road) roadCount++;
  if (roadCount < 10) pavePlaza(grid, state._cx, state._cz);
  state._fire = savedFire || null; state._quake = savedQuake || null;
  return { state, grid };
}
