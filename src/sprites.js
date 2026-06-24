// Procedurally animated sprites: living Egyptian workers (walk → bend to place →
// walk back → rest, with brow-wipes), an overseer with a whip, and hauling
// animals (ox, elephant, crocodile). All motion is parametric — no art files.

const TAU = Math.PI * 2;
function seg(ctx, ax, ay, bx, by, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}
// two-segment limb with a forward-bending joint (knee/elbow)
function limb2(ctx, ax, ay, bx, by, joint, w, color) {
  const mx = (ax + bx) / 2 + joint, my = (ay + by) / 2;
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.lineTo(bx, by); ctx.stroke();
}
function tri(ctx, p, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.closePath(); ctx.fill(); }
function smallCube(ctx, cx, cy, w, top, left, right) {
  const h = w * 0.5, q = w * 0.25, vh = w * 0.55;
  ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(cx - h, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx, cy + q + vh); ctx.lineTo(cx - h, cy + vh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(cx, cy + q); ctx.lineTo(cx + h, cy); ctx.lineTo(cx + h, cy + vh); ctx.lineTo(cx, cy + q + vh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(cx, cy - q); ctx.lineTo(cx + h, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx - h, cy); ctx.closePath(); ctx.fill();
}

// ---- Worker. feet at (x,y); h = pixel height; o = pose state ----
// o = { phase, dir, carry, bend(0..1), moving, wipe(0..1), pal, t }
export function drawHuman(ctx, x, y, h, o) {
  const dir = o.dir || 1, pal = o.pal;
  const moving = !!o.moving, carry = !!o.carry, bend = o.bend || 0, wipe = o.wipe || 0;
  const sw = Math.sin((o.phase || 0) * TAU) * (moving ? 1 : 0);
  const sway = moving ? 0 : Math.sin((o.t || 0) * 1.6) * 0.018 * h;
  const bob = moving ? Math.abs(Math.cos((o.phase || 0) * TAU)) * 0.05 * h : Math.sin((o.t || 0) * 1.6 + 1) * 0.012 * h;
  const drop = bend * 0.2 * h, fwd = bend * 0.14 * h;
  const lw = 0.085 * h, hr = 0.1 * h;
  ctx.save(); ctx.translate(x, y - bob); ctx.scale(dir, 1);
  const skin = pal.skin, skinDark = pal.skinDark, kilt = "#efe7d2", cloth = pal.cloth;

  const hipY = -0.46 * h + drop, shY = -0.78 * h + drop, headY = -0.9 * h + drop + sway;
  const hipx = fwd * 0.4, shx = hipx + fwd, kneeBase = 0.1 * h + bend * 0.16 * h;

  // legs (feet planted)
  limb2(ctx, -0.05 * h + hipx, hipY, -0.05 * h + (-sw) * 0.17 * h, 0, kneeBase, lw, skinDark);
  limb2(ctx, 0.05 * h + hipx, hipY, 0.05 * h + sw * 0.17 * h, 0, kneeBase, lw, skin);

  // back arm
  const shoulderY = shY + 0.02 * h, shoulderX = 0.07 * h + shx;
  if (bend < 0.02 && !carry && wipe < 0.5)
    seg(ctx, -0.07 * h + shx, shoulderY, -0.07 * h + (-sw) * 0.13 * h, -0.5 * h + drop, lw * 0.85, skinDark);

  // torso + kilt
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-0.11 * h + shx, shY); ctx.lineTo(0.11 * h + shx, shY);
  ctx.lineTo(0.09 * h + hipx, hipY - 0.02 * h); ctx.lineTo(-0.09 * h + hipx, hipY - 0.02 * h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = kilt;
  ctx.beginPath();
  ctx.moveTo(-0.1 * h + hipx, hipY - 0.02 * h); ctx.lineTo(0.1 * h + hipx, hipY - 0.02 * h);
  ctx.lineTo(0.13 * h + hipx, hipY + 0.16 * h); ctx.lineTo(-0.13 * h + hipx, hipY + 0.16 * h); ctx.closePath(); ctx.fill();

  // head + nemes headcloth + face
  const headx = shx + bend * 0.06 * h;
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0.01 * h + headx, headY, hr, 0, TAU); ctx.fill();
  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.moveTo(-hr * 1.1 + headx, headY - hr * 0.3); ctx.lineTo(hr * 1.1 + headx, headY - hr * 0.3);
  ctx.lineTo(hr * 1.3 + headx, headY + hr * 1.1); ctx.lineTo(-hr * 1.3 + headx, headY + hr * 1.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0.04 * h + headx, headY + hr * 0.25, hr * 0.78, -0.5, 2.0); ctx.fill();

  // front arm(s) + carried/placed block
  if (bend > 0.02) {
    // placing: reach to the front-ground; the block rides down with the hands
    const bx = 0.24 * h + fwd, blkY = -0.08 * h;
    limb2(ctx, -0.07 * h + shx, shoulderY, bx - 0.04 * h, blkY - 0.02 * h, 0.03 * h, lw * 0.85, skinDark);
    if (carry) smallCube(ctx, bx, blkY, 0.34 * h, "#efe3c4", "#a98e60", "#c9b488");
    limb2(ctx, shoulderX, shoulderY, bx, blkY - 0.02 * h, 0.03 * h, lw * 0.9, skin);
  } else if (carry) {
    smallCube(ctx, 0.02 * h + shx, -1.0 * h + drop, 0.36 * h, "#efe3c4", "#a98e60", "#c9b488");
    seg(ctx, -0.07 * h + shx, shoulderY, -0.05 * h + shx, -0.95 * h + drop, lw * 0.85, skinDark);
    seg(ctx, shoulderX, shoulderY, 0.05 * h + shx, -0.95 * h + drop, lw * 0.9, skin);
  } else if (wipe > 0.5) {
    seg(ctx, -0.07 * h + shx, shoulderY, -0.07 * h, -0.5 * h, lw * 0.85, skinDark);
    limb2(ctx, shoulderX, shoulderY, 0.03 * h + headx, headY + hr * 0.2, 0.04 * h, lw * 0.9, skin); // wiping brow
  } else {
    seg(ctx, shoulderX, shoulderY, 0.07 * h + sw * 0.13 * h, -0.5 * h + drop, lw * 0.9, skin);
  }
  ctx.restore();
}

// ---- Whip drawn from an overseer's hand at (x,y); crack 0..1 ----
export function drawWhip(ctx, x, y, h, dir, crack) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  const handX = 0.1 * h, handY = -0.56 * h;
  const tipX = (0.55 + crack * 0.7) * h, tipY = -0.5 * h + (1 - crack) * 0.34 * h;
  ctx.strokeStyle = "#3a2412"; ctx.lineWidth = 0.05 * h; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(handX, handY);
  ctx.quadraticCurveTo(0.42 * h, -0.74 * h - crack * 0.12 * h, tipX, tipY); ctx.stroke();
  if (crack > 0.55) {
    const a = (crack - 0.55) / 0.45;
    ctx.strokeStyle = `rgba(255,250,225,${a})`; ctx.lineWidth = 0.035 * h;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + 0.2 * h, tipY - 0.1 * h);
    ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + 0.18 * h, tipY + 0.12 * h); ctx.stroke();
  }
  ctx.restore();
}

