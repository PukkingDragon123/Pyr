// Simulation: producers + a single build-rate. Workers build, machines speed it
// up, limestone is the material. No upkeep, no disasters — clean idle progression.
import {
  RES, BUILDINGS, WORKERS, BLESSINGS, WEATHER,
  LIMESTONE_PER_BLOCK, PER_BUILDER, wonderGeom, blocksForLayer, wonderFor,
  FIRST_WONDER_TOTAL, BASE_CAPS, OFFLINE_CAP_S, OFFLINE_RATE,
  UNLOCK_LEVEL, levelForXp, questFor, HARVEST_BASE, PLACEABLE, ADJ_REQ,
  footprintCells, buildableTiles, MAX_TIER, TIER_MULT, upgradeCost,
  MILESTONES,
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

  const tier = s.tier || {};
  const prod = {}, caps = {}; for (const k of RES) { prod[k] = 0; caps[k] = BASE_CAPS[k] * (1 + 0.4 * (s.blessings.royal_treasury || 0)); }
  for (const b of BUILDINGS) {
    const n = bc[b.id] || 0; if (!n) continue; const e = b.effect;
    const m = TIER_MULT[(tier[b.id] || 1) - 1] || 1;   // upgrade-tier output multiplier
    if (e.buildSpeed) buildSpeed += e.buildSpeed * n * m;
    if (e.prodAll) prodAllAcc += e.prodAll * n * m;
    if (e.produce) for (const k in e.produce) prod[k] += e.produce[k] * n * m;
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
// Cosmetic milestones — derive a milestone's current value straight from state.
// No persisted fields; used only to decide when to toast (via transient _msSeen).
function milestoneValue(s, stat) {
  if (stat === "totalBlocksAllTime") return (s.stats && s.stats.totalBlocksAllTime) || 0;
  if (stat === "buildings") return Object.values(s.buildings || {}).reduce((a, b) => a + (b || 0), 0);
  if (stat === "workers") return Object.values(s.workers || {}).reduce((a, b) => a + (b || 0), 0);
  return 0;
}

// Push a {type:"milestone"} fx for any milestone newly satisfied. On first call
// (_msSeen undefined) pre-mark every already-satisfied milestone so reloading a
// save never re-toasts. Cosmetic only — touches no res/buildings/workers/stats.
function checkMilestones(s) {
  const first = s._msSeen === undefined;
  if (first) s._msSeen = new Set();
  for (const m of MILESTONES) {
    if (s._msSeen.has(m.id)) continue;
    const met = milestoneValue(s, m.need.stat) >= m.need.n;
    if (!met) continue;
    s._msSeen.add(m.id);
    if (!first) s._fx.push({ type: "milestone", text: m.text });
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

  // build — the pyramid rises purely from builder labor; it does NOT consume
  // resources (resources are for placing & upgrading buildings). This keeps the
  // game playable: hire laborers, watch it build.
  if (!s.complete) {
    const built = st.buildRate * dt;
    if (built > 0) { addBlocks(s, built); s._lastFlow = built / dt; } else s._lastFlow = 0;
  } else s._lastFlow = 0;
  s._limited = false;

  // level-up moments
  const lvl = levelForXp(s.stats.totalBlocksAllTime);
  if (s._level == null) s._level = lvl;
  else if (lvl > s._level) { for (let L = s._level + 1; L <= lvl; L++) s._fx.push({ type: "level", level: L }); s._level = lvl; }
  checkQuests(s);
  checkMilestones(s);

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

// Tap a resource node on the map to harvest a burst. The amount is a flat base
// plus a few seconds of current production for that resource (so taps stay
// meaningful early and scale late), reduced if the node is partly depleted, and
// clamped so it never overfills the stockpile cap.
export function harvestNode(s, res, charge) {
  if (!RES.includes(res)) return { res, amount: 0 };
  const st = s._stats || computeStats(s);
  const room = Math.max(0, (st.caps[res] || Infinity) - (s.res[res] || 0));
  const base = HARVEST_BASE[res] || 12;
  let amount = (base + (st.prod[res] || 0) * 6) * (0.55 + 0.45 * Math.max(0, Math.min(1, charge == null ? 1 : charge)));
  amount = Math.round(Math.min(amount, room));
  if (amount <= 0) return { res, amount: 0 };
  s.res[res] = (s.res[res] || 0) + amount;
  s.stats.taps = (s.stats.taps || 0) + 1;
  return { res, amount };
}

export function getLevel(s) { return levelForXp(s.stats.totalBlocksAllTime); }
export function isUnlocked(s, def) { return getLevel(s) >= (UNLOCK_LEVEL[def.id] || 1); }

// The Pharaoh's quests — advance & reward as each goal is met.
export function checkQuests(s) {
  if (!s.quests) s.quests = { index: 0 };
  let guard = 0;
  while (guard++ < 25) {
    const q = questFor(s);
    if (!q.goal(s)) break;
    if (q.reward) {
      if (q.reward.res) for (const k in q.reward.res) s.res[k] = (s.res[k] || 0) + q.reward.res[k];
      if (q.reward.legacy) { s.legacy += q.reward.legacy; s.stats.totalLegacyEarned += q.reward.legacy; }
    }
    s._fx.push({ type: "quest", text: q.text, reward: q.reward });
    s.quests.index++;
  }
}

export function buyBuilding(s, id) {
  const def = B[id]; if (!def || !isUnlocked(s, def)) return false;
  const owned = s.buildings[id] || 0, qty = resolveQty(s, def, owned);
  if (qty <= 0) return false;
  const cost = costFor(def, owned, qty);
  if (!canAfford(s.res, cost)) return false;
  spend(s.res, cost); s.buildings[id] = owned + qty; return true;
}
// ---- tile-grid placement (Clash-of-Clans village building) ----------------
let _bsetBase = -1, _bset = null;
function buildableSet(s) {
  const base = wonderGeom(s.wonderIndex).base;
  if (_bsetBase !== base) { _bsetBase = base; _bset = new Set(buildableTiles(base).map((c) => c.gx + "," + c.gz)); }
  return _bset;
}
// id occupying each cell currently covered by a placement footprint
function occMap(s) {
  const m = {};
  for (const p of s.placements || []) for (const [x, z] of footprintCells(p.id, p.gx, p.gz)) m[x + "," + z] = p.id;
  return m;
}
function adjOK(s, id, cells) {
  const need = ADJ_REQ[id]; if (!need) return true;
  const occ = occMap(s), inFp = new Set(cells.map((c) => c[0] + "," + c[1]));
  for (const [x, z] of cells) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const k = (x + dx) + "," + (z + dz);
    if (!inFp.has(k) && occ[k] === need) return true;
  }
  return false;
}
// Why can't this building go on this tile? Returns "" when it can.
export function placeReason(s, id, gx, gz) {
  const def = B[id];
  if (!def || !PLACEABLE.includes(id)) return "no";
  if (!isUnlocked(s, def)) return "locked";
  const bset = buildableSet(s), cells = footprintCells(id, gx, gz);
  if (!cells.every(([x, z]) => bset.has(x + "," + z))) return "space";   // footprint runs off the buildable grid
  const occ = occMap(s);
  if (cells.some(([x, z]) => occ[x + "," + z])) return "occupied";
  if (!adjOK(s, id, cells)) return "adjacency";
  if (!canAfford(s.res, costFor(def, s.buildings[id] || 0, 1))) return "cost";
  return "";
}
export function canPlaceAt(s, id, gx, gz) { return placeReason(s, id, gx, gz) === ""; }
export function placeBuilding(s, id, gx, gz) {
  if (!canPlaceAt(s, id, gx, gz)) return false;
  const def = B[id], owned = s.buildings[id] || 0;
  spend(s.res, costFor(def, owned, 1));
  s.buildings[id] = owned + 1;
  if (!s.placements) s.placements = [];
  s.placements.push({ id, gx, gz });
  return true;
}

// ---- upgrade tiers (tap a placed building to level it up) -----------------
export function buildingTier(s, id) { return (s.tier && s.tier[id]) || 1; }
export function canUpgrade(s, id) { return (s.buildings[id] || 0) > 0 && buildingTier(s, id) < MAX_TIER; }
export function upgradeCostFor(s, id) { return upgradeCost(B[id], buildingTier(s, id)); }
export function tierMult(s, id) { return TIER_MULT[buildingTier(s, id) - 1] || 1; }
export function upgradeBuilding(s, id) {
  if (!canUpgrade(s, id)) return false;
  const c = upgradeCostFor(s, id);
  if (!canAfford(s.res, c)) return false;
  spend(s.res, c); if (!s.tier) s.tier = {};
  s.tier[id] = buildingTier(s, id) + 1;
  return true;
}
// which placement (if any) covers tile (gx,gz)
export function placementAt(s, gx, gz) {
  for (const p of s.placements || []) for (const [x, z] of footprintCells(p.id, p.gx, p.gz)) if (x === gx && z === gz) return p;
  return null;
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
  for (const k of RES) s.res[k] = Math.max(0, Math.min(st.caps[k], s.res[k] + st.prod[k] * eff));
  const blocks = st.buildRate * eff;                       // build no longer consumes resources
  if (blocks > 0 && !s.complete) { const n = s._fx.length; addBlocks(s, blocks); s._fx.length = n; }
  const gained = {}; for (const k of RES) gained[k] = s.res[k] - before[k];
  return { seconds: capped, blocks, gained };
}
