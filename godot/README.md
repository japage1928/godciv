# GodCiv — Godot rebuild, Phase 1 (Vertical slice)

Godot 4.7, Compatibility renderer, 2D top-down. Branch `godot-rebuild`.
The PWA on `main` is untouched and stays live until cutover.

## What Phase 1 is

The playable loop: one village at (24, 24) — six villagers spawn,
wander, work, eat, and sleep; the 4 core jobs (farmer, woodcutter,
miner, builder); a hut and a granary get built when the village can
afford them; the stockpile fills from real work; a god bar (Bless +
Whisper); and a log of what happens. Phase 0's empty world is still
underneath it all: seeded terrain, camera, day/night lighting, save/load.

## Files

- `project.godot` — Godot 4.7 project, Compatibility renderer, main
  scene `main.tscn`, 1280x720 viewport, canvas-items stretch.
- `main.tscn` — root node only; `scripts/main.gd` builds the tree.
- `icon.svg` — project icon (text SVG, no binary asset).
- `export_presets.cfg` — one Web preset, thread support off (plain
  GitHub Pages has no cross-origin isolation headers).
- `scripts/rng.gd` — mulberry32 + hash01, ported bit-for-bit from the
  PWA (`core.js`, `terrain.js`); unsigned-32-bit arithmetic throughout.
- `scripts/terrain.gd` — seeded terrain: 320x320 grid, height field,
  lakes, shore, old-block trees/stone, new-territory tree/stone rules.
  Ported from `terrain.js` + `grid.js`; no new terrain rules.
- `scripts/world.gd` — three TileMapLayers (ground + features +
  buildings) with a procedurally generated TileSet texture (no binary
  assets); chunked async generation with progress. Phase 1 adds hut /
  granary / towncenter / altar / road / crop-stage tiles and cell
  setters the village calls as the sim mutates the world.
- `scripts/game_clock.gd` — day/time/season/year, PWA phase
  boundaries (night 0.00–0.22 / 0.84–1.00, dawn 0.22–0.32, day
  0.32–0.72, dusk 0.72–0.84), 180 sim-seconds per day.
- `scripts/lighting.gd` — CanvasModulate day/night tint + a soft
  sun/moon PointLight2D following the camera.
- `scripts/camera.gd` — smooth pan/zoom; mouse drag + wheel, touch
  drag + pinch, WASD/arrows; zoom 0.25x–4x, clamped to the world.
- `scripts/hud.gd` — top bar, three rows: Day/Season/time/phase +
  status + Save; village numbers (Pop, Food, Wood, Stone, Ore, Faith,
  Morale); god bar (Bless button with cooldown, Whisper field +
  button). Log panel, bottom left, last 6 lines.
- `scripts/save_manager.gd` — save format version 2 (`user://savegame.json`).
  Stores seed, clock, camera, plus the village section (see
  `village.gd`). Terrain is deterministic from the seed. Version
  mismatch starts a fresh world — a Phase 0 (v1) save loads as a
  fresh village. No PWA save import.
- `scripts/main.gd` — wires clock, world, lighting, camera, HUD, and
  village; loads the save or starts fresh on seed 42; saves on Save /
  on close. The village is founded (or restored) only after world
  generation finishes, because it needs the terrain.
- `scripts/sim_grid.gd` — NEW in Phase 1. Mutable sim state on top
  of the immutable terrain: chopped/regrown trees, mined/weathered
  stone and ore, crop stages, buildings, roads. BFS pathfinding and
  nearest-cell searches for farm plots, trees, and mineral nodes.
- `scripts/villager.gd` — NEW in Phase 1. One villager: data, utility
  brain, movement, and drawing. Ported from `brain.js` think /
  scoreJob / doWork and the `step.js` villager loop, 4 jobs only.
  Drawn as a simple figure with a walk bob, a work swing, a carry
  bundle, and a gold dot for the leader — the animated-sprite look
  is a later phase.
