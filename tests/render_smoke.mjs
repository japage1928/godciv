// Headless render smoke test. Run: npm test (or: node tests/render_smoke.mjs)
// Regression test for the v12 launch bug: _buildingMesh threw on the
// town center (timberHouse read pal.wall with pal undefined), the sync
// recorded its signature and cleared the group first, and the village
// rendered with no buildings forever. Three.js geometry/materials run
// headless in Node; only the WebGLRenderer needs a DOM, and nothing
// here constructs one.
import assert from "node:assert";
import * as THREE from "../vendor/three.module.js";
import { Renderer } from "../src/render.js";
import { newWorld, cellAt, generatedChunks } from "../src/sim.js";

const TYPES = ["towncenter", "hut", "longhouse", "greathall", "granary", "well", "workshop", "shrine", "farmhouse", "school", "healer", "wall", "tower", "marker", "stockpile", "altar", "mystery-type"];

// Every building type builds a non-empty mesh at every era and tech
// level, including the direct timberHouse call sites (town center,
// workshop, greathall, farmhouse, healer) that used to omit pal/era.
{
  const fake = { _nightMeshes: [], _chimneys: [], _season: "spring" };
  for (const era of [0, 1, 2, 3]) {
    for (const tech of [0, 2, 6]) {
      for (const type of TYPES) {
        fake._nightMeshes = []; fake._chimneys = [];
        const g = Renderer.prototype._buildingMesh.call(fake, type, 24, 24, tech, era);
        assert.ok(g && g.children && g.children.length > 0, "type " + type + " era " + era + " tech " + tech + " must build a non-empty mesh");
      }
    }
  }
}

// _syncBuildings on a real founding world: no throw, the group fills,
// a repeat call is a no-op, and a new building grows the group.
{
  const { state, grid } = newWorld(42);
  const fake = Object.create(Renderer.prototype);
  fake.buildingsGroup = new THREE.Group();
  fake.dressingGroup = new THREE.Group();
  fake._nightMeshes = []; fake._chimneys = []; fake._season = "spring";
  fake._buildSignature = undefined; fake._wasNight = null;
  fake._syncBuildings(state, grid);
  const firstCount = fake.buildingsGroup.children.length;
  assert.ok(firstCount >= 2, "founding world must draw buildings, got " + firstCount);
  fake._syncBuildings(state, grid);
  assert.equal(fake.buildingsGroup.children.length, firstCount, "repeat sync with an unchanged signature must not rebuild");
  state.buildings.push({ type: "hut", x: state._cx + 6, z: state._cz, done: true, builtDay: 1 });
  fake._syncBuildings(state, grid);
  assert.ok(fake.buildingsGroup.children.length > firstCount, "a new hut must grow the drawn group");
}

// Guard kit: a guard figure carries a spear and a red sash in its
// userData, hidden until the villager works the guard job.
{
  const fake = Object.create(Renderer.prototype);
  const g = Renderer.prototype._villagerGroup.call(fake, { id: 1, job: "guard" });
  assert.ok(g.userData.spear && g.userData.sash, "a guard figure must carry a spear and a sash");
  assert.equal(g.userData.spear.visible, false, "the spear starts hidden until the job is taken");
  const plain = Renderer.prototype._villagerGroup.call(fake, { id: 2, job: "farmer" });
  assert.ok(plain.userData.spear && plain.userData.sash, "every figure carries the guard kit meshes");
  console.log("guard spear + sash ride on the villager figure");
}

// A manned tower draws its posted guard on the platform; an unmanned
// tower draws empty.
{
  const { state, grid } = newWorld(42);
  const fake = Object.create(Renderer.prototype);
  fake.buildingsGroup = new THREE.Group();
  fake.dressingGroup = new THREE.Group();
  fake._nightMeshes = []; fake._chimneys = []; fake._season = "spring";
  fake._buildSignature = undefined; fake._wasNight = null;
  state.buildings.push({ type: "tower", x: state._cx + 5, z: state._cz, hp: 60, maxHp: 60, done: true, builtDay: 1 });
  fake._syncBuildings(state, grid);
  const unmanned = fake.buildingsGroup.children.length;
  const g = state.villagers[0];
  g.assignedJob = "guard"; g.job = "guard";
  g.post = { x: state._cx + 5, z: state._cz, kind: "tower" };
  fake._syncBuildings(state, grid);
  assert.ok(fake.buildingsGroup.children.length > unmanned, "a manned tower must draw its guard figure");
  console.log("manned tower draws its posted guard");
}

