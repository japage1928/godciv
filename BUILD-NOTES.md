# GodCiv v14 build notes

John's direction, Nov 3, 2026 (21:12 ET): consolidate the HUD to one row;
villagers must wander and spread out; farms must disperse; more jobs with
production buildings; products raise citizen class and housing value.

## Phase 0 — file split (this push)

`src/sim.js` (4,541 lines, v13) split by system into `src/sim/*.js`;
`src/sim.js` is now a thin re-exporter so every existing import keeps
working. No behavior change: the export set is identical to v13 plus 16
promoted names that were already used cross-module (`clamp`, `inBounds`,
`oldBlockFor`, `setTarget`, `think`, `doWork`, `generateCorridor`,
`findHutSpot`, `pairKey`, `damageBuildings`, `disasterKill`,
`stepForeignVillager`, `stepRaiders`, `stepWarCombat`, `stepWarFighter`,
`stepWarParties`). Modules: core (constants/helpers/villager records),
terrain (height/lakes/old block/village sites), diplomacy (relations),
grid (chunks/cells/paths), world (founding/serialize/migrate), brain
(delegation/market/morale/think), planning (streets/lots/walls/farms),
combat (raids/disasters/guards/villages/caravans/war), step (main tick),
actions (god powers). Save format untouched; SAVE_VERSION stays 5.
Verified: export-key diff old-vs-new (0 missing), full `npm test`
(17 suites) green before push.

## Recorded defaults for Phases 1-5 (decided before implementation)

Phase 1 HUD: the 4 chip rows merge into ONE horizontally scrollable
`.hud-row` (no wrap); ALL chip ids survive unchanged; the `#top-actions`
toolbar stays its own row below. 4 product chips are added to the single
row. Status-bar meta + `#app` safe-area padding untouched.

Phase 2 movement: celebration spread is deterministic per villager from
`hash01(seed, id, ...)` (ring radius 2-6 around the plaza, walkable-cell
validation, 4 rotation fallbacks, center fallback). Eat/haul center
targets get small per-villager ring offsets (radius 1-2). Idle wander:
`think()` assigns a wander target (seeded hash, radius 3-9 around
home/center, walkable cell) when a villager ends idle; new villager field
`restUntil` (backfilled 0) pauses re-wandering 4-9 sim-seconds after
arrival; idle-arrival branch in `step()`. Children wander within radius 2
of home. NO per-tick repulsion/personal-space pass (perf; spread +
offsets + wander suffice). Tick budget p95 <5ms vs the 250ms tick.

Phase 3 farm dispersion: west district rules unchanged; ADD satellite
districts radius 16-30, wedges N/E/S (+/-35 deg of cardinal), beds need
3x3 + 1-ring road clearance (lighter than the west 5x5 rule), minimum
bed-center separation 7 (Chebyshev) tracked via new persisted
`state.farmBeds` array backfilled from `_farmCells` clustering on load;
scoring prefers the district with fewest beds. `inFarmDistrict()` = west
zone OR satellite wedge; used by `findFarmBed`/`clearFarmBed`/`lotFree`
exclusion and `isPlanStreet` (streets route around satellite districts;
existing roads grandfathered). Farmhouses may anchor ANY district: the
`x < cx` west-only rule in `lotFree` is dropped, near-farm-within-3 +
out-of-core kept; `lotScore` farmhouse branch updated. Farm cap 54 -> 144
cells (16 beds). Crop-growth farmhouse bonus (radius 5) unchanged.

Phase 4 jobs/products: new `PRICES` goods furniture 6, pottery 4,
ironware 8, wares 10. Jobs: carpenter (workshop; 2 wood -> 1 furniture),
potter (kiln, new building, cost {wood 14, stone 12}, demand tech>=1 +
pop>=10, one kiln, progress 7; 2 stone -> 1 pottery), smith (smithy, new
building, cost {wood 18, stone 12, ore 4}, demand tech>=2 + pop>=12, one
smithy, progress 8; 1 ore -> 1 ironware), factory (factory, new building,
cost {wood 40, stone 30, ore 10}, demand tech>=5 + pop>=26, ONE factory,
progress 12; 1 wood + 1 stone + 1 ore -> 2 wares). Production consumes
stockpile inputs at the workplace in `doWork`; output via `addCarry` ->
haul -> deposit keep-share (existing path); recipes ARE the conservation
rule (tests assert stockpile deltas). `scoreJob` gates: -30 without
workplace, deficit-based (want 12). Delegation desired counts: carpenter
workshop?1:0 (2 if pop>=20), potter kiln?1:0, smith smithy?1:0, factory
factory?2:0; trim order appends carpenter/potter/smith/factory after
teacher, before guard. `lotScore` branches: kiln/smithy like workshop
(near stone, dist ~7); factory dist 9-13 near street. `JOB_COLORS`:
carpenter 0xa1887f, potter 0xba68c8, smith 0x607d8b, factory 0xf9a825.
`runMarket`: one wants-product clause (buyer with <2 of a product and
coins >= price, seller with >2) so products circulate; trade cap 3/round
unchanged. Deserialize backfills: new `PRICES` keys in `v.goods`
(existing loop covers it) + `state.stockpile` keys (ADD a backfill loop;
saved stockpiles lack new keys). No new currency.

Phase 5 class/housing: standing = product goods held
(furniture+pottery+ironware+wares) + floor(coins/10) + floor(education/2),
computed at dawn in new `updateClasses(state)` called from the dawn block.
Classes: 0 commoner, 1 artisan (standing >=4), 2 merchant (>=10),
3 gentry (>=18); `v.class` backfilled 0; class NEVER decreases (ratchet).
Housing tier on dwellings (`hut`/`longhouse`/`greathall`/`farmhouse`):
`b.tier` backfilled 0; tier = class>=3 -> 2, class>=1 -> 1, else 0 from
the highest-class occupant; tier NEVER decreases (ratchet); value = base
{hut 10, farmhouse 8, longhouse 24, greathall 40} x (tier+1). Render:
`timberHouse` gains a `tier` option (tier>=1: extra window + brass trim
0xd7a94e; tier>=2: wallH +0.15, gold trim 0xffd700, gold ridge);
`_buildingMesh` takes tier as 8th param for dwelling branches;
`_syncBuildings` signature includes tier and `safeMesh` passes `b.tier`;
queue frames tier 0. Panel: `villagerCard` shows class + home tier;
village panel summary shows tier counts + total housing value. Morale:
one part when >=25% of dwellings are tier>=1 (+4 "Comfortable homes").
SAVE_VERSION stays 5 (additive backfills only). APP_VERSION -> v14 at the
end of Phase 5; cache string distinct per push.

Hard rules: never reset the world; migration keeps every building/road/
field/wall/villager at exact coordinates; same save key; do not regress
the haze fix, settlement layout, defense/map systems, panel-close fix, or
disaster lethality; god cannot declare war or order attacks; no live
model calls, no API keys.
