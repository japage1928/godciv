// GodCiv sim combat: raids, disasters, guards, neighbor-village
// life, caravans, war parties, and diplomacy-intent validation.
import { leader } from "./actions.js";
import { ALLIANCE_CAPACITY_BONUS, ALLIANCE_MIN_RELATION, ALLIANCE_OFFER_DAWNS, ALLIED_GUARDS, ALLIED_GUARD_MIN_POP, CARAVAN_BAND_BONUS, CARAVAN_CAPACITY, CARAVAN_PATH_STEPS, CHILD_DAYS, CHUNK, DEACTIVATE_AFTER_DAYS, DISASTER_MAX_FRACTION, GUARD_DAMAGE_BASE, OLD_SIZE, PRICES, RAID_SIZE_CAP, SIZE, TECH_TIERS, TOWER_RANGE, WAR_BORDER_INCIDENT_CHANCE, WAR_COOLDOWN_DAYS, WAR_EXHAUSTION_PEACE, WAR_KILL_RELATION, WAR_LOOT_CAP, WAR_LOOT_INTERVAL, WAR_LOOT_TICK, WAR_MIN_RELATION, WAR_PARTY_MAX, WAR_PARTY_MIN, WAR_PARTY_MIN_POP, WAR_RETREAT_FRACTION, WAR_RIVALRY, WAR_WHITE_PEACE_DAYS, assignHomes, clamp, eraStageOf, inBounds, isStudent, key, log, makeVillager, ownBuildings, ownVillagers, phaseOf, stockpileFor, techThresholdFor } from "./core.js";
import { adjustRelation, allianceCooldownOk, allied, breakAlliance, formAlliance, getRelation, removeVillager, seasonKey, setRelation, villageName, villagePop, villageRecord, villageRng } from "./diplomacy.js";
import { cellAt, chunkOf, findPath, generateCorridor, getChunk, noteMutation, peekCell, setTarget } from "./grid.js";
import { WALL_RING_R } from "./planning.js";

// --- war: rivalry, declaration, parties, exhaustion, peace ---

export function warWith(state, a, b) {
  return (state.wars || []).find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)) || null;
}

export function truceUntil(state, a, b) {
  return (state.truces || {})[pairKey(a, b)] || 0;
}

function warHomeCenter(state, id) {
  if (id === 0) return [state._cx, state._cz];
  const rec = villageRecord(state, id);
  return rec ? rec.center : [state._cx, state._cz];
}

export function partyFighters(state, partyId) {
  return state.villagers.filter((v) => v.warParty === partyId);
}

