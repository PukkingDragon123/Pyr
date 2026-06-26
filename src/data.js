// ============================================================================
// BALANCE DATA — all tunable numbers + names live here.
// Simple model: buildings PRODUCE resources; workers BUILD (haul blocks);
// machines make building faster. No upkeep, no disasters — clean idle progression.
// ============================================================================
import { makeRng } from "./rng.js";

export const RES = ["limestone", "sand", "granite", "wood", "copper", "food", "water"];

export const RES_META = {
  limestone: { name: "Limestone", color: "#e7d6ad", dark: "#b9a373", icon: "limestone" },
  sand:      { name: "Sand",      color: "#e6c878", dark: "#bb9b4a", icon: "sand" },
  granite:   { name: "Granite",   color: "#c98a9b", dark: "#8e5c6b", icon: "granite" },
  wood:      { name: "Wood",      color: "#b07a44", dark: "#7c5530", icon: "wood" },
  copper:    { name: "Copper",    color: "#e08a4e", dark: "#a85f2e", icon: "copper" },
  food:      { name: "Food",      color: "#d9c24a", dark: "#9c8a26", icon: "food" },
  water:     { name: "Water",     color: "#49b5d6", dark: "#2c7c97", icon: "water" },
};

export const BASE_CAPS = {
  limestone: 8000, sand: 6000, granite: 2000, wood: 4000, copper: 2000, food: 2500, water: 2500,
};

export const LIMESTONE_PER_BLOCK = 5; // reduced by Master Masons
export const PER_BUILDER = 0.5;        // blocks/sec per builder before multipliers

// ----------------------------------------------------------------------------
// Procedural resource map. Worker camps send gatherers to these nodes, and the
// player can tap a node to harvest a burst (Clash-of-Clans style). Positions are
// deterministic from the dynasty seed so the world is stable across reloads.
// Each cluster sits in the same neighbourhood as the camp that works it.
// ----------------------------------------------------------------------------
export const HARVEST_BASE = { limestone: 28, sand: 18, wood: 16, food: 16, water: 16, granite: 7, copper: 7 };
const NODE_CLUSTERS = [
  { t: "tree",    res: "wood",      n: 7, cx: (B) => -B / 2 - 12, cz: 5,   rx: 7,  rz: 10 },
  { t: "rock",    res: "limestone", n: 8, cx: (B) =>  B / 2 + 11, cz: 0,   rx: 6,  rz: 11 },
  { t: "dune",    res: "sand",      n: 6, cx: (B) => -B / 2 - 6,  cz: -12, rx: 9,  rz: 5 },
  { t: "granite", res: "granite",   n: 3, cx: (B) =>  B / 2 + 16, cz: 10,  rx: 4,  rz: 5 },
  { t: "copper",  res: "copper",    n: 3, cx: (B) =>  B / 2 + 16, cz: -11, rx: 4,  rz: 5 },
];
// Deterministic node list for a given seed + pyramid base. Pure (own RNG stream).
export function genNodes(seed, base) {
  const rng = makeRng(((seed >>> 0) ^ 0x9e3779b9 ^ (base * 0x85ebca6b)) >>> 0);
  const nodes = [];
  for (const c of NODE_CLUSTERS) {
    const cx = c.cx(base);
    for (let i = 0; i < c.n; i++) {
      nodes.push({
        t: c.t, res: c.res,
        x: cx + (rng() * 2 - 1) * c.rx,
        z: c.cz + (rng() * 2 - 1) * c.rz,
        s: 0.7 + rng() * 0.7,
        rot: rng() * Math.PI * 2,
      });
    }
  }
  return nodes;
}

