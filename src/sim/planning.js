// GodCiv sim planning: streets, lots, walls, farms, and building
// demand. The plan is derived from the grid every time it is needed.
import { BUILD_COSTS, SIZE, homelessCount, inBounds, key, log, ownBuildings, ownVillagers } from "./core.js";
import { cellAt, ensureIndexes, noteMutation, peekCell } from "./grid.js";

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
  // Production buildings: one of each, gated on tech and population
  // like the healer's hut above. A kiln fires pottery, a smithy
  // hammers ironware, and a factory turns all three materials into
  // wares once the village is a city in all but name.
  if (state.tech && state.tech.level >= 1 && !built("kiln") && !queued("kiln") && pop >= 10) {
    demands.push({ type: "kiln", score: 3, reason: "Bronze craft brings the kiln: the village needs pottery." });
  }
  if (state.tech && state.tech.level >= 2 && !built("smithy") && !queued("smithy") && pop >= 12) {
    demands.push({ type: "smithy", score: 3, reason: "Iron craft brings the smithy: the village needs ironware." });
  }
  if (state.tech && state.tech.level >= 5 && !built("factory") && !queued("factory") && pop >= 26) {
    demands.push({ type: "factory", score: 4, reason: "The electric age brings the factory: the village needs wares." });
  }
  if (!built("shrine") && !queued("shrine") && (state.faith < 45 || pop >= 14)) {
    demands.push({ type: "shrine", score: 3, reason: state.faith < 45 ? "Faith is low: the people need a shrine." : "The village has grown: it needs a gathering shrine." });
  }
  // A school teaches the children, and schooled adults push the
  // village toward new tools. One school is enough for this village.
  // Score 8 while none exists: a one-time civic unlock that gates
  // education and tech, it outranks repeatable farmhouses (max 7) and
  // production buildings, but a real housing crisis (hut score 9+)
  // still outranks it. (v14: the jobs build re-rolled the RNG stream,
  // villages grew faster, and at score 4 the school never surfaced
  // in 30 days on 3 of 4 seeds — no school even at day 60, pop 143.)
  if (!built("school") && !queued("school") && pop >= 8) {
    demands.push({ type: "school", score: 8, reason: "The children need a school." });
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
  } else if (type === "kiln" || type === "smithy") {
    // Production buildings sit like the workshop: near stone, at
    // middle distance from the center.
    let nearestStone = Infinity;
    for (const [sx, sz] of grid._stoneSpots || []) nearestStone = Math.min(nearestStone, Math.hypot(x - sx, z - sz));
    if (nearestStone !== Infinity) score -= nearestStone * 0.8;
    score -= Math.abs(dist - 7) * 0.5;
  } else if (type === "factory") {
    // A factory stands further out, in the 9-13 ring: the infill
    // pull is cancelled like the farmhouse branch, and only the
    // distance outside the band is penalised. Every lot already has
    // street frontage (lotFree), so the band alone puts it on a
    // street at the edge of the settled village.
    score += dist * 10;
    const outside = dist < 9 ? 9 - dist : dist > 13 ? dist - 13 : 0;
    score -= outside * 2.0;
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
export function findHutSpot(state, grid) {
  return findLotSpot(state, grid, "hut");
}
