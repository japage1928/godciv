# GodCiv — Godot rebuild, Phase 0 (Scaffold)

Godot 4.7, Compatibility renderer, 2D top-down. Branch `godot-rebuild`.
The PWA on `main` is untouched and stays live until cutover.

## What Phase 0 is

An empty world you can move through a full day cycle: seeded terrain,
a TileMap world, a smooth pan/zoom camera (mouse + touch), day/night
lighting, a one-bar HUD, and a versioned save/load stub for a fresh
world. No villagers, no buildings, no god powers yet — those are
Phase 1+.

## Files

- `project.godot` — Godot 4.7 project, Compatibility renderer, main
  scene `main.tscn`, 1280x720 viewport, canvas-items stretch.
- `main.tscn` — root node only; `scripts/main.gd` builds the tree.
- `icon.svg` — project icon (text SVG, no binary asset).
- `scripts/rng.gd` — mulberry32 + hash01, ported bit-for-bit from the
  PWA (`core.js`, `terrain.js`); unsigned-32-bit arithmetic throughout.
- `scripts/terrain.gd` — seeded terrain: 320x320 grid, height field,
  lakes, shore, old-block trees/stone, new-territory tree/stone rules.
  Ported from `terrain.js` + `grid.js`; no new terrain rules.
- `scripts/world.gd` — two TileMapLayers (ground + features) with a
  procedurally generated TileSet texture (no binary assets); chunked
  async generation with progress.
- `scripts/game_clock.gd` — day/time/season/year, PWA phase
  boundaries (night 0.00–0.22 / 0.84–1.00, dawn 0.22–0.32, day
  0.32–0.72, dusk 0.72–0.84), 180 sim-seconds per day.
- `scripts/lighting.gd` — CanvasModulate day/night tint + a soft
  sun/moon PointLight2D following the camera.
- `scripts/camera.gd` — smooth pan/zoom; mouse drag + wheel, touch
  drag + pinch, WASD/arrows; zoom 0.25x–4x, clamped to the world.
- `scripts/hud.gd` — one top bar: Day, Season, time, phase, status,
  Save button.
- `scripts/save_manager.gd` — save format version 1 (`user://savegame.json`).
  Stores seed, clock, camera only; terrain is deterministic from the
  seed. Version mismatch starts a fresh world. No PWA save import.
- `scripts/main.gd` — wires clock, world, lighting, camera, HUD;
  loads the save or starts fresh on seed 42; saves on Save / on close.

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
