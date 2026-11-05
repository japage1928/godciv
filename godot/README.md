# GodCiv — Godot rebuild, Phase 2 (Economy + people)

Godot 4.7, Compatibility renderer, 2D top-down. Branch `godot-rebuild`.
The PWA on `main` is untouched and stays live until cutover.

## What Phase 2 is

The village becomes an economy: all 13 jobs (farmer, woodcutter,
miner, fisher, hunter, builder, hauler, teacher, carpenter, potter,
smith, factory, guard); a town-center market where villagers trade
surplus goods and buy better tools; a school that teaches children
(education 0–10, faster with a teacher, who is paid from the fund);
a class ladder (commoner / artisan / merchant / gentry) from
standing, and housing tiers that follow the best occupant; tech
progress from educated adults (Stone tools → Modern city); deer
that wander, flee, and get hunted; households (everyone sharing a
home); and a tap-to-open villager card with job, traits, skills,
education, tool, class, coins, goods, home, household, and parents.
Phase 1's playable loop is still underneath it all: the village,
the 4 core jobs, hut + granary, Bless + Whisper, and the log.

## File structure

```
godot/
  project.godot          Godot 4.7, Compatibility renderer, main scene scenes/main.tscn
  scenes/
    main.tscn            root node only; scripts/core/main.gd builds the tree
  scripts/
    core/                main.gd, game_clock.gd, save_manager.gd, rng.gd
    world/               terrain.gd, world.gd, sim_grid.gd, camera.gd, lighting.gd
    sim/                 village.gd, villager.gd, economy.gd, deer.gd
    ui/                  hud.gd, villager_card.gd
  assets/
    art/                 (empty for now — art lands here in later phases)
    audio/               (empty for now — audio lands here in later phases)
  icon.svg               project icon (text SVG, no binary asset)
  export_presets.cfg     one Web preset, thread support off (plain GitHub
                         Pages has no cross-origin isolation headers)
```

Where new code goes: sim rules in `scripts/sim/`, world/terrain
in `scripts/world/`, UI in `scripts/ui/`, wiring and saves in
`scripts/core/`, scenes in `scenes/`, art/audio in `assets/`.
Every script keeps its `class_name`; references by class name are
path-independent, and the only `res://` paths are the main scene
in `project.godot` and the main script in `scenes/main.tscn`.

## Files

- `scripts/core/main.gd` — wires clock, world, lighting, camera,
  HUD, and village; loads the save or starts fresh on seed 42;
  saves on Save / on close. The village is founded (or restored)
  only after world generation finishes, because it needs the
  terrain. Tap-to-select: a tap (press + release under 12px and
  500ms) opens the nearest villager's card within 24px, or closes
  it when nothing is near.
- `scripts/core/game_clock.gd` — day/time/season/year, PWA phase
  boundaries (night 0.00–0.22 / 0.84–1.00, dawn 0.22–0.32, day
  0.32–0.72, dusk 0.72–0.84), 180 sim-seconds per day.
- `scripts/core/save_manager.gd` — save format version 2
  (`user://savegame.json`). Stores seed, clock, camera, plus the
  village section (see `village.gd`). Phase 2 keeps version 2:
  the new fields (tech, market timer, deer, households, building
  tiers, villager education/class/parents/tool tick) live inside
  the v2 village section and every reader defaults them, so a
  Phase 1 save loads with Phase 2 defaults. Terrain is
  deterministic from the seed. Version mismatch starts a fresh
  world. No PWA save import.
- `scripts/core/rng.gd` — mulberry32 + hash01, ported bit-for-bit
  from the PWA (`core.js`, `terrain.js`); unsigned-32-bit
  arithmetic throughout.
- `scripts/world/terrain.gd` — seeded terrain: 320x320 grid, height
  field, lakes, shore, old-block trees/stone, new-territory
  tree/stone rules. Ported from `terrain.js` + `grid.js`; no new
  terrain rules.
- `scripts/world/world.gd` — three TileMapLayers (ground + features
  + buildings) with a procedurally generated TileSet texture (no
  binary assets); chunked async generation with progress. Phase 2
  adds workshop / kiln / smithy / factory / school / healer / well
  / shrine / longhouse / greathall / farmhouse tiles.
- `scripts/world/sim_grid.gd` — mutable sim state on top of the
  immutable terrain: chopped/regrown trees, mined/weathered stone
  and ore, crop stages, buildings, roads. BFS pathfinding and
  nearest-cell searches for farm plots, trees, mineral nodes, and
  shores. Phase 2 adds shore cells (fishing), farm-district
  helpers (west block + N/E/S satellite wedges), and farm-bed
  cells cleared beside a new farmhouse (cap 144 farm cells).
- `scripts/world/camera.gd` — smooth pan/zoom; mouse drag + wheel,
  touch drag + pinch, WASD/arrows; zoom 0.25x–4x, clamped to the
  world.
- `scripts/world/lighting.gd` — CanvasModulate day/night tint + a
  soft sun/moon PointLight2D following the camera.
- `scripts/sim/village.gd` — the village: founding (towncenter,
  altar, hut, plaza roads, 6 villagers), the 20s expansion / 15s
  delegation / 30s tree-regrow, stone-weather, and market timers,
  dawn (spoilage, births/deaths, teacher pay, schooling, tech,
  shrine blessing, deer top-up, homes, classes, housing tiers,
  morale, low-morale leavers, famine warnings), the full
  `computeDemands` (hut/longhouse/greathall/farmhouse/granary/
  well/workshop/kiln/smithy/factory/shrine/school/healer), the
  Bless and Whisper god powers, and the save/load section.
