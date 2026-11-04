// GodCiv sim core: constants, tiny helpers, villager construction.
// No DOM, no Three.js. Split from sim.js (v14); sim.js re-exports it.
import { villageRecord } from "./diplomacy.js";

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

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const key = (x, z) => x + "," + z;
export const inBounds = (x, z) => x >= 0 && z >= 0 && x < SIZE && z < SIZE;

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

// --- active chunks (design section 2) ---
export const ACTIVE_RADIUS_CHUNKS = 2;
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

export function makeDeer(state, x, z) {
  const id = state.nextDeerId++;
  return { id, x: clamp(x, 1, SIZE - 2), z: clamp(z, 1, SIZE - 2), tx: null, tz: null, retargetAt: 0, fleeing: false };
}

export function log(state, text) {
  state.log.unshift({ day: state.day, time: state.time, text });
  if (state.log.length > 60) state.log.length = 60;
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
// War (Phase H, doc §13.5-13.7): rivalry at -40 stops trade (the
// relation gate already refuses below 0); war needs rivalry plus
// -70 plus a clear 30-day cooldown. A party is 3-6 fighters, loot
// caps at 20, exhaustion ends wars, and the god never declares one.
export const WAR_RIVALRY = -40;
export const WAR_MIN_RELATION = -70;
export const WAR_COOLDOWN_DAYS = 30;
export const WAR_PARTY_MIN = 3;
export const WAR_PARTY_MAX = 6;
export const WAR_PARTY_MIN_POP = 6;
export const WAR_LOOT_CAP = 20;
export const WAR_LOOT_TICK = 2;
export const WAR_LOOT_INTERVAL = 5;
export const WAR_RETREAT_FRACTION = 0.25;
export const WAR_EXHAUSTION_PEACE = 10;
export const WAR_WHITE_PEACE_DAYS = 30;
export const WAR_KILL_RELATION = -8;
export const WAR_BORDER_INCIDENT_CHANCE = 0.5;
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
