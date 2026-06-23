// Procedural animated sprites drawn in code: little Egyptian workers with a
// sine-driven walk cycle, and hauling animals (ox, elephant, crocodile).
// Everything is parametric so motion reads as "physical" without any art files.

const TAU = Math.PI * 2;
function seg(ctx, ax, ay, bx, by, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}
function tri(ctx, p, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.closePath(); ctx.fill(); }
function smallCube(ctx, cx, cy, w, top, left, right) {
  const h = w * 0.5, q = w * 0.25, vh = w * 0.55;
  ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(cx - h, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx, cy + q + vh); ctx.lineTo(cx - h, cy + vh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(cx, cy + q); ctx.lineTo(cx + h, cy); ctx.lineTo(cx + h, cy + vh); ctx.lineTo(cx, cy + q + vh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(cx, cy - q); ctx.lineTo(cx + h, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx - h, cy); ctx.closePath(); ctx.fill();
}

// ---- Worker: feet anchored at (x,y); h = pixel height; phase 0..1 walk ----
export function drawHuman(ctx, x, y, h, phase, dir, carrying, pal) {
  const sw = Math.sin(phase * TAU);
  const bob = Math.abs(Math.cos(phase * TAU)) * h * 0.05;
  const skin = pal.skin, skinDark = pal.skinDark, kilt = "#efe7d2", cloth = pal.cloth;
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(dir, 1);

  const hipY = -0.46 * h, shY = -0.78 * h, headY = -0.9 * h, hr = 0.1 * h;
  const lw = 0.085 * h;

  // legs (back dimmer, then front)
  const foot = (s) => 0.05 * h + s * 0.17 * h;
  const lift = (s) => -Math.max(0, s) * 0.05 * h;
  // back leg
  seg(ctx, -0.05 * h, hipY, -0.02 * h + (-sw) * 0.09 * h, hipY * 0.45, lw, skinDark);
  seg(ctx, -0.02 * h + (-sw) * 0.09 * h, hipY * 0.45, foot(-sw) - 0.1 * h, lift(-sw), lw, skinDark);
  // front leg
  seg(ctx, 0.05 * h, hipY, 0.02 * h + sw * 0.09 * h, hipY * 0.45, lw, skin);
  seg(ctx, 0.02 * h + sw * 0.09 * h, hipY * 0.45, foot(sw), lift(sw), lw, skin);

  // back arm
  if (!carrying) seg(ctx, -0.07 * h, shY, -0.07 * h + (-sw) * 0.12 * h, -0.5 * h, lw * 0.85, skinDark);
  else seg(ctx, -0.07 * h, shY, -0.06 * h, -0.98 * h, lw * 0.85, skinDark);

  // torso (bare) + kilt
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-0.11 * h, shY); ctx.lineTo(0.11 * h, shY);
  ctx.lineTo(0.09 * h, -0.5 * h); ctx.lineTo(-0.09 * h, -0.5 * h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = kilt;
  ctx.beginPath();
  ctx.moveTo(-0.1 * h, -0.52 * h); ctx.lineTo(0.1 * h, -0.52 * h);
  ctx.lineTo(0.13 * h, -0.33 * h); ctx.lineTo(-0.13 * h, -0.33 * h); ctx.closePath(); ctx.fill();

  // head + nemes headcloth
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0.01 * h, headY, hr, 0, TAU); ctx.fill();
  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.moveTo(-hr * 1.1, headY - hr * 0.3); ctx.lineTo(hr * 1.1, headY - hr * 0.3);
  ctx.lineTo(hr * 1.3, headY + hr * 1.1); ctx.lineTo(-hr * 1.3, headY + hr * 1.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0.04 * h, headY + hr * 0.25, hr * 0.78, -0.5, 2.0); ctx.fill();

  // carried block + front arm
  if (carrying) {
    smallCube(ctx, 0.02 * h, -1.0 * h, 0.36 * h, "#efe3c4", "#a98e60", "#c9b488");
    seg(ctx, 0.07 * h, shY, 0.06 * h, -0.96 * h, lw * 0.9, skin);
  } else {
    seg(ctx, 0.07 * h, shY, 0.07 * h + sw * 0.12 * h, -0.5 * h, lw * 0.9, skin);
  }
  ctx.restore();
}

// ---- quadruped leg helper: 4 legs with a diagonal gait ----
function legs4(ctx, phase, fx, bx, y, len, w, color, colorDim) {
  const s = Math.sin(phase * TAU), s2 = Math.sin(phase * TAU + Math.PI);
  const k = (sw, hx) => { // hip x → foot with swing
    const fxp = hx + sw * len * 0.35;
    seg(ctx, hx, y - len, hx + sw * len * 0.18, y - len * 0.5, w, color);
    seg(ctx, hx + sw * len * 0.18, y - len * 0.5, fxp, y - Math.max(0, sw) * len * 0.12, w, color);
  };
  // far pair (dim)
  seg(ctx, fx + 0.04 * len, y - len, fx + 0.04 * len + s2 * len * 0.3, y, w * 0.85, colorDim);
  seg(ctx, bx + 0.04 * len, y - len, bx + 0.04 * len + s * len * 0.3, y, w * 0.85, colorDim);
  // near pair
  k(s, fx); k(s2, bx);
}

export function drawAnimal(ctx, x, y, s, phase, dir, type) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  if (type === "ox") ox(ctx, s, phase);
  else if (type === "elephant") elephant(ctx, s, phase);
  else croc(ctx, s, phase);
  ctx.restore();
}