// The nearest villager of the target village to a point: what a war
// fighter chases. Fighters never chase their own village's people.
function nearestEnemyVillager(state, x, z, maxD, targetVillage) {
  let best = null, bestD = maxD;
  for (const v of state.villagers) {
    if ((v.village ?? 0) !== targetVillage || v.health <= 0) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

// The nearest flagged fighter NOT of the given village: what makes
// defenders flee and guards hold. A village's own fighters never
// spook its own people.
export function nearestEnemyFighter(state, x, z, maxD, ownVillage) {
  let best = null, bestD = maxD;
  for (const v of state.villagers) {
    if (!v.warParty || (v.village ?? 0) === ownVillage || v.health <= 0) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

// Declare war between two villages: the record, the log line, and
// the marching party. Betrayal (declaring on a current ally) breaks
// the alliance and sets relations to -40: the betrayal itself is
// the act. The dawn leader decision never calls this on an ally —
// the gate requires -70, and an alliance breaks under 20 first —
// so the betrayal branch is leader-intent territory, built and
// tested at the unit level, never auto-fired. The god never calls
// this: applyGod refuses declare_war outright.
export function declareWar(state, grid, a, b) {
  if (allied(state, a, b)) {
    breakAlliance(state, a, b, "betrayal", WAR_COOLDOWN_DAYS);
    setRelation(state, a, b, WAR_RIVALRY);
    log(state, villageName(state, a) + " betrays " + villageName(state, b) + "! The alliance is broken.");
  }
  state.wars.push({ a, b, sinceDay: state.day, exhaustion: 0, lastBattleDay: state.day, peaceOffer: null, offerCount: 0 });
  log(state, villageName(state, a) + " declares war on " + villageName(state, b) + ".");
  spawnWarParty(state, grid, a, b);
  return warWith(state, a, b);
}

// A war party is 3-6 flagged villagers of the declaring village,
// picked guards-first, who march on the target. The fighters stay
// real villagers: their deaths cost the home village people through
// the existing removeVillager path, and their flags survive saves.
export function spawnWarParty(state, grid, from, to) {
  const fromRec = villageRecord(state, from);
  if (fromRec) touchVillage(state, grid, fromRec);
  const pop = from === 0 ? ownVillagers(state).length : villagePop(state, fromRec);
  const n = clamp(2 + Math.floor(pop / 10), WAR_PARTY_MIN, WAR_PARTY_MAX);
  const [hx, hz] = warHomeCenter(state, from);
  const [tx, tz] = warHomeCenter(state, to);
  generateCorridor(grid, hx, hz, tx, tz);
  const able = state.villagers
    .filter((v) => (v.village ?? 0) === from && !v.warParty && !v.reinforcement && (v.ageDays ?? 25) >= CHILD_DAYS && v.health > 0)
    .sort((a, b) => ((b.job === "guard") - (a.job === "guard")) || (a.id - b.id));
  const picked = able.slice(0, n);
  if (!picked.length) {
    log(state, villageName(state, from) + " cannot muster a war party.");
    return null;
  }
  const party = { id: state.nextWarPartyId++, from, to, size: picked.length, loot: {}, load: 0, retreating: false, _lootAt: 0 };
  state.warParties.push(party);
  for (const v of picked) {
    v.warParty = party.id;
    v._homeJob = v.job;
    v.state = "idle";
    setTarget(state, grid, v, tx, tz);
  }
  log(state, "A war party of " + picked.length + " marches from " + villageName(state, from) + " against " + villageName(state, to) + ".");
  return party;
}

// Stand a party down: flags clear, jobs restore, fighters walk home
// through the ordinary villager logic. Used on arrival home laden,
// on peace, and on white peace.
export function standDownParty(state, grid, party) {
  for (const v of partyFighters(state, party.id)) {
    v.warParty = null;
    v._chase = false;
    v._foe = null;
    v.job = v._homeJob || v.job;
    v._homeJob = null;
    v.target = null; v.path = null; v.state = "idle";
    const [hx, hz] = warHomeCenter(state, party.from);
    setTarget(state, grid, v, hx, hz);
  }
  state.warParties = (state.warParties || []).filter((p) => p !== party);
}

// End a war: the record goes, relations settle at -10, and a
// 30-day truce blocks the next declaration. Parties stand down.
export function endWar(state, grid, war, kind) {
  state.wars = (state.wars || []).filter((w) => w !== war);
  for (const p of [...(state.warParties || [])]) {
    if ((p.from === war.a && p.to === war.b) || (p.from === war.b && p.to === war.a)) standDownParty(state, grid, p);
  }
  setRelation(state, war.a, war.b, -10);
  state.truces[pairKey(war.a, war.b)] = state.day + WAR_COOLDOWN_DAYS;
  if (kind === "white") log(state, "After thirty quiet days, the war between " + villageName(state, war.a) + " and " + villageName(state, war.b) + " ends in white peace. Relations settle at -10.");
  else log(state, villageName(state, war.a) + " and " + villageName(state, war.b) + " make peace. The war is over. Relations settle at -10.");
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
export function damageBuildings(state, grid, targets, dmg, maxCollapse, verb) {
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
export function disasterKill(state, candidates, cause, cap) {
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
  const live = state.villagers.filter((v) => v.village === rec.id && !v.reinforcement && !v.warParty);
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
  // Retarget at most every 3s — and slower after a failed search.
  // A failed search used to retry EVERY step (the no-path/no-direct
  // bypass): on a village with no walls to batter, the search burns
  // its whole 4000-step budget failing (~4ms) on every step per
  // raider until the frontier chunks generate. Waiting lets the
  // generation queue (one chunk per tick) open the route before
  // the next attempt; a fresh raider still searches at once
  // (retargetAt starts at 0), and the raid always resolves via
  // raidUntil even if a route never opens.
  if (r.retargetAt == null || state.elapsed >= r.retargetAt) {
    r.retargetAt = state.elapsed + 3;
    const path = findPath(grid, Math.round(r.x), Math.round(r.z), clamp(Math.round(tx), 0, SIZE - 1), clamp(Math.round(tz), 0, SIZE - 1), 4000);
    if (path && path.length) { r.path = path; r.direct = null; }
    else {
      r.path = null; r.direct = nearestWallCell(state, r);
      if (!r.direct) r.retargetAt = state.elapsed + 6;
    }
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

export function stepForeignVillager(state, grid, v, dt) {
  const rec = villageRecord(state, v.village);
  const [cx, cz] = rec ? rec.center : [state._cx, state._cz];
  const phase = phaseOf(state.time);
  // War fighters march and fight under the war step, never the
  // civilian arms below: no fleeing, no milling about.
  if (v.warParty) { stepWarFighter(state, grid, v, dt); return; }
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
    // An enemy war fighter does the same: armies spook civilians.
    if ((state.raiders.length || (state.warParties || []).length) && v.state !== "flee"
      && (nearestRaider(state, v.x, v.z, 5) || nearestEnemyFighter(state, v.x, v.z, 5, v.village))) {
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
    // caravan in flight to or from the village, no raiders within
    // 20 cells of its center, no deployed reinforcements homed
    // here, and no war party homed here or marching on it.
    if (rec.active && state.day - (rec.lastTriggerDay || 0) >= DEACTIVATE_AFTER_DAYS) {
      const busy = (state.caravans || []).some((c) => c.from === rec.id || c.to === rec.id);
      const raidersNear = (state.raiders || []).some((r) => Math.hypot(r.x - rec.center[0], r.z - rec.center[1]) < 20);
      const deployed = state.villagers.some((v) => v.village === rec.id && v.reinforcement);
      const atWarHere = state.villagers.some((v) => v.warParty && (v.village === rec.id
        || (state.warParties || []).some((p) => p.id === v.warParty && p.to === rec.id)));
      if (!busy && !raidersNear && !deployed && !atWarHere) deactivateVillage(state, grid, rec);
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

export function pairKey(a, b) { return Math.min(a, b) + "-" + Math.max(a, b); }

// Generate every chunk the straight line between two points
// crosses, plus its neighbors, so a caravan's pathfinding sees
// real terrain instead of the ungenerated void (which reads as
// blocked) and has room to route around lakes.
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

// --- war parties: march, fight, loot, retreat ---

// One flagged fighter's step: chase the nearest enemy villager
// within 12 cells, else march on the target center; retreating
// parties walk home. Hunger and work never touch a fighter: the
// war is their job until they stand down. Movement mirrors the
// foreign-villager step (path-following, then direct), so a
// fighter never walks into a blocked cell and stalls.
export function stepWarFighter(state, grid, v, dt) {
  const party = (state.warParties || []).find((p) => p.id === v.warParty);
  if (!party) { v.warParty = null; return; }
  const [hx, hz] = warHomeCenter(state, party.from);
  const [tx, tz] = warHomeCenter(state, party.to);
  if (party.retreating) {
    v._chase = false;
    v._foe = null;
    if (!v.target && state.elapsed >= v.rethinkAt) {
      v.rethinkAt = state.elapsed + 2 + villageRng(state)() * 2;
      setTarget(state, grid, v, hx, hz);
    }
  } else if (state.elapsed >= v.rethinkAt) {
    // A fighter commits to one foe until the foe falls or escapes
    // beyond reach: switching to the nearest body every rethink
    // zigzagged between fleeing defenders and killed no one.
    v.rethinkAt = state.elapsed + 2 + villageRng(state)() * 2;
    let foe = state.villagers.find((o) => o.id === v._foe);
    if (foe && (foe.health <= 0 || (foe.village ?? 0) !== party.to)) { foe = null; v._foe = null; }
    if (foe && Math.hypot(foe.x - v.x, foe.z - v.z) > 12) { foe = null; v._foe = null; }
    if (!foe) {
      foe = nearestEnemyVillager(state, v.x, v.z, 12, party.to);
      if (foe) v._foe = foe.id;
    }
    if (foe) {
      v._chase = true;
      setTarget(state, grid, v, Math.round(foe.x), Math.round(foe.z));
      // Chase direct, like a hunter on a deer: a path recomputed
      // every few seconds through village clutter loses a straight
      // fleeing line every time. The march itself keeps its path.
      v.path = null;
    }
    else { v._chase = false; setTarget(state, grid, v, tx, tz); }
  }
  // A fighter closing on an enemy runs the foe down: flee speed
  // is 3.4, and equal speeds plus a head start meant a straight
  // fleeing line was never caught — wars came out bloodless. The
  // march itself stays slow.
  const chaseSpeed = v._chase ? 4.2 : 2.2;
  if (v.path && v.path.length) {
    const [px, pz] = v.path[0];
    const dx = px + 0.5 - v.x, dz = pz + 0.5 - v.z, dist = Math.hypot(dx, dz);
    if (dist < 0.25) v.path.shift();
    else {
      const wkind = state.weather ? state.weather.kind : "clear";
      const moveFactor = wkind === "snow" ? 0.85 : wkind === "storm" ? 0.9 : 1;
      const sp = chaseSpeed * moveFactor * dt;
      v.x += (dx / dist) * Math.min(sp, dist); v.z += (dz / dist) * Math.min(sp, dist);
    }
  } else if (v.target) {
    const dx = v.target[0] + 0.5 - v.x, dz = v.target[1] + 0.5 - v.z, dist = Math.hypot(dx, dz);
    const tc = peekCell(grid, v.target[0], v.target[1]);
    if (dist < 1.1 || !tc || tc.blocked) { v.target = null; v.path = null; v.state = "idle"; }
    else { const sp = chaseSpeed * dt; v.x += (dx / dist) * Math.min(sp, dist); v.z += (dz / dist) * Math.min(sp, dist); }
  }
  v._moving = !!(v.path && v.path.length) || !!v.target;
}

// War combat: fighters grind the nearest enemy villager in reach
// with continuous contact damage, the way raiders slay villagers
// (brief contact wounds, sustained contact kills); defending
// guards answer with their once-a-second strikes. Every death
// costs exhaustion +2 on the war; a kill by a war party costs the
// pair -8 relations. Deaths go through removeVillager, so they are
// named, counted, and cost the home village people exactly like
// any other death.
export function stepWarCombat(state, grid, dt) {
  if (!(state.warParties || []).length) return;
  for (const party of [...state.warParties]) {
    const war = warWith(state, party.from, party.to);
    if (!war) continue;
    for (const v of partyFighters(state, party.id)) {
      if (v.health <= 0) continue;
      const enemy = nearestEnemyVillager(state, v.x, v.z, 1.3, party.to);
      if (!enemy) continue;
      enemy.health -= (6 + 2 * (v.tool || 0)) * dt;
      enemy.fear = 85;
      if (enemy.health <= 0) {
        const ename = enemy.name, ehome = villageName(state, party.to);
        removeVillager(state, enemy, "slain in the war");
        war.exhaustion += 2;
        war.lastBattleDay = state.day;
        adjustRelation(state, party.from, party.to, WAR_KILL_RELATION);
        log(state, "The war claims " + ename + " of " + ehome + " (" + WAR_KILL_RELATION + " relations).");
      }
    }
  }
  // Defending guards strike back: once per second, any guard of a
  // village under attack hits the nearest fighter within reach.
  // One pass after the party loop: a gate inside it would let the
  // first party's guards strike and starve the second party's.
  if (state.elapsed >= (state._warGuardAt || 0)) {
    state._warGuardAt = state.elapsed + 1;
    for (const g of state.villagers) {
      if (g.job !== "guard" || g.health <= 0 || g.warParty) continue;
      let best = null, bestD = 1.3, bestWar = null;
      for (const party of state.warParties) {
        if (party.to !== (g.village ?? 0)) continue;
        for (const f of partyFighters(state, party.id)) {
          const d = Math.hypot(f.x - g.x, f.z - g.z);
          if (d < bestD) { bestD = d; best = f; bestWar = warWith(state, party.from, party.to); }
        }
      }
      if (!best) continue;
      best.health -= GUARD_DAMAGE_BASE + (g.tool || 0);
      if (best.health <= 0) {
        removeVillager(state, best, "slain defending the village");
        if (bestWar) { bestWar.exhaustion += 2; bestWar.lastBattleDay = state.day; }
      }
    }
  }
}

// Party-level stepping: arrival at the target wakes it, loot claims
// tick while fighters stand on enemy ground, bloodied or laden
// parties retreat, and a party that walks home alive banks its
// loot. Goods leave the defender's stockpile ONLY on arrival home:
// a claim is a promise until the party gets back with it.
export function stepWarParties(state, grid, dt) {
  for (const party of [...(state.warParties || [])]) {
    const living = partyFighters(state, party.id);
    if (!living.length) {
      state.warParties = state.warParties.filter((p) => p !== party);
      log(state, "The war party of " + villageName(state, party.from) + " is destroyed. Its loot is lost.");
      continue;
    }
    const [hx, hz] = warHomeCenter(state, party.from);
    const [tx, tz] = warHomeCenter(state, party.to);
    if (!party.retreating) {
      if (living.length <= Math.max(1, Math.ceil(party.size * WAR_RETREAT_FRACTION)) && living.length < party.size) {
        party.retreating = true;
        log(state, villageName(state, party.from) + "'s war party falls back, bloodied.");
      } else {
        const onGround = living.some((f) => Math.hypot(f.x - tx, f.z - tz) < 20);
        if (onGround) {
          const rec = villageRecord(state, party.to);
          if (rec) touchVillage(state, grid, rec);
          if (state.elapsed >= (party._lootAt || 0)) {
            party._lootAt = state.elapsed + WAR_LOOT_INTERVAL;
            if (party.load < WAR_LOOT_CAP) {
              const pile = stockpileFor(state, party.to);
              const best = Object.keys(PRICES).map((g) => [g, pile[g] || 0]).sort((a, b) => b[1] - a[1])[0];
              if (best && best[1] > 0) {
                const take = Math.min(WAR_LOOT_TICK, WAR_LOOT_CAP - party.load, best[1]);
                party.loot[best[0]] = (party.loot[best[0]] || 0) + take;
                party.load += take;
                if (party.load >= WAR_LOOT_CAP) {
                  party.retreating = true;
                  log(state, villageName(state, party.from) + "'s war party turns home laden with loot.");
                }
              }
            }
          }
        }
      }
    }
    if (party.retreating) {
      const home = living.every((f) => Math.hypot(f.x - (hx + 0.5), f.z - (hz + 0.5)) < 4);
      if (home) {
        const defPile = stockpileFor(state, party.to);
        const homePile = stockpileFor(state, party.from);
        let moved = 0;
        for (const [good, qty] of Object.entries(party.loot)) {
          const take = Math.min(qty, defPile[good] || 0);
          if (take > 0) { defPile[good] -= take; homePile[good] = (homePile[good] || 0) + take; moved += take; }
        }
        if (moved > 0) log(state, villageName(state, party.from) + "'s war party returns with " + moved + " looted goods.");
        standDownParty(state, grid, party);
      }
    }
  }
}

// One dawn of war: exhaustion accrues, quiet wars end in white
// peace, weary wars are offered peace and accepted, rivalries seed
// at most one border incident per season, and a leader whose
// relations have cratered declares war. Leaders decide; the god
// has no declaration path anywhere in this file.
export function dawnWars(state, grid) {
  const sKey = seasonKey(state);
  for (const war of [...(state.wars || [])]) {
    war.exhaustion += 1;
    if (state.day - war.lastBattleDay >= WAR_WHITE_PEACE_DAYS) {
      endWar(state, grid, war, "white");
      continue;
    }
    if (war.exhaustion >= WAR_EXHAUSTION_PEACE) {
      if (!war.peaceOffer) {
        const from = war.offerCount % 2 === 0 ? war.a : war.b;
        war.peaceOffer = { from, day: state.day };
        war.offerCount++;
        log(state, villageName(state, from) + " offers peace to " + villageName(state, from === war.a ? war.b : war.a) + ".");
      } else if (state.day - war.peaceOffer.day >= 1) {
        log(state, villageName(state, war.peaceOffer.from === war.a ? war.b : war.a) + " accepts the offer of peace.");
        endWar(state, grid, war, "peace");
      } else if (state.day - war.peaceOffer.day > ALLIANCE_OFFER_DAWNS) {
        war.peaceOffer = null;
        log(state, "The offer of peace lapses.");
      }
    }
  }
  const pairs = [[0, 1], [0, 2], [1, 2]];
  for (const [a, b] of pairs) {
    const rel = getRelation(state, a, b);
    // Border incidents: rivalry seeds at most one per season — a
    // log line and -2. Seeded on the village stream, so a world
    // replays the same incidents.
    if (rel <= WAR_RIVALRY && !warWith(state, a, b)) {
      const flag = pairKey(a, b) + ":" + sKey;
      if (!state.borderIncidents[flag] && villageRng(state)() < WAR_BORDER_INCIDENT_CHANCE) {
        state.borderIncidents[flag] = true;
        adjustRelation(state, a, b, -2);
        log(state, "A border incident between " + villageName(state, a) + " and " + villageName(state, b) + " sours relations (-2).");
      }
    }
    // Declaration: rivalry plus -70 plus a clear cooldown, never
    // against an ally, never twice. The larger village declares:
    // the stronger village is the one that marches.
    if (warWith(state, a, b) || allied(state, a, b)) continue;
    if (state.day < truceUntil(state, a, b)) continue;
    if (rel > WAR_MIN_RELATION) continue;
    const popA = a === 0 ? ownVillagers(state).length : villagePop(state, villageRecord(state, a));
    const popB = b === 0 ? ownVillagers(state).length : villagePop(state, villageRecord(state, b));
    const declarer = popA >= popB ? a : b;
    const declarerPop = declarer === a ? popA : popB;
    if (declarerPop < WAR_PARTY_MIN_POP) continue;
    declareWar(state, grid, declarer, declarer === a ? b : a);
  }
}

export function stepRaiders(state, grid, dt) {
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

// --- diplomacy intents: the validation every leader decision ---
// passes through. Village leaders decide; the god proposes and
// sends envoys. War declarations validate against the dawn gates
// (rivalry, -70, cooldown, betrayal); the god's own declare_war
// action is refused outright in applyGod.
export function validateDiplomacyIntent(state, intent) {
  if (!intent || typeof intent.kind !== "string") return { ok: false, reason: "An intent needs a kind." };
  if (intent.kind === "declare_war") {
    // War declarations validate against the same gates the dawn
    // leader decision uses: rivalry plus -70 plus a clear
    // cooldown, never against an ally except by betrayal, never
    // twice. The god's own declare_war action is still refused
    // outright in applyGod: this validates leader intents only.
    const rec = villageRecord(state, intent.to);
    if (!rec || !rec.known) return { ok: false, reason: "War is declared only on villages you have met." };
    if (warWith(state, 0, intent.to)) return { ok: false, reason: "Those villages are already at war." };
    if (allied(state, 0, intent.to)) return { ok: true, betrayal: true };
    if (state.day < truceUntil(state, 0, intent.to)) return { ok: false, reason: "A truce holds. War must wait." };
    if (getRelation(state, 0, intent.to) > WAR_MIN_RELATION) return { ok: false, reason: "War needs rivalry and relations at " + WAR_MIN_RELATION + " or worse." };
    return { ok: true };
  }
  if (intent.kind === "offer_peace") {
    const war = warWith(state, 0, intent.to);
    if (!war) return { ok: false, reason: "Those villages are not at war." };
    if (war.exhaustion < WAR_EXHAUSTION_PEACE) return { ok: false, reason: "The war is not weary enough for peace (exhaustion " + war.exhaustion + "/" + WAR_EXHAUSTION_PEACE + ")." };
    return { ok: true };
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
      if (warWith(state, 0, intent.to)) return { ok: false, reason: "Those villages are at war. Make peace first." };
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
