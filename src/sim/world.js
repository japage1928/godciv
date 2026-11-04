// GodCiv sim world: founding, serialization, and migration.
// Updates must never restart the world: see deserialize().
import { delegateRoles } from "./brain.js";
import { JOBS, PRICES, SAVE_VERSION, assignHomes, log, makeDeer, makeVillager, mulberry32, seasonOf } from "./core.js";
import { cellAt, createGrid, ensureIndexes, forEachGeneratedCell, getChunk } from "./grid.js";
import { pavePlaza } from "./planning.js";
import { hash01, makeVillageRecord, oldBlockFor, pickVillageSites } from "./terrain.js";

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
    stockpile: { food: 24, wood: 24, stone: 12, ore: 0, fish: 0, meat: 0, furniture: 0, pottery: 0, ironware: 0, wares: 0 },
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
    wars: [], truces: {}, borderIncidents: {},
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
    // v14 products: neighbor records from older saves lack the new
    // stockpile keys; backfill to 0 like the main stockpile below.
    if (!rec.stockpile) rec.stockpile = {};
    for (const g of Object.keys(PRICES)) if (rec.stockpile[g] == null) rec.stockpile[g] = 0;
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
  // Phase H war fields: backfilled on every load, no bump. A save
  // written before war existed loads at peace with no truces.
  if (!state.wars) state.wars = [];
  if (!state.truces) state.truces = {};
  if (!state.borderIncidents) state.borderIncidents = {};
  grid._villageSites = state.villageSites || [];
  // Regenerate every chunk the save had generated, so chunks with no
  // deltas still count as generated (render + save round-trips).
  if (savedChunks) for (const [cx, cz] of savedChunks) getChunk(grid, cx, cz);
  if (state.raidActive) log(state, "The raid scatters as the world is remade.");
  state.raidActive = false;
  state.raiders = [];
  state._raidStats = null;
  state.version = SAVE_VERSION;
  // v14 products: a save written before the new jobs existed has no
  // furniture/pottery/ironware/wares keys in its stockpile. Backfill
  // them to 0 on every load, no bump — the villager loop below does
  // the same for personal goods via Object.keys(PRICES).
  if (!state.stockpile) state.stockpile = {};
  for (const g of Object.keys(PRICES)) if (state.stockpile[g] == null) state.stockpile[g] = 0;
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