function sled(ctx, s, color) {
  // a low sled with a block, dragged behind (negative x)
  ctx.fillStyle = "rgba(90,60,30,.55)";
  ctx.beginPath(); ctx.moveTo(-1.5 * s, 0); ctx.lineTo(-0.5 * s, 0); ctx.lineTo(-0.45 * s, -0.12 * s); ctx.lineTo(-1.55 * s, -0.12 * s); ctx.closePath(); ctx.fill();
  smallCube(ctx, -1.0 * s, -0.5 * s, 0.6 * s, "#efe3c4", "#a98e60", "#c9b488");
  seg(ctx, -0.5 * s, -0.18 * s, -0.05 * s, -0.3 * s, 0.035 * s, "#6b4a28"); // rope
}

function ox(ctx, s, phase) {
  const len = 0.5 * s, body = "#8a6b46", dim = "#6f5436", dark = "#5e4630";
  sled(ctx, s);
  legs4(ctx, phase, 0.28 * s, -0.28 * s, 0, len, 0.08 * s, dim, dark);
  // body
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-0.4 * s, -len); ctx.quadraticCurveTo(-0.45 * s, -len - 0.42 * s, 0.05 * s, -len - 0.4 * s);
  ctx.quadraticCurveTo(0.45 * s, -len - 0.38 * s, 0.42 * s, -len); ctx.closePath(); ctx.fill();
  // head
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(0.34 * s, -len - 0.34 * s); ctx.lineTo(0.62 * s, -len - 0.28 * s); ctx.lineTo(0.6 * s, -len - 0.05 * s); ctx.lineTo(0.34 * s, -len - 0.08 * s); ctx.closePath(); ctx.fill();
  // horns
  seg(ctx, 0.5 * s, -len - 0.32 * s, 0.62 * s, -len - 0.5 * s, 0.04 * s, "#efe7d0");
  seg(ctx, 0.42 * s, -len - 0.32 * s, 0.34 * s, -len - 0.5 * s, 0.04 * s, "#efe7d0");
  // tail
  seg(ctx, -0.4 * s, -len - 0.32 * s, -0.5 * s + Math.sin(phase * TAU) * 0.04 * s, -len - 0.05 * s, 0.03 * s, dim);
}

function elephant(ctx, s, phase) {
  s *= 1.4;
  const len = 0.5 * s, body = "#9aa0a8", dim = "#7c828b", dark = "#646a72";
  sled(ctx, s);
  legs4(ctx, phase, 0.32 * s, -0.32 * s, 0, len, 0.15 * s, dim, dark);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -len - 0.36 * s, 0.56 * s, 0.42 * s, 0, 0, TAU); ctx.fill();
  // head
  ctx.beginPath(); ctx.ellipse(0.54 * s, -len - 0.34 * s, 0.29 * s, 0.33 * s, 0, 0, TAU); ctx.fill();
  // ear
  ctx.fillStyle = dim; ctx.beginPath(); ctx.ellipse(0.42 * s, -len - 0.36 * s, 0.18 * s, 0.22 * s, 0, 0, TAU); ctx.fill();
  // trunk (curls with gait)
  const c = Math.sin(phase * TAU) * 0.06 * s;
  ctx.strokeStyle = body; ctx.lineWidth = 0.13 * s; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0.66 * s, -len - 0.32 * s);
  ctx.quadraticCurveTo(0.82 * s, -len - 0.12 * s, 0.74 * s + c, -len + 0.04 * s); ctx.stroke();
  // tusks
  seg(ctx, 0.6 * s, -len - 0.2 * s, 0.78 * s, -len - 0.06 * s, 0.045 * s, "#efe7d0");
}

function croc(ctx, s, phase) {
  s *= 1.1;
  const len = 0.16 * s, body = "#5f7d4a", dim = "#49603a", ridge = "#3c5030";
  legs4(ctx, phase, 0.32 * s, -0.34 * s, 0, len, 0.06 * s, dim, ridge);
  // long low body
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-0.85 * s, -len); ctx.quadraticCurveTo(-0.95 * s, -len - 0.22 * s, -0.2 * s, -len - 0.24 * s);
  ctx.quadraticCurveTo(0.7 * s, -len - 0.24 * s, 0.95 * s, -len - 0.05 * s);
  ctx.lineTo(0.95 * s, -len); ctx.closePath(); ctx.fill();
  // snout
  ctx.fillStyle = dim; ctx.beginPath(); ctx.moveTo(0.7 * s, -len - 0.2 * s); ctx.lineTo(1.05 * s, -len - 0.12 * s); ctx.lineTo(0.7 * s, -len - 0.04 * s); ctx.closePath(); ctx.fill();
  // tail
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-0.8 * s, -len - 0.2 * s); ctx.lineTo(-1.25 * s + Math.sin(phase * TAU) * 0.08 * s, -len - 0.02 * s); ctx.lineTo(-0.8 * s, -len); ctx.closePath(); ctx.fill();
  // back ridges
  ctx.fillStyle = ridge;
  for (let i = -0.6; i < 0.5; i += 0.22) tri(ctx, [i * s, -len - 0.24 * s, (i + 0.1) * s, -len - 0.34 * s, (i + 0.2) * s, -len - 0.24 * s], ridge);
  // eye
  ctx.fillStyle = "#1c140d"; ctx.beginPath(); ctx.arc(0.5 * s, -len - 0.26 * s, 0.03 * s, 0, TAU); ctx.fill();
}
