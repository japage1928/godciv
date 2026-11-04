// GodCiv PWA glue: UI, god actions, council loop, save/load. The sim
// owns truth; this file only reads it and calls applyGod().
import { newWorld, step, applyGod, godCooldown, leader, serialize, deserialize, SIZE, CHUNK, JOBS, PRICES, demographicRates, homelessCount, computeDemands, yearOf, nextFestival, phaseOf, SEASON_NAMES, TECH_TIERS, techThresholdFor, TOOL_NAMES, FESTIVAL_MIN_EDIBLE, FESTIVAL_MIN_FAITH, isStudent, cellAt, forEachGeneratedCell, defenseSummary, ownVillagers, ownBuildings, relationBand, getRelation, allied, warWith } from "./sim.js";
import { Renderer } from "./render.js";
import { loadOllamaSettings, saveOllamaSettings, fetchCouncil, fallbackCouncil, testOllama } from "./ollama.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "godciv-pwa-save-v1";
const APP_VERSION = "v13";
const PAGES_ORIGIN = "https://japage1928.github.io";
// The always-on village lives on the same origin as this page when the
// page is served by the server. Any other origin (GitHub Pages, a local
// file) defaults to the local village; the toggle on the start screen
// can still switch modes.
let serverMode = location.origin !== PAGES_ORIGIN;
let serverPollAt = 0;
let serverFetching = false;
let serverDown = false;

let world = null; // {state, grid}
let renderer = null;
let selectedId = null;
let armed = null; // "fire" | "quake" | null
let ollama = loadOllamaSettings();
let councilTimer = 0;
let lastSave = 0;
let toastTimer = null;

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// Clock: sim time 0..1 is one 24-hour day starting at midnight.
// Dawn runs about 05:17 to 07:40, day to 17:17, dusk to 20:10, then
// night. The mockup clock reads the same way: 22:52 is night.
// Clock: sim time 0-1 is one 24h day starting at midnight (00:00).
// Dawn runs 05:17-07:40, day to 17:17, dusk to 20:10, then night.
// See phaseOf in sim.js for the exact boundaries.
function fmtTime(state) {
  const mins = Math.floor(state.time * 24 * 60);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

const WEATHER_LABEL = { clear: "☀️ Clear", rain: "🌧️ Rain", storm: "⛈️ Storm", snow: "❄️ Snow", heat: "🔥 Heat" };
const SEASON_EMOJI = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };

function renderHUD() {
  const s = world.state;
  $("stat-food").textContent = s.stockpile.food;
  $("stat-fish").textContent = s.stockpile.fish;
  $("stat-meat").textContent = s.stockpile.meat;
  $("stat-wood").textContent = s.stockpile.wood;
  $("stat-stone").textContent = s.stockpile.stone;
  $("stat-ore").textContent = s.stockpile.ore;
  $("stat-furniture").textContent = s.stockpile.furniture || 0;
  $("stat-pottery").textContent = s.stockpile.pottery || 0;
  $("stat-ironware").textContent = s.stockpile.ironware || 0;
  $("stat-wares").textContent = s.stockpile.wares || 0;
  $("stat-faith").textContent = Math.round(s.faith);
  $("faith-fill").style.width = s.faith + "%";
  $("stat-day").textContent = "Day " + s.day + " · " + fmtTime(s) + " · " + phaseOf(s.time);
  $("stat-pop").textContent = ownVillagers(s).length + "/" + s.populationCap;
  $("stat-season").textContent = SEASON_EMOJI[s.season] + " " + SEASON_NAMES[s.season] + " Yr " + yearOf(s.day) + " · " + WEATHER_LABEL[s.weather ? s.weather.kind : "clear"];
  $("stat-morale").textContent = "💛 " + Math.round(s.morale ?? 60);
  $("stat-morale").title = (s.moraleReasons || []).map((r) => r.label + " " + (r.delta >= 0 ? "+" : "") + r.delta).join(", ") || "Morale";
  $("stat-tech").textContent = "⚒️ " + TECH_TIERS[s.tech ? s.tech.level : 0].name + " · " + TECH_TIERS[s.tech ? s.tech.level : 0].era;
  const raidEl = $("stat-raid");
  const def = defenseSummary(s);
  if (s.raiders && s.raiders.length) {
    raidEl.textContent = "⚔️ Raiders! " + s.raiders.length + " · guards " + def.posted + "/" + def.guards + " posted · " + def.manned + "/" + def.towers + " towers manned";
    raidEl.style.display = "";
  } else if (s.raidPendingDay && s.raidPendingDay > s.day) {
    raidEl.textContent = "⚠️ Raiders at dawn";
    raidEl.style.display = "";
  } else raidEl.style.display = "none";
  const fest = nextFestival(s.day);
  const celebrating = s.celebration && s.elapsed < s.celebration.until;
  $("stat-festival").textContent = celebrating ? "🎉 " + s.celebration.name + "!" : "🎉 " + fest.name + " in " + fest.inDays + "d";
  $("stat-mode").textContent = serverMode ? "Always-on village" : "This village";
  if (renderer) $("stat-view").textContent = "View " + Math.round(renderer.target.x) + "," + Math.round(renderer.target.z);
  $("version-chip").textContent = APP_VERSION;
  const effects = [];
  if (s.elapsed < s.effects.droughtUntil) effects.push("Drought");
  if (s.elapsed < s.effects.floodUntil) effects.push("Flood");
  if (s.elapsed < s.effects.plagueUntil) effects.push("Plague");
  $("stat-effects").textContent = effects.length ? effects.join(" · ") : "";
  $("stat-effects").style.display = effects.length ? "" : "none";
  // Cooldown labels on god buttons.
  for (const btn of document.querySelectorAll("[data-god]")) {
    const cd = godCooldown(s, btn.dataset.god);
    btn.classList.toggle("cooling", cd > 0);
    btn.querySelector(".cd") && (btn.querySelector(".cd").textContent = cd > 0 ? Math.ceil(cd) + "s" : "");
  }
  $("directive-label").textContent = s.directive && s.directive.focusJob ? "Directive: " + s.directive.focusJob : "No directive";
}

