# Defense and Map Design: Guards, Raiders, Neighbor Villages, and a Much Bigger World

DESIGN ONLY. No code changed, no push, no box work. Read from the code
November 3, 2026. John's direction: (1) add defense/military to protect
from raiders; (2) expand the map by a multiplier of 10; (3) "There's got
to be a way to go bigger without melting the sim. How does Minecraft do
it."; (4) "Let's try the Minecraft style rendering for this game and
make it much bigger"; (5) "I want other villages with a different
leader that way we can get trade, allies, enemies and such." This doc
answers all five: the Minecraft answer first, because it shapes
everything else, then defense, then the neighbor villages.

## How Minecraft does it, in one paragraph

Minecraft never simulates the whole world. It cuts the world into
16x16 chunks, generates each chunk deterministically from the seed the
first time anything needs it, simulates only the chunks near players,
freezes the rest as stored blocks, and draws only what the camera can
see. Cost follows *activity*, not *size*: a world ten times bigger
costs the same per tick as long as the settled area is the same size.
This design does exactly that, adapted to this codebase: 16x16 chunks,
seed-deterministic generation per chunk, an activity radius around
villagers and buildings, frozen chunks stored as-is, per-chunk render
sync, and indexes instead of full-grid scans. Nothing below simulates
the whole map per tick. The flat-grid 10x alternative was measured and
rejected: it would work today (see section 8) but its cost grows with
every chunk added, and it has no ceiling. The chunked design has one.

## 0. What exists today (audit, read from the code)

- **Grid:** `SIZE = 48`, 48x48 = 2,304 cells, `grid[x][z]`. Each cell:
  `h, water, blocked, road, tree, stone, ore, crop, cropGrow, building,
  farm`. Center `(24, 24)`. One lake at `(36, 36)`, radius 6.5.
  Terrain is a value-noise heightfield: a 9x9 coarse lattice drawn from
  the world RNG, bilinear interpolation, feature size 6 cells
  (`gx = (x / SIZE) * 8`, i.e. `x / 6`). 90 trees, 30 stone/ore
  clusters, scattered by the same RNG stream after the lattice draw.
  A 13x13 clearing around the center; two 3x3 farm beds west of it.
- **Saves:** the grid is rebuilt from the seed on load; `serialize()`
  stores only deltas (crops, stones, buildings, roads) plus plain
  state. `SAVE_VERSION` is 4. `deserialize()` migrates oldest-first,
  one step per release, same save key `godciv-pwa-save-v1`, never a
  reset. Raiders are transient: never saved; a mid-raid load logs the
  raid as scattered.
- **Layout:** street rings (Chebyshev distance) `[2, 5, 8, 11, 14, 17,
  20, 23]`, four axis spokes, plaza ring at 2. Field zone: `x <= cx-4`
  and within radius 14. Lots are free non-street, non-field cells with
  street frontage; dwellings keep 3-cell spacing. Farm beds are 3x3,
  inside the field zone only, capped at 54 farm cells. Wall ring at
  `WALL_RING_R = 9`, four axis cells open as gates. Walls cap at 40,
  towers cap at 4, both gated on tech level 2 and population 12/14.
- **Raiders today:** gated (day 12+, population 12+, tech 2+, 8-day
  gap, 14% dawn roll, telegraphed one dawn ahead). Size
  `min(6, 2 + floor(pop / 12))`. Spawn at a random map edge. HP
  `10 + 2 * eraStage`. Speed 2.0. Behavior: walk to the center,
  attack an adjacent villager (10 health/second), batter an adjacent
  destructible (6 damage/second; wall HP 30, tower HP 60, other
  buildings HP 25), steal 2 food per 2 seconds at the center. Leave
  when hurt (HP at 35%), full (loot 8+), or out of time (120 seconds
  plus 40 to walk out). Villagers flee and never fight. **Towers shoot
  today with nobody in them**: one volley per second per tower, range
  7, damage `2 + eraStage`, automatic. Resolution: no losses means
  +8 morale / +5 faith; losses mean -8 / -3, with a summary log line.
  The raid smoke test proves a walled village loses less than an
  identical unwalled one.
- **People:** 8 jobs, utility scoring, leader delegation with refusal,
  tool tiers 0-3 bought at the market. No soldier, no guard, no
  weapon, no injury system beyond the shared 0-100 health that hunger,
  sickness, and raiders already move. Deaths go through the one
  `removeVillager` path (faith -3, counted, logged). The healer
  heals the sick within 8 cells. Morale already prices recent deaths.
