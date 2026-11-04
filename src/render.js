// Three.js rendering for GodCiv PWA. Rendering only: it never changes
// sim state. The sim owns truth; this file draws it.
//
// The look follows John's mockups: timber-frame houses with red
// pitched roofs, stone chimneys with smoke, warm windows at night,
// cobblestone plaza and paths, crop rows, torches, and a village that
// visibly grows from timber hamlet to modern city as tech eras pass.
// Buildings are merged vertex-colored geometry: one draw call per
// building body, shared materials, no per-frame allocation.
import * as THREE from "../vendor/three.module.js";
import { SIZE, CHUNK, chunkKey, peekChunk, phaseOf, eraStageOf, WALL_RING_R, streetFrontage, cellAt, peekCell, towerManned, terrainHeight } from "./sim.js";

const JOB_COLORS = { farmer: 0x4caf50, woodcutter: 0x6d4c41, miner: 0x9e9e9e, fisher: 0x2196f3, hunter: 0xd84315, builder: 0xff9800, hauler: 0x8d6e63, teacher: 0x7e57c2, guard: 0x546e7a, student: 0x78909c, child: 0xb0bec5 };
const CELL = 1;
// Grass tint targets per season: the ground shifts with the year.
const SEASON_GRASS = {
  spring: new THREE.Color(0x5e8c46),
  summer: new THREE.Color(0x6f9a44),
  autumn: new THREE.Color(0x9a7434),
  winter: new THREE.Color(0x93a184),
};
const SEASON_CANOPY = {
  spring: new THREE.Color(0x27682b),
  summer: new THREE.Color(0x226127),
  autumn: new THREE.Color(0xc7782a),
  winter: new THREE.Color(0x5d6e52),
};
const SEASON_CANOPY_TOP = {
  spring: new THREE.Color(0x35913a),
  summer: new THREE.Color(0x2f7d31),
  autumn: new THREE.Color(0xd98a35),
  winter: new THREE.Color(0x6f7f62),
};
// Era palettes: the whole village changes dress as tech eras pass.
// Timber and red tile, then stone, then brick, then concrete and glass.
const ERA_PALETTE = [
  { wall: 0xe8d9bd, timber: 0x5a3d2b, roof: 0xa83226, trim: 0x6d4c41, road: 0xc9b18a, wallMat: 0x8d6e63 },
  { wall: 0xd7ccc8, timber: 0x4e342e, roof: 0x9c3524, trim: 0x5d4037, road: 0xb5a894, wallMat: 0x8a8a8a },
  { wall: 0xb5654a, timber: 0x3e2723, roof: 0x4a3b32, trim: 0x2d1f1a, road: 0x9d9d9d, wallMat: 0x9a6a52 },
  { wall: 0xcfd8dc, timber: 0x37474f, roof: 0x607d8b, trim: 0x263238, road: 0x8a8a8a, wallMat: 0x90a4ae },
];
const CROP_COLORS = [0x7cb342, 0x8bc34a, 0x9ccc65, 0xe6c619];

// Pure pan math, exported so tests can prove all four drag directions
// move the view and that opposite drags cancel. Screen-right on the ground
// is (cos yaw, -sin yaw) and screen-down is (sin yaw, cos yaw).
export function computePanDelta(yaw, scale, dx, dy) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  return [-(dx * cos + dy * sin) * scale, -(-dx * sin + dy * cos) * scale];
}

// Procedural canvas textures, built once and cached: no network
// assets, ever. They multiply with the vertex colors, so each texture
// is drawn near-white / light: the part color shows through the detail.
// Grass: soft patch blobs plus speckle, so the ground reads as meadow
// instead of one flat green per cell.
function makeGrassTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#7fae62"; ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const gx = rnd() * size, gy = rnd() * size, gr = 12 + rnd() * 26;
    const grad = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr);
    const shade = rnd() < 0.5 ? "96,150,74" : "140,178,104";
    grad.addColorStop(0, "rgba(" + shade + ",0.55)");
    grad.addColorStop(1, "rgba(" + shade + ",0)");
    ctx.fillStyle = grad;
    ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
  }
  const speckles = ["#6b8f4e", "#8fb069", "#5d9e4a", "#a8b878", "#75994f"];
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = speckles[Math.floor(rnd() * speckles.length)];
    const s = 1 + rnd() * 4;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Roof tiles: staggered rows with dark grout lines. Drawn light so
// the red roof color multiplies through and the rows read as courses.
function makeTileTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#e6e2da"; ctx.fillRect(0, 0, size, size);
  let seed = 23;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rows = 4, cols = 4, th = size / rows, tw = size / cols;
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * tw / 2;
    for (let x = -1; x < cols; x++) {
      const g = 214 + Math.floor(rnd() * 30);
      ctx.fillStyle = "rgb(" + g + "," + (g - 4) + "," + (g - 10) + ")";
      ctx.fillRect(x * tw + off + 1, y * th + 1, tw - 2, th - 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x * tw + off + 1, y * th + 1, tw - 2, 3);
    }
  }
  ctx.fillStyle = "rgba(90,80,70,0.8)";
  for (let y = 0; y <= rows; y++) ctx.fillRect(0, y * th - 1, size, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(2, 2);
  return tex;
}

