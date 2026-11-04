// Headless settlement-layout smoke test. Run: npm test (or: node tests/layout_smoke.mjs)
// Tests for John's Nov 3 direction: houses stand on lots facing
// streets, roads never cross farm fields, growth infills before it
// sprawls, and old worlds load with their scattered buildings intact
// while new builds follow the lot rules. The sim is DOM/Three-free,
// so all of this runs headless in Node.
import assert from "node:assert";
import {
  newWorld, step, serialize, deserialize, applyGod, expandFarms,
  findLotSpot, lotScore, isPlanStreet, isFieldZone, farmDistrictOf, streetExtent, streetFrontage,
  paveStreets, planStreetCells, findPlannedSpot, scoreSpot, clearFarmBed, findFarmBed,
  SIZE, cellAt, peekCell, forEachGeneratedCell,
} from "../src/sim.js";

const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

// A fresh village offers lots on the plaza ring, and the old planning
// helpers now answer from the lot system.
{
  const { state: s, grid: g } = newWorld(42);
  const spot = findLotSpot(s, g, "hut");
  assert.ok(spot, "a fresh village must offer a hut lot");
  const [x, z] = spot;
  assert.ok(streetFrontage(g, x, z), "a lot must front a paved street");
  assert.ok(!isFieldZone(s, x, z), "a lot must not sit in the fields");
  assert.ok(!isPlanStreet(s, x, z), "a lot must not sit on a street");
  assert.ok(!cellAt(g, x, z).road && !cellAt(g, x, z).farm && !cellAt(g, x, z).building, "a lot must be free ground");
  assert.ok(findPlannedSpot(s, g, "hut"), "findPlannedSpot must still return a lot");
  const founding = s.buildings.find((b) => b.type === "hut");
  assert.equal(scoreSpot(s, g, founding.x, founding.z, "hut"), -Infinity, "an occupied cell must score as unusable");
  assert.equal(streetExtent(s), 5, "a founding village plans out to ring 5, got " + streetExtent(s));
}

// Scripted growth: 40 huts, paving whenever lots run out. Every new
// dwelling fronts a street, none stands in the fields, dwellings
// keep their distance, and no road ever sits on a farm cell or
// enters the field blocks.
{
  const { state: s, grid: g } = newWorld(43);
  const placed = [];
  for (let i = 0; i < 40; i++) {
    let spot = findLotSpot(s, g, "hut");
    let rounds = 0;
    while (!spot && rounds < 10) {
      const paved = paveStreets(s, g);
      assert.ok(paved > 0, "streets must extend when lots run out (iteration " + i + ")");
      rounds++;
      spot = findLotSpot(s, g, "hut");
    }
    assert.ok(spot, "lots must open within a few paving rounds (iteration " + i + ")");
    const [x, z] = spot;
    cellAt(g, x, z).building = "hut";
    cellAt(g, x, z).blocked = true;
    s.buildings.push({ type: "hut", x, z, done: true, builtDay: 1 });
    placed.push([x, z]);
    forEachGeneratedCell(g, (rx, rz, c) => {
      assert.ok(!(c.road && c.farm), "no road may sit on a farm cell, at " + rx + "," + rz);
      assert.ok(!(c.road && isFieldZone(s, rx, rz)), "no road may enter the field blocks, at " + rx + "," + rz);
    });
  }
  const dwellings = s.buildings.filter((b) => ["hut", "longhouse", "greathall"].includes(b.type));
  for (let i = 0; i < dwellings.length; i++) for (let j = i + 1; j < dwellings.length; j++) {
    assert.ok(cheb(dwellings[i].x, dwellings[i].z, dwellings[j].x, dwellings[j].z) >= 3,
      "dwellings must keep 3 cells apart, " + JSON.stringify(dwellings[i]) + " vs " + JSON.stringify(dwellings[j]));
  }
  for (const [x, z] of placed) {
    assert.ok(streetFrontage(g, x, z), "placed hut must front a street, at " + x + "," + z);
    assert.ok(!isFieldZone(s, x, z), "placed hut must not stand in the fields, at " + x + "," + z);
  }
}

