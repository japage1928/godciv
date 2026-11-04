// GodCiv sim god actions: nudges and catastrophes. Never direct
// control. Cooldowns gate each action.
import { caravanCapacity, damageBuildings, disasterKill, disasterKillCap, discoverVillage, musterGuards, touchVillage } from "./combat.js";
import { CHUNK, DAY_LENGTH, DISASTER_FIRE_DAMAGE, DISASTER_FIRE_MAX_BURNED, DISASTER_FIRE_RADIUS, DISASTER_FLOOD_DAMAGE, DISASTER_FLOOD_LOW_H, DISASTER_FLOOD_RADIUS, DISASTER_PLAGUE_DAYS, DISASTER_PLAGUE_SICK_CHANCE, DISASTER_QUAKE_DAMAGE, DISASTER_QUAKE_MAX_COLLAPSED, DISASTER_QUAKE_RADIUS, ENVOY_COOLDOWN_DAYS, PRICES, assignHomes, clamp, log, makeVillager, ownBuildings, ownVillagers } from "./core.js";
import { allied, getRelation, villageRecord } from "./diplomacy.js";
import { forEachGeneratedCell, noteMutation, peekCell } from "./grid.js";
import { findHutSpot } from "./planning.js";

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
      // leaders' decision, at dawn, behind the intent gates. This
      // case exists so the refusal is explicit and testable, not
      // a silent unknown.
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

export function leader(state) {
  const own = ownVillagers(state);
  return own.find((v) => v.leader) || own[0] || null;
}
