// Bootstrap: fixed-timestep loop, input (pointer/keyboard/gamepad), wiring of
// sim ↔ render ↔ audio ↔ ui, autosave and background catch-up.
import { STR } from "../strings.js";
import { BUILDINGS, WORKERS, BLESSINGS, AUTOSAVE_MS, wonderFor } from "./data.js";
import {
  step, computeStats, buyBuilding, buyWorker, buyBlessing,
  doPrestige, legacyGain, isUnlocked, freshlyUnlocked, simulateOffline, whip, harvestNode, placeBuilding,
  placementAt, upgradeBuilding,
} from "./sim.js";
import { load, save, wipe, exportSave, importSave } from "./save.js";
import { newGame } from "./state.js";
import { Renderer } from "./render3d.js";
import { Audio } from "./audio.js";
import { UI } from "./ui.js";
import { fmt } from "./format.js";

const STEP = 1000 / 60;

// ---- state / systems ----
let { state, offline } = load();
primeUnlocks(state);

const canvas = document.getElementById("c");
const renderer = new Renderer(canvas);
const audio = new Audio();
let lastStats = computeStats(state);

function primeUnlocks(s) {
  for (const def of [...BUILDINGS, ...WORKERS]) if (isUnlocked(s, def)) s.seenUnlocks[def.id] = 1;
}

// ---- responsive canvas ----
// The WebGL renderer owns the backing buffer (set via renderer.frame → _resize);
// here we only keep the canvas CSS box filling the viewport.
function resize() {
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
}
addEventListener("resize", resize);
addEventListener("orientationchange", resize);
resize();

// ---- app facade for UI ----
let ceremonyShownFor = -1;
const app = {
  getState: () => state,
  getStats: () => lastStats,
  setQty: (q) => { state.settings.qty = q; },
  buy: (kind, id) => {
    const ok = kind === "b" ? buyBuilding(state, id) : kind === "w" ? buyWorker(state, id) : buyBlessing(state, id);
    if (ok) audio.play("buy");
    return ok;
  },
  legacyGain: () => legacyGain(state),
  prestige: () => {
    if (doPrestige(state)) {
      ceremonyShownFor = -1;
      renderer.pan = { x: 0, y: 0 }; renderer.zoom = 1; renderer.cacheKey = "";
      audio.play("unlock");
      ui.toast(STR.dynastyToast(STR.dynasty(state.stats.dynasties + 1)), "good");
      save(state);
    }
  },
  whip: (x, y) => { ensureAudio(); whip(state); renderer.whipAt(x, y); ui.popup(STR.whipGo, "go"); },
  // place a building on a grid tile
  place: (id, gx, gz) => {
    const ok = placeBuilding(state, id, gx, gz);
    if (ok) { audio.play("buy"); renderer.plopAt(gx, gz); }
    return ok;
  },
  // place a building on a grid tile
  upgrade: (id) => { const ok = upgradeBuilding(state, id); if (ok) audio.play("buy"); return ok; },
  // celebratory burst on tier-up: ring every placed building of this type
  upgradeFx: (id) => {
    let any = false;
    for (const pl of (state.placements || [])) if (pl.id === id) { renderer.plopAt(pl.gx, pl.gz); any = true; }
    if (!any) renderer.kick(0.4);
    renderer.whipFlash = 0.35;
  },
  // A tap on the world: empty tile → build picker; a placed building → upgrade
  // panel; otherwise crack the whip. (Workers/camps gather; no tap-to-gather.)
  tap: (x, y) => {
    ensureAudio();
    const tile = renderer.tileAt(x, y);
    if (tile) {
      if (tile.occupied) { const p = placementAt(state, tile.gx, tile.gz); if (p) { ui.openUpgrade(p.id); return; } }
      else { ui.openBuildPicker(tile.gx, tile.gz); return; }
    }
    ui.closePanels();
    whip(state); renderer.whipAt(x, y); ui.popup(STR.whipGo, "go");
  },
  toggleMute: (m) => { state.settings.muted = m; audio.setMuted(m); },
  toggleMusic: (on) => { state.settings.music = on; audio.setMusic(on); },
  saveNow: () => save(state),
  exportSave: () => exportSave(state),
  importSave: (str) => {
    const s = importSave(str);
    if (!s) return false;
    state = s; primeUnlocks(state); renderer.cacheKey = ""; lastStats = computeStats(state);
    return true;
  },
  hardReset: () => {
    wipe(); state = newGame(); primeUnlocks(state);
    renderer.pan = { x: 0, y: 0 }; renderer.zoom = 1; renderer.cacheKey = "";
    lastStats = computeStats(state);
    ui.toast(STR.dynastyToast(STR.dynasty(1)), "good");
  },
};

const ui = new UI(app);
ui._syncQty();
audio.setMuted(state.settings.muted);

// ---- first-gesture audio unlock ----
let audioReady = false;
function ensureAudio() {
  if (audioReady) return;
  audioReady = true;
  audio.init(); audio.resume();
  if (state.settings.music && !state.settings.muted) audio.setMusic(true);
}