// ----------------------------------------------------------------------------
// Buildings. cat: resource | machine | city.  zone = where it appears in the world.
// effect keys: produce{res}, buildSpeed (adds to the build multiplier),
// prodAll (adds to global production %), cap{res}.
// ----------------------------------------------------------------------------
export const BUILDINGS = [
  // --- resource producers ---
  { id: "quarry", name: "Limestone Quarry", cat: "resource", zone: "quarry", scale: 1.15, unlock: 0,
    desc: "Hews pale limestone — the body of every pyramid.",
    cost: { limestone: 15, wood: 5 }, effect: { produce: { limestone: 1.0 } } },
  { id: "sand_pit", name: "Sand Pit", cat: "resource", zone: "quarry", scale: 1.15, unlock: 0,
    desc: "Diggers haul desert sand for mortar, ramps and casing.",
    cost: { limestone: 12, wood: 4 }, effect: { produce: { sand: 1.1 } } },
  { id: "farm", name: "Nile Farm", cat: "resource", zone: "farm", scale: 1.15, unlock: 0,
    desc: "Riverside fields of grain.",
    cost: { limestone: 18, wood: 8 }, effect: { produce: { food: 0.85 } } },
  { id: "well", name: "Water Well", cat: "resource", zone: "well", scale: 1.15, unlock: 0,
    desc: "Draws cool water for the camps.",
    cost: { limestone: 18, wood: 8 }, effect: { produce: { water: 0.85 } } },
  { id: "lumber_camp", name: "Lumber Camp", cat: "resource", zone: "lumber", scale: 1.16, unlock: 0,
    desc: "Acacia and cedar for sleds and machines.",
    cost: { limestone: 30, food: 12 }, effect: { produce: { wood: 0.6 } } },
  { id: "granite_mine", name: "Granite Quarry", cat: "resource", zone: "granite", scale: 1.17, unlock: 100,
    desc: "Hard granite for casing and capstones.",
    cost: { limestone: 90, wood: 35, copper: 5 }, effect: { produce: { granite: 0.32 } } },
  { id: "copper_mine", name: "Copper Mine", cat: "resource", zone: "copper", scale: 1.17, unlock: 100,
    desc: "Copper for chisels and saws.",
    cost: { limestone: 80, wood: 35 }, effect: { produce: { copper: 0.27 } } },

  // --- machines: make building faster (+build speed) ---
  { id: "wooden_rollers", name: "Wooden Rollers", cat: "machine", zone: "ramp", scale: 1.15, unlock: 0,
    desc: "Logs under the sled. +4% build speed each.",
    cost: { wood: 20, limestone: 10, sand: 8 }, effect: { buildSpeed: 0.04 } },
  { id: "rope_winch", name: "Rope Winch", cat: "machine", zone: "ramp", scale: 1.16, unlock: 40,
    desc: "Palm-rope pulleys. +9% build speed each.",
    cost: { wood: 60, copper: 8 }, effect: { buildSpeed: 0.09 } },
  { id: "sled", name: "Greased Sled", cat: "machine", zone: "ramp", scale: 1.17, unlock: 150,
    desc: "Water-slick runners. +20% build speed each.",
    cost: { wood: 150, copper: 20 }, effect: { buildSpeed: 0.2 } },
  { id: "crane", name: "Counterweight Crane", cat: "machine", zone: "ramp", scale: 1.18, unlock: 700,
    desc: "Shaduf counterweights lift blocks high. +50% each.",
    cost: { wood: 500, copper: 120, granite: 30 }, effect: { buildSpeed: 0.5 } },
  { id: "lubrication", name: "Water Lubrication", cat: "machine", zone: "ramp", scale: 1.19, unlock: 2500,
    desc: "Frictionless channels. +120% build speed each.",
    cost: { copper: 400, granite: 120, water: 2500 }, effect: { buildSpeed: 1.2 } },
  { id: "massive_ramp", name: "Spiraling Mega-Ramp", cat: "machine", zone: "ramp", scale: 1.2, unlock: 6000,
    desc: "A ramp wrapping the whole pyramid. +260% each.",
    cost: { limestone: 20000, wood: 5000, granite: 500 }, effect: { buildSpeed: 2.6 } },
  { id: "elevator", name: "Giant Stone Elevator", cat: "machine", zone: "ramp", scale: 1.21, unlock: 16000,
    desc: "Impossible machinery hauls blocks straight up. +650% each.",
    cost: { copper: 8000, granite: 4000 }, effect: { buildSpeed: 6.5 } },
  { id: "marvel", name: "Experimental Marvel", cat: "machine", zone: "ramp", scale: 1.23, unlock: 45000,
    desc: "Engineering that should not work — yet does. +1700% each.",
    cost: { granite: 30000, copper: 30000 }, effect: { buildSpeed: 17 } },

  // --- city / support ---
  { id: "village", name: "Worker Village", cat: "city", zone: "village", scale: 1.16, unlock: 0,
    desc: "Mud-brick homes and camps. +3% build speed each.",
    cost: { limestone: 50, wood: 30, food: 20 }, effect: { buildSpeed: 0.03 } },
  { id: "granary", name: "Granary", cat: "city", zone: "village", scale: 1.16, unlock: 30,
    desc: "Stores food & water and yields a little grain.",
    cost: { limestone: 60, wood: 40 }, effect: { cap: { food: 800, water: 600 }, produce: { food: 0.3 } } },
  { id: "storage_yard", name: "Storage Yard", cat: "city", zone: "storage", scale: 1.17, unlock: 120,
    desc: "Raises how much you can stockpile.",
    cost: { wood: 120, limestone: 90, sand: 40 }, effect: { cap: { limestone: 3000, granite: 800, wood: 1200, copper: 700, sand: 2500 } } },
  { id: "docks", name: "River Docks", cat: "city", zone: "nile", scale: 1.18, unlock: 250,
    desc: "Barges on the Nile bring water and trade.",
    cost: { wood: 220, copper: 30 }, effect: { produce: { water: 1.5 }, buildSpeed: 0.02 } },
  { id: "market", name: "Grand Market", cat: "city", zone: "market", scale: 1.22, unlock: 350,
    desc: "Trade lifts every industry (+3% production each).",
    cost: { limestone: 220, wood: 130, copper: 22 }, effect: { prodAll: 0.03 } },
  { id: "temple", name: "Temple", cat: "city", zone: "temple", scale: 1.2, unlock: 500,
    desc: "Honors the gods. +5% build speed each.",
    cost: { limestone: 420, granite: 45 }, effect: { buildSpeed: 0.05 } },
];

