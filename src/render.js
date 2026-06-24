// Isometric Canvas2D renderer: a full placed desert world (Nile, village, camps,
// real buildings that grow with their counts) + a pyramid built by workers who
// actually walk a block to a target cube and set it (no teleporting bricks).
import { wonderFor, wonderGeom, BUILDINGS } from "./data.js";
import { project, cubeFaces, layerSide, layerCells, pyramidBounds } from "./iso.js";
import { drawHuman, drawAnimal } from "./sprites.js";

export const DAY_LEN = 220;

const SKINS = ["#caa06a", "#b5895a", "#9a6f44", "#d8b483", "#a87a4c"];
const CLOTHS = ["#3a6ea5", "#c0392b", "#d4a017", "#2c8c84", "#7b4ea0"];

function hx(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function css(r) { return `rgb(${r[0]|0},${r[1]|0},${r[2]|0})`; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(a, b, t) { const A = hx(a), B = hx(b); return css([lerp(A[0],B[0],t), lerp(A[1],B[1],t), lerp(A[2],B[2],t)]); }
function shadow(ctx, x, y, rx) { ctx.fillStyle = "rgba(40,26,12,0.2)"; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.4, 0, 0, 7); ctx.fill(); }

const SKY = [
  { p: 0, top: "#caa6c0", bot: "#ffce9a" }, { p: 0.22, top: "#86bce0", bot: "#f6d99c" },
  { p: 0.5, top: "#b0654c", bot: "#f0a85a" }, { p: 0.72, top: "#15203f", bot: "#33335c" }, { p: 1, top: "#caa6c0", bot: "#ffce9a" },
];
function sky(phase) {
  let a = SKY[0], b = SKY[1];
  for (let i = 0; i < SKY.length - 1; i++) if (phase >= SKY[i].p && phase <= SKY[i + 1].p) { a = SKY[i]; b = SKY[i + 1]; break; }
  const t = (phase - a.p) / (b.p - a.p || 1);
  const night = Math.max(0, Math.min(1, (phase - 0.58) / 0.14)) * Math.max(0, Math.min(1, (0.86 - phase) / 0.14));
  return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), tint: night };
}
function poly(ctx, pts, fill) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function paintCube(ctx, f, faces, u, rich) {
  poly(ctx, f.left, faces[2]); poly(ctx, f.right, faces[1]); poly(ctx, f.top, faces[0]);
  if (rich && u >= 5) {
    const topY = f.top[0].y, botY = f.left[2].y;
    let g = ctx.createLinearGradient(0, topY, 0, botY); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.26)"); poly(ctx, f.left, g);
    g = ctx.createLinearGradient(0, topY, 0, botY); g.addColorStop(0, "rgba(0,0,0,0.05)"); g.addColorStop(1, "rgba(0,0,0,0.38)"); poly(ctx, f.right, g);
    const tg = ctx.createLinearGradient(f.top[3].x, f.top[0].y, f.top[1].x, f.top[2].y); tg.addColorStop(0, "rgba(255,248,225,0.18)"); tg.addColorStop(0.6, "rgba(255,248,225,0)"); poly(ctx, f.top, tg);
  }
  if (u < 8) return;
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(28,18,10,0.3)";
  ctx.beginPath(); ctx.moveTo(f.left[1].x, f.left[1].y); ctx.lineTo(f.left[2].x, f.left[2].y);
  ctx.moveTo(f.top[3].x, f.top[3].y); ctx.lineTo(f.top[2].x, f.top[2].y); ctx.lineTo(f.top[1].x, f.top[1].y); ctx.stroke();
  ctx.strokeStyle = "rgba(255,248,228,0.34)"; ctx.beginPath(); ctx.moveTo(f.top[3].x, f.top[3].y); ctx.lineTo(f.top[0].x, f.top[0].y); ctx.lineTo(f.top[1].x, f.top[1].y); ctx.stroke();
}
// an iso box footprint w (in px half-width), height h; base-centre at (cx,cy)
function isoBox(ctx, cx, cy, w, h, top, left, right) {
  const q = w * 0.5;
  poly(ctx, [{ x: cx - w, y: cy }, { x: cx, y: cy + q }, { x: cx, y: cy + q - h }, { x: cx - w, y: cy - h }], left);
  poly(ctx, [{ x: cx + w, y: cy }, { x: cx, y: cy + q }, { x: cx, y: cy + q - h }, { x: cx + w, y: cy - h }], right);
  poly(ctx, [{ x: cx, y: cy - q - h }, { x: cx + w, y: cy - h }, { x: cx, y: cy + q - h }, { x: cx - w, y: cy - h }], top);
}

