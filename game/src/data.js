// ============================================================================
// BALANCE DATA — all tunable numbers live here (game-design-system §9.5).
// Names live here too so logic/render/ui hold no user-facing string literals.
// ============================================================================

// Ordered resource keys.
export const RES = ["limestone", "granite", "wood", "copper", "food", "water"];

export const RES_META = {
  limestone: { name: "Limestone", color: "#e7d6ad", dark: "#b9a373", icon: "limestone" },
  granite:   { name: "Granite",   color: "#c98a9b", dark: "#8e5c6b", icon: "granite" },
  wood:      { name: "Wood",      color: "#b07a44", dark: "#7c5530", icon: "wood" },
  copper:    { name: "Copper",    color: "#e08a4e", dark: "#a85f2e", icon: "copper" },
  food:      { name: "Food",      color: "#d9c24a", dark: "#9c8a26", icon: "food" },
  water:     { name: "Water",     color: "#49b5d6", dark: "#2c7c97", icon: "water" },
};

// Base storage caps (raised by city storage buildings + Royal Treasury).
export const BASE_CAPS = {
  limestone: 6000, granite: 1500, wood: 3000, copper: 1500, food: 1800, water: 1800,
};

export const LIMESTONE_PER_BLOCK = 5; // reduced by stone cutters & Master Masons
export const BASE_CLICK = 1;

// ----------------------------------------------------------------------------
// Buildings & machines. cat: resource | transport | city.
// effect keys consumed by sim: produce{res}, transport, transportFlat,
// workerCap, cap{res}, globalProd, morale, disasterMult.
// cost scales as base * scale^owned.
// ----------------------------------------------------------------------------
export const BUILDINGS = [
  // --- resource ---
  { id: "quarry", name: "Limestone Quarry", cat: "resource", scale: 1.15, unlock: 0,
    desc: "Hews pale limestone — the body of every pyramid.",
    cost: { limestone: 15, wood: 5 }, effect: { produce: { limestone: 1.0 } } },
  { id: "farm", name: "Nile Farm", cat: "resource", scale: 1.15, unlock: 0,
    desc: "Grain to keep the workforce fed.",
    cost: { limestone: 18, wood: 8 }, effect: { produce: { food: 0.85 } } },
  { id: "well", name: "Water Well", cat: "resource", scale: 1.15, unlock: 0,
    desc: "Draws water for thirsty crews.",
    cost: { limestone: 18, wood: 8 }, effect: { produce: { water: 0.85 } } },
  { id: "lumber_camp", name: "Lumber Camp", cat: "resource", scale: 1.16, unlock: 0,
    desc: "Acacia and imported cedar for sleds and machines.",
    cost: { limestone: 30, food: 12 }, effect: { produce: { wood: 0.6 } } },
  { id: "granite_mine", name: "Granite Quarry", cat: "resource", scale: 1.17, unlock: 120,
    desc: "Hard granite for chambers, casing and the capstone.",
    cost: { limestone: 90, wood: 35, copper: 5 }, effect: { produce: { granite: 0.32 } } },
  { id: "copper_mine", name: "Copper Mine", cat: "resource", scale: 1.17, unlock: 120,
    desc: "Copper for chisels, saws and gleaming tools.",
    cost: { limestone: 80, wood: 35 }, effect: { produce: { copper: 0.27 } } },

  // --- transport machines (blocks/sec capacity) ---
  { id: "wooden_rollers", name: "Wooden Rollers", cat: "transport", scale: 1.15, unlock: 0,
    desc: "Logs under the sled. Humble, but it begins.",
    cost: { wood: 20, limestone: 10 }, effect: { transport: 0.5 } },
  { id: "rope_winch", name: "Rope Winch", cat: "transport", scale: 1.16, unlock: 50,
    desc: "Twisted palm rope multiplies a crew's pull.",
    cost: { wood: 60, copper: 8 }, effect: { transport: 1.2 } },
  { id: "sled", name: "Greased Sled", cat: "transport", scale: 1.17, unlock: 180,
    desc: "Water-slick runners glide blocks across sand.",
    cost: { wood: 150, copper: 20 }, effect: { transport: 3 } },
  { id: "crane", name: "Counterweight Crane", cat: "transport", scale: 1.18, unlock: 800,
    desc: "Shaduf-style counterweights lift blocks skyward.",
    cost: { wood: 500, copper: 120, granite: 30 }, effect: { transport: 9 } },
  { id: "lubrication", name: "Water Lubrication", cat: "transport", scale: 1.19, unlock: 2500,
    desc: "Channels of water cut sled friction to nothing.",
    cost: { copper: 400, granite: 120, water: 2500 }, effect: { transport: 22 } },
  { id: "massive_ramp", name: "Spiraling Mega-Ramp", cat: "transport", scale: 1.2, unlock: 6000,
    desc: "A ramp wrapping the whole pyramid.",
    cost: { limestone: 20000, wood: 5000, granite: 500 }, effect: { transport: 55 } },
  { id: "elevator", name: "Giant Stone Elevator", cat: "transport", scale: 1.21, unlock: 16000,
    desc: "Impossible machinery hauls blocks straight up.",
    cost: { copper: 8000, granite: 4000 }, effect: { transport: 140 } },
  { id: "marvel", name: "Experimental Marvel", cat: "transport", scale: 1.23, unlock: 45000,
    desc: "Egyptian engineering that should not work — yet does.",
    cost: { granite: 30000, copper: 30000 }, effect: { transport: 380 } },

  // --- city / support ---
  { id: "village", name: "Worker Village", cat: "city", scale: 1.16, unlock: 0,
    desc: "Mud-brick homes. Houses more crew and lifts morale.",
    cost: { limestone: 50, wood: 30, food: 20 }, effect: { workerCap: 8, morale: 0.6 } },
  { id: "granary", name: "Granary", cat: "city", scale: 1.16, unlock: 40,
    desc: "Stores food and water; a little surplus grain.",
    cost: { limestone: 60, wood: 40 }, effect: { cap: { food: 600, water: 400 }, produce: { food: 0.3 } } },
  { id: "storage_yard", name: "Storage Yard", cat: "city", scale: 1.17, unlock: 150,
    desc: "Raises how much stone, wood and metal you can stockpile.",
    cost: { wood: 120, limestone: 90 }, effect: { cap: { limestone: 2500, granite: 600, wood: 900, copper: 500 } } },
  { id: "docks", name: "River Docks", cat: "city", scale: 1.18, unlock: 300,
    desc: "Barges bring water and ferry blocks downriver.",
    cost: { wood: 220, copper: 30 }, effect: { produce: { water: 1.5 }, transport: 2 } },
  { id: "market", name: "Grand Market", cat: "city", scale: 1.22, unlock: 400,
    desc: "Trade lifts the yield of every industry (+3% each).",
    cost: { limestone: 220, wood: 130, copper: 22 }, effect: { globalProd: 0.03 } },
  { id: "temple", name: "Temple", cat: "city", scale: 1.2, unlock: 600,
    desc: "Appeases the gods — fewer, milder disasters; more morale.",
    cost: { limestone: 420, granite: 45 }, effect: { disasterMult: 0.9, morale: 1.2 } },
];

