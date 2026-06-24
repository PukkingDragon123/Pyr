// ============================================================================
// BALANCE DATA — all tunable numbers + names live here.
// Simple model: buildings PRODUCE resources; workers BUILD (haul blocks);
// machines make building faster. No upkeep, no disasters — clean idle progression.
// ============================================================================

export const RES = ["limestone", "granite", "wood", "copper", "food", "water"];

export const RES_META = {
  limestone: { name: "Limestone", color: "#e7d6ad", dark: "#b9a373", icon: "limestone" },
  granite:   { name: "Granite",   color: "#c98a9b", dark: "#8e5c6b", icon: "granite" },
  wood:      { name: "Wood",      color: "#b07a44", dark: "#7c5530", icon: "wood" },
  copper:    { name: "Copper",    color: "#e08a4e", dark: "#a85f2e", icon: "copper" },
  food:      { name: "Food",      color: "#d9c24a", dark: "#9c8a26", icon: "food" },
  water:     { name: "Water",     color: "#49b5d6", dark: "#2c7c97", icon: "water" },
};

export const BASE_CAPS = {
  limestone: 8000, granite: 2000, wood: 4000, copper: 2000, food: 2500, water: 2500,
};

export const LIMESTONE_PER_BLOCK = 5; // reduced by Master Masons
export const PER_BUILDER = 0.5;        // blocks/sec per builder before multipliers

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
    cost: { wood: 20, limestone: 10 }, effect: { buildSpeed: 0.04 } },
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
    cost: { wood: 120, limestone: 90 }, effect: { cap: { limestone: 3000, granite: 800, wood: 1200, copper: 700 } } },
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