// ---- input: pointer (tap / pan / pinch) ----
const pointers = new Map();
let downPos = null, moved = 0, pinchDist = 0;
canvas.addEventListener("pointerdown", (e) => {
  ensureAudio();
  renderer.hoverTile(null);
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { downPos = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; }
  else if (pointers.size === 2) { const p = [...pointers.values()]; pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
});
canvas.addEventListener("pointermove", (e) => {
  if (pointers.size === 0) { renderer.hoverFootprint(e.clientX, e.clientY, ui.selectedBuildId()); return; } // mouse hover → tile / footprint highlight (footprint when build picker open)
  const prev = pointers.get(e.pointerId); if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const p = [...pointers.values()]; const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    if (pinchDist > 0) { renderer.zoom = Math.max(0.4, Math.min(3, renderer.zoom * (d / pinchDist))); }
    pinchDist = d; moved = 99; return;
  }
  moved += Math.abs(dx) + Math.abs(dy);
  if (moved > 8) { renderer.pan.x += dx; renderer.pan.y += dy; }
});
function endPointer(e) {
  const had = pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if (!had) return;
  if (pointers.size === 0 && downPos && moved < 8 && performance.now() - downPos.t < 600) {
    app.tap(downPos.x, downPos.y);
  }
  downPos = pointers.size ? downPos : null;
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  renderer.zoom = Math.max(0.4, Math.min(3, renderer.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
}, { passive: false });

// ---- keyboard (physical codes) ----
addEventListener("keydown", (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault(); app.whip(innerWidth / 2, innerHeight * 0.55);
  } else if (e.code === "KeyM") { app.toggleMute(!state.settings.muted); }
  else if (e.code === "Equal" || e.code === "NumpadAdd") { renderer.zoom = Math.min(3, renderer.zoom * 1.12); }
  else if (e.code === "Minus" || e.code === "NumpadSubtract") { renderer.zoom = Math.max(0.4, renderer.zoom * 0.9); }
});

// ---- gamepad ----
let padTapCd = 0;
function pollPad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  padTapCd -= dt;
  for (const gp of pads) {
    if (!gp) continue;
    if (gp.buttons[0] && gp.buttons[0].pressed && padTapCd <= 0) {
      ensureAudio(); app.whip(innerWidth / 2, innerHeight * 0.55); padTapCd = 0.3;
    }
  }
}

// ---- fx queue + unlock toasts ----
function drainFx() {
  const fx = state._fx; if (!fx || !fx.length) return;
  for (const f of fx) {
    if (f.type === "layer") {
      audio.play("layer"); renderer.celebrateLayer();
      ui.popup(STR.layerDone(f.layer), "good");
    } else if (f.type === "complete") {
      audio.play("capstone"); renderer.kick(9);
      if (ceremonyShownFor !== state.wonderIndex) {
        ceremonyShownFor = state.wonderIndex;
        ui.showCeremony(wonderFor(state.wonderIndex).name, legacyGain(state));
      }
    } else if (f.type === "whip") {
      audio.play("whip");
    } else if (f.type === "quest") {
      audio.play("unlock"); ui.pharaohSpeak(STR.pharaohQuestDone); renderer.kick(2);
      if (f.reward) { if (f.reward.legacy) ui.popup("+" + f.reward.legacy + " " + STR.legacy, "good"); }
    } else if (f.type === "level") {
      audio.play("unlock"); ui.pharaohSpeak(STR.pharaohLevel(f.level)); ui.popup(STR.level + " " + f.level + "!", "go"); renderer.whipFlash = 0.6;
    } else if (f.type === "milestone") {
      audio.play("unlock"); ui.milestone(f.text); renderer.kick(1.2); renderer.whipFlash = 0.5;
    }
  }
  fx.length = 0;
}
function checkUnlocks() {
  const u = freshlyUnlocked(state);
  for (const d of u) { ui.toast(STR.unlocked(d.name), "good"); audio.play("unlock"); }
}

// ---- background catch-up (tab hidden, not closed) ----
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); save(state); }
  else if (hiddenAt) {
    const gap = (Date.now() - hiddenAt) / 1000; hiddenAt = 0;
    if (gap > 3) { simulateOffline(state, gap); state._fx.length = 0; }
    last = performance.now();
  }
});
addEventListener("beforeunload", () => save(state));
setInterval(() => save(state), AUTOSAVE_MS);

// ---- main loop ----
const devEl = document.getElementById("dev");
const dev = new URLSearchParams(location.search).has("dev");
if (dev) { devEl.style.display = "block"; state.settings.dev = true; }
let last = performance.now(), acc = 0, uiAcc = 0, frames = 0, fpsAt = last, fps = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  let dt = now - last; last = now;
  if (dt > 300) dt = 300;
  acc += dt;
  let steps = 0;
  while (acc >= STEP) {
    lastStats = step(state, STEP / 1000);
    acc -= STEP; if (++steps > 8) { acc = 0; break; }
  }
  pollPad(dt / 1000);
  drainFx();
  checkUnlocks();

  renderer.frame(state, lastStats, Math.min(dt / 1000, 0.05), innerWidth, innerHeight);

  uiAcc += dt;
  if (uiAcc >= 90) { ui.update(state, lastStats); uiAcc = 0; }

  if (dev) {
    frames++;
    if (now - fpsAt >= 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
    devEl.textContent = `${fps} fps · workers ${renderer.workers.length} · blocks ${fmt(state.stats.totalBlocksAllTime)}`;
  }
}
requestAnimationFrame(frame);

// show offline summary once UI exists
if (offline) ui.showOffline(offline);
ui.update(state, lastStats);