function villagerCard(v) {
  if (!v) return "";
  const carry = v.carry ? v.carry.amt + " " + v.carry.type : "empty hands";
  const goods = Object.keys(PRICES).filter((g) => (v.goods[g] || 0) > 0).map((g) => g + " " + v.goods[g]).join(" · ") || "no personal goods";
  const age = v.ageDays < 3 ? "child" : v.ageDays >= 45 ? "elder, " + v.ageDays + "d" : v.ageDays + "d old";
  return `<h3>${v.name}${v.leader ? " · Leader" : ""}</h3>
    <p class="muted">${v.job} · ${v.state} · ${carry} · ${age} · ${v.home ? "housed" : "homeless"}${v.job === "guard" && v.post ? " · post " + v.post.x + "," + v.post.z + (v.post.kind === "gate" ? " (" + (v.post.dir || "gate") + ")" : " (tower)") : ""}</p>
    <p>Coins: <b>${v.coins}</b> · Personal goods: ${goods}</p>
    <p>Education: <b>${v.education || 0}/10</b> · Tools: <b>${TOOL_NAMES[v.tool || 0]}</b>${v.job === "student" ? " · at school" : ""}${v.sick ? " · sick" : ""}</p>
    <p>Delegated by the leader: <b>${v.assignedJob || "none yet"}</b>${v.delegated ? " · following it" : v.assignedJob ? " · chose own work" : ""}</p>
    <p>Traits: ${v.traits.join(", ")}</p>
    <div class="bars">
      <label>Hunger <span>${Math.round(v.hunger)}</span></label><div class="bar"><i style="width:${v.hunger}%"></i></div>
      <label>Energy <span>${Math.round(v.energy)}</span></label><div class="bar"><i style="width:${v.energy}%"></i></div>
      <label>Health <span>${Math.round(v.health)}</span></label><div class="bar"><i style="width:${v.health}%"></i></div>
      <label>Fear <span>${Math.round(v.fear)}</span></label><div class="bar"><i style="width:${v.fear}%"></i></div>
    </div>
    <p class="muted">Skills: ${JOBS.map((j) => j.slice(0, 4) + " " + v.skills[j]).join(" · ")}</p>
    <div class="row"><button data-focus="${v.id}">Nudge: focus ${v.job}</button><button id="clear-focus">Clear nudge</button></div>`;
}