// ---- quadruped leg helper: 4 legs with a diagonal gait ----
function legs4(ctx, phase, fx, bx, y, len, w, color, colorDim) {
  const s = Math.sin(phase * TAU), s2 = Math.sin(phase * TAU + Math.PI);
  const k = (sw, hx) => {
    const fxp = hx + sw * len * 0.35;
    seg(ctx, hx, y - len, hx + sw * len * 0.18, y - len * 0.5, w, color);
    seg(ctx, hx + sw * len * 0.18, y - len * 0.5, fxp, y - Math.max(0, sw) * len * 0.12, w, color);
  };
  seg(ctx, fx + 0.04 * len, y - len, fx + 0.04 * len + s2 * len * 0.3, y, w * 0.85, colorDim);
  seg(ctx, bx + 0.04 * len, y - len, bx + 0.04 * len + s * len * 0.3, y, w * 0.85, colorDim);
  k(s, fx); k(s2, bx);
}

export function drawAnimal(ctx, x, y, s, phase, dir, type) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  if (type === "ox") ox(ctx, s, phase);
  else if (type === "elephant") elephant(ctx, s, phase);
  else croc(ctx, s, phase);
  ctx.restore();
}

function sled(ctx, s) {
  ctx.fillStyle = "rgba(90,60,30,.55)";
  ctx.beginPath(); ctx.moveTo(-1.5 * s, 0); ctx.lineTo(-0.5 * s, 0); ctx.lineTo(-0.45 * s, -0.12 * s); ctx.lineTo(-1.55 * s, -0.12 * s); ctx.closePath(); ctx.fill();
  smallCube(ctx, -1.0 * s, -0.5 * s, 0.6 * s, "#efe3c4", "#a98e60", "#c9b488");
  seg(ctx, -0.5 * s, -0.18 * s, -0.05 * s, -0.3 * s, 0.035 * s, "#6b4a28");
}

