// Simulation: producers + a single build-rate. Workers build, machines speed it
// up, limestone is the material. No upkeep, no disasters — clean idle progression.
import {
  RES, BUILDINGS, WORKERS, BLESSINGS, WEATHER,
  LIMESTONE_PER_BLOCK, PER_BUILDER, wonderGeom, blocksForLayer, wonderFor,
  FIRST_WONDER_TOTAL, BASE_CAPS, OFFLINE_CAP_S, OFFLINE_RATE,
} from "./data.js";
import {
  costFor, canAfford, spend, capsFor, clampResources, resolveQty,
  startNewDynasty, pushLog, pickWeather,
} from "./state.js";
import { nextRand } from "./rng.js";

export const WHIP_DUR = 5, WHIP_BASE = 0.85;

const byId = (list) => { const m = {}; for (const x of list) m[x.id] = x; return m; };
export const B = byId(BUILDINGS);
export const W = byId(WORKERS);
export const BL = byId(BLESSINGS);
export const WTH = byId(WEATHER);

const blessLvl = (s, id) => s.blessings[id] || 0;
const blessVal = (s, id) => blessLvl(s, id) * (BL[id] ? BL[id].per : 0);

// ---------------------------------------------------------------------------
export function computeStats(s) {
  const wx = WTH[s.weather.id] || WTH.clear, fx = wx.fx || {};
  const wc = s.workers, bc = s.buildings;

  let builders = 0, buildSpeed = 0, prodAllAcc = 0;
  for (const w of WORKERS) {
    const n = wc[w.id] || 0; if (!n) continue; const e = w.effect;
    if (e.builders) builders += e.builders * n;
    if (e.buildSpeed) buildSpeed += e.buildSpeed * n;
    if (e.prodAll) prodAllAcc += e.prodAll * n;
  }
  builders += blessVal(s, "great_gangs"); // +2 per level

  const prod = {}, caps = {}; for (const k of RES) { prod[k] = 0; caps[k] = BASE_CAPS[k] * (1 + 0.4 * (s.blessings.royal_treasury || 0)); }
  for (const b of BUILDINGS) {
    const n = bc[b.id] || 0; if (!n) continue; const e = b.effect;
    if (e.buildSpeed) buildSpeed += e.buildSpeed * n;
    if (e.prodAll) prodAllAcc += e.prodAll * n;
    if (e.produce) for (const k in e.produce) prod[k] += e.produce[k] * n;
    if (e.cap) for (const k in e.cap) caps[k] += e.cap[k] * n;
  }

  const prodAll = 1 + prodAllAcc + blessVal(s, "bountiful");
  for (const k of RES) prod[k] *= prodAll;
  const fertile = 1 + blessVal(s, "fertile_nile"), fw = fx.foodWaterMult || 1;
  prod.food *= fertile * fw; prod.water *= fertile * fw;

  const speedMult = (1 + buildSpeed + blessVal(s, "strong_backs") + blessVal(s, "swift_labor")) * (fx.buildMult || 1);
  const whipMult = (s.whip && s.whip.boostT > 0) ? (1 + WHIP_BASE * (1 + blessVal(s, "crack_of_ra"))) : 1;
  const lpb = Math.max(1, LIMESTONE_PER_BLOCK * (1 - blessVal(s, "master_masons")));
  const buildRate = Math.max(0, builders) * PER_BUILDER * speedMult * whipMult;

  return { prod, caps, builders, buildSpeed, speedMult, whipMult, buildRate, lpb, weather: wx, prodAll };
}

// ---------------------------------------------------------------------------
function addBlocks(s, n) {
  if (n <= 0) return;
  s.stats.totalBlocksAllTime += n;
  s.stats.totalBlocksThisDynasty += n;
  const k = s.wonderIndex, g = wonderGeom(k);
  while (n > 0 && s.layer < g.layers && !s.complete) {
    const need = blocksForLayer(k, s.layer) - s.blocksInLayer;
    if (n >= need) {
      n -= need; s.blocksInLayer = 0; s.layer += 1;
      if (s.layer >= g.layers) { s.complete = true; s._fx.push({ type: "complete" }); }
      else s._fx.push({ type: "layer", layer: s.layer });
    } else { s.blocksInLayer += n; n = 0; }
  }
}

