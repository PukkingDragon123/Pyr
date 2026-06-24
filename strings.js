// All player-visible UI chrome strings (data/crew/building NAMES live in
// src/data.js). Switching language is a data change, not a code change.
export const STR = {
  title: "Build the Pyramid",
  tagline: "An idle Egyptian megaproject",

  tabs: { resource: "Quarries", crew: "Crew", transport: "Machines", city: "City", blessing: "Legacy" },
  tabHint: {
    resource: "Mines, quarries, farms & wells that feed the build.",
    crew: "Hire the workforce. Crews eat food and drink water.",
    transport: "Move blocks faster — the chain's usual bottleneck.",
    city: "Support city: housing, storage, morale & safety.",
    blessing: "Permanent Pharaoh's blessings, bought with Legacy.",
  },

  res: { perSec: "/s", net: "net" },
  blocks: "Blocks placed",
  legacy: "Legacy",
  legacyShort: "Legacy",

  chainTitle: "Construction Chain",
  chain: { supply: "Supply", transport: "Transport", placement: "Placement" },
  bottleneckPrefix: "Limited by ",
  bottleneck: { supply: "limestone supply", transport: "transport", placement: "placement", balanced: "nothing — balanced" },
  effective: "Building",

  goalLayer: (wonder, n, total) => `${wonder} — Layer ${n} of ${total}`,
  layerProgress: (a, b) => `${a} / ${b} blocks this layer`,
  complete: "Complete!",

  tapLabel: "Tap the pyramid to lay stone",
  tapBtn: "Lay Stone",
  qty: "Buy",
  qtyMax: "Max",
  owned: "owned",
  locked: "Unlocks at",
  blocksUnit: "blk",
  cap: "cap",
  housing: "Housing",

  weatherNext: "Next: ",
  moraleLabel: "Morale",

  prestigeReady: "Wonder complete!",
  prestigeBtn: "Begin New Dynasty",
  prestigeGain: (n) => `Crown the capstone and found a new dynasty for +${n} Legacy.`,
  repairBtn: "Rush Repair",
  crownBtn: "Crown Successor",
  banner: {
    ramp: "⚠ Ramp collapsed — transport halted.",
    pharaoh: "⚱ The Pharaoh has died — production halved.",
    strike: "✊ Worker strike — restore food & water to end it.",
  },

  eventLog: "Chronicle",

  settings: "Settings",
  sound: "Sound", music: "Music",
  save: "Save now", export: "Export", import: "Import", reset: "Erase dynasty",
  resetConfirm: "Erase ALL progress and begin again from nothing? This cannot be undone.",
  help: "How to play",

  offlineTitle: "While you were away",
  offlineBody: (t) => `Your crews kept working for ${t}.`,
  offlineBlocks: "Blocks placed",
  collect: "Continue building",

  ceremonyTitle: "Capstone Ceremony",
  ceremonyBody: (name) => `The ${name} is finished — its golden capstone gleams over the desert. The gods are pleased.`,

  helpTitle: "How to play",
  helpBody: [
    "Tap the pyramid to lay stone by hand — every block is placed for real.",
    "Build quarries, farms and wells for the six resources; hire crews to haul and set blocks.",
    "Construction runs at the slowest of Supply, Transport and Placement — fix the bottleneck to speed up.",
    "Crews eat food and drink water. Starve them and morale collapses into a strike.",
    "Weather and disasters interrupt the work; priests, temples and overseers keep them at bay.",
    "Finish every layer to raise the golden capstone, then found a New Dynasty to keep your Legacy and build a greater wonder.",
  ],

  newDynasty: "New Dynasty",
  dynasty: (n) => `Dynasty ${n}`,
  startTip: "Tap the pyramid below to lay your first stone.",
  unlocked: (n) => `Unlocked: ${n}`,
  needLimestone: "Not enough limestone to lay a stone.",
  dynastyToast: (n) => `A new dynasty begins — ${n}`,

  whip: "Crack the Whip!",
  whipGo: "FASTER!",
  whipCd: (s) => `Whip · ${s}s`,
  layerDone: (n) => `Layer ${n} complete!`,

  tut: {
    skip: "Skip",
    next: "Next",
    done: "Let's build!",
    steps: [
      { title: "Welcome, Pharaoh", body: "Tap the rising pyramid to lay stones with your own hand." },
      { title: "Dig limestone", body: "Open Quarries and build a Limestone Quarry — stone feeds the whole build." },
      { title: "Hire a crew", body: "In Crew, hire a Laborer. Your workers will haul and place blocks on their own." },
      { title: "Crack the whip", body: "Tap the whip button to make every worker race — a quick speed surge!" },
      { title: "Raise a wonder", body: "Fill every layer to set the golden capstone, then begin a New Dynasty. Have fun!" },
    ],
  },
};