// Infill before sprawl: each chosen lot sits within 2 cells of the
// nearest available lot. The slack of 2 covers the clustering bonus;
// without the distance term, choices would wander outward at once.
{
  const { state: s, grid: g } = newWorld(44);
  for (let i = 0; i < 24; i++) {
    let spot = findLotSpot(s, g, "hut");
    let rounds = 0;
    while (!spot && rounds < 10) { paveStreets(s, g); rounds++; spot = findLotSpot(s, g, "hut"); }
    assert.ok(spot, "a lot must open within a few paving rounds (iteration " + i + ")");
    let minD = Infinity;
    forEachGeneratedCell(g, (x, z) => {
      if (lotScore(s, g, x, z, "hut") > -Infinity) minD = Math.min(minD, Math.hypot(x - s._cx, z - s._cz));
    });
    const d = Math.hypot(spot[0] - s._cx, spot[1] - s._cz);
    assert.ok(d <= minD + 2, "lot choice must infill before sprawling: chose dist " + d.toFixed(1) + ", nearest lot " + minD.toFixed(1));
    cellAt(g, spot[0], spot[1]).building = "hut";
    cellAt(g, spot[0], spot[1]).blocked = true;
    s.buildings.push({ type: "hut", x: spot[0], z: spot[1], done: true, builtDay: 1 });
  }
}

// Farms grow in the farm districts (west founding district plus
// satellite districts since Phase 3), off the street plan, and a
// new bed keeps one cell clear of roads on every side.
{
  const { state: s, grid: g } = newWorld(45);
  s.stockpile.food = 0; s.stockpile.fish = 0; s.stockpile.meat = 0;
  for (let i = 0; i < 30; i++) expandFarms(s, g);
  assert.ok(s._farmCells.length > 18, "fields must grow under hunger, got " + s._farmCells.length);
  for (const [x, z] of s._farmCells) {
    assert.ok(farmDistrictOf(s, x, z) !== null, "every farm cell must stay in a farm district, at " + x + "," + z);
    assert.ok(!cellAt(g, x, z).road, "no farm cell may be a road cell, at " + x + "," + z);
    assert.ok(!isPlanStreet(s, x, z, 23), "no farm cell may sit on the street plan, at " + x + "," + z);
  }
}
{
  const { state: s, grid: g } = newWorld(46);
  const bed = findFarmBed(s, g);
  assert.ok(bed, "a new farm bed must exist");
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) < 2) continue;
    assert.ok(!cellAt(g, bed[0] + dx, bed[1] + dz).road, "a new bed must keep one cell clear of roads, road at " + (bed[0] + dx) + "," + (bed[1] + dz));
  }
  const added = clearFarmBed(s, g, s._cx - 9, s._cz);
  assert.ok(added >= 3, "a farm bed must add at least 3 new plots, added=" + added);
  for (const [x, z] of s._farmCells) assert.ok(!isPlanStreet(s, x, z, 23), "clearFarmBed must not farm a street cell, at " + x + "," + z);
}

// Farmhouses anchor the fields: their lots sit outside every farm
// district within reach of worked ground, and the bed cleared when
// one completes never farms outside the farm districts.
{
  const { state: s, grid: g } = newWorld(47);
  const spot = findLotSpot(s, g, "farmhouse");
  assert.ok(spot, "a farmhouse lot must exist at the field edge");
  assert.ok(farmDistrictOf(s, spot[0], spot[1]) === null, "a farmhouse lot must sit outside the farm districts");
  let nearFarm = false;
  for (let dx = -3; dx <= 3 && !nearFarm; dx++) for (let dz = -3; dz <= 3; dz++) {
    const nc = peekCell(g, spot[0] + dx, spot[1] + dz);
    if (nc && nc.farm) nearFarm = true;
  }
  assert.ok(nearFarm, "a farmhouse lot must sit within reach of worked fields");
  const added = clearFarmBed(s, g, s._cx - 4, s._cz + 8);
  assert.ok(added >= 3, "clearing a bed at the field edge must add plots, added=" + added);
  for (const [x, z] of s._farmCells) assert.ok(farmDistrictOf(s, x, z) !== null, "field clearing must stay in the farm districts, at " + x + "," + z);
}

function inBoundsCheck(grid, x, z) { return x >= 0 && z >= 0 && x < SIZE && z < SIZE && !!peekCell(grid, x, z); }

