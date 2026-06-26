// Game state: construction, persistence-friendly plain data + pure helpers.
import { RES, BASE_CAPS, BUILDINGS, WORKERS, WEATHER, buildableTiles, wonderGeom, ADJ_REQ } from "./data.js";
import { randSeed, nextRand } from "./rng.js";

// Lay the starter buildings out on the tile grid (adjacency-respecting), so the
// opening village is valid and the renderer has real positions to draw.
function seedPlacements(state) {
  const cells = buildableTiles(wonderGeom(state.wonderIndex).base).slice();
  cells.sort((a, b) => (a.gx * a.gx + (a.gz - 2) * (a.gz - 2)) - (b.gx * b.gx + (b.gz - 2) * (b.gz - 2)));
  const used = new Set(), placements = [];
  const place = (id, near) => {
    for (const c of cells) {
      const k = c.gx + "," + c.gz; if (used.has(k)) continue;
      if (near && !placements.some((p) => p.id === near && Math.abs(p.gx - c.gx) + Math.abs(p.gz - c.gz) === 1)) continue;
      used.add(k); placements.push({ id, gx: c.gx, gz: c.gz }); return;
    }
  };
  const order = ["quarry", "well", "village", "lumber_camp", "farm", "granite_mine", "copper_mine", "granary", "storage_yard", "docks", "market", "temple"];
  for (const id of order) { let n = state.buildings[id] || 0; while (n-- > 0) place(id, ADJ_REQ[id]); }
  state.placements = placements;
}

export const SAVE_VERSION = 1;

// Start from absolute zero — no prebuilt camps or crew. Just enough resources
// in the granary to lay your first few buildings and hire your first laborers.
const STARTER_RES = { limestone: 130, sand: 30, granite: 0, wood: 60, copper: 0, food: 60, water: 45 };
const STARTER_BUILDINGS = {};
const STARTER_WORKERS = {};

function emptyCounts(list) {
  const o = {}; for (const x of list) o[x.id] = 0; return o;
}

function pickWeather(state, excludeId) {
  const pool = WEATHER.filter(w => w.id !== excludeId);
  let total = 0; for (const w of pool) total += w.weight;
  let r = nextRand(state) * total;
  for (const w of pool) { r -= w.weight; if (r <= 0) return w; }
  return pool[0];
}

// Build the per-dynasty (resettable) part of state, applying Royal Treasury.
function freshDynasty(state) {
  const tre = state.blessings.royal_treasury || 0;

  const res = {}; for (const k of RES) res[k] = STARTER_RES[k] || 0;
  res.limestone += 200 * tre; res.wood += 80 * tre; res.food += 60 * tre;
  res.water += 60 * tre; res.granite += 20 * tre; res.copper += 20 * tre;

  const buildings = emptyCounts(BUILDINGS);
  for (const k in STARTER_BUILDINGS) buildings[k] = STARTER_BUILDINGS[k];
  buildings.quarry += tre; buildings.farm += tre; buildings.well += tre;
  buildings.lumber_camp += tre; buildings.village += tre;

  const workers = emptyCounts(WORKERS);
  for (const k in STARTER_WORKERS) workers[k] = STARTER_WORKERS[k];
  workers.laborer += 2 * tre;

  state.res = res;
  state.buildings = buildings;
  state.workers = workers;
  state.tier = {};              // per-building-type upgrade level (1 = default)
  seedPlacements(state);        // tile placements {id,gx,gz}; building counts stay authoritative
  state.layer = 0;
  state.blocksInLayer = 0;
  state.capstoneCelebrated = false;
  state.complete = false;
  state.morale = 100;
  state.events = [];
  state.pendingCrown = false;
  state.stats.totalBlocksThisDynasty = 0;
  const first = pickWeather(state, null);
  state.weather = { id: first.id, timeLeft: first.min + nextRand(state) * (first.max - first.min),
                    nextId: pickWeather(state, first.id).id };
  return state;
}

export function newGame() {
  const state = {
    v: SAVE_VERSION,
    seed: randSeed(),
    rng: randSeed(),
    legacy: 0,
    blessings: {},
    wonderIndex: 0,
    clock: 0,
    log: [],
    seenUnlocks: {},
    whip: { boostT: 0, cd: 0, ever: false },
    quests: { index: 0 },
    settings: { muted: false, music: true, qty: 1, dev: false },
    stats: {
      totalBlocksAllTime: 0, totalBlocksThisDynasty: 0, dynasties: 0,
      taps: 0, playSeconds: 0, totalLegacyEarned: 0, wondersComplete: 0,
    },
    lastSaved: Date.now(),
  };
  freshDynasty(state);
  return state;
}

export function startNewDynasty(state, legacyGain, nextWonder) {
  state.legacy += legacyGain;
  state.stats.totalLegacyEarned += legacyGain;
  state.stats.dynasties += 1;
  state.wonderIndex = nextWonder;
  freshDynasty(state);
  state.lastSaved = Date.now();
  return state;
}

// ---- cost / cap helpers (pure) ----
export function geoSum(base, scale, owned, qty) {
  // total cost to buy `qty` items starting from `owned`, each base*scale^n
  // = base * scale^owned * (scale^qty - 1) / (scale - 1)
  return base * Math.pow(scale, owned) * (Math.pow(scale, qty) - 1) / (scale - 1);
}

export function costFor(def, owned, qty) {
  const out = {};
  for (const k in def.cost) out[k] = geoSum(def.cost[k], def.scale, owned, qty);
  return out;
}

export function canAfford(res, cost) {
  for (const k in cost) if ((res[k] || 0) < cost[k] - 1e-6) return false;
  return true;
}

export function spend(res, cost) {
  for (const k in cost) res[k] -= cost[k];
}

// Largest qty of a building/worker affordable with current resources (≥1 cap).
export function maxAffordable(res, def, owned) {
  // find max n where geoSum(...n) affordable; binary-ish via per-resource limit
  let best = Infinity;
  for (const k in def.cost) {
    const have = res[k] || 0;
    const unit = def.cost[k] * Math.pow(def.scale, owned);
    // have >= unit*(scale^n-1)/(scale-1) → solve for n
    const ratio = have * (def.scale - 1) / unit + 1;
    const n = ratio > 1 ? Math.floor(Math.log(ratio) / Math.log(def.scale)) : 0;
    best = Math.min(best, n);
  }
  return Math.max(0, isFinite(best) ? best : 0);
}

export function resolveQty(state, def, owned) {
  const q = state.settings.qty;
  if (q === "max") return Math.max(1, maxAffordable(state.res, def, owned));
  return q;
}

export function capsFor(state) {
  const tre = state.blessings.royal_treasury || 0;
  const caps = {};
  for (const k of RES) caps[k] = BASE_CAPS[k] * (1 + 0.4 * tre);
  for (const b of BUILDINGS) {
    const n = state.buildings[b.id] || 0;
    if (n && b.effect.cap) for (const k in b.effect.cap) caps[k] += b.effect.cap[k] * n;
  }
  return caps;
}

export function clampResources(state, caps) {
  for (const k of RES) if (state.res[k] > caps[k]) state.res[k] = caps[k];
}

export function pushLog(state, text, kind = "info") {
  state.log.unshift({ t: Math.floor(state.clock), text, kind });
  if (state.log.length > 60) state.log.length = 60;
}

export { pickWeather };