function relationsSection(s) {
  const known = (s.villages || []).filter((r) => r.known);
  if (!known.length) return `<p class="muted">No other villages met yet. Traders, envoys, and long walks discover them.</p>`;
  const goods = Object.keys(PRICES);
  return known.map((rec) => {
    const rel = getRelation(s, 0, rec.id);
    const caravan = (s.caravans || []).find((c) => c.from === rec.id || c.to === rec.id);
    const caravanLine = caravan
      ? `Caravan ${caravan.state === "out" ? "on its way" : caravan.state === "home" ? "returning home" : caravan.state === "fleeing" ? "fleeing robbers" : "waiting for a road"}: ${Object.entries(caravan.load).map(([g, q]) => q + " " + g).join(", ") || "empty"}.`
      : "No caravan on the road.";
    const envoy = (s.pendingEnvoys || []).some((e) => e.to === rec.id) ? " An envoy is on the road." : "";
    const stock = Object.entries(rec.stockpile).filter(([, q]) => q > 0).map(([g, q]) => g + " " + Math.floor(q)).join(" · ") || "bare stores";
    const allyState = allied(s, 0, rec.id) ? "Allied: caravans carry more, and their guards answer raids."
      : rec.allyOffer ? "An alliance proposal waits on their leader."
      : "Not allied.";
    const war = warWith(s, 0, rec.id);
    const warLine = war ? `<p><b>At war.</b> War exhaustion ${war.exhaustion}/10 — at 10 a leader offers peace.${war.peaceOffer ? " A peace offer waits on an answer." : ""}</p>` : "";
    const rivalryLine = !war && rel <= -40 ? `<p>Rivalry: trade has stopped.</p>` : "";
    const allyBtn = allied(s, 0, rec.id) ? "" : `<div class="row"><button data-suggest-ally="${rec.id}">Suggest alliance</button></div>`;
    return `<div class="village-card">
      <p><b>${rec.name}</b> · led by ${rec.leaderName} · ${rec.pop} souls · ${rec.active ? "stirring nearby" : "distant"} · at ${rec.center[0]},${rec.center[1]}</p>
      <p>Relations: <b>${rel} (${relationBand(rel)})</b>${rec.lastEvent ? " · " + rec.lastEvent : ""}${envoy}</p>
      <p>${allyState}</p>
      ${warLine}${rivalryLine}
      <p class="muted">Stores: ${stock} · ${rec.coins} coins · tech ${TECH_TIERS[rec.techLevel] ? TECH_TIERS[rec.techLevel].name : "unknown"}</p>
      <p>${caravanLine}</p>
      <div class="row"><button data-visit="${rec.id}">Visit</button></div>${allyBtn}
      <label>Suggest a trade: give
        <select data-trade-give="${rec.id}">${goods.map((g) => `<option>${g}</option>`).join("")}</select>
        <input data-trade-giveqty="${rec.id}" type="number" min="1" max="40" value="5" style="width:3.5em">
        for
        <select data-trade-want="${rec.id}">${goods.map((g) => `<option>${g}</option>`).join("")}</select>
        <input data-trade-wantqty="${rec.id}" type="number" min="1" max="40" value="5" style="width:3.5em">
      </label>
      <div class="row"><button data-suggest="${rec.id}">Suggest trade</button></div>
    </div>`;
  }).join("");
}

function closePanel() {
  // The one close path every other path funnels through: the X
  // button, tapping empty ground, and re-tapping the selected
  // villager all land here, so the panel can never get stuck open.
  selectedId = null;
  $("panel").classList.remove("open");
  renderPanel();
}

