// Real 3D low-poly renderer (Three.js, vendored). Lit, shadowed scene:
// instanced pyramid, low-poly facilities, animated workers that haul blocks up
// the ramp (no teleport), animals on smooth looped paths. Same interface as the
// old Canvas2D renderer so main.js is unchanged except the import.
import * as THREE from "../vendor/three.module.js";
import { wonderFor, wonderGeom, BUILDINGS, genNodes, buildableTiles, TILE, PLACEABLE, SIZE, footprintCells, RES_META } from "./data.js";
import { layerCells } from "./iso.js";

const BUILD_BY_ID = {}; for (const b of BUILDINGS) BUILD_BY_ID[b.id] = b;
const RES_OF = { quarry: "limestone", lumber_camp: "wood", farm: "food", well: "water", granite_mine: "granite", copper_mine: "copper" };
const ID_OF_RES = { limestone: "quarry", wood: "lumber_camp", food: "farm", water: "well", granite: "granite_mine", copper: "copper_mine" };

export const DAY_LEN = 240;
const TAU = Math.PI * 2;
const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }; // smoothstep ease

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
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.2;
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
    // Nile — sandy bank + deep water + a lighter shallow band along the shore
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(260, 44), new THREE.MeshStandardMaterial({ color: 0xceac70, roughness: 1 }));
    bank.rotation.x = -Math.PI / 2; bank.position.set(0, 0.02, -35); bank.receiveShadow = true; scene.add(bank);
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(244, 24), new THREE.MeshStandardMaterial({ color: 0x2f86c2, roughness: 0.14, metalness: 0.28 }));
    deep.rotation.x = -Math.PI / 2; deep.position.set(0, 0.06, -35); scene.add(deep); this.nile = deep;
    const shallow = new THREE.Mesh(new THREE.PlaneGeometry(244, 7), new THREE.MeshStandardMaterial({ color: 0x74cdec, roughness: 0.2, metalness: 0.18, transparent: true, opacity: 0.85 }));
    shallow.rotation.x = -Math.PI / 2; shallow.position.set(0, 0.075, -23.5); scene.add(shallow); this.nileShallow = shallow;
    // blocky papyrus reeds clustered along the near bank
    const reeds = new THREE.Group();
    for (let i = 0; i < 24; i++) {
      const clump = new THREE.Group(), n = 2 + (Math.random() * 3 | 0);
      for (let j = 0; j < n; j++) {
        const h = 1.0 + Math.random() * 0.9, st = new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.09), this._mat(0x6fa83a));
        st.position.set((Math.random() - 0.5) * 0.5, h / 2, (Math.random() - 0.5) * 0.5); st.castShadow = true; clump.add(st);
        const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), this._mat(0x9a7a38)); tuft.position.set(st.position.x, h, st.position.z); clump.add(tuft);
      }
      clump.position.set((Math.random() - 0.5) * 150, 0, -22 - Math.random() * 2.5); reeds.add(clump);
    }
    scene.add(reeds);

    // groups
    this.gridGroup = new THREE.Group(); scene.add(this.gridGroup);   // buildable tile lattice
    this.decorGroup = new THREE.Group(); scene.add(this.decorGroup); // scattered desert rocks
    this.worldGroup = new THREE.Group(); scene.add(this.worldGroup); // tile-placed buildings
    this.billboardGroup = new THREE.Group(); scene.add(this.billboardGroup); // produce/tier badges
    this.nodeGroup = new THREE.Group(); scene.add(this.nodeGroup);   // procedural resource map (trees/rocks/...)
    this.supplyGroup = new THREE.Group(); scene.add(this.supplyGroup); // sleds + stone-cutting yard
    this.workerGroup = new THREE.Group(); scene.add(this.workerGroup);
    this.gathererGroup = new THREE.Group(); scene.add(this.gathererGroup);
    this.animalGroup = new THREE.Group(); scene.add(this.animalGroup);
    this.fxGroup = new THREE.Group(); scene.add(this.fxGroup);

    // shared resources
    this.cubeGeo = new THREE.BoxGeometry(0.97, 1, 0.97);
    this.workers = []; this.animals = []; this.puffs = []; this.rings = []; this.chips = [];
    this.gatherers = []; this.nodes = []; this.nodeHits = []; this._nodeKey = "";
    this.sleds = []; this.cutter = null; this._supplyKey = ""; this._vZoom = 1;
    // tile-grid placement
    this.tileModels = {}; this.machineSlots = {}; this.plops = [];
    this._gridKey = ""; this._decorKey = ""; this._buildSet = new Set(); this._occupied = new Set(); this._nodeTiles = new Set();
    this._ray = new THREE.Raycaster(); this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hi = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.96, TILE * 0.96), new THREE.MeshBasicMaterial({ color: 0x6fe06f, transparent: true, opacity: 0.42, depthWrite: false }));
    hi.rotation.x = -Math.PI / 2; hi.position.y = 0.05; hi.visible = false; scene.add(hi); this.tileHi = hi;
    this._dustTex = this._softTex();
    this._black = new THREE.MeshStandardMaterial({ color: 0x15151b, roughness: 0.5 }); // dot eyes
    this._eyeGeo = new THREE.BoxGeometry(0.06, 0.08, 0.04);
    this._wonderBuilt = -1; this._layoutWonder = -1;
    this._tmpV = new THREE.Vector3(); this._tmpV2 = new THREE.Vector3();
  }

  // low-contrast 2-tone sand tiles → a Clash-of-Clans style grid underfoot
  _tileTex() {
    // soft speckled warm sand (the build grid is drawn separately, so no checker)
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#dcbb7d"; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 64, y = Math.random() * 64, r = Math.random() * 1.5 + 0.3;
      g.fillStyle = Math.random() < 0.5 ? "rgba(168,134,80,0.22)" : "rgba(236,212,158,0.30)";
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(55, 55);
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
    else if (type === "market") {
      add(this._box(1.3, 0.7, 1.3, 0xb08a5a));
      for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) { const post = this._box(0.08, 1.05, 0.08, 0x7c5530, 0.52); post.position.x = x; post.position.z = z; grp.add(post); }
      const aw = this._box(2.0, 0.12, 2.0, 0xcf5b4a, 1.05); grp.add(aw);                         // striped awning
      for (let i = -1; i <= 1; i++) { const stripe = this._box(0.32, 0.14, 2.0, 0xe8c84a, 1.06); stripe.position.x = i * 0.66; grp.add(stripe); }
      const crate = this._box(0.32, 0.32, 0.32, 0x9a6b3a, 0.16); crate.position.set(0.5, 0.16, 0.5); grp.add(crate);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.32, 8), this._mat(0xc77b46)); pot.position.set(-0.5, 0.16, 0.5); pot.castShadow = true; grp.add(pot);
    }
    else if (type === "temple") {
      add(this._box(3, 1.4, 2.2, 0xe6dcc0));
      for (let i = -1; i <= 1; i += 2) for (let k = -1; k <= 1; k += 2) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.8, 9), this._mat(0xefe7cf)); col.position.set(i * 1.25, 0.9, k * 0.9); col.castShadow = true; grp.add(col); }
      const cornice = this._box(3.45, 0.28, 2.65, 0xcaa6df, 1.55); grp.add(cornice);             // flared cornice
      const roof = this._box(3.05, 0.22, 2.3, 0xb98fce, 1.78); grp.add(roof);
      const door = this._box(0.62, 0.95, 0.12, 0x2a2233, 0.48); door.position.set(0, 0.48, 1.14); grp.add(door);
      for (let i = 0; i < 2; i++) { const st = this._box(1.5 - i * 0.34, 0.16, 0.32, 0xd8cdb0, 0.08 + i * 0.16); st.position.set(0, 0.08 + i * 0.16, 1.28 - i * 0.16); grp.add(st); }
    }
    else if (type === "storage") {
      add(this._box(1.7, 0.28, 1.7, 0xc7ab7c, 0.14));                                            // platform
      for (let i = 0; i < 3; i++) { const h = 0.5 + i * 0.12; const b = this._box(0.46, h, 0.46, 0xe3d3aa, 0.28 + h / 2); b.position.set((i - 1) * 0.52, 0.28 + h / 2, -0.32); grp.add(b); }
      for (let i = 0; i < 2; i++) { const sack = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), this._mat(0xcaa067)); sack.scale.y = 1.25; sack.position.set(i ? 0.45 : -0.45, 0.6, 0.5); sack.castShadow = true; grp.add(sack); }
    }
    else if (type === "camp") { const t = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1, 4), this._mat(0xd9c39a)); t.position.y = 0.5; t.rotation.y = Math.PI / 4; t.castShadow = true; grp.add(t); }
    else if (type === "granary") {
      add(this._box(1.6, 0.4, 1.6, 0xbf9a6a, 0.2));                                              // mud platform
      for (const [sx, sz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
        const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.38, 1.0, 12), this._mat(0xd8b87f)); silo.position.set(sx, 0.9, sz); silo.castShadow = true; grp.add(silo);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 7, 0, TAU, 0, Math.PI / 2), this._mat(0xc9a868)); dome.position.set(sx, 1.4, sz); grp.add(dome);
      }
      const lad = this._box(0.06, 1.0, 0.06, 0x7c5530, 0.7); lad.position.set(0.42, 0.7, 0.82); grp.add(lad);
    }
    else { // mud-brick house (village / docks default) — detailed but blocky
      const main = this._box(1.5, 1.0, 1.4, 0xcaa074); grp.add(main);
      const annex = this._box(0.85, 0.66, 0.85, 0xbd9568, 0.33); annex.position.set(0.95, 0.33, 0.3); grp.add(annex);
      const roof = this._box(1.64, 0.14, 1.52, 0xb89b6e, 1.07); grp.add(roof);
      for (const [w, d, x, z] of [[1.64, 0.12, 0, 0.72], [1.64, 0.12, 0, -0.72], [0.12, 1.52, 0.78, 0], [0.12, 1.52, -0.78, 0]]) { const par = this._box(w, 0.22, d, 0xc7ab7c, 1.23); par.position.set(x, 1.23, z); grp.add(par); }
      for (let i = -1; i <= 1; i++) { const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.74, 5), this._mat(0x7c5530)); beam.rotation.x = Math.PI / 2; beam.position.set(i * 0.45, 1.0, 0); grp.add(beam); }
      const door = this._box(0.34, 0.56, 0.06, 0x5b3d22, 0.28); door.position.set(-0.22, 0.28, 0.71); grp.add(door);
      const lintel = this._box(0.46, 0.1, 0.09, 0x8a5e34, 0.6); lintel.position.set(-0.22, 0.6, 0.72); grp.add(lintel);
      for (const sx of [0.22, 0.5]) { const win = this._box(0.2, 0.22, 0.06, 0x3a2b1a, 0.66); win.position.set(sx, 0.66, 0.71); grp.add(win); }
    }
    return grp;
  }

  // Resource buildings render as worker camps: a tent, crates and a worked pile.
  _campModel(id) {
    const grp = new THREE.Group();
    const tentCol = { quarry: 0xe6dcc6, sand_pit: 0xe6d2a0, lumber_camp: 0xb8915a, farm: 0xcfd7a0, well: 0xbcd3df, granite_mine: 0xd8c3cc, copper_mine: 0xd9c2a6 }[id] || 0xcdb892;
    const tent = new THREE.Mesh(new THREE.ConeGeometry(0.92, 1.0, 4), this._mat(tentCol));
    tent.position.set(-0.5, 0.5, -0.45); tent.rotation.y = Math.PI / 4; tent.castShadow = true; grp.add(tent);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 5), this._mat(0x7c5530)); pole.position.set(-0.5, 0.62, -0.45); grp.add(pole);
    const flag = this._box(0.26, 0.16, 0.02, 0xc0392b, 0); flag.position.set(-0.37, 1.05, -0.45); grp.add(flag);
    const crate = this._box(0.4, 0.4, 0.4, 0xb98e54, 0.2); crate.position.set(0.55, 0.2, -0.55); grp.add(crate);
    if (id === "quarry") { for (let i = 0; i < 3; i++) { const b = this._box(0.4, 0.4, 0.4, 0xe7d6ad, 0); b.position.set(0.15 + (i % 2) * 0.48, 0.2 + (i > 1 ? 0.4 : 0), 0.5); grp.add(b); } }
    else if (id === "sand_pit") { for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.42, 6), this._mat(0xe6c878)); s.position.set(0.12 + (i % 2) * 0.46, 0.21, 0.5); s.castShadow = true; grp.add(s); } const sh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05), this._mat(0x7c5530)); sh.position.set(-0.05, 0.4, 0.52); sh.rotation.z = 0.5; grp.add(sh); }
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
  // model used when a building stands on a tile
  _placeModel(id) {
    const b = BUILD_BY_ID[id];
    if (b && b.cat === "resource") return this._campModel(id);
    if (b && b.cat === "deco") return this._decoModel(id);
    if (id === "granary") return this._buildingModel("granary");
    if (id === "market") return this._buildingModel("market");
    if (id === "temple") return this._buildingModel("temple");
    if (id === "storage_yard") return this._buildingModel("storage");
    return this._buildingModel("house"); // village, docks
  }
  // decoration models (the "Deco" build section)
  _decoModel(id) {
    const grp = new THREE.Group();
    if (id === "obelisk") {
      const base = this._box(0.7, 0.3, 0.7, 0xd8c9a6, 0.15); base.position.y = 0.15; grp.add(base);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 2.3, 4), this._mat(0xc9a86a)); sh.position.y = 1.45; sh.rotation.y = Math.PI / 4; sh.castShadow = true; grp.add(sh);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 4), this._mat(0xf3c44e)); tip.position.y = 2.75; tip.rotation.y = Math.PI / 4; grp.add(tip);
    } else if (id === "garden") {
      const soil = this._box(1.5, 0.16, 1.5, 0x6b4a2c, 0.08); grp.add(soil);
      const pool = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.7), new THREE.MeshStandardMaterial({ color: 0x49b5d6, roughness: 0.2, metalness: 0.2 })); pool.position.set(0.2, 0.18, 0.2); grp.add(pool);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 6), this._mat(0x8a5e34)); trunk.position.set(-0.4, 0.6, -0.3); trunk.castShadow = true; grp.add(trunk);
      for (let i = 0; i < 5; i++) { const fr = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 4), this._mat(0x4f9e38)); const a = i / 5 * TAU; fr.position.set(-0.4 + Math.cos(a) * 0.28, 1.15, -0.3 + Math.sin(a) * 0.28); fr.rotation.set(Math.PI / 2 - 0.5, a, 0); fr.scale.set(1, 1, 0.4); grp.add(fr); }
    } else if (id === "statue") {
      const ped = this._box(1.1, 0.4, 1.4, 0xd8c9a6, 0.2); grp.add(ped);
      const body = this._box(0.6, 0.5, 1.3, 0xcdbb8e, 0.65); grp.add(body); body.castShadow = true;
      const head = this._box(0.5, 0.5, 0.5, 0xd8c69a, 1.1); head.position.z = 0.55; grp.add(head); head.castShadow = true;
      const hd = this._box(0.6, 0.2, 0.55, 0x3a6ea5, 1.42); hd.position.z = 0.55; grp.add(hd); // nemes headdress
    } else { // brazier
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1.0, 8), this._mat(0x7c5530)); stand.position.y = 0.5; stand.castShadow = true; grp.add(stand);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.26, 0.3, 10), this._mat(0xb5894a)); bowl.position.y = 1.05; grp.add(bowl);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff6a1a, emissiveIntensity: 0.8, roughness: 0.5 })); flame.position.y = 1.45; grp.add(flame); grp._flame = flame;
    }
    return grp;
  }
  // distinct machine models (ramp equipment)
  _machineModel(id) {
    const grp = new THREE.Group();
    if (id === "wooden_rollers") {
      const plank = this._box(1.2, 0.14, 0.7, 0xb08a5a, 0.34); grp.add(plank);
      for (let i = -1; i <= 1; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.82, 8), this._mat(0x8a5e34)); log.rotation.x = Math.PI / 2; log.position.set(i * 0.4, 0.12, 0); log.castShadow = true; grp.add(log); }
      const block = this._box(0.44, 0.4, 0.44, 0xe7d6ad, 0.61); grp.add(block);
    } else if (id === "crane") {
      const post = this._box(0.16, 1.3, 0.16, 0x7c5530, 0.65); post.castShadow = true; grp.add(post);
      const beam = this._box(1.7, 0.1, 0.1, 0x8a5e34, 1.2); beam.rotation.z = -0.3; grp.add(beam);
      const cw = this._box(0.32, 0.32, 0.32, 0x9a7a8e, 0); cw.position.set(-0.75, 1.42, 0); grp.add(cw);
    } else if (id === "rope_winch") {
      for (const s of [0.3, -0.3]) { const p = this._box(0.12, 1.0, 0.12, 0x7c5530, 0.5); p.position.x = s; grp.add(p); }
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), this._mat(0x8a5e34)); wheel.rotation.z = Math.PI / 2; wheel.position.y = 0.95; wheel.castShadow = true; grp.add(wheel);
    } else { // sled / generic
      const sled = this._box(0.9, 0.16, 1.4, 0x6e4a2a, 0.2); grp.add(sled);
      for (const s of [0.4, -0.4]) { const r = this._box(0.1, 0.1, 1.5, 0x553820, 0.07); r.position.x = s; grp.add(r); }
      const block = this._box(0.5, 0.45, 0.5, 0xe3d3aa, 0.55); block.castShadow = true; grp.add(block);
    }
    return grp;
  }
  // canvas badge that floats over a building: produce colour + tier pips
  _badgeTex(res, tier) {
    if (!this._badges) this._badges = {};
    const key = res + "/" + tier; if (this._badges[key]) return this._badges[key];
    const S = 64, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d");
    // flat blocky sign matching the pixel UI: drop shadow, gold edge, dark panel
    g.fillStyle = "rgba(10,7,3,0.55)"; g.fillRect(7, 8, 54, 54);
    g.fillStyle = "#caa24a"; g.fillRect(4, 3, 56, 56);
    g.fillStyle = "#241a0e"; g.fillRect(8, 7, 48, 44);
    this._badgeIcon(g, res);                       // recognizable resource glyph
    const n = 5, pw = 7, gap = 2, x0 = 11, py = 53;
    for (let i = 0; i < n; i++) { g.fillStyle = i < tier ? "#f3c44e" : "rgba(255,255,255,0.16)"; g.fillRect(x0 + i * (pw + gap), py, pw, 6); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    this._badges[key] = t; return t;
  }
  _star(g, cx, cy, R, r, n) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) { const rad = i % 2 ? r : R, a = -Math.PI / 2 + i * Math.PI / n; const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fill();
  }
  _badgeIcon(g, res) {
    const m = RES_META[res];
    const col = res === "_boost" ? "#f3c44e" : (m ? m.color : "#dddddd");
    const dk = res === "_boost" ? "#b8862c" : (m ? m.dark : "#999999");
    if (res === "limestone") {                     // stacked cut bricks
      g.fillStyle = col; g.fillRect(14, 13, 36, 11); g.fillRect(14, 26, 36, 11);
      g.fillStyle = dk; g.fillRect(14, 24, 36, 2); g.fillRect(31, 13, 2, 11); g.fillRect(22, 26, 2, 11); g.fillRect(41, 26, 2, 11);
    } else if (res === "granite") {                // speckled block
      g.fillStyle = col; g.fillRect(15, 12, 34, 26);
      g.fillStyle = dk; for (const p of [[20, 17], [31, 15], [40, 20], [24, 29], [37, 31], [44, 25], [28, 22]]) g.fillRect(p[0], p[1], 4, 4);
    } else if (res === "wood") {                    // log with end-grain ring
      g.fillStyle = col; g.fillRect(13, 17, 38, 16);
      g.fillStyle = dk; g.fillRect(13, 22, 38, 2); g.fillRect(13, 28, 38, 2);
      g.fillStyle = "#d8a86a"; g.beginPath(); g.arc(49, 25, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = dk; g.beginPath(); g.arc(49, 25, 3, 0, Math.PI * 2); g.fill();
    } else if (res === "copper") {                  // metal ingot
      g.fillStyle = col; g.beginPath(); g.moveTo(16, 33); g.lineTo(22, 18); g.lineTo(42, 18); g.lineTo(48, 33); g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(24, 20, 16, 4);
      g.fillStyle = dk; g.fillRect(18, 30, 28, 3);
    } else if (res === "food") {                    // bread loaf
      g.fillStyle = col; g.beginPath(); g.moveTo(13, 35); g.quadraticCurveTo(13, 17, 32, 17); g.quadraticCurveTo(51, 17, 51, 35); g.closePath(); g.fill();
      g.fillStyle = dk; g.fillRect(24, 21, 3, 11); g.fillRect(31, 21, 3, 11); g.fillRect(38, 21, 3, 11);
    } else if (res === "water") {                   // droplet
      g.fillStyle = col; g.beginPath(); g.arc(32, 29, 11, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(32, 9); g.lineTo(22, 26); g.lineTo(42, 26); g.closePath(); g.fill();
      g.fillStyle = "rgba(255,255,255,0.45)"; g.beginPath(); g.arc(28, 30, 3.5, 0, Math.PI * 2); g.fill();
    } else {                                        // boost star
      g.fillStyle = col; this._star(g, 32, 25, 15, 6.5, 5);
      g.fillStyle = "rgba(255,255,255,0.4)"; this._star(g, 32, 25, 7, 3, 5);
    }
  }
  _badgeResFor(id) { const e = (BUILD_BY_ID[id] || {}).effect || {}; return e.produce ? Object.keys(e.produce)[0] : "_boost"; }
  // buildable tile lattice (rebuilt per wonder)
  _buildGrid(state) {
    const key = state.wonderIndex + "";
    if (this._gridKey === key) return;
    this._gridKey = key;
    while (this.gridGroup.children.length) this.gridGroup.remove(this.gridGroup.children[0]);
    this._buildCells = buildableTiles(wonderGeom(state.wonderIndex).base);
    this._buildSet = new Set(this._buildCells.map((c) => c.gx + "," + c.gz));
    const pos = [], h = TILE / 2 - 0.05, y = 0.03;
    for (const c of this._buildCells) {
      const x = c.gx * TILE, z = c.gz * TILE;
      pos.push(x - h, y, z - h, x + h, y, z - h, x + h, y, z - h, x + h, y, z + h, x + h, y, z + h, x - h, y, z + h, x - h, y, z + h, x - h, y, z - h);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.gridGroup.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x70593a, transparent: true, opacity: 0.3 })));
  }
  // ---- scattered greenery / rocks to make the world lush & polished ----
  _palm() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 2.0, 6), this._mat(0x8a5e34)); trunk.position.y = 1.0; trunk.rotation.z = (Math.random() - 0.5) * 0.3; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i++) { const fr = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.15, 4), this._mat(i % 2 ? 0x5cb84a : 0x4a9e38)); const a = i / 6 * TAU; fr.position.set(Math.cos(a) * 0.45, 2.0, Math.sin(a) * 0.45); fr.rotation.order = "ZYX"; fr.rotation.y = a; fr.rotation.z = Math.PI / 2 - 0.55; fr.scale.set(1, 1, 0.42); fr.castShadow = true; g.add(fr); }
    const co = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), this._mat(0x6b4a2c)); co.position.y = 1.95; g.add(co);
    return g;
  }
  _grass() { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = this._box(0.07, 0.4 + Math.random() * 0.25, 0.07, i % 2 ? 0x7ab93f : 0x6aa634, 0); b.position.set((Math.random() - 0.5) * 0.45, 0.22, (Math.random() - 0.5) * 0.45); b.rotation.z = (Math.random() - 0.5) * 0.4; g.add(b); } return g; }
  _rockDecor() { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.35, 0), this._mat(0xc6b083)); m.position.y = 0.26; m.scale.y = 0.7; m.castShadow = true; g.add(m); if (Math.random() < 0.5) { const m2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25, 0), this._mat(0xbfa779)); m2.position.set(0.4, 0.18, 0.2); m2.scale.y = 0.7; g.add(m2); } return g; }
  // sparse desert rocks only — no trees/animals (clean, realistic desert)
  _buildDecor(state) {
    const key = state.wonderIndex + ""; if (this._decorKey === key) return; this._decorKey = key;
    while (this.decorGroup.children.length) this.decorGroup.remove(this.decorGroup.children[0]);
    const B = wonderGeom(state.wonderIndex).base, off = (B - 1) / 2;
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU + Math.random() * 0.3, rad = off + 16 + Math.random() * 13;
      const wx = Math.cos(a) * rad, wz = Math.sin(a) * rad * 0.85 + 2; if (wz < -off - 10) continue; // keep off the Nile
      const o = this._rockDecor(); o.position.set(wx, 0, wz); o.rotation.y = Math.random() * TAU; o.scale.multiplyScalar(0.8 + Math.random() * 0.8); this.decorGroup.add(o);
    }
  }
  _rebuildLayout(state) {
    this._buildGrid(state);
    this._buildDecor(state);
    if (this._layoutWonder !== state.wonderIndex) {
      this._layoutWonder = state.wonderIndex;
      while (this.worldGroup.children.length) this.worldGroup.remove(this.worldGroup.children[0]);
      while (this.billboardGroup.children.length) this.billboardGroup.remove(this.billboardGroup.children[0]);
      this.tileModels = {}; this.machineSlots = {}; this._camps = null; this._layoutReady = false; this.plops.length = 0;
    }
    this._refreshBuildings(state);
  }
  _refreshBuildings(state) {
    const g = wonderGeom(state.wonderIndex), B = g.base, off = (B - 1) / 2;
    // desired anchor-tile → building id (everything is placed explicitly now)
    const desired = {}, occ = new Set();
    for (const p of (state.placements || [])) {
      const k = p.gx + "," + p.gz; if (desired[k]) continue; desired[k] = p.id;
      for (const [x, z] of footprintCells(p.id, p.gx, p.gz)) occ.add(x + "," + z);
    }
    // safety net: render any building count not covered by an explicit placement
    // (legacy saves / test fixtures) by auto-filling free footprints
    const explicit = {}; for (const k in desired) explicit[desired[k]] = (explicit[desired[k]] || 0) + 1;
    const free = (this._buildCells || []).filter((c) => !this._nodeTiles.has(c.gx + "," + c.gz))
      .sort((a, b) => (a.gx * a.gx + (a.gz - 2) * (a.gz - 2)) - (b.gx * b.gx + (b.gz - 2) * (b.gz - 2)));
    for (const id of PLACEABLE) {
      let need = (state.buildings[id] || 0) - (explicit[id] || 0);
      if (need <= 0) continue;
      for (const c of free) {
        if (need <= 0) break;
        const cells = footprintCells(id, c.gx, c.gz), k = c.gx + "," + c.gz;
        if (desired[k] || !cells.every(([x, z]) => this._buildSet.has(x + "," + z) && !occ.has(x + "," + z))) continue;
        desired[k] = id; for (const [x, z] of cells) occ.add(x + "," + z); need--;
      }
    }
    // diff against rendered models
    for (const k in this.tileModels) if (desired[k] !== this.tileModels[k].id) { const tm = this.tileModels[k]; this.worldGroup.remove(tm.grp); if (tm.ring) this.worldGroup.remove(tm.ring); if (tm.badge) this.billboardGroup.remove(tm.badge); delete this.tileModels[k]; }
    for (const k in desired) {
      if (this.tileModels[k]) continue;
      const [gx, gz] = k.split(",").map(Number), id = desired[k], sz = SIZE[id] || [1, 1];
      const grp = this._placeModel(id);
      const cx = (gx + (sz[0] - 1) / 2) * TILE, cz = (gz + (sz[1] - 1) / 2) * TILE;
      grp.position.set(cx, 0, cz);                                                          // footprint centre
      const fs = Math.max(sz[0], sz[1]) > 1 ? Math.max(sz[0], sz[1]) * 0.92 : 1;            // bigger footprint → bigger model
      this.worldGroup.add(grp);
      // floating produce/tier badge above the building
      const res = this._badgeResFor(id), baseY = 1.9 + (Math.max(sz[0], sz[1]) - 1) * 0.9;
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._badgeTex(res, 1), transparent: true })); badge.scale.set(0.95, 0.95, 1); badge.position.set(cx, baseY, cz);
      this.billboardGroup.add(badge);
      this.tileModels[k] = { id, grp, scale: fs, tier: 1, ring: null, badge, badgeRes: res, baseY };
      if (this._layoutReady) { grp.scale.setScalar(0.01); this.plops.push({ grp, t: 0, target: fs }); this.spawnDust(new THREE.Vector3(gx * TILE, 0.3, gz * TILE), 6); this.ring(new THREE.Vector3(gx * TILE, 0.05, gz * TILE), 0xffe0a0); }
      else grp.scale.setScalar(fs);
    }
    // reflect upgrade tier: bigger model + gold base ring + tier pips on the badge
    for (const k in this.tileModels) {
      const tm = this.tileModels[k], tier = (state.tier && state.tier[tm.id]) || 1;
      if (tm.tier === tier) continue;
      tm.tier = tier; tm.grp.scale.setScalar(tm.scale * (1 + (tier - 1) * 0.07));
      if (tm.badge) tm.badge.material.map = this._badgeTex(tm.badgeRes, tier);
      if (!tm.ring && tier >= 2) { const r = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.82, 22), new THREE.MeshBasicMaterial({ color: 0xf6ce5a, transparent: true, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.copy(tm.grp.position).setY(0.07); this.worldGroup.add(r); tm.ring = r; }
      if (tm.ring) tm.ring.material.opacity = Math.min(0.85, 0.18 + tier * 0.14);
    }
    this._occupied = occ;
    // machines stay at the ramp zone (not tiled)
    const z = this._zoneAnchor("ramp", B);
    for (const b of BUILDINGS) {
      if (b.cat !== "machine") continue;
      const want = Math.min(state.buildings[b.id] || 0, 10);
      let arr = this.machineSlots[b.id]; if (!arr) arr = this.machineSlots[b.id] = [];
      while (arr.length < want) { const i = arr.length; const m = this._machineModel(b.id); m.position.set((z[0] + (i % z[2]) * 1.6) - off, 0, (z[1] + Math.floor(i / z[2]) * 1.6) - off); this.worldGroup.add(m); arr.push(m); }
      while (arr.length > want) { const mm = arr.pop(); this.worldGroup.remove(mm); }
    }
    this._layoutReady = true;
  }
  // raycast the pointer to a grid tile (null if not over a buildable tile)
  tileAt(sx, sy) {
    if (!this.vw || !this._buildSet.size) return null;
    this._ray.setFromCamera({ x: sx / this.vw * 2 - 1, y: -(sy / this.vh * 2 - 1) }, this.cam);
    const hit = this._tmpV2; if (!this._ray.ray.intersectPlane(this._groundPlane, hit)) return null;
    const gx = Math.round(hit.x / TILE), gz = Math.round(hit.z / TILE), k = gx + "," + gz;
    if (!this._buildSet.has(k)) return null;
    return { gx, gz, occupied: this._occupied.has(k) || this._nodeTiles.has(k) };
  }
  hoverTile(sx, sy) {
    const t = (sx == null) ? null : this.tileAt(sx, sy);
    if (!t || t.occupied) { this.tileHi.visible = false; return null; }
    this.tileHi.visible = true; this.tileHi.position.set(t.gx * TILE, 0.05, t.gz * TILE);
    return t;
  }
  plopAt(gx, gz) { this.spawnDust(new THREE.Vector3(gx * TILE, 0.3, gz * TILE), 8); this.ring(new THREE.Vector3(gx * TILE, 0.05, gz * TILE), 0xffe0a0); this.kick(0.18); this.tileHi.visible = false; }
  _updatePlops(dt) {
    for (let i = this.plops.length - 1; i >= 0; i--) {
      const p = this.plops[i]; p.t += dt * 3.4; const tg = p.target || 1;
      if (p.t >= 1) { p.grp.scale.setScalar(tg); this.plops.splice(i, 1); }
      else { const s = smooth(p.t); p.grp.scale.setScalar(tg * s * (1.12 - 0.12 * s)); } // pop-in with slight overshoot
    }
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
    } else if (t === "dune") {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 6), this._mat(0xe6c878)); m.position.y = 0.2; m.rotation.y = 0.5; m.castShadow = true; m.scale.set(1, 1, 0.8); grp.add(m);
      const m2 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.34, 6), this._mat(0xd8b86a)); m2.position.set(0.55, 0.12, 0.2); m2.castShadow = true; grp.add(m2);
      grp._harvest = [m, m2];
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
    this.nodes = []; this._nodeTiles = new Set();
    for (const nd of genNodes(state.seed >>> 0, g.base)) {
      const grp = this._nodeModel(nd.t);
      grp.position.set(nd.x, 0, nd.z); grp.rotation.y = nd.rot; grp.scale.setScalar(nd.s);
      this.nodeGroup.add(grp);
      this.nodes.push({ grp, t: nd.t, res: nd.res, x: nd.x, z: nd.z, charge: 1, bounce: 0, harvest: grp._harvest || [] });
      this._nodeTiles.add(Math.round(nd.x / TILE) + "," + Math.round(nd.z / TILE)); // keep buildings off node tiles
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
    const id = ID_OF_RES[res];
    for (const k in this.tileModels) if (this.tileModels[k].id === id) { const p = this.tileModels[k].grp.position; return new THREE.Vector3(p.x, 0, p.z); }
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
      if (camps > 0) want[res] = Math.min(3, 1 + Math.floor(camps / 3)); // workers tend every camp (walk to a node, or work in place)
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
      const tAL = carry ? -2.0 : chop ? -1.7 - bend : -swing, tAR = carry ? -2.0 : chop ? -1.7 - bend : swing;
      w.aL += (tAL - w.aL) * 0.3; w.aR += (tAR - w.aR) * 0.3;
      w.armL.rotation.x = w.aL; w.armR.rotation.x = w.aR;
      w.body.rotation.x = chop ? 0.3 : 0;
      w.body.scale.y = 1 + Math.sin(w.breathe + w.phase * 2.4) * 0.045;
      w.head.rotation.x = (chop ? 0.25 : 0) + Math.sin(w.phase * 4) * 0.05 * (walk ? 1 : 0.3);
      w.block.visible = carry; w.grp.position.y = walk ? Math.sin(w.phase * 9) * 0.02 : 0;
    }
  }
  _face(w, aim) { w.grp.rotation.y = Math.atan2(aim.x - w.grp.position.x, aim.z - w.grp.position.z); }

  // ---------- construction supply line: sleds (group delivery) + stone-cutting yard ----------
  _makeSled() {
    const grp = new THREE.Group();
    const base = this._box(0.95, 0.14, 1.6, 0x6e4a2a, 0.2); grp.add(base);
    for (const s of [0.45, -0.45]) { const r = this._box(0.12, 0.12, 1.8, 0x553820, 0.08); r.position.x = s; grp.add(r); }
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), this._mat(0xcdbb95)); rock.position.y = 0.62; rock.castShadow = true; grp.add(rock);
    const pullers = [];
    for (let i = 0; i < 2; i++) { const p = this._makeWorker(); p.grp.scale.setScalar(0.72); p.grp.position.set(i ? 0.28 : -0.28, 0, 1.2 + i * 0.4); grp.add(p.grp); pullers.push(p); }
    return { grp, rock, pullers, state: "toYard", timer: 0, phase: Math.random() * TAU };
  }
  _buildSupply(state) {
    const g = wonderGeom(state.wonderIndex), B = g.base, off = (B - 1) / 2;
    const key = state.wonderIndex + "";
    if (this._supplyKey === key && this.cutter) return;
    this._supplyKey = key;
    while (this.supplyGroup.children.length) this.supplyGroup.remove(this.supplyGroup.children[0]);
    this.sleds = [];
    const yardX = -off + B * 0.78, yardZ = -off + B + 1.7;
    const grp = new THREE.Group(); grp.position.set(yardX, 0, yardZ); this.supplyGroup.add(grp);
    const table = this._box(1.05, 0.42, 1.15, 0x8a5e34, 0.21); grp.add(table);
    const rough = new THREE.Mesh(new THREE.DodecahedronGeometry(0.44, 0), this._mat(0xcdbb95)); rough.position.y = 0.66; rough.castShadow = true; grp.add(rough);
    const brick = this._box(0.5, 0.42, 0.5, 0xe7d6ad, 0.66); brick.visible = false; grp.add(brick);
    const cutter = this._makeWorker(); cutter.grp.scale.setScalar(0.8); cutter.grp.position.set(0, 0, 0.95); cutter.grp.rotation.y = Math.PI; grp.add(cutter.grp);
    const stack = []; for (let i = 0; i < 6; i++) { const bk = this._box(0.46, 0.4, 0.46, 0xe3d3aa, 0); bk.position.set(-1.1, 0.2 + Math.floor(i / 2) * 0.42, -0.4 + (i % 2) * 0.6); bk.visible = false; grp.add(bk); stack.push(bk); }
    this.cutter = { grp, rough, brick, cutter, stack, x: yardX, z: yardZ, t: 0, stockN: 2 };
    this._yard = new THREE.Vector3(yardX, 0, yardZ);
  }
  _updateSupply(state, stats, dt) {
    if (!this.cutter) return;
    const g = wonderGeom(state.wonderIndex), B = g.base, off = (B - 1) / 2;
    const yard = this._yard, quarryPos = this._campPos("limestone", B, off);
    const whip = !!(state.whip && state.whip.boostT > 0);
    // sleds: a group drags a rough stone from the quarry to the cutting yard, then returns empty
    const want = state.complete ? 0 : Math.min(3, Math.floor((state.buildings.quarry || 0) / 2));
    while (this.sleds.length < want) { const s = this._makeSled(); s.grp.position.copy(quarryPos); this.supplyGroup.add(s.grp); this.sleds.push(s); }
    while (this.sleds.length > want) { const s = this.sleds.pop(); this.supplyGroup.remove(s.grp); }
    const sp = (1.5 + Math.min(2.4, (stats.buildRate || 0) * 0.04)) * (whip ? 1.3 : 1) * dt;
    for (const s of this.sleds) {
      s.phase += dt; let moving = 0, aim = null;
      if (s.state === "toYard") { aim = yard; s.rock.visible = true; moving = 1; if (this._stepToward(s.grp.position, yard, sp)) { s.state = "dump"; s.timer = 0.5; } }
      else if (s.state === "dump") { s.timer -= dt; s.rock.visible = false; if (s.timer <= 0) { s.state = "return"; this.spawnChips(new THREE.Vector3(this.cutter.x, 0.7, this.cutter.z), 0xcdbb95, 4); this.cutter.stockN = Math.min(this.cutter.stack.length, this.cutter.stockN + 1); } }
      else if (s.state === "return") { aim = quarryPos; s.rock.visible = false; moving = 1; if (this._stepToward(s.grp.position, quarryPos, sp)) { s.state = "load"; s.timer = 0.6 + Math.random() * 0.7; } }
      else { s.timer -= dt; if (s.timer <= 0) s.state = "toYard"; }
      if (aim) s.grp.rotation.y = Math.atan2(aim.x - s.grp.position.x, aim.z - s.grp.position.z);
      for (let i = 0; i < s.pullers.length; i++) { const p = s.pullers[i], sw = Math.sin(s.phase * 9 + i) * (moving ? 0.7 : 0.05); p.legL.rotation.x = sw; p.legR.rotation.x = -sw; p.armL.rotation.x = moving ? -1.1 : -0.1; p.armR.rotation.x = moving ? -1.1 : 0.1; p.body.rotation.x = moving ? 0.45 : 0; }
      if (s.rock.visible) s.rock.position.y = 0.62 + Math.sin(s.phase * 9) * 0.02;
    }
    // cutting station: solid rock → dressed brick, cut by a stonecutter
    const cs = this.cutter;
    cs.grp.visible = (state.buildings.quarry || 0) > 0;   // no stone-cutting yard until you quarry
    const active = !state.complete && cs.grp.visible;
    const rate = active ? (0.7 + Math.min(2, (stats.buildRate || 0) * 0.05)) * (whip ? 1.4 : 1) : 0.12;
    cs.t += dt * rate; cs.cutter.phase += dt;
    const swingC = Math.abs(Math.sin(cs.cutter.phase * 10));
    cs.cutter.armL.rotation.x = -1.5 - swingC * 0.8; cs.cutter.armR.rotation.x = -1.5 - swingC * 0.8; cs.cutter.body.rotation.x = 0.3 + swingC * 0.1;
    const ph = cs.t % 1;
    if (ph < 0.72) { cs.rough.visible = true; cs.rough.scale.setScalar(1 - ph * 0.18); cs.brick.visible = false; if (active && Math.random() < dt * rate * 7) this.spawnChips(new THREE.Vector3(cs.x, 0.74, cs.z), 0xe7d6ad, 1); }
    else { const tr = (ph - 0.72) / 0.28; cs.rough.visible = true; cs.rough.scale.setScalar(0.87 * (1 - tr)); cs.brick.visible = true; cs.brick.scale.setScalar(0.35 + 0.65 * tr); }
    if (cs.t >= 1) { cs.t -= 1; cs.stockN = Math.min(cs.stack.length, cs.stockN + 1); this.spawnChips(new THREE.Vector3(cs.x, 0.74, cs.z), 0xe7d6ad, 5); }
    if (Math.random() < dt * 0.6 && cs.stockN > 0) cs.stockN -= 1; // masons draw from the pile
    for (let i = 0; i < cs.stack.length; i++) cs.stack[i].visible = i < cs.stockN;
  }

  // ---------- worker model ----------
  _makeWorker() {
    const i = (Math.random() * SKINS.length) | 0;
    const skin = this._mat(SKINS[i]), cloth = this._mat(CLOTHS[(Math.random() * CLOTHS.length) | 0]), kilt = this._mat(0xefe7d2);
    const linen = this._mat(0xf2ead2);                 // headcloth linen
    const grp = new THREE.Group();
    // legs + sandalled feet
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), skin); legL.geometry.translate(0, -0.25, 0); legL.position.set(0.1, 0.5, 0); legL.castShadow = true;
    const footL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.26), kilt); footL.position.set(0, -0.5, 0.05); legL.add(footL);
    const legR = legL.clone(); legR.position.x = -0.1;
    // torso with broader shoulders, belt and kilt
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.24), skin); body.position.y = 0.74; body.castShadow = true;
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.26), skin); shoulders.position.y = 0.19; shoulders.castShadow = true; body.add(shoulders);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.28), this._mat(0x7c5530)); belt.position.y = -0.18; body.add(belt);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.16), skin); neck.position.y = 0.26; body.add(neck);
    const kiltM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.3), kilt); kiltM.position.y = 0.55;
    // head with black-dot eyes
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.26), skin); head.position.y = 1.14; head.castShadow = true;
    const eyeL = new THREE.Mesh(this._eyeGeo, this._black); eyeL.position.set(0.07, 0.02, 0.135); head.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = -0.07; head.add(eyeR);
    // nemes headcloth: crown + brow band + side lappets framing the face + back fall
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.3), linen); crown.position.y = 0.16; head.add(crown);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.31), cloth); band.position.y = 0.08; head.add(band);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), linen); back.position.set(0, 0.0, -0.13); head.add(back);
    for (const sx of [0.17, -0.17]) { const lap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.2), linen); lap.position.set(sx, -0.05, 0.02); head.add(lap); }
    // arms + hands
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), skin); armL.geometry.translate(0, -0.21, 0); armL.position.set(0.26, 0.96, 0); armL.castShadow = true;
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), skin); handL.position.set(0, -0.44, 0); armL.add(handL);
    const armR = armL.clone(); armR.position.x = -0.26;
    // carried cut-limestone block, hugged against the chest so the face stays visible
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), this._mat(0xe3d3aa)); block.position.set(0, 0.84, 0.38); block.visible = false; block.castShadow = true;
    const blockTop = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.32), this._mat(0xf2e6c2)); blockTop.position.y = 0.15; block.add(blockTop);
    const blockEdge = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.32), this._mat(0xb9a373)); blockEdge.position.y = -0.14; block.add(blockEdge);
    grp.add(legL, legR, body, kiltM, head, armL, armR, block);
    grp.scale.setScalar(0.8);
    return { grp, legL, legR, armL, armR, block, body, head,
      state: "fetch", target: -1, p: 0, phase: Math.random() * TAU, timer: Math.random() * 1.2, placed: false,
      lane: (Math.random() - 0.5) * 3.2, foot: Math.random() * 4, whipT: 0,
      aL: 0, aR: 0, breathe: Math.random() * TAU };
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
    const hx = type === "elephant" ? 0.7 : 0.5, hy = type === "croc" ? 0.3 : 0.5, hz = type === "croc" ? 0.7 : 0.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(hx, hy, hz), bodyMat);
    head.position.set((type === "croc" ? 1.0 : 0.7), body.position.y + (type === "croc" ? 0 : 0.1), 0); head.castShadow = true; grp.add(head);
    // black dot eyes on the head front (+x)
    const eyeL = new THREE.Mesh(this._eyeGeo, this._black); eyeL.position.set(hx * 0.46, hy * 0.12, hz * 0.28); head.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.z = -hz * 0.28; head.add(eyeR);
    // ears
    if (type === "ox") { for (const s of [0.12, -0.12]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), this._mat(0xefe7d0)); horn.position.set(0.2, 0.32, s); horn.rotation.z = -0.5; head.add(horn); } for (const s of [0.22, -0.22]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.1), bodyMat); ear.position.set(-0.05, 0.14, s); head.add(ear); } }
    if (type === "elephant") { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6), bodyMat); tr.position.set(1.05, body.position.y - 0.1, 0); tr.rotation.z = 0.7; grp.add(tr); for (const s of [0.32, -0.32]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.34), bodyMat); ear.position.set(-0.1, 0.1, s); head.add(ear); } }
    // tail (swings)
    let tail = null;
    if (type !== "croc") { tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), bodyMat); tail.geometry.translate(-0.25, 0, 0); tail.position.set(-(type === "elephant" ? 0.7 : 0.6), body.position.y + 0.05, 0); grp.add(tail); }
    else { tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.22), bodyMat); tail.geometry.translate(-0.35, 0, 0); tail.position.set(-0.8, 0.3, 0); grp.add(tail); }
    return { grp, legs, head, tail, type, t: Math.random(), sp: 0.04 + Math.random() * 0.04, phase: Math.random() * TAU };
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
    this._vZoom += (this.zoom - this._vZoom) * 0.18;        // ease zoom changes
    const view = (g.base * 1.95) / this._vZoom;
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
    this._buildSupply(state);

    // day/night sky + sun — start the world in bright mid-morning (+0.22 offset)
    const phase = ((state.clock + DAY_LEN * 0.22) % DAY_LEN) / DAY_LEN, sk = skyAt(phase);
    this.skyMat.uniforms.top.value.setHex(sk.top); this.skyMat.uniforms.bot.value.setHex(sk.bot);
    this.scene.fog.color.setHex(sk.bot);
    this.hemi.intensity = 0.5 + sk.amb * 0.45; this.sun.color.setHex(sk.sun); this.sun.intensity = 1.05 + sk.amb * 1.15; // punchy key light
    const sa = phase * TAU; this.sun.position.set(Math.cos(sa) * 60, 42 + Math.sin(sa) * 40, 34); this.sun.target.position.set(0, 0, 0);
    if (this.nileShallow) { this.nileShallow.material.opacity = 0.62 + Math.sin(state.clock * 1.6) * 0.16; this.nileShallow.position.x = Math.sin(state.clock * 0.4) * 0.6; } // water shimmer

    this._updateCamera(vw, vh, state);
    this._updatePyramid(state);
    this._updateWorkers(state, stats, dt);
    this._updateSupply(state, stats, dt);
    this._updateGatherers(state, stats, dt);
    this._updatePlops(dt);
    for (const k in this.tileModels) { const tm = this.tileModels[k]; if (tm.badge) tm.badge.position.y = tm.baseY + Math.sin(state.clock * 2 + tm.baseY * 3) * 0.12; } // bob badges
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
    if (this.revealKey !== key) { this.revealKey = key; this.shown = 0; for (const w of this.workers) { w.state = "fetch"; w.timer = Math.random() * 1.0; w.placed = false; w.cell = null; } }
    const cells = state.complete ? [] : layerCells(g.base, state.layer);
    // cubes that *should* be visible given sim progress; reveal never outruns this
    const bpc = Math.max(1, g.blocksPerCube || 1);
    const real = state.complete ? 0 : Math.min(cells.length, Math.floor(state.blocksInLayer / bpc));
    if (this.shown > real) this.shown = real;                              // layer reset / rollback
    if (real - this.shown > Math.max(3, cells.length * 0.3)) this.shown = real - Math.ceil(cells.length * 0.12); // catch up if workers lag

    // show as many workers as you actually have (0 when you have none), capped for perf
    const target = state.complete ? 8 : Math.min(40, Math.max(0, Math.round(stats.builders || 0)));
    while (this.workers.length < target) { const w = this._makeWorker(); this.workerGroup.add(w.grp); this.workers.push(w); }
    while (this.workers.length > target) { const w = this.workers.pop(); this.workerGroup.remove(w.grp); }

    const whip = !!(state.whip && state.whip.boostT > 0);
    const moveBase = 0.30 + Math.min(1.0, (stats.buildRate || 0) * 0.028);   // slower, deliberate

    // ramp foot (front, ground); masons climb to the EXACT next active-layer cell
    const footX = -off + B * 0.5, footZ = -off + B + 2.4;
    const topY = state.complete ? g.layers : state.layer;
    this._topW = new THREE.Vector3(0, topY + 0.5, Math.max(-off + 0.5, -off + state.layer + Math.max(1, B - 2 * state.layer) * 0.5));
    let climbing = 0; for (const w of this.workers) if (w.state === "haul" || w.state === "place") climbing++;
    let nextSlot = this.shown + climbing;
    const cellAt = (i) => { const c = cells[Math.min(i, cells.length - 1)] || { gx: B / 2, gy: B / 2 }; return { x: c.gx - off, z: c.gy - off }; };

    this.workerHits = [];
    for (const w of this.workers) {
      w.phase += dt; if (w.whipT > 0) w.whipT -= dt;
      const ms = moveBase * (w.whipT > 0 ? 2.0 : 1) * (whip ? 1.3 : 1);
      let px, py, pz, walk = 0, carry = false, bend = 0;
      const cell = w.cell != null ? cellAt(w.cell) : { x: footX, z: footZ };
      if (w.state === "fetch") {
        // queue at the foot, then carry a block to the next cell
        w.timer -= dt;
        px = footX + w.lane; py = 0; pz = footZ + w.foot; walk = 0.18;
        if (w.timer <= 0 && !state.complete && cells.length && nextSlot < real && nextSlot < cells.length) { w.cell = nextSlot++; w.state = "haul"; w.p = 0; w.placed = false; }
      } else if (w.state === "haul") {
        w.p += ms * dt * 0.5; if (w.p >= 1) { w.p = 1; w.state = "place"; w.timer = 0.8 / (w.whipT > 0 ? 1.5 : 1); w.placed = false; }
        const ep = smooth(w.p); px = footX + (cell.x - footX) * ep; py = topY * ep; pz = footZ + (cell.z - footZ) * ep; carry = true; walk = 1;
        if (Math.random() < dt * 2 * ms) this.spawnDust(new THREE.Vector3(px, py + 0.1, pz), 1);
      } else if (w.state === "place") {
        w.timer -= dt; const pr = 1 - Math.max(0, w.timer) / 0.8;
        px = cell.x; py = topY; pz = cell.z; bend = Math.sin(Math.min(1, pr) * Math.PI); carry = pr < 0.5;
        // the block appears at this exact cell once set (gated to sim progress)
        if (!w.placed && pr > 0.5) { w.placed = true; const tgt = Math.min(real, (w.cell || 0) + 1); if (this.shown < tgt) this.shown = tgt; this.spawnDust(new THREE.Vector3(cell.x, topY + 0.3, cell.z), 5); }
        if (w.timer <= 0) { w.state = "return"; w.p = 1; }
      } else { // return — walk back down to the foot
        w.p -= ms * dt * 0.8; if (w.p <= 0) { w.p = 0; w.state = "fetch"; w.timer = 0.4 + Math.random() * 1.0; w.cell = null; }
        const ep = smooth(w.p); px = footX + (cell.x - footX) * ep; py = topY * ep; pz = footZ + (cell.z - footZ) * ep; walk = 1;
      }
      w.grp.position.set(px, py, pz);
      // face direction of travel
      const fx2 = (w.state === "haul" || w.state === "place") ? cell.x : footX, fz2 = (w.state === "haul" || w.state === "place") ? cell.z : footZ;
      w.grp.rotation.y = Math.atan2((fx2 - px) || 0.0001, (fz2 - pz) || 0.0001);
      const sw = Math.sin(w.phase * 8) * (walk ? 0.7 * walk + 0.15 : 0.05);
      w.legL.rotation.x = sw; w.legR.rotation.x = -sw;
      const tAL = carry ? -1.35 : -sw, tAR = carry ? -1.35 : sw;
      w.aL += (tAL - w.aL) * 0.25; w.aR += (tAR - w.aR) * 0.25;     // springy arm follow-through
      w.armL.rotation.x = w.aL; w.armR.rotation.x = w.aR;
      w.body.rotation.x = bend * 0.9;
      w.body.scale.y = 1 + Math.sin(w.breathe + w.phase * 2.4) * 0.045;            // breathing
      w.head.rotation.x = bend * 0.5 + Math.sin(w.phase * 4) * 0.05 * (walk ? 1 : 0.3); // head bob
      w.block.visible = carry;
      w.grp.position.y += bend * -0.15 + Math.sin(w.phase * 8) * 0.025 * walk;     // gait bob
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
    while (this.animals.length < target) { const a = this._makeAnimal(["elephant", "croc", "elephant", "croc"][this.animals.length % 4]); this.animalGroup.add(a.grp); this.animals.push(a); }
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
      if (a.tail) a.tail.rotation.y = Math.sin(a.t * 30 + a.phase) * (a.type === "croc" ? 0.5 : 0.35); // tail wag / swish
      if (a.head) a.head.rotation.z = Math.sin(a.t * 20 + a.phase) * 0.06;                              // head bob
    }
  }

  _updateFx(dt) {
    for (const p of this.puffs) { if (!p.sp.visible) continue; p.life -= dt; if (p.life <= 0) { p.sp.visible = false; continue; } p.sp.position.addScaledVector(p.v, dt); p.v.y -= 4 * dt; p.sp.material.opacity = Math.min(0.8, p.life); p.sp.scale.addScalar(dt * 0.8); }
    for (const r of this.rings) { if (!r.m.visible) continue; r.life -= dt * 1.4; if (r.life <= 0) { r.m.visible = false; continue; } r.m.scale.addScalar(dt * 10); r.m.material.opacity = Math.max(0, r.life) * 0.6; }
    for (const c of this.chips) { if (!c.m.visible) continue; c.life -= dt; if (c.life <= 0) { c.m.visible = false; continue; } c.v.y -= 11 * dt; c.m.position.addScaledVector(c.v, dt); if (c.m.position.y < 0.06) { c.m.position.y = 0.06; c.v.y *= -0.4; c.v.x *= 0.6; c.v.z *= 0.6; } c.m.rotation.x += dt * 6; c.m.rotation.y += dt * 5; }
  }
}
