// GodCiv sim diplomacy: village relations, bands, alliances, and
// villager removal (which cools relations on allied-guard deaths).
import { ALLIANCE_COOLDOWN_DAYS, ALLIED_GUARD_DEATH_RELATION, SEASONS, clamp, key, log, mulberry32, ownVillagers, yearOf } from "./core.js";

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