function ox(ctx, s, phase) {
  const len = 0.5 * s, body = "#8a6b46", dim = "#6f5436", dark = "#5e4630";
  sled(ctx, s);
  legs4(ctx, phase, 0.28 * s, -0.28 * s, 0, len, 0.09 * s, dim, dark);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-0.4 * s, -len); ctx.quadraticCurveTo(-0.45 * s, -len - 0.42 * s, 0.05 * s, -len - 0.4 * s);
  ctx.quadraticCurveTo(0.45 * s, -len - 0.38 * s, 0.42 * s, -len); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.34 * s, -len - 0.34 * s); ctx.lineTo(0.62 * s, -len - 0.28 * s); ctx.lineTo(0.6 * s, -len - 0.05 * s); ctx.lineTo(0.34 * s, -len - 0.08 * s); ctx.closePath(); ctx.fill();
  seg(ctx, 0.5 * s, -len - 0.32 * s, 0.62 * s, -len - 0.5 * s, 0.04 * s, "#efe7d0");
  seg(ctx, 0.42 * s, -len - 0.32 * s, 0.34 * s, -len - 0.5 * s, 0.04 * s, "#efe7d0");
  seg(ctx, -0.4 * s, -len - 0.32 * s, -0.5 * s + Math.sin(phase * TAU) * 0.04 * s, -len - 0.05 * s, 0.03 * s, dim);
}

function elephant(ctx, s, phase) {
  s *= 1.4;
  const len = 0.5 * s, body = "#9aa0a8", dim = "#7c828b", dark = "#646a72";
  sled(ctx, s);
  legs4(ctx, phase, 0.32 * s, -0.32 * s, 0, len, 0.15 * s, dim, dark);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -len - 0.36 * s, 0.56 * s, 0.42 * s, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.54 * s, -len - 0.34 * s, 0.29 * s, 0.33 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = dim; ctx.beginPath(); ctx.ellipse(0.44 * s, -len - 0.38 * s, 0.19 * s, 0.23 * s, 0, 0, TAU); ctx.fill();
  const c = Math.sin(phase * TAU) * 0.06 * s;
  ctx.strokeStyle = body; ctx.lineWidth = 0.14 * s; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0.7 * s, -len - 0.32 * s);
  ctx.quadraticCurveTo(0.86 * s, -len - 0.1 * s, 0.78 * s + c, -len + 0.06 * s); ctx.stroke();
  seg(ctx, 0.64 * s, -len - 0.18 * s, 0.82 * s, -len - 0.02 * s, 0.05 * s, "#efe7d0");
}

function croc(ctx, s, phase) {
  s *= 1.1;
  const len = 0.16 * s, body = "#5f7d4a", dim = "#49603a", ridge = "#3c5030";
  legs4(ctx, phase, 0.32 * s, -0.34 * s, 0, len, 0.06 * s, dim, ridge);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-0.85 * s, -len); ctx.quadraticCurveTo(-0.95 * s, -len - 0.22 * s, -0.2 * s, -len - 0.24 * s);
  ctx.quadraticCurveTo(0.7 * s, -len - 0.24 * s, 0.95 * s, -len - 0.05 * s);
  ctx.lineTo(0.95 * s, -len); ctx.closePath(); ctx.fill();
  ctx.fillStyle = dim; ctx.beginPath(); ctx.moveTo(0.7 * s, -len - 0.2 * s); ctx.lineTo(1.05 * s, -len - 0.12 * s); ctx.lineTo(0.7 * s, -len - 0.04 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-0.8 * s, -len - 0.2 * s); ctx.lineTo(-1.25 * s + Math.sin(phase * TAU) * 0.08 * s, -len - 0.02 * s); ctx.lineTo(-0.8 * s, -len); ctx.closePath(); ctx.fill();
  for (let i = -0.6; i < 0.5; i += 0.22) tri(ctx, [i * s, -len - 0.24 * s, (i + 0.1) * s, -len - 0.34 * s, (i + 0.2) * s, -len - 0.24 * s], ridge);
  ctx.fillStyle = "#1c140d"; ctx.beginPath(); ctx.arc(0.5 * s, -len - 0.26 * s, 0.03 * s, 0, TAU); ctx.fill();
}
