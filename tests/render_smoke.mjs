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
import { newWorld } from "../src/sim.js";

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

console.log("render smoke test passed: all building types build, sync fills and grows the group");