// ----------------------------------------------------------------------------
// Tile-grid village building (Clash-of-Clans style). Resource + city buildings
// are PLACED on empty tiles around the pyramid; some require a neighbouring
// building (adjacency). Crew / machines / blessings stay in the side menu.
// ----------------------------------------------------------------------------
export const TILE = 2.3;                                  // world units per grid cell
export const PLACEABLE = ["quarry", "sand_pit", "well", "farm", "lumber_camp", "granite_mine", "copper_mine", "village", "granary", "storage_yard", "docks", "market", "temple"];
// a building can only go on a tile next to one of these (null = anywhere)
export const ADJ_REQ = {
  farm: "well", granary: "farm", granite_mine: "quarry", copper_mine: "quarry", market: "village", temple: "market",
};
export const ADJ_LABEL = {
  well: "a Water Well", farm: "a Nile Farm", quarry: "a Limestone Quarry", village: "a Worker Village", market: "a Grand Market",
};
// Buildable tiles for a pyramid of the given base: a ring of cells around the
// footprint (the pyramid sits in the middle; the far bank is reserved).
export function buildableTiles(base) {
  const off = (base - 1) / 2, clear = off + 1.7, cells = [];
  for (let gx = -8; gx <= 8; gx++) for (let gz = -7; gz <= 10; gz++) {
    const wx = gx * TILE, wz = gz * TILE;
    if (Math.abs(wx) < clear && Math.abs(wz) < clear) continue; // under the pyramid
    if (wz < -off - 11) continue;                               // reserve the far bank toward the Nile
    cells.push({ gx, gz });
  }
  return cells;
}
// Footprint (in tiles) per building — bigger civic buildings cover more ground,
// so the village has varied shapes & sizes. Anchor is the min corner (gx,gz).
export const SIZE = { temple: [2, 2], market: [2, 1], granary: [2, 1], storage_yard: [2, 1] };
export function footprintCells(id, gx, gz) {
  const s = SIZE[id] || [1, 1], out = [];
  for (let x = 0; x < s[0]; x++) for (let z = 0; z < s[1]; z++) out.push([gx + x, gz + z]);
  return out;
}

