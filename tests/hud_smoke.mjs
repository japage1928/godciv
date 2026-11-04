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
  "stat-furniture", "stat-pottery", "stat-ironware", "stat-wares",
  "stat-faith", "faith-fill", "stat-day", "stat-season", "stat-morale",
  "stat-tech", "stat-festival", "stat-pop", "stat-view", "stat-mode",
  "version-chip", "stat-raid", "stat-effects", "hud", "godbar", "top-actions",
  "panel", "panel-title", "panel-body", "directive-label", "panel-close",
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

// Single chips row: #hud holds exactly 2 .hud-row blocks, the first
// a single row with every chip in order (including the product
// chips), the second the #top-actions toolbar. The single row must
// scroll horizontally, never wrap.
const hudStart = html.indexOf('<div id="hud">');
assert.ok(hudStart >= 0, "#hud must exist in index.html");
const hudEnd = html.indexOf('<div id="scene-wrap">', hudStart);
assert.ok(hudEnd > hudStart, "#hud must end before #scene-wrap");
const hudSection = html.slice(hudStart, hudEnd);
const hudRows = [...hudSection.matchAll(/<div class="hud-row"[^>]*>/g)];
assert.equal(hudRows.length, 2, "exactly 2 .hud-row blocks inside #hud (chips row + top-actions), found " + hudRows.length);
const firstRow = hudSection.slice(hudRows[0].index, hudRows[1].index);
const secondRow = hudSection.slice(hudRows[1].index);
assert.ok(secondRow.includes('id="top-actions"'), "the second .hud-row must be #top-actions");
const chipIdsInOrder = [
  "stat-food", "stat-fish", "stat-meat", "stat-wood", "stat-stone", "stat-ore",
  "stat-furniture", "stat-pottery", "stat-ironware", "stat-wares",
  "faith-wrap", "stat-faith", "faith-fill", "stat-day", "stat-season", "stat-morale",
  "stat-raid", "stat-effects", "stat-tech", "stat-festival", "stat-pop",
  "stat-view", "stat-mode", "version-chip",
];
let prevIdx = -1;
for (const id of chipIdsInOrder) {
  const idx = firstRow.indexOf('id="' + id + '"');
  assert.ok(idx >= 0, "first .hud-row must contain chip id: " + id);
  assert.ok(idx > prevIdx, "first .hud-row chips must stay in order, out of order at: " + id);
  prevIdx = idx;
}
for (const id of ["btn-panel", "btn-zoom-out", "btn-zoom-in", "btn-rotate-l", "btn-rotate-r", "btn-speed", "btn-pause", "btn-save", "btn-settings"]) {
  assert.ok(secondRow.includes('id="' + id + '"'), "the #top-actions row must contain toolbar button: " + id);
}
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
assert.ok(styleMatch, "index.html must carry a <style> block");
const hudRowRule = styleMatch[1].match(/\.hud-row\s*\{[^}]*\}/);
assert.ok(hudRowRule, "the .hud-row CSS rule must exist");
assert.ok(hudRowRule[0].includes("flex-wrap: nowrap"), "the .hud-row CSS rule must contain flex-wrap: nowrap");
assert.ok(!hudRowRule[0].includes("flex-wrap: wrap"), "the .hud-row CSS rule must not contain flex-wrap: wrap");
console.log("single chips row: 2 .hud-row blocks, all chips in order, toolbar separate, no wrapping");

// God actions: all six mockup actions must be offered as data-god
// buttons in the bar (main.js dispatches them via dataset.god).
for (const action of ["bless", "drought", "flood", "fire", "plague", "quake"]) {
  assert.ok(html.includes('data-god="' + action + '"'), "god action missing from the god bar: " + action);
}
assert.ok(html.includes('data-god="muster"'), "god action missing from the god bar: muster");
assert.ok(html.includes('data-god="envoy"'), "god action missing from the god bar: envoy");
assert.ok(main.includes("dataset.god"), "main.js must dispatch god buttons via dataset.god");
console.log("god bar offers all six actions including plague");

// Neighbor villages: the panel lists known villages with relations,
// a Visit button, and a suggest-trade form per village.
assert.ok(main.includes("Neighbor villages"), "the panel must list neighbor villages");
assert.ok(main.includes("Suggest trade"), "the panel must offer a suggest-trade form");
assert.ok(main.includes("data-visit"), "the panel must offer a Visit button per village");
console.log("neighbor villages: relations panel + visit + suggest-trade");

// Alliances: the relations card shows alliance status and offers a
// Suggest alliance button per known village, wired to the
// suggest_alliance god action.
assert.ok(main.includes("data-suggest-ally"), "the panel must offer a Suggest alliance button per village");
assert.ok(main.includes('doGod("suggest_alliance"'), "the alliance button must call the suggest_alliance god action");
assert.ok(main.includes("Allied: caravans carry more"), "the panel must show allied status");
console.log("alliances: status + suggest-alliance button wired");

// War: the relations card names an active war with its exhaustion,
// names rivalry when trade has stopped, and never offers the god a
// way to declare one.
assert.ok(main.includes("At war."), "the panel must name an active war");
assert.ok(main.includes("War exhaustion"), "the panel must show war exhaustion");
assert.ok(main.includes("Rivalry: trade has stopped"), "the panel must name rivalry");
assert.ok(!main.includes('doGod("declare_war"'), "the panel must never offer to declare war");
console.log("war: status + exhaustion + rivalry, no declare-war button");

// Defense HUD: the raid banner reports guards posted and towers
// manned, and the panel reports the defense section.
assert.ok(main.includes("towers manned"), "the raid banner must report towers manned");
assert.ok(main.includes("guards posted"), "the panel must report guards posted");
console.log("defense HUD: banner + panel report posts and manning");

// Panel close: an X button lives in the static panel header (never
// re-rendered away), and all three close paths funnel through one
// closePanel helper — X tap, empty-ground tap with a villager
// selected, and re-tapping the selected villager. The harness has
// no DOM, so these are code-path assertions, not click tests.
assert.ok(html.includes('id="panel-close"'), "the panel header must carry an explicit close button");
assert.ok(main.includes("function closePanel()"), "main.js must define the single closePanel path");
assert.ok(main.includes('$("panel-close").addEventListener("click", closePanel)'), "the X button must be wired to closePanel");
assert.ok(main.includes("if (pick.id === selectedId) { closePanel(); return; }"), "re-tapping the selected villager must close the panel");
assert.ok(main.includes("else if (selectedId !== null)"), "an empty-ground tap with a villager selected must close the panel");
console.log("panel close: X button + ground-tap + re-tap paths all present");

// No em-dashes in user-facing HUD text.
const hudText = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
assert.ok(!hudText.includes("\u2014"), "index.html user-facing text must not contain em-dashes");

console.log("hud_smoke: all checks passed");