// ---------------------------------------------------------------------------
export function step(s, dt) {
  if (!s._fx) s._fx = [];
  s.clock += dt; s.stats.playSeconds += dt;
  if (s.whip && s.whip.boostT > 0) s.whip.boostT -= dt;

  const st = computeStats(s);
  for (const k of RES) s.res[k] += st.prod[k] * dt;
  clampResources(s, st.caps);

  // weather
  s.weather.timeLeft -= dt;
  if (s.weather.timeLeft <= 0) {
    const nx = WTH[s.weather.nextId] || pickWeather(s, s.weather.id);
    s.weather.id = nx.id;
    s.weather.timeLeft = nx.min + nextRand(s) * (nx.max - nx.min);
    s.weather.nextId = pickWeather(s, nx.id).id;
    if (nx.id !== "clear") pushLog(s, nx.name + " — " + nx.desc, "info");
  }

  // build (worker-paced visuals are driven by _lastFlow / pending in the renderer)
  let limited = false;
  if (!s.complete) {
    const desired = st.buildRate * dt;
    const afford = s.res.limestone / st.lpb;
    const built = Math.min(desired, afford);
    if (built < desired - 1e-9 && st.buildRate > 0) limited = true;
    if (built > 0) { s.res.limestone -= built * st.lpb; addBlocks(s, built); s._lastFlow = built / dt; }
    else s._lastFlow = 0;
  } else s._lastFlow = 0;
  s._limited = limited;
  s._stats = st;
  return st;
}

// ---------------------------------------------------------------------------
export function whip(s) {
  if (!s.whip) s.whip = { boostT: 0 };
  s.whip.boostT = WHIP_DUR; s.whip.ever = true;
  if (!s._fx) s._fx = [];
  s._fx.push({ type: "whip" });
  return true;
}

export function isUnlocked(s, def) { return s.stats.totalBlocksAllTime >= (def.unlock || 0); }

export function buyBuilding(s, id) {
  const def = B[id]; if (!def || !isUnlocked(s, def)) return false;
  const owned = s.buildings[id] || 0, qty = resolveQty(s, def, owned);
  if (qty <= 0) return false;
  const cost = costFor(def, owned, qty);
  if (!canAfford(s.res, cost)) return false;
  spend(s.res, cost); s.buildings[id] = owned + qty; return true;
}
export function buyWorker(s, id) {
  const def = W[id]; if (!def || !isUnlocked(s, def)) return false;
  const owned = s.workers[id] || 0, qty = resolveQty(s, def, owned);
  if (qty <= 0) return false;
  const cost = costFor(def, owned, qty);
  if (!canAfford(s.res, cost)) return false;
  spend(s.res, cost); s.workers[id] = owned + qty; return true;
}
export function buyBlessing(s, id) {
  const def = BL[id]; if (!def) return false;
  const lvl = s.blessings[id] || 0, cost = Math.ceil(def.base * Math.pow(1.6, lvl));
  if (s.legacy < cost) return false;
  s.legacy -= cost; s.blessings[id] = lvl + 1; return true;
}
export function blessingCost(s, id) {
  const def = BL[id], lvl = s.blessings[id] || 0;
  return Math.ceil(def.base * Math.pow(1.6, lvl));
}

export function legacyGain(s) {
  const ratio = s.stats.totalBlocksThisDynasty / FIRST_WONDER_TOTAL;
  const g = Math.floor(8 * Math.pow(Math.max(0, ratio), 0.55) * (s.wonderIndex + 1));
  return Math.max(s.wonderIndex + 1, g);
}
export function canPrestige(s) { return s.complete === true; }
export function doPrestige(s) {
  if (!canPrestige(s)) return false;
  const gain = legacyGain(s);
  s.stats.wondersComplete += 1;
  pushLog(s, `The ${wonderFor(s.wonderIndex).name} is complete! +${gain} Legacy.`, "good");
  startNewDynasty(s, gain, s.wonderIndex + 1);
  return true;
}

export function freshlyUnlocked(s) {
  const out = [];
  for (const def of [...BUILDINGS, ...WORKERS]) {
    if (!isUnlocked(s, def)) continue;
    if (!s.seenUnlocks[def.id]) { s.seenUnlocks[def.id] = 1; out.push(def); }
  }
  return out;
}

export function simulateOffline(s, realSeconds) {
  if (!s._fx) s._fx = [];
  const capped = Math.min(realSeconds, OFFLINE_CAP_S), eff = capped * OFFLINE_RATE;
  if (eff < 2) return null;
  const st = computeStats(s);
  const before = {}; for (const k of RES) before[k] = s.res[k];
  const limeStart = before.limestone;
  for (const k of RES) s.res[k] = Math.max(0, Math.min(st.caps[k], s.res[k] + st.prod[k] * eff));
  let blocks = st.buildRate * eff;
  blocks = Math.min(blocks, (limeStart + st.prod.limestone * eff) / st.lpb);
  if (blocks > 0 && !s.complete) {
    s.res.limestone = Math.max(0, s.res.limestone - blocks * st.lpb);
    const n = s._fx.length; addBlocks(s, blocks); s._fx.length = n;
  }
  const gained = {}; for (const k of RES) gained[k] = s.res[k] - before[k];
  return { seconds: capped, blocks, gained };
}