// ----------------------------------------------------------------------------
// Building upgrade tiers (Clash-of-Clans style): each building TYPE has a level
// 1..MAX_TIER; output is multiplied by TIER_MULT[level-1]. Upgrading costs more
// of the building's own resources at each step.
// ----------------------------------------------------------------------------
export const MAX_TIER = 5;
export const TIER_MULT = [1, 2.2, 4.6, 9.5, 19];
export function upgradeCost(def, tier) {           // cost to go from `tier` → tier+1
  const f = Math.pow(3.4, tier), out = {};
  for (const k in def.cost) out[k] = Math.ceil(def.cost[k] * 3 * f);
  return out;
}

// ----------------------------------------------------------------------------
// Workers. effect keys: builders (haulers added), buildSpeed, prodAll.
// ----------------------------------------------------------------------------
export const WORKERS = [
  { id: "laborer", name: "Laborer", scale: 1.15, unlock: 0,
    desc: "Hauls blocks up the ramp. More laborers = more workers building.",
    cost: { food: 10, limestone: 5 }, effect: { builders: 1 } },
  { id: "mason", name: "Stone Mason", scale: 1.16, unlock: 60,
    desc: "Dresses stone fast. +5% build speed each.",
    cost: { limestone: 40, copper: 3 }, effect: { buildSpeed: 0.05 } },
  { id: "engineer", name: "Engineer", scale: 1.18, unlock: 250,
    desc: "Tunes the machines. +8% build speed each.",
    cost: { wood: 60, copper: 15 }, effect: { buildSpeed: 0.08 } },
  { id: "priest", name: "Priest", scale: 1.19, unlock: 500,
    desc: "Blesses the works. +4% all resource production each.",
    cost: { food: 200, granite: 20 }, effect: { prodAll: 0.04 } },
  { id: "architect", name: "Architect", scale: 1.2, unlock: 1200,
    desc: "Master builder: +2 builders and +5% build speed each.",
    cost: { limestone: 500, granite: 30, copper: 40 }, effect: { builders: 2, buildSpeed: 0.05 } },
  { id: "overseer", name: "Overseer", scale: 1.22, unlock: 2200,
    desc: "Drives the gangs. +7% build speed each.",
    cost: { limestone: 800, copper: 80 }, effect: { buildSpeed: 0.07 } },
];

// ----------------------------------------------------------------------------
// Prestige blessings (Pharaoh Legacy). cost = base * 1.6^level.
// kind consumed by sim: build | masons | fertile | prodAll | builders | whip | treasury
// ----------------------------------------------------------------------------
export const BLESSINGS = [
  { id: "strong_backs", name: "Strong Backs", base: 3, desc: "+25% build speed per level.", per: 0.25, kind: "build" },
  { id: "master_masons", name: "Master Masons", base: 4, desc: "−7% limestone per block per level.", per: 0.07, kind: "masons" },
  { id: "swift_labor", name: "Swift Labor", base: 5, desc: "+15% build speed per level.", per: 0.15, kind: "build" },
  { id: "bountiful", name: "Bountiful Lands", base: 4, desc: "+20% all resource production per level.", per: 0.2, kind: "prodAll" },
  { id: "fertile_nile", name: "Fertile Nile", base: 3, desc: "+25% food & water per level.", per: 0.25, kind: "fertile" },
  { id: "great_gangs", name: "Great Gangs", base: 6, desc: "+2 free builders per level.", per: 2, kind: "builders" },
  { id: "royal_treasury", name: "Royal Treasury", base: 5, desc: "+1 starter building & +40% caps per level.", per: 0.4, kind: "treasury" },
  { id: "crack_of_ra", name: "Crack of Ra", base: 4, desc: "+60% whip power per level.", per: 0.6, kind: "whip" },
];

