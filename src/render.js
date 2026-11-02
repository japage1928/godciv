// Three.js rendering for GodCiv PWA. Rendering only: it never changes
// sim state. The sim owns truth; this file draws it.
import * as THREE from "../vendor/three.module.js";
import { SIZE } from "./sim.js";

const JOB_COLORS = { farmer: 0x4caf50, woodcutter: 0x6d4c41, miner: 0x9e9e9e, fisher: 0x2196f3, hunter: 0xd84315, builder: 0xff9800, hauler: 0x8d6e63 };
const CELL = 1;

// Pure pan math, exported so tests can prove all four drag directions
// move the view and that opposite drags cancel. Screen-right on the ground
// is (cos yaw, -sin yaw) and screen-down is (sin yaw, cos yaw).
export function computePanDelta(yaw, scale, dx, dy) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  return [-(dx * cos + dy * sin) * scale, -(-dx * sin + dy * cos) * scale];
}

function makeSpeckleTexture(base, speckles, size = 128) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = speckles[Math.floor(rnd() * speckles.length)];
    const s = 2 + rnd() * 5;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Renderer {
  constructor(canvas, onTap) {
    this.canvas = canvas;
    this.onTap = onTap;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 55, 95);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.target = new THREE.Vector3(SIZE / 2, 0, SIZE / 2);
    this.distance = 34;
    this.zoomTarget = 34;
    this.yaw = Math.PI / 4;
    this.pitch = 0.9;
    this.shake = 0;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x4a7c4a, 0.95);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff2cc, 1.4);
    this.sun.position.set(30, 40, 10);
    this.scene.add(this.sun);
    this.hemi = hemi;

    this.villagerMeshes = new Map();
    this.deerMeshes = new Map();
    this.selectedRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide })
    );
    this.selectedRing.rotation.x = -Math.PI / 2;
    this.selectedRing.visible = false;
    this.scene.add(this.selectedRing);

    this.fireGroup = new THREE.Group();
    this.scene.add(this.fireGroup);
    this.floodPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshBasicMaterial({ color: 0x2196f3, transparent: true, opacity: 0 })
    );
    this.floodPlane.rotation.x = -Math.PI / 2;
    this.floodPlane.position.set(SIZE / 2, 0.55, SIZE / 2);
    this.scene.add(this.floodPlane);

    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 5; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(new THREE.BoxGeometry(3 + j, 0.5, 1.8), cloudMat);
        puff.position.set(j * 1.6 - 1.6, j * 0.15, 0);
        cloud.add(puff);
      }
      cloud.position.set((i * 11) % SIZE, 17 + (i % 3) * 1.5, (i * 7) % SIZE);
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
    this.groundTex = makeSpeckleTexture("#7da05c", ["#6b8f4e", "#8fb069", "#5d9e4a", "#a8b878"]);

    this._buildStatic = null;
    this._buildSignature = "";
    this._initInput();
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _cellColor(cell) {
    if (cell.water) return new THREE.Color(0x2f7fd6);
    if (cell.farm) return new THREE.Color(0x6b4a2b);
    const t = cell.h;
    if (t > 0.66) return new THREE.Color(0x8d8d8d);
    if (t > 0.58) return new THREE.Color(0x7da05c);
    return new THREE.Color(0x5d9e4a);
  }

  buildStatic(grid) {
    if (this._buildStatic) {
      for (const o of this._buildStatic) { this.scene.remove(o); o.geometry?.dispose?.(); }
    }
    const group = [];
    const groundGeo = new THREE.BoxGeometry(CELL, 0.5, CELL);
    const ground = new THREE.InstancedMesh(groundGeo, new THREE.MeshLambertMaterial({ map: this.groundTex }), SIZE * SIZE);
    const m = new THREE.Matrix4(); const col = new THREE.Color();
    let i = 0;
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
      const cell = grid[x][z];
      const h = cell.water ? -0.15 : cell.h * 0.9;
      m.makeTranslation(x + 0.5, h - 0.25, z + 0.5);
      ground.setMatrixAt(i, m);
      col.copy(this._cellColor(cell));
      if (cell.tree) col.multiplyScalar(0.85);
      ground.setColorAt(i, col);
      i++;
    }
    ground.instanceMatrix.needsUpdate = true;
    if (ground.instanceColor) ground.instanceColor.needsUpdate = true;
    this.scene.add(ground); group.push(ground);

    // Water surface: translucent blue tiles just above the ground, shimmering.
    const waterCells = [];
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (grid[x][z].water) waterCells.push([x, z]);
    if (waterCells.length) {
      this.waterMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 0.12, CELL), new THREE.MeshLambertMaterial({ color: 0x3a9ad9, transparent: true, opacity: 0.72 }), waterCells.length);
      waterCells.forEach(([x, z], idx) => {
        m.makeTranslation(x + 0.5, 0.32, z + 0.5);
        this.waterMesh.setMatrixAt(idx, m);
      });
      this.scene.add(this.waterMesh); group.push(this.waterMesh);
    }

    // Trees: trunk + canopy, instanced.
    const treeCells = [];
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (grid[x][z].tree) treeCells.push([x, z]);
    if (treeCells.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.18, 0.8, 6), new THREE.MeshLambertMaterial({ color: 0x6b4423, map: this.groundTex }), treeCells.length);
      const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.85, 0), new THREE.MeshLambertMaterial({ color: 0x2e6b2e }), treeCells.length);
      const canopyTop = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshLambertMaterial({ color: 0x3d8a3d }), treeCells.length);
      treeCells.forEach(([x, z], idx) => {
        m.makeTranslation(x + 0.5, 0.65, z + 0.5); trunk.setMatrixAt(idx, m);
        m.makeTranslation(x + 0.5, 1.7, z + 0.5); canopy.setMatrixAt(idx, m);
        m.makeTranslation(x + 0.5, 2.35, z + 0.5); canopyTop.setMatrixAt(idx, m);
      });
      this.scene.add(trunk, canopy, canopyTop); group.push(trunk, canopy, canopyTop);
    }
    this._buildStatic = group;
    this._stoneCells = [];
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (grid[x][z].stone > 0 || grid[x][z].ore > 0) this._stoneCells.push([x, z]);
    this.stoneMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.42, 0), new THREE.MeshLambertMaterial({ color: 0x9a9a9a }), Math.max(1, this._stoneCells.length));
    this.scene.add(this.stoneMesh);
    // Crops, one instance per farm cell.
    this._farmCells = [];
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (grid[x][z].farm) this._farmCells.push([x, z]);
    this.cropMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), new THREE.MeshLambertMaterial({ color: 0x8bc34a }), Math.max(1, this._farmCells.length));
    this.scene.add(this.cropMesh);
    this.buildingsGroup = new THREE.Group();
    this.scene.add(this.buildingsGroup);
  }

  _buildingMesh(type, x, z) {
    const g = new THREE.Group();
    g.position.set(x + 0.5, 0.25, z + 0.5);
    const add = (geo, mat, y, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = y; mesh.scale.set(sx, sy, sz); g.add(mesh); return mesh;
    };
    const wood = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    const stone = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
    if (type === "towncenter") {
      add(new THREE.BoxGeometry(2.3, 0.3, 2.3), stone, 0.15);
      add(new THREE.BoxGeometry(1.7, 1.1, 1.7), wood, 0.85);
      add(new THREE.BoxGeometry(0.6, 1.9, 0.6), stone, 1.25).position.set(0.7, 1.25, -0.7);
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.06), new THREE.MeshLambertMaterial({ color: 0xb71c1c }));
      banner.position.set(0, 1.0, 0.88); g.add(banner);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), new THREE.MeshLambertMaterial({ color: 0x5d4037 }));
      roof.position.y = 1.8; roof.rotation.y = Math.PI / 4; g.add(roof);
    } else if (type === "granary") {
      add(new THREE.BoxGeometry(1.9, 1.1, 1.5), wood, 0.55);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), new THREE.MeshLambertMaterial({ color: 0xd7a94e }));
      roof.position.y = 1.5; roof.rotation.y = Math.PI / 4; g.add(roof);
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.4, 8), stone);
      silo.position.set(1.1, 0.7, 0); g.add(silo);
      add(new THREE.BoxGeometry(0.5, 0.7, 0.06), new THREE.MeshLambertMaterial({ color: 0x3e2723 }), 0.35).position.z = 0.78;
    } else if (type === "marker") {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6), wood);
      post.position.y = 0.65; g.add(post);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.04), new THREE.MeshLambertMaterial({ color: 0xffd700 }));
      flag.position.set(0.32, 1.15, 0); g.add(flag);
    } else if (type === "stockpile") {
      add(new THREE.BoxGeometry(1.6, 0.25, 1.6), wood, 0.12);
      add(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: 0xa1887f }), 0.5, 1, 1, 1).position.x = -0.4;
      add(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: 0xd7a94e }), 0.5).position.x = 0.4;
    } else if (type === "altar") {
      add(new THREE.BoxGeometry(1.2, 0.3, 1.2), stone, 0.15);
      add(new THREE.BoxGeometry(0.4, 1.1, 0.4), stone, 0.8);
      add(new THREE.BoxGeometry(0.7, 0.2, 0.7), new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x664d00 }), 1.45);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0xff9800 }));
      flame.position.y = 1.75; g.add(flame);
    } else if (type === "hut") {
      add(new THREE.BoxGeometry(1.7, 1.0, 1.7), wood, 0.5);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), new THREE.MeshLambertMaterial({ color: 0x3e2723 }));
      door.position.set(0, 0.35, 0.88); g.add(door);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 4), new THREE.MeshLambertMaterial({ color: 0xa52a2a }));
      roof.position.y = 1.45; roof.rotation.y = Math.PI / 4; g.add(roof);
    } else if (type === "longhouse") {
      add(new THREE.BoxGeometry(2.6, 1.1, 1.8), wood, 0.55);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), new THREE.MeshLambertMaterial({ color: 0x3e2723 }));
      door.position.set(0, 0.35, 0.93); g.add(door);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 0.9, 4), new THREE.MeshLambertMaterial({ color: 0x6d1a1a }));
      roof.position.y = 1.55; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.75; g.add(roof);
    } else if (type === "well") {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.7, 8), stone);
      ring.position.y = 0.35; g.add(ring);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 8), new THREE.MeshLambertMaterial({ color: 0x29b6f6 }));
      water.position.y = 0.65; g.add(water);
      for (const sx of [-0.5, 0.5]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), wood);
        post.position.set(sx, 0.55, 0); g.add(post);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 4), new THREE.MeshLambertMaterial({ color: 0x5d4037 }));
      roof.position.y = 1.35; roof.rotation.y = Math.PI / 4; g.add(roof);
    } else if (type === "workshop") {
      add(new THREE.BoxGeometry(2.0, 1.1, 1.6), wood, 0.55);
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), stone);
      chimney.position.set(0.7, 1.5, -0.4); g.add(chimney);
      const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.3), new THREE.MeshLambertMaterial({ color: 0x37474f }));
      anvil.position.set(-0.6, 0.18, 0.95); g.add(anvil);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 4), new THREE.MeshLambertMaterial({ color: 0x455a64 }));
      roof.position.y = 1.5; roof.rotation.y = Math.PI / 4; g.add(roof);
    } else if (type === "shrine") {
      add(new THREE.BoxGeometry(1.3, 0.3, 1.3), stone, 0.15);
      add(new THREE.BoxGeometry(0.45, 1.3, 0.45), new THREE.MeshLambertMaterial({ color: 0xefebe9 }), 0.95);
      add(new THREE.BoxGeometry(0.7, 0.2, 0.7), new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x664d00 }), 1.7);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.35, 6), new THREE.MeshBasicMaterial({ color: 0xfff176 }));
      flame.position.y = 2.0; g.add(flame);
    } else if (type === "greathall") {
      add(new THREE.BoxGeometry(3.2, 1.3, 2.0), wood, 0.65);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.06), new THREE.MeshLambertMaterial({ color: 0x3e2723 }));
      door.position.set(0, 0.4, 1.03); g.add(door);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.0, 4), new THREE.MeshLambertMaterial({ color: 0x4e342e }));
      roof.position.y = 1.8; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.65; g.add(roof);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), stone);
      tower.position.set(1.4, 0.8, -0.7); g.add(tower);
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.06), new THREE.MeshLambertMaterial({ color: 0xb71c1c }));
      banner.position.set(0, 1.2, 1.05); g.add(banner);
    } else if (type === "farmhouse") {
      add(new THREE.BoxGeometry(1.8, 1.0, 1.5), new THREE.MeshLambertMaterial({ color: 0xa1887f }), 0.5);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), new THREE.MeshLambertMaterial({ color: 0x3e2723 }));
      door.position.set(0, 0.35, 0.78); g.add(door);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
      roof.position.y = 1.4; roof.rotation.y = Math.PI / 4; g.add(roof);
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.3, 8), stone);
      silo.position.set(1.05, 0.65, -0.4); g.add(silo);
    }
    return g;
  }

  _syncBuildings(state) {
    const sig = state.buildings.map((b) => b.type + b.x + "," + b.z).join("|") + "#" + state.buildQueue.length;
    if (sig === this._buildSignature) return;
    this._buildSignature = sig;
    while (this.buildingsGroup.children.length) this.buildingsGroup.remove(this.buildingsGroup.children[0]);
    for (const b of state.buildings) this.buildingsGroup.add(this._buildingMesh(b.type, b.x, b.z));
    for (const q of state.buildQueue) {
      const frame = this._buildingMesh(q.type || "hut", q.x, q.z);
      frame.scale.setScalar(0.6); frame.traverse((o) => { if (o.material) o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; });
      this.buildingsGroup.add(frame);
    }
  }

  _villagerGroup(v) {
    const g = new THREE.Group();
    const tunic = new THREE.MeshLambertMaterial({ color: JOB_COLORS[v.job] || 0x777777 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.34), tunic);
    body.position.y = 0.62; body.name = "body"; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), new THREE.MeshLambertMaterial({ color: 0xffd9b3 }));
    head.position.y = 1.12; g.add(head);
    // Eyes on the facing side (+z, the group rotates to face its target).
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const sx of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.02), eyeMat);
      eye.position.set(sx, 1.14, 0.2); g.add(eye);
    }
    // Straw hat for farmers, cloth cap for everyone else.
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.48), new THREE.MeshLambertMaterial({ color: v.job === "farmer" ? 0xd7a94e : 0x5d4037 }));
    hat.position.y = 1.36; g.add(hat);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x4e342e });
    const legs = [], arms = [];
    for (const sx of [-0.13, 0.13]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.18), legMat);
      leg.position.set(sx, 0.17, 0); leg.geometry.translate(0, -0.17, 0); leg.position.y = 0.34;
      g.add(leg); legs.push(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.14), tunic);
      arm.position.set(sx * 2.4, 0.86, 0); arm.geometry.translate(0, -0.21, 0); arm.position.y = 0.86;
      g.add(arm); arms.push(arm);
    }
    // Soft blob shadow so villagers read against the ground.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.8; hit.userData.villagerId = v.id; g.add(hit);
    g.userData.hit = hit; g.userData.legs = legs; g.userData.arms = arms;
    return g;
  }

  update(state, grid, dt, elapsed) {
    this._syncBuildings(state);
    // Farms can spread on their own (expandVillage), so the crop mesh
    // must grow when new farm cells appear. Recheck about once a second.
    if (!this._farmCheckAt || state.elapsed - this._farmCheckAt > 1) {
      this._farmCheckAt = state.elapsed;
      const cells = [];
      const roadCells = [];
      for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) { if (grid[x][z].farm) cells.push([x, z]); if (grid[x][z].road) roadCells.push([x, z]); }
      if (cells.length !== this._farmCells.length) {
        this._farmCells = cells;
        if (this.cropMesh) { this.scene.remove(this.cropMesh); this.cropMesh.dispose?.(); }
        this.cropMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), new THREE.MeshLambertMaterial({ color: 0x8bc34a }), Math.max(1, cells.length));
        this.scene.add(this.cropMesh);
      }
      if (roadCells.length !== (this._roadCells || []).length) {
        this._roadCells = roadCells;
        if (this.roadMesh) { this.scene.remove(this.roadMesh); this.roadMesh.dispose?.(); }
        this.roadMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.12, 0.95), new THREE.MeshLambertMaterial({ color: 0xd7b98a }), Math.max(1, roadCells.length));
        const rm = new THREE.Matrix4();
        roadCells.forEach(([x, z], idx) => { rm.makeTranslation(x + 0.5, grid[x][z].h * 0.9 + 0.04, z + 0.5); this.roadMesh.setMatrixAt(idx, rm); });
        this.scene.add(this.roadMesh);
      }
    }
    // Stones + crops scale with remaining amount / growth stage.
    const m = new THREE.Matrix4();
    this._stoneCells.forEach(([x, z], idx) => {
      const cell = grid[x][z];
      const amt = cell.stone + cell.ore;
      const s = amt > 0 ? 0.55 + Math.min(0.45, amt * 0.05) : 0.001;
      m.makeScale(s, s, s); m.setPosition(x + 0.5, 0.35, z + 0.5);
      this.stoneMesh.setMatrixAt(idx, m);
    });
    this.stoneMesh.instanceMatrix.needsUpdate = true;
    this._farmCells.forEach(([x, z], idx) => {
      const cell = grid[x][z];
      const s = cell.crop < 0 ? 0.001 : 0.25 + cell.crop * 0.25;
      m.makeScale(s, s, s); m.setPosition(x + 0.5, 0.35, z + 0.5);
      this.cropMesh.setMatrixAt(idx, m);
    });
    this.cropMesh.instanceMatrix.needsUpdate = true;

    // Villagers.
    const seen = new Set();
    for (const v of state.villagers) {
      seen.add(v.id);
      let g = this.villagerMeshes.get(v.id);
      if (!g) { g = this._villagerGroup(v); this.scene.add(g); this.villagerMeshes.set(v.id, g); }
      g.position.x += (v.x + 0.5 - g.position.x) * Math.min(1, dt * 10);
      g.position.z += (v.z + 0.5 - g.position.z) * Math.min(1, dt * 10);
      if (g.position.x === 0 && g.position.z === 0) { g.position.set(v.x + 0.5, 0, v.z + 0.5); }
      const body = g.children[0];
      body.material.color.setHex(JOB_COLORS[v.job] || 0x777777);
      g.children[1].material.color.setHex(v.sick ? 0xa8d8a8 : 0xffd9b3);
      const bob = v._moving ? Math.abs(Math.sin(elapsed * 8 + v.id)) * 0.06 : 0;
      g.position.y = bob;
      const swing = v._moving ? Math.sin(elapsed * 9 + v.id) * 0.55 : 0;
      if (g.userData.legs) {
        g.userData.legs[0].rotation.x = swing;
        g.userData.legs[1].rotation.x = -swing;
        g.userData.arms[0].rotation.x = -swing * 0.7;
        g.userData.arms[1].rotation.x = swing * 0.7;
      }
      if (v.target) {
        const dx = v.target[0] + 0.5 - v.x, dz = v.target[1] + 0.5 - v.z;
        if (Math.hypot(dx, dz) > 0.1) g.rotation.y = Math.atan2(dx, dz);
      }
    }
    for (const [id, g] of this.villagerMeshes) if (!seen.has(id)) { this.scene.remove(g); this.villagerMeshes.delete(id); }

    // Deer.
    const seenDeer = new Set();
    for (const d of state.deer) {
      seenDeer.add(d.id);
      let g = this.deerMeshes.get(d.id);
      if (!g) {
        g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.3), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
        body.position.y = 0.45; g.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
        head.position.set(0, 0.75, 0.3); g.add(head);
        this.scene.add(g); this.deerMeshes.set(d.id, g);
      }
      g.position.x += (d.x + 0.5 - g.position.x) * Math.min(1, dt * 8);
      g.position.z += (d.z + 0.5 - g.position.z) * Math.min(1, dt * 8);
    }
    for (const [id, g] of this.deerMeshes) if (!seenDeer.has(id)) { this.scene.remove(g); this.deerMeshes.delete(id); }

    // Fire effect.
    const fire = state._fire;
    this.fireGroup.clear();
    if (fire && state.elapsed < fire.until) {
      for (let i = 0; i < 5; i++) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1 + Math.random() * 0.6, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff5722 : 0xffc107 }));
        flame.position.set(fire.x + 0.5 + (Math.random() - 0.5), 0.7, fire.z + 0.5 + (Math.random() - 0.5));
        this.fireGroup.add(flame);
      }
    }
    const flooding = state.elapsed < state.effects.floodUntil;
    this.floodPlane.material.opacity = flooding ? 0.35 : 0;
    if (this.waterMesh) this.waterMesh.material.opacity = 0.66 + Math.sin(elapsed * 1.4) * 0.08;
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * 0.45;
      if (cloud.position.x > SIZE + 4) cloud.position.x = -4;
    }

    // Day / night.
    const t = state.time; // 0..1, 0.3 = morning start
    const dayFactor = Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    const sunI = 0.25 + dayFactor * 1.2;
    this.sun.intensity = sunI;
    this.hemi.intensity = 0.3 + dayFactor * 0.65;
    const sky = new THREE.Color().setHSL(0.58, 0.6, 0.25 + dayFactor * 0.45);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    this.shake = Math.max(0, this.shake - dt * 2);
    if (state._quake && state.elapsed < state._quake.until) this.shake = 0.5;

    // Camera. Zoom eases toward its target so pinch/wheel steps feel smooth
    // instead of jumping in discrete steps.
    this.distance += (this.zoomTarget - this.distance) * Math.min(1, dt * 12);
    const cx = this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cz = this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cy = Math.sin(this.pitch) * this.distance;
    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shakeZ = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.camera.position.set(cx + shakeX, cy, cz + shakeZ);
    this.camera.lookAt(this.target.x, 0, this.target.z);
    this.renderer.render(this.scene, this.camera);
  }

  setSelected(v) {
    if (!v) { this.selectedRing.visible = false; return; }
    this.selectedRing.visible = true;
    this.selectedRing.position.set(v.x + 0.5, 0.08, v.z + 0.5);
  }

  rotate(dir) { this.yaw += dir * Math.PI / 6; }
  zoom(f) { this.zoomTarget = Math.max(12, Math.min(60, this.zoomTarget * f)); }
  zoomIn() { this.zoom(0.78); }
  zoomOut() { this.zoom(1.28); }
  centerOn(x, z) { this.target.set(x, 0, z); }

  // Drag the world under the finger: the ground point under the finger
  // stays under the finger. The v1 code had the yaw sign flipped here, so
  // dragging along a diagonal cancelled out in one axis and the view only
  // moved right/down. See computePanDelta and tests/pan_smoke.mjs.
  _panBy(dx, dy) {
    const h = this.canvas.clientHeight || window.innerHeight;
    const scale = (2 * this.distance * Math.tan((this.camera.fov * Math.PI / 180) / 2)) / Math.max(1, h);
    const [dtx, dtz] = computePanDelta(this.yaw, scale, dx, dy);
    this.target.x += dtx;
    this.target.z += dtz;
    this.target.x = Math.max(-8, Math.min(SIZE + 8, this.target.x));
    this.target.z = Math.max(-8, Math.min(SIZE + 8, this.target.z));
  }

  panScreen(dx, dy) { this._panBy(dx, dy); }

  _initInput() {
    const pointers = new Map();
    let downPos = null, downTime = 0, moved = 0, everPinched = false;
    let pinch = null; // {startDist, startZoom, midX, midY}
    const el = this.canvas;
    el.style.touchAction = "none";
    // Safari: stop the page-level pinch gesture from stealing two fingers.
    el.addEventListener("touchstart", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    const midOf = () => { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { downPos = { x: e.clientX, y: e.clientY }; downTime = performance.now(); moved = 0; everPinched = false; }
      if (pointers.size === 2) {
        everPinched = true;
        const [a, b] = [...pointers.values()];
        const mid = midOf();
        pinch = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: this.zoomTarget, midX: mid.x, midY: mid.y };
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 1) {
        this._panBy(dx, dy);
      } else if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        // Absolute pinch: zoom is anchored to the distance when the second
        // finger landed, so it cannot drift or jump on each move event.
        if (pinch.startDist > 20 && d > 20) this.zoomTarget = Math.max(12, Math.min(60, pinch.startZoom * (pinch.startDist / d)));
        // Two-finger drag pans from the midpoint.
        const mid = midOf();
        this._panBy(mid.x - pinch.midX, mid.y - pinch.midY);
        pinch.midX = mid.x; pinch.midY = mid.y;
      }
    });
    const up = (e) => {
      const wasTap = pointers.size === 1 && !everPinched && moved < 10 && performance.now() - downTime < 400 && downPos;
      pointers.delete(e.pointerId);
      if (pointers.size === 1) {
        // One finger left after a pinch: re-anchor it so the view does not jump.
        const [only] = [...pointers.values()];
        pointers.set([...pointers.keys()][0], { x: only.x, y: only.y });
        downPos = { x: only.x, y: only.y }; downTime = performance.now(); moved = 0;
      }
      if (pointers.size < 2) pinch = null;
      if (wasTap && downPos) this._pick(e.clientX, e.clientY);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", () => { pointers.clear(); pinch = null; });
    el.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom(1 + Math.sign(e.deltaY) * 0.1); }, { passive: false });
  }

  _pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = [];
    for (const g of this.villagerMeshes.values()) hits.push(g.userData.hit);
    const vHits = ray.intersectObjects(hits, false);
    if (vHits.length) {
      const id = vHits[0].object.userData.villagerId;
      this.onTap({ type: "villager", id });
      return;
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, pt)) {
      this.onTap({ type: "ground", x: Math.floor(pt.x), z: Math.floor(pt.z) });
    }
  }
}
