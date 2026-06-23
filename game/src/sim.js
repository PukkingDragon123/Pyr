// Simulation: derived stats + fixed-timestep step + player actions.
import {
  RES, BUILDINGS, WORKERS, BLESSINGS, WEATHER, DISASTERS,
  LIMESTONE_PER_BLOCK, BASE_CLICK, wonderGeom, blocksForLayer, wonderFor,
  FIRST_WONDER_TOTAL, OFFLINE_CAP_S, OFFLINE_RATE,
} from "./data.js";
import {
  costFor, canAfford, spend, capsFor, clampResources, resolveQty,
  startNewDynasty, pushLog, pickWeather,
} from "./state.js";
import { nextRand, rangeRand, intRand } from "./rng.js";

export const BASE_WORKER_CAP = 5;

const byId = (list) => { const m = {}; for (const x of list) m[x.id] = x; return m; };
export const B = byId(BUILDINGS);
export const W = byId(WORKERS);
export const BL = byId(BLESSINGS);
export const WTH = byId(WEATHER);

const blessLvl = (s, id) => s.blessings[id] || 0;
const blessVal = (s, id) => blessLvl(s, id) * (BL[id] ? BL[id].per : 0);
export function hasEvent(s, id) { return s.events.some(e => e.id === id); }
function getEvent(s, id) { return s.events.find(e => e.id === id); }

// ---------------------------------------------------------------------------
// Derived stats for one tick — read by both the step and the UI/renderer.
// ---------------------------------------------------------------------------
export function computeStats(s) {
  const wx = WTH[s.weather.id] || WTH.clear;
  const fx = wx.fx || {};

  const globalMult = hasEvent(s, "pharaoh_death") ? 0.5 : 1;
  const plagueMult = hasEvent(s, "plague") ? 0.75 : 1;
  const strikeMult = hasEvent(s, "strike") ? 0.2 : 1;
  const moraleFactor = Math.max(0.3, Math.min(1.2, s.morale / 100));

  // worker tallies
  const wc = s.workers;
  let basePlacement = 0, supply = 0, engineerPct = 0, overseerSpeed = 0;
  let architectPct = 0, disasterFromWorkers = 1, moraleFromWorkers = 0;
  for (const w of WORKERS) {
    const n = wc[w.id] || 0; if (!n) continue;
    const e = w.effect;
    if (e.placement) basePlacement += e.placement * n;
    if (e.supply) supply += e.supply * n;
    if (e.transportPct) engineerPct += e.transportPct * n;
    if (e.speedPct) overseerSpeed += e.speedPct * n;
    if (e.workerPct) architectPct += e.workerPct * n;
    if (e.disasterMult) disasterFromWorkers *= Math.pow(e.disasterMult, n);
    if (e.morale) moraleFromWorkers += e.morale * n;
  }

  const swift = 1 + blessVal(s, "swift_labor");
  const workerEff = moraleFactor * plagueMult * strikeMult *
    (1 + overseerSpeed) * (1 + architectPct) * swift;

  // buildings
  const bc = s.buildings;
  let transportBase = 0, globalProd = 0, disasterFromBuild = 1, moraleFromBuild = 0;
  const prod = {}; for (const k of RES) prod[k] = 0;
  for (const b of BUILDINGS) {
    const n = bc[b.id] || 0; if (!n) continue;
    const e = b.effect;
    if (e.transport) transportBase += e.transport * n;
    if (e.globalProd) globalProd += e.globalProd * n;
    if (e.disasterMult) disasterFromBuild *= Math.pow(e.disasterMult, n);
    if (e.morale) moraleFromBuild += e.morale * n;
    if (e.produce) for (const k in e.produce) prod[k] += e.produce[k] * n;
  }

  const prodBonus = 1 + globalProd;
  for (const k of RES) prod[k] *= prodBonus;
  prod.limestone += supply * workerEff;          // cutters (morale-scaled)

  const fertile = 1 + blessVal(s, "fertile_nile");
  const fwProd = fx.foodWaterProdMult || 1;
  prod.food *= fertile * fwProd;
  prod.water *= fertile * fwProd;
  for (const k of RES) prod[k] *= globalMult;

  // upkeep
  let upFood = 0, upWater = 0;
  const waterUpMult = fx.waterUpkeepMult || 1;
  for (const w of WORKERS) {
    const n = wc[w.id] || 0; if (!n || !w.upkeep) continue;
    upFood += (w.upkeep.food || 0) * n;
    upWater += (w.upkeep.water || 0) * n * waterUpMult;
  }

  // chain rates (blocks/s)
  const placeWeather = fx.placementMult || 1;
  const placement = basePlacement * workerEff * placeWeather * globalMult;
  const transportActive = !hasEvent(s, "ramp_collapse");
  const transport = transportBase * (1 + engineerPct) * (1 + blessVal(s, "divine_engineering"))
    * (fx.transportMult || 1) * (transportActive ? 1 : 0) * globalMult;

  const lpb = Math.max(1, LIMESTONE_PER_BLOCK * (1 - blessVal(s, "master_masons")));
  const supplySustain = prod.limestone / lpb;

  const clickPower = Math.max(1, Math.round(
    (BASE_CLICK) * (1 + blessVal(s, "sun_blessing")) * (1 + basePlacement * 0.25) * globalMult
  ));

  // bottleneck = the smallest sustained stage (this is what caps throughput)
  const rateCap = Math.min(transport, placement);
  const trio = { supply: Math.max(0, supplySustain), transport, placement };
  let bottleneck = "supply", bv = Infinity;
  for (const key in trio) if (trio[key] < bv - 1e-9) { bv = trio[key]; bottleneck = key; }

  // disaster mitigation
  const disasterChanceMult = Math.max(0.05,
    disasterFromBuild * disasterFromWorkers * (1 - blessVal(s, "eternal_favor")));

  // worker housing
  let workerCap = BASE_WORKER_CAP;
  for (const b of BUILDINGS) if (b.effect.workerCap) workerCap += b.effect.workerCap * (bc[b.id] || 0);
  let workersUsed = 0; for (const w of WORKERS) workersUsed += wc[w.id] || 0;

  const moraleTarget = 100 + moraleFromBuild + moraleFromWorkers;

  return {
    prod, upkeep: { food: upFood, water: upWater },
    transport, placement, supplySustain, rateCap, bottleneck,
    lpb, clickPower, basePlacement, supply,
    caps: capsFor(s), disasterChanceMult, workerEff, moraleFactor,
    workerCap, workersUsed, moraleTarget, globalMult,
    weather: wx, fx,
  };
}