// zone anchors (grid coords) given base B and centre c
function zones(B) {
  const c = (B - 1) / 2;
  return {
    nile:    { gx: c, gy: -7, cols: 6, sp: 1.0, back: 1 },
    farm:    { gx: -1, gy: -4.5, cols: 5, sp: 1.05, back: 1 },
    village: { gx: -6.5, gy: c - 1, cols: 4, sp: 1.1, back: 1 },
    well:    { gx: -5, gy: c + 3, cols: 3, sp: 1.0, back: 1 },
    storage: { gx: -5.5, gy: -2.5, cols: 3, sp: 1.1, back: 1 },
    temple:  { gx: B + 3.5, gy: -2.5, cols: 2, sp: 1.4, back: 1 },
    lumber:  { gx: -4.5, gy: c + 5.5, cols: 4, sp: 1.1, back: 0 },
    market:  { gx: -2.5, gy: B + 2.5, cols: 4, sp: 1.0, back: 0 },
    ramp:    { gx: c, gy: B + 4.5, cols: 5, sp: 1.0, back: 0 },
    quarry:  { gx: B + 3.5, gy: c + 1, cols: 4, sp: 1.1, back: 0 },
    granite: { gx: B + 4.5, gy: c + 5, cols: 3, sp: 1.1, back: 0 },
    copper:  { gx: B + 5.5, gy: c + 2, cols: 3, sp: 1.1, back: 0 },
  };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.pan = { x: 0, y: 0 }; this.zoom = 1;
    this.cache = document.createElement("canvas"); this.cctx = this.cache.getContext("2d");
    this.cacheKey = ""; this.pad = 40;
    this.workers = []; this.animals = []; this.bursts = [];
    this.sand = []; this.rain = []; this.flood = 0; this.puffs = []; this.rings = []; this.motes = [];
    this.shown = 0; this.revealKey = ""; this.workerHits = [];
    for (let i = 0; i < 200; i++) this.sand.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    for (let i = 0; i < 26; i++) this.motes.push({ x: Math.random(), y: Math.random(), sp: 0.3 + Math.random() * 0.7, sz: 1 + Math.random() * 1.6, ph: Math.random() * 6.28 });
    this.clouds = []; for (let i = 0; i < 4; i++) this.clouds.push({ x: Math.random() * 1.2, y: 0.03 + Math.random() * 0.08, s: 0.6 + Math.random(), sp: 0.004 + Math.random() * 0.006 });
    this.grain = this._makeGrain(); this.grainPat = null;
    this.shake = 0; this.whipFlash = 0;
  }

  _makeGrain() {
    const n = 96, c = document.createElement("canvas"); c.width = c.height = n;
    const g = c.getContext("2d"), img = g.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) { const v = 92 + Math.random() * 72; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); return c;
  }
  addBurst(x, y, text, color) { if (this.bursts.length > 24) this.bursts.shift(); this.bursts.push({ x, y, text, color: color || "#fff", life: 1, vy: -38 }); }
  kick(p) { this.shake = Math.min(10, this.shake + p); }
  spawnDust(x, y, n, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      if (this.puffs.length > 170) this.puffs.shift();
      const a = Math.random() * 6.283, sp = (opt.sp || 16) * (0.4 + Math.random());
      this.puffs.push({ x, y, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp - (opt.up || 6), life: 0.4 + Math.random() * (opt.life || 0.4), r: (opt.r || 4) * (0.6 + Math.random()), c: opt.c || "237,212,160" });
    }
  }
  ring(x, y, color) { if (this.rings.length > 30) this.rings.shift(); this.rings.push({ x, y, r: 4, life: 1, color: color || "#f3c44e" }); }
  celebrateLayer() { if (this._topX != null) { this.ring(this._topX, this._topY, "#ffe39a"); this.ring(this._topX, this._topY, "#f3c44e"); this.spawnDust(this._topX, this._topY, 18, { sp: 60, up: 34, r: 5, life: 0.85 }); } this.kick(4); }
  whipAt(x, y) {
    let best = null, bd = 1e9;
    for (const h of this.workerHits) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bd) { bd = d; best = h; } }
    const p = best && bd < (best.r * best.r * 4) ? best : { x, y: y };
    if (best && bd < (best.r * best.r * 4)) best.w.whipT = 2.6;
    this.whipFlash = 0.7; this.kick(2);
    this.spawnDust(p.x, p.y, 6, { sp: 26, up: 10, r: 3, life: 0.5 }); this.ring(p.x, p.y, "#ffd27a");
  }
  _updateFx(ctx, dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) { const p = this.puffs[i]; p.life -= dt; if (p.life <= 0) { this.puffs.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 24 * dt; p.vx *= 0.95; ctx.fillStyle = `rgba(${p.c},${Math.min(0.55, p.life) * 0.85})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.5 - p.life), 0, 7); ctx.fill(); }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life -= dt * 1.4; if (r.life <= 0) { this.rings.splice(i, 1); continue; } r.r += 130 * dt; ctx.strokeStyle = r.color; ctx.globalAlpha = Math.max(0, r.life) * 0.55; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    if (this.whipFlash > 0) this.whipFlash = Math.max(0, this.whipFlash - dt * 1.6);
  }
  _clouds(ctx, vw, vh, sk, dt) {
    for (const c of this.clouds) {
      c.x += c.sp * dt; if (c.x > 1.25) c.x -= 1.5;
      const cx = c.x * (vw + 220) - 110, cy = vh * c.y + 6, w = 70 * c.s, h = 18 * c.s, a = 0.22 * (1 - sk.tint);
      const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, w); gr.addColorStop(0, `rgba(255,250,238,${a})`); gr.addColorStop(1, "rgba(255,250,238,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(cx, cy, w, h, 0, 0, 7); ctx.fill();
    }
  }

  camera(state, vw, vh) {
    const g = wonderGeom(state.wonderIndex);
    const b1 = pyramidBounds(g.base, g.layers, 1), w1 = b1.maxX - b1.minX, h1 = b1.maxY - b1.minY;
    const mobile = vw < 860;
    const u = Math.max(3.6, Math.min(82, Math.min(vw * (mobile ? 0.86 : 0.62) * this.zoom / w1, vh * (mobile ? 0.34 : 0.62) * this.zoom / h1)));
    const b = pyramidBounds(g.base, g.layers, u);
    return { u, ox: vw / 2 - (b.minX + b.maxX) / 2 + this.pan.x, oy: vh * (mobile ? 0.52 : 0.7) - b.maxY + this.pan.y, g, bounds: b };
  }
  _rebuildCache(cam, state, dpr) {
    const g = cam.g, wonder = wonderFor(state.wonderIndex), completed = state.complete ? g.layers : state.layer;
    const sc = Math.min(2, Math.max(1, dpr || 1)), key = `${state.wonderIndex}|${completed}|${cam.u.toFixed(2)}|${sc}`;
    if (key === this.cacheKey) return;
    this.cacheKey = key;
    const b = cam.bounds, pad = this.pad, W = Math.ceil(b.maxX - b.minX + pad * 2), H = Math.ceil(b.maxY - b.minY + pad * 2);
    this.cacheW = W; this.cacheH = H; this.cache.width = Math.max(1, Math.ceil(W * sc)); this.cache.height = Math.max(1, Math.ceil(H * sc));
    const cc = this.cctx; cc.setTransform(sc, 0, 0, sc, 0, 0); cc.clearRect(0, 0, W, H);
    const local = { u: cam.u, ox: pad - b.minX, oy: pad - b.minY };
    this.cacheOffX = b.minX - pad; this.cacheOffY = b.minY - pad;
    for (let j = 0; j < completed; j++) { const cells = layerCells(g.base, j); for (const c of cells) { const p = project(c.gx, c.gy, j + 1, local); paintCube(cc, cubeFaces(p.x, p.y, cam.u), wonder.faces, cam.u, true); } }
  }

  frame(state, stats, dt, vw, vh) {
    const ctx = this.ctx;
    const dpr = vw > 0 ? this.canvas.width / vw : 1;
    if (!this.grainPat && this.grain) this.grainPat = ctx.createPattern(this.grain, "repeat");
    const phase = (state.clock % DAY_LEN) / DAY_LEN, sk = sky(phase), hY = vh * 0.16;

    // sky strip
    const sg = ctx.createLinearGradient(0, 0, 0, hY + 40); sg.addColorStop(0, sk.top); sg.addColorStop(1, mix(sk.top, sk.bot, 0.85));
    ctx.fillStyle = sg; ctx.fillRect(0, 0, vw, hY + 40);
    const sunX = vw * (0.1 + 0.8 * phase), sunY = hY * (0.85 - Math.sin(phase * Math.PI) * 0.5) + 6;
    this._clouds(ctx, vw, vh, sk, dt);
    if (!(phase > 0.6 && phase < 0.85)) {
      const sun = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, 120); sun.addColorStop(0, "rgba(255,245,212,.95)"); sun.addColorStop(0.5, "rgba(255,214,150,.4)"); sun.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sunX, sunY, 120, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff6da"; ctx.beginPath(); ctx.arc(sunX, sunY, 20, 0, 7); ctx.fill();
    } else { ctx.fillStyle = "rgba(248,250,255,.9)"; ctx.beginPath(); ctx.arc(vw * 0.78, hY * 0.5, 16, 0, 7); ctx.fill(); }

    // full desert ground
    const gg = ctx.createLinearGradient(0, hY, 0, vh);
    gg.addColorStop(0, mix("#e9c98c", "#241d36", sk.tint * 0.55)); gg.addColorStop(1, mix("#caa063", "#181430", sk.tint * 0.55));
    ctx.fillStyle = gg; ctx.fillRect(0, hY, vw, vh - hY);
    // far dunes along the horizon
    for (let d = 0; d < 2; d++) { ctx.fillStyle = mix(d ? "#dcb87c" : "#e8c389", "#2a2440", sk.tint * 0.55); ctx.beginPath(); ctx.moveTo(0, vh); const base = hY + 6 + d * 14; ctx.moveTo(-10, base); for (let x = -10; x <= vw + 10; x += 34) ctx.lineTo(x, base + Math.sin((x + this.pan.x * 0.1 + d * 90) * 0.007) * (12 - d * 4)); ctx.lineTo(vw + 10, vh); ctx.lineTo(0, vh); ctx.closePath(); ctx.fill(); }
    if (this.grainPat) { ctx.save(); ctx.globalAlpha = 0.4 * (1 - sk.tint * 0.5); ctx.globalCompositeOperation = "overlay"; ctx.fillStyle = this.grainPat; ctx.fillRect(0, hY, vw, vh - hY); ctx.restore(); }

    const cam = this.camera(state, vw, vh);
    if (this.shake > 0.1) { cam.ox += (Math.random() - 0.5) * this.shake; cam.oy += (Math.random() - 0.5) * this.shake; this.shake *= 0.85; }
    const g = cam.g, Z = zones(g.base);

    this._nile(ctx, cam, g, Z, state, sk, dt);
    this._zoneProps(ctx, cam, g, Z, state, sk, true);   // back props
    this._castShadow(ctx, cam, g, sk);

    // pyramid: cached completed layers
    this._rebuildCache(cam, state, dpr);
    ctx.drawImage(this.cache, cam.ox + this.cacheOffX, cam.oy + this.cacheOffY, this.cacheW, this.cacheH);

    // active layer: only the cubes workers have actually delivered are solid
    if (!state.complete) {
      const wonder = wonderFor(state.wonderIndex), cells = layerCells(g.base, state.layer);
      ctx.globalAlpha = 0.13;
      for (let i = this.shown; i < cells.length; i++) { const c = cells[i], p = project(c.gx, c.gy, state.layer + 1, cam); poly(ctx, cubeFaces(p.x, p.y, cam.u).top, wonder.faces[0]); }
      ctx.globalAlpha = 1;
      for (let i = 0; i < this.shown && i < cells.length; i++) { const c = cells[i], p = project(c.gx, c.gy, state.layer + 1, cam); paintCube(ctx, cubeFaces(p.x, p.y, cam.u), wonder.faces, cam.u, false); }
    } else this._capstone(ctx, cam, g, state);

    this._crew(ctx, cam, g, state, stats, dt);
    this._animals(ctx, cam, g, Z, state, stats, dt);
    this._zoneProps(ctx, cam, g, Z, state, sk, false);  // front props

    this._weather(ctx, state, dt, vw, vh, hY);
    this._updateFx(ctx, dt);
    ctx.fillStyle = `rgba(235,215,170,${0.18 * (1 - sk.tint)})`;
    for (const m of this.motes) { m.x += (m.sp * 0.04 + 0.02) * dt; if (m.x > 1.05) m.x -= 1.1; ctx.fillRect(m.x * (vw + 40) - 20, hY + m.y * (vh - hY) + Math.sin(state.clock * 0.8 + m.ph) * 4, m.sz, m.sz); }

    if (this.whipFlash > 0.01) { ctx.fillStyle = `rgba(255,250,220,${this.whipFlash * 0.1})`; ctx.fillRect(0, 0, vw, vh); }
    if (sk.tint > 0.01) { ctx.fillStyle = `rgba(10,16,44,${sk.tint * 0.4})`; ctx.fillRect(0, 0, vw, vh); }
    if (this.grainPat) { ctx.save(); ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = "overlay"; ctx.fillStyle = this.grainPat; ctx.fillRect(0, 0, vw, vh); ctx.restore(); }
    const vg = ctx.createRadialGradient(vw / 2, vh * 0.46, Math.min(vw, vh) * 0.36, vw / 2, vh * 0.52, Math.max(vw, vh) * 0.76);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(10,6,2,0.24)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);

    for (let i = this.bursts.length - 1; i >= 0; i--) { const b = this.bursts[i]; b.life -= dt * 0.9; b.y += b.vy * dt; if (b.life <= 0) { this.bursts.splice(i, 1); continue; } ctx.globalAlpha = Math.max(0, b.life); ctx.font = "bold 16px ui-sans-serif,system-ui"; ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillText(b.text, b.x + 1, b.y + 1); ctx.fillStyle = b.color; ctx.fillText(b.text, b.x, b.y); ctx.globalAlpha = 1; }
  }

  _castShadow(ctx, cam, g, sk) {
    const m = g.base, sh = cam.u * 0.55;
    const pts = [project(0, 0, 0, cam), project(m - 1, 0, 0, cam), project(m - 1, m - 1, 0, cam), project(0, m - 1, 0, cam)].map((p) => ({ x: p.x + sh, y: p.y + sh * 0.5 }));
    ctx.save(); try { ctx.filter = `blur(${Math.max(3, cam.u * 0.3)}px)`; } catch (e) {} ctx.globalAlpha = 0.3 * (1 - sk.tint * 0.4); poly(ctx, pts, "#15100a"); ctx.restore();
  }

  _nile(ctx, cam, g, Z, state, sk, dt) {
    const c = (g.base - 1) / 2;
    const pts = [project(-12, -9, 0, cam), project(g.base + 12, -9, 0, cam), project(g.base + 12, -5, 0, cam), project(-12, -5, 0, cam)];
    const ng = ctx.createLinearGradient(0, pts[0].y, 0, pts[2].y);
    ng.addColorStop(0, mix("#3f93b4", "#16314a", sk.tint * 0.6)); ng.addColorStop(1, mix("#2f7fa0", "#11283c", sk.tint * 0.6));
    poly(ctx, pts, ng);
    ctx.globalAlpha = 0.2 * (1 - sk.tint); ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 5; i++) { const yy = lerp(pts[3].y, pts[2].y, i / 5) + Math.sin(state.clock * 1.5 + i) * 2; ctx.fillRect(0, yy, this.canvas.width, 1.5); }
    ctx.globalAlpha = 1;
  }

  _slot(cam, anchor, i) {
    const col = i % anchor.cols, row = Math.floor(i / anchor.cols);
    return { gx: anchor.gx + col * anchor.sp, gy: anchor.gy + row * anchor.sp };
  }
  _zoneProps(ctx, cam, g, Z, state, sk, back) {
    const u = cam.u, list = [];
    for (const b of BUILDINGS) {
      const z = Z[b.zone]; if (!z || !!z.back !== !!back) continue;
      const n = Math.min(state.buildings[b.id] || 0, 16);
      for (let i = 0; i < n; i++) { const s = this._slot(cam, z, i), p = project(s.gx, s.gy, 0, cam); list.push({ p, t: b.id, zone: b.zone, sk }); }
    }
    // camps near the ramp (front)
    if (!back) for (let i = 0; i < 5; i++) { const p = project(g.base * 0.5 - 2 + i, g.base + 3.2, 0, cam); list.push({ p, t: "camp", sk }); }
    list.sort((a, b2) => a.p.y - b2.p.y);
    for (const it of list) this._building(ctx, it.t, it.p.x, it.p.y, u, sk, it.zone);
  }

  _building(ctx, t, x, y, u, sk, zone) {
    const tint = (a, b, k) => mix(a, b, sk.tint * 0.5 + (k || 0));
    if (t === "farm") { poly(ctx, [{ x: x - u * .7, y }, { x, y: y + u * .35 }, { x: x + u * .7, y }, { x, y: y - u * .35 }], tint("#7faa45", "#243a1e")); ctx.strokeStyle = tint("#5e8233", "#1e2e16"); ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * u * .22, y - u * .15); ctx.lineTo(x + i * u * .22 + u * .35, y + u * .02); ctx.stroke(); } return; }
    if (t === "well") { isoBox(ctx, x, y, u * .34, u * .3, tint("#cdbb95", "#2a2238"), tint("#9c8a66", "#1e1a2c"), tint("#b6a079", "#241f33")); ctx.fillStyle = tint("#2a3b55", "#11202f"); ctx.beginPath(); ctx.ellipse(x, y - u * .3, u * .26, u * .13, 0, 0, 7); ctx.fill(); return; }
    if (t === "lumber") { ctx.strokeStyle = tint("#7c5530", "#241a12"); ctx.lineWidth = u * .12; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - u * .1, y - u * .8); ctx.stroke(); ctx.fillStyle = tint("#5f8a3e", "#1f3018"); for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; ctx.beginPath(); ctx.ellipse(x - u * .1 + Math.cos(a) * u * .3, y - u * .85 + Math.sin(a) * u * .16, u * .26, u * .12, a, 0, 7); ctx.fill(); } return; }
    if (t === "quarry") { ctx.fillStyle = tint("#9c8763", "#1d1830"); ctx.beginPath(); ctx.ellipse(x, y, u * .7, u * .32, 0, 0, 7); ctx.fill(); ctx.fillStyle = tint("#74634a", "#141022"); ctx.beginPath(); ctx.ellipse(x, y, u * .45, u * .2, 0, 0, 7); ctx.fill(); for (let k = 0; k < 3; k++) isoBox(ctx, x - u * .3 + k * u * .3, y - u * .05, u * .16, u * .2, tint("#e3d3aa", "#2a2236"), tint("#a99268", "#1e1a2a"), tint("#c6b488", "#241f31")); return; }
    if (t === "granite" || t === "copper") { const oc = t === "granite" ? "#b07487" : "#d08047"; isoBox(ctx, x, y, u * .5, u * .42, tint("#8a7a5e", "#221c30"), tint("#5f5440", "#15111f"), tint("#74664d", "#1b1726")); ctx.fillStyle = tint("#1a1320", "#0a0814"); poly(ctx, [{ x: x - u * .16, y: y - u * .04 }, { x: x + u * .16, y: y - u * .04 }, { x: x + u * .12, y: y - u * .3 }, { x: x - u * .12, y: y - u * .3 }], tint("#1a1320", "#0a0814")); ctx.fillStyle = tint(oc, "#201018", 0); ctx.beginPath(); ctx.arc(x + u * .3, y - u * .14, u * .08, 0, 7); ctx.fill(); return; }
    if (t === "ramp") { isoBox(ctx, x, y, u * .3, u * .16, tint("#caa06a", "#241d33"), tint("#9a734a", "#181323"), tint("#b08a5a", "#1f1830")); ctx.strokeStyle = tint("#6b4a28", "#140f08"); ctx.lineWidth = u * .06; ctx.beginPath(); ctx.moveTo(x - u * .3, y); ctx.lineTo(x + u * .3, y - u * .02); ctx.stroke(); return; }
    if (t === "market") { isoBox(ctx, x, y, u * .3, u * .26, tint("#caa06a", "#241d33"), tint("#9a734a", "#181323"), tint("#b08a5a", "#1f1830")); poly(ctx, [{ x: x - u * .42, y: y - u * .26 }, { x: x + u * .42, y: y - u * .26 }, { x: x + u * .3, y: y - u * .44 }, { x: x - u * .3, y: y - u * .44 }], t.zone === 5 ? "#a44" : tint("#cf5b4a", "#3a1a14")); return; }
    if (t === "temple") { isoBox(ctx, x, y, u * .8, u * .7, tint("#e6dcc0", "#2a2540"), tint("#b6a982", "#1c1830"), tint("#cabd95", "#221d36")); for (let k = -1; k <= 1; k++) isoBox(ctx, x + k * u * .4, y + u * .1, u * .1, u * .5, tint("#efe7cf", "#2c2742"), tint("#c3b691", "#1e1a30"), tint("#d6c9a2", "#241f38")); poly(ctx, [{ x: x - u * .9, y: y - u * .7 }, { x: x + u * .9, y: y - u * .7 }, { x: x, y: y - u * 1.1 }], tint("#caa6df", "#2a2540")); return; }
    if (t === "storage") { for (let k = 0; k < 3; k++) isoBox(ctx, x - u * .2 + k * u * .22, y - (k % 2) * u * .05, u * .16, u * .26, tint("#e3d3aa", "#2a2236"), tint("#a99268", "#1e1a2a"), tint("#c6b488", "#241f31")); return; }
    if (t === "camp") { poly(ctx, [{ x: x - u * .32, y: y + u * .04 }, { x: x + u * .32, y: y + u * .04 }, { x: x, y: y - u * .5 }], tint("#d9c39a", "#2a2338")); poly(ctx, [{ x: x, y: y + u * .04 }, { x: x + u * .32, y: y + u * .04 }, { x: x, y: y - u * .5 }], tint("#c2a877", "#221c30")); return; }
    // default: village / granary / docks → mud house
    if (zone === "nile") { isoBox(ctx, x, y, u * .5, u * .18, tint("#8a6f4a", "#1c1626"), tint("#6e573a", "#141020"), tint("#7c6342", "#181222")); return; }
    const dome = t === "granary";
    isoBox(ctx, x, y, u * .42, u * .55, tint("#c39568", "#241d33"), tint("#9a734a", "#181323"), tint("#b0855b", "#1f1830"));
    if (dome) { ctx.fillStyle = tint("#d8b87f", "#2a2238"); ctx.beginPath(); ctx.ellipse(x, y - u * .55, u * .42, u * .26, 0, Math.PI, 0); ctx.fill(); }
    else { poly(ctx, [{ x: x - u * .5, y: y - u * .55 }, { x: x + u * .5, y: y - u * .55 }, { x: x, y: y - u * .85 }], tint("#caa06a", "#2a2238")); ctx.fillStyle = tint("#3a2a1a", "#0f0a16"); ctx.fillRect(x - u * .1, y - u * .3, u * .2, u * .3); }
  }

  _newWorker() {
    const i = (Math.random() * SKINS.length) | 0;
    return { state: "fetch", target: -1, p: 0, phase: Math.random(), animT: Math.random() * 9, lane: (Math.random() - 0.5) * 2, foot: (Math.random() - 0.5), whipT: 0, timer: 0, placed: false, idleWipe: Math.random() < 0.4, pal: { skin: SKINS[i], skinDark: mix(SKINS[i], "#000", 0.28), cloth: CLOTHS[(Math.random() * CLOTHS.length) | 0] } };
  }

  _crew(ctx, cam, g, state, stats, dt) {
    const c = (g.base - 1) / 2, foot = project(c, g.base + 2.2, 0, cam);
    const key = state.wonderIndex + "/" + state.layer + "/" + (state.complete ? "c" : "b");
    if (this.revealKey !== key) { this.revealKey = key; this.shown = 0; for (const w of this.workers) { w.state = "fetch"; w.target = -1; } }
    const cells = state.complete ? [] : layerCells(g.base, state.layer);
    let real = 0;
    if (!state.complete && cells.length) { const need = (wonderGeom(state.wonderIndex).blocksPerCube) * cells.length; real = Math.min(cells.length, Math.floor(state.blocksInLayer / Math.max(1, need) * cells.length)); }
    if (real - this.shown > cells.length * 0.5) this.shown = Math.max(this.shown, real - Math.ceil(cells.length * 0.25)); // snap if far behind

    const target = state.complete ? 6 : Math.max(3, Math.min(40, Math.round(stats.builders || 3)));
    while (this.workers.length < target) this.workers.push(this._newWorker());
    while (this.workers.length > target) this.workers.pop();

    let active = 0; for (const w of this.workers) if (w.state === "haul" || w.state === "place") active++;
    let assignNext = this.shown + active;
    const whip = !!(state.whip && state.whip.boostT > 0);
    const moveBase = 0.4 + Math.min(2.4, (stats.buildRate || 0) * 0.05);
    const u = cam.u, hsize = Math.max(12, u * 1.5);
    this.workerHits = [];
    const entries = [];

    for (const w of this.workers) {
      w.animT += dt; if (w.whipT > 0) w.whipT -= dt;
      const ms = moveBase * (w.whipT > 0 ? 2.4 : 1) * (whip ? 1.3 : 1);
      const cell = (w.target >= 0 && cells[w.target]) || cells[Math.min(this.shown, cells.length - 1)] || { gx: c, gy: c };
      const tp = project(cell.gx, cell.gy, state.layer + 1, cam);
      let x, y, pose;
      if (w.state === "fetch") {
        x = foot.x + w.lane * u * 1.5; y = foot.y + w.foot * u * 0.7;
        pose = { dir: w.lane < 0 ? -1 : 1, pal: w.pal, t: w.animT, moving: false, carry: false, bend: 0, wipe: w.idleWipe ? (Math.sin(w.animT) > 0.4 ? 1 : 0) : 0, phase: w.phase };
        if (!state.complete && cells.length && assignNext < real) { w.target = assignNext; assignNext++; active++; w.state = "haul"; w.p = 0; }
      } else if (w.state === "haul") {
        w.p += ms * dt * 0.55; w.phase += ms * dt * 6;
        if (w.p >= 1) { w.p = 1; w.state = "place"; w.timer = 0.42 / (w.whipT > 0 ? 1.6 : 1); w.placed = false; }
        x = lerp(foot.x, tp.x, w.p) + (1 - w.p) * w.lane * u * 0.6; y = lerp(foot.y, tp.y, w.p);
        pose = { dir: tp.x >= foot.x ? 1 : -1, pal: w.pal, t: w.animT, moving: true, carry: true, bend: 0, phase: w.phase };
        if (Math.random() < dt * 3 * ms) this.spawnDust(x, y, 1, { sp: 6, up: 3, r: 2, life: 0.3 });
      } else if (w.state === "place") {
        w.timer -= dt; const pr = 1 - Math.max(0, w.timer) / 0.42;
        x = tp.x; y = tp.y;
        pose = { dir: tp.x >= foot.x ? 1 : -1, pal: w.pal, t: w.animT, moving: false, carry: pr < 0.55, bend: Math.sin(Math.min(1, pr) * Math.PI), phase: w.phase };
        if (!w.placed && pr > 0.5) { w.placed = true; if (this.shown <= w.target) this.shown = w.target + 1; this.spawnDust(x, y + u * 0.06, 5, { sp: 20, up: 8, r: 3, life: 0.5 }); this.ring(x, y, "#e9d6ad"); this._topX = tp.x; this._topY = tp.y; }
        if (w.timer <= 0) { w.state = "return"; w.p = 1; }
      } else {
        w.p -= ms * dt * 0.85; w.phase += ms * dt * 6;
        if (w.p <= 0) { w.p = 0; w.state = "fetch"; w.target = -1; }
        x = lerp(foot.x, tp.x, Math.max(0, w.p)) + (1 - w.p) * w.lane * u * 0.6; y = lerp(foot.y, tp.y, Math.max(0, w.p));
        pose = { dir: tp.x >= foot.x ? -1 : 1, pal: w.pal, t: w.animT, moving: true, carry: false, phase: w.phase };
      }
      entries.push({ x, y, pose, w });
      this.workerHits.push({ x, y: y - hsize * 0.5, r: Math.max(18, u), w });
    }
    entries.sort((a, b) => a.y - b.y);
    for (const e of entries) {
      shadow(ctx, e.x, e.y, hsize * 0.22);
      if (e.w.whipT > 0) { ctx.globalAlpha = Math.min(1, e.w.whipT) * 0.5; ctx.strokeStyle = "#ffe39a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y - hsize * 0.55, hsize * 0.5, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      drawHuman(ctx, e.x, e.y, hsize, e.pose);
    }
  }

  _animals(ctx, cam, g, Z, state, stats, dt) {
    const A = project(-3, g.base + 3, 0, cam), Bp = project(g.base + 2, g.base + 3, 0, cam);
    let machines = 0; for (const id of ["wooden_rollers", "rope_winch", "sled", "crane", "lubrication", "massive_ramp", "elevator", "marvel"]) machines += state.buildings[id] || 0;
    const target = Math.min(6, Math.floor(machines / 3));
    if (!this.animals) this.animals = [];
    while (this.animals.length < target) this.animals.push({ t: Math.random(), lane: (Math.random() - 0.5) * 0.5, sp: 0.05 + Math.random() * 0.05, ph: Math.random(), type: ["ox", "ox", "elephant"][this.animals.length % 3] });
    while (this.animals.length > target) this.animals.pop();
    const u = cam.u, dir = Bp.x >= A.x ? 1 : -1, speed = 0.3 + Math.min(1.2, (stats.buildRate || 0) * 0.03);
    for (const a of this.animals.slice().sort((p, q) => p.t - q.t)) { a.t += a.sp * speed * dt; if (a.t > 1) a.t -= 1; const x = lerp(A.x, Bp.x, a.t), y = lerp(A.y, Bp.y, a.t) + a.lane * u; shadow(ctx, x, y, u * (a.type === "elephant" ? 0.95 : 0.7)); drawAnimal(ctx, x, y, u * 0.95, a.t * 5 + a.ph, dir, a.type); }
    // crocodiles in the Nile
    const cc = project((g.base - 1) / 2, -6.5, 0, cam);
    drawAnimal(ctx, cc.x - u * 2, cc.y, u * 0.8, state.clock * 0.08, 1, "croc");
    drawAnimal(ctx, cc.x + u * 3, cc.y + u * 0.5, u * 0.8, state.clock * 0.06 + 2, -1, "croc");
  }

  _capstone(ctx, cam, g, state) {
    const w = wonderFor(state.wonderIndex), cx = g.layers - 0.5, p = project(cx, cx, g.layers, cam);
    const hw = cam.u * 0.85, q = cam.u * 0.42, ch = cam.u * 1.25;
    const A = { x: p.x, y: p.y - q }, B = { x: p.x + hw, y: p.y }, C = { x: p.x, y: p.y + q }, D = { x: p.x - hw, y: p.y }, apex = { x: p.x, y: p.y - ch };
    const pulse = 0.5 + 0.5 * Math.sin(state.clock * 3);
    ctx.save(); ctx.shadowColor = w.capstone; ctx.shadowBlur = 18 + pulse * 18;
    poly(ctx, [D, C, apex], mix(w.capstone, "#000", 0.25)); poly(ctx, [C, B, apex], w.capstone); poly(ctx, [A, B, apex], mix(w.capstone, "#fff", 0.2));
    ctx.restore();
    ctx.globalAlpha = 0.12 + pulse * 0.1; ctx.fillStyle = w.capstone; ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(apex.x - 60, 0); ctx.lineTo(apex.x + 60, 0); ctx.fill(); ctx.globalAlpha = 1;
  }

  _weather(ctx, state, dt, vw, vh, hY) {
    const id = state.weather.id;
    if (id === "sandstorm") { ctx.fillStyle = "rgba(200,160,90,.14)"; ctx.fillRect(0, 0, vw, vh); for (const p of this.sand) { if (p.life <= 0) { p.x = Math.random() * vw; p.y = hY + Math.random() * (vh - hY); p.vx = 200 + Math.random() * 240; p.life = 0.6 + Math.random(); } p.x += p.vx * dt; p.life -= dt; if (p.x > vw) p.x = -4; ctx.fillStyle = "rgba(214,180,120,.4)"; ctx.fillRect(p.x, p.y, 7, 1.3); } } else for (const p of this.sand) p.life = 0;
    const ft = id === "flood" ? 1 : 0; this.flood += (ft - this.flood) * Math.min(1, dt * 0.5);
    if (this.flood > 0.01) { ctx.fillStyle = `rgba(70,150,180,${0.12 * this.flood})`; ctx.fillRect(0, hY + 20, vw, vh); }
    if (id === "heat") { ctx.fillStyle = "rgba(255,140,40,.07)"; ctx.fillRect(0, hY, vw, vh - hY); }
  }
}
