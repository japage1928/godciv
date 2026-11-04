// GodCiv sim brain: delegation, market, morale, demographics,
// and one villager's think + act. The god never directly controls
// a villager.
import { leader } from "./actions.js";
import { assignGuardPosts, disasterKillCap, dispatchCaravan, guardPosts, nearestEnemyFighter, nearestRaider, pairKey } from "./combat.js";
import { ALLIANCE_MIN_RELATION, ALLIANCE_OFFER_DAWNS, BUILD_COSTS, CHILD_DAYS, DISASTER_PLAGUE_DAWN_DEATH, ELDER_DAYS, ERA_POP_GATE, GUARD_BREAK_HEALTH, GUARD_CAP, GUARD_POST_RADIUS, JOBS, PRICES, SCHOOL_MAX_AGE, SIZE, TECH_TIERS, TOOL_COSTS, TOOL_NAMES, assignHomes, clamp, homelessCount, inBounds, isStudent, key, log, makeVillager, ownBuildings, ownVillagers, phaseOf, techThresholdFor } from "./core.js";
import { allianceCooldownOk, allied, getRelation, removeVillager, seasonKey, villageRecord } from "./diplomacy.js";
import { cellAt, hasShore, nearestCell, noteMutation, peekCell, setTarget } from "./grid.js";
import { clearFarmBed, computeDemands } from "./planning.js";

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
export function delegateRoles(state, grid = null) {
  // Students go to school, not to work; toddlers stay home. Only the
  // player's own villagers are delegated: neighbor villagers keep
  // their own hours under their own leader.
  const villagers = ownVillagers(state).filter((v) => (v.ageDays ?? 25) >= CHILD_DAYS && !isStudent(state, v) && !v.warParty);
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
    // Production jobs exist only where their workplace stands: a
    // carpenter needs a workshop, a potter a kiln, a smith a
    // smithy, factory workers a factory.
    carpenter: state.buildings.some((b) => b.type === "workshop") ? (pop >= 20 ? 2 : 1) : 0,
    potter: state.buildings.some((b) => b.type === "kiln") ? 1 : 0,
    smith: state.buildings.some((b) => b.type === "smithy") ? 1 : 0,
    factory: state.buildings.some((b) => b.type === "factory") ? 2 : 0,
    // Guards: one per tower, plus one per gate once a real wall ring
    // exists (6+ wall segments), capped at GUARD_CAP and at one third
    // of the adults. No posts, no guards.
    guard: (() => {
      const towers = state.buildings.filter((b) => b.type === "tower").length;
      const walls = state.buildings.filter((b) => b.type === "wall").length;
      return Math.min(GUARD_CAP, towers + (walls >= 6 ? 2 : 0), Math.floor(pop / 3));
    })(),
  };
  const order = ["farmer", "fisher", "hunter", "woodcutter", "miner", "builder", "hauler", "teacher", "carpenter", "potter", "smith", "factory", "guard"];
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