// ----------------------------------------------------------------------------
// Workers. Hired against the housing cap; consume food+water each second.
// effect keys: placement, supply (limestone/s), transportPct, workerPct,
// disasterMult, morale, speedPct.
// ----------------------------------------------------------------------------
export const WORKERS = [
  { id: "laborer", name: "Laborer", scale: 1.15, unlock: 0,
    desc: "Hauls and sets blocks. The backbone of the build.",
    cost: { food: 10, limestone: 5 }, upkeep: { food: 0.02, water: 0.02 },
    effect: { placement: 0.6 } },
  { id: "cutter", name: "Stone Cutter", scale: 1.16, unlock: 80,
    desc: "Dresses raw stone faster — more limestone supply.",
    cost: { limestone: 40, copper: 3 }, upkeep: { food: 0.03, water: 0.02 },
    effect: { supply: 0.9 } },
  { id: "engineer", name: "Engineer", scale: 1.18, unlock: 300,
    desc: "Tunes every machine: +6% transport capacity each.",
    cost: { wood: 60, copper: 15 }, upkeep: { food: 0.03, water: 0.03 },
    effect: { transportPct: 0.06 } },
  { id: "architect", name: "Architect", scale: 1.2, unlock: 1500,
    desc: "Designs advanced sections — strong placement and +2% all crew.",
    cost: { limestone: 500, granite: 30, copper: 40 }, upkeep: { food: 0.05, water: 0.04 },
    effect: { placement: 4, workerPct: 0.02 } },
  { id: "priest", name: "Priest", scale: 1.19, unlock: 600,
    desc: "Rites that calm the gods: −7% disaster chance each, +morale.",
    cost: { food: 200, granite: 20 }, upkeep: { food: 0.04, water: 0.03 },
    effect: { disasterMult: 0.93, morale: 1.5 } },
  { id: "overseer", name: "Overseer", scale: 1.22, unlock: 2500,
    desc: "Drives the gangs: +5% worker speed each, fewer accidents.",
    cost: { limestone: 800, copper: 80 }, upkeep: { food: 0.05, water: 0.05 },
    effect: { speedPct: 0.05, disasterMult: 0.985 } },
];

