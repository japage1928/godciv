// HUD smoke test for v12: every element id main.js touches must exist
// in index.html, ids must be unique, the v12 chips and god bar must be
// present, and HUD text must carry no em-dashes (voice law).
// Run: npm test  (or: node tests/hud_smoke.mjs)
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "..", "index.html"), "utf8");
const main = fs.readFileSync(path.join(root, "..", "src", "main.js"), "utf8");

// Every id main.js looks up: the $ helper, getElementById, and
// #id query selectors, in either quote style.
const touched = new Set();
for (const m of main.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) touched.add(m[1]);
for (const m of main.matchAll(/\$\(\s*["']([^"']+)["']\s*\)/g)) touched.add(m[1]);
for (const m of main.matchAll(/querySelector\(\s*["']#([^"'\s]+)["']/g)) touched.add(m[1]);
assert.ok(touched.size > 20, "main.js must touch many ids, found " + touched.size);

// Every id declared in the HTML, and duplicates are a bug: two
// elements with one id means lookups land on the wrong one.
// Ids main.js injects itself (panel templates) count as declared too:
// they exist at runtime once renderPanel runs, which is also when the
// code that touches them runs.
const declared = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
for (const m of main.matchAll(/id="([^"]+)"/g)) declared.push(m[1]);
const declaredSet = new Set(declared);
const dupes = declared.filter((id, i) => declared.indexOf(id) !== i);
assert.deepEqual(dupes, [], "duplicate ids in index.html: " + [...new Set(dupes)].join(", "));

const missing = [...touched].filter((id) => !declaredSet.has(id));
assert.deepEqual(missing, [], "main.js touches ids missing from index.html: " + missing.join(", "));
console.log("HUD ids: " + touched.size + " touched, all present, " + declared.length + " declared, no duplicates");

// The v12 mockup chips and bars. Day/clock/phase share one chip and
// season/year/weather share another (phone width); the data is all
// live in renderHUD. Resources are split: food, fish, meat, wood,
// stone, ore, each its own chip.
const required = [
  "stat-food", "stat-fish", "stat-meat", "stat-wood", "stat-stone", "stat-ore",
  "stat-faith", "faith-fill", "stat-day", "stat-season", "stat-morale",
  "stat-tech", "stat-festival", "stat-pop", "stat-view", "stat-mode",
  "version-chip", "stat-raid", "stat-effects", "hud", "godbar", "top-actions",
  "panel", "panel-title", "panel-body", "directive-label",
  "btn-panel", "btn-zoom-out", "btn-zoom-in", "btn-rotate-l", "btn-rotate-r",
  "btn-speed", "btn-pause", "btn-save", "btn-settings",
  "start-overlay", "mode-row", "btn-mode-local", "btn-mode-server",
  "btn-continue", "btn-new-game", "btn-join-server",
  "settings-dialog", "set-enabled", "set-url", "set-model", "set-interval",
  "toast", "whisper-box", "whisper-input", "whisper-send", "whisper-cancel",
  "arm-banner", "scene", "scene-wrap",
];
for (const id of required) assert.ok(declaredSet.has(id), "v12 HUD id missing: " + id);
console.log("v12 chips, toolbar, god bar, and raid chip all present");

// God actions: all six mockup actions must be offered as data-god
// buttons in the bar (main.js dispatches them via dataset.god).
for (const action of ["bless", "drought", "flood", "fire", "plague", "quake"]) {
  assert.ok(html.includes('data-god="' + action + '"'), "god action missing from the god bar: " + action);
}
assert.ok(main.includes("dataset.god"), "main.js must dispatch god buttons via dataset.god");
console.log("god bar offers all six actions including plague");

// No em-dashes in user-facing HUD text.
const hudText = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
assert.ok(!hudText.includes("\u2014"), "index.html user-facing text must not contain em-dashes");

console.log("hud_smoke: all checks passed");
