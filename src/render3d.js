// Real 3D low-poly renderer (Three.js, vendored). Lit, shadowed scene:
// instanced pyramid, low-poly facilities, animated workers that haul blocks up
// the ramp (no teleport), animals on smooth looped paths. Same interface as the
// old Canvas2D renderer so main.js is unchanged except the import.
import * as THREE from "../vendor/three.module.js";
import { wonderFor, wonderGeom, BUILDINGS, genNodes } from "./data.js";
import { layerCells } from "./iso.js";

export const DAY_LEN = 240;
const TAU = Math.PI * 2;

// ---- day/night sky + light keyframes ----
const SKY = [
  { p: 0, top: 0x6a4b78, bot: 0xe8b27a, sun: 0xffd9a0, amb: 0.5 },
  { p: 0.25, top: 0x5fa3df, bot: 0xcfe4f2, sun: 0xfff2d6, amb: 0.85 },
  { p: 0.5, top: 0x9c5a4e, bot: 0xf0a85a, sun: 0xffb070, amb: 0.6 },
  { p: 0.72, top: 0x10182f, bot: 0x2a2f50, sun: 0x9fb0e0, amb: 0.32 },
  { p: 1, top: 0x6a4b78, bot: 0xe8b27a, sun: 0xffd9a0, amb: 0.5 },
];
function lerpHex(a, b, t) {
  const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
function skyAt(phase) {
  let a = SKY[0], b = SKY[1];
  for (let i = 0; i < SKY.length - 1; i++) if (phase >= SKY[i].p && phase <= SKY[i + 1].p) { a = SKY[i]; b = SKY[i + 1]; break; }
  const t = (phase - a.p) / (b.p - a.p || 1);
  return { top: lerpHex(a.top, b.top, t), bot: lerpHex(a.bot, b.bot, t), sun: lerpHex(a.sun, b.sun, t), amb: a.amb + (b.amb - a.amb) * t };
}

const SKINS = [0xcaa06a, 0xb5895a, 0x9a6f44, 0xd8b483];
const CLOTHS = [0x3a6ea5, 0xc0392b, 0xd4a017, 0x2c8c84];
// resource → chip/carry colour for gathering VFX
const NODE_COL = { wood: 0x8a5e34, limestone: 0xe7d6ad, food: 0xd9b24a, water: 0x49b5d6, granite: 0x9a7a8e, copper: 0xe08a4e };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.pan = { x: 0, y: 0 }; this.zoom = 1; this.whipFlash = 0; this.cacheKey = ""; this.shake = 0;
    this.shown = 0; this.revealKey = ""; this.workerHits = [];
    this.vw = 0; this.vh = 0;

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.r = r;

    const scene = new THREE.Scene(); this.scene = scene;
    scene.fog = new THREE.Fog(0xcfe4f2, 60, 200);
    this.cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);

    // sky dome (gradient)
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x5fa3df) }, bot: { value: new THREE.Color(0xcfe4f2) } },
      vertexShader: "varying vec3 vp; void main(){ vp=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      // uniforms are stored linear (Color.setHex); this raw shader isn't auto-encoded by
      // the renderer, so convert linear→sRGB here or the sky renders dark/muddy.
      fragmentShader: "varying vec3 vp; uniform vec3 top; uniform vec3 bot; void main(){ float h=clamp((normalize(vp).y+0.12)*1.1,0.0,1.0); vec3 c=mix(bot,top,h); c=pow(max(c,0.0),vec3(0.4545)); gl_FragColor=vec4(c,1.0);}",
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), this.skyMat);
    scene.add(sky);

    // lights
    this.hemi = new THREE.HemisphereLight(0xbfe0ff, 0xc8a060, 0.7); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.25);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera; sc.near = 1; sc.far = 220; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    scene.add(this.sun); scene.add(this.sun.target);

    // ground (big desert plane) + soft construction platform
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: this._tileTex(), color: 0xffffff, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    // Nile river (flat water on one side)
    const nile = new THREE.Mesh(new THREE.PlaneGeometry(220, 26), new THREE.MeshStandardMaterial({ color: 0x2f7fa0, roughness: 0.3, metalness: 0.1 }));
    nile.rotation.x = -Math.PI / 2; nile.position.set(0, 0.05, -34); scene.add(nile); this.nile = nile;

    // groups
    this.worldGroup = new THREE.Group(); scene.add(this.worldGroup); // buildings/props (rebuilt per wonder layout)
    this.nodeGroup = new THREE.Group(); scene.add(this.nodeGroup);   // procedural resource map (trees/rocks/...)
    this.workerGroup = new THREE.Group(); scene.add(this.workerGroup);
    this.gathererGroup = new THREE.Group(); scene.add(this.gathererGroup);
    this.animalGroup = new THREE.Group(); scene.add(this.animalGroup);
    this.fxGroup = new THREE.Group(); scene.add(this.fxGroup);

    // shared resources
    this.cubeGeo = new THREE.BoxGeometry(0.97, 1, 0.97);
    this.workers = []; this.animals = []; this.puffs = []; this.rings = []; this.chips = [];
    this.gatherers = []; this.nodes = []; this.nodeHits = []; this._nodeKey = "";
    this._dustTex = this._softTex();
    this._wonderBuilt = -1; this._layoutWonder = -1;
    this._tmpV = new THREE.Vector3(); this._tmpV2 = new THREE.Vector3();
  }

  // low-contrast 2-tone sand tiles → a Clash-of-Clans style grid underfoot
  _tileTex() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#dcb878"; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#d3ad6b"; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    g.strokeStyle = "rgba(120,92,52,0.16)"; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(85, 85);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  _softTex() {
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const g = c.getContext("2d"); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(235,215,170,0.9)"); gr.addColorStop(1, "rgba(235,215,170,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); return t;
  }

  _resize(vw, vh) {
    if (vw === this.vw && vh === this.vh) return;
    this.vw = vw; this.vh = vh;
    this.r.setSize(vw, vh, false);
  }

  // ---------- pyramid (instanced) ----------
  _buildPyramid(state) {
    if (this._wonderBuilt === state.wonderIndex && this.pyramid) return;
    this._wonderBuilt = state.wonderIndex;
    if (this.pyramid) { this.scene.remove(this.pyramid); this.pyramid.geometry.dispose(); this.pyramid.material.dispose(); }
    if (this.capstone) { this.scene.remove(this.capstone); }
    const g = wonderGeom(state.wonderIndex), wonder = wonderFor(state.wonderIndex);
    const B = g.base, off = (B - 1) / 2;
    // cube matrices in reveal order (layer by layer); prefix counts per layer
    const mats = []; this.layerPrefix = [0];
    const m = new THREE.Matrix4();
    for (let j = 0; j < g.layers; j++) {
      for (const c of layerCells(B, j)) { m.makeTranslation(c.gx - off, j + 0.5, c.gy - off); mats.push(m.clone()); }
      this.layerPrefix.push(mats.length);
    }
    const col = new THREE.Color(wonder.faces[0]);
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.92, flatShading: true });
    if (wonder.glow) { mat.emissive = new THREE.Color(wonder.faces[1]); mat.emissiveIntensity = 0.25; }
    const inst = new THREE.InstancedMesh(this.cubeGeo, mat, mats.length);
    inst.castShadow = true; inst.receiveShadow = true;
    const tint = new THREE.Color();
    for (let i = 0; i < mats.length; i++) {
      inst.setMatrixAt(i, mats[i]);
      const v = 0.84 + Math.random() * 0.26;           // per-block brightness → hand-laid stone, not a flat slab
      tint.setRGB(v, v * 0.995, v * 0.985); inst.setColorAt(i, tint);
    }
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true; inst.count = 0;
    this.scene.add(inst); this.pyramid = inst; this.pyrMats = mats;

    // capstone
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.7, 4), new THREE.MeshStandardMaterial({ color: new THREE.Color(wonder.capstone), emissive: new THREE.Color(wonder.capstone), emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.3, flatShading: true }));
    cap.rotation.y = Math.PI / 4; cap.castShadow = true; cap.visible = false;
    cap.position.set(0, g.layers + 0.85, 0);
    this.scene.add(cap); this.capstone = cap;
    this.revealKey = ""; this.shown = 0;
  }

  // ---------- low-poly building models ----------
  _mat(color, opts) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, flatShading: true }, opts || {})); }
  _box(w, h, d, color, y) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this._mat(color)); m.castShadow = true; m.receiveShadow = true; m.position.y = (y == null ? h / 2 : y); return m; }
  _buildingModel(type) {
    const grp = new THREE.Group();
    const add = (mesh, x, y, z) => { if (x != null) mesh.position.x = x; if (z != null) mesh.position.z = z; if (y != null) mesh.position.y = y; grp.add(mesh); };
    if (type === "farm") { const f = this._box(2.2, 0.12, 2.2, 0x6f9a3a, 0.06); grp.add(f); for (let i = -1; i <= 1; i++) add(this._box(0.1, 0.4, 2, 0x4f7026, 0.3), i * 0.6, 0.3, 0); }
    else if (type === "well") { add(this._box(1, 0.5, 1, 0xcdbb95)); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 10), this._mat(0x2a3b55)); w.position.y = 0.55; grp.add(w); }
    else if (type === "lumber") { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 6), this._mat(0x7c5530)); t.position.y = 0.8; t.castShadow = true; grp.add(t); const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), this._mat(0x5f8a3e)); f.position.y = 1.7; f.castShadow = true; f.scale.y = 0.7; grp.add(f); }
    else if (type === "quarry") { const pit = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.0, 0.3, 8), this._mat(0x9c8763)); pit.position.y = 0.15; pit.receiveShadow = true; grp.add(pit); for (let i = 0; i < 3; i++) add(this._box(0.5, 0.5, 0.5, 0xe3d3aa, 0.4), (i - 1) * 0.55, 0.4, 0.2); }
    else if (type === "granite" || type === "copper") { const mound = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.1, 7), this._mat(type === "granite" ? 0x8a7a8e : 0x8a7458)); mound.position.y = 0.55; mound.castShadow = true; grp.add(mound); add(this._box(0.5, 0.55, 0.35, 0x1a1320, 0.3), 0, 0.3, 0.95); }
    else if (type === "ramp") { add(this._box(1.4, 0.3, 0.7, 0xb08a5a, 0.15)); const a = this._box(0.16, 1.4, 0.16, 0x7c5530, 0.7); a.position.set(0.5, 0.7, 0); a.rotation.z = -0.5; grp.add(a); }
    else if (type === "market") { add(this._box(1.2, 0.7, 1.2, 0xb08a5a)); const aw = this._box(1.7, 0.12, 1.7, 0xcf5b4a, 0.95); grp.add(aw); }
    else if (type === "temple") { add(this._box(3, 1.4, 2.2, 0xe6dcc0)); for (let i = -1; i <= 1; i += 2) for (let k = -1; k <= 1; k += 2) add(this._box(0.28, 1.7, 0.28, 0xefe7cf, 0.85), i * 1.2, 0.85, k * 0.85); const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 2.6), this._mat(0xcaa6df)); roof.position.y = 1.85; roof.castShadow = true; grp.add(roof); }
    else if (type === "storage") { for (let i = 0; i < 3; i++) add(this._box(0.5, 0.7 + i * 0.1, 0.5, 0xe3d3aa, (0.7 + i * 0.1) / 2), (i - 1) * 0.55, null, 0); }
    else if (type === "camp") { const t = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1, 4), this._mat(0xd9c39a)); t.position.y = 0.5; t.rotation.y = Math.PI / 4; t.castShadow = true; grp.add(t); }
    else { // house: village/granary/docks default
      add(this._box(1.4, 1.1, 1.4, 0xc39568));
      if (type === "granary") { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 10), this._mat(0xd8b87f)); d.position.y = 0.6; d.castShadow = true; grp.add(d); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, TAU, 0, Math.PI / 2), this._mat(0xc9a868)); dome.position.y = 1.2; grp.add(dome); }
      else { const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.7, 4), this._mat(0xa9763f)); roof.position.y = 1.45; roof.rotation.y = Math.PI / 4; roof.castShadow = true; grp.add(roof); }
    }
    return grp;
  }

  // Resource buildings render as worker camps: a tent, crates and a worked pile.
  _campModel(id) {
    const grp = new THREE.Group();
    const tentCol = { quarry: 0xe6dcc6, lumber_camp: 0xb8915a, farm: 0xcfd7a0, well: 0xbcd3df, granite_mine: 0xd8c3cc, copper_mine: 0xd9c2a6 }[id] || 0xcdb892;
    const tent = new THREE.Mesh(new THREE.ConeGeometry(0.92, 1.0, 4), this._mat(tentCol));
    tent.position.set(-0.5, 0.5, -0.45); tent.rotation.y = Math.PI / 4; tent.castShadow = true; grp.add(tent);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 5), this._mat(0x7c5530)); pole.position.set(-0.5, 0.62, -0.45); grp.add(pole);
    const flag = this._box(0.26, 0.16, 0.02, 0xc0392b, 0); flag.position.set(-0.37, 1.05, -0.45); grp.add(flag);
    const crate = this._box(0.4, 0.4, 0.4, 0xb98e54, 0.2); crate.position.set(0.55, 0.2, -0.55); grp.add(crate);
    if (id === "quarry") { for (let i = 0; i < 3; i++) { const b = this._box(0.4, 0.4, 0.4, 0xe7d6ad, 0); b.position.set(0.15 + (i % 2) * 0.48, 0.2 + (i > 1 ? 0.4 : 0), 0.5); grp.add(b); } }
    else if (id === "lumber_camp") { for (let i = 0; i < 3; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.95, 6), this._mat(0x8a5e34)); log.rotation.z = Math.PI / 2; log.position.set(0.4, 0.17 + i * 0.25, 0.5); log.castShadow = true; grp.add(log); } }
    else if (id === "farm") { const fld = this._box(1.5, 0.1, 1.0, 0x6f9a3a, 0.05); fld.position.set(0.3, 0, 0.4); grp.add(fld); for (let i = -1; i <= 1; i++) { const s = this._box(0.08, 0.42, 0.08, 0xd9b24a, 0); s.position.set(0.3 + i * 0.42, 0.26, 0.4); grp.add(s); } }
    else if (id === "well") { const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.45, 10), this._mat(0xcdbb95)); ring.position.set(0.42, 0.22, 0.45); ring.castShadow = true; grp.add(ring); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 10), this._mat(0x2a3b55)); w.position.set(0.42, 0.5, 0.45); grp.add(w); }
    else if (id === "granite_mine") { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), this._mat(0x9a7a8e)); m.position.set(0.42, 0.4, 0.45); m.castShadow = true; grp.add(m); }
    else if (id === "copper_mine") { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), this._mat(0x8a7458)); m.position.set(0.42, 0.4, 0.45); m.castShadow = true; grp.add(m); const o = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 5), this._mat(0x3fae9a)); o.position.set(0.42, 0.72, 0.45); grp.add(o); }
    return grp;
  }

  _zoneAnchor(zone, B) {
    const c = (B - 1) / 2;
    const Z = {
      farm: [-1, -10, 5, 0], village: [-9, c - 2, 4, 0], well: [-7, c + 4, 3, 0], storage: [-8, -3, 3, 0],
      temple: [B + 5, -3, 2, 1], lumber: [-6, c + 7, 4, 0], market: [-3, B + 4, 4, 0], ramp: [c, B + 5, 5, 0],
      quarry: [B + 5, c, 4, 0], granite: [B + 7, c + 5, 3, 0], copper: [B + 8, c + 1, 3, 0], nile: [c, -10, 6, 0],
    };
    return Z[zone];
  }
  _rebuildLayout(state) {
    if (this._layoutWonder === state.wonderIndex) { this._refreshBuildings(state); return; }
    this._layoutWonder = state.wonderIndex;
    while (this.worldGroup.children.length) this.worldGroup.remove(this.worldGroup.children[0]);
    this.buildingSlots = {}; // id -> [meshes]
    this._refreshBuildings(state, true);
  }
  _refreshBuildings(state, force) {
    const g = wonderGeom(state.wonderIndex), B = g.base, off = (B - 1) / 2;
    for (const b of BUILDINGS) {
      const z = this._zoneAnchor(b.zone, B); if (!z) continue;
      const want = Math.min(state.buildings[b.id] || 0, 14);
      let arr = this.buildingSlots[b.id]; if (!arr) arr = this.buildingSlots[b.id] = [];
      while (arr.length < want) {
        const i = arr.length, col = i % z[2], row = Math.floor(i / z[2]);
        const mdl = b.cat === "resource" ? this._campModel(b.id)
          : this._buildingModel(b.zone === "nile" ? "house" : b.id === "granary" ? "granary" : b.cat === "machine" ? "ramp" : b.zone === "village" ? "house" : b.zone);
        mdl.position.set((z[0] + col * 1.7) - off, 0, (z[1] + row * 1.7) - off);
        mdl.rotation.y = (i * 1.3) % TAU * 0.1;
        this.worldGroup.add(mdl); arr.push(mdl);
      }
      while (arr.length > want) { const mm = arr.pop(); this.worldGroup.remove(mm); }
    }
    // camps near ramp
    if (!this._camps) { this._camps = []; for (let i = 0; i < 5; i++) { const t = this._buildingModel("camp"); t.position.set((B * 0.5 - 2 + i) - off, 0, (B + 3) - off); this.worldGroup.add(t); this._camps.push(t); } }
  }

  // ---------- procedural resource map (nodes you tap to harvest) ----------
  _nodeModel(t) {
    const grp = new THREE.Group();
    if (t === "tree") {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6), this._mat(0x7c5530)); tr.position.y = 0.45; tr.castShadow = true; grp.add(tr);
      const f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), this._mat(0x4f8a3a)); f1.position.y = 1.05; f1.castShadow = true; grp.add(f1);
      const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), this._mat(0x5f9a44)); f2.position.y = 1.5; f2.castShadow = true; grp.add(f2);
      grp._harvest = [f1, f2];
    } else if (t === "rock") {
      const a = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), this._mat(0xdac7a0)); a.position.y = 0.4; a.castShadow = true; grp.add(a);
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), this._mat(0xc9b487)); b.position.set(0.5, 0.26, 0.18); b.castShadow = true; grp.add(b);
      grp._harvest = [a, b];
    } else if (t === "crop") {
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.1), this._mat(0x6b4a2c)); soil.position.y = 0.06; soil.receiveShadow = true; grp.add(soil);
      const blades = []; for (let i = 0; i < 5; i++) { const bl = this._box(0.1, 0.5, 0.1, i % 2 ? 0x9bbf3e : 0xd9b24a, 0); bl.position.set((i - 2) * 0.22, 0.25, (i % 2) * 0.2 - 0.1); blades.push(bl); grp.add(bl); }
      grp._harvest = blades;
    } else if (t === "water") {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), new THREE.MeshStandardMaterial({ color: 0x49b5d6, roughness: 0.25, metalness: 0.1 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.09; grp.add(disc);
      const reeds = []; for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.7, 4), this._mat(0x4f8a3a)); const a = i / 4 * TAU; r.position.set(Math.cos(a) * 0.5, 0.35, Math.sin(a) * 0.5); r.castShadow = true; reeds.push(r); grp.add(r); }
      grp._harvest = reeds;
    } else if (t === "granite") {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), this._mat(0x9a7a8e)); m.position.y = 0.45; m.castShadow = true; grp.add(m); grp._harvest = [m];
    } else { // copper
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), this._mat(0x8a7458)); m.position.y = 0.42; m.castShadow = true; grp.add(m);
      const o = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 5), this._mat(0x3fae9a)); o.position.y = 0.72; grp.add(o); grp._harvest = [m, o];
    }
    return grp;
  }

  _buildNodes(state) {
    const g = wonderGeom(state.wonderIndex);
    const key = (state.seed >>> 0) + "/" + state.wonderIndex;
    if (this._nodeKey === key && this.nodes.length) return;
    this._nodeKey = key;
    while (this.nodeGroup.children.length) this.nodeGroup.remove(this.nodeGroup.children[0]);
    this.nodes = [];
    for (const nd of genNodes(state.seed >>> 0, g.base)) {
      const grp = this._nodeModel(nd.t);
      grp.position.set(nd.x, 0, nd.z); grp.rotation.y = nd.rot; grp.scale.setScalar(nd.s);
      this.nodeGroup.add(grp);
      this.nodes.push({ grp, t: nd.t, res: nd.res, x: nd.x, z: nd.z, charge: 1, bounce: 0, harvest: grp._harvest || [] });
    }
  }

  _updateNodes(dt) {
    const REGEN = 9;
    this.nodeHits = [];
    for (const n of this.nodes) {
      if (n.charge < 1) n.charge = Math.min(1, n.charge + dt / REGEN);
      if (n.bounce > 0) n.bounce -= dt;
      const grow = 0.35 + 0.65 * n.charge;
      for (const h of n.harvest) h.scale.setScalar(grow);
      n.grp.position.y = n.bounce > 0 ? Math.sin(n.bounce * 26) * 0.1 * n.bounce : 0;
      this._tmpV.set(n.x, 0.6, n.z).project(this.cam);
      if (this._tmpV.z < 1) this.nodeHits.push({ x: (this._tmpV.x * 0.5 + 0.5) * this.vw, y: (-this._tmpV.y * 0.5 + 0.5) * this.vh, n });
    }
  }

  // tap → harvest the nearest charged node under the pointer (returns it, or null)
  harvestAt(sx, sy) {
    let best = null, bd = 72 * 72;
    for (const h of this.nodeHits) { const d = (h.x - sx) ** 2 + (h.y - sy) ** 2; if (d < bd && h.n.charge > 0.5) { bd = d; best = h; } }
    if (!best) return null;
    const n = best.n, charge = n.charge, col = NODE_COL[n.res] || 0xffffff;
    n.charge = 0.06; n.bounce = 0.5;
    this.spawnChips(new THREE.Vector3(n.x, 0.6, n.z), col, 11);
    this.ring(new THREE.Vector3(n.x, 0.05, n.z), col);
    this._rallyGatherers(n);
    this.kick(0.12);
    return { res: n.res, charge, sx: best.x, sy: best.y };
  }

  // ---------- gatherers (walk camp ↔ node, harvest, carry back) ----------
  _campPos(res, B, off) {
    const zone = { wood: "lumber", limestone: "quarry", food: "farm", water: "well", granite: "granite", copper: "copper" }[res] || "village";
    const z = this._zoneAnchor(zone, B) || [0, 0, 1, 0];
    return new THREE.Vector3(z[0] - off + 0.7, 0, z[1] - off + 0.7);
  }
  _nearestNode(res, from) {
    let best = null, bd = 1e9;
    for (const n of this.nodes) { if (n.res !== res) continue; const d = (n.x - from.x) ** 2 + (n.z - from.z) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  _makeGatherer(res) {
    const w = this._makeWorker();
    w.grp.scale.setScalar(0.72);
    if (w.block) w.block.material.color.setHex(NODE_COL[res] || 0xcfcfcf);
    w.res = res; w.gstate = "toNode"; w.node = null; w.gtimer = 0; w.home = null;
    return w;
  }
  _stepToward(cur, aim, step) {
    const dx = aim.x - cur.x, dz = aim.z - cur.z, d = Math.hypot(dx, dz);
    if (d <= Math.max(0.35, step)) return true;
    cur.x += dx / d * step; cur.z += dz / d * step; return false;
  }
  _rallyGatherers(node) {
    let k = 0;
    for (const w of this.gatherers) if (w.res === node.res && w.gstate !== "harvest") { w.node = node; w.gstate = "toNode"; if (++k >= 3) break; }
  }
  _updateGatherers(state, stats, dt) {
    const g = wonderGeom(state.wonderIndex), B = g.base, off = (B - 1) / 2;
    const want = {};
    for (const b of BUILDINGS) {
      if (b.cat !== "resource" || !b.effect.produce) continue;
      const res = Object.keys(b.effect.produce)[0], camps = state.buildings[b.id] || 0;
      if (camps > 0 && this.nodes.some((n) => n.res === res)) want[res] = Math.min(3, 1 + Math.floor(camps / 3));
    }
    let sum = 0; for (const k in want) sum += want[k];
    const CAP = 12; if (sum > CAP) for (const k in want) want[k] = Math.max(1, Math.round(want[k] * CAP / sum));
    const have = {}; for (const w of this.gatherers) have[w.res] = (have[w.res] || 0) + 1;
    for (const res in want) while ((have[res] || 0) < want[res]) { const w = this._makeGatherer(res); this.gathererGroup.add(w.grp); this.gatherers.push(w); have[res] = (have[res] || 0) + 1; }
    for (const res in have) { let extra = have[res] - (want[res] || 0); for (let i = this.gatherers.length - 1; i >= 0 && extra > 0; i--) if (this.gatherers[i].res === res) { this.gathererGroup.remove(this.gatherers[i].grp); this.gatherers.splice(i, 1); extra--; } }

    const whip = !!(state.whip && state.whip.boostT > 0);
    const sp = (2.0 + Math.min(3, (stats.buildRate || 0) * 0.05)) * (whip ? 1.3 : 1) * dt;
    for (const w of this.gatherers) {
      w.phase += dt;
      if (!w.home) w.home = this._campPos(w.res, B, off);
      if (!w.node) w.node = this._nearestNode(w.res, w.home);
      const np = w.node ? this._tmpV2.set(w.node.x, 0, w.node.z) : w.home;
      let walk = 0, carry = false, chop = 0;
      if (w.gstate === "toNode") { walk = 1; this._face(w, np); if (this._stepToward(w.grp.position, np, sp)) { w.gstate = "harvest"; w.gtimer = 1.0 + Math.random() * 0.7; } }
      else if (w.gstate === "harvest") { chop = 1; w.gtimer -= dt; if (w.node && Math.random() < dt * 5) w.node.bounce = 0.22; if (w.gtimer <= 0) w.gstate = "toCamp"; }
      else if (w.gstate === "toCamp") { walk = 1; carry = true; this._face(w, w.home); if (this._stepToward(w.grp.position, w.home, sp)) { w.gstate = "deposit"; w.gtimer = 0.4; } }
      else { w.gtimer -= dt; if (w.gtimer <= 0) { w.gstate = "toNode"; w.node = this._nearestNode(w.res, w.home); } }
      const swing = Math.sin(w.phase * 9) * (walk ? 0.8 : 0.05);
      const bend = chop ? Math.abs(Math.sin(w.phase * 11)) * 0.6 : 0;
      w.legL.rotation.x = swing; w.legR.rotation.x = -swing;
      w.armL.rotation.x = carry ? -2.0 : chop ? -1.7 - bend : -swing;
      w.armR.rotation.x = carry ? -2.0 : chop ? -1.7 - bend : swing;
      w.body.rotation.x = chop ? 0.3 : 0;
      w.block.visible = carry; w.grp.position.y = 0;
    }
  }
  _face(w, aim) { w.grp.rotation.y = Math.atan2(aim.x - w.grp.position.x, aim.z - w.grp.position.z); }

  // ---------- worker model ----------
  _makeWorker() {
    const i = (Math.random() * SKINS.length) | 0;
    const skin = this._mat(SKINS[i]), cloth = this._mat(CLOTHS[(Math.random() * CLOTHS.length) | 0]), kilt = this._mat(0xefe7d2);
    const grp = new THREE.Group();
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), skin); legL.geometry.translate(0, -0.25, 0); legL.position.set(0.1, 0.5, 0); legL.castShadow = true;
    const legR = legL.clone(); legR.position.x = -0.1;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.24), skin); body.position.y = 0.74; body.castShadow = true;
    const kiltM = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.28), kilt); kiltM.position.y = 0.56;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.26), skin); head.position.y = 1.12; head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.3), cloth); cap.position.y = 1.26;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), skin); armL.geometry.translate(0, -0.21, 0); armL.position.set(0.26, 0.96, 0); armL.castShadow = true;
    const armR = armL.clone(); armR.position.x = -0.26;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), this._mat(0xe3d3aa)); block.position.set(0, 1.4, 0.05); block.visible = false; block.castShadow = true;
    grp.add(legL, legR, body, kiltM, head, cap, armL, armR, block);
    grp.scale.setScalar(0.8);
    return { grp, legL, legR, armL, armR, block, body, head,
      state: "fetch", target: -1, p: 0, phase: Math.random() * TAU, timer: Math.random() * 1.2, placed: false,
      lane: (Math.random() - 0.5) * 3.2, foot: Math.random() * 4, whipT: 0 };
  }

  // ---------- animal models ----------
  _makeAnimal(type) {
    const grp = new THREE.Group();
    let bodyCol = 0x8a6b46, h = 0.5;
    if (type === "elephant") { bodyCol = 0x9aa0a8; h = 0.7; } else if (type === "croc") { bodyCol = 0x5f7d4a; h = 0.28; }
    const bodyMat = this._mat(bodyCol);
    const body = new THREE.Mesh(new THREE.BoxGeometry(type === "croc" ? 1.6 : 1.2, h, type === "croc" ? 0.5 : 0.7), bodyMat);
    body.position.y = type === "croc" ? 0.3 : h * 0.5 + 0.45; body.castShadow = true; grp.add(body);
    const legs = [];
    const legLen = type === "croc" ? 0.28 : (type === "elephant" ? 0.7 : 0.5);
    for (const sx of [0.45, -0.45]) for (const sz of [0.22, -0.22]) {
      const lg = new THREE.Mesh(new THREE.BoxGeometry(type === "elephant" ? 0.2 : 0.13, legLen, type === "elephant" ? 0.2 : 0.13), bodyMat);
      lg.geometry.translate(0, -legLen / 2, 0); lg.position.set(sx * (type === "croc" ? 1.6 : 1.1), legLen, sz); lg.castShadow = true; grp.add(lg); legs.push(lg);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(type === "elephant" ? 0.7 : 0.5, type === "croc" ? 0.3 : 0.5, type === "croc" ? 0.7 : 0.5), bodyMat);
    head.position.set((type === "croc" ? 1.0 : 0.7), body.position.y + (type === "croc" ? 0 : 0.1), 0); head.castShadow = true; grp.add(head);
    if (type === "ox") { for (const s of [0.12, -0.12]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), this._mat(0xefe7d0)); horn.position.set(0.85, body.position.y + 0.35, s); horn.rotation.z = -0.5; grp.add(horn); } }
    if (type === "elephant") { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6), bodyMat); tr.position.set(1.05, body.position.y - 0.1, 0); tr.rotation.z = 0.7; grp.add(tr); }
    return { grp, legs, type, t: Math.random(), sp: 0.04 + Math.random() * 0.04, phase: Math.random() * TAU };
  }

  // ---------- fx ----------
  spawnDust(pos, n) {
    for (let i = 0; i < n; i++) {
      let s = this.puffs.find((p) => !p.sp.visible);
      if (!s) { if (this.puffs.length > 60) continue; const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._dustTex, transparent: true, depthWrite: false })); this.fxGroup.add(sprite); s = { sp: sprite, life: 0, v: new THREE.Vector3() }; this.puffs.push(s); }
      s.sp.visible = true; s.sp.position.copy(pos); s.life = 0.5 + Math.random() * 0.3;
      s.v.set((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2);
      s.sp.scale.setScalar(0.5 + Math.random() * 0.5);
    }
  }
  ring(pos, color) {
    let r = this.rings.find((x) => !x.m.visible);
    if (!r) { const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 24), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; this.fxGroup.add(m); r = { m }; this.rings.push(r); }
    r.m.material.color.set(color); r.m.visible = true; r.m.position.copy(pos); r.m.scale.setScalar(1); r.life = 1;
  }
  // little resource cubes that pop out of a node on harvest
  spawnChips(pos, color, n) {
    if (!this._chipGeo) this._chipGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    for (let i = 0; i < n; i++) {
      let c = this.chips.find((x) => !x.m.visible);
      if (!c) { if (this.chips.length > 44) break; const m = new THREE.Mesh(this._chipGeo, new THREE.MeshStandardMaterial({ flatShading: true })); m.castShadow = true; this.fxGroup.add(m); c = { m, v: new THREE.Vector3(), life: 0 }; this.chips.push(c); }
      c.m.visible = true; c.m.material.color.setHex(color); c.m.position.copy(pos);
      c.v.set((Math.random() - 0.5) * 4.5, 3 + Math.random() * 3.5, (Math.random() - 0.5) * 4.5);
      c.life = 0.55 + Math.random() * 0.35; c.m.scale.setScalar(0.6 + Math.random() * 0.9);
      c.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    }
  }
  celebrateLayer() { if (this._topW) { this.ring(this._topW, 0xffe39a); this.spawnDust(this._topW, 16); } this.kick(0.6); }
  kick(p) { this.shake = Math.min(1.4, this.shake + p); }
  whipAt(sx, sy) {
    let best = null, bd = 1e9;
    for (const h of this.workerHits) { const d = (h.x - sx) ** 2 + (h.y - sy) ** 2; if (d < bd) { bd = d; best = h; } }
    if (best && bd < 90 * 90) { best.w.whipT = 2.6; this.spawnDust(best.w.grp.position.clone().setY(0.5), 5); this.ring(best.w.grp.position.clone().setY(0.1), 0xffd27a); }
    this.kick(0.25);
  }

  _updateCamera(vw, vh, state) {
    const g = wonderGeom(state.wonderIndex);
    const view = (g.base * 1.95) / this.zoom;
    const aspect = vw / vh;
    this.cam.left = -view * aspect / 2; this.cam.right = view * aspect / 2; this.cam.top = view / 2; this.cam.bottom = -view / 2;
    this.cam.updateProjectionMatrix();
    const tgt = this._tmpV.set(0, g.layers * 0.3, 1);
    const wpp = view / vh;
    tgt.x += -this.pan.x * wpp; tgt.z += this.pan.y * wpp * 0.6; tgt.y += this.pan.y * wpp * 0.4;
    let shx = 0, shy = 0; if (this.shake > 0.01) { shx = (Math.random() - 0.5) * this.shake; shy = (Math.random() - 0.5) * this.shake; this.shake *= 0.86; }
    const dir = new THREE.Vector3(0.82, 1.2, 0.98).normalize();
    this.cam.position.copy(tgt).addScaledVector(dir, 84).add(new THREE.Vector3(shx, 0, shy));
    this.cam.lookAt(tgt.x + shx, tgt.y, tgt.z + shy);
  }

  frame(state, stats, dt, vw, vh) {
    this._resize(vw, vh);
    this._buildPyramid(state);
    this._rebuildLayout(state);
    this._buildNodes(state);

    // day/night sky + sun — start the world in bright mid-morning (+0.22 offset)
    const phase = ((state.clock + DAY_LEN * 0.22) % DAY_LEN) / DAY_LEN, sk = skyAt(phase);
    this.skyMat.uniforms.top.value.setHex(sk.top); this.skyMat.uniforms.bot.value.setHex(sk.bot);
    this.scene.fog.color.setHex(sk.bot);
    this.hemi.intensity = 0.65 + sk.amb * 0.5; this.sun.color.setHex(sk.sun); this.sun.intensity = 0.7 + sk.amb;
    const sa = phase * TAU; this.sun.position.set(Math.cos(sa) * 60, 42 + Math.sin(sa) * 40, 34); this.sun.target.position.set(0, 0, 0);

    this._updateCamera(vw, vh, state);
    this._updatePyramid(state);
    this._updateWorkers(state, stats, dt);
    this._updateGatherers(state, stats, dt);
    this._updateNodes(dt);
    this._updateAnimals(state, stats, dt);
    this._updateFx(dt);

    this.r.render(this.scene, this.cam);
  }

  _updatePyramid(state) {
    const g = wonderGeom(state.wonderIndex);
    const completedCubes = this.layerPrefix[Math.min(state.layer, g.layers)] || 0;
    const activeCells = state.complete ? 0 : (layerCells(g.base, state.layer).length);
    // reveal driven by worker deliveries (this.shown); recomputed/snapped in _updateWorkers
    const count = state.complete ? this.pyrMats.length : completedCubes + Math.min(this.shown, activeCells);
    if (this.pyramid) this.pyramid.count = Math.max(0, Math.min(this.pyrMats.length, count));
    if (this.capstone) {
      this.capstone.visible = state.complete;
      if (state.complete) { this.capstone.rotation.y += 0.01; this.capstone.material.emissiveIntensity = 0.5 + 0.3 * Math.sin(state.clock * 3); }
    }
  }

  _updateWorkers(state, stats, dt) {
    const g = wonderGeom(state.wonderIndex), B = g.base, off = (B - 1) / 2;
    const key = state.wonderIndex + "/" + state.layer + "/" + (state.complete ? "c" : "b");
    if (this.revealKey !== key) { this.revealKey = key; this.shown = 0; for (const w of this.workers) { w.state = "fetch"; w.timer = Math.random() * 1.0; w.placed = false; } }
    const cells = state.complete ? [] : layerCells(g.base, state.layer);
    // cubes that *should* be visible given sim progress; reveal never outruns this
    const bpc = Math.max(1, g.blocksPerCube || 1);
    const real = state.complete ? 0 : Math.min(cells.length, Math.floor(state.blocksInLayer / bpc));
    if (this.shown > real) this.shown = real;                              // layer reset / rollback
    if (real - this.shown > Math.max(3, cells.length * 0.3)) this.shown = real - Math.ceil(cells.length * 0.12); // catch up if workers lag

    const target = state.complete ? 7 : Math.max(4, Math.min(18, Math.round((stats.builders || 3) + 1)));
    while (this.workers.length < target) { const w = this._makeWorker(); this.workerGroup.add(w.grp); this.workers.push(w); }
    while (this.workers.length > target) { const w = this.workers.pop(); this.workerGroup.remove(w.grp); }

    const whip = !!(state.whip && state.whip.boostT > 0);
    const moveBase = 0.5 + Math.min(2.0, (stats.buildRate || 0) * 0.045);

    // ramp foot (front, ground) and head (current build top, front-center)
    const footX = -off + B * 0.5, footZ = -off + B + 2.2;
    const topY = state.complete ? g.layers : state.layer;
    const headZ = -off + (state.complete ? B * 0.5 : (state.layer + Math.max(1, B - 2 * state.layer) * 0.5));
    this._topW = new THREE.Vector3(0, topY + 0.5, Math.max(-off + 0.5, headZ));

    this.workerHits = [];
    for (const w of this.workers) {
      w.phase += dt; if (w.whipT > 0) w.whipT -= dt;
      const ms = moveBase * (w.whipT > 0 ? 2.3 : 1) * (whip ? 1.3 : 1);
      let px, py, pz, walk = 0, carry = false, bend = 0;
      if (w.state === "fetch") {
        // queue at the foot, mill, then head up — the site stays busy even when the build is slow
        w.timer -= dt;
        px = footX + w.lane; py = 0; pz = footZ + w.foot; walk = 0.18;
        if (w.timer <= 0 && !state.complete && cells.length) { w.state = "haul"; w.p = 0; w.placed = false; }
      } else if (w.state === "haul") {
        w.p += ms * dt * 0.5; if (w.p >= 1) { w.p = 1; w.state = "place"; w.timer = 0.5 / (w.whipT > 0 ? 1.6 : 1); w.placed = false; }
        px = footX + (1 - w.p) * w.lane; py = topY * w.p; pz = footZ + (this._topW.z - footZ) * w.p; carry = true; walk = 1;
        if (Math.random() < dt * 3 * ms) this.spawnDust(new THREE.Vector3(px, py + 0.1, pz), 1);
      } else if (w.state === "place") {
        w.timer -= dt; const pr = 1 - Math.max(0, w.timer) / 0.5;
        px = w.lane * 0.12; py = topY; pz = this._topW.z; bend = Math.sin(Math.min(1, pr) * Math.PI); carry = pr < 0.55;
        // a delivered block only appears if the sim has paid for it (no teleporting bricks)
        if (!w.placed && pr > 0.5) { w.placed = true; if (this.shown < real) { this.shown++; this.spawnDust(this._topW.clone(), 6); } else this.spawnDust(this._topW.clone(), 2); }
        if (w.timer <= 0) { w.state = "return"; w.p = 1; }
      } else { // return
        w.p -= ms * dt * 0.9; if (w.p <= 0) { w.p = 0; w.state = "fetch"; w.timer = 0.3 + Math.random() * 0.9; }
        px = footX + (1 - w.p) * w.lane; py = topY * w.p; pz = footZ + (this._topW.z - footZ) * w.p; walk = 1;
      }
      w.grp.position.set(px, py, pz);
      // face direction of travel (toward the build when hauling, away when returning)
      w.grp.rotation.y = (w.state === "haul" || w.state === "place") ? Math.atan2(0 - px, this._topW.z - pz) : Math.atan2(px - 0, pz - this._topW.z);
      const sw = Math.sin(w.phase * 8) * (walk ? 0.7 * walk + 0.15 : 0.05);
      w.legL.rotation.x = sw; w.legR.rotation.x = -sw;
      w.armL.rotation.x = carry ? -2.2 : -sw; w.armR.rotation.x = carry ? -2.2 : sw;
      w.body.rotation.x = bend * 0.9; w.block.visible = carry;
      w.grp.position.y += bend * -0.15;
      if (w.whipT > 0) w.grp.position.y += Math.abs(Math.sin(w.phase * 20)) * 0.05;

      // project to screen for whip hit-testing
      this._tmpV.set(px, py + 0.6, pz).project(this.cam);
      this.workerHits.push({ x: (this._tmpV.x * 0.5 + 0.5) * this.vw, y: (-this._tmpV.y * 0.5 + 0.5) * this.vh, w });
    }
  }

  _updateAnimals(state, stats, dt) {
    const g = wonderGeom(state.wonderIndex), B = g.base, off = (B - 1) / 2;
    let machines = 0; for (const id of ["wooden_rollers", "rope_winch", "sled", "crane", "lubrication", "massive_ramp", "elevator", "marvel"]) machines += state.buildings[id] || 0;
    const target = Math.min(6, 1 + Math.floor(machines / 3));
    while (this.animals.length < target) { const a = this._makeAnimal(["ox", "ox", "elephant", "croc"][this.animals.length % 4]); this.animalGroup.add(a.grp); this.animals.push(a); }
    while (this.animals.length > target) { const a = this.animals.pop(); this.animalGroup.remove(a.grp); }
    const speed = 0.3 + Math.min(1.2, (stats.buildRate || 0) * 0.03);
    const rad = B * 0.72 + 4;
    for (let idx = 0; idx < this.animals.length; idx++) {
      const a = this.animals[idx];
      a.t += a.sp * speed * dt; if (a.t > 1) a.t -= 1;
      let x, y = 0, z, ang, gait = 0;
      if (a.type === "croc") { // glide along the Nile water (smooth, never stuck)
        const e = a.t * TAU; x = Math.sin(e) * 22; z = -32 + Math.sin(e * 2 + idx) * 3.5;
        ang = (Math.cos(e) >= 0 ? 1 : -1) * Math.PI / 2 + Math.sin(e * 2) * 0.2;
        y = Math.sin(a.t * 30 + a.phase) * 0.04; // gentle bob on the water
      } else { // smooth ellipse loop around the site, tangent-aligned, with a walk bounce
        const e = a.t * TAU + idx * 1.7;
        x = Math.cos(e) * rad; z = Math.sin(e) * (rad * 0.7) + 3;
        ang = -e + Math.PI / 2; // tangent to the ellipse → always faces travel, no snapping
        gait = Math.abs(Math.sin(a.t * 40 + a.phase));
        y = gait * (a.type === "elephant" ? 0.05 : 0.09); // hoof bounce
      }
      a.grp.position.set(x, y, z); a.grp.rotation.y = ang;
      a.grp.rotation.z = a.type === "croc" ? 0 : Math.sin(a.t * 40 + a.phase) * 0.03; // subtle body sway
      const sw = Math.sin((a.t * 40 + a.phase)) * 0.5;
      a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw; a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw;
    }
  }

  _updateFx(dt) {
    for (const p of this.puffs) { if (!p.sp.visible) continue; p.life -= dt; if (p.life <= 0) { p.sp.visible = false; continue; } p.sp.position.addScaledVector(p.v, dt); p.v.y -= 4 * dt; p.sp.material.opacity = Math.min(0.8, p.life); p.sp.scale.addScalar(dt * 0.8); }
    for (const r of this.rings) { if (!r.m.visible) continue; r.life -= dt * 1.4; if (r.life <= 0) { r.m.visible = false; continue; } r.m.scale.addScalar(dt * 10); r.m.material.opacity = Math.max(0, r.life) * 0.6; }
    for (const c of this.chips) { if (!c.m.visible) continue; c.life -= dt; if (c.life <= 0) { c.m.visible = false; continue; } c.v.y -= 11 * dt; c.m.position.addScaledVector(c.v, dt); if (c.m.position.y < 0.06) { c.m.position.y = 0.06; c.v.y *= -0.4; c.v.x *= 0.6; c.v.z *= 0.6; } c.m.rotation.x += dt * 6; c.m.rotation.y += dt * 5; }
  }
}
