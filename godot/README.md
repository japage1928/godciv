# GodCiv — Godot rebuild, Phase 3 (Detail + evolution)

Godot 4.7, Compatibility renderer, 2D top-down. Branch `godot-rebuild`.
The PWA on `main` is untouched and stays live until cutover.

## What Phase 3 is

Phase 2's systems were invisible at a glance — John's verdict was
"Looks exactly the same as last phase." Phase 3 fixes that with
two pillars, both visible when John plays:

**Visual detail.** Villagers are people now: varied hair and job
hats (farmer's straw hat, builder's cap, hunter's hood), stepping
legs, a tool in hand per job, a class sash, a gold circlet for the
leader, children visibly smaller. Houses are distinct and improve
with their occupants: hut / longhouse / great hall / farmhouse each
with its own roof and size, and tier 1+ dwellings grow a chimney,
trim, and windows. The towncenter is a recognizable town hall
(stone hall, arched door, windows, steps, banner). Dirt roads link
every building the village builds, not just the plaza. A market
square with striped stalls stands from founding (food, goods) and
grows with discoveries (crafts, grocer). Trees come in three looks
(round, pine, broadleaf), meadows dot the grass, and the seasons
change the look: autumn turns the leaves orange and the light warm,
winter leaves the trees bare and cools the light, spring brings the
flowers back. Roofs and walls grow up with the tech levels — the
PWA's era stages (timber/thatch → stone/tile → brick/paved →
concrete/glass).

