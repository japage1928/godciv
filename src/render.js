// Three.js rendering for GodCiv PWA. Rendering only: it never changes
// sim state. The sim owns truth; this file draws it.
import * as THREE from "../vendor/three.module.js";
import { SIZE } from "./sim.js";

const JOB_COLORS = { farmer: 0x4caf50, miner: 0x9e9e9e, fisher: 0x2196f3, hunter: 0xd84315, builder: 0xff9800, hauler: 0x8d6e63 };
const CELL = 1;

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
    const groundMat = new THREE.MeshLambertMaterial({ vertexColors: false });
    const ground = new THREE.InstancedMesh(groundGeo, new THREE.MeshLambertMaterial(), SIZE * SIZE);
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
    void groundMat;

    // Trees: trunk + canopy, instanced.
    const treeCells = [];
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) if (grid[x][z].tree) treeCells.push([x, z]);
    if (treeCells.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6), new THREE.MeshLambertMaterial({ color: 0x6b4423 }), treeCells.length);
      const canopy = new THREE.InstancedMesh(new THREE.ConeGeometry(0.65, 1.4, 7), new THREE.MeshLambertMaterial({ color: 0x2e6b2e }), treeCells.length);
      treeCells.forEach(([x, z], idx) => {
        m.makeTranslation(x + 0.5, 0.6, z + 0.5); trunk.setMatrixAt(idx, m);
        m.makeTranslation(x + 0.5, 1.6, z + 0.5); canopy.setMatrixAt(idx, m);
      });
      this.scene.add(trunk, canopy); group.push(trunk, canopy);
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
    if (type === "stockpile") {
      add(new THREE.BoxGeometry(1.6, 0.25, 1.6), wood, 0.12);
      add(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: 0xa1887f }), 0.5, 1, 1, 1).position.x = -0.4;
      add(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color: 0xd7a94e }), 0.5).position.x = 0.4;
    } else if (type === "altar") {
      add(new THREE.BoxGeometry(1.2, 0.3, 1.2), stone, 0.15);
      add(new THREE.BoxGeometry(0.4, 1.1, 0.4), stone, 0.8);
      add(new THREE.BoxGeometry(0.7, 0.2, 0.7), new THREE.MeshLambertMaterial({ color: 0xffd700 }), 1.45);
    } else if (type === "hut") {
      add(new THREE.BoxGeometry(1.7, 1.0, 1.7), wood, 0.5);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 4), new THREE.MeshLambertMaterial({ color: 0xa52a2a }));
      roof.position.y = 1.45; roof.rotation.y = Math.PI / 4; g.add(roof);
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
      const frame = this._buildingMesh("hut", q.x, q.z);
      frame.scale.setScalar(0.6); frame.traverse((o) => { if (o.material) o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; });
      this.buildingsGroup.add(frame);
    }
  }

  _villagerGroup(v) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.34), new THREE.MeshLambertMaterial({ color: JOB_COLORS[v.job] || 0x777777 }));
    body.position.y = 0.55; body.name = "body"; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), new THREE.MeshLambertMaterial({ color: 0xffd9b3 }));
    head.position.y = 1.05; g.add(head);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.8; hit.userData.villagerId = v.id; g.add(hit);
    g.userData.hit = hit;
    return g;
  }

  update(state, grid, dt, elapsed) {
    this._syncBuildings(state);
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

    // Camera.
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
  zoom(f) { this.distance = Math.max(12, Math.min(60, this.distance * f)); }
  centerOn(x, z) { this.target.set(x, 0, z); }

  _initInput() {
    const pointers = new Map();
    let downPos = null, downTime = 0, moved = 0, pinchDist = 0;
    const el = this.canvas;
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { downPos = { x: e.clientX, y: e.clientY }; downTime = performance.now(); moved = 0; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    el.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 1) {
        const scale = this.distance / 600;
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        this.target.x -= (dx * cos - dy * sin) * scale;
        this.target.z -= (dx * sin + dy * cos) * scale;
        this.target.x = Math.max(0, Math.min(SIZE, this.target.x));
        this.target.z = Math.max(0, Math.min(SIZE, this.target.z));
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.zoom(pinchDist / d);
        pinchDist = d;
      }
    });
    const up = (e) => {
      const wasTap = pointers.size === 1 && moved < 8 && performance.now() - downTime < 350 && downPos;
      pointers.delete(e.pointerId);
      if (wasTap && downPos) this._pick(e.clientX, e.clientY);
      if (pointers.size < 2) pinchDist = 0;
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom(1 + Math.sign(e.deltaY) * 0.08); }, { passive: false });
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
