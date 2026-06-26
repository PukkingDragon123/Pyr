// localStorage persistence + offline catch-up.
import { newGame, SAVE_VERSION } from "./state.js";
import { simulateOffline } from "./sim.js";

const KEY = "btp_save_v1";

export function save(state) {
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) { return false; }
}

export function wipe() { try { localStorage.removeItem(KEY); } catch (e) {} }

// Returns { state, offline } — offline is a summary object or null.
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (!raw) return { state: newGame(), offline: null };
  let data;
  try { data = JSON.parse(raw); } catch (e) { return { state: newGame(), offline: null }; }
  if (!data || data.v !== SAVE_VERSION) {
    // unknown/old version → start fresh but keep nothing risky
    return { state: newGame(), offline: null };
  }
  const state = migrate(data);
  let offline = null;
  if (state.lastSaved) {
    const elapsed = (Date.now() - state.lastSaved) / 1000;
    if (elapsed > 60) offline = simulateOffline(state, elapsed);
  }
  return { state, offline };
}

// Defensive: ensure all expected containers exist (forward-compatible).
function migrate(s) {
  const base = newGame();
  s.res = Object.assign({}, base.res, s.res || {});
  s.buildings = Object.assign({}, base.buildings, s.buildings || {});
  s.workers = Object.assign({}, base.workers, s.workers || {});
  s.blessings = s.blessings || {};
  s.settings = Object.assign({}, base.settings, s.settings || {});
  s.stats = Object.assign({}, base.stats, s.stats || {});
  s.events = s.events || [];
  s.log = s.log || [];
  s.cd = s.cd || {};
  s.seenUnlocks = s.seenUnlocks || {};
  s.whip = Object.assign({ boostT: 0, cd: 0, ever: false }, s.whip || {});
  s.quests = s.quests || { index: 0 };
  s.tier = s.tier || {};
  if (typeof s.rng !== "number") s.rng = base.rng;
  if (typeof s.morale !== "number") s.morale = 100;
  if (!s.weather) s.weather = base.weather;
  s._fx = [];
  return s;
}

export function exportSave(state) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); }
  catch (e) { return ""; }
}

export function importSave(str) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    if (data && data.v === SAVE_VERSION) return migrate(data);
  } catch (e) {}
  return null;
}