// ---------------------------------------------------------------------------
// Add placed blocks; fill layers; flag layer/wonder completion fx.
// ---------------------------------------------------------------------------
function addBlocks(s, n) {
  if (n <= 0) return;
  s.stats.totalBlocksAllTime += n;
  s.stats.totalBlocksThisDynasty += n;
  const k = s.wonderIndex;
  const g = wonderGeom(k);
  while (n > 0 && s.layer < g.layers && !s.complete) {
    const need = blocksForLayer(k, s.layer) - s.blocksInLayer;
    if (n >= need) {
      n -= need; s.blocksInLayer = 0; s.layer += 1;
      if (s.layer >= g.layers) {
        s.complete = true;
        s._fx.push({ type: "complete" });
      } else {
        s._fx.push({ type: "layer", layer: s.layer });
      }
    } else {
      s.blocksInLayer += n; n = 0;
    }
  }
}

export function tapPlace(s) {
  if (s.complete) return 0;
  const st = computeStats(s);
  const afford = s.res.limestone / st.lpb;
  const built = Math.min(st.clickPower, afford);
  if (built <= 0) { s._fx.push({ type: "nolime" }); return 0; }
  s.res.limestone -= built * st.lpb;
  s.stats.taps += 1;
  addBlocks(s, built);
  s._fx.push({ type: "place", manual: true, amount: built });
  return built;
}