- `scripts/village.gd` — NEW in Phase 1. The village: founding
  (towncenter, altar, hut, plaza roads, 6 villagers), the 20s
  expansion / 15s delegation / 30s tree-regrow and stone-weather
  timers, dawn (spoilage, births/deaths, morale, famine warnings),
  hut + granary demands, the Bless and Whisper god powers, and the
  save/load section.

## Terrain port notes

- Height: bilinear smoothstep interpolation of a 9x9 lattice from the
  first 81 mulberry32(seed) draws, span pinned at 48 cells — identical
  to the PWA, including the hash fallback lattice past 8x8.
- Water: old-block lake at (36, 36) r 6.5, plus ~1-in-12 chunk lakes
  (radius 3–6); water only where height < 0.62.
- Old block: exact RNG draw order (81 lattice, 18 farm growth, 90 tree
  attempts, 30 stone attempts), 13x13 founding clearing, farm plots.
- New territory: tree if hash01(..., 201) < 0.039 and ≥8 from center;
  stone if hash01(..., 202) < 0.013 and ≥7 from center; ore if height
  > 0.55 and hash01(..., 203) < 0.6.
- Ground tile height bands (low grass / grass / high grass / rock) are
  a render choice, not a sim rule.
- DEFERRED to Phase 4: the neighbor-village site clearing in
  `genChunkCells` (needs `pickVillageSites`, which arrives with
  neighbor villages). Terrain itself is complete without it.

## Phase 1 port notes

- Founding matches the PWA's `newWorld`: towncenter (24, 24), altar
  (26, 24), hut (22, 21); stockpile food 24 / wood 24 / stone 12;
  faith 55, morale 60, pop cap 12, fund 20; six villagers (first is
  the leader) at the PWA's spawn spots; plaza road ring at Chebyshev
  2 plus the farm road west; 18 farm plots west of center.
- Villager brains are the PWA's `think` / `scoreJob` / `doWork`
  with the 4 core jobs only. Delegation is the PWA's `delegateRoles`
  reduced to those jobs; leftovers fill as farmers. Hauling is a
  state (carry full, walk home, deposit, keep 1 as personal goods),
  not a job. Eating takes personal goods first, then the stockpile
  (most-abundant kind first, coins when the villager has them, a
  free ration when they don't).
- Building demands are the PWA's `computeDemands` hut + granary
  entries only. The lot spot is a simplified scorer (infill-first,
  cluster bonus, dwelling spacing, out of the farm district) — the
  PWA's street-frontage rule and the full lot/street system are
  deferred to a later phase, as are farm-bed expansion, the market,
  festivals, tech, and the street paving in `expandVillage`.
- Stone/ore amounts on old-block cells use the new-territory hash
  rule (stone 8 + floor(hash * 5), ore 4 + floor(hash * 3)) instead
  of the PWA's stream-drawn amounts; the values differ slightly
  from the PWA's and are identical on every load.
- Dawn runs spoilage (season keep-cap, doubled by a granary), the
  PWA's birth/death rolls, the dawn coin, homes, morale, low-morale
  leavers, and famine warnings. Weather is always clear until
  Phase 3; there are no festivals, deer, raiders, or disasters yet.
- Bless is the PWA's god action verbatim (+10 food, +5 faith,
  +2 morale, 20 sim-second cooldown). Whisper logs the text.
- Save format is version 2: the village section stores villagers,
  stockpile, buildings, build queue, crop stages, stone/tree/road
  deltas, timers, cooldowns, stats, and the last 20 log lines. The
  grid itself is rebuilt from the seed on load.

## Run it

- Editor: open this folder in Godot 4.7 (or the web editor at
  editor.godotengine.org), open `main.tscn`, press Play.
- Headless syntax + smoke run (no window, quits after 240 frames):
  `godot --headless --path godot --quit-after 240`
- Check one script without running the game:
  `godot --headless --check-only --script godot/scripts/terrain.gd`

## Defaults

Seed 42 (same as the PWA's world). Clock speed 3.0 sim-seconds per
real second (PWA 1x = 1.0), so a day lasts 60 real seconds. Camera
starts over the village center (24, 24). No LLM / model / AI-API code
anywhere in this project, ever.