- **Tick:** server and local both step in fixed 0.25-second substeps
  (server: every 250 ms). `expandVillage` every 20 sim-seconds,
  delegation every 15, market every 30. Per-tick loops that touch the
  whole grid: `nearestCell` (full scan, called up to twice per
  villager rethink), `hasShore` (full scan, per delegation),
  `nearestWallCell` (full scan, only when a raider's path fails),
  `findPath` BFS (bounded, 4,000 steps), crop growth over farm cells,
  and the dawn/raid scans. Render: one `InstancedMesh` for all ground
  cells, one each for water/trees/dressing/stones/crops; buildings are
  merged geometry rebuilt only when the building signature changes;
  villagers and raiders are per-actor groups updated every frame.
  Camera: distance 30 default, zoom clamped 12-60, pan clamped to
  `SIZE + 8`, fog 55-95, far plane 200.
- **Measured, this sandbox, Node 24 (verify on the box before any
  promise):** one 0.25s step costs ~0.17 ms with 6 villagers,
  ~0.48 ms with 60 villagers, ~0.62 ms with 60 villagers plus a
  6-raider raid, on the 48-grid. The server tick interval is 250 ms,
  so the sim today uses well under 1% of its tick budget. A save is
  ~10 KB early, ~61 KB with 60 villagers. These numbers are the
  baseline section 8 budgets against. (An earlier probe printout
  divided by the wrong step count; the numbers here are total
  milliseconds divided by actual steps run: 1,440 steps for two days.)

## 1. Chunks: the map, cut up

- **Chunk size: 16x16 cells.** Minecraft's size, chosen for the same
  reasons: it divides the old 48-grid evenly (3x3 = 9 chunks), it is
  small enough that generating one chunk is cheap and saving one is
  small, and big enough that per-chunk bookkeeping (400 chunks at the
  recommended map size) stays trivial. A chunk is `{ cx, cz, cells,
  generated, dirty, frozenAt }`, held in a `Map` keyed `"cx,cz"`.
- **Map size: 320x320 cells, 20x20 chunks, 102,400 cells.** That is
  44.4x the old area. This target was revised upward from the
  original 10x brief by John's evening direction (Nov 3, 2026):
  "make it much bigger" with Minecraft-style rendering (section 4).
  The 160 square grid (10x10 chunks, 11.1x area, chunk-clean) from
  the original brief is the floor, not the target: 10x area (23,040
  cells) does not land on 16-cell chunk boundaries in a square map,
  and 160x144 rectangular (exactly 10.0x) splits every `SIZE` use
  into X/Z. Decision 10 is John's call on the final size; the rest
  of this design assumes 320 square. The village keeps its
  coordinates: center stays `(24, 24)`, in chunk `(1, 1)`. New land
  lies mostly east and south. The old 48x48 block is chunks
  `(0..2, 0..2)`; nothing in it moves. The bound on going bigger
  still is stated in section 4: 320 is the fixed-grid target, 640
  is supportable without redesign, and effectively unbounded
  streamed terrain is a later decision, not a build item.
- **What a chunk holds.** The 256 cells, plus the chunk-local
  indexes from section 3 (trees, stones, shores), plus a dirty flag
  for render and save. Chunks are allocated lazily: no array, no
  instances, no save bytes until first generated.
- **Generation is a pure function: `genChunk(seed, cx, cz)`.**
  Same seed, same chunk coordinates, same cells, every time, on every
  load, with no stored RNG and no dependence on generation order.
  Terrain, trees, stone, ore, and any new lakes all derive from
  integer hashes of `(seed, chunk, cell)`, never from a shared random
  stream. Two generations of the same chunk must compare identical;
  that is a test, not a hope (section 11).
- **Terrain scale is pinned to the old world.** The old noise uses
  feature size 6 cells. The chunk generator keeps feature size 6
  exactly, with the lattice extended past the old 9x9 by hash: lattice
  points inside the old 0..8 range come from the original RNG-drawn
  lattice (drawn first, in the original order, so the old block
  reproduces bit-for-bit); lattice points beyond it come from
  `hash(seed, lx, lz)`. The formula stays `(x / 48) * 8` with the
  span pinned at 48, not rewritten against the new size: rewriting
  it would shift every height in the old world. A migration test
  proves all 2,304 old cells identical before and after (section 5).
- **New-territory contents.** Same densities as the old world, by
  hash: trees ~3.9% of land cells, stone/ore clusters ~1.3%,
  excluding water and the town-center clearing radius (which only
  matters near the old block). New lakes: a chunk hashes to a lake
  with low probability (about 1 chunk in 12), a disc of radius 3-6
  at a hashed center, only where the noise height is low, mirroring
  the old lake rule (`dLake < r && h < 0.62`). Shores follow from
  the same rule as today (a land cell beside water), indexed
  per chunk. No new terrain types, no new resources: wood, stone,
  and ore, in the same proportions. The new land is room to grow
  and ground to gather from, not a new biome. One exception, and
  it is a world-generation feature, not a biome: neighbor-village
  sites (section 13). At migration, 2 sites are picked
  deterministically from the seed in new territory; their chunks
  generate with a founding clearing and founding buildings, the
  way the old block generates with the town center. The sites are
  recorded in the save at migration; the villages themselves are
  simulated abstractly until activated (section 13).
- **Farms stay home.** The field zone (west block, radius 14) does
  not expand and no farm beds generate in distant chunks. Distant
  chunks are wilderness for woodcutters and miners. Player
  outposts, distant player farms, and satellite settlements of
  the player's village are explicitly out of scope (section 12).
  Neighbor villages (section 13) are not player outposts: they are
  separate villages with their own leaders, stockpiles, and
  people. This keeps the settlement layout system, the
  farm-cap rules, and the food economy exactly as they are.

## 2. Active chunks: simulate near life, freeze the rest

- **Activity radius: 2 chunks (32 cells) around every villager, every
  building, and the town center, merged into one active set.** A
  chunk is active when any villager, building, raider, or deer is
  within 2 chunks of it, or when it holds the town center. The home
  chunks are therefore always active. A lone woodcutter walking
  east activates the chunks along the path as the villager moves;
  chunks behind the villager go quiet again once nobody is near.
- **Only active chunks tick.** Crop growth, tree regrow rolls,
  stone weathering, deer wandering, and farm-bed clearing run only
  in active chunks. Everything else in the sim already runs on
  villagers, buildings, and lists, not on cells, so it is
  activity-scaled already. A frozen chunk's cells do not change.
  This is the whole trick: tick cost follows the settled area, which
  grows slowly and only when the village does, while the map can be
  any size.
- **Freezing is storage, not deletion.** A chunk that goes quiet
  keeps its cells, its crops, its stones, and its dirty flag. On
  reactivation, crops catch up once, deterministically: growth
  applied from `frozenAt` (sim elapsed) to now, capped at the same
  per-dawn growth the live loop would have produced, so a field
  left for a week does not return as a miracle harvest. No births,
  deaths, or aging happen in frozen chunks: those belong to
  villagers, and villagers are only ever in active chunks. Deer in
  a freezing chunk are released (despawned); the dawn top-up rule
  already respawns them near the village, so no deer accounting
  changes.
- **Generation budget: at most one new chunk generated per tick,**
  the rest queued. A villager pathing into ungenerated land queues
  the chunks along the route; the path treats ungenerated cells as
  blocked until their chunk exists, then repaths. No tick ever pays
  for the whole map. Chunk generation time is asserted in tests
  (section 11).
- **Travelers activate chunks as they move.** Caravans, war
  parties, and allied reinforcements (section 13) are units on
  the map like villagers: a chunk is active while one of them is
  within 2 chunks of it, and their routes queue chunk generation
  one chunk per tick exactly as a villager's path does. A caravan
  crossing 100 cells of wilderness activates a moving window of
  chunks and leaves the rest frozen; nothing about the journey
  simulates the whole map. A distant village's own chunks are
  frozen like any wilderness unless the village is activated
  (section 13): its people and goods live in the abstract record,
  not in cells, until activation converts them.
- **Raiders spawn at the edge of the active region, not the map
  edge.** On a 320-grid, spawning at the map edge would mean a
  minutes-long walk through empty wilderness before anything
  happens. Raids spawn at least 20 cells from the center, at the
  boundary of the active set, from a random direction, telegraphed
  exactly as today. The telegraph, the gap, and the gates do not
  change; only the start line moves inward, to where the village
  actually ends.

## 3. Spatial indexes: no more full-grid scans

Every full-grid scan in the sim is replaced by an index that is
maintained as cells change. The codebase already does this twice
(`_farmCells`, `_stoneSpots`/`_oreSpots`); this design generalizes
the pattern instead of inventing a new one.

- **Indexes kept:** trees (per chunk), stone/ore nodes (per chunk,
  global list as today), shores (per chunk), farm cells (as today),
  wall/tower cells (global list, replacing `nearestWallCell`'s scan),
  road cells (only where the renderer needs them; the sim rarely
  does). Each index is a `Set` of cell keys, updated at the single
  place that mutates the cell (chop, mine, build, clear, generate).
- **`nearestCell` becomes nearest-index search.** A woodcutter
  looks for the nearest tree in the tree index, not the nearest
  tree-shaped cell in 25,600 cells. The search is over the index
  (tens to low hundreds of entries near the village), filtered by
  active chunks first. Same result as today when the index is
  correct; a test asserts index results equal scan results on a
  scripted world.
- **`hasShore` becomes a per-chunk flag**, computed at generation
  and kept current when water-adjacent cells change (they almost
  never do). Delegation reads the flag; it never scans.
- **`findPath` stays BFS, chunk-aware.** It reads cells through the
  chunk accessor, generates nothing itself (generation is the
  caller's job, queued as in section 2), treats cells in
  ungenerated chunks as blocked, and its step cap scales with the
  map: `maxSteps` becomes a function of the active region, not a
  fixed 4,000. Pathfinding cost is bounded by the active set, which
  is the point.
- **What stays a scan:** `serialize`/`deserialize` iterate
  generated chunks only (ungenerated chunks contribute nothing);
  dawn demographics iterate villagers (population-scaled, unchanged);
  the raid loop iterates raiders (capped, unchanged). No per-tick
  loop in the design touches a cell count that grows with map size.

## 4. Rendering the big map: dirty regions, culling, distance

- **Per-chunk static groups.** `buildStatic` builds one group per
  generated chunk (ground instances, water, trees, dressing,
  stones, crops for that chunk) instead of one group for the map.
  A chunk is rebuilt only when its dirty flag is set (generated,
  tree chopped, stone mined, farm cleared, season change for its
  ground colors). Untouched chunks are never rebuilt. The building
  mesh stays global and merged as today (buildings are few and
  clustered; its signature rebuild already only fires on change),
  but it gains a chunk tag per building so a future pass can split
  it without redesigning.
- **Season recolor is per chunk.** Today it recolors every ground
  instance on a season change. On the big map it recolors only
  generated chunks, chunk by chunk, and only the ground and canopy
  instances that exist. Same visible result, bounded cost.
- **Culling and LOD by chunk distance.** Three.js frustum-culls
  per mesh, so per-chunk groups make off-screen wilderness free.
  On top of that: beyond 3 chunks from the camera target, dressing
  (grass tufts, flowers, bushes) is hidden; beyond 5 chunks, only
  ground, water, and trees draw. The village itself always draws
  in full. These distances are constants, tunable, and asserted
  only by the render smoke test (no visual regression on the home
  chunks).
- **Camera and fog scale with the map, defaults do not change.**
  Default distance stays 30, default target stays the town center:
  opening the game still frames the village exactly as today. Zoom
  cap rises 60 to 120 so the settled region can be surveyed; pan
  clamp rises to the new map bounds; fog moves from 55-95 to
  60-140 and the far plane from 200 to 400, so the horizon reads
  as distance instead of a wall. Full-map view is not a goal: the
  game is watched at village scale, and the wilderness is for
  walking to, not for staring at.
- **No minimap in this design.** The call is deliberate: a minimap
  is a second rendering system with its own sync bugs, and the
  need it serves (finding the village, finding raiders) is met by
  the existing "center on village" behavior plus the raid banner.
  If John wants one later, it is a separate design. The HUD gains
  one line instead: the active-chunk count and the map position
  readout are not shown; the player never needs to think in chunks.
- **Ground instancing at 320:** 102,400 ground instances if the
  whole map were generated. It never is: only generated chunks
  hold instances, and generation follows settlement. The GPU cost
  of one chunk (256 instances) is negligible; the cost that matters
  is rebuilds, and those are dirty-flagged. This is the render
  version of the sim rule: pay for what changed, not for what
  exists.

### Streaming: distance bands, unload, and the voxel question

This is the "Minecraft-style rendering" John asked for, stated as
rendering technology: chunks stream in and out by distance from
what the player is looking at. It changes how the world draws, not
what the world looks like.

- **Distance bands, measured in chunks from the camera target.**
  The camera target is the town center by default and follows the
  player's pan. Bands are Chebyshev chunk distance from the target
  chunk, applied on top of the culling above:

  | Band | Distance | What draws |
  |---|---|---|
  | Full | 0-1 chunks | Everything: ground, water, trees, dressing, stones, crops, buildings, actors |
  | Standard | 2-3 chunks | Ground, water, trees, buildings, actors. Dressing hidden |
  | Silhouette | 4-6 chunks | Ground, water, building massing only. No trees, no dressing, no actors |
  | Unloaded | 7+ chunks | Nothing. Meshes disposed, cells and deltas kept |

  The player's village chunks are pinned at full detail regardless
  of camera distance while a raid, war party, or caravan is active
  there, so a battle never loses its actors to a band change. A
  neighbor village's chunks pin at standard or better while that
  village is activated (section 13).
- **Unload is disposal, not deletion.** An unloaded chunk keeps
  its cells, its deltas, and its dirty flag; only its three.js
  groups are disposed. Reloading rebuilds from the chunk's own
  data, never from the seed alone, so a chopped tree stays
  chopped. Reload budget: at most one chunk rebuilt per frame
  from band changes, queued like generation; a fast pan shows
  fog-colored ground for a frame rather than a hitch. The fog
  (60-140) already hides the 7-chunk line: unload happens beyond
  what the player can see clearly.
- **LOD is group culling, not mesh decimation.** The existing art
  is already cheap: merged-geometry buildings, instanced ground
  and trees. There is no LOD mesh to build and no pop-in to hide,
  because a band change hides or shows whole groups that already
  exist. The silhouette band reuses the building mesh with trees
  and dressing hidden; it does not build simplified buildings.
- **The existing art carries over untouched.** The procedural
  timber houses, era palettes, wall and tower shapes, villager
  figures, smoke, rain, and snow pools all draw exactly as today,
  chunk by chunk instead of map-wide. The only new drawables in
  this design are the guard spear/sash, the trader figure, the
  war-party figure, and the village marker (section 13): all
  small additions to existing group builders, in the existing
  palette. No art is thrown away and no look is redesigned.
- **"Minecraft-style": technology, not the voxel look.**
  Decision 11 asks John to confirm this reading, and the
  recommendation is technology only. The blocky voxel LOOK is a
  different ask: it means rebuilding every building generator as
  a cube assembly, reworking terrain into a blocky heightmap,
  reworking trees, walls, and dressing to cubes, and throwing
  away the mockup look John approved (hamlet to walled town to
  modern city, era palettes, smoke and weather). That is a full
  art pass, sized in weeks, with no sim benefit: the chunked
  sim underneath does not care what the meshes look like. If John
  wants the voxel look, it is a separate art project after the
  streaming renderer ships, and it does not change one line of
  sections 1-3. Do not start it on an assumption.
- **What bounds "much bigger".** With streaming, map size is
  bounded by four things, none of them the tick: (1) generated
  chunks in memory, 256 cells plus indexes each; (2) save size,
  which follows generated chunks and deltas only; (3) generation
  determinism, which is hash arithmetic and has no size limit;
  (4) the fixed edge, which the raid spawn, pan clamp, and fog
  rules assume. The 320 target (400 chunks) is comfortable on
  all four. 640 square (1,600 chunks, 178x the old area) is
  supportable without redesign: memory and save still follow
  generated chunks, and the active set does not grow. Effectively
  unbounded streamed terrain (no fixed edge, chunks in every
  direction forever) is architecturally possible with this
  design — generation and freezing need no edge — but it needs
  the edge rules rewritten (raid spawn, pan clamp, fog, save
  bounds, and the "map position" the player reads), so it is a
  later decision, not a build item. Decision 10 covers the size
  call: 320 fixed (recommended), 160 floor, 640, or unbounded.
- **Edge treatment.** The fixed edge is fog, not a wall. Beyond
  the last chunk there is nothing to generate; the pan clamp
  stops the camera at the bounds and the fog (60-140, far plane
  400) turns the edge into distance haze, the same way the old
  48-grid edge read. No edge wall mesh, no "world border" UI.
  Raiders and traders never spawn or path outside the bounds.

## 5. Migration: the live world becomes chunks, in place

- **Coordinates never move.** Every building, road, field, wall,
  villager, and deer keeps its exact `(x, z)`. The center stays
  `(24, 24)`. The lake stays `(36, 36)`. The save key does not
  change. The day-92+ live world loads and continues.
- **SAVE_VERSION 4 to 5, one step, oldest-first, as documented in
  `deserialize()`.** New fields and their defaults: `chunkSize: 16`,
  `worldSize: 320`, generated-chunk set (the 9 old chunks, marked
  generated at migration), active-set (recomputed at load, never
  saved), per-chunk indexes (rebuilt from cells at load, never
  saved), defense fields from section 6 (guards default as below),
  village fields from section 13 (site records and abstract
  village states, picked deterministically at migration; their
  chunks stay ungenerated until activation),
  `frozenAt` per chunk (null for the old chunks: they were never
  frozen). **Coordination flag:** the leader/villager-agency design
  (LEADER-AND-ERAS-DESIGN.md section 4) also plans a 4-to-5 step.
  The two designs share one bump: whichever lands first takes 5,
  the other takes 6, and the steps compose oldest-first. The
  village fields in this design ride the same step this design
  takes: no extra bump for villages. This must be settled at
  build time, not discovered at deploy. It is a decision, not a
  detail.
- **Terrain preservation is by construction, not by overlay.** The
  noise span stays pinned at 48 and the lattice extends by hash
  (section 1), the RNG draw order for the old block is unchanged,
  and the founding clearing, farms, trees, and stone draws run
  exactly as today for the old region. The migration test generates
  the old world with the current code and with the new code from
  the same seed and asserts all 2,304 cells identical in height,
  water, trees, stone, and ore. If that test fails, the build does
  not ship. No legacy terrain function is kept afterward: the
  pinned-noise code *is* the terrain code.
- **What loads:** the 9 old chunks generate from the seed exactly
  as before; saved deltas (crops, stones, buildings, roads) overlay
  exactly as before; villagers, stockpile, tech, log, and cooldowns
  overlay exactly as before. Raiders still scatter on load, as
  today. The only visible difference after migration is that the
  map is bigger and the edges are farther away.
- **Save size after migration:** unchanged in shape. Ungenerated
  chunks cost zero bytes. Generated chunks cost their deltas only,
  as today. The chunk set itself is a short list of coordinates.
  Estimate: the same tens of kilobytes as today, growing only as
  the village actually settles new ground. No save-size cliff.

## 6. Defense and military: guards, posts, and combat

Defensive only. No raiding other villages, no offensive campaigns,
no army that leaves the map. The military exists for one job:
raiders arrive, the village does not lose people or food to them.

### 6.1 Who fights: the guard job

- **A ninth job: `guard`.** It plugs into the existing machinery
  whole: it is a `JOBS` entry, it scores in `scoreJob`, the leader
  delegates it in `delegateRoles` with a desired count, villagers
  can refuse it through the existing refusal path (a skeptic or a
  terrified villager may balk at the post, and the log says so),
  and it is a standing post like the fisher: a delegated guard
  stays at the post instead of drifting to other work.
- **Desired guard count (defaults, tunable constants):** one guard
  per tower, plus one per gate once walls exist, with a floor of 0
  before towers exist and a cap of 6. Formula: `min(6, towers +
  (walls >= 6 ? 2 : 0))`, and never more than a third of adults.
  The leader's delegation fills it from the best-suited villagers:
  `brave` first, then highest tool tier, then skill (a new
  per-villager guard skill is NOT added; tool tier and traits
  carry it, keeping the villager record unchanged).
- **Cost and upkeep: nothing new.** A guard eats, sleeps at home,
  and is housed like any villager. Effectiveness scales with the
  existing tool tier (crude to steel), which is bought at the
  market as today: better tools, better guards, with no new
  economy, no weapon item, no upkeep line. A guard off duty (no
  raid, no warning) patrols; a guard is never idle labor lost, in
  the same way a delegated fisher is never lost: the post is the
  job. No barracks building in this design: guards sleep at home
  and post at towers and gates. A barracks is a possible later
  building, not a requirement for the military to read.
- **Militia (phase 2, not phase 1).** A call-up that temporarily
  reassigns villagers during a raid warning is designed but not
  built first: the standing guard job must prove the combat loop
  before a second, temporary layer is added. The muster god action
  below is the hook it hangs on. Decision 2 settles whether
  militia ships at all.

### 6.2 Posts, patrols, and manned towers

- **Posts are towers and gate cells.** Each guard is assigned one
  post: a tower if any tower lacks a guard, else a gate cell (the
  four open axis cells of the wall ring). Posts are assigned by
  the sim (nearest free post to the guard's home), never named by
  the model and never picked by the god. An unassigned post simply
  has no guard; the tower or gate still exists and still blocks
  movement.
- **Manning changes what towers do.** Today towers shoot
  automatically. In this design a tower shoots at full effect only
  when a guard is posted at it: one volley per second, range 7,
  damage `2 + eraStage`, as today. An unmanned tower does not shoot
  at all: it is stone and timber with nobody watching from it, and
  pretending otherwise is what made the old defense unreadable
  (damage with no visible cause). This is a behavior change to an
  existing village's towers, and it is stated plainly here so it is
  a decision, not a surprise: on migration, the delegation desired
  count is at least the tower count, so existing towers get manned
  within a delegation round (15 sim-seconds). Decision 3 offers
  the alternative (unmanned towers at half damage); the
  recommendation is manned-only, because a defense the player can
  see staffed is a defense the player can trust.
- **Patrols.** With no raid and no warning, a guard walks a short
  loop: post, nearest gate, next post, back. The loop is
  deterministic (fixed neighbor order, as `streetFrontage` is),
  uses the existing movement code, and never leaves the wall ring
  by more than a few cells. During a raid warning
  (`raidPendingDay` set), guards go to their posts and wait. During
  a raid, guards engage (section 6.3). After a raid, guards return
  to patrol and their fear decays normally.
- **Fear does not rout a guard on duty.** The flee rule that sends
  every villager away from raiders is suspended for guards while a
  raid is active: a guard holds the post. Fear still accumulates
  (it feeds refusals and morale afterward), and a guard whose
  health falls below 25 breaks off toward home like anyone else:
  holding is discipline, not suicide, and the break-off is visible
  in the log.

### 6.3 Combat resolution: fixed rules, fully specified

Combat is sim rules only. The model never decides it, the god never
aims it, and no number in it is hidden. Every quantity below is a
named constant with a default, tunable in one place.

- **Guard melee.** A guard within 1.3 cells of a raider strikes
  once per second for `3 + toolTier` damage (tool tier 0-3, as
  today). Guards move toward the nearest raider within 12 cells
  of their post; beyond that they hold the post (no chasing
  raiders across the map). Raiders attack the nearest villager or
  guard in reach, as today (10 health/second), with no preference:
  a guard in the way is the target, which is the point of a guard.
- **Tower volleys.** As today, plus manning (section 6.2): one
  volley per second per manned tower, nearest raider in range 7,
  damage `2 + eraStage`. Volleys do not need line of sight: the
  village is flat and the tower is tall; adding sight lines is
  complexity with no visible payoff.
- **Raiders, unchanged except where stated.** HP `10 + 2 *
  eraStage`, speed 2.0, battering 6/second against walls (HP 30),
  towers (HP 60), and other buildings (HP 25), stealing 2 food per
  2 seconds at the center, leaving hurt, full, or out of time.
  What changes: a raider adjacent to a guard fights the guard
  instead of walking past; a raider that destroys a manned tower's
  post leaves the guard standing (the guard's post is gone, the
  guard reassigns to the nearest free post after the raid).
- **Injury and recovery.** Guards take damage on the shared
  0-100 health every villager already has. There is no separate
  wound system. An injured guard recovers by rest and by the
  healer's existing radius-8 effect, exactly as a sick villager
  does. A guard at 0 health dies through the existing
  `removeVillager` path: faith -3, counted, logged by name and
  cause ("slain by raiders"), morale priced through recent deaths.
  No new death rules, no permadeath exceptions, no resurrection.
- **End of raid, as today, plus a defense line.** The existing
  resolution (clean defense +8 morale/+5 faith; losses -8/-3;
  summary log line) stays, and the summary gains the defense
  facts: guards posted, raiders felled by guards vs towers,
  wall/gate breaches. One line, same shape as today, so the panel
  and the log keep their rhythm.
- **Determinism.** Combat uses only the seeded RNG and the fixed
  rules above. The same seed, the same village, the same raid
  plays the same way. The combat test (section 11) runs a seeded
  raid twice and asserts identical outcomes, and asserts that a
  defended village loses less than an identical undefended one,
  extending the existing raid smoke test's comparison instead of
  replacing it.
- **What the player reads.** HUD: the raid banner gains "guards
  2/3 posted, 1 tower manned". Panel: a defense section (walls,
  towers manned/total, guards posted/total, last raid outcome in
  one line). Log: muster ("Bram takes the north gate."), guard
  kills (capped: one line per guard per raid, not per blow),
  guard falls (by name, as deaths already are), tower fells (as
  today), breach (as today). Render: guards draw with a spear
  shaft and a red sash on the existing villager figure (a small
  addition to the villager group builder, not a new mesh system);
  a manned tower draws its posted guard figure on the platform;
  an unmanned tower draws empty. A guard fighting reads as a
  guard fighting: spear, sash, and the guard standing between the
  raider and the houses.
- **War parties fight by these same rules.** A war party from a
  neighbor village (section 13) is a raider-shaped unit with a
  village identity: same per-second damage, same guard melee, same
  manned-tower volleys, same fear and break-off rules for the
  defenders. What differs is only what the raider rules do not
  have: the party retreats to its home village when its health
  falls under 25% or its loot is full, it carries stolen goods
  home (conservation: goods leave the defender's stockpile only
  when the party arrives home alive), and its deaths subtract
  from its home village's abstract population and relations.
  One combat system, two kinds of attacker. The HUD names the
  attacker: "Raiders" for a raid, "War party from Emberford" for
  a war party, so the player always knows which war they are in.

### 6.4 Authority: who controls the military

Consistent with the authority table in LEADER-AND-ERAS-DESIGN.md
section 1. The model never touches combat or numbers; the god
never assigns a villager; the sim owns the fight.

| Decides | Leader (model) | God (John) | Fixed rules (sim) |
|---|---|---|---|
| Defense focus: build wall/tower orders (one per round, gated, sim picks the spot) | Yes, via validated intents, same gates as any build order | No | Demand system, affordability, lot/ring placement |
| Muster: guards to posts, call-up if militia exists | Yes, as an intent (`call_to_arms`), validated, one per raid warning | Yes, god-bar button (see below), cooldown 30s | Posts, patrol, engagement ranges |
| Guard assignment, patrol routes, targets, damage, casualties | No | No | Sim only |
| Raid scheduling, size, spawn, loot, resolution | No | No | Sim only |
| Numbers: health, damage, stockpile, morale, faith | No, never | Only through existing god actions | Sim only |

- **God action: `muster`.** A god-bar button, cooldown 30 seconds,
  same family as bless and directive. It sends every guard to its
  post immediately and, if militia exists, calls the muster. It
  does not create guards, aim weapons, or change any number. It
  is the god's visible hand on defense, and it is the only new god
  action in this design.
- **Leader intent: `call_to_arms`.** The leader model may return
  it during a raid warning; the sim validates it like any intent
  (it must be raid season: warning set or raid active, else it is
  dropped with a refusal line). It does what `muster` does, through
  the same code path, so the two can never disagree.
- **Villager layer:** a guard deliberates like any villager
  (LEADER-AND-ERAS-DESIGN.md section 1B): `job_pref: guard` is a
  nudge, refusal applies, and a villager who refuses the post
  says so in the log. Household distress (a raider near the home)
  reaches the leader's summary through the same distress wiring
  as hunger and sickness. No new deliberation schema is needed:
  guard is a job, and jobs are already deliberated about.
- **Diplomacy authority lives in section 13.** The table above
  covers defense only. Who can offer trade, propose an alliance,
  or start and end a war — leaders, god, or both — is decided in
  section 13, on the same authority pattern: leaders decide via
  validated intents, the god proposes via directives, the sim
  owns numbers and combat. No row here contradicts a row there.

### 6.5 Raider scaling on the big map

- **Size:** `min(RAID_SIZE_CAP, 2 + floor(pop / 10) + eraStage)`,
  default cap 10 (up from 6). The cap is the fairness rule: a raid
  never exceeds the village's ability to answer it, and the formula
  is public in the constants, not tuned behind the player's back.
  The old formula's shape is kept (population-driven, small), the
  cap rises only because guards now exist to meet a bigger raid.
- **Frequency:** gap stays 8 days, dawn-roll chance stays 14%,
  gates stay day 12 / population 12 / tech 2. No change in phase
  1: the village must feel the new defense before the pressure
  rises. A later tuning pass may shorten the gap at high eras;
  that is a numbers change, not a design change, and it waits for
  raid outcomes on the live world.
- **Strength:** raider HP stays `10 + 2 * eraStage`. No new raider
  types in phase 1 (no archers, no battering rams, no leaders):
  the raid's threat grows through size and through the village's
  own growth, which is readable. New raider types are a later
  design if raids ever feel samey, and only then.
- **Wealth does not scale raids.** A rich stockpile does not summon
  bigger raids: that punishes success invisibly. Raiders scale on
  population and era, both visible in the panel. This is stated so
  it is never quietly added later.
- **Fairness invariant, asserted in tests:** a village with manned
  towers and posted guards loses fewer villagers and less food
  than the identical village undefended, across seeds; and no raid
  ever kills more than a third of the village (the old "never a
  wipe" promise, kept, and now tested at the new size cap).

## 7. Tuning knobs (one place, all defaults)

| Constant | Default | What it moves |
|---|---|---|
| `CHUNK` | 16 | Chunk side in cells. Changing it re-chunks the world; not tuned live. |
| `WORLD_SIZE` | 320 | Map side in cells. Decision 10. |
| `ACTIVE_RADIUS_CHUNKS` | 2 | Sim radius around life. Larger costs more per tick; smaller risks pop-in. |
| `RAID_SIZE_CAP` | 10 | Largest raid. Was 6. |
| `RAID_GAP_DAYS` | 8 | Minimum days between raids. Unchanged. |
| `RAID_WARN_DAYS` | 1 | Telegraph, in dawns. Unchanged. |
| `GUARD_DAMAGE_BASE` | 3 | Plus tool tier, per second, range 1.3. |
| `GUARD_POST_RADIUS` | 12 | How far a guard chases from the post. |
| `GUARD_CAP` | 6 | Most guards at once. |
| `TOWER_RANGE` / `TOWER_DAMAGE` | 7 / `2 + eraStage` | Unchanged from today; manning gates the shot. |
| `WALL_RING_R` | 9 | Inner ring. Outer rings: see section 9. |
| `VILLAGE_COUNT` | 3 | Villages total, player's included. Decision 12. |
| `CARAVAN_CAPACITY` | 20 | Goods per caravan, plus 10 per relation band. |
| `WAR_PARTY_SIZE` | 3-6 | Scales with the declaring village's population, like a raid. |
| `WAR_LOOT_CAP` | 20 | Most goods a war party carries home. |
| `WAR_EXHAUSTION_PEACE` | 10 | Exhaustion at which peace may be offered. |

## 8. Performance budget, written against the chunked design

Measured baseline (section 0): ~0.17 ms/step at 6 villagers,
~0.48 ms at 60, ~0.62 ms with a raid, 48-grid, sandbox hardware.
The server tick interval is 250 ms. Budgets below are ceilings the
build must stay under, asserted headlessly (section 11), not hopes.

- **Sim step (server, 60 villagers, home chunks active, raid
  running): p95 under 5 ms per 0.25s step.** That is 50x headroom
  against the 250 ms interval and 8x the measured 48-grid cost,
  leaving room for the box being slower than the sandbox and for
  the guard/tower additions. The chunked design earns this budget
  structurally: step cost is O(active cells + villagers + raiders),
  and the active set at a 60-villager village is a handful of
  chunks, whether the map is 48 or 320 wide. A flat-grid design
  could not promise this: its scan costs grow with the map.
- **Chunk generation: under 10 ms per chunk, at most one chunk
  per tick.** Generation is hash arithmetic over 256 cells plus
  index building. If a chunk ever costs more, generation splits
  across ticks (generate cells in bands) rather than blowing the
  tick. The queue is visible in a debug counter, never in the
  player's face.
- **Chunk activation catch-up: under 2 ms per reactivated chunk.**
  Crop catch-up is one bounded pass over the chunk's farm cells
  (frozen chunks hold no farms outside the field zone, so in
  practice this is usually zero cells; the bound covers the
  general case).
- **Save/load: save under 200 KB for the live world, load under
  2 seconds on the box.** Save size follows generated chunks and
  villagers, not map size. Load regenerates the 9 home chunks
  from the seed and overlays deltas, as today, plus index rebuilds
  that are linear in generated cells.
- **Render frame (phone): no per-frame work that scales with map
  size.** Per frame: villager/raider mesh updates (population),
  chunk-group visibility (already-culled groups), one draw call
  per visible chunk group. Season recolor and static rebuilds are
  dirty-flagged and chunk-local. The render smoke test asserts a
  big-grid world with sparse generated chunks builds its statics
  without touching ungenerated cells.
- **Memory:** cells are small plain objects as today; a generated
  chunk holds 256 of them plus indexes. 400 generated chunks is
  102,400 cells, the same order as the old map forty-four times
  over in the worst case, and generation follows settlement, so
  the live world reaches that only if the village sprawls across
  the whole map. No per-cell rendering state is kept outside the
  chunk's own meshes. Unloaded chunks (section 4) hold no meshes
  at all: render memory follows the visible bands, not the map.
- **Streaming:** at most one chunk rebuilt per frame from band
  changes; a band change never rebuilds a chunk that did not
  change bands. The streaming test asserts a fast pan across the
  320-grid disposes and rebuilds only chunks that crossed a band
  edge, and that the home village never drops below full detail
  during a raid.
- **Distant villages and caravans:** the abstract dawn tick is
  one arithmetic pass per village (negligible at any plausible
  village count; asserted under 0.1 ms for 10 villages). A
  caravan in transit costs one pathing unit plus its moving
  active window, the same as one villager walking. A war party
  costs the same as a raid of its size. None of these scale with
  map size.
- **Verify on the box.** Sandbox timings are not box timings. The
  build runs the perf suite on the godciv-sim box (or a matching
  instance) before going live, and the numbers above are the gate,
  not the sandbox figures. If the box is slower, the active radius
  shrinks (a constant) before any feature is cut.

## 9. What changes, what stays

**Stays as-is:** `step()`'s structure and substep discipline;
`think()`/`scoreJob()`/delegation/refusal; the economy, market,
morale, demographics, and festival code; the serialize-delta
pattern and the migration discipline; the merged-geometry building
renderer and its signature rebuild; villager/raider mesh patterns;
the god-action family and cooldowns; the raid telegraph/gap/gates;
the settlement layout rules (rings, spokes, lots, field zone) for
the settled area; the save key.

**Refactors (sim.js):** `SIZE` becomes `WORLD_SIZE` (320) plus
`CHUNK` (16); grid allocation becomes per-chunk lazy allocation
behind a `cellAt`/`chunkAt` accessor (direct `grid[x][z]` reads in
hot paths go through it; the accessor is the one place that knows
about chunks); noise span pinned at 48 with a hash-extended
lattice; `nearestCell`/`hasShore`/`nearestWallCell` become
index queries; `findPath` becomes chunk-aware with a scaled step
cap; `serialize`/`deserialize` gain the generated-chunk set and
the version-5 step; `spawnRaid` spawns at the active edge;
`JOBS` gains `guard`; `delegateRoles` gains the guard desired
count; `think()` gains the guard branch and the on-duty fear
exemption; `stepRaiders` gains manning checks and guard melee;
`applyGod` gains `muster`; `computeDemands` gains outer wall
rings (below); tree/stone regrow and farm expansion run on
active chunks only. **Village refactors (Phases F-H):** a
`villages` collection on state plus the abstract record shape;
the dawn pass gains the abstract tick; activation/deactivation
convert between the record and live villagers/buildings with
the conservation rule; `genChunk` gains the founding-village
site generation; caravans and war parties join the unit lists
as raider-shaped travelers with home-village identity;
`stepRaiders` gains caravan targeting; relations live on the
records with the drift table; `applyGod` gains the envoy action
and the suggest-trade/alliance directives; the leader loop
gains one round per village per dawn with the extended intent
schema and the staggered call budget.

**Refactors (render.js):** `buildStatic` becomes per-chunk groups
with dirty flags; season recolor becomes per-chunk; camera zoom
cap 60 to 120, pan clamp to the new bounds, fog 60-140, far
plane 400; villager groups gain the guard spear/sash; tower
groups gain the posted-guard figure and the empty state; HUD and
panel gain the defense section. **Streaming and village render
(Phase C, Phases F-H):** per-chunk groups gain the distance-band
application (hide/show groups by band, dispose beyond 7 chunks,
one rebuild per frame from band changes); villager groups gain
the trader figure (yellow sash, pack bundle) and the war-party
figure (dark tunic, village-color sash); a village-marker group
(standing stone, village color) draws at known village centers;
the panel gains the relations section and the HUD gains the
band-change relation banner. Ground/water/tree instancing,
the merged building mesh, particles, and the day/night cycle are
untouched in structure.

**Wall expansion, staged.** The inner ring at R=9 stays. When the
village outgrows it (population 40+ and the street extent past
ring 17), the demand system asks for a second ring at R=18, then
a third at R=27, each with its own four gate cells and its own
tower spots beside the gates. Rings are built in the same
grow-from-the-gates order as today, capped per ring so no ring
paves the map. Outer rings cost the same per cell as the inner
one. This keeps walls a village-scale project at every size
instead of a single ring that is either trivial or endless. The
staging thresholds are constants; the second ring is the only
one in phase 1 scope, the third is a demand rule away.

## 10. Phased build order

Map first, military second. The military's balance (spawn
distance, chase radius, tower coverage) depends on the geometry
of the big map, and the map work is separable and shippable
without any gameplay change, which is the safe order for the live
world.

1. **Phase A, chunked terrain and migration.** Chunk storage,
   pinned noise, hash-extended lattice, pure-function generation,
   migration step, village sites picked deterministically and
   recorded (invisible until Phase F). No gameplay change: the
   world must be cell-identical on the old block and play
   identically. Gate: the migration and determinism tests.
2. **Phase B, active simulation and indexes.** Activity radius,
   freezing and catch-up, index-based lookups, chunk-aware
   pathfinding, spawn at the active edge. Gate: the perf suite
   and the no-stuck-villagers suite on the big grid.
3. **Phase C, chunked rendering.** Per-chunk statics, dirty
   flags, per-chunk recolor, culling/LOD, distance-band
   streaming with unload and the one-rebuild-per-frame budget,
   camera and fog scaling, guard-neutral. Gate: render smoke on
   the big grid, screenshot of the home village unchanged.
4. **Phase D, guards and manned towers.** Guard job, delegation,
   posts, patrols, manning rule, guard melee, fear exemption,
   HUD/panel/render signals, muster god action, leader
   `call_to_arms` intent. Shadow-first for the leader intent if
   the leader layer is live by then; the sim rules need no
   shadow. Gate: combat determinism and fairness tests.
5. **Phase E, scaling and polish.** Raid size cap 10, staged
   outer wall ring, militia only if Decision 2 says so, tuning
   from live raid outcomes. Gate: John's verdict on a live raid.
6. **Phase F, neighbors and trade.** Village records, the
   abstract tick, activation/deactivation, discovery, caravans,
   the relations meter and panel, trade at the price table.
   Gate: the conservation and trade tests.
7. **Phase G, alliances.** Alliance intents, thresholds,
   reinforcements, break rules. Gate: the alliance tests.
8. **Phase H, rivalry and war.** Rivalry state, war
   declaration, war parties, exhaustion, peace and white peace.
   Gate: the war tests and the fairness invariant (no wipe).

No phase starts without the previous one verified headless and,
where it shows, on a screenshot. The live world migrates once,
in Phase A, and never resets after.

## 11. Headless test assertions

- **Determinism:** generating the same chunk twice from the same
  seed yields identical cells; generating chunks in different
  orders yields identical cells.
- **Migration:** a version-4 fixture (seed 42, day 92 shape:
  buildings, roads, farms, villagers, stockpile) loads under the
  new code with every old-block cell identical, every building
  and villager at the same coordinates, the same day, and no
  reset. A version-4 world with towers loads with guards
  delegated within one delegation round.
- **Chunks:** ungenerated chunks cost nothing (no arrays, no
  save bytes); generating one chunk never generates its
  neighbors; the active set contains the home chunks and only
  chunks within radius of life; a chunk frozen and reactivated
  catches crops up once, bounded, deterministically.
- **Indexes:** index-based nearest queries return the same cell
  as a full-grid scan on scripted worlds; indexes stay correct
  after chopping, mining, building, and clearing.
- **Pathing:** paths cross chunk boundaries; a path into
  ungenerated land queues generation and repaths; no villager
  is stuck for more than the existing stuck threshold on the
  big grid; the pacing suite's birth/population bars stay green.
- **Combat:** a seeded raid run twice gives identical outcomes
  (deaths, stolen, felled, wall damage); a defended village
  (manned towers + posted guards) loses less than the identical
  undefended village across seeds; no raid kills more than a
  third of the village; an unmanned tower never shoots; a guard
  below 25 health breaks off; raids resolve within the existing
  time bounds.
- **Layout:** street rings, spokes, lots, field zone, and the
  wall ring behave as the layout smoke suite asserts on the old
  block, and new rings extend past 23 on the big grid without
  entering the field zone; farm beds never leave the field zone
  at any map size.
- **Render:** buildStatic on a big grid with sparse generated
  chunks touches only generated chunks; the home village renders
  identically to the 48-grid screenshot set; season recolor
  touches only generated chunks.
- **Performance:** scripted 60-villager day with a raid on the
  big grid, home chunks active: step p95 under 5 ms (sandbox;
  box gate per section 8); one chunk generates in under 10 ms;
  save under 200 KB; no tick generates more than one chunk.
- **Streaming:** a scripted fast pan across the 320-grid
  disposes and rebuilds only chunks that crossed a band edge;
  the home village never drops below full detail during a raid;
  an unloaded chunk reloads with its deltas intact (chopped
  trees stay chopped).
- **Villages:** migration picks the same 2 sites from the same
  seed on every load, all outside the old block and 60+ cells
  from the center; a version-4 fixture loads with the village
  records present and the player's village untouched; repeated
  activation/deactivation cycles conserve villagers and goods
  exactly across the boundary (counts match before and after,
  apart from sim-owned births, deaths, production, and
  consumption); an activated village's buildings and villagers
  sit on its site with its leader named; deactivation never
  touches the player's village.
- **Trade:** a scripted trade moves exactly the offered goods
  one way and the price-table coins the other, totals conserved
  across both stockpiles and both funds; an unfair offer is
  refused; a caravan with no path fails with a log line and
  moves nothing; a caravan caught by raiders loses its goods
  through the steal path and nothing else.
- **Relations and war:** relation values move only through the
  drift table; alliance requires both intents and the
  threshold, and breaks at the stated conditions; war requires
  rivalry, the threshold, and the cooldown, and the god cannot
  declare it through any action or intent path; a war party
  retreats under 25% health, carries loot home only on arrival,
  and its deaths subtract from its home village; peace and
  white peace end wars at -10 with a truce; no war kills more
  than a third of either village; no cross-village state
  corruption across a 30-day scripted run with two active
  villages (each village's stockpile, jobs, and leader intents
  affect only itself).

## 12. Deliberately not in scope

- **Siege engines, battering rams, raider archers:** new unit
  types before the guard loop proves itself. The raid's threat
  grows through size, which is readable; new types are a later
  design if raids feel samey.
- **Tribute and prisoners:** not in any phase. Trade and war
  already move goods and people through existing paths; tribute
  is a recurring payment with no mechanic behind it, and
  prisoners need housing, feeding, and release rules for a
  decision the player makes rarely.
- **Player-ordered offensives:** the god cannot order an attack
  on a neighbor village, and the player's village fields no
  invasion army. War exists (section 13, Phase H) as a
  leader-decided state between villages, fought by war parties
  under the shared combat rules — not as a god-directed
  campaign. An army that leaves the map on the god's orders
  needs a second map and a second economy.
- **Barracks building:** guards sleep at home and post at towers
  and gates. A barracks is decoration until guards need
  something a home does not give them.
- **Cavalry, war animals, naval combat:** mounts and boats do
  not exist anywhere else in the sim. Nothing here needs them.
- **Player outposts and distant player farms:** the field zone
  stays home. Neighbor villages (section 13) are separate
  villages with their own leaders, not player settlements;
  distant settlement of the player's own people is a separate
  design with its own economy questions (who lives there, who
  feeds them).
- **Minimap:** decided against in section 4. Revisit only as its
  own design.
- **Model-decided combat:** the model never aims, targets, or
  resolves a fight. The guardrail from the leader design holds
  for every layer: models advise, the sim decides.

## 13. Other villages: neighbors with their own leaders, trade, allies, enemies

John's direction: other villages, each with a different leader, so the
game gets trade, allies, and enemies. The player's village is village
number one and never moves; the neighbors live in new territory only.
This section reuses the leader architecture from
LEADER-AND-ERAS-DESIGN.md (one leader loop per village, same intents,
same guardrails) and the military from section 6 (one combat system
for raiders and war parties). It is phased: trade first, alliances
second, war last, because each phase proves the plumbing the next one
needs. Decisions 12-14 in section 14 cover the open calls.

### 13.1 How many, where, and what they start as

- **Count at first: 3 villages total** — the player's plus 2
  neighbors. Two is enough to prove every mechanic (trade with
  one, rivalry with the other, if that is how it plays) and small
  enough that the leader call budget stays bounded. More villages
  later is a numbers change (site picking already handles N), not
  a redesign. Decision 12 is John's call on the starting count.
- **Sites are picked deterministically at migration, from the
  seed.** Candidate cells in new territory only: at least 60
  cells from the player's center, at least 50 cells from each
  other, on land (never water), near forest and stone. Score is
  land plus resource proximity, ties broken by hash, so the same
  seed picks the same sites on every load. The sites are recorded
  in the save at migration. No site ever falls in the old 48
  block, the player's wall rings, or the field zone.
- **Their chunks generate with a founding village in them.** The
  same founding shape as the player's day 1 (town center, huts,
  granary), generated by the same code path with the site center
  as origin, when the chunk is first generated. Until then the
  village exists only as its abstract record (below); the ground
  is ordinary wilderness with a site reserved in it.
- **Age-matched backstory, deterministic.** The neighbors were
  founded on day 1 alongside the player's village. At migration
  their abstract state is derived from `hash(seed, villageId)`:
  population 8-16, tech level 1-2, modest stockpiles (food 40-80,
  wood 30-60, stone 10-30, the rest small), morale near 50. The
  same seed gives the same neighbors every time; there is no
  random roll at load.
- **Names come from fixed pools.** Village names: Emberford,
  Stonehollow, Millbrook, Aldergate, Fenwick, Cinderhold, picked
  in seed order. Leader names come from the same first-name pool
  the player's leader uses (verify the pool name at build time).
  Each village record holds its leader's name from the start, so
  the log can speak of "Mara of Emberford" before anyone has met
  her.

### 13.2 The village record and the distant abstraction

Minecraft's rule, applied to villages: full detail only near the
player's view and interaction, cheap arithmetic everywhere else.

- **The record.** Each village is one record: `id, name, center,
  leaderName, known (bool), active (bool), pop, popCap, stockpile
  (the 7 existing goods), coins, techLevel, techProgress, morale,
  buildings (counts by type), relations (one value per other
  village), foundedDay, lastContactDay, warExhaustion`. No new
  goods, no new currency: the record uses the stockpile the game
  already has.
- **Abstract tick, once per dawn, arithmetic only.** Population
  grows by births minus deaths from per-capita rates, using the
  village's fixed founding job mix (set at founding from the
  hash, e.g. 40% farmers, 20% woodcutters, 15% miners, the rest
  mixed; the mix never changes while abstract). Stockpile gains
  production minus consumption per capita at the same per-job
  yields the live sim uses, clamped at zero and at the cap.
  Tech progress gains a small fixed rate. Morale drifts toward
  50 plus or minus recent events. No births, deaths, or building
  happen as live events while abstract; the numbers move, the
  village does not act. Raiders do not attack abstract villages
  in this design: the raid system targets the player's village
  only, and a neighbor's hardships are formula drift, not events.
  This is stated so it is never quietly assumed otherwise.
- **Activation: abstract becomes real.** Triggers: the player
  opens the village's panel; the camera target stays within 3
  chunks for more than 10 seconds; a caravan departs to or from
  it; a raid or war party targets it; an envoy is sent. On
  activation the record converts exactly: its chunks generate
  with the founding buildings per the counts, villagers spawn
  equal to `pop` (names from the pool, jobs per the mix, the
  first villager flagged leader with the record's leader name),
  the stockpile transfers 1:1, tech is set. From then it ticks
  with the full sim inside its active chunks, under the same
  layout system (rings, spokes, lots) centered on its own
  center, with its own leader loop.
- **Deactivation: real becomes abstract.** No trigger for 5
  game-days and no hostiles or caravans present: villagers convert
  back to the pop count and despawn, goods sum 1:1 into the
  record, buildings become dormant records (they keep drawing in
  the silhouette band, they do not tick, produce, or consume).
  Reactivation re-spawns villagers from the count and wakes the
  buildings. The player's village never deactivates.
- **Conservation invariant.** The boundary itself never creates
  or destroys anything: across the live village, the abstract
  records, caravans in transit, and dormant buildings, villagers
  and goods are conserved except through sim-owned births,
  deaths, production, consumption, and combat. The test suite
  asserts this across repeated activation cycles (section 11).

### 13.3 Each village has its own leader

- **One leader loop per village, same module, same guardrails.**
  The leader loop from LEADER-AND-ERAS-DESIGN.md section 1 runs
  once per village: intents as JSON, validated and clamped before
  the sim reads any of it, the model never sets a number, never
  names coordinates, never calls a god action. One round per
  dawn per village, plus one extra round on a shortage or raid
  warning, staggered so at most one model call per 10 seconds of
  wall time across all villages, 20-second timeout, utility
  fallback per village when the model is down or nonsense.
  Shadow-first applies globally: neighbor leaders run in shadow
  with the player's leader, their would-do lines labeled, and
  going live is one switch and John's word.
- **Each leader sees only its own village.** The summary is the
  same allowlist shape as `councilSummary`, built from that
  village's state, plus its relations, caravan state, and war
  state. A leader never sees another village's internals beyond
  public facts: the relation value, the last trade, and
  surplus/deficit categories ("they have spare wood"), never
  exact foreign stockpile counts. There is no user identity, no
  device info, and no chat content in any summary, as in the
  leader design.
- **Leader intent schema, extended for diplomacy.** The existing
  fields (`goal, focus_job, build_order, call_feast, whisper`)
  stay, and three fields are added, validated the same way:

  ```json
  {
    "trade_offer": { "to": 2, "give": "wood", "give_qty": 10,
                     "want": "food", "want_qty": 10 } | null,
    "relation_move": "propose_alliance" | "offer_peace" |
                     "declare_rivalry" | "declare_war" |
                     "end_alliance" | null,
    "envoy": 2 | null
  }
  ```

  Gates, all in code: trade requires the target known and
  relation >= 0; alliance requires relation >= 60 and a
  cooldown; war requires rivalry, relation <= -70, and a
  cooldown; peace requires an active war and the exhaustion
  threshold; envoy requires a cooldown. A gated-out intent is
  dropped with a refusal line, like any other refused intent.
  The model never sets a relation number and never moves goods:
  trade executes through the caravan mechanic, relations move
  through sim-owned events (section 13.5).
- **The player's village leader is the one John watches.**
  Neighbor leaders deliberate for their own villages; their
  decisions appear in the log in their voices and in the
  relations panel. A neighbor leader's build orders use its own
  village's lots and gates; a neighbor leader can never order
  anything in the player's village.

### 13.4 Discovery: how the player learns about them

- **No fog of war, no scout job in this design.** Fog of war is
  a second visibility system with its own sync bugs, and a scout
  job is a villager the village does not need until the map is
  lived-in. The call is deliberate and cheap: villages start
  unknown, and contact discovers them.
- **Villages start UNKNOWN.** No marker, no panel entry, no
  name. Discovery happens three ways: (a) first trader arrival
  — each neighbor sends one trader caravan in its first season
  after migration, at a deterministic time from the seed, one
  per village, staggered; when it arrives, the village is
  discovered; (b) the god envoy action (section 13.7), which
  arrives next dawn; (c) the camera: panning within 3 chunks of
  a village activates it, and activation discovers it — the
  player found it by walking there.
- **After discovery**, the village appears in the relations
  panel (name, leader, relation meter, status, last event) and
  a marker draws at its center chunk: a standing stone in the
  existing palette, tinted the village's color. Its chunks stay
  ungenerated until visited or activated; the marker is the
  only trace until then.

### 13.5 Relations: trade, alliance, rivalry, war

- **Relation value per pair: -100 to 100, starts at 0 on
  discovery.** Sim-owned, moved only by the events below. Bands
  the player reads: Hostile <= -70, Rival -69 to -40, Wary -39
  to -1, Neutral 0 to 29, Friendly 30 to 59, Allied 60+.
  Drift table, all constants, all visible in the tuning section:

  | Event | Relation change |
  |---|---|
  | Completed trade | +2 (max +2 per season per pair) |
  | Caravan lost to raiders | -3 |
  | Alliance season | +2 per season |
  | War season | -5 per season |
  | War-party kill (per villager) | -8 |
  | Peace signed | +10 |
  | Envoy visit | +3 (cooldown-gated) |
  | No contact | Drift 1 per season toward 0 |

- **Trade (Phase F).** A caravan is one trader figure carrying
  goods. At most one active caravan per village pair, departing
  at most once per season per pair, when a leader's
  `trade_offer` intent is accepted. Acceptance in v1 is
  automatic when the offer is fair by the fixed price table
  (the existing `PRICES`: food 2, wood 1, stone 2, iron 4,
  tools 6, cloth 4, herbs 5) and relation >= 0: leaders
  propose, the price table disposes. Counter-offers are later
  depth, not v1. Goods move at those prices; coins move the
  opposite way from the village funds; totals are conserved.
  If a village cannot afford the coin side, the trade shrinks
  to what it can afford, clamped by the sim with a log line.
  No new currency, no barter mode: the price table plus coins
  is the mechanism. Caravan capacity is 20 goods, plus 10 per
  relation band (30 at Friendly, 40 at Allied). The caravan
  paths by chunk-aware A* avoiding water; if no path exists,
  the trade fails with a log line — nothing teleports. Risk:
  raiders target caravans in their chunk (a small targeting
  addition); a caught caravan loses its goods through the
  existing steal path and the trader flees to the nearest
  village. Speed is villager speed; the trip is a round trip.
- **Alliance (Phase G).** Requires relation >= 60, both
  leaders' intents (propose, then accept within 3 dawns), and a
  10-day cooldown. Effects: caravan capacity +10, and allied
  guards — when village A is raided, village B sends 2 guards
  who walk over, fight by the guard rules, and walk home; their
  deaths reduce B's population and relations per the combat
  rules. There is no shared raid-warning mechanic in v1: the
  reinforcement is the shared defense. An alliance breaks when
  relation falls under 20, when a leader returns
  `end_alliance` (30-day cooldown), or when war is declared
  (betrayal: relation set to -40 by the sim, logged).
- **Rivalry (Phase H).** Relation <= -40 is rivalry: trade
  stops, a log line names it, and at most one seeded "border
  incident" per season (a log line plus -2). Rivalry is a state
  the numbers produce, not a decision anyone takes.
- **War (Phase H).** `declare_war` requires rivalry, relation
  <= -70, and a 30-day cooldown; the god cannot declare war
  (section 13.7). A war party is 3-6 fighters, scaling with
  the declaring village's population like a raid, spawning at
  the home village, walking to the target, fighting by section
  6.3, stealing at most 20 goods (carried home; the goods leave
  the defender's stockpile only when the party arrives home
  alive), retreating under 25% health or with a full load. War
  exhaustion is sim-owned: +1 per war day, +2 per death on
  either side. Peace is offered by `offer_peace` when exhaustion
  reaches 10, accepted by the other leader's matching intent
  within 3 dawns; on peace, relation is set to -10 with a
  30-day truce (no new war intents). White peace: 30 days with
  no battle ends the war automatically at -10, logged.
- **Raiders versus war parties, stated plainly.** Raiders are
  stateless, telegraphed, scale on the player's village, and
  vanish. War parties are village-owned, persistent, retreat
  home, carry loot into a real stockpile, and their deaths cost
  a real village people and relations. The military covers both
  with one combat system (section 6.3); the difference is
  identity, persistence, and consequences — not new combat
  rules.

### 13.6 What the player sees

- **Relations panel section.** One row per known village:
  name, leader name, relation meter with its band label,
  status (trading, allied, rival, at war), last event in one
  line, caravan state (en route, arrived), war exhaustion while
  at war. Unknown villages do not appear at all.
- **Log lines.** Discovery, trader arrival and departure,
  trade completion (goods and coins, one line), alliance
  proposal, acceptance, and break, rivalry, war declaration,
  war party sighted (with the village name), peace. Leader
  decisions speak in the leader's voice; events speak in the
  sim's voice. Relation changes reach the HUD only on a band
  change ("Emberford is now Friendly"), never per point: no
  spam for arithmetic.
- **Render.** Trader figure: the villager figure with a yellow
  sash and a pack bundle. War party: dark tunic, spear, and a
  sash in the village's color. Village colors are fixed: the
  player's village red (as guards today), neighbor A ochre,
  neighbor B teal. The village marker is a standing stone in
  the village color. No track or road mesh is drawn for caravan
  routes in v1: the trader walks the grass, and a dirt track
  system is a later art decision, not a sim need.

### 13.7 Authority: who holds diplomacy

Extends the authority table in section 6.4 on the same pattern:
leaders decide via validated intents, the god proposes via
directives, the sim owns numbers and combat. Decision 14 is
John's call on this split; the recommendation is the table
below, because it keeps the god's hand visible without letting
the god puppeteer another village's leader.

| Decides | Leader (model) | God (John) | Fixed rules (sim) |
|---|---|---|---|
| Trade offers, alliance proposals, peace offers, rivalry/war declarations | Yes, via validated intents, gated | No (god never trades or treats directly) | Price table, thresholds, cooldowns, caravan movement, conservation |
| Suggest trade / suggest alliance with a village | Weighed by the player's village leader, which may refuse with a log line | Yes, god-bar directive, same family as today's directives | Directive cooldowns |
| Send envoy (discover a village, +3 relations) | No | Yes, god-bar action, 5-day cooldown, arrives next dawn | Discovery, relation change |
| Declare war, order an attack on a village | Only the declaring village's own leader, via intent plus state gates | No — the god cannot declare war or order an attack | War gates, exhaustion, truce |
| Relation numbers, caravan outcomes, combat, casualties | No, never | Only through the envoy action above | Sim only |

### 13.8 Phasing

- **Phase F, neighbors and trade.** Site picking, village
  records, the abstract tick, activation/deactivation,
  discovery, caravans, the relations meter and panel, trade.
  Sites are picked in the Phase A migration, but nothing about
  villages is visible until this phase. Gate: the conservation
  and trade tests.
- **Phase G, alliances.** Alliance intents, thresholds,
  reinforcements, break rules. Gate: the alliance tests.
- **Phase H, rivalry and war.** Rivalry state, war
  declaration, war parties, exhaustion, peace and white peace.
  Gate: the war tests and the fairness invariant (no wipe).
- **Why this order.** F proves the multi-village plumbing
  (spawn, abstraction, caravans, conservation) before anything
  depends on it. G adds agreement mechanics on top of working
  trade. H adds conflict last because war reuses guards,
  caravan paths, and the relations numbers — and because a war
  bug can empty a village, it ships only after the defense has
  proven itself on the live world.

## 14. Open decisions for John

1. **10x meaning and chunk rounding — SUPERSEDED by Decision
   10.** The original 10x question (160 square vs 144 square vs
   160x144 rectangular) is answered by the "much bigger"
   direction: the design target is now 320 square. Kept here so
   the change of mind is on the record.
2. **Militia.** Standing guards only (recommended for phase 1),
   or guards plus a muster call-up in the same build?
3. **Unmanned towers.** Manned-only shooting (recommended: a
   defense you can see staffed), or unmanned towers at half
   damage (keeps today's automatic towers, weaker)?
4. **Casualties.** Named deaths through the existing path
   (recommended: deaths already cost faith and morale, and the
   log names them), or abstracted injury with no deaths in
   combat? Note: abstracting deaths would make raids consequence-
   free in the one currency the village already feels.
5. **Raid difficulty defaults.** Size cap 10, gap 8 days, as
   specified, or a gentler first season (cap 6, as today) while
   guards prove themselves?
6. **Outer wall rings.** Second ring at R=18 in phase 1
   (recommended), or hold all wall building to the R=9 ring
   until the village is visibly bursting?
7. **SAVE_VERSION coordination.** This design and the
   leader/villager-agency design share one migration bump.
   Which lands first (takes 5), which takes 6? Must be settled
   at build time.
8. **Farm zone.** Stays the western district at radius 14
   (recommended), or should the bigger map earn a second farm
   district later? Later means a separate design either way.
9. **Guard look.** Spear and red sash on the existing figure
   (recommended, cheapest read), or a distinct guard figure?
10. **Target map size.** 320 square (44.4x area, recommended),
    160 square (the 10x floor), 640 square (178x, supportable
    without redesign), or effectively unbounded streamed
    terrain (needs the edge rules rewritten; a later decision
    either way)?
11. **"Minecraft-style": rendering technology only
    (recommended), or the blocky voxel LOOK too?** Technology
    keeps the approved art and changes how it draws; the voxel
    look is a full art pass, sized in weeks, with no sim
    benefit, and ships separately if wanted at all.
12. **Starting village count.** 3 villages total (recommended:
    player's plus 2 neighbors), 2 (one neighbor), or 4-5?
13. **Distant-village abstraction sign-off.** Abstract dawn
    ticks with exact conservation across activation, as
    specified in section 13.2 (recommended), or full simulation
    for every village at all times (costs the chunked design's
    whole point and is not recommended at any village count)?
14. **Diplomacy authority.** Leaders decide via intents, god
    proposes via directives and holds only the envoy action,
    god cannot declare war (recommended, section 13.7 table),
    or a stronger god hand (god may propose treaties that bind,
    or declare war directly)?

## 15. Build decisions log (Nov 3–4, 2026)

John approved the recommended defaults on trust ("I'll take your
word for it. Go ahead.", Nov 3, 2026, 17:55 ET) and did not read
this doc. Every choice below was taken at build time under the
standing rule: open decisions without a doc recommendation get the
conservative/safer default, implemented and recorded — never
stalled, never a new system the doc doesn't specify. All phases
A–H shipped; the live game (v12 / SAVE_VERSION 4) does not change
until the parent deploys this build.

### Approved defaults (John's approval = the recommendations)

- Map 320×320 (20×20 chunks, 102,400 cells), chunked streaming.
  160-square floor superseded; 640/unbounded are later decisions.
- Minecraft-style = chunked streaming technology only; no
  voxel-look art pass. Existing procedural art, era palettes,
  weather carry over.
- 3 villages total at first (player's + 2 neighbors),
  deterministic sites in new territory only, 60+ cells from
  center, 50+ apart, on land.
- Distant villages tick abstractly once per dawn; exact
  conservation across activation; no cross-village corruption.
- Diplomacy authority: village leaders decide (intents
  trade_offer/relation_move/envoy + existing leader intents);
  god proposes + envoy only; god CANNOT declare war.
- Phases in order: A–C map/chunks/streaming, D–E guards/military,
  F trade, G alliances, H war.

### Section 14 decisions, as built

1. 10x meaning — SUPERSEDED (320 square target).
2. Militia — NO. Standing guards only (Phase D).
3. Unmanned towers — manned-only shooting (Phase D).
4. Casualties — named deaths through the existing path (Phases
   D/H; war deaths use removeVillager like every other death).
5. Raid difficulty — cap 10, gap 8 days, as specified (Phase E).
6. Outer wall rings — second ring at R=18 in phase 1 (Phase E).
7. SAVE_VERSION — this build takes 5; the leader/villager-agency
   design's own 4-to-5 step takes 6 when it lands later.
8. Farm zone — stays the western district at radius 14.
9. Guard look — spear + red sash on the existing figure.
10. Target map size — 320 square (approved default).
11. Minecraft-style — technology only (approved default).
12. Starting village count — 3 total (approved default).
13. Distant-village abstraction — abstract dawn ticks with exact
    conservation (approved default). Phase F scope note: activated
    neighbors spawn visible villagers/buildings but do NOT run the
    full economy loop (no production/consumption/building; the
    record stockpile is frozen while active except via trade).
    The full per-village economy is a later layer, not a silent
    omission — the plumbing-first reading of §13.8.
14. Diplomacy authority — leaders decide (approved default).
    Leaders run on the existing rules/utility brain behind the
    intent schema + validation. NO model calls, API keys, or
    network calls were added to the sim; the model loop is a
    later layer, and the village leaders' intents are the seam
    it will plug into.

### Further defaults chosen at build time

- `SIZE` kept as an exported alias of `WORLD_SIZE` (320) for
  existing import sites; new constants `WORLD_SIZE=320`,
  `CHUNK=16`, `OLD_SIZE=48`, `CHUNKS_ACROSS=20`.
- Phase C: the §4 band table wins over the §4 prose line about
  trees past 5 chunks (the table is stricter: silhouette =
  ground/water/massing only, no trees). Rebuild queue is FIFO
  (new chunks drain ahead of dirty home chunks; one rebuild per
  frame). Home pin = the 9 home chunks while any raid, war party,
  or caravan is active. Neighbor pinning via a `_pinnedChunks`
  set, filled from Phase F on.
- Phase E: raid spawn stays at the old-block edge (the outer ring
  at R=18 sits inside the old block; raiders cross both rings).
  Towers stay on the inner ring (outer-ring towers are a later
  decision).
- Phase F price table: the doc §13.5 table names goods that do
  not exist in the sim (iron, tools, cloth, herbs). Trade uses
  the code's existing PRICES {food 2, fish 2, meat 3, wood 1,
  stone 1, ore 4} and coins, per the build task instruction.
- Phase F abstract tick (proposed values, implemented as
  recorded): births rng < pop×0.012, deaths rng < pop×0.01,
  pop floor 3, cap popCap; food +pop×(0.4×2.4 + 0.1×1.2 +
  0.05×1.5) − pop×1.1; wood +pop×0.2×1.8 − pop×0.1; stone
  +pop×0.15×0.8; ore +pop×0.15×0.3; fish +pop×0.1×0.8 −
  pop×0.1; meat +pop×0.05×0.6 − pop×0.05; coins +1/dawn cap
  80; goods cap 200, floor 0; tech +2/dawn via
  techThresholdFor, capped at the top tier; morale drifts 10%
  toward 50.
- Phase F: NO autonomous trade offers from any leader (trades
  only via the two doc-mandated first-season trader caravans and
  god suggest-trade directives weighed by the player's leader);
  neighbor leaders make no autonomous decisions in Phase F.
  Envoy targets the nearest unknown village, else the
  lowest-relation known village. Camera-dwell timing (10s within
  3 chunks) lives in main.js; the sim owns activation/conversion.
  Site-chunk generation clears only (trees/stone/water removed in
  radius 6); founding buildings materialize at activation, not
  at generation (the conservation invariant decides between the
  doc's two sentences). Separate village RNG stream `_vrng`:
  distant-village randomness must never shift what the player's
  villagers do next. Caravan path cap `CARAVAN_PATH_STEPS =
  60000`; caravan arrival is positional (<1.5 cells), not
  path-emptiness-based.
- Phase G: alliance state lives on village records (`allies`,
  `allyOffer`, `allyCooldownDay`), symmetric. Break via
  `end_alliance` sets a 30-day re-formation cooldown; other
  breaks (relation < 20) set 10 days. Allied-guard death costs
  −2 relations (a conservative reading of "deaths reduce
  relations per the combat rules" — no explicit table value
  exists for allied-guard deaths; the war-party kill −8 was
  judged too large for a defender's death). Reinforcements reuse
  the guard kit in the renderer; village-colored war-party
  rendering is Phase H. Flood low-ground line:
  `DISASTER_FLOOD_LOW_H = 0.35` (measured: most settled ground
  sits below 0.55, so 0.55 would flood the whole village).
- Phase H: betrayal is built and unit-tested but never
  auto-fired. The doc's betrayal sentence (relation set to −40
  on declaring against an ally) is unreachable under the
  break-at-20 rule plus the −70 declaration gate, so the dawn
  leader decision never declares on an ally; `declareWar`
  carries the betrayal branch (break + set −40 + log) for
  leader intents, and the validator accepts a betrayal
  declaration as valid with a `betrayal` flag. The declarer at
  dawn is the larger village (stronger marches); ties go to the
  lower id. War-party size scales like a raid: clamp(2 +
  floor(pop/10), 3, 6). Fighter chase speed 4.2 (faster than
  flee 3.4 — equal speeds plus a head start made wars
  bloodless); march speed stays 2.2; chase steering is direct
  (hunter precedent), the march keeps paths. Fighter damage is
  continuous contact damage (6 + 2×tool)/s, the raider
  precedent for villager lethality; defending guards keep their
  once-a-second strikes. Loot claims tick every 5s (2 goods) so
  a party cannot fill up and leave before a fight develops.
  Border incidents: 50% per dawn per rival pair, capped at one
  per season, on the village RNG stream. Peace offers alternate
  sides and are accepted the next dawn while exhaustion holds
  ≥10; the 3-dawn lapse branch is unreachable under deterministic
  acceptance and is kept as documentation of the window.
- Live feedback, Nov 3–4 (both shipped with this build, neither
  optional): (1) villager panel close — X button in the panel
  header, ground-tap close, re-tap close, one `closePanel()`
  path; verified by reading the tap/selection paths end to end
  plus static hud_smoke assertions (the harness has no DOM).
  (2) disasters move population — fire/quake/flood kill capped
  at 1/4 of population per use (`DISASTER_MAX_FRACTION =
  0.25`), plague dawn deaths capped by the same budget, famine
  via the real empty-store hunger chain; every disaster logs
  named casualty/damage lines; HUD population reflects losses
  immediately. Disaster wounding never reduces health below 1,
  so only the capped kill roll kills. Town center never falls
  to disaster building damage. Bless unchanged; cooldowns
  unchanged. `plague_smoke` expectations were updated as a
  requirement change (cap 5, not 2), recorded here, not
  silently weakened.

### Designed but NOT built

- The AI-leader model loop (Ollama council / per-villager
  agency): design only (`LEADER-AND-ERAS-DESIGN.md`). Village
  leaders run on rules/utility behavior behind the intent
  schema; the model loop is a later layer.
- The full per-village economy for activated neighbors (§13.8
  plumbing-first reading; see above).
- Outer-ring towers, 640/unbounded maps, voxel-look art,
  militia, fog of war / scout job, romance/genetics systems:
  all out of scope per the doc or the build task.
- No new currency, no new economy numbers beyond the doc and
  the recorded constants above.