export function scoreJob(state, v, job) {
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
  // Production jobs: no workplace, no work (-30, like the teacher
  // without a school); with one, the score follows the balance of
  // the product in the stockpile against PRODUCTION_WANT: a deficit
  // pulls workers in, a surplus pushes them to other work, so
  // production stops piling up goods the village already holds. The
  // stockpile read is || 0: saves written before the product goods
  // existed have no key for them.
  const prodWorkplace = { carpenter: "workshop", potter: "kiln", smith: "smithy", factory: "factory" }[job];
  if (prodWorkplace) {
    const prodOutput = { carpenter: "furniture", potter: "pottery", smith: "ironware", factory: "wares" }[job];
    score += state.buildings.some((b) => b.type === prodWorkplace) ? (PRODUCTION_WANT - (s[prodOutput] || 0)) * 0.3 : -30;
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
        const wantsProduct = (g === "furniture" || g === "pottery" || g === "ironware" || g === "wares") && (buyer.goods[g] || 0) < 2 && buyer.coins >= price;
        if ((!wantsFood && !wantsMaterial && !wantsOre && !wantsProduct) || buyer.coins < price) continue;
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

// --- one villager's think + act ---

export function think(state, grid, v) {
  const cx = state._cx, cz = state._cz;
  // Urgent needs override jobs, exactly as in the Luanti brain.
  // Raiders send villagers running away from the threat, never
  // toward the center where the raiders are headed. An enemy war
  // fighter is the same kind of threat, and a guard on duty holds
  // against either while still standing.
  const raiderNear = nearestRaider(state, v.x, v.z, 8) || nearestEnemyFighter(state, v.x, v.z, 8, 0);
  // A guard on duty holds the post while a raid is active, as long as
  // they are still standing: fear still accumulates, and a wounded
  // guard (below GUARD_BREAK_HEALTH) falls back like anyone else.
  const guardOnDuty = v.job === "guard" && (state.raidActive || !!nearestEnemyFighter(state, v.x, v.z, 8, 0)) && v.health >= GUARD_BREAK_HEALTH;
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
  } else if (job === "carpenter" || job === "potter" || job === "smith" || job === "factory") {
    // Production workers walk to their workplace and work there; no
    // workplace, no work. The workplace type per job mirrors the
    // production recipes in doWork.
    const workplace = { carpenter: "workshop", potter: "kiln", smith: "smithy", factory: "factory" }[job];
    const site = ownBuildings(state).find((b) => b.type === workplace);
    if (site) setTarget(state, grid, v, site.x, site.z); else v.state = "idle";
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
    } else if (state.raidActive || nearestEnemyFighter(state, post.x + 0.5, post.z + 0.5, GUARD_POST_RADIUS, 0)) {
      // During a raid — or a war party's approach — guards engage
      // the nearest threat within range of the post, raider or
      // fighter alike, otherwise they hold it.
      const r = nearestRaider(state, post.x + 0.5, post.z + 0.5, GUARD_POST_RADIUS);
      const f = nearestEnemyFighter(state, post.x + 0.5, post.z + 0.5, GUARD_POST_RADIUS, 0);
      const t = r && f
        ? (Math.hypot(r.x - post.x, r.z - post.z) <= Math.hypot(f.x - post.x, f.z - post.z) ? r : f)
        : (r || f);
      if (t && v.health >= GUARD_BREAK_HEALTH) setTarget(state, grid, v, Math.round(t.x), Math.round(t.z));
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

// Production recipes: the workplace a job works at, the stockpile
// inputs one work action consumes, and the output it carries away.
// The recipe IS the conservation rule: inputs consumed exactly,
// outputs exactly per recipe, nothing created from nothing.
// PRODUCTION_WANT is the stockpile level production aims at: scoreJob
// rewards a deficit and penalises a surplus, and doWork stops
// producing once the stockpile holds that much, so a carpenter can
// never eat every stick of wood while the village still needs a
// school (the wood famine that stalled seed 7 in the first pass).
const PRODUCTION_WANT = 12;
const PRODUCTION_RECIPES = {
  carpenter: { workplace: "workshop", inputs: { wood: 2 }, output: "furniture", outAmt: 1 },
  potter: { workplace: "kiln", inputs: { stone: 2 }, output: "pottery", outAmt: 1 },
  smith: { workplace: "smithy", inputs: { ore: 1 }, output: "ironware", outAmt: 1 },
  factory: { workplace: "factory", inputs: { wood: 1, stone: 1, ore: 1 }, output: "wares", outAmt: 2 },
};

export function doWork(state, grid, v, dt) {  const [tx, tz] = v.target || [];
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
  } else if (PRODUCTION_RECIPES[v.job]) {
    // Production: inputs leave the stockpile only at the workplace,
    // only when the whole recipe fits the villager's carry, and only
    // while the stockpile holds less than PRODUCTION_WANT of the
    // output. The output rides the existing addCarry -> haul ->
    // deposit path (step.js), which keeps one unit as personal
    // goods. A worker short of inputs, away from the workplace,
    // without carry room, or facing a full stockpile produces
    // nothing — never from thin air, and never at the cost of the
    // wood the village needs to build with.
    const recipe = PRODUCTION_RECIPES[v.job];
    const atWorkplace = cell && cell.building === recipe.workplace;
    const carryRoom = !v.carry || (v.carry.type === recipe.output && v.carry.amt + recipe.outAmt <= v.carryCap);
    const hasInputs = Object.entries(recipe.inputs).every(([g, n]) => (state.stockpile[g] || 0) >= n);
    const wantMet = (state.stockpile[recipe.output] || 0) >= PRODUCTION_WANT;
    if (atWorkplace && carryRoom && hasInputs && !wantMet) {
      for (const [g, n] of Object.entries(recipe.inputs)) state.stockpile[g] -= n;
      addCarry(recipe.output, recipe.outAmt);
    }
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
      const needProgress = { granary: 8, marker: 3, well: 6, workshop: 8, shrine: 5, longhouse: 8, greathall: 10, farmhouse: 7, school: 8, healer: 6, wall: 4, tower: 8, kiln: 7, smithy: 8, factory: 12 }[q.type] || 6;
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
            } else if (type === "kiln") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A kiln is fired up. Potters shape stone into pottery.");
            } else if (type === "smithy") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A smithy opens. The smith hammers ore into ironware.");
            } else if (type === "factory") {
              cellAt(grid, q.x, q.z).blocked = true;
              log(state, "A factory opens its doors. Workers turn wood, stone, and ore into wares.");
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