// ----------------------------------------------------------------------------
// Wonders — the prestige ladder. Beyond the list, generated procedurally.
// ----------------------------------------------------------------------------
export const WONDERS = [
  { id: "step",     name: "Step Pyramid",            faces: ["#ece0c2", "#cdba93", "#a2855a"], capstone: "#eac24f" },
  { id: "bent",     name: "Bent Pyramid",            faces: ["#efe0c0", "#d0bd92", "#9c8154"], capstone: "#eac24f" },
  { id: "great",    name: "Great Pyramid of Giza",   faces: ["#f2e8d0", "#d8c69c", "#ab8d60"], capstone: "#f3cf58" },
  { id: "golden",   name: "Golden Pyramid",          faces: ["#ffe9a6", "#f0c659", "#b8891f"], capstone: "#fff2b0" },
  { id: "obsidian", name: "Black Obsidian Pyramid",  faces: ["#3d3654", "#272235", "#15121e"], capstone: "#7be0ff" },
  { id: "divine",   name: "Floating Divine Pyramid", faces: ["#c6ecff", "#86bbe8", "#5f74c8"], capstone: "#ffffff", glow: true },
];

const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh",
  "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];

export function wonderFor(k) {
  if (k < WONDERS.length) return WONDERS[k];
  const n = k - WONDERS.length + 1;
  const hue = (k * 47) % 360;
  return {
    id: "aeon" + k,
    name: `Impossible Monument of the ${ORDINAL[n] || n + "th"} Aeon`,
    faces: [`hsl(${hue} 55% 72%)`, `hsl(${hue} 50% 52%)`, `hsl(${hue} 45% 34%)`],
    capstone: `hsl(${(hue + 40) % 360} 90% 75%)`, glow: true,
  };
}

export function wonderGeom(k) {
  const base = 14 + 4 * k;
  const layers = Math.floor(base / 2);
  const blocksPerCube = Math.round(Math.pow(6, k));
  return { base, layers, blocksPerCube };
}
export function cubesInLayer(k, j) { const side = (14 + 4 * k) - 2 * j; return side > 0 ? side * side : 0; }
export function blocksForLayer(k, j) { return cubesInLayer(k, j) * wonderGeom(k).blocksPerCube; }
export function wonderTotalBlocks(k) {
  const g = wonderGeom(k); let t = 0;
  for (let j = 0; j < g.layers; j++) t += blocksForLayer(k, j);
  return t;
}
export const FIRST_WONDER_TOTAL = wonderTotalBlocks(0);

// ----------------------------------------------------------------------------
// Weather — light flavour only: a small build/production modifier, no disasters.
// ----------------------------------------------------------------------------
export const WEATHER = [
  { id: "clear", name: "Clear Skies", desc: "Perfect building weather.", weight: 6, min: 90, max: 160, fx: {} },
  { id: "sandstorm", name: "Sandstorm", desc: "Blowing sand slows the gangs a little.", weight: 2, min: 45, max: 80, fx: { buildMult: 0.82 } },
  { id: "heat", name: "Hot Day", desc: "The crews work a touch slower in the heat.", weight: 2, min: 50, max: 90, fx: { buildMult: 0.9 } },
  { id: "flood", name: "Nile Flood", desc: "The river overflows — fields drink deep (+food & water).", weight: 1.6, min: 55, max: 95, fx: { foodWaterMult: 1.8 } },
];

export const OFFLINE_CAP_S = 12 * 3600;
export const OFFLINE_RATE = 0.5;
export const AUTOSAVE_MS = 10000;

