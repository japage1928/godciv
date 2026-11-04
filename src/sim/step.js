// GodCiv sim step: the main tick. Weather, dawn, crops, deer,
// villagers, raiders, caravans, war.
import { dawnDemographics, delegateRoles, doWork, recomputeMorale, runMarket, think } from "./brain.js";
import { dawnVillages, dawnWars, nearestEnemyFighter, nearestRaider, spawnRaid, stepCaravans, stepForeignVillager, stepRaiders, stepWarCombat, stepWarFighter, stepWarParties } from "./combat.js";
import { CHILD_DAYS, CHUNK, DAY_LENGTH, FESTIVALS, FESTIVAL_COST_FOOD, FESTIVAL_MIN_EDIBLE, FESTIVAL_MIN_FAITH, OLD_SIZE, PRICES, RAID_GAP_DAYS, RAID_MIN_DAY, RAID_MIN_POP, RAID_MIN_TECH, SEASON_GROWTH, SEASON_HUNGER, SEASON_KEEP, SEASON_NAMES, SIZE, clamp, log, makeDeer, ownBuildings, ownVillagers, phaseOf, rollWeather, seasonOf, yearDayOf, yearOf } from "./core.js";
import { removeVillager } from "./diplomacy.js";
import { cellAt, chunkKey, drainGenQueue, ensureIndexes, noteMutation, updateActiveChunks } from "./grid.js";
import { expandVillage } from "./planning.js";

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
    // Wars live their dawn too: exhaustion, peace, border
    // incidents, and leaders' declarations.
    dawnWars(state, grid);
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
    // War fighters march under the war step, before hunger, work,
    // and fear: the war is their job until they stand down.
    if (v.warParty) { stepWarFighter(state, grid, v, dt); continue; }
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
    // next rethink: villagers never seek combat unarmed. An enemy
    // war fighter does the same.
    if ((state.raiders.length || (state.warParties || []).length) && v.state !== "flee"
      && (nearestRaider(state, v.x, v.z, 5) || nearestEnemyFighter(state, v.x, v.z, 5, 0))) {
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
  // War parties fight, loot, and retreat after caravans: combat
  // resolves on positions the whole tick has already settled.
  stepWarCombat(state, grid, dt);
  stepWarParties(state, grid, dt);
}