// ---------------------------------------------------------------------------
// Disasters
// ---------------------------------------------------------------------------
function triggerDisaster(s, def, st) {
  if (def.id === "tomb_robbers") {
    // steal a chunk of the largest non-essential stockpile
    let bestK = null, bestV = 0;
    for (const k of RES) if (s.res[k] > bestV) { bestV = s.res[k]; bestK = k; }
    if (bestK) {
      const pct = rangeRand(s, 0.08, 0.2);
      const stolen = s.res[bestK] * pct;
      s.res[bestK] -= stolen;
      pushLog(s, `Tomb robbers stole ${Math.floor(stolen)} ${bestK}!`, "bad");
      s._fx.push({ type: "disaster", id: def.id });
    }
    s.cd.tomb_robbers = 50;
    return;
  }
  const dur = def.minDur + nextRand(s) * (def.maxDur - def.minDur);
  s.events.push({ id: def.id, timeLeft: dur, max: dur });
  if (def.id === "pharaoh_death") s.pendingCrown = true;
  pushLog(s, def.name + " — " + def.desc, "bad");
  s._fx.push({ type: "disaster", id: def.id });
  s.cd[def.id] = 60;
}

function updateEvents(s, dt) {
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i];
    if (e.id === "strike") {            // ends when morale recovers
      if (s.morale > 45) { s.events.splice(i, 1); pushLog(s, "The strike is over — crews return to work.", "good"); }
      continue;
    }
    e.timeLeft -= dt;
    if (e.timeLeft <= 0) {
      if (e.id === "ramp_collapse") pushLog(s, "The ramp is rebuilt. Transport resumes.", "good");
      if (e.id === "pharaoh_death") { s.pendingCrown = false; pushLog(s, "A new Pharaoh is crowned. Production recovers.", "good"); }
      s.events.splice(i, 1);
    }
  }
  for (const k in s.cd) if (s.cd[k] > 0) s.cd[k] -= dt;
}

function rollDisasters(s, dt, st) {
  for (const d of DISASTERS) {
    if (!d.random) continue;
    if (hasEvent(s, d.id)) continue;
    if ((s.cd[d.id] || 0) > 0) continue;
    let chance = (d.basePerMin / 60) * dt * st.disasterChanceMult;
    if (d.id === "ramp_collapse") chance *= (st.fx.rampRiskMult || 1);
    if (nextRand(s) < chance) triggerDisaster(s, d, st);
  }
  // strike: condition-driven
  if (!hasEvent(s, "strike") && s.morale < 22) {
    s.events.push({ id: "strike", timeLeft: 0 });
    pushLog(s, "Worker Strike! Starving crews down tools — restore food & water.", "bad");
    s._fx.push({ type: "disaster", id: "strike" });
  }
}

// ---------------------------------------------------------------------------
// One fixed-timestep tick.
// ---------------------------------------------------------------------------
export function step(s, dt) {
  if (!s._fx) s._fx = [];
  if (!s.cd) s.cd = {};
  s.clock += dt;
  s.stats.playSeconds += dt;

  const st = computeStats(s);

  // production
  for (const k of RES) s.res[k] += st.prod[k] * dt;

  // upkeep + starvation
  let starving = false;
  s.res.food -= st.upkeep.food * dt;
  s.res.water -= st.upkeep.water * dt;
  if (s.res.food < 0) { s.res.food = 0; starving = true; }
  if (s.res.water < 0) { s.res.water = 0; starving = true; }

  // morale toward target (minus starvation)
  let target = st.moraleTarget - (starving ? 55 : 0);
  s.morale += (target - s.morale) * Math.min(1, dt * 0.25);
  s.morale = Math.max(0, Math.min(st.moraleTarget, s.morale));

  // caps
  clampResources(s, st.caps);

  // weather
  s.weather.timeLeft -= dt;
  if (s.weather.timeLeft <= 0) {
    const nx = WTH[s.weather.nextId] || pickWeather(s, s.weather.id);
    s.weather.id = nx.id;
    s.weather.timeLeft = nx.min + nextRand(s) * (nx.max - nx.min);
    s.weather.nextId = pickWeather(s, nx.id).id;
    if (nx.id !== "clear") pushLog(s, nx.name + " — " + nx.desc, "warn");
  }

  // events + disasters
  updateEvents(s, dt);
  rollDisasters(s, dt, st);

  // build chain (auto) — limited by min(transport, placement) and limestone stock
  if (!s.complete) {
    const desired = st.rateCap * dt;
    const afford = s.res.limestone / st.lpb;
    const built = Math.min(desired, afford);
    if (built > 0) {
      s.res.limestone -= built * st.lpb;
      addBlocks(s, built);
      s._lastFlow = built / dt;
    } else {
      s._lastFlow = 0;
    }
  } else {
    s._lastFlow = 0;
  }

  s._stats = st; // cache for renderer/UI this frame
  return st;
}

