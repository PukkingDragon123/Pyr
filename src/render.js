// Isometric Canvas2D renderer. Completed pyramid layers are cached to an
// offscreen canvas (one blit/frame); only the active layer, capstone, workers,
// weather and tint redraw per frame (performance law).
import { wonderFor, wonderGeom } from "./data.js";
import { project, cubeFaces, layerSide, layerCells, pyramidBounds } from "./iso.js";
import { drawHuman, drawAnimal, drawWhip } from "./sprites.js";

export const DAY_LEN = 200; // seconds per full day/night cycle

const SKINS = ["#caa06a", "#b5895a", "#9a6f44", "#d8b483", "#a87a4c"];
const CLOTHS = ["#3a6ea5", "#c0392b", "#d4a017", "#2c8c84", "#7b4ea0"];
const OVERSEER_PAL = { skin: "#9a6f44", skinDark: "#6e4f30", cloth: "#b8202a" };
function shadow(ctx, x, y, rx) {
  ctx.fillStyle = "rgba(40,26,12,0.2)";
  ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.4, 0, 0, 7); ctx.fill();
}

// ---- colour helpers ----
function hx(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function css(rgb) { return `rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(a, b, t) { const A = hx(a), B = hx(b); return css([lerp(A[0],B[0],t), lerp(A[1],B[1],t), lerp(A[2],B[2],t)]); }

const SKY = [
  { p: 0.00, top: "#caa6c0", bot: "#ffce9a" }, // dawn
  { p: 0.22, top: "#7fb4dd", bot: "#f6d99c" }, // day
  { p: 0.50, top: "#a85a4a", bot: "#f0a85a" }, // dusk
  { p: 0.72, top: "#141d3a", bot: "#2e2f55" }, // night
  { p: 1.00, top: "#caa6c0", bot: "#ffce9a" },
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

// A polished, lit block: flat faces, then volume (AO gradient on the sides, a
// sun sheen on the top) and crisp lit/shadow edges. `rich` shading is baked
// into the cached pyramid (drawn once); the live layer uses the cheap path.
function paintCube(ctx, f, faces, u, rich) {
  poly(ctx, f.left, faces[2]);
  poly(ctx, f.right, faces[1]);
  poly(ctx, f.top, faces[0]);
  if (rich && u >= 5) {
    const topY = f.top[0].y, botY = f.left[2].y;
    let g = ctx.createLinearGradient(0, topY, 0, botY);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.26)");
    poly(ctx, f.left, g);
    g = ctx.createLinearGradient(0, topY, 0, botY);
    g.addColorStop(0, "rgba(0,0,0,0.05)"); g.addColorStop(1, "rgba(0,0,0,0.38)");
    poly(ctx, f.right, g);
    const tg = ctx.createLinearGradient(f.top[3].x, f.top[0].y, f.top[1].x, f.top[2].y);
    tg.addColorStop(0, "rgba(255,248,225,0.18)"); tg.addColorStop(0.6, "rgba(255,248,225,0)");
    poly(ctx, f.top, tg);
  }
  if (u < 8) return;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(28,18,10,0.3)"; // shadow seams
  ctx.beginPath();
  ctx.moveTo(f.left[1].x, f.left[1].y); ctx.lineTo(f.left[2].x, f.left[2].y);
  ctx.moveTo(f.top[3].x, f.top[3].y); ctx.lineTo(f.top[2].x, f.top[2].y); ctx.lineTo(f.top[1].x, f.top[1].y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,248,228,0.36)"; // lit top edges
  ctx.beginPath(); ctx.moveTo(f.top[3].x, f.top[3].y); ctx.lineTo(f.top[0].x, f.top[0].y); ctx.lineTo(f.top[1].x, f.top[1].y); ctx.stroke();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.pan = { x: 0, y: 0 }; this.zoom = 1;
    this.cache = document.createElement("canvas"); this.cctx = this.cache.getContext("2d");
    this.cacheKey = ""; this.bounds = null; this.pad = 40;
    this.workers = []; this.animals = []; this.bursts = [];
    this.sand = []; this.rain = []; this.flood = 0;
    this.puffs = []; this.rings = []; this.motes = [];
    for (let i = 0; i < 220; i++) this.sand.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    for (let i = 0; i < 160; i++) this.rain.push({ x: 0, y: 0, v: 0, life: 0 });
    for (let i = 0; i < 26; i++) this.motes.push({ x: Math.random(), y: Math.random(), sp: 0.3 + Math.random() * 0.7, sz: 1 + Math.random() * 1.6, ph: Math.random() * 6.28 });
    this.clouds = [];
    for (let i = 0; i < 4; i++) this.clouds.push({ x: Math.random() * 1.2, y: 0.1 + Math.random() * 0.24, s: 0.6 + Math.random() * 0.9, sp: 0.004 + Math.random() * 0.006 });
    this.grain = this._makeGrain(); this.grainPat = null;
    this.huts = this._layoutCity();
    this.shake = 0; this.overseerCrack = 0; this.whipFlash = 0; this._osTimer = 0;
  }

  _makeGrain() {
    const n = 96, c = document.createElement("canvas"); c.width = c.height = n;
    const g = c.getContext("2d"), img = g.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 92 + Math.random() * 72; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return c;
  }
  _clouds(ctx, vw, vh, sk, dt) {
    for (const c of this.clouds) {
      c.x += c.sp * dt; if (c.x > 1.25) c.x -= 1.5;
      const cx = c.x * (vw + 220) - 110, cy = vh * c.y, w = 72 * c.s, h = 22 * c.s, a = 0.2 * (1 - sk.tint);
      const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, w);
      gr.addColorStop(0, `rgba(255,250,238,${a})`); gr.addColorStop(1, "rgba(255,250,238,0)");
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(cx, cy, w, h, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + w * 0.55, cy + h * 0.3, w * 0.7, h * 0.8, 0, 0, 7); ctx.fill();
    }
  }
  _castShadow(ctx, cam, g, sk) {
    const m = g.base, sh = cam.u * 0.55;
    const pts = [project(0, 0, 0, cam), project(m - 1, 0, 0, cam), project(m - 1, m - 1, 0, cam), project(0, m - 1, 0, cam)]
      .map((p) => ({ x: p.x + sh, y: p.y + sh * 0.5 }));
    ctx.save();
    try { ctx.filter = `blur(${Math.max(3, cam.u * 0.3)}px)`; } catch (e) {}
    ctx.globalAlpha = 0.3 * (1 - sk.tint * 0.4);
    poly(ctx, pts, "#15100a");
    ctx.restore();
  }

  // ---- VFX: dust puffs, expanding rings, screen punch ----
  spawnDust(x, y, n, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      if (this.puffs.length > 170) this.puffs.shift();
      const a = Math.random() * 6.283, sp = (opt.sp || 16) * (0.4 + Math.random());
      this.puffs.push({ x, y, vx: Math.cos(a) * sp * (opt.spread || 1), vy: -Math.abs(Math.sin(a)) * sp - (opt.up || 6),
        life: 0.4 + Math.random() * (opt.life || 0.4), r: (opt.r || 4) * (0.6 + Math.random()), c: opt.c || "237,212,160" });
    }
  }
  ring(x, y, color) { this.rings.push({ x, y, r: 4, life: 1, color: color || "#f3c44e" }); }
  whipCrack(big) { this.overseerCrack = 1; this.whipFlash = big ? 1 : 0.4; if (big) this._osTimer = 0.6; }
  celebrate(x, y) {
    this.ring(x, y, "#ffe39a"); this.ring(x, y, "#f3c44e");
    this.spawnDust(x, y, 18, { sp: 60, up: 34, r: 5, life: 0.85, c: "243,224,170" });
    this.kick(4);
  }
  celebrateLayer() { if (this._topX != null) this.celebrate(this._topX, this._topY); else this.kick(4); }
  _updateFx(ctx, dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]; p.life -= dt; if (p.life <= 0) { this.puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 24 * dt; p.vx *= 0.95;
      ctx.fillStyle = `rgba(${p.c},${Math.min(0.55, p.life) * 0.85})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.5 - p.life), 0, 7); ctx.fill();
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life -= dt * 1.4; if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      r.r += 130 * dt;
      ctx.strokeStyle = r.color; ctx.globalAlpha = Math.max(0, r.life) * 0.55; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (this.overseerCrack > 0) this.overseerCrack = Math.max(0, this.overseerCrack - dt * 2.4);
    if (this.whipFlash > 0) this.whipFlash = Math.max(0, this.whipFlash - dt * 1.6);
  }

  _layoutCity() {
    // deterministic ring of support-city slots around the base
    let s = 1337; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const out = [];
    for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * Math.PI * 2 + rnd() * 0.3;
      const rad = 1.04 + rnd() * 0.4;
      out.push({ a: ang, r: rad, h: 0.5 + rnd() * 0.7, kind: i % 7, j: rnd() });
    }
    return out;
  }

  addBurst(x, y, text, color) {
    if (this.bursts.length > 28) this.bursts.shift();
    this.bursts.push({ x, y, text, color: color || "#fff", life: 1, vy: -38 });
  }
  kick(p) { this.shake = Math.min(10, this.shake + p); }

  camera(state, vw, vh) {
    const g = wonderGeom(state.wonderIndex);
    const b1 = pyramidBounds(g.base, g.layers, 1);
    const w1 = b1.maxX - b1.minX, h1 = b1.maxY - b1.minY;
    const mobile = vw < 860;
    const targetW = vw * (mobile ? 0.84 : 0.6) * this.zoom;
    const targetH = vh * (mobile ? 0.3 : 0.56) * this.zoom;
    let u = Math.min(targetW / w1, targetH / h1);
    u = Math.max(3.2, Math.min(70, u));
    const b = pyramidBounds(g.base, g.layers, u);
    const baseFrac = mobile ? 0.52 : 0.8;
    const ox = vw / 2 - (b.minX + b.maxX) / 2 + this.pan.x;
    const oy = vh * baseFrac - b.maxY + this.pan.y;
    return { u, ox, oy, g, bounds: b };
  }

  _rebuildCache(cam, state, dpr) {
    const g = cam.g, wonder = wonderFor(state.wonderIndex);
    const completed = state.complete ? g.layers : state.layer;
    const sc = Math.min(2, Math.max(1, dpr || 1));
    const key = `${state.wonderIndex}|${completed}|${cam.u.toFixed(2)}|${sc}`;
    if (key === this.cacheKey) return;
    this.cacheKey = key;
    const b = cam.bounds, pad = this.pad;
    const W = Math.ceil(b.maxX - b.minX + pad * 2), H = Math.ceil(b.maxY - b.minY + pad * 2);
    this.cacheW = W; this.cacheH = H;
    this.cache.width = Math.max(1, Math.ceil(W * sc)); this.cache.height = Math.max(1, Math.ceil(H * sc));
    const cc = this.cctx; cc.setTransform(sc, 0, 0, sc, 0, 0); cc.clearRect(0, 0, W, H);
    const local = { u: cam.u, ox: pad - b.minX, oy: pad - b.minY };
    this.cacheOffX = b.minX - pad; this.cacheOffY = b.minY - pad;
    for (let j = 0; j < completed; j++) this._drawLayer(cc, state, j, layerSide(g.base, j) ** 2, local, wonder, true);
  }

  _drawLayer(ctx, state, j, count, cam, wonder, rich) {
    const cells = layerCells(wonderGeom(state.wonderIndex).base, j);
    const n = Math.min(count, cells.length);
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const p = project(c.gx, c.gy, j + 1, cam);
      paintCube(ctx, cubeFaces(p.x, p.y, cam.u), wonder.faces, cam.u, rich);
    }
  }

  frame(state, stats, dt, vw, vh) {
    const ctx = this.ctx;
    const dpr = vw > 0 ? this.canvas.width / vw : 1;
    if (!this.grainPat && this.grain) this.grainPat = ctx.createPattern(this.grain, "repeat");
    const phase = (state.clock % DAY_LEN) / DAY_LEN;
    const sk = sky(phase);

    // sky — layered gradient
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, sk.top); grad.addColorStop(0.55, mix(sk.top, sk.bot, 0.7)); grad.addColorStop(1, sk.bot);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, vw, vh);

    const sunX = vw * (0.12 + 0.76 * phase);
    const sunY = vh * (0.62 - Math.sin(phase * Math.PI) * 0.5);
    const isNight = phase > 0.6 && phase < 0.85;

    this._clouds(ctx, vw, vh, sk, dt);

    if (isNight) {
      ctx.fillStyle = "rgba(248,250,255,.9)"; ctx.beginPath(); ctx.arc(vw * 0.8, vh * 0.2, 22, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.6)";
      for (let i = 0; i < 50; i++) ctx.fillRect((i * 8821 % vw), (i * 5333 % (vh * 0.55)), 1.5, 1.5);
    } else {
      const hg = ctx.createRadialGradient(sunX, vh * 0.6, 10, sunX, vh * 0.6, vw * 0.7);
      hg.addColorStop(0, `rgba(255,226,160,${0.32 * (1 - sk.tint)})`); hg.addColorStop(1, "rgba(255,226,160,0)");
      ctx.fillStyle = hg; ctx.fillRect(0, 0, vw, vh);
      const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 150);
      sg.addColorStop(0, "rgba(255,245,212,.98)"); sg.addColorStop(0.5, "rgba(255,214,150,.5)"); sg.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunX, sunY, 150, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff6da"; ctx.beginPath(); ctx.arc(sunX, sunY, 27, 0, 7); ctx.fill();
    }

    // distant dunes with shading
    const hY = vh * 0.6;
    const px = this.pan.x * 0.12;
    for (let d = 0; d < 3; d++) {
      const top = mix(mix("#f0cf95", "#caa066", d / 2), "#3a2f4a", sk.tint * 0.6);
      const base = hY + d * 24;
      const dg = ctx.createLinearGradient(0, base - 30, 0, base + 90);
      dg.addColorStop(0, mix(top, "#fff", 0.12)); dg.addColorStop(1, mix(top, "#000", 0.14));
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.moveTo(-50, vh);
      const amp = 26 - d * 6;
      for (let x = -50; x <= vw + 50; x += 36)
        ctx.lineTo(x, base + Math.sin((x + px + d * 120) * 0.006) * amp);
      ctx.lineTo(vw + 50, vh); ctx.closePath(); ctx.fill();
    }
    // atmospheric haze band blending dunes into the sky
    const haze = ctx.createLinearGradient(0, hY - 44, 0, hY + 64);
    haze.addColorStop(0, `rgba(245,224,180,${0.5 * (1 - sk.tint)})`); haze.addColorStop(1, "rgba(245,224,180,0)");
    ctx.fillStyle = haze; ctx.fillRect(0, hY - 44, vw, 110);

    // ground sand: gradient + subtle baked grain
    const gg = ctx.createLinearGradient(0, hY + 30, 0, vh);
    gg.addColorStop(0, mix("#e2c184", "#2a2440", sk.tint * 0.55)); gg.addColorStop(1, mix("#c69d60", "#1e1832", sk.tint * 0.55));
    ctx.fillStyle = gg; ctx.fillRect(0, hY + 30, vw, vh);
    if (this.grainPat) {
      ctx.save(); ctx.globalAlpha = 0.45 * (1 - sk.tint * 0.5); ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = this.grainPat; ctx.fillRect(0, hY + 30, vw, vh - hY - 30); ctx.restore();
    }

    // camera + screen shake
    const cam = this.camera(state, vw, vh);
    if (this.shake > 0.1) { cam.ox += (Math.random() - 0.5) * this.shake; cam.oy += (Math.random() - 0.5) * this.shake; this.shake *= 0.86; }
    const g = cam.g;

    // construction-site platform + the pyramid's cast shadow
    this._platform(ctx, cam, g, sk);
    this._castShadow(ctx, cam, g, sk);
    // support city
    this._city(ctx, cam, g, state, sk);

    // pyramid: cached completed layers (rendered at device resolution → crisp)
    this._rebuildCache(cam, state, dpr);
    ctx.drawImage(this.cache, cam.ox + this.cacheOffX, cam.oy + this.cacheOffY, this.cacheW, this.cacheH);

    // active (partial) layer — with a faint "foundation" ghost of unbuilt cells
    if (!state.complete) {
      const j = state.layer;
      const wonder = wonderFor(state.wonderIndex);
      const need = layerSide(g.base, j) ** 2 * wonderGeom(state.wonderIndex).blocksPerCube;
      const frac = need > 0 ? state.blocksInLayer / need : 0;
      const all = layerCells(g.base, j);
      const built = Math.floor(frac * all.length);
      ctx.globalAlpha = 0.14;
      for (let i = built; i < all.length; i++) {
        const c = all[i]; const p = project(c.gx, c.gy, j + 1, cam);
        poly(ctx, cubeFaces(p.x, p.y, cam.u).top, wonder.faces[0]);
      }
      ctx.globalAlpha = 1;
      this._drawLayer(ctx, state, j, built, cam, wonder);
    } else {
      this._capstone(ctx, cam, g, state);
    }

    // ramp + workers
    this._workers(ctx, cam, g, state, stats, dt);

    // weather
    this._weather(ctx, cam, state, stats, dt, vw, vh, hY);

    // dust, rings & ambient drifting sand over the scene
    this._updateFx(ctx, dt);
    ctx.fillStyle = `rgba(235,215,170,${0.2 * (1 - sk.tint)})`;
    for (const m of this.motes) {
      m.x += (m.sp * 0.04 + 0.02) * dt; if (m.x > 1.05) m.x -= 1.1;
      const mx = m.x * (vw + 40) - 20, my = hY * 0.7 + m.y * (vh - hY * 0.7);
      ctx.fillRect(mx, my + Math.sin(state.clock * 0.8 + m.ph) * 4, m.sz, m.sz);
    }

    // whip-crack screen flash
    if (this.whipFlash > 0.01) { ctx.fillStyle = `rgba(255,250,220,${this.whipFlash * 0.12})`; ctx.fillRect(0, 0, vw, vh); }

    // night tint over the whole scene
    if (sk.tint > 0.01) { ctx.fillStyle = `rgba(10,16,44,${sk.tint * 0.42})`; ctx.fillRect(0, 0, vw, vh); }

    // post: subtle film grain + vignette for a graded, filmic look
    if (this.grainPat) {
      ctx.save(); ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = this.grainPat; ctx.fillRect(0, 0, vw, vh); ctx.restore();
    }
    const vg = ctx.createRadialGradient(vw / 2, vh * 0.46, Math.min(vw, vh) * 0.36, vw / 2, vh * 0.52, Math.max(vw, vh) * 0.76);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(10,6,2,0.34)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);

    // floating bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]; b.life -= dt * 0.9; b.y += b.vy * dt;
      if (b.life <= 0) { this.bursts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, b.life);
      ctx.font = "bold 16px ui-sans-serif,system-ui";
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillText(b.text, b.x + 1, b.y + 1);
      ctx.fillStyle = b.color; ctx.fillText(b.text, b.x, b.y);
      ctx.globalAlpha = 1;
    }
  }

  _platform(ctx, cam, g, sk) {
    const m = g.base, e = 2.5;
    const pts = [project(-e, -e, 0, cam), project(m - 1 + e, -e, 0, cam), project(m - 1 + e, m - 1 + e, 0, cam), project(-e, m - 1 + e, 0, cam)];
    poly(ctx, pts, mix("#cda86f", "#241f38", sk.tint * 0.5));
    ctx.globalAlpha = 0.25; poly(ctx, [pts[0], pts[1], pts[2], pts[3]], "#000"); ctx.globalAlpha = 1;
    poly(ctx, pts, mix("#d9b87c", "#2a2440", sk.tint * 0.5));
  }

  _city(ctx, cam, g, state, sk) {
    const cx = (g.base - 1) / 2;
    let cityCount = 0;
    for (const id of ["village", "granary", "storage_yard", "docks", "market", "temple"]) cityCount += state.buildings[id] || 0;
    const show = Math.max(3, Math.min(this.huts.length, 3 + Math.round(cityCount * 0.8)));
    const list = [];
    for (let i = 0; i < show; i++) {
      const s = this.huts[i];
      const gx = cx + Math.cos(s.a) * g.base * s.r, gy = cx + Math.sin(s.a) * g.base * s.r;
      list.push({ s, p: project(gx, gy, 0, cam), gx, gy });
    }
    list.sort((a, b) => a.p.y - b.p.y);
    const u = cam.u;
    for (const it of list) {
      const p = it.p, w = u * 0.42, h = u * (0.5 + it.s.h * 0.5);
      const wall = it.s.kind === 5 ? mix("#9a7bb0", "#23203a", sk.tint * .5) : mix("#b98a5a", "#241d33", sk.tint * .5);
      const roof = it.s.kind === 5 ? mix("#caa6df", "#2a2540", sk.tint * .5) : mix("#caa06a", "#2a2238", sk.tint * .5);
      poly(ctx, [{ x: p.x - w, y: p.y }, { x: p.x, y: p.y + w * .5 }, { x: p.x, y: p.y + w * .5 - h }, { x: p.x - w, y: p.y - h }], wall);
      poly(ctx, [{ x: p.x + w, y: p.y }, { x: p.x, y: p.y + w * .5 }, { x: p.x, y: p.y + w * .5 - h }, { x: p.x + w, y: p.y - h }], mix(wall, "#000", .18));
      poly(ctx, [{ x: p.x - w, y: p.y - h }, { x: p.x, y: p.y + w * .5 - h }, { x: p.x + w, y: p.y - h }, { x: p.x, y: p.y - w * .5 - h }], roof);
    }
  }

  _capstone(ctx, cam, g, state) {
    const w = wonderFor(state.wonderIndex);
    const cx = g.layers - 0.5;
    const p = project(cx, cx, g.layers, cam);
    const hw = cam.u * 0.85, q = cam.u * 0.42, ch = cam.u * 1.25;
    const A = { x: p.x, y: p.y - q }, B = { x: p.x + hw, y: p.y }, C = { x: p.x, y: p.y + q }, D = { x: p.x - hw, y: p.y };
    const apex = { x: p.x, y: p.y - ch };
    const pulse = 0.5 + 0.5 * Math.sin(state.clock * 3);
    ctx.save();
    ctx.shadowColor = w.capstone; ctx.shadowBlur = 18 + pulse * 18;
    poly(ctx, [D, C, apex], mix(w.capstone, "#000", 0.25));
    poly(ctx, [C, B, apex], w.capstone);
    poly(ctx, [A, B, apex], mix(w.capstone, "#fff", 0.2));
    ctx.restore();
    // light rays
    ctx.globalAlpha = 0.12 + pulse * 0.1; ctx.fillStyle = w.capstone;
    ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(apex.x - 60, 0); ctx.lineTo(apex.x + 60, 0); ctx.fill();
    ctx.globalAlpha = 1;
  }

  _rampPath(cam, g, state) {
    const sideC = layerSide(g.base, Math.min(state.layer, g.layers - 1));
    const j = Math.min(state.layer, g.layers - 1);
    const foot = project(g.base * 0.5, g.base + 3.5, 0, cam);
    const head = state.complete
      ? project(g.layers - 0.5, g.layers - 0.5, g.layers, cam)
      : project(j + sideC * 0.5, j + sideC + 0.4, j + 1, cam);
    return { foot, head };
  }

  _newWorker() {
    const i = (Math.random() * SKINS.length) | 0;
    return {
      state: "haul", t: Math.random(), phase: Math.random(), timer: 0, placed: false,
      lane: (Math.random() - 0.5), sp: 0.1 + Math.random() * 0.1, animT: Math.random() * 10,
      restSpot: (Math.random() - 0.5), restChance: 0.22 + Math.random() * 0.28,
      pal: { skin: SKINS[i], skinDark: mix(SKINS[i], "#000", 0.28), cloth: CLOTHS[(Math.random() * CLOTHS.length) | 0] },
    };
  }
  _newAnimal(i) {
    const types = ["ox", "ox", "ox", "elephant", "croc"];
    return { t: Math.random(), lane: (Math.random() - 0.5) * 0.6, sp: 0.05 + Math.random() * 0.05, ph: Math.random(), type: types[i % types.length] };
  }

  // Living crew: walk up hauling → bend to place → walk back → sometimes rest.
  _workers(ctx, cam, g, state, stats, dt) {
    const { foot, head } = this._rampPath(cam, g, state);
    const nx = -(head.y - foot.y), ny = (head.x - foot.x);
    const len = Math.hypot(nx, ny) || 1; const ux = nx / len, uy = ny / len; const rw = cam.u * 1.0;
    poly(ctx, [
      { x: foot.x - ux * rw, y: foot.y - uy * rw }, { x: foot.x + ux * rw, y: foot.y + uy * rw },
      { x: head.x + ux * rw * 0.45, y: head.y + uy * rw * 0.45 }, { x: head.x - ux * rw * 0.45, y: head.y - uy * rw * 0.45 },
    ], "rgba(150,110,60,.5)");

    const u = cam.u, dir = head.x >= foot.x ? 1 : -1, hsize = Math.max(11, u * 1.4);
    this._topX = head.x; this._topY = head.y;
    const whip = !!(state.whip && state.whip.boostT > 0);
    const active = !state.complete && (state._lastFlow || 0) > 0.0001;
    const target = state.complete ? 5 : Math.max(active ? 6 : 3, Math.min(48, Math.round(5 + Math.sqrt(stats.placement || 0))));
    while (this.workers.length < target) this.workers.push(this._newWorker());
    while (this.workers.length > target) this.workers.pop();

    const boost = (state.complete ? 0.25 : (0.45 + Math.min(2, (stats.rateCap || 0) * 0.02))) * (whip ? 1.7 : 1);
    const placeDur = 0.55 / (whip ? 1.5 : 1);
    const restX = foot.x - ux * rw * 2.6, restY = foot.y - uy * rw * 2.6;
    const entries = [];
    for (const w of this.workers) {
      w.animT += dt;
      const pose = { dir, pal: w.pal, t: w.animT, moving: false, carry: false, bend: 0, wipe: 0, phase: w.phase };
      let x, y;
      if (w.state === "haul") {
        w.t += w.sp * boost * dt; w.phase += w.sp * boost * dt * 7;
        if (w.t >= 1) { w.t = 1; w.state = "place"; w.timer = placeDur; w.placed = false; }
        x = lerp(foot.x, head.x, w.t) + ux * w.lane * rw; y = lerp(foot.y, head.y, w.t) + uy * w.lane * rw;
        pose.moving = true; pose.carry = true;
        if (Math.random() < dt * 2.5 * boost) this.spawnDust(x, y, 1, { sp: 6, up: 3, r: 2.2, life: 0.35 });
      } else if (w.state === "place") {
        w.timer -= dt; const p = 1 - Math.max(0, w.timer) / placeDur;
        pose.bend = Math.sin(Math.min(1, p) * Math.PI); pose.carry = p < 0.55;
        x = head.x + ux * w.lane * rw; y = head.y + uy * w.lane * rw;
        if (!w.placed && p > 0.5) { w.placed = true; this.spawnDust(x, y + hsize * 0.04, 5, { sp: 22, up: 8, r: 3, life: 0.5 }); }
        if (w.timer <= 0) w.state = "return";
      } else if (w.state === "return") {
        w.t -= w.sp * boost * 1.5 * dt; w.phase += w.sp * boost * 1.5 * dt * 7;
        if (w.t <= 0) { w.t = 0; if (Math.random() < w.restChance) { w.state = "rest"; w.timer = 2 + Math.random() * 4; } else w.state = "haul"; }
        x = lerp(foot.x, head.x, w.t) + ux * w.lane * rw; y = lerp(foot.y, head.y, w.t) + uy * w.lane * rw;
        pose.moving = true;
      } else { // rest
        w.timer -= dt;
        x = restX + w.restSpot * rw * 2; y = restY + w.restSpot * rw * 0.5;
        pose.wipe = (w.timer % 2.6 < 0.9) ? 1 : 0;
        if (w.timer <= 0) w.state = "haul";
      }
      entries.push({ x, y, pose });
    }
    entries.sort((a, b) => a.y - b.y);
    for (const e of entries) { shadow(ctx, e.x, e.y, hsize * 0.22); drawHuman(ctx, e.x, e.y, hsize, e.pose); }

    this._overseer(ctx, foot, ux, uy, rw, hsize, dir, state, dt);
    this._animals(ctx, cam, g, state, stats, dt);
  }

  _overseer(ctx, foot, ux, uy, rw, hsize, dir, state, dt) {
    const ox = foot.x - ux * rw * 1.25, oy = foot.y - uy * rw * 1.25;
    const whip = !!(state.whip && state.whip.boostT > 0);
    this._osTimer -= dt;
    if (this._osTimer <= 0) {
      this.overseerCrack = 1; this._osTimer = whip ? 0.7 : 3 + Math.random() * 2.5;
      if (whip) this.spawnDust(ox + dir * hsize * 0.7, oy, 3, { sp: 14, up: 5, r: 2.4, life: 0.35 });
    }
    shadow(ctx, ox, oy, hsize * 0.24);
    drawHuman(ctx, ox, oy, hsize * 1.06, { dir, pal: OVERSEER_PAL, t: state.clock, moving: false, carry: false, bend: 0, wipe: 0, phase: 0 });
    drawWhip(ctx, ox, oy, hsize * 1.06, dir, this.overseerCrack);
  }

  _animals(ctx, cam, g, state, stats, dt) {
    const A = project(-2.5, g.base + 2.5, 0, cam);
    const Bp = project(g.base + 1.5, g.base + 2.5, 0, cam);
    let machines = 0;
    for (const id of ["wooden_rollers", "rope_winch", "sled", "crane", "lubrication", "massive_ramp", "elevator", "marvel"]) machines += state.buildings[id] || 0;
    const target = Math.min(7, Math.floor(machines / 3));
    while (this.animals.length < target) this.animals.push(this._newAnimal(this.animals.length));
    while (this.animals.length > target) this.animals.pop();

    const u = cam.u, dir = Bp.x >= A.x ? 1 : -1;
    const speed = 0.3 + Math.min(1.4, (stats.rateCap || 0) * 0.02);
    const sorted = this.animals.slice().sort((a, b) => a.t - b.t);
    for (const a of sorted) {
      a.t += a.sp * speed * dt; if (a.t > 1) a.t -= 1;
      const x = lerp(A.x, Bp.x, a.t), y = lerp(A.y, Bp.y, a.t) + a.lane * u;
      shadow(ctx, x, y, u * (a.type === "elephant" ? 0.95 : 0.7));
      drawAnimal(ctx, x, y, u * 0.95, a.t * 5 + a.ph, dir, a.type);
    }
    // crocodiles bask by the water during the Nile flood
    if (this.flood > 0.2) {
      shadow(ctx, A.x + u * 2.2, A.y + u * 1.7, u * 0.7);
      drawAnimal(ctx, A.x + u * 2.2, A.y + u * 1.7, u * 0.85, 0, 1, "croc");
    }
  }

  _weather(ctx, cam, state, stats, dt, vw, vh, hY) {
    const id = state.weather.id;
    // sandstorm
    if (id === "sandstorm") {
      ctx.fillStyle = "rgba(200,160,90,.15)"; ctx.fillRect(0, 0, vw, vh);
      for (const p of this.sand) {
        if (p.life <= 0) { p.x = Math.random() * vw; p.y = Math.random() * vh; p.vx = 220 + Math.random() * 260; p.vy = (Math.random() - 0.5) * 40; p.life = 0.6 + Math.random(); }
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.x > vw) p.x = -4;
        ctx.fillStyle = "rgba(214,180,120,.4)"; ctx.fillRect(p.x, p.y, 7, 1.4);
      }
    } else for (const p of this.sand) p.life = 0;
    // rain
    if (id === "rain") {
      ctx.fillStyle = "rgba(40,50,80,.13)"; ctx.fillRect(0, 0, vw, vh);
      for (const p of this.rain) {
        if (p.life <= 0) { p.x = Math.random() * vw; p.y = -10; p.v = 600 + Math.random() * 300; p.life = 1 + Math.random(); }
        p.y += p.v * dt; p.x += 60 * dt; p.life -= dt; if (p.y > vh) p.life = 0;
        ctx.strokeStyle = "rgba(170,200,230,.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 4, p.y - 12); ctx.stroke();
      }
    } else for (const p of this.rain) p.life = 0;
    // flood
    const floodTarget = id === "flood" ? 1 : 0;
    this.flood += (floodTarget - this.flood) * Math.min(1, dt * 0.5);
    if (this.flood > 0.01) {
      const wy = hY + 70 + (1 - this.flood) * 120;
      ctx.fillStyle = `rgba(70,150,180,${0.32 * this.flood})`; ctx.fillRect(0, wy, vw, vh - wy);
      ctx.fillStyle = `rgba(255,255,255,${0.06 * this.flood})`;
      for (let i = 0; i < 6; i++) ctx.fillRect(0, wy + i * 10 + (Math.sin(state.clock * 2 + i) * 3), vw, 1.5);
    }
    // heat
    if (id === "heat") { ctx.fillStyle = "rgba(255,140,40,.10)"; ctx.fillRect(0, 0, vw, vh); }
  }
}
