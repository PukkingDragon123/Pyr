import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "playwright");
import { newGame } from "../src/state.js";
import { buyBuilding } from "../src/sim.js";
import { blocksForLayer } from "../src/data.js";

function showcase() {
  const s = newGame();
  s.stats.totalBlocksAllTime = 700; s.stats.totalBlocksThisDynasty = 700;
  s.res.limestone = 5e5; s.res.wood = 5e4; s.res.granite = 8e3; s.res.copper = 8e3; s.res.food = 4e3; s.res.water = 4e3;
  for (let i = 0; i < 14; i++) buyBuilding(s, "quarry");
  for (const id of ["well", "farm", "lumber_camp", "granite_mine", "copper_mine"]) for (let i = 0; i < 4; i++) buyBuilding(s, id);
  for (const id of ["wooden_rollers", "rope_winch", "sled", "crane"]) for (let i = 0; i < 6; i++) buyBuilding(s, id);
  for (const id of ["village", "granary", "storage_yard", "docks", "temple", "market"]) for (let i = 0; i < 4; i++) buyBuilding(s, id);
  s.workers.laborer = 30; s.workers.cutter = 10; s.workers.engineer = 4; s.workers.architect = 2;
  s.layer = 2; s.blocksInLayer = Math.floor(blocksForLayer(0, 2) * 0.55);
  s.weather = { id: "flood", timeLeft: 60, nextId: "clear" }; // show flood + crocs
  s.lastSaved = Date.now();
  return JSON.stringify(s);
}
const SAVE = showcase();
const SP = "/tmp/claude-0/-home-user-Pyr/ccb84bd0-96dd-5e04-8d22-3015a984d891/scratchpad/";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1120, height: 780 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));
await page.addInitScript((sv) => localStorage.setItem("btp_save_v1", sv), SAVE);
await page.goto(process.env.BASE || "http://localhost:8099/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
// moderate zoom so the whole build + workers + animals stay framed and large
const box = await (await page.$("#c")).boundingBox();
for (let i = 0; i < 6; i++) { await page.mouse.move(box.width * 0.4, box.height * 0.62); await page.mouse.wheel(0, -260); await page.waitForTimeout(60); }
await page.waitForTimeout(700);
// clip to the build area (left of the dock), lower portion where crews work
await page.screenshot({ path: SP + "shot_closeup.png", clip: { x: 40, y: 250, width: 720, height: 500 } });
console.log("closeup saved", errs.length ? "ERRORS:" + errs.join(";") : "no errors");
await browser.close();
