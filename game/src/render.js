// Isometric Canvas2D renderer. Completed pyramid layers are cached to an
// offscreen canvas (one blit/frame); only the active layer, capstone, workers,
// weather and tint redraw per frame (performance law).
import { wonderFor, wonderGeom } from "./data.js";
import { project, cubeFaces, layerSide, layerCells, pyramidBounds } from "./iso.js";

export const DAY_LEN = 200; // seconds per full day/night cycle

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

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.pan = { x: 0, y: 0 }; this.zoom = 1;
    this.cache = document.createElement("canvas"); this.cctx = this.cache.getContext("2d");
    this.cacheKey = ""; this.bounds = null; this.pad = 40;
    this.workers = []; this.bursts = [];
    this.sand = []; this.rain = []; this.flood = 0;
    for (let i = 0; i < 220; i++) this.sand.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    for (let i = 0; i < 160; i++) this.rain.push({ x: 0, y: 0, v: 0, life: 0 });
    this.huts = this._layoutCity();
    this.shake = 0;
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

  _rebuildCache(cam, state) {
    const g = cam.g, wonder = wonderFor(state.wonderIndex);
    const completed = state.complete ? g.layers : state.layer;
    const key = `${state.wonderIndex}|${completed}|${cam.u.toFixed(2)}`;
    if (key === this.cacheKey) return;
    this.cacheKey = key;
    const b = cam.bounds, pad = this.pad;
    const W = Math.ceil(b.maxX - b.minX + pad * 2), H = Math.ceil(b.maxY - b.minY + pad * 2);
    this.cache.width = Math.max(1, W); this.cache.height = Math.max(1, H);
    const cc = this.cctx; cc.clearRect(0, 0, W, H);
    const local = { u: cam.u, ox: pad - b.minX, oy: pad - b.minY };
    this.cacheOffX = b.minX - pad; this.cacheOffY = b.minY - pad;
    for (let j = 0; j < completed; j++) this._drawLayer(cc, state, j, layerSide(g.base, j) ** 2, local, wonder);
  }

  _drawLayer(ctx, state, j, count, cam, wonder, glow) {
    const cells = layerCells(wonderGeom(state.wonderIndex).base, j);
    const n = Math.min(count, cells.length);
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const p = project(c.gx, c.gy, j + 1, cam);
      const f = cubeFaces(p.x, p.y, cam.u);
      poly(ctx, f.left, wonder.faces[2]);
      poly(ctx, f.right, wonder.faces[1]);
      poly(ctx, f.top, wonder.faces[0]);
    }
  }

  frame(state, stats, dt, vw, vh) {
    const ctx = this.ctx;
    const phase = (state.clock % DAY_LEN) / DAY_LEN;
    const sk = sky(phase);

    // sky
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, sk.top); grad.addColorStop(1, sk.bot);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, vw, vh);

    // sun / moon
    const sunX = vw * (0.12 + 0.76 * phase);
    const sunY = vh * (0.62 - Math.sin(phase * Math.PI) * 0.5);
    const isNight = phase > 0.6 && phase < 0.85;
    if (isNight) {
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(vw * 0.8, vh * 0.2, 22, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.6)";
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 8821 % vw), (i * 5333 % (vh * 0.5)), 1.5, 1.5);
    } else {
      const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
      sg.addColorStop(0, "rgba(255,240,200,.95)"); sg.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunX, sunY, 120, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff3cf"; ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, 7); ctx.fill();
    }

    // distant dunes (parallax with pan)
    const hY = vh * 0.6;
    const px = this.pan.x * 0.15;
    for (let d = 0; d < 3; d++) {
      ctx.fillStyle = mix("#e8c187", "#3a2f4a", sk.tint * 0.6 + d * 0.12);
      ctx.beginPath(); ctx.moveTo(-50, vh);
      const amp = 26 - d * 6, base = hY + d * 26;
      for (let x = -50; x <= vw + 50; x += 40)
        ctx.lineTo(x, base + Math.sin((x + px + d * 120) * 0.006) * amp);
      ctx.lineTo(vw + 50, vh); ctx.closePath(); ctx.fill();
    }

    // ground sand
    ctx.fillStyle = mix("#dcb87f", "#2a2440", sk.tint * 0.55);
    ctx.fillRect(0, hY + 40, vw, vh);

    // camera + screen shake
    const cam = this.camera(state, vw, vh);
    if (this.shake > 0.1) { cam.ox += (Math.random() - 0.5) * this.shake; cam.oy += (Math.random() - 0.5) * this.shake; this.shake *= 0.86; }
    const g = cam.g;

    // construction-site platform
    this._platform(ctx, cam, g, sk);
    // support city
    this._city(ctx, cam, g, state, sk);

    // pyramid: cached completed layers
    this._rebuildCache(cam, state);
    ctx.drawImage(this.cache, cam.ox + this.cacheOffX, cam.oy + this.cacheOffY);

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

    // night tint over the whole scene
    if (sk.tint > 0.01) { ctx.fillStyle = `rgba(10,16,44,${sk.tint * 0.42})`; ctx.fillRect(0, 0, vw, vh); }

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

  _workers(ctx, cam, g, state, stats, dt) {
    const { foot, head } = this._rampPath(cam, g, state);
    // ramp
    const nx = -(head.y - foot.y), ny = (head.x - foot.x);
    const len = Math.hypot(nx, ny) || 1; const ux = nx / len, uy = ny / len; const rw = cam.u * 1.1;
    poly(ctx, [
      { x: foot.x - ux * rw, y: foot.y - uy * rw }, { x: foot.x + ux * rw, y: foot.y + uy * rw },
      { x: head.x + ux * rw * 0.4, y: head.y + uy * rw * 0.4 }, { x: head.x - ux * rw * 0.4, y: head.y - uy * rw * 0.4 },
    ], "rgba(150,110,60,.5)");

    const active = !state.complete && (state._lastFlow || 0) > 0.0001;
    let target = state.complete ? 6 : Math.max(active ? 5 : 2, Math.min(120, Math.round(4 + Math.sqrt(stats.placement || 0) * 1.3)));
    while (this.workers.length < target) this.workers.push({ t: Math.random(), lane: (Math.random() - 0.5), sp: 0.18 + Math.random() * 0.22, c: Math.random() < 0.5 ? "#d8c39a" : "#c98f63" });
    while (this.workers.length > target) this.workers.pop();

    const speedScale = state.complete ? 0.3 : (0.4 + Math.min(2, (stats.rateCap || 0) * 0.02));
    const u = cam.u;
    for (const w of this.workers) {
      w.t += w.sp * speedScale * dt; if (w.t > 1) w.t -= 1;
      const x = lerp(foot.x, head.x, w.t) + ux * w.lane * rw;
      const y = lerp(foot.y, head.y, w.t) + uy * w.lane * rw;
      const sz = Math.max(2, u * 0.13);
      ctx.fillStyle = w.c;
      ctx.fillRect(x - sz * 0.35, y - sz * 1.6, sz * 0.7, sz * 1.3);     // body
      ctx.fillStyle = "#5a3b25";
      ctx.fillRect(x - sz * 0.28, y - sz * 2.1, sz * 0.56, sz * 0.55);   // head
      if (w.t < 0.85 && !state.complete) { ctx.fillStyle = "#cdbb95"; ctx.fillRect(x - sz * 0.45, y - sz * 1.85, sz * 0.9, sz * 0.4); } // carried block
    }
  }

  _weather(ctx, cam, state, stats, dt, vw, vh, hY) {
    const id = state.weather.id;
    // sandstorm
    if (id === "sandstorm") {
      ctx.fillStyle = "rgba(200,160,90,.22)"; ctx.fillRect(0, 0, vw, vh);
      for (const p of this.sand) {
        if (p.life <= 0) { p.x = Math.random() * vw; p.y = Math.random() * vh; p.vx = 220 + Math.random() * 260; p.vy = (Math.random() - 0.5) * 40; p.life = 0.6 + Math.random(); }
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.x > vw) p.x = -4;
        ctx.fillStyle = "rgba(214,180,120,.5)"; ctx.fillRect(p.x, p.y, 7, 1.4);
      }
    } else for (const p of this.sand) p.life = 0;
    // rain
    if (id === "rain") {
      ctx.fillStyle = "rgba(40,50,80,.18)"; ctx.fillRect(0, 0, vw, vh);
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