// ----------------------------------------------------------------------------
// Pharaoh levels — earned from all-time blocks; gate which features unlock.
// ----------------------------------------------------------------------------
export const UNLOCK_LEVEL = {
  quarry: 1, farm: 1, well: 1, lumber_camp: 2, granite_mine: 4, copper_mine: 4,
  wooden_rollers: 2, rope_winch: 3, sled: 5, crane: 7, lubrication: 10, massive_ramp: 13, elevator: 16, marvel: 20,
  village: 2, granary: 2, storage_yard: 4, docks: 6, market: 7, temple: 9,
  laborer: 1, mason: 3, engineer: 6, priest: 8, architect: 11, overseer: 14,
};
export const TAB_LEVEL = { resource: 1, crew: 1, machine: 2, city: 2, blessing: 1 };

export function cumXp(L) { return Math.round(30 * (Math.pow(1.85, L - 1) - 1) / 0.85); }
export function levelForXp(xp) { let L = 1; while (L < 250 && cumXp(L + 1) <= xp) L++; return L; }
export function xpInfo(xp) {
  const L = levelForXp(xp), a = cumXp(L), b = cumXp(L + 1);
  return { level: L, cur: xp - a, need: b - a, frac: Math.min(1, (xp - a) / Math.max(1, b - a)), next: b };
}

// ----------------------------------------------------------------------------
// Quests — the Pharaoh's interactive guide. Chained; rewards on completion.
// goal(state)->bool, prog(state)->{cur,max} optional, reward {res?, legacy?}, tab? (to highlight).
// ----------------------------------------------------------------------------
export const QUESTS = [
  { id: "q1", text: "Welcome, young Pharaoh. Every monument begins with stone — raise two Limestone Quarries.", tab: "resource", goal: (s) => (s.buildings.quarry || 0) >= 2, prog: (s) => ({ cur: Math.min(2, s.buildings.quarry || 0), max: 2 }), reward: { res: { wood: 40 } } },
  { id: "q2", text: "A pyramid is built by hands, not by gods alone. Hire three Laborers.", tab: "crew", goal: (s) => (s.workers.laborer || 0) >= 6, prog: (s) => ({ cur: Math.max(0, Math.min(3, (s.workers.laborer || 0) - 3)), max: 3 }), reward: { res: { food: 60 } } },
  { id: "q3", text: "Idle hands shame the crown. Tap a worker out on the sands to crack the whip.", goal: (s) => s.whip && s.whip.ever, reward: { res: { limestone: 120 } } },
  { id: "q4", text: "Show the gods your worth — rise to Pharaoh Level 2.", goal: (s) => levelForXp(s.stats.totalBlocksAllTime) >= 2, reward: { legacy: 1 } },
  { id: "q5", text: "Lay the first full course of stone across the base.", goal: (s) => s.layer >= 1 || s.complete, reward: { res: { limestone: 220, wood: 80 } } },
  { id: "q6", text: "Workers need rest. Raise a Worker Village beside the works.", tab: "city", goal: (s) => (s.buildings.village || 0) >= 1, reward: { res: { food: 140 } } },
  { id: "q7", text: "Open the deep mines — reach Level 4.", goal: (s) => levelForXp(s.stats.totalBlocksAllTime) >= 4, reward: { legacy: 2 } },
  { id: "q8", text: "Speed the haul — build a Rope Winch, Sled or Crane.", tab: "machine", goal: (s) => ((s.buildings.rope_winch || 0) + (s.buildings.sled || 0) + (s.buildings.crane || 0)) >= 1, reward: { res: { copper: 70 } } },
  { id: "q9", text: "Set the golden capstone — finish this pyramid!", goal: (s) => s.complete, reward: { legacy: 3 } },
  { id: "q10", text: "A great Pharaoh never stops. Found a New Dynasty and build something greater.", goal: (s) => s.stats.dynasties >= 1, reward: { legacy: 2 } },
];
export function questFor(state) {
  const i = (state.quests && state.quests.index) || 0;
  if (i < QUESTS.length) return QUESTS[i];
  const n = i - QUESTS.length, lvl = 8 + n * 3;
  return { id: "qe" + i, text: `Ascend ever higher, eternal Pharaoh — reach Level ${lvl}.`, goal: (s) => levelForXp(s.stats.totalBlocksAllTime) >= lvl, reward: { legacy: 3 + n } };
}

