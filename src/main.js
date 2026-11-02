// GodCiv PWA glue: UI, god actions, council loop, save/load. The sim
// owns truth; this file only reads it and calls applyGod().
import { newWorld, step, applyGod, godCooldown, leader, serialize, deserialize, SIZE, JOBS } from "./sim.js";
import { Renderer } from "./render.js";
import { loadOllamaSettings, saveOllamaSettings, fetchCouncil, fallbackCouncil, testOllama } from "./ollama.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "godciv-pwa-save-v1";

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

function fmtTime(state) {
  const mins = Math.floor(state.time * 24 * 60);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

function renderHUD() {
  const s = world.state;
  const edible = s.stockpile.food + s.stockpile.fish + s.stockpile.meat;
  $("stat-food").textContent = edible;
  $("stat-wood").textContent = s.stockpile.wood;
  $("stat-stone").textContent = s.stockpile.stone;
  $("stat-ore").textContent = s.stockpile.ore;
  $("stat-faith").textContent = Math.round(s.faith);
  $("faith-fill").style.width = s.faith + "%";
  $("stat-day").textContent = "Day " + s.day + " · " + fmtTime(s);
  $("stat-pop").textContent = s.villagers.length + "/" + s.populationCap;
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
  $("directive-label").textContent = s.directive ? "Directive: " + s.directive.focusJob : "No directive";
}

function villagerCard(v) {
  if (!v) return "";
  const carry = v.carry ? v.carry.amt + " " + v.carry.type : "empty hands";
  return `<h3>${v.name}${v.leader ? " · Leader" : ""}</h3>
    <p class="muted">${v.job} · ${v.state} · ${carry}</p>
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
    renderer.setSelected(null);
    $("panel-title").textContent = "Village";
    const counts = {};
    for (const o of s.villagers) counts[o.job] = (counts[o.job] || 0) + 1;
    $("panel-body").innerHTML = `
      <p class="muted">${s.villagers.length} villagers · ${s.buildings.filter((b) => b.type === "hut").length} huts · ${s.buildQueue.length} hut(s) queued</p>
      <p>Jobs: ${JOBS.map((j) => j + " " + (counts[j] || 0)).join(" · ")}</p>
      <label for="directive-select">Leader directive (a nudge, villagers can disobey)</label>
      <select id="directive-select">
        <option value="">No directive</option>
        ${JOBS.map((j) => `<option value="${j}" ${s.directive?.focusJob === j ? "selected" : ""}>Focus: ${j}</option>`).join("")}
      </select>
      <div class="row"><button id="apply-directive">Set directive</button><button id="center-village">Center on village</button></div>
      <div id="council-card" class="council"><h4>Council</h4><p id="council-text">The elder is quiet. Enable Ollama in Settings for model advice, or use the utility council below.</p>
      <p class="muted" id="council-source"></p>
      <div class="row"><button id="ask-council">Ask council now</button></div></div>
      <h4>God log</h4><div id="log">${s.log.map((e) => `<p><span class="muted">Day ${e.day}</span> ${e.text}</p>`).join("")}</div>`;
    $("apply-directive").addEventListener("click", () => {
      const val = $("directive-select").value;
      const r = applyGod(s, world.grid, "directive", null, null, { focusJob: val || null });
      if (!r.ok) toast(r.reason); renderHUD(); renderPanel();
    });
    $("center-village").addEventListener("click", () => renderer.centerOn(24, 24));
    $("ask-council").addEventListener("click", () => runCouncil(true));
  }
}

function doGod(action, x, z) {
  const s = world.state;
  const r = applyGod(s, world.grid, action, x, z);
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

function startWorld(seed, fromSave) {
  world = fromSave || newWorld(seed);
  world.state._rng = world.state._rng || null;
  if (!renderer) {
    renderer = new Renderer($("scene"), (pick) => {
      if (pick.type === "villager") {
        selectedId = pick.id;
        $("panel").classList.add("open");
        renderPanel();
      } else if (pick.type === "ground") {
        if (armed) { doGod(armed, pick.x, pick.z); }
        else if (pick.x >= 0 && pick.x < SIZE && pick.z >= 0 && pick.z < SIZE) {
          const cell = world.grid[pick.x][pick.z];
          toast(cell.water ? "Water." : cell.tree ? "Trees. Wood waits here." : cell.farm ? "Farm plot, crop stage " + cell.crop + "/3." : cell.stone ? "Rock and ore." : cell.building ? cell.building : "Open ground.");
        }
      }
    });
    renderer.buildStatic(world.grid);
    window.addEventListener("resize", () => renderer.resize());
  } else {
    renderer.buildStatic(world.grid);
  }
  renderer.centerOn(24, 24);
  $("start-overlay").style.display = "none";
  renderHUD(); renderPanel();
  councilTimer = world.state.elapsed + (ollama.intervalSec || 90);
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
    const r = applyGod(world.state, world.grid, "whisper", null, null, { text });
    if (!r.ok) toast(r.reason);
    $("whisper-input").value = ""; $("whisper-box").style.display = "none";
    renderHUD(); renderPanel();
  });
  $("whisper-cancel").addEventListener("click", () => { $("whisper-box").style.display = "none"; });
  $("btn-pause").addEventListener("click", () => {
    world.state.paused = !world.state.paused;
    $("btn-pause").textContent = world.state.paused ? "▶ Resume" : "⏸ Pause";
  });
  $("btn-speed").addEventListener("click", () => {
    world.state.speed = world.state.speed >= 4 ? 1 : world.state.speed * 2;
    $("btn-speed").textContent = world.state.speed + "×";
  });
  $("btn-panel").addEventListener("click", () => { selectedId = null; $("panel").classList.toggle("open"); renderPanel(); });
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
    } catch (e) { $("set-status").textContent = "Unreachable: " + e.message + " — on a phone this usually means the URL is localhost, or Ollama needs CORS / a LAN address."; }
  });
  $("btn-new").addEventListener("click", () => {
    if (!confirm("Start a new village? Your saved village will be replaced on the next save.")) return;
    localStorage.removeItem(SAVE_KEY);
    startWorld((Math.random() * 1e9) | 0, null);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && world) saveGame(true); });
  window.addEventListener("beforeunload", () => { if (world) saveGame(true); });

  // Start overlay.
  const saved = loadGame();
  $("btn-continue").style.display = saved ? "" : "none";
  $("save-info").textContent = saved ? "Saved village found: Day " + saved.state.day + ", " + saved.state.villagers.length + " villagers." : "No saved village on this device yet.";
  $("btn-new-game").addEventListener("click", () => startWorld((Math.random() * 1e9) | 0, null));
  $("btn-continue").addEventListener("click", () => { const s = loadGame(); if (s) startWorld(0, s); });
}

let lastFrame = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  if (!world || !renderer) return;
  const dtReal = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const s = world.state;
  if (!s.paused) {
    const simDt = dtReal * s.speed;
    // Fixed substeps so the sim stays stable at 4x.
    let remaining = simDt;
    while (remaining > 0) { const h = Math.min(0.25, remaining); step(s, world.grid, h); remaining -= h; }
  }
  renderer.update(s, world.grid, dtReal, now / 1000);
  // HUD + panel refresh at ~4 Hz, not every frame.
  if (now - (loop._hudAt || 0) > 250) { loop._hudAt = now; renderHUD(); if ($("panel").classList.contains("open")) renderPanel(); }
  // Council loop.
  if (s.elapsed >= councilTimer) {
    councilTimer = s.elapsed + (ollama.intervalSec || 90);
    runCouncil(false);
  }
  // Autosave every 15s.
  if (now - lastSave > 15000) saveGame(true);
}

bindUI();
requestAnimationFrame(loop);

// Register the service worker for install/offline. Fail silently on
// file:// or in browsers that block it; the game still runs.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