// Plaster: warm off-white with faint streaks and speckle. Multiplies
// with the wall color, so timber houses get plaster variation while
// the timber frame (untextured parts) stays flat.
function makePlasterTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f2ecdd"; ctx.fillRect(0, 0, size, size);
  let seed = 31;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = "rgba(190,175,150," + (0.08 + rnd() * 0.1) + ")";
    ctx.fillRect(rnd() * size, 0, 2 + rnd() * 5, size);
  }
  const speckles = ["#e2d8c4", "#faf6ea", "#d8ccb2"];
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = speckles[Math.floor(rnd() * speckles.length)];
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCobbleTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#453d33"; ctx.fillRect(0, 0, size, size);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const g = 140 + Math.floor(rnd() * 55);
    ctx.fillStyle = "rgb(" + g + "," + (g - 6) + "," + (g - 18) + ")";
    const off = (y % 2) * 16;
    ctx.fillRect(x * 32 + off - 16 + 2, y * 32 + 2, 28, 28);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x * 32 + off - 16 + 2, y * 32 + 2, 28, 3);
  }
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "#8a8073" : "#5d5348";
    ctx.fillRect(rnd() * size, rnd() * size, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSmokeTexture() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- merged geometry: many small parts, one mesh, one material ---
// Each part carries its own color; the merged mesh uses a single
// vertex-colored material. Parts are built fresh (never cached) so
// the merge can take ownership of their geometry.
function partBox(list, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0, tex = null) {
  list.push({ geo: new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz, color, tex });
  return list;
}
function partCyl(list, rTop, rBot, h, seg, x, y, z, color, rx = 0, ry = 0, rz = 0, tex = null) {
  list.push({ geo: new THREE.CylinderGeometry(rTop, rBot, h, seg), x, y, z, rx, ry, rz, color, tex });
  return list;
}
function prismGeometry(w, h, d) {
  // Triangular prism, ridge along z, apex centered in x. Flat shaded.
  // UVs are per-face so the roof-tile texture runs in courses: on the
  // two slopes u runs along the ridge and v runs eave-to-ridge; on the
  // gable ends u runs across and v runs up.
  const hw = w / 2, hd = d / 2;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd], E = [0, h, -hd], F = [0, h, hd];
  const tris = [[A, D, F], [A, F, E], [B, E, F], [B, F, C], [A, E, B], [D, C, F]];
  const pos = new Float32Array(tris.flatMap((t) => t.flat()));
  const uv = new Float32Array(tris.length * 3 * 2);
  tris.forEach((t, ti) => {
    t.forEach((p, vi) => {
      let u, v;
      if (ti < 4) {
        // Slope: u along the ridge, v eave (0) to ridge (1).
        u = (p[2] + hd) / d;
        v = ti < 2 ? (p[0] + hw) / w : (hw - p[0]) / w;
      } else {
        u = (p[0] + hw) / w;
        v = p[1] / h;
      }
      uv[(ti * 3 + vi) * 2] = u;
      uv[(ti * 3 + vi) * 2 + 1] = v;
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function partPrism(list, w, h, d, x, y, z, color, ry = 0, tex = null) {
  list.push({ geo: prismGeometry(w, h, d), x, y, z, rx: 0, ry, rz: 0, color, tex });
  return list;
}
const _mergeMatrix = new THREE.Matrix4();
const _mergeQuat = new THREE.Quaternion();
const _mergeEuler = new THREE.Euler();
const _mergePos = new THREE.Vector3();
const _mergeScale = new THREE.Vector3(1, 1, 1);
const _mergeColor = new THREE.Color();
function mergeParts(list) {
  const geos = [];
  let total = 0;
  for (const p of list) {
    _mergeEuler.set(p.rx || 0, p.ry || 0, p.rz || 0);
    _mergeQuat.setFromEuler(_mergeEuler);
    _mergePos.set(p.x, p.y, p.z);
    _mergeMatrix.compose(_mergePos, _mergeQuat, _mergeScale);
    p.geo.applyMatrix4(_mergeMatrix);
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    _mergeColor.setHex(p.color);
    for (let i = 0; i < n; i++) { colors[i * 3] = _mergeColor.r; colors[i * 3 + 1] = _mergeColor.g; colors[i * 3 + 2] = _mergeColor.b; }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geos.push(g);
    total += n;
    if (g !== p.geo) p.geo.dispose();
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    const uvAttr = g.attributes.uv;
    if (uvAttr) uvs.set(uvAttr.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return out;
}

// Parts carrying the same tex key merge into one mesh each, so a
// building is at most three body meshes (plain, roof tile, plaster).
function mergePartsByTex(list) {
  const groups = new Map();
  for (const p of list) {
    const key = p.tex || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.entries()].map(([tex, parts]) => ({ tex, geo: mergeParts(parts) }));
}

const MAT_BODY = new THREE.MeshLambertMaterial({ vertexColors: true });
const MAT_WINDOW = new THREE.MeshBasicMaterial({ color: 0xffd54f });
const MAT_SNOW = new THREE.MeshLambertMaterial({ color: 0xf2f6f2 });
const MAT_FLAME = new THREE.MeshBasicMaterial({ color: 0xff9800 });
const MAT_LAMP = new THREE.MeshBasicMaterial({ color: 0xfff9c4 });
// Textured materials are built lazily in the constructor: canvas
// textures need `document`, which headless Node tests do not have.
// Until then they stay null and textured parts fall back to MAT_BODY,
// so the smoke test proves the same geometry builds either way.
let MAT_ROOF = null;
let MAT_WALL = null;
function ensureTexMaterials() {
  if (MAT_ROOF || typeof document === "undefined") return;
  MAT_ROOF = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeTileTexture() });
  MAT_WALL = new THREE.MeshLambertMaterial({ vertexColors: true, map: makePlasterTexture() });
}
// Fake contact shadows: one shared unit plane and material, scaled
// per building. No shadow maps (too costly on phones); this dark quad
// is the grounding cue.
const SHADOW_GEO = new THREE.PlaneGeometry(1, 1);
const MAT_SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
const STEP_GEO = new THREE.BoxGeometry(0.62, 0.07, 0.62);
const MAT_STEP = new THREE.MeshLambertMaterial({ color: 0x8a7a5e });

// One timber house, parameterized: walls, timber frame, pitched or
// flat roof, chimney, door, windows, shutters and flower boxes at
// higher eras. Returns { body, win, snow, chimneyTop } part lists.
function timberHouse(o) {
  const body = [], win = [], snow = [];
  const hw = o.w / 2, hd = o.d / 2;
  // Defensive defaults: direct callers used to omit pal/era/flat, and
  // timberHouse read pal.wall unguarded, which threw on the town
  // center and blanked the whole village (v12 launch bug). Every
  // caller now passes them AND the defaults hold if one forgets.
  const era = o.era || 0;
  const pal = o.pal || ERA_PALETTE[era] || ERA_PALETTE[0];
  const flat = o.flat ?? era >= 3;
  partBox(body, o.w + 0.3, 0.18, o.d + 0.3, 0, 0.09, 0, 0x8d8d8d);
  if (era >= 1) partBox(body, o.w + 0.1, 0.3, o.d + 0.1, 0, 0.15, 0, 0x7a7a7a);
  partBox(body, o.w, o.wallH, o.d, 0, o.wallH / 2 + 0.18, 0, pal.wall, 0, 0, 0, "wall");
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    partBox(body, 0.12, o.wallH, 0.12, sx * (hw - 0.06), o.wallH / 2 + 0.18, sz * (hd - 0.06), pal.timber);
  }
  for (const sz of [-1, 1]) {
    partBox(body, o.w, 0.12, 0.1, 0, 0.18 + o.wallH - 0.06, sz * (hd + 0.01), pal.timber);
    partBox(body, o.w, 0.12, 0.1, 0, 0.24, sz * (hd + 0.01), pal.timber);
  }
  partBox(body, 0.5, 0.75, 0.08, 0, 0.55, hd + 0.02, o.doorColor || 0xb71c1c);
  const wallTop = 0.18 + o.wallH;
  let chimneyTop = null;
  if (flat) {
    partBox(body, o.w + 0.2, 0.15, o.d + 0.2, 0, wallTop + 0.07, 0, pal.roof, 0, 0, 0, "roof");
    for (const sz of [-1, 1]) partBox(body, o.w + 0.2, 0.22, 0.08, 0, wallTop + 0.2, sz * (hd + 0.06), pal.trim);
    for (const sx of [-1, 1]) partBox(body, 0.08, 0.22, o.d + 0.2, sx * (hw + 0.06), wallTop + 0.2, 0, pal.trim);
    partBox(win, o.w * 0.7, 0.3, 0.06, 0, wallTop - 0.2, hd + 0.03, 0xffffff);
    // Snow dusting: a thin inset cap, never edge to edge, so the
    // roof color reads through in winter.
    partBox(snow, o.w * 0.62, 0.04, o.d * 0.62, 0, wallTop + 0.17, 0, 0xffffff);
    partBox(snow, o.w * 0.3, 0.03, o.d * 0.3, o.w * 0.18, wallTop + 0.17, -o.d * 0.15, 0xffffff);
  } else {
    partPrism(body, o.w + 0.3, o.roofH, o.d + 0.3, 0, wallTop, 0, pal.roof, 0, "roof");
    partBox(body, 0.12, 0.1, o.d + 0.34, 0, wallTop + o.roofH + 0.02, 0, pal.timber);
    // Snow dusting, winter only: thin slabs hugging the ridge plus
    // one patch lower down each slope. The lower slope stays bare so
    // the red tile shows through instead of a full white blanket.
    const hw2 = (o.w + 0.3) / 2;
    const slopeLen = Math.hypot(hw2, o.roofH) + 0.1;
    const a = Math.atan2(o.roofH, hw2);
    const len = Math.hypot(hw2, o.roofH);
    const nx = o.roofH / len, ny = hw2 / len;
    const ridgeLen = slopeLen * 0.55;
    const rcx = hw2 * 0.275, rcy = wallTop + o.roofH * 0.725;
    partBox(snow, ridgeLen, 0.035, o.d + 0.28, rcx + nx * 0.04, rcy + ny * 0.04, 0, 0xffffff, 0, 0, Math.PI - a);
    partBox(snow, ridgeLen, 0.035, o.d + 0.28, -rcx - nx * 0.04, rcy + ny * 0.04, 0, 0xffffff, 0, 0, a);
    const pcx = hw2 * 0.55, pcy = wallTop + o.roofH * 0.45;
    partBox(snow, slopeLen * 0.22, 0.03, o.d * 0.3, pcx + nx * 0.04, pcy + ny * 0.04, o.d * 0.18, 0xffffff, 0, 0, Math.PI - a);
    partBox(snow, slopeLen * 0.22, 0.03, o.d * 0.3, -pcx - nx * 0.04, pcy + ny * 0.04, -o.d * 0.18, 0xffffff, 0, 0, a);
  }
  for (const w of o.windows || []) {
    partBox(win, 0.32, 0.34, 0.06, w.x, w.y, hd + 0.03, 0xffffff);
    if (era >= 1) {
      partBox(body, 0.1, 0.4, 0.05, w.x - 0.24, w.y, hd + 0.03, pal.timber);
      partBox(body, 0.1, 0.4, 0.05, w.x + 0.24, w.y, hd + 0.03, pal.timber);
      partBox(body, 0.4, 0.12, 0.12, w.x, w.y - 0.26, hd + 0.06, 0x4caf50);
      partBox(body, 0.4, 0.1, 0.1, w.x, w.y - 0.18, hd + 0.06, 0xc62828);
    }
  }
  if (o.chimney) {
    const chx = o.w * 0.28;
    const chH = o.wallH + o.roofH * 0.9;
    partBox(body, 0.34, chH, 0.34, chx, 0.18 + chH / 2, -o.d * 0.2, 0x8a8a8a);
    partBox(body, 0.44, 0.12, 0.44, chx, 0.18 + chH + 0.06, -o.d * 0.2, 0x6e6e6e);
    chimneyTop = [chx, 0.18 + chH + 0.15, -o.d * 0.2];
  }
  return { body, win, snow, chimneyTop };
}

export class Renderer {
  constructor(canvas, onTap) {
    this.canvas = canvas;
    this.onTap = onTap;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 140);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.target = new THREE.Vector3(24, 0, 24); // the village center; SIZE/2 is map middle now
    // Elevated three-quarter framing, as in the mockups.
    this.distance = 30;
    this.zoomTarget = 30;
    this.yaw = Math.PI / 4;
    this.pitch = 1.0;
    this.shake = 0;
    this._skyColor = new THREE.Color();
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x3d6b35, 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff2cc, 1.55);
    this.sun.position.set(30, 40, 10);
    this.scene.add(this.sun);
    this.hemi = hemi;
    this.nightLight = new THREE.PointLight(0xffa040, 0, 26, 1.2);
    this.nightLight.position.set(24, 4, 24);
    this.scene.add(this.nightLight);
    this._nightMeshes = [];
    this._wasNight = null;
    this._season = null;
    this._wetKind = null;
    this._roadEra = -1;

    // Weather particles: one pre-allocated Points cloud, reused for
    // rain and snow. No per-frame allocation, toggled by weather.
    const P_COUNT = 420;
    this._pGeo = new THREE.BufferGeometry();
    this._pPos = new Float32Array(P_COUNT * 3);
    this._pVel = new Float32Array(P_COUNT * 2);
    for (let i = 0; i < P_COUNT; i++) {
      this._pPos[i * 3] = -24 + Math.random() * 96;
      this._pPos[i * 3 + 1] = Math.random() * 16;
      this._pPos[i * 3 + 2] = -24 + Math.random() * 96;
      this._pVel[i * 2] = 6 + Math.random() * 4;
      this._pVel[i * 2 + 1] = (Math.random() - 0.5) * 1.2;
    }
    this._pGeo.setAttribute("position", new THREE.BufferAttribute(this._pPos, 3));
    this._pMat = new THREE.PointsMaterial({ color: 0x9fc8e8, size: 0.22, transparent: true, opacity: 0.8, depthWrite: false });
    this._particles = new THREE.Points(this._pGeo, this._pMat);
    this._particles.visible = false;
    this._particles.frustumCulled = false;
    this.scene.add(this._particles);

    // Chimney smoke: one pre-allocated Points pool, recycled over the
    // village chimneys. Positions update in place, nothing is created.
    const S_COUNT = 150;
    this._sGeo = new THREE.BufferGeometry();
    this._sPos = new Float32Array(S_COUNT * 3);
    this._sAge = new Float32Array(S_COUNT);
    this._sLife = new Float32Array(S_COUNT);
    this._sHome = new Int16Array(S_COUNT);
    this._sSeed = new Float32Array(S_COUNT);
    for (let i = 0; i < S_COUNT; i++) {
      this._sPos[i * 3 + 1] = -5;
      this._sAge[i] = Math.random() * 3;
      this._sLife[i] = 1.6 + Math.random() * 1.4;
      this._sHome[i] = -1;
      this._sSeed[i] = Math.random() * 10;
    }
    this._sGeo.setAttribute("position", new THREE.BufferAttribute(this._sPos, 3));
    this._sMat = new THREE.PointsMaterial({ color: 0xd8d8d8, size: 0.55, map: makeSmokeTexture(), transparent: true, opacity: 0.32, depthWrite: false });
    this._smoke = new THREE.Points(this._sGeo, this._sMat);
    this._smoke.frustumCulled = false;
    this.scene.add(this._smoke);
    this._chimneys = [];

    // Celebration dressing at the town center: banner poles and a
    // bonfire, built once, shown only while a festival runs.
    this.celebrationGroup = new THREE.Group();
    this.celebrationGroup.position.set(24, 0, 24);
    const bannerCols = [0xb71c1c, 0xffd700, 0x2e7d32, 0x1565c0];
    bannerCols.forEach((c, i) => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(a) * 3.2, pz = Math.sin(a) * 3.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
      pole.position.set(px, 1.3, pz); this.celebrationGroup.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), new THREE.MeshLambertMaterial({ color: c }));
      flag.position.set(px, 2.2, pz); this.celebrationGroup.add(flag);
    });
    const bonfire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0xff9800 }));
    bonfire.position.set(0, 0.8, 0); this.celebrationGroup.add(bonfire);
    this.celebrationGroup.visible = false;
    this.scene.add(this.celebrationGroup);

    this.villagerMeshes = new Map();
    this.raiderMeshes = new Map();
    this.caravanMeshes = new Map();
    this.deerMeshes = new Map();
    this._villageMarkers = null;
    this._markerSignature = "";
    this.selectedRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide })
    );
    this.selectedRing.rotation.x = -Math.PI / 2;
    this.selectedRing.visible = false;
    this.scene.add(this.selectedRing);

    // Fire: five flames pre-allocated once, reused while a fire burns.
    // The old code built new meshes every frame and leaked geometry.
    this.fireGroup = new THREE.Group();
    this._fireFlames = [];
    for (let i = 0; i < 5; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff5722 : 0xffc107 }));
      flame.visible = false;
      this.fireGroup.add(flame);
      this._fireFlames.push(flame);
    }
    this.scene.add(this.fireGroup);
    this.floodPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(96, 96),
      new THREE.MeshBasicMaterial({ color: 0x2196f3, transparent: true, opacity: 0 })
    );
    this.floodPlane.rotation.x = -Math.PI / 2;
    this.floodPlane.position.set(24, 0.55, 24);
    this.scene.add(this.floodPlane);

    this.clouds = new THREE.Group();
    this._cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 5; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(new THREE.BoxGeometry(3 + j, 0.5, 1.8), this._cloudMat);
        puff.position.set(j * 1.6 - 1.6, j * 0.15, 0);
        cloud.add(puff);
      }
      cloud.position.set((i * 11) % SIZE, 17 + (i % 3) * 1.5, (i * 7) % SIZE);
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
    // Procedural textures, built once here and shared: roof tile,
    // plaster, grass, cobble. No per-frame work, no network fetches.
    ensureTexMaterials();
    this.groundTex = makeGrassTexture();
    this.groundTex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.cobbleTex = makeCobbleTexture();
    // One ground material shared by every chunk's ground mesh: the
    // wet-weather tint sets it once instead of per chunk.
    this._groundMat = new THREE.MeshLambertMaterial({ map: this.groundTex || null });

    this._buildStatic = null;
    this._buildSignature = "";
    // Chunked streaming (section 4): one static group per generated
    // chunk, rebuilt only when dirty, disposed past band 6.
    this._chunkGroups = new Map();
    this._rebuildQueue = [];
    this._streamStats = { built: 0, disposed: 0, rebuilt: 0 };
    this._pinnedChunks = new Set();
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

  _cellColor(cell, season, x = 0, z = 0) {
    if (cell.water) return new THREE.Color(0x2f7fd6);
    if (cell.farm) return new THREE.Color(season === "winter" ? 0x5d4033 : 0x6b4a2b);
    const t = cell.h;
    if (t > 0.66) return new THREE.Color(0x8d8d8d);
    const base = SEASON_GRASS[season || "spring"].clone();
    // Small deterministic per-cell jitter instead of a hard height
    // step, so the ground reads as one meadow, not a checkerboard.
    const hash = ((x * 31 + z * 17) % 100) / 100;
    if (t > 0.58) base.multiplyScalar(1.02 + hash * 0.08);
    else base.multiplyScalar(0.94 + hash * 0.08);
    return base;
  }

  // Distance bands, measured in chunks from the camera target
  // (Chebyshev chunk distance). Full 0-1, Standard 2-3, Silhouette
  // 4-6, Unloaded 7+. The band table in section 4 is the spec: at
  // 4-6 chunks only ground, water, and building massing draw (the
  // section-4 prose line about trees past 5 chunks reads against
  // it, and the table wins: fewer draws, explicit silhouette).
  // The home chunks pin at full detail while fighting is on, so a
  // battle never loses its actors to a band change; neighbor pins
  // (Phase F) hold activated villages at standard or better.
  _chunkBand(cx, cz, state) {
    const tcx = Math.floor(this.target.x / CHUNK), tcz = Math.floor(this.target.z / CHUNK);
    const d = Math.max(Math.abs(cx - tcx), Math.abs(cz - tcz));
    let band = d <= 1 ? "full" : d <= 3 ? "standard" : d <= 6 ? "silhouette" : "unloaded";
    if (band !== "full" && state && (state.raidActive || (state.warParties && state.warParties.length) || (state.caravans && state.caravans.length))) {
      // The 9 home chunks: center chunk (1,1) plus its ring.
      if (Math.max(Math.abs(cx - 1), Math.abs(cz - 1)) <= 1) band = "full";
    }
    if ((band === "silhouette" || band === "unloaded") && this._pinnedChunks && this._pinnedChunks.has(cx + "," + cz)) band = "standard";
    return band;
  }

  _actorVisible(x, z, state) {
    const band = this._chunkBand(Math.floor(x / CHUNK), Math.floor(z / CHUNK), state);
    return band === "full" || band === "standard";
  }

  _applyBandVisibility(rec) {
    const p = rec.parts;
    if (!p) return;
    const dressing = rec.band === "full";
    const leafy = rec.band === "full" || rec.band === "standard";
    if (p.ground) p.ground.visible = true;
    if (p.water) p.water.visible = true;
    if (p.roads) p.roads.visible = true;
    for (const k of ["trunk", "canopy", "canopyTop", "stones", "crops"]) if (p[k]) p[k].visible = leafy;
    for (const k of ["tufts", "bushes"]) if (p[k]) p[k].visible = dressing;
    if (p.flowers) p.flowers.visible = dressing && this._season !== "winter";
  }

  // Streaming sync, once per frame: discover generated chunks,
  // apply distance bands (dispose past 7), queue dirty chunks,
  // and rebuild at most one queued chunk. Reloads rebuild from
  // the chunk's own cells, never the seed alone, so a chopped
  // tree stays chopped.
  syncChunks(state, grid) {
    if (!this._chunkGroups) { this._chunkGroups = new Map(); this._rebuildQueue = []; }
    if (!this._streamStats) this._streamStats = { built: 0, disposed: 0, rebuilt: 0 };
    for (const ch of grid.chunks.values()) {
      const k = chunkKey(ch.cx, ch.cz);
      if (!this._chunkGroups.has(k) && !this._rebuildQueue.includes(k)) this._rebuildQueue.push(k);
    }
    for (const rec of [...this._chunkGroups.values()]) {
      const band = this._chunkBand(rec.cx, rec.cz, state);
      if (band === "unloaded") { this._disposeChunkGroup(rec); continue; }
      if (band !== rec.band) { rec.band = band; this._applyBandVisibility(rec); }
      const ch = peekChunk(grid, rec.cx, rec.cz);
      if (ch && ch.dirty && !this._rebuildQueue.includes(rec.key)) this._rebuildQueue.push(rec.key);
    }
    let skips = 0;
    while (this._rebuildQueue.length && skips < 8) {
      const k = this._rebuildQueue.shift();
      const [cx, cz] = k.split(",").map(Number);
      if (this._chunkBand(cx, cz, state) === "unloaded" || !peekChunk(grid, cx, cz)) { skips++; continue; }
      const old = this._chunkGroups.get(k);
      if (old) this._disposeChunkGroup(old);
      const rec = this._buildChunkGroup(grid, cx, cz);
      if (!rec) continue;
      rec.band = this._chunkBand(cx, cz, state);
      this._applyBandVisibility(rec);
      this._chunkGroups.set(k, rec);
      this.scene.add(rec.group);
      if (old) this._streamStats.rebuilt++;
      else this._streamStats.built++;
      if (this._season) this._tintChunk(rec, this._season, grid);
      break;
    }
  }

  // Recolors one chunk's ground and canopies for the season, plus
  // its tufts and bushes. Runs per chunk, only for chunks whose
  // recorded season differs, never map-wide.
  _tintChunk(rec, season, grid) {
    const p = rec.parts;
    if (!p) return;
    if (p.ground) {
      rec.groundCells.forEach(([x, z], i) => {
        const cell = cellAt(grid, x, z);
        if (!cell) return;
        this._c.copy(this._cellColor(cell, season, x, z));
        if (cell.tree) this._c.multiplyScalar(0.85);
        p.ground.setColorAt(i, this._c);
      });
      if (p.ground.instanceColor) p.ground.instanceColor.needsUpdate = true;
    }
    if (p.canopy) {
      for (let k = 0; k < rec.treeCells.length; k++) {
        const j = rec.treeJitter ? rec.treeJitter[k] : 1;
        p.canopy.setColorAt(k, this._c.copy(SEASON_CANOPY[season]).multiplyScalar(j));
        p.canopyTop.setColorAt(k, this._c.copy(SEASON_CANOPY_TOP[season]).multiplyScalar(j));
      }
      if (p.canopy.instanceColor) p.canopy.instanceColor.needsUpdate = true;
      if (p.canopyTop.instanceColor) p.canopyTop.instanceColor.needsUpdate = true;
    }
    if (p.tufts) {
      for (let k = 0; k < rec.tuftJitter.length; k++) {
        p.tufts.setColorAt(k, this._c.copy(SEASON_GRASS[season]).multiplyScalar(0.78 + rec.tuftJitter[k] * 0.3));
      }
      if (p.tufts.instanceColor) p.tufts.instanceColor.needsUpdate = true;
    }
    if (p.flowers) p.flowers.visible = season !== "winter" && rec.band === "full";
    if (p.bushes) {
      for (let k = 0; k < rec.bushJitter.length; k++) {
        p.bushes.setColorAt(k, this._c.copy(SEASON_CANOPY[season]).multiplyScalar(0.85 + rec.bushJitter[k] * 0.25));
      }
      if (p.bushes.instanceColor) p.bushes.instanceColor.needsUpdate = true;
    }
    rec.season = season;
  }

  // Season recolor, chunk by chunk: only chunks whose recorded
  // season differs are touched. Roof snow toggles on the global
  // building group when the season itself changes.
  _applySeasonTint(state, grid) {
    const season = state.season || "spring";
    if (this._chunkGroups) {
      for (const rec of this._chunkGroups.values()) {
        if (!rec.group || rec.season === season) continue;
        this._tintChunk(rec, season, grid);
      }
    }
    if (season !== this._season) {
      this._season = season;
      const snowy = season === "winter";
      if (this.buildingsGroup) {
        this.buildingsGroup.traverse((o) => { if (o.userData.isSnow) o.visible = snowy; });
      }
    }
  }

  // One chunk's static meshes: ground, water, trees, dressing,
  // stones, crops, roads. Formulas are the old map-wide ones, scoped
  // to the chunk's 256 cells, so the home village draws exactly as
  // before. A fresh group starts untinted (season null): the tint
  // pass colors it on the next update. Building the group clears
  // the chunk's sim dirty flag: the sim marks it on every mutation,
  // and the renderer rebuilds only flagged chunks.
  _buildChunkGroup(grid, cx, cz) {
    const ch = peekChunk(grid, cx, cz);
    if (!ch) return null;
    const group = new THREE.Group();
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const groundCells = [], waterCells = [], treeCells = [], freeCells = [];
    const stoneCells = [], farmCells = [], roadCells = [];
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
      const x = cx * CHUNK + lx, z = cz * CHUNK + lz;
      const cell = ch.cells[lx][lz];
      groundCells.push([x, z]);
      if (cell.water) waterCells.push([x, z]);
      if (cell.tree) treeCells.push([x, z]);
      if (cell.stone > 0 || cell.ore > 0) stoneCells.push([x, z]);
      if (cell.farm) farmCells.push([x, z]);
      if (cell.road) roadCells.push([x, z]);
      if (!cell.water && !cell.farm && !cell.tree && !cell.road && !cell.building && cell.stone <= 0 && cell.ore <= 0 && cell.h <= 0.66) freeCells.push([x, z]);
    }
    const parts = {};
    const ground = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 0.5, CELL), this._groundMat || new THREE.MeshLambertMaterial({ map: this.groundTex || null }), Math.max(1, groundCells.length));
    groundCells.forEach(([x, z], i) => {
      const cell = ch.cells[x % CHUNK][z % CHUNK];
      const h = cell.water ? -0.15 : cell.h * 0.9;
      m.makeTranslation(x + 0.5, h - 0.25, z + 0.5);
      ground.setMatrixAt(i, m);
      col.copy(this._cellColor(cell, "spring", x, z));
      if (cell.tree) col.multiplyScalar(0.85);
      ground.setColorAt(i, col);
    });
    ground.instanceMatrix.needsUpdate = true;
    if (ground.instanceColor) ground.instanceColor.needsUpdate = true;
    group.add(ground);
    parts.ground = ground;
    if (waterCells.length) {
      const water = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 0.12, CELL), new THREE.MeshLambertMaterial({ color: 0x3a9ad9, transparent: true, opacity: 0.72 }), waterCells.length);
      waterCells.forEach(([x, z], idx) => { m.makeTranslation(x + 0.5, 0.32, z + 0.5); water.setMatrixAt(idx, m); });
      group.add(water);
      parts.water = water;
    }
    // Trees: trunk + canopy, instanced, with real size variety and
    // per-tree canopy jitter (reapplied on season change).
    const treeJitter = treeCells.map(([x, z]) => 0.88 + (((x * 13 + z * 7) % 100) / 100) * 0.24);
    if (treeCells.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.18, 0.8, 6), new THREE.MeshLambertMaterial({ color: 0x6b4423 }), treeCells.length);
      const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.85, 0), new THREE.MeshLambertMaterial({ color: 0x2e6b2e }), treeCells.length);
      const canopyTop = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshLambertMaterial({ color: 0x3d8a3d }), treeCells.length);
      treeCells.forEach(([x, z], idx) => {
        const s = 0.7 + (((x * 7 + z * 13) % 10) / 10) * 0.7;
        m.makeScale(s, s * (0.9 + (((x * 3 + z * 11) % 10) / 10) * 0.3), s); m.setPosition(x + 0.5, 0.65 * s, z + 0.5); trunk.setMatrixAt(idx, m);
        m.makeScale(s, s, s); m.setPosition(x + 0.5, 1.7 * s, z + 0.5); canopy.setMatrixAt(idx, m);
        m.makeScale(s, s, s); m.setPosition(x + 0.5, 2.35 * s, z + 0.5); canopyTop.setMatrixAt(idx, m);
        canopy.setColorAt(idx, this._c.copy(SEASON_CANOPY.spring).multiplyScalar(treeJitter[idx]));
        canopyTop.setColorAt(idx, this._c.copy(SEASON_CANOPY_TOP.spring).multiplyScalar(treeJitter[idx]));
      });
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
      if (canopyTop.instanceColor) canopyTop.instanceColor.needsUpdate = true;
      group.add(trunk, canopy, canopyTop);
      parts.trunk = trunk; parts.canopy = canopy; parts.canopyTop = canopyTop;
    }
    // Ground life: grass tufts, flowers, and bushes on free ground,
    // all instanced and placed by a deterministic cell hash so the
    // dressing is identical on every load. Nothing here is per-frame.
    const tuftSpots = [];
    const flowerSpots = [];
    const bushSpots = [];
    for (const [x, z] of freeCells) {
      const hash = ((x * 31 + z * 17) % 100) / 100;
      const h2 = ((x * 7 + z * 41) % 100) / 100;
      tuftSpots.push([x + 0.25 + h2 * 0.3, z + 0.3 + hash * 0.4, 0.8 + hash * 0.5]);
      tuftSpots.push([x + 0.6 - h2 * 0.3, z + 0.65 - hash * 0.3, 0.7 + h2 * 0.5]);
      if (hash < 0.1) flowerSpots.push([x + 0.5, z + 0.5, hash]);
      else if (hash < 0.17) bushSpots.push([x + 0.5, z + 0.5, hash]);
    }
    const tuftJitter = tuftSpots.map((s, i) => ((i * 37) % 100) / 100);
    const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.42, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, tuftSpots.length));
    tuftSpots.forEach(([px, pz, s], idx) => {
      m.makeScale(s, s, s); m.setPosition(px, 0.2 * s + 0.02, pz);
      tufts.setMatrixAt(idx, m);
      tufts.setColorAt(idx, this._c.copy(SEASON_GRASS.spring).multiplyScalar(0.78 + tuftJitter[idx] * 0.3));
    });
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    group.add(tufts);
    parts.tufts = tufts;
    const FLOWER_COLORS = [0xe53935, 0xffd54f, 0xf8f8f8, 0xab47bc];
    const flowers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, flowerSpots.length));
    flowerSpots.forEach(([px, pz, hash], idx) => {
      m.makeScale(1, 1, 1); m.setPosition(px, 0.2, pz);
      flowers.setMatrixAt(idx, m);
      flowers.setColorAt(idx, this._c.setHex(FLOWER_COLORS[Math.floor(hash * 100) % FLOWER_COLORS.length]));
    });
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    group.add(flowers);
    parts.flowers = flowers;
    const bushJitter = bushSpots.map((s, i) => ((i * 53) % 100) / 100);
    const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, bushSpots.length));
    bushSpots.forEach(([px, pz, hash], idx) => {
      const s = 0.7 + hash * 5;
      m.makeScale(s, s * 0.8, s); m.setPosition(px, 0.32, pz);
      bushes.setMatrixAt(idx, m);
      bushes.setColorAt(idx, this._c.copy(SEASON_CANOPY.spring).multiplyScalar(0.85 + bushJitter[idx] * 0.25));
    });
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    group.add(bushes);
    parts.bushes = bushes;
    const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.42, 0), new THREE.MeshLambertMaterial({ color: 0x9a9a9a }), Math.max(1, stoneCells.length));
    stoneCells.forEach(([x, z], idx) => {
      stones.setColorAt(idx, cellAt(grid, x, z).ore > 0 ? this._c.setHex(0x7f9fb5) : this._c.setHex(0x9a9a9a));
    });
    if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
    group.add(stones);
    parts.stones = stones;
    // Crops: five plants per farm cell, in a row, so fields read as
    // dense rows rather than single blocks.
    const crops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), new THREE.MeshLambertMaterial({ color: 0x8bc34a }), Math.max(1, farmCells.length * 5));
    group.add(crops);
    parts.crops = crops;
    let roads = null;
    if (roadCells.length) {
      roads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.12, 0.95), new THREE.MeshLambertMaterial({ map: this.cobbleTex, color: 0xc9b18a }), roadCells.length);
      const rm = new THREE.Matrix4();
      roadCells.forEach(([x, z], idx) => { rm.makeTranslation(x + 0.5, cellAt(grid, x, z).h * 0.9 + 0.04, z + 0.5); roads.setMatrixAt(idx, rm); });
      group.add(roads);
    }
    parts.roads = roads;
    ch.dirty = false;
    return {
      key: chunkKey(cx, cz), cx, cz, group, parts,
      groundCells, treeCells, treeJitter, stoneCells, farmCells, roadCells,
      tuftJitter, bushJitter, season: null, band: null, roadEra: -1,
    };
  }

  _disposeChunkGroup(rec) {
    if (!rec) return;
    if (rec.group) {
      this.scene.remove(rec.group);
      rec.group.traverse((o) => { if (o.geometry && o.geometry !== SHADOW_GEO) o.geometry.dispose(); });
    }
    if (this._chunkGroups) this._chunkGroups.delete(rec.key);
    if (this._streamStats) this._streamStats.disposed++;
    rec.group = null;
    rec.parts = {};
  }

  buildStatic(grid) {
    // A fresh static pass: drop every chunk group and rebuild from
    // the generated chunks. The building mesh stays global (see
    // _syncBuildings); its groups are recreated here as before.
    if (this._chunkGroups) for (const rec of [...this._chunkGroups.values()]) this._disposeChunkGroup(rec);
    this._chunkGroups = new Map();
    this._rebuildQueue = [];
    if (!this._streamStats) this._streamStats = { built: 0, disposed: 0, rebuilt: 0 };
    if (!this._pinnedChunks) this._pinnedChunks = new Set();
    for (const ch of grid.chunks.values()) {
      const rec = this._buildChunkGroup(grid, ch.cx, ch.cz);
      if (!rec) continue;
      rec.band = this._chunkBand(ch.cx, ch.cz, null);
      this._applyBandVisibility(rec);
      this._chunkGroups.set(rec.key, rec);
      this.scene.add(rec.group);
      this._streamStats.built++;
    }
    this._buildStatic = [...this._chunkGroups.values()].map((r) => r.group);
    this._season = null;
    this.buildingsGroup = new THREE.Group();
    this.scene.add(this.buildingsGroup);
    this.dressingGroup = new THREE.Group();
    this.scene.add(this.dressingGroup);
  }


  _clearGroup(group) {
    group.traverse((o) => { if (o.geometry && o.geometry !== SHADOW_GEO) o.geometry.dispose(); });
    group.clear();
  }

  // One building: merged body, merged windows (night glow), merged
  // snow caps (winter only), plus round parts as shared-geometry
  // meshes where a box will not do. Era stage picks the palette and
  // the roof shape; tech level adds workshop detail.
  _buildingMesh(type, x, z, techLevel = 0, era = 0, groundY = 0.45, facingAngle = 0) {
    const g = new THREE.Group();
    g.position.set(x + 0.5, 0.3, z + 0.5);
    // Houses turn their door toward their street. The door is built
    // on the +z side, so rotating by atan2 of the street direction
    // faces it. Symmetric types are unaffected in practice.
    g.rotation.y = facingAngle;
    const pal = ERA_PALETTE[era] || ERA_PALETTE[0];
    const flat = era >= 3;
    let chimneyTop = null;
    const finish = (body, win, snow, extra, footprint) => {
      if (body.length) {
        for (const { tex, geo } of mergePartsByTex(body)) {
          const mat = tex === "roof" ? (MAT_ROOF || MAT_BODY) : tex === "wall" ? (MAT_WALL || MAT_BODY) : MAT_BODY;
          g.add(new THREE.Mesh(geo, mat));
        }
      }
      if (win.length) {
        const wmesh = new THREE.Mesh(mergeParts(win), MAT_WINDOW);
        wmesh.userData.glow = true;
        g.add(wmesh);
        this._nightMeshes.push(wmesh);
      }
      if (snow.length) {
        const smesh = new THREE.Mesh(mergeParts(snow), MAT_SNOW);
        smesh.userData.isSnow = true;
        smesh.visible = this._season === "winter";
        g.add(smesh);
      }
      if (extra) for (const e of extra) g.add(e);
      if (chimneyTop) {
        // The chimney's stored world position must follow the same
        // rotation as the group, or smoke would rise from where the
        // chimney stood before the house turned to face its street.
        const c = Math.cos(facingAngle), s = Math.sin(facingAngle);
        const wx = chimneyTop[0] * c + chimneyTop[2] * s;
        const wz = -chimneyTop[0] * s + chimneyTop[2] * c;
        this._chimneys.push([x + 0.5 + wx, 0.3 + chimneyTop[1], z + 0.5 + wz]);
        // Fire glowing on the chimney top at dusk and night, as in
        // the mockup. A night mesh: hidden by day, lit after dark.
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 6), MAT_FLAME);
        flame.position.set(chimneyTop[0], chimneyTop[1] - 0.05, chimneyTop[2]);
        flame.userData.glow = true;
        g.add(flame);
        this._nightMeshes.push(flame);
      }
      if (footprint) {
        // Fake contact shadow: a dark quad just above the ground,
        // wider than the footprint, so the building sits on the
        // ground instead of floating. No shadow maps on phones.
        const shadow = new THREE.Mesh(SHADOW_GEO, MAT_SHADOW);
        shadow.rotation.x = -Math.PI / 2;
        shadow.scale.set(footprint[0] + 0.7, footprint[1] + 0.7, 1);
        shadow.position.y = groundY + 0.02 - 0.3;
        shadow.renderOrder = 1;
        shadow.userData.isShadow = true;
        g.add(shadow);
      }
      return g;
    };
    const house = (o) => {
      const r = timberHouse({ ...o, pal, era, flat: o.flat ?? flat });
      chimneyTop = r.chimneyTop;
      return finish(r.body, r.win, r.snow, o.extra, [o.w, o.d]);
    };

    if (type === "towncenter") {
      const r = timberHouse({ pal, era, flat, w: 2.4, d: 2.0, wallH: 1.3, roofH: 1.0, chimney: true, windows: [{ x: -0.7, y: 0.85 }, { x: 0.7, y: 0.85 }] });
      chimneyTop = r.chimneyTop;
      const body = r.body;
      partBox(body, 0.6, 1.9, 0.6, 1.05, 1.1, -0.7, 0x8a8a8a);
      partBox(body, 0.7, 0.9, 0.06, 0, 1.0, 1.03, 0xb71c1c);
      const extra = [];
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.06), new THREE.MeshLambertMaterial({ color: 0xb71c1c }));
      banner.position.set(0, 1.0, 1.03); extra.push(banner);
      return finish(body, r.win, r.snow, extra, [2.4, 2.0]);
    } else if (type === "granary") {
      const body = [], win = [], snow = [];
      for (const sx of [-0.7, 0.7]) for (const sz of [-0.55, 0.55]) partBox(body, 0.16, 0.5, 0.16, sx, 0.25, sz, pal.timber);
      partBox(body, 1.9, 1.1, 1.5, 0, 1.05, 0, pal.wall);
      partBox(body, 1.9, 0.12, 1.5, 0, 1.66, 0, pal.timber);
      partPrism(body, 2.2, 0.8, 1.8, 0, 1.72, 0, 0xd7a94e, 0, "roof");
      partBox(body, 0.5, 0.7, 0.06, 0, 0.85, 0.78, 0x3e2723);
      return finish(body, win, snow, null, [1.9, 1.5]);
    } else if (type === "marker") {
      const body = [];
      partCyl(body, 0.09, 0.11, 1.3, 6, 0, 0.65, 0, pal.timber);
      partBox(body, 0.55, 0.32, 0.04, 0.32, 1.15, 0, 0xffd700);
      return finish(body, [], []);
    } else if (type === "stockpile") {
      const body = [];
      partBox(body, 1.6, 0.25, 1.6, 0, 0.12, 0, pal.timber);
      partBox(body, 0.55, 0.55, 0.55, -0.4, 0.5, 0, 0xa1887f);
      partBox(body, 0.55, 0.55, 0.55, 0.4, 0.5, 0, 0xd7a94e);
      return finish(body, [], [], null, [1.6, 1.6]);
    } else if (type === "altar") {
      const body = [];
      partBox(body, 1.2, 0.3, 1.2, 0, 0.15, 0, 0x9e9e9e);
      partBox(body, 0.4, 1.1, 0.4, 0, 0.8, 0, 0x9e9e9e);
      partBox(body, 0.7, 0.2, 0.7, 0, 1.45, 0, 0xffd700);
      const extra = [];
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), MAT_FLAME);
      flame.position.y = 1.75; extra.push(flame);
      return finish(body, [], [], extra, [1.2, 1.2]);
    } else if (type === "hut") {
      return house({ w: 1.7, d: 1.7, wallH: 1.0, roofH: 0.9, chimney: true, windows: [{ x: 0.55, y: 0.75 }] });
    } else if (type === "longhouse") {
      return house({ w: 2.6, d: 1.8, wallH: 1.1, roofH: 0.9, chimney: true, windows: [{ x: -0.85, y: 0.8 }, { x: 0.85, y: 0.8 }] });
    } else if (type === "well") {
      const body = [];
      partCyl(body, 0.55, 0.6, 0.7, 8, 0, 0.35, 0, 0x9e9e9e);
      partCyl(body, 0.42, 0.42, 0.1, 8, 0, 0.65, 0, 0x29b6f6);
      for (const sx of [-0.5, 0.5]) partBox(body, 0.12, 1.1, 0.12, sx, 0.55, 0, pal.timber);
      partPrism(body, 1.5, 0.5, 0.9, 0, 1.1, 0, pal.roof, 0, "roof");
      return finish(body, [], [], null, [1.2, 1.2]);
    } else if (type === "workshop") {
      const r = timberHouse({ pal, era, flat, w: 2.0, d: 1.6, wallH: 1.1, roofH: 0.8, chimney: true, doorColor: 0x3e2723, windows: [{ x: -0.6, y: 0.8 }] });
      chimneyTop = r.chimneyTop;
      const body = r.body;
      partBox(body, 0.7, 0.35, 0.3, -0.6, 0.18, 0.95, 0x37474f);
      if (techLevel >= 1) {
        partBox(body, 0.35, 0.8, 0.35, -0.7, 1.4, -0.4, 0x8a8a8a);
        partBox(body, 0.5, 0.35, 0.4, 0.6, 0.18, 0.95, 0x78909c);
      }
      if (techLevel >= 2) partBox(body, 0.6, 0.3, 0.28, 0.1, 0.15, 0.95, 0x607d8b);
      return finish(body, r.win, r.snow, null, [2.0, 1.6]);
    } else if (type === "shrine") {
      const body = [];
      partBox(body, 1.3, 0.3, 1.3, 0, 0.15, 0, 0x9e9e9e);
      partBox(body, 0.45, 1.3, 0.45, 0, 0.95, 0, 0xefebe9);
      partBox(body, 0.7, 0.2, 0.7, 0, 1.7, 0, 0xffd700);
      const extra = [];
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.35, 6), new THREE.MeshBasicMaterial({ color: 0xfff176 }));
      flame.position.y = 2.0; extra.push(flame);
      return finish(body, [], [], extra, [1.3, 1.3]);
    } else if (type === "greathall") {
      const r = timberHouse({ pal, era, flat, w: 3.2, d: 2.0, wallH: 1.3, roofH: 1.0, chimney: true, windows: [{ x: -1.1, y: 0.9 }, { x: 1.1, y: 0.9 }] });
      chimneyTop = r.chimneyTop;
      const body = r.body;
      partBox(body, 0.6, 1.6, 0.6, 1.4, 0.8, -0.7, 0x8a8a8a);
      partBox(body, 0.7, 0.9, 0.06, 0, 1.2, 1.05, 0xb71c1c);
      return finish(body, r.win, r.snow, null, [3.2, 2.0]);
    } else if (type === "farmhouse") {
      const r = timberHouse({ pal, era, flat, w: 1.8, d: 1.5, wallH: 1.0, roofH: 0.8, chimney: false, windows: [{ x: 0.6, y: 0.7 }] });
      const body = r.body;
      partCyl(body, 0.3, 0.3, 1.3, 8, 1.05, 0.65, -0.4, 0x9e9e9e);
      return finish(body, r.win, r.snow, null, [1.8, 1.5]);
    } else if (type === "school") {
      const body = [], win = [], snow = [];
      const wallCol = flat ? 0xe8e8e8 : 0xefebe9;
      const roofCol = flat ? pal.roof : 0x1565c0;
      partBox(body, 2.2, 1.2, 1.7, 0, 0.78, 0, wallCol, 0, 0, 0, "wall");
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) partBox(body, 0.12, 1.2, 0.12, sx * 1.04, 0.78, sz * 0.79, pal.timber);
      partBox(body, 0.5, 0.7, 0.06, 0, 0.53, 0.88, 0x3e2723);
      if (flat) {
        partBox(body, 2.4, 0.15, 1.9, 0, 1.53, 0, roofCol, 0, 0, 0, "roof");
        partBox(win, 1.5, 0.3, 0.06, 0, 1.2, 0.88, 0xffffff);
        partBox(snow, 1.5, 0.04, 1.15, 0, 1.64, 0, 0xffffff);
      } else {
        partPrism(body, 2.5, 0.9, 2.0, 0, 1.38, 0, roofCol, 0, "roof");
        partBox(body, 0.8, 0.4, 0.05, 0, 1.15, 0.88, 0xffffff);
      }
      partBox(body, 0.14, 1.2, 0.14, 1.25, 0.78, 0.6, pal.timber);
      partBox(body, 0.3, 0.3, 0.3, 1.25, 1.53, 0.6, 0xffd700);
      for (const w of [{ x: -0.7, y: 0.8 }, { x: 0.7, y: 0.8 }]) partBox(win, 0.32, 0.34, 0.06, w.x, w.y, 0.88, 0xffffff);
      return finish(body, win, snow, null, [2.2, 1.7]);
    } else if (type === "healer") {
      const r = timberHouse({ pal, era, flat, w: 1.7, d: 1.6, wallH: 1.0, roofH: 0.9, chimney: false, windows: [{ x: 0.55, y: 0.7 }] });
      const body = r.body;
      if (!flat) {
        // Green roof replaces the red one: rebuild is wasteful, so the
        // prism is added here only when the house helper used the era
        // roof; instead recolor by adding a green prism slightly proud.
        partPrism(body, 2.02, 0.92, 1.92, 0, 1.18, 0, 0x2e7d32, 0, "roof");
      }
      partBox(body, 0.55, 0.55, 0.05, 0, 1.25, 0.83, 0xffffff);
      partBox(body, 0.12, 0.4, 0.02, 0, 1.25, 0.87, 0xc62828);
      partBox(body, 0.4, 0.12, 0.02, 0, 1.25, 0.87, 0xc62828);
      return finish(body, r.win, r.snow, null, [1.7, 1.6]);
    } else if (type === "wall") {
      const body = [];
      if (era === 0) {
        for (let i = 0; i < 5; i++) partBox(body, 0.16, 1.15 + (i % 2) * 0.12, 0.16, -0.4 + i * 0.2, 0.62, 0, 0x7a5230);
        partBox(body, 1.05, 0.1, 0.1, 0, 0.5, 0.1, 0x5d4037);
        partBox(body, 1.05, 0.1, 0.1, 0, 0.95, 0.1, 0x5d4037);
      } else {
        partBox(body, 1.0, 0.9, 0.5, 0, 0.45, 0, pal.wallMat);
        partBox(body, 1.0, 0.12, 0.56, 0, 0.96, 0, era >= 2 ? 0x6e6e6e : 0x7a7a7a);
        for (let i = 0; i < 4; i++) partBox(body, 0.16, 0.22, 0.56, -0.38 + i * 0.25, 1.08, 0, pal.wallMat);
        if (era >= 3) partBox(body, 1.0, 0.06, 0.1, 0, 1.2, 0.28, 0xfff9c4);
      }
      return finish(body, [], []);
    } else if (type === "tower") {
      const body = [], win = [];
      if (era === 0) {
        for (const sx of [-0.4, 0.4]) for (const sz of [-0.4, 0.4]) partBox(body, 0.14, 1.6, 0.14, sx, 0.8, sz, pal.timber);
        partBox(body, 1.1, 0.14, 1.1, 0, 1.65, 0, pal.timber);
        partBox(body, 1.1, 0.3, 0.08, 0, 1.85, 0.51, pal.timber);
        partBox(body, 1.1, 0.3, 0.08, 0, 1.85, -0.51, pal.timber);
        partPrism(body, 1.4, 0.7, 1.4, 0, 2.0, 0, pal.roof, 0, "roof");
        partCyl(body, 0.05, 0.05, 0.8, 5, 0, 2.9, 0, pal.timber);
        partBox(body, 0.45, 0.28, 0.04, 0.25, 2.85, 0, 0xb71c1c);
      } else {
        partBox(body, 0.9, 2.4, 0.9, 0, 1.2, 0, pal.wallMat);
        partBox(body, 1.1, 0.16, 1.1, 0, 2.48, 0, era >= 2 ? 0x6e6e6e : 0x7a7a7a);
        for (let i = 0; i < 4; i++) partBox(body, 0.2, 0.3, 0.2, -0.4 + (i % 2) * 0.8, 2.65, -0.4 + Math.floor(i / 2) * 0.8, pal.wallMat);
        partBox(win, 0.24, 0.3, 0.06, 0, 2.0, 0.48, 0xffffff);
        partCyl(body, 0.05, 0.05, 0.9, 5, 0, 3.0, 0, pal.timber);
        partBox(body, 0.45, 0.28, 0.04, 0.25, 2.95, 0, 0xb71c1c);
        if (era >= 3) partBox(body, 0.2, 0.2, 0.2, 0, 2.85, 0, 0xfff9c4);
      }
      return finish(body, win, []);
    }
    // Unknown type: a plain timber block, so a new building never
    // renders invisible.
    const body = [];
    partBox(body, 1.4, 1.0, 1.4, 0, 0.5, 0, pal.wall);
    return finish(body, [], [], null, [1.4, 1.4]);
  }

  _syncBuildings(state, grid) {
    const techLevel = state.tech ? state.tech.level : 0;
    const era = eraStageOf(techLevel);
    const popBucket = Math.floor(state.villagers.length / 5);
    const hasWalls = state.buildings.some((b) => b.type === "wall" || b.type === "tower");
    const sig = state.buildings.map((b) => b.type + b.x + "," + b.z).join("|") + "#m" + state.buildings.filter((b) => b.type === "tower").map((t) => towerManned(state, t) ? 1 : 0).join("") + "#" + state.buildQueue.length + "#t" + techLevel + "#p" + popBucket + "#w" + (hasWalls ? 1 : 0);
    if (sig === this._buildSignature) return;
    // Build every mesh BEFORE touching the live groups: a single bad
    // building type must never blank the village (the v12 launch bug:
    // the signature was recorded, the group cleared, then the first
    // mesh threw, and nothing ever drew again). A failed type falls
    // back to the plain-block mesh; the signature is recorded only
    // after a full successful rebuild at the end of this method.
    this._nightMeshes = [];
    this._chimneys = [];
    const safeMesh = (type, x, z) => {
      const cell = grid ? cellAt(grid, x, z) : null;
      const groundY = cell ? cell.h * 0.9 : 0.45;
      // Face the nearest street: the door side turns toward it. A
      // house with no street beside it keeps the default facing, as
      // grandfathered scatter-built houses did.
      const front = grid ? streetFrontage(grid, x, z) : null;
      const facingAngle = front ? Math.atan2(front[0], front[1]) : 0;
      try { return this._buildingMesh(type, x, z, techLevel, era, groundY, facingAngle); }
      catch (e) { try { return this._buildingMesh("unknown:" + type, x, z, techLevel, era, groundY, facingAngle); } catch (e2) { return null; } }
    };
    const built = [];
    for (const b of state.buildings) {
      const m = safeMesh(b.type, b.x, b.z);
      if (m) { m.userData.chunkKey = chunkKey(Math.floor(b.x / CHUNK), Math.floor(b.z / CHUNK)); built.push(m); }
    }
    for (const q of state.buildQueue) {
      const frame = safeMesh(q.type || "hut", q.x, q.z);
      if (!frame) continue;
      frame.userData.chunkKey = chunkKey(Math.floor(q.x / CHUNK), Math.floor(q.z / CHUNK));
      frame.scale.setScalar(0.6);
      frame.traverse((o) => { if (o.material && o.material !== MAT_BODY && o.material !== MAT_WINDOW && o.material !== MAT_SNOW) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
      built.push(frame);
    }
    // Manned towers draw their posted guard on the platform; an
    // unmanned tower draws empty. The figure is static decoration,
    // not a villager: its hit box is removed so taps never select it.
    for (const t of state.buildings) {
      if (t.type !== "tower" || !towerManned(state, t)) continue;
      const cell = grid ? cellAt(grid, t.x, t.z) : null;
      const groundY = cell ? cell.h * 0.9 : 0.45;
      const fig = this._villagerGroup({ id: -1, job: "guard" });
      fig.userData.spear.visible = true;
      fig.userData.sash.visible = true;
      fig.remove(fig.userData.hit);
      fig.position.set(t.x + 0.5, groundY + (era === 0 ? 1.72 : 2.56), t.z + 0.5);
      fig.scale.setScalar(0.85);
      fig.userData.chunkKey = chunkKey(Math.floor(t.x / CHUNK), Math.floor(t.z / CHUNK));
      built.push(fig);
    }
    this._clearGroup(this.buildingsGroup);
    this._clearGroup(this.dressingGroup);
    for (const m of built) this.buildingsGroup.add(m);
    // Gates: posts and beam on the open axis cells of the wall ring,
    // drawn only once a wall exists. Torches and market stalls dress
    // the plaza as the village grows.
    const pal = ERA_PALETTE[era];
    const cx = state._cx ?? 24, cz = state._cz ?? 24;
    if (hasWalls) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const gx = cx + dx * WALL_RING_R, gz = cz + dz * WALL_RING_R;
        if (gx < 0 || gz < 0 || gx >= SIZE || gz >= SIZE) continue;
        if (cellAt(grid, gx, gz).building) continue;
        const parts = [];
        const along = dx !== 0;
        for (const s of [-0.7, 0.7]) {
          if (along) partBox(parts, 0.16, 1.7, 0.16, 0, 0.85, s, pal.timber);
          else partBox(parts, 0.16, 1.7, 0.16, s, 0.85, 0, pal.timber);
        }
        if (along) partBox(parts, 0.14, 0.14, 1.7, 0, 1.75, 0, pal.timber);
        else partBox(parts, 1.7, 0.14, 0.14, 0, 1.75, 0, pal.timber);
        partBox(parts, 0.6, 0.5, 0.05, 0, 1.35, along ? 0.1 : 0, 0xb71c1c);
        const gate = new THREE.Mesh(mergeParts(parts), MAT_BODY);
        gate.position.set(gx + 0.5, 0.3, gz + 0.5);
        this.dressingGroup.add(gate);
      }
    }
    // Torches on the plaza ring corners, lamps from the brick era on.
    const torchSpots = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
    for (const [dx, dz] of torchSpots) {
      const tx = cx + dx, tz = cz + dz;
      const parts = [];
      partCyl(parts, 0.07, 0.09, 1.1, 6, 0, 0.55, 0, pal.timber);
      const torch = new THREE.Mesh(mergeParts(parts), MAT_BODY);
      torch.position.set(tx + 0.5, 0.3, tz + 0.5);
      this.dressingGroup.add(torch);
      let flame;
      if (era >= 2) {
        flame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), MAT_LAMP);
        flame.position.set(tx + 0.5, 1.55, tz + 0.5);
      } else {
        flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), MAT_FLAME);
        flame.position.set(tx + 0.5, 1.4, tz + 0.5);
      }
      flame.userData.glow = true;
      this.dressingGroup.add(flame);
      this._nightMeshes.push(flame);
    }
    // Market stalls once the village is a real town: striped canopies
    // and crates just outside the plaza ring.
    if (state.villagers.length >= 10) {
      for (const [dx, dz] of [[3, 0], [0, 3], [-3, 0]]) {
        const sx = cx + dx, sz = cz + dz;
        if (sx < 0 || sz < 0 || sx >= SIZE || sz >= SIZE) continue;
        const cell = cellAt(grid, sx, sz);
        if (cell.building || cell.water || cell.farm) continue;
        const parts = [];
        for (const px of [-0.6, 0.6]) for (const pz of [-0.5, 0.5]) partBox(parts, 0.09, 1.2, 0.09, px, 0.6, pz, pal.timber);
        partBox(parts, 1.5, 0.08, 0.5, 0, 1.25, -0.35, 0xb71c1c, 0.35);
        partBox(parts, 1.5, 0.08, 0.5, 0, 1.25, 0.35, 0xefebe9, -0.35);
        partBox(parts, 1.3, 0.5, 0.6, 0, 0.55, 0, 0x8d6e63);
        partBox(parts, 0.4, 0.4, 0.4, -0.8, 0.2, 0.5, 0xa1887f);
        partBox(parts, 0.4, 0.4, 0.4, 0.8, 0.2, -0.5, 0xd7a94e);
        const stall = new THREE.Mesh(mergeParts(parts), MAT_BODY);
        stall.position.set(sx + 0.5, 0.3, sz + 0.5);
        this.dressingGroup.add(stall);
      }
    }
    if (this._chimneys.length > 24) this._chimneys.length = 24;
    // Crates, a barrel, and a short fence run beside some houses, so
    // the yards read lived-in. Only where the next cell over is free.
    for (const b of state.buildings) {
      if (b.type !== "hut" && b.type !== "longhouse" && b.type !== "farmhouse") continue;
      if ((b.x * 5 + b.z * 11) % 4 !== 0) continue;
      const nx = b.x + 1, nz = b.z + 1;
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      const cell = cellAt(grid, nx, nz);
      if (!cell || cell.building || cell.water || cell.farm || cell.tree) continue;
      const parts = [];
      partBox(parts, 0.42, 0.42, 0.42, -0.2, 0.21, 0, 0xa1887f);
      partBox(parts, 0.42, 0.42, 0.42, -0.2, 0.63, 0, 0x8d6e63);
      partCyl(parts, 0.22, 0.22, 0.52, 8, 0.35, 0.26, 0.1, 0x6d4c41);
      for (let i = 0; i < 3; i++) partBox(parts, 0.12, 0.7, 0.12, -0.55 + i * 0.55, 0.35, 0.45, 0x7a5230);
      partBox(parts, 1.25, 0.08, 0.08, 0, 0.55, 0.45, 0x5d4037);
      const yard = new THREE.Mesh(mergeParts(parts), MAT_BODY);
      yard.position.set(nx + 0.5, 0.3, nz + 0.5);
      this.dressingGroup.add(yard);
    }
    // Doorsteps: a worn step from each house door to its street, so
    // lots read as lots facing the street, not boxes on grass.
    for (const b of state.buildings) {
      if (!["hut", "longhouse", "greathall", "farmhouse", "workshop", "school", "healer", "granary", "shrine"].includes(b.type)) continue;
      const front = grid ? streetFrontage(grid, b.x, b.z) : null;
      if (!front) continue;
      const cell = cellAt(grid, b.x, b.z);
      const step = new THREE.Mesh(STEP_GEO, MAT_STEP);
      step.position.set(b.x + 0.5 + front[0] * 0.95, (cell ? cell.h * 0.9 : 0.45) + 0.05, b.z + 0.5 + front[1] * 0.95);
      step.userData.doorstep = true;
      this.dressingGroup.add(step);
    }
    this._wasNight = null;
    this._buildSignature = sig;
  }

  // Village markers: one standing stone per known village, in the
  // village's color, at its center. Markers live outside the chunk
  // groups so they draw on ungenerated land too; their height
  // reads the generated cell when there is one and the pure
  // terrain function otherwise, so they never generate a chunk.
  _syncVillageMarkers(state, grid) {
    const spots = [{ id: 0, x: state._cx, z: state._cz, known: true }];
    for (const rec of state.villages || []) {
      if (rec.known) spots.push({ id: rec.id, x: rec.center[0], z: rec.center[1], known: true });
    }
    const sig = spots.map((s) => s.id + "@" + s.x + "," + s.z).join("|");
    if (sig === this._markerSignature) return;
    this._markerSignature = sig;
    if (this._villageMarkers) { this.scene.remove(this._villageMarkers); this._villageMarkers = null; }
    const group = new THREE.Group();
    const colors = { 0: 0xb71c1c, 1: 0xd7a94e, 2: 0x00897b };
    for (const s of spots) {
      // Three cells east of the town center: on the plaza edge,
      // clear of the towncenter mesh itself.
      const mx = s.x + 3, mz = s.z;
      const cell = grid ? peekCell(grid, mx, mz) : null;
      const groundY = cell ? cell.h * 0.9 : terrainHeight(state.seed, mx, mz) * 0.9;
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.7), new THREE.MeshLambertMaterial({ color: 0x8d8d8d }));
      stone.position.set(mx + 0.5, groundY + 1.2, mz + 0.5);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), new THREE.MeshLambertMaterial({ color: colors[s.id] ?? 0x777777 }));
      cap.position.set(mx + 0.5, groundY + 2.55, mz + 0.5);
      group.add(stone); group.add(cap);
    }
    this._villageMarkers = group;
    this.scene.add(group);
  }

  _villagerGroup(v) {
    const g = new THREE.Group();
    const tunic = new THREE.MeshLambertMaterial({ color: JOB_COLORS[v.job] || 0x777777 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.34), tunic);
    body.position.y = 0.62; body.name = "body"; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), new THREE.MeshLambertMaterial({ color: 0xffd9b3 }));
    head.position.y = 1.12; g.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const sx of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.02), eyeMat);
      eye.position.set(sx, 1.14, 0.2); g.add(eye);
    }
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.48), new THREE.MeshLambertMaterial({ color: v.job === "farmer" ? 0xd7a94e : 0x5d4037 }));
    hat.position.y = 1.36; g.add(hat);
    const quill = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    quill.position.set(0.18, 1.5, 0); quill.rotation.z = -0.3; quill.visible = false; g.add(quill);
    const toolMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), new THREE.MeshLambertMaterial({ color: 0x9e9e9e }));
    toolMesh.position.set(0.36, 0.55, 0.15); toolMesh.visible = false; g.add(toolMesh);
    // Guard kit: a spear and a red sash, shown only while the
    // villager works the guard job.
    const spear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.06), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
    spear.position.set(0.36, 0.85, 0.15); spear.visible = false; g.add(spear);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.36), new THREE.MeshLambertMaterial({ color: 0xb71c1c }));
    sash.position.set(0, 0.78, 0); sash.rotation.z = 0.5; sash.visible = false; g.add(sash);
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
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.8; hit.userData.villagerId = v.id; g.add(hit);
    g.userData.hit = hit; g.userData.legs = legs; g.userData.arms = arms;
    g.userData.body = body; g.userData.head = head; g.userData.hat = hat;
    g.userData.quill = quill; g.userData.toolMesh = toolMesh;
    g.userData.spear = spear; g.userData.sash = sash;
    return g;
  }

  _raiderGroup(r) {
    const g = new THREE.Group();
    const tunic = new THREE.MeshLambertMaterial({ color: 0x7f1d1d });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.38), tunic);
    body.position.y = 0.64; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
    head.position.y = 1.16; g.add(head);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.46), new THREE.MeshLambertMaterial({ color: 0x37474f }));
    helm.position.y = 1.4; g.add(helm);
    for (const sx of [-0.26, 0.26]) {
      const horn = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0xefebe9 }));
      horn.position.set(sx, 1.46, 0); horn.rotation.z = sx < 0 ? 0.5 : -0.5; g.add(horn);
    }
    const spear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
    spear.position.set(0.38, 0.85, 0.15); g.add(spear);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
    const legs = [];
    for (const sx of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.36, 0.19), legMat);
      leg.position.set(sx, 0.18, 0); leg.geometry.translate(0, -0.18, 0); leg.position.y = 0.36;
      g.add(leg); legs.push(leg);
    }
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.44, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
    g.userData.legs = legs;
    g.scale.setScalar(1.05);
    return g;
  }

  // Rain and snow share one pre-allocated particle cloud. Positions
  // update in place; nothing is created per frame.
  _updateParticles(state, dt) {
    const w = state.weather ? state.weather.kind : "clear";
    const active = w === "rain" || w === "storm" || w === "snow";
    this._particles.visible = active;
    if (!active) return;
    const snow = w === "snow";
    this._pMat.color.setHex(snow ? 0xffffff : w === "storm" ? 0x7fa8c8 : 0x9fc8e8);
    this._pMat.size = snow ? 0.3 : 0.22;
    const pos = this._pPos;
    const count = pos.length / 3;
    const speedMul = snow ? 0.22 : w === "storm" ? 1.4 : 1;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] -= this._pVel[i * 2] * speedMul * dt;
      pos[i * 3] += this._pVel[i * 2 + 1] * dt * (snow ? 2 : 0.5);
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3 + 1] = 14 + Math.random() * 2;
        pos[i * 3] = -24 + Math.random() * 96;
        pos[i * 3 + 2] = -24 + Math.random() * 96;
      }
      if (pos[i * 3] < -24) pos[i * 3] += 96;
      if (pos[i * 3] > 72) pos[i * 3] -= 96;
    }
    this._pGeo.attributes.position.needsUpdate = true;
  }

  // Chimney smoke rises and drifts, recycled over the chimney list.
  _updateSmoke(dt) {
    const pos = this._sPos;
    const homes = this._chimneys;
    for (let i = 0; i < this._sAge.length; i++) {
      this._sAge[i] += dt;
      if (this._sAge[i] > this._sLife[i] || this._sHome[i] < 0 || this._sHome[i] >= homes.length) {
        this._sAge[i] = 0;
        this._sLife[i] = 1.6 + Math.random() * 1.4;
        this._sHome[i] = homes.length ? Math.floor(Math.random() * homes.length) : -1;
      }
      if (this._sHome[i] < 0) { pos[i * 3 + 1] = -5; continue; }
      const h = homes[this._sHome[i]];
      const age = this._sAge[i];
      pos[i * 3] = h[0] + Math.sin(age * 1.3 + this._sSeed[i]) * 0.25 * age;
      pos[i * 3 + 1] = h[1] + age * 0.9;
      pos[i * 3 + 2] = h[2] + Math.cos(age * 1.1 + this._sSeed[i]) * 0.2 * age;
    }
    this._sGeo.attributes.position.needsUpdate = true;
  }

  update(state, grid, dt, elapsed) {
    // Streaming first: bands, disposal, and at most one rebuild
    // set the stage for everything below. Farm/road/tree/stone
    // count changes arrive as sim dirty flags and rebuild their
    // chunk through the same queue; no global recheck runs here.
    this.syncChunks(state, grid);
    this._syncBuildings(state, grid);
    this._applySeasonTint(state, grid);
    this._updateParticles(state, dt);
    this._updateSmoke(dt);
    // Era dressing for the roads: dirt, then cobble, then paved.
    // Each chunk's road mesh carries its own material and era.
    const era = eraStageOf(state.tech ? state.tech.level : 0);
    for (const rec of this._chunkGroups.values()) {
      if (rec.parts.roads && rec.roadEra !== era) {
        rec.roadEra = era;
        rec.parts.roads.material.color.setHex(ERA_PALETTE[era].road);
      }
    }
    // Wet ground in rain: darker, colder ground tint. Weather changes
    // are slow, so this runs only on a change.
    const wkind = state.weather ? state.weather.kind : "clear";
    if (wkind !== this._wetKind) {
      this._wetKind = wkind;
      const wet = wkind === "rain" || wkind === "storm";
      if (this._groundMat) this._groundMat.color.setHex(wet ? 0x9fb2c8 : 0xffffff);
      this._cloudMat.color.setHex(wkind === "storm" ? 0x5d6d7e : wkind === "snow" ? 0xe8e8e8 : 0xffffff);
    }
    // Stones + crops scale with remaining amount / growth stage.
    // Only chunks in the full/standard bands draw them, so only
    // those update: silhouette chunks hide both outright.
    const m = this._m;
    const winterCrops = state.season === "winter";
    for (const rec of this._chunkGroups.values()) {
      if (!rec.group || (rec.band !== "full" && rec.band !== "standard")) continue;
      if (rec.parts.stones) {
        rec.stoneCells.forEach(([x, z], idx) => {
          const cell = cellAt(grid, x, z);
          const amt = cell.stone + cell.ore;
          const s = amt > 0 ? 0.55 + Math.min(0.45, amt * 0.05) : 0.001;
          m.makeScale(s, s, s); m.setPosition(x + 0.5, 0.35, z + 0.5);
          rec.parts.stones.setMatrixAt(idx, m);
        });
        rec.parts.stones.instanceMatrix.needsUpdate = true;
      }
      if (rec.parts.crops) {
        rec.farmCells.forEach(([x, z], idx) => {
          const cell = cellAt(grid, x, z);
          const stage = cell.crop < 0 ? 0 : cell.crop;
          const hScale = 0.3 + stage * 0.28;
          for (let j = 0; j < 5; j++) {
            const px = x + 0.5 + (j - 2) * 0.2;
            m.makeScale(1, hScale, 1); m.setPosition(px, 0.05 + 0.25 * hScale, z + 0.5);
            rec.parts.crops.setMatrixAt(idx * 5 + j, m);
            rec.parts.crops.setColorAt(idx * 5 + j, this._c.setHex(winterCrops ? 0x8d6e63 : CROP_COLORS[stage]));
          }
        });
        rec.parts.crops.instanceMatrix.needsUpdate = true;
        if (rec.parts.crops.instanceColor) rec.parts.crops.instanceColor.needsUpdate = true;
      }
    }

    // Villagers.
    const seen = new Set();
    for (const v of state.villagers) {
      seen.add(v.id);
      let g = this.villagerMeshes.get(v.id);
      if (!g) { g = this._villagerGroup(v); this.scene.add(g); this.villagerMeshes.set(v.id, g); }
      g.visible = this._actorVisible(v.x, v.z, state);
      g.position.x += (v.x + 0.5 - g.position.x) * Math.min(1, dt * 10);
      g.position.z += (v.z + 0.5 - g.position.z) * Math.min(1, dt * 10);
      if (g.position.x === 0 && g.position.z === 0) { g.position.set(v.x + 0.5, 0, v.z + 0.5); }
      const u = g.userData;
      u.body.material.color.setHex(JOB_COLORS[v.job] || 0x777777);
      u.head.material.color.setHex(v.sick ? 0xa8d8a8 : 0xffd9b3);
      const isChild = (v.ageDays ?? 25) < 3;
      const isStudent = v.job === "student";
      g.scale.setScalar(isChild ? 0.7 : isStudent ? 0.85 : 1);
      u.hat.visible = !isChild && !isStudent;
      u.hat.material.color.setHex(v.job === "farmer" ? 0xd7a94e : v.job === "teacher" ? 0x7e57c2 : 0x5d4037);
      u.quill.visible = (v.education || 0) >= 5;
      u.toolMesh.visible = (v.tool || 0) > 0;
      if (u.spear && u.sash) u.spear.visible = u.sash.visible = v.job === "guard";
      if ((v.tool || 0) >= 3) u.toolMesh.material.color.setHex(0xe8e8e8);
      else if ((v.tool || 0) >= 2) u.toolMesh.material.color.setHex(0xffd700);
      else u.toolMesh.material.color.setHex(0x9e9e9e);
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

    // Raiders: dark, horned, and visibly not villagers.
    const seenRaiders = new Set();
    for (const r of state.raiders || []) {
      seenRaiders.add(r.id);
      let g = this.raiderMeshes.get(r.id);
      if (!g) { g = this._raiderGroup(r); g.position.set(r.x + 0.5, 0, r.z + 0.5); this.scene.add(g); this.raiderMeshes.set(r.id, g); }
      g.visible = this._actorVisible(r.x, r.z, state);
      g.position.x += (r.x + 0.5 - g.position.x) * Math.min(1, dt * 8);
      g.position.z += (r.z + 0.5 - g.position.z) * Math.min(1, dt * 8);
      const bob = Math.abs(Math.sin(elapsed * 8 + r.id)) * 0.05;
      g.position.y = bob;
      const swing = Math.sin(elapsed * 9 + r.id) * 0.5;
      if (g.userData.legs) { g.userData.legs[0].rotation.x = swing; g.userData.legs[1].rotation.x = -swing; }
      if (r.path && r.path.length) {
        const dx = r.path[0][0] + 0.5 - r.x, dz = r.path[0][1] + 0.5 - r.z;
        if (Math.hypot(dx, dz) > 0.1) g.rotation.y = Math.atan2(dx, dz);
      }
    }
    for (const [id, g] of this.raiderMeshes) if (!seenRaiders.has(id)) { this.scene.remove(g); this.raiderMeshes.delete(id); }

    // Caravans: one trader figure per caravan in flight — a
    // villager figure with a yellow sash and a pack bundle.
    const seenCaravans = new Set();
    for (const c of state.caravans || []) {
      seenCaravans.add(c.id);
      let g = this.caravanMeshes.get(c.id);
      if (!g) {
        g = this._villagerGroup({ id: -1000 - c.id, job: "hauler" });
        g.userData.sash.visible = true;
        g.userData.sash.material.color.setHex(0xf9d423);
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.25), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
        pack.position.set(0, 1.05, -0.28); g.add(pack);
        g.position.set(c.x + 0.5, 0, c.z + 0.5);
        this.scene.add(g); this.caravanMeshes.set(c.id, g);
      }
      g.visible = this._actorVisible(c.x, c.z, state);
      g.position.x += (c.x + 0.5 - g.position.x) * Math.min(1, dt * 8);
      g.position.z += (c.z + 0.5 - g.position.z) * Math.min(1, dt * 8);
      const bob = Math.abs(Math.sin(elapsed * 8 + c.id)) * 0.05;
      g.position.y = bob;
      if (c.path && c.path.length) {
        const dx = c.path[0][0] + 0.5 - c.x, dz = c.path[0][1] + 0.5 - c.z;
        if (Math.hypot(dx, dz) > 0.1) g.rotation.y = Math.atan2(dx, dz);
      }
    }
    for (const [id, g] of this.caravanMeshes) if (!seenCaravans.has(id)) { this.scene.remove(g); this.caravanMeshes.delete(id); }

    // Village markers: standing stones in village colors at known
    // villages' centers, drawn even on ungenerated land so a
    // discovered neighbor stays findable from far away.
    this._syncVillageMarkers(state, grid);

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
      g.visible = this._actorVisible(d.x, d.z, state);
      g.position.x += (d.x + 0.5 - g.position.x) * Math.min(1, dt * 8);
      g.position.z += (d.z + 0.5 - g.position.z) * Math.min(1, dt * 8);
    }
    for (const [id, g] of this.deerMeshes) if (!seenDeer.has(id)) { this.scene.remove(g); this.deerMeshes.delete(id); }

    // Fire effect: pre-allocated flames jitter in place, no new meshes.
    const fire = state._fire;
    const burning = !!(fire && state.elapsed < fire.until);
    this._fireFlames.forEach((flame, i) => {
      flame.visible = burning;
      if (burning) {
        flame.position.set(fire.x + 0.5 + (Math.random() - 0.5), 0.7, fire.z + 0.5 + (Math.random() - 0.5));
        flame.scale.set(1, 0.8 + Math.random() * 0.6, 1);
      }
    });
    const flooding = state.elapsed < state.effects.floodUntil;
    this.floodPlane.material.opacity = flooding ? 0.35 : 0;
    const waterShimmer = 0.66 + Math.sin(elapsed * 1.4) * 0.08;
    for (const rec of this._chunkGroups.values()) {
      if (rec.parts.water) rec.parts.water.material.opacity = waterShimmer;
    }
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * 0.45;
      if (cloud.position.x > SIZE + 4) cloud.position.x = -4;
    }

    // Day / night, with weather on top. Dawn and dusk glow orange,
    // night is deep blue with warm window light, storms dim and grey
    // the sky, snow pales it.
    const t = state.time;
    const phase = phaseOf(t);
    const isNight = phase === "night";
    // Windows, torches, and chimney fires glow from dusk through
    // dawn, not only at dead of night: the warm light against the
    // dark is the mockup's whole atmosphere.
    const glowOn = isNight || phase === "dawn" || phase === "dusk";
    const dayFactor = Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    let sunI = 0.22 + dayFactor * 1.35;
    let hemiI = 0.2 + dayFactor * 0.65;
    let skyL = 0.12 + dayFactor * 0.48;
    let skyS = 0.62;
    let skyH = 0.59;
    if (phase === "dawn" || phase === "dusk") { skyH = 0.07; skyS = 0.7; skyL = 0.4; }
    if (isNight) { skyH = 0.62; skyS = 0.5; skyL = 0.06; }
    if (wkind === "storm") { sunI *= 0.4; hemiI *= 0.65; skyL -= 0.12; skyS = 0.35; }
    else if (wkind === "rain") { sunI *= 0.65; hemiI *= 0.85; skyL -= 0.06; skyS = 0.4; }
    else if (wkind === "snow") { skyL += 0.08; skyS = 0.3; }
    else if (wkind === "heat") { skyH = 0.52; skyL += 0.04; }
    this.sun.intensity = Math.max(0.05, sunI);
    this.sun.color.setHex(isNight ? 0x8fa8d8 : (phase === "dawn" || phase === "dusk") ? 0xff8a3c : dayFactor > 0.75 ? 0xfff2cc : 0xff9a5c);
    const sunAngle = t * Math.PI * 2;
    this.sun.position.set(Math.cos(sunAngle) * 40, Math.sin(sunAngle) * 35 + 6, 10);
    this.hemi.intensity = Math.max(0.12, hemiI);
    this._skyColor.setHSL(skyH, skyS, Math.max(0.05, Math.min(0.62, skyL)));
    this.scene.background = this._skyColor;
    this.scene.fog.color.copy(this._skyColor);
    if (wkind === "storm") { this.scene.fog.near = 25; this.scene.fog.far = 55; }
    else if (wkind === "rain" || wkind === "snow") { this.scene.fog.near = 35; this.scene.fog.far = 70; }
    else { this.scene.fog.near = 60; this.scene.fog.far = 140; }
    if (glowOn !== this._wasNight) {
      this._wasNight = glowOn;
      this.nightLight.intensity = isNight ? 1.8 : glowOn ? 0.8 : 0;
      for (const mesh of this._nightMeshes) mesh.visible = glowOn;
    }
    const celebrating = !!(state.celebration && state.elapsed < state.celebration.until);
    this.celebrationGroup.visible = celebrating;
    if (celebrating) this.celebrationGroup.position.set((state._cx ?? 24) + 0.5, 0, (state._cz ?? 24) + 0.5);
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
  zoom(f) { this.zoomTarget = Math.max(12, Math.min(120, this.zoomTarget * f)); }
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
    let pinch = null;
    const el = this.canvas;
    el.style.touchAction = "none";
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
        if (pinch.startDist > 20 && d > 20) this.zoomTarget = Math.max(12, Math.min(120, pinch.startZoom * (pinch.startDist / d)));
        const mid = midOf();
        this._panBy(mid.x - pinch.midX, mid.y - pinch.midY);
        pinch.midX = mid.x; pinch.midY = mid.y;
      }
    });
    const up = (e) => {
      const wasTap = pointers.size === 1 && !everPinched && moved < 10 && performance.now() - downTime < 400 && downPos;
      pointers.delete(e.pointerId);
      if (pointers.size === 1) {
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
