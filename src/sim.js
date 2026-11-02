// GodCiv sim: owns the truth. No DOM, no Three.js in here, so it can be
// tested headlessly with node. Ported from the Luanti mod in
// ~/workspace/godciv/mods/godciv/ — same rules: utility brain runs every
// villager, the god never directly controls a villager, a local model only
// ever advises the leader. The model never writes state directly.

export const SIZE = 48;
export const DAY_LENGTH = 180; // sim seconds per day: 45 real seconds at 4x, 22.5 at 8x
export const JOBS = ["farmer", "woodcutter", "miner", "fisher", "hunter", "builder", "hauler"];
export const TRAITS = ["devout", "skeptic", "brave", "cautious", "industrious", "lazy", "kind", "greedy"];
export const NAMES = ["Ash", "Bram", "Cora", "Dun", "Elowen", "Fenn", "Greta", "Hob", "Ilsa", "Jory", "Kessa", "Lorn", "Mira", "Nils", "Odessa", "Perrin", "Quill", "Rosa", "Soren", "Tilda", "Ulric", "Vera", "Wren", "Yannick"];

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
export function findPath(grid, sx, sz, tx, tz, maxSteps = 4000) {
  if (!inBounds(tx, tz) || grid[tx][tz].blocked) return null;
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
      if (!inBounds(nx, nz) || grid[nx][nz].blocked) continue;
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
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * SIZE), z = Math.floor(rng() * SIZE);
    if (grid[x][z].water || Math.hypot(x - cx, z - cz) < 9 || grid[x][z].tree || grid[x][z].farm) continue;
    grid[x][z].stone = 6 + Math.floor(rng() * 6);
    grid[x][z].ore = grid[x][z].h > 0.62 && rng() < 0.45 ? 3 + Math.floor(rng() * 3) : 0;
    grid[x][z].blocked = true;
    stoneSpots.push([x, z]);
  }

  const state = {
    version: 1, seed, day: 1, time: 0.3, speed: 1, paused: false,
    stockpile: { food: 24, wood: 24, stone: 12, ore: 0, fish: 0, meat: 0 },
    faith: 55, populationCap: 12, expandAt: 10, delegateAt: 5,
    directive: null, // { focusJob } — a nudge, not an order
    buildQueue: [], // {type,x,z,progress,needWood,needStone}
    buildings: [
      { type: "towncenter", x: cx, z: cz },
      { type: "altar", x: cx + 2, z: cz },
      { type: "hut", x: cx - 2, z: cz - 3, done: true },
    ],
    villagers: [], deer: [], log: [],
    effects: { droughtUntil: -1, floodUntil: -1, plagueUntil: -1 },
    cooldowns: {}, stats: { births: 0, deaths: 0, blessings: 0 },
    nextVillagerId: 1, nextDeerId: 1, elapsed: 0,
  };
  for (const b of state.buildings) grid[b.x][b.z].building = b.type;
  state.rngState = null; // runtime only, rebuilt on load
  state._rng = rng;
  state._farmCells = farmCells;
  state._stoneSpots = stoneSpots;
  state._cx = cx; state._cz = cz;

  const spawnSpots = [[cx + 1, cz + 1], [cx - 1, cz + 1], [cx + 1, cz - 1], [cx - 1, cz - 1], [cx, cz + 2], [cx + 2, cz + 2]];
  for (let i = 0; i < 6; i++) state.villagers.push(makeVillager(state, spawnSpots[i][0], spawnSpots[i][1], i === 0));
  for (let i = 0; i < 4; i++) state.deer.push(makeDeer(state, cx + 8 + i * 2, cz + 8));
  delegateRoles(state);
  log(state, "The village wakes. Six villagers look to the sky, waiting for a sign.");
  return { state, grid };
}

export function makeVillager(state, x, z, leader = false) {
  const rng = state._rng;
  const traits = [];
  while (traits.length < 2) { const t = TRAITS[Math.floor(rng() * TRAITS.length)]; if (!traits.includes(t)) traits.push(t); }
  const skills = {};
  for (const j of JOBS) skills[j] = Math.floor(rng() * 3);
  const id = state.nextVillagerId++;
  return {
    id, name: NAMES[(id - 1) % NAMES.length] + (id > NAMES.length ? " " + Math.ceil(id / NAMES.length) : ""),
    x, z, path: null, pathTarget: null, job: JOBS[Math.floor(rng() * JOBS.length)],
    traits, skills, leader,
    hunger: 15 + rng() * 20, energy: 75 + rng() * 20, health: 100, fear: 0,
    carry: null, carryCap: 5, state: "idle", workTimer: 0, target: null,
    sick: false, rethinkAt: 0, stuckAt: 0, lastX: x, lastZ: z, personalFocus: null,
    assignedJob: null, delegated: false,
  };
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
  return state._rng() < clamp(p, 0, 0.5);
}

