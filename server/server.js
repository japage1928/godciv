// GodCiv always-on server: the same sim rules as the PWA, ticking on a
// server whether any phone is open or not. No dependencies, Node 18+.
// The phone client polls GET /api/state and posts god actions to
// POST /api/god; the world persists to WORLD_FILE so a restart (or a
// deploy) resumes the same village.
//
// Env: PORT (default 3000), HOST (default 127.0.0.1 — loopback only;
// put a reverse proxy with TLS in front for phone access),
// WORLD_FILE (default ./world.json in the working directory),
// GODCIV_SEED (default 42, used only when no save exists),
// GODCIV_SPEED (sim-seconds per real second, default 1).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  newWorld,
  step,
  applyGod,
  serialize,
  deserialize,
} from "../src/sim.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const WORLD_FILE = path.resolve(process.env.WORLD_FILE || "./world.json");
const SEED = Number(process.env.GODCIV_SEED || 42);
const SPEED = Number(process.env.GODCIV_SPEED || 1);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let world;
if (fs.existsSync(WORLD_FILE)) {
  world = deserialize(fs.readFileSync(WORLD_FILE, "utf8"));
  console.log(`Loaded saved world: Day ${world.state.day}, ${world.state.villagers.length} villagers.`);
} else {
  world = newWorld(SEED);
  console.log(`New village (seed ${SEED}).`);
}

function persist() {
  try {
    const tmp = WORLD_FILE + ".tmp";
    fs.writeFileSync(tmp, serialize(world.state, world.grid));
    fs.renameSync(tmp, WORLD_FILE);
  } catch (err) {
    console.error("persist failed:", err.message);
  }
}

// Fixed 0.25s substeps, same as the phone client: stable at any speed.
const TICK_MS = 250;
const tickTimer = setInterval(() => {
  try {
    let remaining = 0.25 * SPEED;
    while (remaining > 0) {
      const h = Math.min(0.25, remaining);
      step(world.state, world.grid, h);
      remaining -= h;
    }
  } catch (err) {
    console.error("tick failed:", err.message);
  }
}, TICK_MS);
let ticksSinceSave = 0;
const saveTimer = setInterval(() => {
  ticksSinceSave++;
  if (ticksSinceSave >= 60) { // every 15s at 250ms ticks
    ticksSinceSave = 0;
    persist();
  }
}, TICK_MS);

function shutdown(signal) {
  clearInterval(tickTimer);
  clearInterval(saveTimer);
  persist();
  console.log(`Saved world on ${signal}. Day ${world.state.day}.`);
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};
const STATIC_OK = new Set(["/", "/index.html", "/sw.js", "/manifest.webmanifest", "/icon.svg"]);
function isStaticPath(p) {
  return STATIC_OK.has(p) || p.startsWith("/src/") || p.startsWith("/vendor/");
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function readBody(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const GOD_ACTIONS = new Set(["bless", "drought", "flood", "fire", "plague", "quake", "hut", "villager", "directive", "whisper"]);

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;
    if (req.method === "GET" && p === "/api/health") {
      const s = world.state;
      return sendJson(res, 200, {
        ok: true, day: s.day, time: s.time, elapsed: s.elapsed,
        villagers: s.villagers.length, populationCap: s.populationCap,
        speed: SPEED, seed: s.seed, updatedAt: Date.now(),
      });
    }
    if (req.method === "GET" && p === "/api/state") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return res.end(serialize(world.state, world.grid));
    }
    if (req.method === "POST" && p === "/api/god") {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return sendJson(res, 400, { ok: false, reason: "Bad JSON body." });
      }
      const action = body && body.action;
      if (!GOD_ACTIONS.has(action)) return sendJson(res, 400, { ok: false, reason: "Unknown god action." });
      const x = typeof body.x === "number" ? body.x : null;
      const z = typeof body.z === "number" ? body.z : null;
      const opts = {};
      if (typeof body.focusJob === "string") opts.focusJob = body.focusJob;
      if (typeof body.text === "string") opts.text = body.text.slice(0, 200);
      const result = applyGod(world.state, world.grid, action, x, z, opts);
      console.log(`god ${action} -> ${result.ok ? "ok" : result.reason || "rejected"}`);
      persist();
      return sendJson(res, 200, { ...result, state: JSON.parse(serialize(world.state, world.grid)) });
    }
    if (req.method === "GET" && isStaticPath(p)) {
      const file = p === "/" ? "index.html" : p.slice(1);
      const abs = path.resolve(ROOT, file);
      if (!abs.startsWith(ROOT + path.sep)) return sendJson(res, 403, { ok: false, reason: "Forbidden." });
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return sendJson(res, 404, { ok: false, reason: "Not found." });
      const ext = path.extname(abs);
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-cache" });
      return fs.createReadStream(abs).pipe(res);
    }
    return sendJson(res, 404, { ok: false, reason: "Not found." });
  } catch (err) {
    console.error("request failed:", err.message);
    return sendJson(res, 500, { ok: false, reason: "Server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`GodCiv server listening on ${HOST}:${PORT} (seed ${world.state.seed}, speed ${SPEED}x, world file ${WORLD_FILE})`);
});
