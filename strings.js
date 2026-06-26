// All player-visible UI chrome strings (data/crew/building NAMES live in
// src/data.js). Switching language is a data change, not a code change.
export const STR = {
  title: "Build the Pyramid",
  tagline: "An idle Egyptian megaproject",

  tabs: { resource: "Quarries", crew: "Crew", machine: "Machines", city: "City", blessing: "Legacy" },
  tabHint: {
    resource: "Quarries, mines, farms & wells — they produce your resources.",
    crew: "Hire workers. More laborers = more builders hauling stone.",
    machine: "Sleds, cranes & ramps — they make building faster.",
    city: "Village, market, temple, storage & docks along the Nile.",
    blessing: "Permanent Pharaoh's blessings, bought with Legacy.",
  },

  res: { perSec: "/s", net: "net", full: "FULL" },
  blocks: "Blocks placed",
  legacy: "Legacy",
  legacyShort: "Legacy",

  level: "Level",
  reward: "Reward:",
  pharaohName: "The Pharaoh",
  pharaohQuestDone: "It is done — the gods smile upon your reign.",
  pharaohLevel: (L) => `Level ${L}! Your name echoes louder through the ages.`,

  buildTitle: "Construction",
  buildRate: "Building",
  blocksPerSec: "blocks/s",
  builders: "Builders",
  shortLimestone: "⚠ Short on limestone — build more quarries.",

  goalLayer: (wonder, n, total) => `${wonder} — Layer ${n} of ${total}`,

  goalLayer: (wonder, n, total) => `${wonder} — Layer ${n} of ${total}`,
  layerProgress: (a, b) => `${a} / ${b} blocks this layer`,
  complete: "Complete!",

  tapLabel: "Tap the pyramid to lay stone",
  tapBtn: "Lay Stone",
  qty: "Buy",
  qtyMax: "Max",
  owned: "owned",
  locked: "Unlocks at",
  buildHere: "Build on this tile",
  needsNear: (what) => `Must be next to ${what}`,
  cantAfford: "Not enough resources",
  typeProducer: "Producer", typeCivic: "Civic", typeMachine: "Machine", typeDeco: "Decor",
  sectionProduce: "Produce", sectionDeco: "Deco",
  addsStorage: "+ storage",
  nowProducing: "Now", upgrade: "Upgrade", maxTier: "Max level reached",
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
    "Build quarries and mines — they produce the resources you spend.",
    "Hire laborers: each one is a worker who hauls stone up the ramp and sets it. Buy machines to make them faster.",
    "Click a worker to crack the whip — everyone sprints and builds faster for a few seconds.",
    "Limestone is the building material. If you run short, build more quarries.",
    "Finish every layer to raise the golden capstone, then found a New Dynasty to keep your Legacy and build a greater wonder.",
  ],

  newDynasty: "New Dynasty",
  dynasty: (n) => `Dynasty ${n}`,
  startTip: "Tap an empty tile to build · Tap a building to upgrade · Hire crew from the menu",
  unlocked: (n) => `Unlocked: ${n}`,
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
      { title: "Dig limestone", body: "Open Quarries and build a couple of Limestone Quarries — they produce the stone your pyramid is made of." },
      { title: "Hire workers", body: "In Crew, hire Laborers. Each one walks up the ramp, carries a block and sets it — no hand-placing needed." },
      { title: "Crack the whip", body: "Tap a worker out on the site to whip them — everyone sprints and builds faster for a few seconds!" },
      { title: "Raise a wonder", body: "Fill every layer to set the golden capstone, then begin a New Dynasty for a greater pyramid. Have fun!" },
    ],
  },
};