// ---------------------------------------------------------------------------
// Purchases & actions
// ---------------------------------------------------------------------------
export function isUnlocked(s, def) { return s.stats.totalBlocksAllTime >= (def.unlock || 0); }

export function buyBuilding(s, id) {
  const def = B[id]; if (!def || !isUnlocked(s, def)) return false;
  const owned = s.buildings[id] || 0;
  const qty = resolveQty(s, def, owned);
  if (qty <= 0) return false;
  const cost = costFor(def, owned, qty);
  if (!canAfford(s.res, cost)) return false;
  spend(s.res, cost); s.buildings[id] = owned + qty;
  maybeUnlockToast(s);
  return true;
}

export function buyWorker(s, id) {
  const def = W[id]; if (!def || !isUnlocked(s, def)) return false;
  const owned = s.workers[id] || 0;
  const st = s._stats || computeStats(s);
  let qty = resolveQty(s, def, owned);
  const room = Math.max(0, st.workerCap - st.workersUsed);
  qty = Math.min(qty, room);
  if (qty <= 0) return false;
  const cost = costFor(def, owned, qty);
  if (!canAfford(s.res, cost)) return false;
  spend(s.res, cost); s.workers[id] = owned + qty;
  return true;
}

export function buyBlessing(s, id) {
  const def = BL[id]; if (!def) return false;
  const lvl = s.blessings[id] || 0;
  const cost = Math.ceil(def.base * Math.pow(1.6, lvl));
  if (s.legacy < cost) return false;
  s.legacy -= cost; s.blessings[id] = lvl + 1;
  return true;
}
export function blessingCost(s, id) {
  const def = BL[id]; const lvl = s.blessings[id] || 0;
  return Math.ceil(def.base * Math.pow(1.6, lvl));
}

export function repairRamp(s) {
  const e = getEvent(s, "ramp_collapse"); if (!e) return false;
  const cost = { wood: 80 + 20 * s.wonderIndex };
  if (!canAfford(s.res, cost)) return false;
  spend(s.res, cost);
  s.events.splice(s.events.indexOf(e), 1);
  pushLog(s, "You rush a repair crew — the ramp is fixed!", "good");
  return true;
}

export function crownSuccessor(s) {
  const e = getEvent(s, "pharaoh_death"); if (!e) return false;
  s.events.splice(s.events.indexOf(e), 1);
  s.pendingCrown = false;
  pushLog(s, "Long live the new Pharaoh! Production recovers.", "good");
  return true;
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
  const next = s.wonderIndex + 1;
  pushLog(s, `The ${wonderFor(s.wonderIndex).name} is complete! +${gain} Legacy. A new dynasty rises.`, "good");
  startNewDynasty(s, gain, next);
  return true;
}

// Credit idle progress for time spent away (no disasters; reduced rate).
export function simulateOffline(s, realSeconds) {
  if (!s._fx) s._fx = [];
  const capped = Math.min(realSeconds, OFFLINE_CAP_S);
  const eff = capped * OFFLINE_RATE;
  if (eff < 2) return null;
  const st = computeStats(s);
  const before = {}; for (const k of RES) before[k] = s.res[k];
  for (const k of RES) {
    const up = k === "food" ? st.upkeep.food : k === "water" ? st.upkeep.water : 0;
    const v = s.res[k] + (st.prod[k] - up) * eff;
    s.res[k] = Math.max(0, Math.min(st.caps[k], v));
  }
  const blocks = Math.max(0, Math.min(st.rateCap, st.supplySustain)) * eff;
  const fxBefore = s._fx.length;
  addBlocks(s, blocks);
  s._fx.length = fxBefore; // suppress per-layer fx for offline catch-up
  const gained = {}; for (const k of RES) gained[k] = s.res[k] - before[k];
  return { seconds: capped, blocks, gained };
}

// Track first-time unlocks → toast/sfx handled by main via queue.
function maybeUnlockToast(s) {/* reserved */}
export function freshlyUnlocked(s) {
  const out = [];
  for (const def of [...BUILDINGS, ...WORKERS]) {
    if (!isUnlocked(s, def)) continue;
    if (!s.seenUnlocks[def.id]) { s.seenUnlocks[def.id] = 1; out.push(def); }
  }
  return out;
}