// ----------------------------------------------------------------------------
// Prestige blessings (Pharaoh Legacy). cost = base * 1.6^level.
// ----------------------------------------------------------------------------
export const BLESSINGS = [
  { id: "strong_backs", name: "Strong Backs", base: 3, desc: "+20% block placement per level.", per: 0.20, kind: "placement" },
  { id: "master_masons", name: "Master Masons", base: 4, desc: "−7% limestone per block per level.", per: 0.07, kind: "masons" },
  { id: "divine_engineering", name: "Divine Engineering", base: 4, desc: "+20% transport capacity per level.", per: 0.20, kind: "transport" },
  { id: "fertile_nile", name: "Fertile Nile", base: 3, desc: "+25% food & water output per level.", per: 0.25, kind: "fertile" },
  { id: "swift_labor", name: "Swift Labor", base: 5, desc: "+12% all worker speed per level.", per: 0.12, kind: "swift" },
  { id: "royal_treasury", name: "Royal Treasury", base: 5, desc: "+1 of each starter building & +40% caps per level.", per: 0.40, kind: "treasury" },
  { id: "eternal_favor", name: "Eternal Favor", base: 6, desc: "−12% disaster chance per level.", per: 0.12, kind: "favor" },
  { id: "sun_blessing", name: "Blessing of Ra", base: 4, desc: "+60% tap power per level.", per: 0.60, kind: "click" },
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

// Pyramid geometry for wonder tier k.
export function wonderGeom(k) {
  const base = 14 + 4 * k;            // bottom layer side (in cubes)
  const layers = Math.floor(base / 2); // sides base, base-2, ... , 2
  const blocksPerCube = Math.round(Math.pow(6, k)); // gameplay blocks per visual cube
  return { base, layers, blocksPerCube };
}

export function cubesInLayer(k, j) {
  const side = (14 + 4 * k) - 2 * j;
  return side > 0 ? side * side : 0;
}

export function blocksForLayer(k, j) {
  return cubesInLayer(k, j) * wonderGeom(k).blocksPerCube;
}

export function wonderTotalBlocks(k) {
  const g = wonderGeom(k); let t = 0;
  for (let j = 0; j < g.layers; j++) t += blocksForLayer(k, j);
  return t;
}

export const FIRST_WONDER_TOTAL = wonderTotalBlocks(0);

// ----------------------------------------------------------------------------
// Weather. Multipliers applied while active; forecast shows the next one.
// ----------------------------------------------------------------------------
export const WEATHER = [
  { id: "clear", name: "Clear Skies", desc: "Perfect building weather.", weight: 5,
    min: 80, max: 150, fx: {} },
  { id: "sandstorm", name: "Sandstorm", desc: "Stinging sand slows the gangs and blots out the sun.", weight: 2,
    min: 40, max: 80, fx: { placementMult: 0.6 } },
  { id: "heat", name: "Extreme Heat", desc: "Crews drink double and tire under the blazing sun.", weight: 2,
    min: 50, max: 90, fx: { placementMult: 0.85, waterUpkeepMult: 2 } },
  { id: "flood", name: "Nile Flood", desc: "Fields drink deep (+farms) but routes are cut (−transport).", weight: 1.6,
    min: 50, max: 90, fx: { foodWaterProdMult: 1.8, transportMult: 0.7 } },
  { id: "rain", name: "Rare Rain", desc: "Mud bogs the sleds and threatens the ramps.", weight: 0.8,
    min: 30, max: 60, fx: { transportMult: 0.5, rampRiskMult: 3 } },
];

// ----------------------------------------------------------------------------
// Disasters. random ones roll each second from basePerMin (× mitigation).
// strike is condition-driven (low morale), not random.
// ----------------------------------------------------------------------------
export const DISASTERS = [
  { id: "ramp_collapse", name: "Ramp Collapse", random: true, basePerMin: 0.18,
    desc: "A ramp gives way — transport is halted until repaired.",
    minDur: 16, maxDur: 26 },
  { id: "tomb_robbers", name: "Tomb Robbers", random: true, basePerMin: 0.16,
    desc: "Thieves raid the stores and make off with resources.",
    minDur: 0, maxDur: 0 },
  { id: "plague", name: "Sacred Plague", random: true, basePerMin: 0.09,
    desc: "Sickness sweeps the camp — a quarter of the crew falls idle.",
    minDur: 55, maxDur: 80 },
  { id: "pharaoh_death", name: "Pharaoh's Passing", random: true, basePerMin: 0.04,
    desc: "The Pharaoh dies. Production halves until a successor is crowned.",
    minDur: 40, maxDur: 40 },
  { id: "strike", name: "Worker Strike", random: false,
    desc: "Hungry, parched crews down tools. Restore food & water to end it.",
    minDur: 0, maxDur: 0 },
];

export const OFFLINE_CAP_S = 12 * 3600;
export const OFFLINE_RATE = 0.5;
export const AUTOSAVE_MS = 10000;
