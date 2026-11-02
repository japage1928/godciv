// Ollama council: opt-in, leader-only, advisory only. The model never
// writes sim state. It returns {goal, focus_job, whisper}; everything is
// validated and clamped before the sim reads it, same as the Luanti mod's
// ollama.lua. If the model is unreachable, invalid, or disabled, the
// utility-brain fallback council runs instead.

import { JOBS } from "./sim.js";

const DEFAULTS = { enabled: false, url: "http://localhost:11434/api/chat", model: "qwen3:0.6b", intervalSec: 90 };

export function loadOllamaSettings() {
  try {
    const raw = localStorage.getItem("godciv-ollama");
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

export function saveOllamaSettings(s) {
  localStorage.setItem("godciv-ollama", JSON.stringify(s));
}

export function stripThink(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function parseCouncil(text) {
  const clean = stripThink(text);
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
  if (typeof obj !== "object" || !obj) return null;
  const goal = typeof obj.goal === "string" ? obj.goal.slice(0, 160) : "";
  const focus = JOBS.includes(obj.focus_job) ? obj.focus_job : null;
  const whisper = typeof obj.whisper === "string" ? obj.whisper.slice(0, 200) : "";
  if (!goal && !focus && !whisper) return null;
  return { goal, focus_job: focus, whisper, source: "ollama" };
}

// Fallback council from the same utility logic the villagers use.
export function fallbackCouncil(state) {
  const s = state.stockpile;
  const edible = s.food + s.fish + s.meat;
  let focus = "farmer", goal = "Keep the village fed.";
  if (edible < 20) { focus = "farmer"; goal = "Food is low. Focus the village on farming, fishing, and hunting until the stockpile recovers."; }
  else if (s.stone < 12 || state.buildQueue.length) { focus = "miner"; goal = "Stone is short for building. Send hands to the rock."; }
  else if (s.wood < 12) { focus = "miner"; goal = "Wood and stone are the bottleneck for the next hut."; }
  else if (state.faith < 40) { focus = "builder"; goal = "Faith is low. Build, bless, and let the people see the god at work."; }
  else { goal = "The village holds. Grow food, raise a hut, and keep faith above half."; }
  return { goal, focus_job: focus, whisper: goal, source: "utility" };
}

function councilSummary(state) {
  const s = state.stockpile;
  const counts = {};
  for (const v of state.villagers) counts[v.job] = (counts[v.job] || 0) + 1;
  return {
    day: state.day, faith: state.faith,
    stockpile: s, population: state.villagers.length, cap: state.populationCap,
    jobs: counts, buildQueue: state.buildQueue.length,
    directive: state.directive,
    hungry: state.villagers.filter((v) => v.hunger > 60).length,
    sick: state.villagers.filter((v) => v.sick).length,
  };
}

export async function fetchCouncil(state, settings, signal) {
  const summary = councilSummary(state);
  const res = await fetch(settings.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: [
        { role: "system", content: "You are the village elder advising a god. Reply with ONLY one JSON object: {\"goal\": \"<=160 chars\", \"focus_job\": one of farmer, miner, fisher, hunter, builder, hauler, \"whisper\": \"<=200 chars\"}. No other text. The god cannot control villagers directly; advice is a nudge only." },
        { role: "user", content: "Village summary: " + JSON.stringify(summary) + ". What should the god nudge toward?" },
      ],
    }),
    signal,
  });
  if (!res.ok) throw new Error("Ollama HTTP " + res.status);
  const data = await res.json();
  const content = data?.message?.content || "";
  const parsed = parseCouncil(content);
  if (!parsed) throw new Error("Ollama reply was not valid council JSON.");
  return parsed;
}

export async function testOllama(settings) {
  const res = await fetch(settings.url.replace(/\/api\/chat$/, "/api/tags"), { method: "GET" });
  if (!res.ok) throw new Error("Ollama HTTP " + res.status);
  const data = await res.json();
  const models = (data.models || []).map((m) => m.name);
  return { ok: true, models, hasModel: models.includes(settings.model) };
}