// Winter snow is a dusting, not a blanket: on a pitched hut the snow
// mesh must span only part of the roof width, so the red tile reads
// through. The old full-slope slabs spanned wider than the body.
// Also: every house gets a fake contact shadow, and a chimney gets a
// glow flame for dusk/night.
{
  const fake = { _nightMeshes: [], _chimneys: [], _season: "winter" };
  const g = Renderer.prototype._buildingMesh.call(fake, "hut", 24, 24, 0, 0, 0.45);
  let snow = null, shadow = null, glow = 0;
  const bodyBox = new THREE.Box3();
  for (const child of g.children) {
    if (!child.geometry) continue;
    child.geometry.computeBoundingBox();
    if (child.userData.isSnow) snow = child;
    else if (child.userData.isShadow) shadow = child;
    else {
      if (child.userData.glow) glow++;
      bodyBox.union(child.geometry.boundingBox);
    }
  }
  assert.ok(snow, "hut must have a snow mesh");
  const bodySpan = bodyBox.max.x - bodyBox.min.x;
  const snowSpan = snow.geometry.boundingBox.max.x - snow.geometry.boundingBox.min.x;
  assert.ok(bodySpan > 0 && snowSpan > 0, "meshes must have extent");
  assert.ok(snowSpan < bodySpan * 0.9, "snow must cover only part of the roof slope: snow span " + snowSpan.toFixed(2) + " vs body " + bodySpan.toFixed(2));
  assert.ok(shadow, "hut must have a contact shadow quad");
  assert.ok(glow >= 2, "hut with a chimney must have window glow and a chimney flame, got " + glow);
}

// Facing: a house turns its door toward its street, and a doorstep
// joins the door to the street, so lots read as lots facing streets
// instead of boxes all facing the same way.
{
  const { state, grid } = newWorld(42);
  state.buildings = [{ type: "hut", x: 30, z: 30, done: true, builtDay: 1 }];
  state.villagers = [];
  cellAt(grid, 30, 30).building = "hut";
  cellAt(grid, 31, 30).road = true; // street to the east, and no other road beside the hut
  const fake = Object.create(Renderer.prototype);
  fake.buildingsGroup = new THREE.Group();
  fake.dressingGroup = new THREE.Group();
  fake._nightMeshes = []; fake._chimneys = []; fake._season = "spring";
  fake._buildSignature = undefined; fake._wasNight = null;
  fake._syncBuildings(state, grid);
  const hut = fake.buildingsGroup.children.find((m) => Math.abs(m.position.x - 30.5) < 0.01 && Math.abs(m.position.z - 30.5) < 0.01);
  assert.ok(hut, "hut mesh must exist");
  assert.ok(Math.abs(hut.rotation.y - Math.PI / 2) < 1e-6, "hut must face its eastern street, rotation=" + hut.rotation.y);
  const stepMesh = fake.dressingGroup.children.find((m) => m.userData.doorstep);
  assert.ok(stepMesh, "a doorstep must join the hut door to its street");
  assert.ok(stepMesh.position.x > 30.5, "the doorstep must sit on the street side of the hut");
}

// Village markers: one standing stone per known village, drawn
// without generating chunks (markers read peekCell / terrainHeight).
{
  const { state, grid } = newWorld(42);
  const fake = Object.create(Renderer.prototype);
  fake.scene = new THREE.Group();
  fake._markerSignature = "";
  fake._villageMarkers = null;
  const before = generatedChunks(grid).length;
  fake._syncVillageMarkers(state, grid);
  assert.equal(fake._villageMarkers.children.length, 2, "the player's own marker is one stone + one cap");
  assert.equal(generatedChunks(grid).length, before, "marker sync must not generate chunks");
  state.villages[0].known = true;
  fake._syncVillageMarkers(state, grid);
  assert.equal(fake._villageMarkers.children.length, 4, "a discovered neighbor gains its own marker");
  assert.equal(generatedChunks(grid).length, before, "a distant marker must not generate its chunks");
  fake._syncVillageMarkers(state, grid);
  assert.equal(fake._villageMarkers.children.length, 4, "repeat sync with an unchanged signature must not rebuild");
  console.log("village markers: player + discovered neighbor, zero chunk generation");
}

// render.js must never fetch: all textures are procedural canvases,
// and the module must not reference the network at all.
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/render.js", import.meta.url), "utf8");
  for (const banned of ["fetch(", "XMLHttpRequest", "TextureLoader", "http://", "https://", "new Image"]) {
    assert.ok(!src.includes(banned), "render.js must not contain " + banned);
  }
}

console.log("render smoke test passed: all building types build, sync fills and grows the group");