// Leader delegation: the leader looks at what the village needs and
// assigns a job to each villager. Delegation is a strong nudge, not an
// order — a villager can still refuse it (see think()). The god never
// assigns jobs; only the leader does, and only the leader is advised by
// the council/Ollama layer.
export function delegateRoles(state) {
  const villagers = state.villagers;
  if (!villagers.length) return;
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const pop = villagers.length;
  const hutCount = state.buildings.filter((b) => b.type === "hut").length;
  const desired = {
    farmer: clamp(Math.ceil(pop / 3), 1, 4),
    fisher: edible < 25 ? 1 : 0,
    hunter: edible < 25 ? 1 : 0,
    woodcutter: (s.wood < 25 || state.buildQueue.length) ? 2 : 1,
    miner: (s.stone < 20 || s.ore < 4 || state.buildQueue.length) ? 2 : 1,
    // Anticipate building: a builder is delegated from day 2 while the
    // village still has only its founding hut, so building starts early.
    builder: state.buildQueue.length ? Math.min(2, pop) : (state.day >= 2 && hutCount < 2 ? 1 : 0),
    hauler: pop >= 8 ? 1 : 0,
  };
  const order = ["farmer", "fisher", "hunter", "woodcutter", "miner", "builder", "hauler"];
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
  if (job === "farmer") { score += deficit(s.food + s.fish + s.meat, 40) * 0.35; if (state.elapsed < state.effects.droughtUntil) score -= 8; }
  if (job === "woodcutter") score += deficit(s.wood, 30) * 0.4 + (state.buildQueue.length ? 2 : 0);
  if (job === "fisher") score += deficit(s.food + s.fish + s.meat, 40) * 0.25;
  if (job === "hunter") score += deficit(s.food + s.fish + s.meat, 40) * 0.22;
  if (job === "miner") score += deficit(s.stone, 24) * 0.25 + deficit(s.ore, 6) * 0.3;
  if (job === "builder") score += state.buildQueue.length ? 8 : -4;
  if (job === "hauler") score += v.carry ? 7 : 1.5;
  if (v.assignedJob === job) score += 12; // leader delegation: strong nudge, still refuseable
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

// --- one villager's think + act ---

function think(state, grid, v) {
  const cx = state._cx, cz = state._cz;
  // Urgent needs override jobs, exactly as in the Luanti brain.
  if (v.fear >= 50 || (state.elapsed < state.effects.floodUntil && Math.hypot(v.x - cx, v.z - cz) < 14)) {
    v.state = "flee"; setTarget(state, grid, v, cx + (v.x > cx ? 6 : -6), cz + (v.z > cz ? 6 : -6)); return;
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
  if (v.energy <= 18 || v.sick) { v.state = "rest"; setTarget(state, grid, v, cx - 2, cz - 3); return; }
  if (v.carry && v.carry.amt >= v.carryCap) { v.state = "haul"; setTarget(state, grid, v, cx, cz); return; }

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
      if (state._rng() < 0.2) log(state, v.name + " ignores the leader's delegation and works as a " + job + " instead.");
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
  } else if (job === "hauler") {
    // Haulers shuttle: go to the nearest productive cell, fill up, deposit.
    const ripe = nearestCell(grid, v.x, v.z, (c) => c.farm && c.crop === 3);
    const node = nearestCell(grid, v.x, v.z, (c) => c.stone > 0);
    const t = ripe || node;
    if (t) setTarget(state, grid, v, t[0], t[1]); else v.state = "idle";
  }
}

function doWork(state, grid, v, dt) {
  const [tx, tz] = v.target || [];
  const cell = tx != null ? grid[tx][tz] : null;
  v.workTimer += dt;
  const need = v.job === "builder" ? 2.5 : v.job === "fisher" ? 3.0 : 1.6;
  if (v.workTimer < need) return;
  v.workTimer = 0;
  const addCarry = (type, amt = 1) => {
    if (!v.carry) v.carry = { type, amt: 0 };
    if (v.carry.type !== type) return;
    v.carry.amt = Math.min(v.carryCap, v.carry.amt + amt);
  };
  if (v.job === "farmer" && cell && cell.farm) {
    if (cell.crop === 3) { cell.crop = 0; cell.cropGrow = 0; addCarry("food", 2); }
    else if (state.elapsed >= state.effects.droughtUntil) { cell.crop = Math.min(3, cell.crop + 1); }
  } else if (v.job === "woodcutter" && cell && cell.tree) {
    cell.tree = false; cell.blocked = false; addCarry("wood", 2);
  } else if ((v.job === "miner" || v.job === "hauler") && cell && (cell.stone > 0 || cell.ore > 0)) {
    if (cell.ore > 0 && state._rng() < 0.35) { cell.ore--; addCarry("ore"); }
    else if (cell.stone > 0) { cell.stone--; addCarry("stone"); if (cell.stone <= 0 && cell.ore <= 0) cell.blocked = false; }
    else addCarry("wood"); // hauler fallback at a spent node: gather firewood nearby
    if (v.job === "hauler" && !cell.stone && !cell.ore) addCarry("wood");
  } else if (v.job === "fisher") {
    addCarry("fish");
  } else if (v.job === "hunter") {
    const deer = state.deer.find((d) => Math.hypot(d.x - v.x, d.z - v.z) < 2.2);
    if (deer) {
      state.deer = state.deer.filter((d) => d !== deer);
      addCarry("meat", 3);
      log(state, v.name + " brings down a deer.");
    }
  } else if (v.job === "builder") {
    const q = state.buildQueue[0];
    if (q) {
      q.progress += 1;
      const needProgress = q.type === "granary" ? 8 : q.type === "marker" ? 3 : 6;
      if (q.progress >= needProgress) {
        state.buildQueue.shift();
        if (state.stockpile.wood >= q.needWood && state.stockpile.stone >= q.needStone) {
          state.stockpile.wood -= q.needWood; state.stockpile.stone -= q.needStone;
          const type = q.type || "hut";
          state.buildings.push({ type, x: q.x, z: q.z, done: true });
          grid[q.x][q.z].building = type;
          if (type === "hut") {
            grid[q.x][q.z].blocked = true;
            state.populationCap += 4;
            log(state, "A new hut rises. The village can hold " + state.populationCap + " souls.");
          } else if (type === "granary") {
            grid[q.x][q.z].blocked = true;
            log(state, "A granary stands. Stored food will keep far longer now.");
          } else if (type === "marker") {
            state.faith = clamp(state.faith + 2, 0, 100);
            log(state, "A boundary marker is raised. The village knows its ground.");
          }
        } else {
          log(state, "The " + (q.type || "hut") + " frame stands unfinished: not enough wood and stone in the stockpile.");
          grid[q.x][q.z].building = null; grid[q.x][q.z].blocked = false;
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
function findBuildSpot(state, grid, minR, maxR) {
  const cx = state._cx, cz = state._cz;
  for (let r = minR; r <= maxR; r++) for (let a = 0; a < 8; a++) {
    const x = Math.round(cx + Math.cos(a * Math.PI / 4) * r), z = Math.round(cz + Math.sin(a * Math.PI / 4) * r);
    if (inBounds(x, z) && !grid[x][z].blocked && !grid[x][z].water && !grid[x][z].farm && !grid[x][z].building && !grid[x][z].tree) return [x, z];
  }
  return null;
}

function paveRoads(state, grid) {
  const huts = state.buildings.filter((b) => b.type === "hut");
  if (!huts.length) return;
  const cx = state._cx, cz = state._cz;
  // Pave toward the hut or farm plot whose path has the fewest road cells yet.
  const targets = [...huts];
  if (state._farmCells.length) targets.push({ x: state._farmCells[0][0], z: state._farmCells[0][1] });
  let bestPath = null, bestRoads = Infinity;
  for (const t of targets) {
    const path = findPath(grid, cx, cz, t.x, t.z);
    if (!path) continue;
    const roads = path.filter(([x, z]) => grid[x][z].road).length;
    if (roads < bestRoads) { bestRoads = roads; bestPath = path; }
  }
  if (!bestPath) return;
  let paved = 0;
  for (const [x, z] of bestPath) {
    if (paved >= 4) break;
    const c = grid[x][z];
    if (c.road || c.building || c.water || c.farm) continue;
    c.road = true;
    if (c.tree) { c.tree = false; c.blocked = false; }
    paved++;
  }
  if (paved) log(state, "Villagers lay a dirt road toward the huts.");
}

export function expandVillage(state, grid) {
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  const hasGranary = state.buildings.some((b) => b.type === "granary");
  const granaryQueued = state.buildQueue.some((q) => q.type === "granary");
  const markers = state.buildings.filter((b) => b.type === "marker").length + state.buildQueue.filter((q) => q.type === "marker").length;
  const hutTotal = state.buildings.filter((b) => b.type === "hut").length + state.buildQueue.filter((q) => q.type === "hut").length;
  // Huts: crowded OR proactive — a second hut is started from day 2 so
  // the village visibly grows before it is crowded. Without this the old
  // crowding-only rule deadlocked: no surplus, no births, no building.
  const hutDemand = state.villagers.length >= state.populationCap - 2 || (state.day >= 2 && hutTotal < 2);
  if (hutDemand && state.buildQueue.length < 2 && s.wood >= 12 && s.stone >= 6) {
    const spot = findHutSpot(state, grid);
    if (spot) {
      state.buildQueue.push({ type: "hut", x: spot[0], z: spot[1], progress: 0, needWood: 12, needStone: 6 });
      log(state, "Crowded, the builders start a new hut on their own.");
    }
  }
  if (!hasGranary && !granaryQueued && (edible >= 25 || state.day >= 4) && state.buildQueue.length < 2 && s.wood >= 20 && s.stone >= 10) {
    const spot = findBuildSpot(state, grid, 3, 7);
    if (spot) {
      state.buildQueue.push({ type: "granary", x: spot[0], z: spot[1], progress: 0, needWood: 20, needStone: 10 });
      log(state, "With food to spare, the builders start a granary.");
    }
  }
  if (state.villagers.length >= 6 && markers < 4 && state.buildQueue.length < 2 && s.wood >= 2) {
    const cx = state._cx, cz = state._cz;
    const corners = [[cx - 6, cz - 6], [cx + 6, cz - 6], [cx - 6, cz + 6], [cx + 6, cz + 6]];
    const spot = corners.find(([x, z]) => inBounds(x, z) && !grid[x][z].blocked && !grid[x][z].water && !grid[x][z].farm && !grid[x][z].building && !grid[x][z].tree);
    if (spot) {
      state.buildQueue.push({ type: "marker", x: spot[0], z: spot[1], progress: 0, needWood: 2, needStone: 0 });
      log(state, "The villagers raise a boundary marker.");
    }
  }
  paveRoads(state, grid);
  if (edible < 20 && state._farmCells.length < 30) {
    const cx = state._cx, cz = state._cz;
    let spot = null;
    outer: for (const [fx, fz] of state._farmCells) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = fx + dx, z = fz + dz;
        if (!inBounds(x, z)) continue;
        const c = grid[x][z];
        if (c.water || c.blocked || c.tree || c.farm || c.building) continue;
        if (Math.hypot(x - cx, z - cz) > 14) continue;
        spot = [x, z]; break outer;
      }
    }
    if (spot) {
      const c = grid[spot[0]][spot[1]];
      c.farm = true; c.crop = 0; c.cropGrow = 0;
      state._farmCells.push(spot);
      log(state, "The farmers clear new ground for crops.");
    }
  }
}

export function step(state, grid, dt) {
  if (state.paused) return;
  state.elapsed += dt;
  if (state.elapsed >= state.expandAt) { state.expandAt = state.elapsed + 20; expandVillage(state, grid); }
  if (state.elapsed >= state.delegateAt) { state.delegateAt = state.elapsed + 15; delegateRoles(state); }
  if (state.elapsed >= (state.treeAt || 60)) {
    state.treeAt = state.elapsed + 30;
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(state._rng() * SIZE), z = Math.floor(state._rng() * SIZE);
      const c = grid[x][z];
      if (!c.water && !c.blocked && !c.tree && !c.farm && !c.building && c.stone <= 0 && Math.hypot(x - state._cx, z - state._cz) > 8) { c.tree = true; c.blocked = true; }
    }
  }
  state.time += dt / DAY_LENGTH;
  if (state.time >= 1) {
    state.time -= 1; state.day += 1;
    // Dawn: surplus food spoils in the open air unless a granary holds it.
    // A granary doubles the kept surplus and lowers the birth threshold.
    const hasGranary = state.buildings.some((b) => b.type === "granary");
    const keepCap = hasGranary ? 120 : 60;
    const birthNeed = hasGranary ? 10 : 14;
    const s = state.stockpile;
    let edible = s.food + s.fish + s.meat;
    if (edible > keepCap) {
      let over = edible - keepCap;
      for (const k of ["food", "fish", "meat"]) { const take = Math.min(s[k], over); s[k] -= take; over -= take; if (!over) break; }
      if (!hasGranary && edible - keepCap >= 5) log(state, "Surplus food spoils in the open air. A granary would keep it.");
      edible = keepCap;
    }
    // Population growth if there is surplus food and room.
    if (edible >= birthNeed && state.villagers.length < state.populationCap) {
      const v = makeVillager(state, state._cx + 1, state._cz + 1);
      state.villagers.push(v); state.stats.births++;
      log(state, v.name + " joins the village. The people endure.");
    }
    // Deer top-up, as in world.lua.
    while (state.deer.length < 4) state.deer.push(makeDeer(state, state._cx + 8, state._cz + 8));
    if (state.elapsed >= state.effects.droughtUntil && state.effects.droughtUntil > 0) log(state, "The drought breaks. Rain returns to the fields.");
    state.effects.droughtUntil = Math.min(state.effects.droughtUntil, state.elapsed);
  }

  // Crops grow.
  if (state.elapsed >= state.effects.droughtUntil) {
    for (const [x, z] of state._farmCells) {
      const c = grid[x][z];
      if (c.crop >= 0 && c.crop < 3) { c.cropGrow += dt; if (c.cropGrow > 28) { c.cropGrow = 0; c.crop++; } }
    }
  }
  // Stone slowly weathers back.
  if (Math.floor(state.elapsed) % 30 === 0 && state._rng() < 0.02) {
    const [x, z] = state._stoneSpots[Math.floor(state._rng() * state._stoneSpots.length)];
    if (grid[x][z].stone < 8) { grid[x][z].stone++; grid[x][z].blocked = true; }
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
  for (const v of [...state.villagers]) {
    v.hunger = clamp(v.hunger + dt * 0.38, 0, 100);
    if (v.state === "rest") v.energy = clamp(v.energy + dt * 6, 0, 100);
    else v.energy = clamp(v.energy - dt * 0.4, 0, 100);
    if (v.sick) { v.hunger = clamp(v.hunger + dt * 0.4, 0, 100); v.health = clamp(v.health - dt * 0.8, 0, 100); }
    if (v.hunger >= 100) v.health = clamp(v.health - dt * 1.2, 0, 100);
    if (state.elapsed >= state.effects.plagueUntil && v.sick) v.sick = false;
    v.fear = clamp(v.fear - dt * 3, 0, 100);
    if (v.health <= 0) {
      const wasLeader = v.leader;
      state.villagers = state.villagers.filter((o) => o !== v);
      state.faith = clamp(state.faith - 3, 0, 100); state.stats.deaths++;
      log(state, v.name + " dies. Faith falls.");
      if (wasLeader && state.villagers.length) {
        state.villagers[0].leader = true;
        log(state, state.villagers[0].name + " takes up the leader's staff.");
      }
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
      else { const onRoad = grid[clamp(Math.round(v.x), 0, SIZE - 1)][clamp(Math.round(v.z), 0, SIZE - 1)].road; const sp = (v.state === "flee" ? 3.4 : 2.2) * (onRoad ? 1.35 : 1) * dt; v.x += (dx / dist) * Math.min(sp, dist); v.z += (dz / dist) * Math.min(sp, dist); moving = true; }
    } else if (v.target) {
      const dx = v.target[0] + 0.5 - v.x, dz = v.target[1] + 0.5 - v.z, dist = Math.hypot(dx, dz);
      // Don't walk into a blocked target cell: stop at working distance.
      const stopAt = grid[v.target[0]][v.target[1]].blocked ? 1.0 : 0.4;
      if (dist > stopAt) {
        const cell = grid[clamp(Math.round(v.x), 0, SIZE - 1)][clamp(Math.round(v.z), 0, SIZE - 1)];
        void cell;
        const sp = (v.job === "hunter" && v.state === "work" ? 3.0 : 2.2) * dt; v.x += (dx / dist) * Math.min(sp, dist - stopAt + 0.05); v.z += (dz / dist) * Math.min(sp, dist - stopAt + 0.05); moving = true;
      }
    }
    v._moving = moving;
    // Arrived?
    if (v.target && Math.hypot(v.target[0] + 0.5 - v.x, v.target[1] + 0.5 - v.z) < 1.1 && !(v.path && v.path.length)) {
      if (v.state === "eat") {
        const s = state.stockpile;
        if (s.food > 0) s.food--; else if (s.fish > 0) s.fish--; else if (s.meat > 0) s.meat--;
        else if (v.target && grid[v.target[0]][v.target[1]].farm && grid[v.target[0]][v.target[1]].crop === 3) { grid[v.target[0]][v.target[1]].crop = 0; }
        v.hunger = clamp(v.hunger - 45, 0, 100);
        v.state = "idle"; v.target = null; v.rethinkAt = state.elapsed + 1;
      } else if (v.state === "haul") {
        if (v.carry) { state.stockpile[v.carry.type] = (state.stockpile[v.carry.type] || 0) + v.carry.amt; v.carry = null; }
        v.state = "idle"; v.target = null; v.rethinkAt = state.elapsed + 0.5;
      } else if (v.state === "work") {
        doWork(state, grid, v, dt * 3); // work ticks faster once in place
      } else if (v.state === "rest") {
        v.energy = clamp(v.energy + dt * 4, 0, 100);
        if (v.energy > 80 && !v.sick) { v.state = "idle"; v.target = null; }
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
      state.stockpile.food += 10; state.faith = clamp(state.faith + 5, 0, 100); state.stats.blessings++;
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
      if (state.stockpile.wood < 12 || state.stockpile.stone < 6) return { ok: false, reason: "Need 12 wood and 6 stone in the stockpile first." };
      state.buildQueue.push({ type: "hut", x: spot[0], z: spot[1], progress: 0, needWood: 12, needStone: 6 });
      log(state, "You order a hut. A builder will take it up, if they choose."); setCd(10); break;
    }
    case "villager":
      if (state.villagers.length >= state.populationCap) return { ok: false, reason: "The village is full. Builders raise a hut on their own once they have wood and stone." };
      if (state.faith < 20) return { ok: false, reason: "Faith too low. The people will not follow a stranger in." };
      state.villagers.push(makeVillager(state, state._cx + 1, state._cz + 1));
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
  const cx = state._cx, cz = state._cz;
  const candidates = [];
  for (let r = 4; r <= 10; r++) for (let a = 0; a < 8; a++) {
    const x = Math.round(cx + Math.cos(a * Math.PI / 4) * r), z = Math.round(cz + Math.sin(a * Math.PI / 4) * r);
    if (inBounds(x, z) && !grid[x][z].blocked && !grid[x][z].water && !grid[x][z].farm && !grid[x][z].building) candidates.push([x, z]);
  }
  return candidates[0] || null;
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
  const { _rng, _farmCells, _stoneSpots, _fire, _quake, ...rest } = state;
  void _rng; void _farmCells; void _stoneSpots;
  return JSON.stringify({ ...rest, crops, stones, buildings, roads, fire: _fire || null, quake: _quake || null });
}

export function deserialize(json) {
  const data = JSON.parse(json);
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
  for (const v of state.villagers) {
    for (const j of JOBS) if (v.skills[j] == null) v.skills[j] = 1;
    if (v.assignedJob == null) v.assignedJob = null;
    if (v.delegated == null) v.delegated = false;
  }
  state._rng = mulberry32((data.seed ^ 0x9e3779b9) + Math.floor(state.elapsed * 1000));
  for (const [x, z, crop, grow] of savedCrops) { grid[x][z].farm = true; grid[x][z].crop = crop; grid[x][z].cropGrow = grow; }
  for (const [x, z] of savedRoads) grid[x][z].road = true;
  // Rebuild the farm list from the grid so farms cleared by expansion
  // before the save keep growing after load.
  state._farmCells = [];
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (grid[x][z].farm) state._farmCells.push([x, z]);
  for (const [x, z, stone, ore, blocked] of savedStones) { grid[x][z].stone = stone; grid[x][z].ore = ore; grid[x][z].blocked = !!blocked; }
  for (const [x, z, type] of savedBuildings) grid[x][z].building = type;
  state._fire = savedFire || null; state._quake = savedQuake || null;
  return { state, grid };
}