- `scripts/sim/villager.gd` — one villager: data, utility brain,
  movement, and drawing. Ported from `brain.js` think / scoreJob /
  doWork and the `step.js` villager loop, all 13 jobs. Drawn as a
  simple figure with a walk bob, a work swing, a carry bundle, and
  a gold dot for the leader — the animated-sprite look is a later
  phase.
- `scripts/sim/economy.gd` — NEW in Phase 2. The market, tools,
  class ladder, housing tiers, and tech data. Static functions
  taking the village node, ported from `brain.js` runMarket /
  updateClasses / updateHousingTiers and `core.js` standing /
  class / tier / prices / recipes / tech tables.
- `scripts/sim/deer.gd` — NEW in Phase 2. A deer: wanders, flees
  hunters, gets hunted. Ported from `core.js` makeDeer and the
  `step.js` deer loop. Deer are not in the terrain; the village
  owns the tick and restores the herd at dawn (cap 4, winter 2).
- `scripts/ui/hud.gd` — top bar, four rows: Day/Season/time/phase
  + status + Save; village numbers (Pop, Food, Wood, Stone, Ore,
  Faith, Morale); economy numbers (Fish, Meat, Furniture, Pottery,
  Ironware, Wares, Fund, Tech); god bar (Bless button with
  cooldown, Whisper field + button). Log panel, bottom left, last
  6 lines. Hosts the villager card on the right.
- `scripts/ui/villager_card.gd` — NEW in Phase 2. Read-only
  villager card: name and class, job and assignment, age and sex,
  traits, education and tool, coins and standing, all 13 skills,
  carried goods, home and household members, parents, and
  hunger/energy/health. No god actions per villager.

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

## Phase 2 port notes

- Delegation is the PWA's `delegateRoles` in full: all 13 desired
  counts, the three-pass trim (surpluses first from the end of the
  order, then protected builder/guard slots, then last resort),
  guards picked first and brave-first, leftovers fill as haulers,
  students and toddlers get no assignment. Fishers need a shore;
  guards need towers/walls, so none are delegated yet.
- The market is the PWA's `runMarket` verbatim in shape: up to 3
  rounds, at most 3 trades, one log line, then one tool upgrade per
  round (sturdy needs a workshop, fine needs Bronze craft, steel
  needs Steel works; coins to the fund, ore from the stockpile).
- Production follows the PWA's recipe rule: inputs leave the
  stockpile only at the workplace, only when the whole recipe fits
  the carry, and only while the stockpile holds less than
  PRODUCTION_WANT (12) of the output.
- The school gates education and tech: students are 3–8 dawns old,
  gain +1 education at dawn (+2 with a teacher, who is paid 1 coin
  from the fund); educated adults (age 9+, education 3+ / 5+)
  push tech progress, capped at +12 a dawn, with the PWA's
  thresholds (80, 120, 200, 300, 420, 560) and population gates
  (0, 0, 0, 14, 20, 26, 32). Reaching the last tier adds 10 to
  the population cap. Factory demand needs tech level 5, per the
  PWA — not level 3.
- Households are everyone sharing a home; each occupied home keeps
  a stable id. Parents are recorded at birth going forward (two
  fertile adults of opposite sex, when both exist); founders keep
  no record. The deliberation/intent/model-call parts of the
  design doc are NOT ported: no LLM anywhere in this project, ever.
- Building demands are the PWA's `computeDemands` minus wall and
  tower (Phase 3). Upgrades grow in place: a longhouse replaces
  the oldest hut (+4 cap), a great hall the oldest longhouse (+6).
  A farmhouse clears one 3x3 bed beside itself (cap 144 farm
  cells) and houses 2. The lot spot is still the simplified
  scorer (infill-first, cluster bonus, dwelling spacing, out of
  the farm district) — the PWA's street-frontage rule and the full
  lot/street system are deferred to a later phase, as are street
  paving and farm-bed expansion beyond the farmhouse bed.
- Builders are paid 2 coins from the fund per finished build, and
  work twice as fast at tech level 4 (Steam and brick). Tool
  bonuses: fine +1, steel +1 more on harvest actions; a workshop
  adds one extra unit every 2nd work action (Bronze craft) or 3rd
  (before it) for woodcutters and miners. Fisher work takes 9.0
  sim-seconds per fish (vs 1.6 for most jobs).
- Dawn runs spoilage (season keep-cap, doubled by a granary), the
  PWA's birth/death rolls, the dawn coin, teacher pay, schooling,
  tech, the shrine's +3 faith, the deer top-up, homes, classes,
  housing tiers, morale (including the comfortable-homes +4 when a
  quarter or more of dwellings are tier 1+), low-morale leavers,
  and famine warnings. Weather is always clear until Phase 3;
  there are no festivals, raiders, or disasters yet.
- Bless is the PWA's god action verbatim (+10 food, +5 faith,
  +2 morale, 20 sim-second cooldown). Whisper logs the text.
- Save format stays version 2: the village section stores
  villagers, stockpile, buildings (with tiers), build queue, crop
  stages, stone/tree/road deltas, deer, tech, market timer,
  households, timers, cooldowns, stats, and the last 20 log lines.
  The grid itself is rebuilt from the seed on load.

## Run it

- Editor: open this folder in Godot 4.7 (or the web editor at
  editor.godotengine.org), open `scenes/main.tscn`, press Play.
- Headless syntax + smoke run (no window, quits after 240 frames):
  `godot --headless --path godot --quit-after 240`
- Check one script without running the game:
  `godot --headless --check-only --script godot/scripts/world/terrain.gd`

## Defaults

Seed 42 (same as the PWA's world). Clock speed 3.0 sim-seconds per
real second (PWA 1x = 1.0), so a day lasts 60 real seconds. Camera
starts over the village center (24, 24). No LLM / model / AI-API code
anywhere in this project, ever.
