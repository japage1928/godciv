// Headless server-mode check: start server/server.js on a test port
// with a v10-format world file, prove it migrates on load, prove
// GET /api/state deserializes with the v11 systems present, and prove
// POST /api/god returns updated state. Run: npm test (or: node tests/server_smoke.mjs)
import assert from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newWorld, step, serialize, deserialize, SAVE_VERSION } from "../src/sim.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 34711;
const BASE = "http://127.0.0.1:" + PORT;

// A v10-format world file: run 5 days, strip every v11-only field,
// set version 1. The server must migrate it on startup, not reset it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "godciv-server-"));
const worldFile = path.join(tmp, "world.json");
let savedVillagers = 0;
{
  const { state, grid } = newWorld(42);
  for (let i = 0; i < 5 * 180 * 4; i++) step(state, grid, 0.25);
  const saved = JSON.parse(serialize(state, grid));
  savedVillagers = saved.villagers.length;
  for (const k of ["season", "weather", "morale", "moraleReasons", "celebration", "celebrationBoostUntil", "tech", "lowMoraleDawns", "lastLeaveAt", "stormAt"]) delete saved[k];
  saved.version = 1;
  for (const v of saved.villagers) { delete v.education; delete v.tool; }
  fs.writeFileSync(worldFile, JSON.stringify(saved));
}

const child = spawn(process.execPath, [path.join(ROOT, "server", "server.js")], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", WORLD_FILE: worldFile, GODCIV_SEED: "42", GODCIV_SPEED: "4" },
  stdio: ["ignore", "pipe", "pipe"],
});
let childOut = "";
child.stdout.on("data", (d) => { childOut += d; });
child.stderr.on("data", (d) => { childOut += d; });

async function waitForHealth(timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(BASE + "/api/health");
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    if (Date.now() - start > timeoutMs) throw new Error("server did not come up: " + childOut);
    await new Promise((r) => setTimeout(r, 200));
  }
}

try {
  const health = await waitForHealth();
  assert.equal(health.day, 6, "migrated world must resume on its saved day, got day " + health.day);
  // Migration must keep every saved villager: none lost, none
  // duplicated. The count may grow by one: birth rolls are
  // stochastic and stream-sensitive, and the server ticks at 4x
  // while the test polls, so a dawn can pass before the first
  // health read. The bar is no-loss, not an exact headcount.
  assert.ok(health.villagers >= savedVillagers && health.villagers <= savedVillagers + 1,
    "migrated world must keep its villagers, saved " + savedVillagers + ", serving " + health.villagers);

  // GET /api/state: the raw save JSON, deserializable, v11 systems present.
  const stateRes = await fetch(BASE + "/api/state", { cache: "no-store" });
  assert.ok(stateRes.ok, "GET /api/state must succeed");
  const { state, grid } = deserialize(await stateRes.text());
  assert.equal(state.version, SAVE_VERSION, "served state must stamp the current save version");
  assert.ok(state.season, "served state must carry a season");
  assert.ok(state.weather && state.weather.kind, "served state must carry weather");
  assert.equal(typeof state.morale, "number", "served state must carry morale");
  assert.ok(state.tech && typeof state.tech.level === "number", "served state must carry tech");
  assert.ok(grid.length === 48, "served grid must rebuild");

  // POST /api/god: a bless returns ok plus the updated state.
  const foodBefore = state.stockpile.food;
  const godRes = await fetch(BASE + "/api/god", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "bless" }),
  });
  assert.ok(godRes.ok, "POST /api/god must succeed");
  const god = await godRes.json();
  assert.ok(god.ok, "bless must be accepted, got " + JSON.stringify(god));
  assert.ok(god.state, "god response must carry updated state");
  const after = deserialize(JSON.stringify(god.state));
  assert.equal(after.state.stockpile.food, foodBefore + 10, "bless must add 10 food on the server");
  assert.ok(after.state.stats.blessings >= 1, "bless must be counted");

  // The world file on disk is re-persisted with the migrated version.
  const onDisk = JSON.parse(fs.readFileSync(worldFile, "utf8"));
  assert.equal(onDisk.version, SAVE_VERSION, "persisted world file must carry the migrated version");
  console.log("server smoke test passed: day", health.day, "villagers", health.villagers, "bless ok");
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  if (!child.killed) child.kill("SIGKILL");
  fs.rmSync(tmp, { recursive: true, force: true });
}