function renderPanel() {
  const s = world.state;
  const v = s.villagers.find((o) => o.id === selectedId);
  if (v) {
    $("panel-title").textContent = "Villager";
    $("panel-body").innerHTML = villagerCard(v);
    renderer.setSelected(v);
    const focusBtn = document.querySelector("[data-focus]");
    focusBtn?.addEventListener("click", () => {
      const target = s.villagers.find((o) => o.id === Number(focusBtn.dataset.focus));
      if (target) { target.personalFocus = target.job; toast("Nudged " + target.name + " toward " + target.job + ". They may still choose otherwise."); }
    });
    $("clear-focus")?.addEventListener("click", () => { if (v) v.personalFocus = null; renderPanel(); });
  } else {
    // No villager selected (or the selected one is gone): the
    // selection is stale, so drop it — a ground tap afterwards
    // must not think a villager card is still open.
    selectedId = null;
    renderer.setSelected(null);
    $("panel-title").textContent = "Village";
    const counts = {};
    for (const o of ownVillagers(s)) counts[o.job] = (counts[o.job] || 0) + 1;
    const assigned = {};
    for (const o of ownVillagers(s)) if (o.assignedJob) assigned[o.assignedJob] = (assigned[o.assignedJob] || 0) + 1;
    const l = leader(s);
    const rates = demographicRates(s);
    const demands = computeDemands(s, world.grid);
    const huts = ownBuildings(s).filter((b) => b.type === "hut").length;
    const longhouses = ownBuildings(s).filter((b) => b.type === "longhouse").length;
    const greathalls = ownBuildings(s).filter((b) => b.type === "greathall").length;
    const farmhouses = ownBuildings(s).filter((b) => b.type === "farmhouse").length;
    let farmPlots = 0, roadCells = 0;
    forEachGeneratedCell(world.grid, (x, z, c) => { if (c.farm) farmPlots++; if (c.road) roadCells++; });
    const moraleLine = (s.moraleReasons || []).map((r) => r.label + " " + (r.delta >= 0 ? "+" : "") + r.delta).join(" · ");
    const tech = s.tech || { level: 0, progress: 0 };
    const nextTier = TECH_TIERS[tech.level + 1];
    const fest = nextFestival(s.day);
    const celebrating = s.celebration && s.elapsed < s.celebration.until;
    const school = ownBuildings(s).find((b) => b.type === "school");
    const students = ownVillagers(s).filter((o) => isStudent(s, o));
    const teacher = ownVillagers(s).find((o) => o.assignedJob === "teacher");
    const educated = ownVillagers(s).filter((o) => (o.education || 0) >= 5).length;
    const healer = ownBuildings(s).find((b) => b.type === "healer");
    const def = defenseSummary(s);
    $("panel-body").innerHTML = `
      <p class="muted">${ownVillagers(s).length} villagers · ${huts} huts${longhouses ? " · " + longhouses + " longhouse" + (longhouses > 1 ? "s" : "") : ""}${greathalls ? " · " + greathalls + " great hall" + (greathalls > 1 ? "s" : "") : ""}${farmhouses ? " · " + farmhouses + " farmhouse" + (farmhouses > 1 ? "s" : "") : ""} · ${homelessCount(s)} homeless · ${s.buildQueue.length} build(s) queued</p>
      <p>${SEASON_EMOJI[s.season]} ${SEASON_NAMES[s.season]}, Year ${yearOf(s.day)} · ${WEATHER_LABEL[s.weather ? s.weather.kind : "clear"]} · ${phaseOf(s.time)}</p>
      <p>Morale: <b>${Math.round(s.morale ?? 60)}/100</b>${moraleLine ? ": " + moraleLine : ""}</p>
      <p>Tech: <b>${TECH_TIERS[tech.level].name}</b> · ${TECH_TIERS[tech.level].era} (${tech.progress}/${techThresholdFor(tech.level)})${nextTier ? " · Next: " + nextTier.name + ": " + nextTier.blurb : " · Highest tier reached."}</p>
      ${s.raiders && s.raiders.length ? `<p>⚔️ <b>Raiders in the village!</b> ${s.raiders.length} raiders. Guards hold their posts; only manned towers shoot; walls slow them.</p>` : s.raidPendingDay && s.raidPendingDay > s.day ? `<p>⚠️ <b>Raiders at dawn.</b> Scouts saw them in the hills. Walls and towers help, if the village has them.</p>` : ""}
      ${ownBuildings(s).some((b) => b.type === "wall") || ownBuildings(s).some((b) => b.type === "tower") ? `<p>Defenses: <b>${def.walls} wall</b> · <b>${def.towers} tower</b> (${def.manned} manned) · <b>${def.posted}/${def.guards} guards posted</b> · gates stay open on the four axes.${def.lastRaid ? " Last raid: " + def.lastRaid : ""}</p>` : ""}
      <p>${celebrating ? "🎉 <b>" + s.celebration.name + "!</b> The village feasts at the town center." : "🎉 Next festival: <b>" + fest.name + "</b> in " + fest.inDays + "d, needs " + FESTIVAL_MIN_EDIBLE + " food in store and faith " + FESTIVAL_MIN_FAITH + ". A feast costs 10 food and lifts morale."}</p>
      ${school ? `<p>School: <b>${students.length} student${students.length === 1 ? "" : "s"}</b>${teacher ? " · teacher " + teacher.name : " · no teacher yet"} · ${educated} educated adult${educated === 1 ? "" : "s"}</p>` : ""}
      ${healer ? `<p>A healer's hut stands. The sick mend faster near it.</p>` : ""}
      <p>Farms: <b>${farmPlots} plots</b> in the west fields${farmhouses ? " · " + farmhouses + " farmhouse" + (farmhouses > 1 ? "s" : "") + " (plots near one grow faster)" : " · no farmhouse yet"} · Food sources: farmers ${counts.farmer || 0} · fishers ${counts.fisher || 0} · hunters ${counts.hunter || 0} · Roads: ${roadCells} cells from the plaza to every district</p>
      <p>Market: fund <b>${s.fund}</b> coins · ${s.stats.trades || 0} trades · prices: ${Object.keys(PRICES).map((g) => g + " " + PRICES[g]).join(" · ")}: villagers trade personal goods at the town center; a broke villager still eats from the stockpile.</p>
      <p>Births: <b>${rates.birthRate.toFixed(1)}%/day</b> · Deaths: <b>${rates.deathRate.toFixed(1)}%/day</b> (${rates.birthsPerDay.toFixed(1)} births, ${rates.deathsPerDay.toFixed(1)} deaths per day, last ${s.rateHistory.length || 0} dawns · ${s.stats.births} born, ${s.stats.deaths} died all time)</p>
      <p>Builders need: <b>${demands.length ? demands[0].type + ": " + demands[0].reason : "nothing pressing"}</b></p>
      <p>Leader: <b>${l ? l.name : "none"}</b> delegates: ${JOBS.map((j) => j + " " + (assigned[j] || 0)).join(" · ")}</p>
      <h4>Neighbor villages</h4>
      ${relationsSection(s)}
      <p class="muted">Buildings: ${ownBuildings(s).map((b) => b.type).join(", ")}. Town center, granary, roads, and markers are all raised by villagers, never by the god. Huts build themselves when crowded, farms spread when food is short.</p>
      <p>Jobs: ${JOBS.map((j) => j + " " + (counts[j] || 0)).join(" · ")}</p>
      <label for="directive-select">Leader directive (a nudge, villagers can disobey)</label>
      <select id="directive-select">
        <option value="">No directive</option>
        ${JOBS.map((j) => `<option value="${j}" ${s.directive?.focusJob === j ? "selected" : ""}>Focus: ${j}</option>`).join("")}
      </select>
      <div class="row"><button id="apply-directive">Set directive</button><button id="center-village">Center on village</button></div>
      ${serverMode
        ? `<div class="council"><h4>Council</h4><p class="muted">The council rests while the village runs on the server. The utility brain keeps the village going.</p></div>`
        : `<div id="council-card" class="council"><h4>Council</h4><p id="council-text">The elder is quiet. Enable Ollama in Settings for model advice, or use the utility council below.</p>
      <p class="muted" id="council-source"></p>
      <div class="row"><button id="ask-council">Ask council now</button></div></div>`}
      <h4>God log</h4><div id="log">${s.log.map((e) => `<p><span class="muted">Day ${e.day}</span> ${e.text}</p>`).join("")}</div>`;
    $("apply-directive").addEventListener("click", () => {
      const val = $("directive-select").value;
      doGod("directive", null, null, { focusJob: val || null });
    });
    $("center-village").addEventListener("click", () => renderer.centerOn(s._cx, s._cz));
    $("ask-council")?.addEventListener("click", () => runCouncil(true));
    document.querySelectorAll("[data-visit]").forEach((btn) => btn.addEventListener("click", () => {
      const rec = (s.villages || []).find((r) => r.id === Number(btn.dataset.visit));
      if (!rec) return;
      renderer.centerOn(rec.center[0], rec.center[1]);
      doGod("visit", rec.center[0], rec.center[1]);
    }));
    document.querySelectorAll("[data-suggest]").forEach((btn) => btn.addEventListener("click", () => {
      const id = Number(btn.dataset.suggest);
      const giveGood = document.querySelector(`[data-trade-give="${id}"]`).value;
      const giveQty = Number(document.querySelector(`[data-trade-giveqty="${id}"]`).value);
      const wantGood = document.querySelector(`[data-trade-want="${id}"]`).value;
      const wantQty = Number(document.querySelector(`[data-trade-wantqty="${id}"]`).value);
      doGod("suggest_trade", null, null, { to: id, give: { good: giveGood, qty: giveQty }, want: { good: wantGood, qty: wantQty } });
    }));
    document.querySelectorAll("[data-suggest-ally]").forEach((btn) => btn.addEventListener("click", () => {
      doGod("suggest_alliance", null, null, { to: Number(btn.dataset.suggestAlly) });
    }));
  }
}

async function postGod(action, x, z, opts = {}) {
  const res = await fetch("./api/god", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, x, z, ...opts }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function applyServerState(stateJson) {
  const w = deserialize(typeof stateJson === "string" ? stateJson : JSON.stringify(stateJson));
  world = w;
  renderHUD();
  if ($("panel").classList.contains("open")) renderPanel();
}

async function doGod(action, x, z, opts = {}) {
  if (serverMode) {
    try {
      const r = await postGod(action, x, z, opts);
      if (!r.ok) { toast(r.reason || "The god action was refused."); return false; }
      armed = null; $("arm-banner").style.display = "none";
      if (r.state) applyServerState(r.state);
      return true;
    } catch (e) {
      toast("The server did not answer. The village keeps going without you.");
      return false;
    }
  }
  const s = world.state;
  const r = applyGod(s, world.grid, action, x, z, opts);
  if (!r.ok) { toast(r.reason); return false; }
  armed = null; $("arm-banner").style.display = "none";
  renderHUD(); renderPanel();
  return true;
}

function armGod(action) {
  armed = action;
  $("arm-banner").style.display = "";
  $("arm-banner").textContent = action === "fire" ? "Tap the ground to call down fire." : "Tap the ground for the quake's center. Tap again to cancel.";
}

function saveGame(silent = false) {
  // The always-on village saves itself on the server. Local saves
  // stay untouched in server mode: switching back finds them as left.
  if (serverMode) { if (!silent) toast("The always-on village saves itself on the server."); return; }
  try {
    localStorage.setItem(SAVE_KEY, serialize(world.state, world.grid));
    lastSave = performance.now();
    if (!silent) toast("Saved.");
  } catch (e) { if (!silent) toast("Save failed: storage full or blocked."); }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return deserialize(raw); } catch { return null; }
}

async function runCouncil(manual = false) {
  // The council is a local-village voice. It stays off in server mode:
  // the server ticks on its own and the phone only watches and nudges.
  if (serverMode) return;
  const s = world.state;
  const card = $("council-text"), src = $("council-source");
  try {
    let advice;
    if (ollama.enabled) {
      advice = await fetchCouncil(s, ollama, AbortSignal.timeout(20000));
    } else {
      advice = fallbackCouncil(s);
    }
    if (card) {
      card.textContent = advice.goal;
      if (src) src.textContent = "Source: " + advice.source + (advice.focus_job ? " · suggested focus: " + advice.focus_job : "");
    }
    if (advice.focus_job && (manual || ollama.enabled)) {
      applyGod(s, world.grid, "directive", null, null, { focusJob: advice.focus_job });
      logCouncilWhisper(advice);
    }
    renderHUD(); renderPanel();
    // Re-attach council text after renderPanel rebuilds the card.
    const nt = $("council-text");
    if (nt) nt.textContent = advice.goal;
    const ns = $("council-source");
    if (ns) ns.textContent = "Source: " + advice.source + (advice.focus_job ? " · suggested focus: " + advice.focus_job : "");
  } catch (e) {
    const advice = fallbackCouncil(s);
    if (card) card.textContent = advice.goal + " (Ollama unreachable: " + e.message + ")";
    if (src) src.textContent = "Source: utility fallback";
  }
}

function logCouncilWhisper(advice) {
  const s = world.state;
  const l = leader(s);
  if (advice.whisper && l) {
    // Whisper goes through the leader only; villagers may still disobey.
    applyGod(s, world.grid, "whisper", null, null, { text: advice.whisper });
    void l;
  }
}

function enterWorld(w, isServer) {
  world = w;
  if (!renderer) {
    renderer = new Renderer($("scene"), (pick) => {
      if (pick.type === "villager") {
        // Re-tapping the already-selected villager closes the card.
        if (pick.id === selectedId) { closePanel(); return; }
        selectedId = pick.id;
        $("panel").classList.add("open");
        renderPanel();
      } else if (pick.type === "ground") {
        if (armed) { doGod(armed, pick.x, pick.z); }
        else if (selectedId !== null) {
          // Empty-ground tap with a villager card open closes it
          // and clears the selection; the cell toast is skipped,
          // the tap's job was dismissal.
          closePanel();
        }
        else if (pick.x >= 0 && pick.x < SIZE && pick.z >= 0 && pick.z < SIZE) {
          const cell = cellAt(world.grid, pick.x, pick.z);
          if (!cell) { toast("Beyond the edge of the known world."); return; }
          toast(cell.water ? "Water." : cell.tree ? "Trees. Wood waits here." : cell.farm ? "Farm plot, crop stage " + cell.crop + "/3." : cell.stone ? "Rock and ore." : cell.building ? cell.building : "Open ground.");
        }
      }
    });
    window.addEventListener("resize", () => renderer.resize());
  }
  renderer.buildStatic(world.grid);
  renderer.centerOn(24, 24);
  $("start-overlay").style.display = "none";
  // In server mode the server ticks at 1x: speed and pause are the
  // server's business, not the phone's.
  $("btn-speed").disabled = isServer;
  $("btn-pause").disabled = isServer;
  $("btn-speed").textContent = isServer ? "Server 1×" : world.state.speed + "×";
  $("btn-pause").textContent = "⏸ Pause";
  renderHUD(); renderPanel();
  councilTimer = world.state.elapsed + (ollama.intervalSec || 90);
  serverPollAt = 0;
}

function startWorld(seed, fromSave) {
  const w = fromSave || newWorld(seed);
  enterWorld(w, false);
}

// Join the always-on village: same origin, relative /api/* paths, no
// URL baked in. The server owns the sim; the phone renders polls.
async function startServerWorld() {
  $("server-info").textContent = "Reaching the always-on village…";
  try {
    const res = await fetch("./api/state", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const w = deserialize(await res.text());
    serverDown = false;
    enterWorld(w, true);
    toast("Joined the always-on village. Day " + w.state.day + ".");
  } catch (e) {
    $("server-info").textContent = "Could not reach the always-on village. Check the connection and try again.";
    toast("Server unreachable.");
  }
}

// Poll the server world every 2s. Only the state swaps: buildings,
// farms, and roads update through the renderer's normal paths, and
// the static ground snapshot stays as first built, same as local play.
async function pollServer() {
  if (serverFetching || !world) return;
  serverFetching = true;
  try {
    const res = await fetch("./api/state", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const w = deserialize(await res.text());
    world = w;
    serverDown = false;
    renderHUD();
    if ($("panel").classList.contains("open")) renderPanel();
  } catch (e) {
    if (!serverDown) { serverDown = true; toast("Lost the always-on village. Retrying…"); }
  } finally { serverFetching = false; }
}

function bindUI() {
  document.querySelectorAll("[data-god]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.god;
      if (action === "fire" || action === "quake") { armGod(armed === action ? null : action); if (!armed) $("arm-banner").style.display = "none"; return; }
      if (action === "whisper") { $("whisper-box").style.display = ""; $("whisper-input").focus(); return; }
      doGod(action);
    });
  });
  $("arm-banner").addEventListener("click", () => { armed = null; $("arm-banner").style.display = "none"; });
  $("whisper-send").addEventListener("click", () => {
    const text = $("whisper-input").value.trim();
    if (!text) return;
    doGod("whisper", null, null, { text });
    $("whisper-input").value = ""; $("whisper-box").style.display = "none";
  });
  $("whisper-cancel").addEventListener("click", () => { $("whisper-box").style.display = "none"; });
  $("btn-pause").addEventListener("click", () => {
    world.state.paused = !world.state.paused;
    $("btn-pause").textContent = world.state.paused ? "▶ Resume" : "⏸ Pause";
  });
  $("btn-speed").addEventListener("click", () => {
    world.state.speed = world.state.speed >= 8 ? 1 : world.state.speed * 2;
    $("btn-speed").textContent = world.state.speed + "×";
  });
  $("btn-panel").addEventListener("click", () => { selectedId = null; $("panel").classList.toggle("open"); renderPanel(); });
  $("panel-close").addEventListener("click", closePanel);
  $("btn-rotate-l").addEventListener("click", () => renderer.rotate(-1));
  $("btn-rotate-r").addEventListener("click", () => renderer.rotate(1));
  $("btn-zoom-in").addEventListener("click", () => renderer.zoomIn());
  $("btn-zoom-out").addEventListener("click", () => renderer.zoomOut());
  $("btn-save").addEventListener("click", () => saveGame(false));
  $("btn-settings").addEventListener("click", () => {
    $("set-enabled").checked = ollama.enabled;
    $("set-url").value = ollama.url;
    $("set-model").value = ollama.model;
    $("set-interval").value = ollama.intervalSec;
    $("settings-dialog").showModal();
  });
  $("set-save").addEventListener("click", (e) => {
    e.preventDefault();
    ollama = { enabled: $("set-enabled").checked, url: $("set-url").value.trim(), model: $("set-model").value.trim() || "qwen3:0.6b", intervalSec: Math.max(30, Number($("set-interval").value) || 90) };
    saveOllamaSettings(ollama);
    $("settings-dialog").close();
    toast(ollama.enabled ? "Ollama council on. It only advises, never controls." : "Ollama council off. Utility council will advise.");
  });
  $("set-test").addEventListener("click", async () => {
    $("set-status").textContent = "Testing…";
    try {
      const r = await testOllama(ollama);
      $("set-status").textContent = "Ollama reachable. Models: " + (r.models.join(", ") || "none") + ". " + (r.hasModel ? "Your model is installed." : "Your model is NOT in that list.");
    } catch (e) { $("set-status").textContent = "Unreachable: " + e.message + ". On a phone this usually means the URL is localhost, or Ollama needs CORS / a LAN address."; }
  });
  $("btn-new").addEventListener("click", () => {
    if (!confirm("Start a new village? Your saved village will be replaced on the next save.")) return;
    localStorage.removeItem(SAVE_KEY);
    startWorld((Math.random() * 1e9) | 0, null);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && world) saveGame(true); });
  window.addEventListener("beforeunload", () => { if (world) saveGame(true); });

  // Start overlay: mode toggle, then the mode's own start buttons.
  // A saved local village keeps going under the new rules when
  // continued: seasons, weather, morale, schools, and tech arrive
  // with defaults, and nothing already built is lost.
  const saved = loadGame();
  $("btn-continue").style.display = saved ? "" : "none";
  $("save-info").textContent = saved
    ? "Saved village found: Day " + saved.state.day + ", " + saved.state.villagers.length + " villagers. Continue, and it keeps going under the new rules."
    : "No saved village on this device yet.";
  const setMode = (server) => {
    serverMode = server;
    $("btn-mode-local").classList.toggle("active", !server);
    $("btn-mode-server").classList.toggle("active", server);
    $("local-start").style.display = server ? "none" : "";
    $("server-start").style.display = server ? "" : "none";
  };
  $("btn-mode-local").addEventListener("click", () => setMode(false));
  $("btn-mode-server").addEventListener("click", () => setMode(true));
  setMode(serverMode);
  $("btn-new-game").addEventListener("click", () => startWorld((Math.random() * 1e9) | 0, null));
  $("btn-continue").addEventListener("click", () => { const s = loadGame(); if (s) startWorld(0, s); });
  $("btn-join-server").addEventListener("click", () => startServerWorld());
}

let lastFrame = performance.now();
let dwell = { id: null, since: 0, done: false };
function loop(now) {
  requestAnimationFrame(loop);
  if (!world || !renderer) return;
  const dtReal = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const s = world.state;
  if (serverMode) {
    // The server ticks. The phone polls, renders, and never steps,
    // never autosaves, never councils.
    if (now - serverPollAt > 2000) { serverPollAt = now; pollServer(); }
  } else {
    if (!s.paused) {
      const simDt = dtReal * s.speed;
      // Fixed substeps so the sim stays stable at 4x.
      let remaining = simDt;
      while (remaining > 0) { const h = Math.min(0.25, remaining); step(s, world.grid, h); remaining -= h; }
    }
  }
  renderer.update(s, world.grid, dtReal, now / 1000);
  // Camera dwell: resting the view within 3 chunks of a village
  // for 10s counts as walking there — the village stirs and is
  // discovered, through the same visit action as the Visit button.
  if (renderer && s.villages) {
    const tx = renderer.target.x, tz = renderer.target.z;
    let near = null;
    for (const rec of s.villages) {
      const dcx = Math.abs(Math.floor(tx / CHUNK) - Math.floor(rec.center[0] / CHUNK));
      const dcz = Math.abs(Math.floor(tz / CHUNK) - Math.floor(rec.center[1] / CHUNK));
      if (Math.max(dcx, dcz) <= 3) { near = rec; break; }
    }
    if (near) {
      if (dwell.id !== near.id) dwell = { id: near.id, since: now, done: false };
      else if (!dwell.done && now - dwell.since >= 10000) {
        dwell.done = true;
        doGod("visit", near.center[0], near.center[1]);
      }
    } else dwell = { id: null, since: 0, done: false };
  }
  // HUD + panel refresh at ~4 Hz, not every frame.
  if (now - (loop._hudAt || 0) > 250) { loop._hudAt = now; renderHUD(); if ($("panel").classList.contains("open")) renderPanel(); }
  // Council loop (local villages only).
  if (!serverMode && s.elapsed >= councilTimer) {
    councilTimer = s.elapsed + (ollama.intervalSec || 90);
    runCouncil(false);
  }
  // Autosave every 15s (local villages only).
  if (!serverMode && now - lastSave > 15000) saveGame(true);
}

bindUI();
requestAnimationFrame(loop);

// Register the service worker for install/offline. Fail silently on
// file:// or in browsers that block it; the game still runs.
// If an update takes control on a page that already had one, reload once
// so the user is never stuck on a cached old version after a deploy.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