**Evolution.** Nothing advanced is buildable until discovered.
Every building, job, and product gates on a tech discovery
(`GodCivEconomy.DISCOVERIES`): the village starts primitive (huts,
wells, shrines; farmer, woodcutter, miner, fisher, hunter, builder,
hauler) and unlocks in sequence as tech advances. The HUD shows
the evolution — what the village has discovered and what unlocks
next — and a discovery is announced in the log with its unlocks.
Locked buildings are never demanded, so they never appear as
builds before their time; a Phase 2 save loads with its buildings
grandfathered in and its stalls, lamps, and look restored.

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
    ui/                  hud.gd, villager_card.gd, evolution_sidebar.gd,
                         phone_ui.gd, animated_backdrop.gd,
                         loading_screen.gd, main_menu.gd
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
  HUD, village, main menu, and loading screen. The player lands
  on the title menu first; the world only generates after
  Continue or New Game, so no sim days pass on the menu.
  Continue loads the v2 save exactly as before; New Game starts
  fresh (the old save is erased only after the menu's confirm).
  Saves on Save / on close, only once a village exists. The
  village is founded (or restored) only after world generation
  finishes, because it needs the terrain. Tap-to-select: a tap
  (press + release within tolerance and 500ms) opens the nearest
  villager's card within the tap radius, or closes it when
  nothing is near. On a portrait phone the tap radius (64) and
  press tolerance (32) are bigger than desktop (24 / 12), so
  villagers are tappable with a thumb. Phase 3 passes the season
  to the lighting so the light follows the seasons.
- `scripts/core/game_clock.gd` — day/time/season/year, PWA phase
  boundaries (night 0.00–0.22 / 0.84–1.00, dawn 0.22–0.32, day
  0.32–0.72, dusk 0.72–0.84), 180 sim-seconds per day.
- `scripts/core/save_manager.gd` — save format version 2
  (`user://savegame.json`). Stores seed, clock, camera, plus the
  village section (see `village.gd`). Phase 3 keeps version 2:
  the new fields (paved-road flag per road, stalls as buildings)
  live inside the v2 village section and every reader defaults
  them, so a Phase 2 save loads with Phase 3 defaults. Terrain is
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
  / shrine / longhouse / greathall / farmhouse tiles. Phase 3 adds
  three tree looks, meadow ground, paved roads, market stalls,
  street lamps, housing-tier dwelling variants, a rebuilt town
  hall, and a texture that is rebuilt when the season or the
  visual era stage changes (`apply_season` / `apply_era_stage` /
  `apply_look`).
- `scripts/world/sim_grid.gd` — mutable sim state on top of the
  immutable terrain: chopped/regrown trees, mined/weathered stone
  and ore, crop stages, buildings, roads. BFS pathfinding and
  nearest-cell searches for farm plots, trees, mineral nodes, and
  shores. Phase 2 adds shore cells (fishing), farm-district
  helpers (west block + N/E/S satellite wedges), and farm-bed
  cells cleared beside a new farmhouse (cap 144 farm cells).
  Phase 3 adds the paved-road flag per road cell.
- `scripts/world/camera.gd` — smooth pan/zoom; mouse drag + wheel,
  touch drag + pinch, WASD/arrows; zoom 0.25x–4x, clamped to the
  world.
- `scripts/world/lighting.gd` — CanvasModulate day/night tint + a
  soft sun/moon PointLight2D following the camera. Phase 3 adds a
  season tint multiplied over the day/night color (autumn warm,
  winter cool).
- `scripts/sim/village.gd` — the village: founding (towncenter,
  altar, hut, plaza roads, market stalls, 6 villagers), the 20s
  expansion / 15s delegation / 30s tree-regrow, stone-weather, and
  market timers, dawn (spoilage, births/deaths, teacher pay,
  schooling, tech, shrine blessing, deer top-up, homes, classes,
  housing tiers, morale, low-morale leavers, famine warnings), the
  full `computeDemands` (hut/longhouse/greathall/farmhouse/granary/
  well/workshop/kiln/smithy/factory/shrine/school/healer), the Bless
  and Whisper god powers, and the save/load section. Phase 3 gates
  every demand on its tech discovery, links each new building to
  the road network, opens market stalls with their discoveries,
  paves the roads at Steel works, lights the lamps at the
  Electric age, and drives the season/era look.
- `scripts/sim/villager.gd` — one villager: data, utility brain,
  movement, and drawing. Ported from `brain.js` think / scoreJob /
  doWork and the `step.js` villager loop, all 13 jobs. Phase 3
  draws a person (hair or job hat, stepping legs, tool in hand,
  class sash, leader circlet, smaller children) and gates the
  teacher and production jobs on their discovery.
- `scripts/sim/economy.gd` — the market, tools, class ladder,
  housing tiers, and tech data. Static functions taking the
  village node, ported from `brain.js` runMarket / updateClasses /
  updateHousingTiers and `core.js` standing / class / tier /
  prices / recipes / tech tables. Phase 3 adds the DISCOVERIES
  table (what each tech level unlocks), the era-stage mapping,
  and the gate lookups; housing-tier changes now refresh the
  dwelling's tile.
- `scripts/sim/deer.gd` — a deer: wanders, flees hunters, gets
  hunted. Ported from `core.js` makeDeer and the `step.js` deer
  loop. Deer are not in the terrain; the village owns the tick and
  restores the herd at dawn (cap 4, winter 2). Phase 3 adds
  antlers and legs.
- `scripts/ui/hud.gd` — top bar, four rows: Day/Season/time/phase
  + status + Save + Evolution; village numbers (Pop, Food, Wood,
  Stone, Ore, Faith, Morale); economy numbers (Fish, Meat,
  Furniture, Pottery, Ironware, Wares, Fund); god bar (Bless
  button with cooldown, Whisper field + button). No tech text up
  top — that lives in the sidebar. Log panel, bottom left, last
  6 lines. Hosts the villager card and the Evolution sidebar on
  the right. Mobile pass: on a portrait phone fonts scale ~2.6x,
  every button is a real thumb target (min ~44 CSS px), the
  village/economy rows split across two lines so they fit, and
  the log is wider with readable text; rotating the phone
  rebuilds the top bar for the new orientation.
- `scripts/ui/evolution_sidebar.gd` — collapsible Evolution
  sidebar (collapsed by default): current discovery + progress,
  next discovery, the full tech tree, villager progression.
  Mobile pass: most of the screen width on a portrait phone,
  phone-sized text, plain ASCII "X" close button on a
  thumb-sized target.
- `scripts/ui/phone_ui.gd` — shared phone/desktop sizing:
  portrait detection from the live viewport, font scales,
  thumb-sized button factory, plain-"X" close-button factory.
- `scripts/ui/animated_backdrop.gd` — procedural animated
  backdrop (sky, sun, drifting clouds, birds, hills, walking
  villagers) shared by the menu and the loading screen; drawn
  in code, no assets.
- `scripts/ui/loading_screen.gd` — animated loading screen
  shown while the world generates: animated title, backdrop,
  live progress bar tied to generation_progress.
- `scripts/ui/main_menu.gd` — title screen on launch: Continue
  (only when a v2 save exists), New Game (asks first when a
  save exists), How to Play blurb. No generation or sim until
  the player enters the game.
- `scripts/ui/villager_card.gd` — read-only villager card: name and
  class, job and assignment, age and sex, traits, education and
  tool, coins and standing, all 13 skills, carried goods, home and
  household members, parents, and hunger/energy/health. No god
  actions per villager. Phase 3 calls the towncenter a town hall.

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
  tower (Phase 4). Upgrades grow in place: a longhouse replaces
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
  and famine warnings. Weather is always clear until Phase 4;
  there are no festivals, raiders, or disasters yet.
- Bless is the PWA's god action verbatim (+10 food, +5 faith,
  +2 morale, 20 sim-second cooldown). Whisper logs the text.