// Grandfathering: an old-format world with a scattered hut and a
// road laid through a farm bed loads with everything intact, and
// new construction from then on follows the lot rules. Nothing is
// moved, deleted, or rebuilt.
{
  const { state: s, grid: g } = newWorld(7);
  let scatter = null;
  forEachGeneratedCell(g, (x, z, c) => {
    if (scatter) return;
    if (!c.water && !c.building && !c.farm && !c.tree && !c.road && c.stone <= 0
      && Math.hypot(x - s._cx, z - s._cz) >= 12 && !streetFrontage(g, x, z)) scatter = [x, z];
  });
  assert.ok(scatter, "open ground must exist for the scattered hut");
  cellAt(g, scatter[0], scatter[1]).building = "hut";
  cellAt(g, scatter[0], scatter[1]).blocked = true;
  s.buildings.push({ type: "hut", x: scatter[0], z: scatter[1], done: true, builtDay: 20 });
  const [fx, fz] = s._farmCells[0];
  cellAt(g, fx, fz).road = true; // the old failure: a road through a crop field
  const beforeBuildings = s.buildings.map((b) => b.type + b.x + "," + b.z).sort().join("|");
  let beforeRoads = 0; forEachGeneratedCell(g, (x, z, c) => { if (c.road) beforeRoads++; });
  const beforeFarms = s._farmCells.length;
  const loaded = deserialize(serialize(s, g));
  const ls = loaded.state, lg = loaded.grid;
  assert.equal(ls.buildings.map((b) => b.type + b.x + "," + b.z).sort().join("|"), beforeBuildings, "every building, including scattered ones, must survive load");
  let afterRoads = 0; forEachGeneratedCell(lg, (x, z, c) => { if (c.road) afterRoads++; });
  assert.equal(afterRoads, beforeRoads, "grandfathered roads must survive load untouched");
  assert.equal(ls._farmCells.length, beforeFarms, "farm plots must survive load");
  assert.ok(cellAt(lg, fx, fz).road && cellAt(lg, fx, fz).farm, "the old road through the field is grandfathered, not erased");
  const spot = findLotSpot(ls, lg, "hut");
  assert.ok(spot, "a lot must exist in the loaded world");
  assert.ok(streetFrontage(lg, spot[0], spot[1]), "new builds in a loaded world must front a street");
  paveStreets(ls, lg);
  forEachGeneratedCell(lg, (x, z, c) => {
    assert.ok(!(c.road && c.farm && !(x === fx && z === fz)), "paving must never lay a new road on a farm cell, at " + x + "," + z);
  });
}

// A god-ordered hut stands on a lot too: the god's hut action uses
// the same spot finder as the village's own builders.
{
  const { state: s, grid: g } = newWorld(48);
  s.stockpile.wood = 100; s.stockpile.stone = 100;
  const res = applyGod(s, g, "hut");
  assert.ok(res.ok, "god hut must queue, got " + res.reason);
  const q = s.buildQueue.find((o) => o.type === "hut");
  assert.ok(q, "a hut must be queued");
  assert.ok(streetFrontage(g, q.x, q.z), "a god-ordered hut must also stand on a lot");
  assert.ok(!isFieldZone(s, q.x, q.z), "a god-ordered hut must not stand in the fields");
}

// Walls never steer the plan, and paving never overwrites a wall.
// A far-flung settled building does extend the plan.
{
  const { state: s, grid: g } = newWorld(49);
  const wallCell = planStreetCells(s, 8).find(([x, z]) => { const c = cellAt(g, x, z); return !c.road && !c.building && !c.farm && !c.water; });
  assert.ok(wallCell, "an unpaved plan-street cell must exist");
  cellAt(g, wallCell[0], wallCell[1]).building = "wall";
  cellAt(g, wallCell[0], wallCell[1]).blocked = true;
  s.buildings.push({ type: "wall", x: wallCell[0], z: wallCell[1], done: true, builtDay: 1 });
  for (let i = 0; i < 10; i++) paveStreets(s, g);
  assert.ok(!cellAt(g, wallCell[0], wallCell[1]).road, "paving must never overwrite a wall");
  assert.equal(streetExtent(s), 5, "walls do not extend the street plan");
  s.buildings.push({ type: "hut", x: s._cx + 10, z: s._cz, done: true, builtDay: 1 });
  assert.equal(streetExtent(s), 11, "a building at distance 10 must extend the plan to ring 11");
}

// A live 6-day run: the village still grows, every dwelling fronts
// a street, and no road ever lands on a farm cell.
{
  const { state: s, grid: g } = newWorld(31);
  for (let i = 0; i < 4320; i++) step(s, g, 0.25);
  assert.ok(s.buildings.length > 3, "a 6-day village must have raised buildings past founding, got " + s.buildings.length);
  for (const b of s.buildings) {
    // The town center and altar are the plaza's heart, not lot
    // buildings: the streets wrap around them instead. Neighbor
    // villages have no street plan by design (their founding
    // buildings materialize at fixed offsets), so the street bar
    // covers the player's village only.
    if ((b.village ?? 0) !== 0) continue;
    if (["wall", "tower", "marker", "towncenter", "altar"].includes(b.type)) continue;
    assert.ok(streetFrontage(g, b.x, b.z), "every settled building must front a street, " + JSON.stringify(b));
  }
  forEachGeneratedCell(g, (x, z, c) => {
    assert.ok(!(c.road && c.farm), "no road may sit on a farm cell, at " + x + "," + z);
  });
}

console.log("layout smoke test passed: lots face streets, roads avoid fields, growth infills, old worlds load intact");