- Save format stays version 2: the village section stores
  villagers, stockpile, buildings (with tiers), build queue, crop
  stages, stone/tree/road deltas, deer, tech, market timer,
  households, timers, cooldowns, stats, and the last 20 log lines.
  The grid itself is rebuilt from the seed on load.

## Phase 3 port notes

- The unlock chain (`GodCivEconomy.DISCOVERIES`) is PWA-faithful
  where the PWA gates it: kiln needs Bronze craft, smithy and
  healer need Iron craft, factory needs level 5, tool tiers need
  levels 1 / 3, and the era stages are the PWA's `eraStageOf`.
  The granary (Storage), school, longhouse, and farmhouse gates
  are new: the PWA has no tech gate on them. Wall, tower, and
  guard posts are Phase 4 — their PWA tech path (level 2) exists,
  the buildings do not yet.
- Unlock chain, discovery → what it unlocks:
  - L0 Stone tools (start): hut, well, shrine; farmer, woodcutter,
    miner, fisher, hunter, builder, hauler; crude tools.
  - L1 Bronze craft (80): granary (Storage), workshop, kiln,
    farmhouse, school, longhouse; carpenter, potter, teacher;
    furniture, pottery; sturdy tools; crafts stall opens.
  - L2 Iron craft (120): smithy, healer's hut, great hall; smith;
    ironware; fine tools; era stage 1 (stone/tile roofs).
  - L3 Steel works (200): steel tools; all roads paved, new roads
    paved; era stage 2 (brick/paved).
  - L4 Steam and brick (300): grocer's stall opens; builders work
    twice as fast (PWA rule, already in Phase 2).
  - L5 Electric age (420): factory; factory job; wares; street
    lamps on the plaza ring; work runs faster (PWA rule); era
    stage 3 (concrete/glass).
  - L6 Modern city (560): room for 10 more souls (PWA rule).
  Every building and job is reachable by some tech path — no dead
  ends. A Phase 2 save loads with its buildings grandfathered in:
  a pre-Bronze granary keeps working, but nothing new is demanded
  before its discovery.
- Visual detail is all procedural: the TileSet texture is generated
  in code and rebuilt on season or era change (the atlas source
  texture is reassigned; the layers keep their cells). Tree look
  is deterministic per cell from the seed (pine / broadleaf /
  round), so regrown trees match the forest. Meadow ground is ~8%
  of mid grass. Roads are laid by BFS from each new building to
  the nearest road, so the street network grows with the village.
  Stalls are buildings (they block their cell and show on the
  map) but are never demanded or queued — the village places them
  when their discovery arrives, on the first free ring around the
  plaza. Lamps are feature-layer tiles on plaza-ring road cells;
  they are re-placed on load from a tech 5+ save because the
  feature layer is rebuilt from the terrain, not the save.
- Save format stays version 2: roads gain a third element (paved
  flag, defaulting to dirt on Phase 2 saves); stalls save as
  buildings with type `stall_*`; nothing else is added to the
  save. A Phase 2 save loads with Phase 3 defaults.

## Mobile pass notes (John, Nov 5, 2026)

John plays on his iPhone in portrait Safari; the info bar and
every button were too small to see or touch. The whole
1280-unit canvas is squeezed into ~390 CSS px, so desktop-sized
UI is ~6 CSS px tall. The fix is a portrait class, detected
from the live viewport (`GodCivPhoneUI.is_portrait`): fonts
scale ~2.6x, buttons get a min ~44 CSS px thumb target, the
village/economy rows split across two lines, the sidebar and
villager card go to 88% of the screen width, and the tap
radius (64) and press tolerance (32) grow so villagers are
tappable. The close buttons are plain ASCII "X" — the old "✕"
glyph rendered as a fallback box on some fonts and the last
play-check could not confirm it closed anything. Rotating the
phone rebuilds the HUD for the new orientation. The same pass
adds a title menu (Continue / New Game / How to Play) before
the game and an animated loading screen during generation;
save format stays v2 and no sim rules were touched.

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
