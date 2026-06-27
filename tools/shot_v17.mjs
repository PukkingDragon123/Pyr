import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "playwright");
import { newGame } from "../src/state.js";
import { buyBuilding } from "../src/sim.js";
import { blocksForLayer } from "../src/data.js";

function showcase() {
  const s = newGame();
  s.stats.totalBlocksAllTime = 5e5; s.stats.totalBlocksThisDynasty = 5e5;
  s.wonderIndex = 2; // a big wonder so the crew can't finish it mid-screenshot
  s.res.limestone = 5000; s.res.wood = 9e4; s.res.granite = 2e4; s.res.copper = 2e4; s.res.food = 1e4; s.res.water = 1e4;
  for (let i = 0; i < 14; i++) buyBuilding(s, "quarry");
  for (const id of ["well", "farm", "lumber_camp", "granite_mine", "copper_mine"]) for (let i = 0; i < 3; i++) buyBuilding(s, id);
  for (const id of ["village", "granary", "storage_yard", "docks", "temple", "market"]) for (let i = 0; i < 2; i++) buyBuilding(s, id);
  for (const id of ["obelisk", "statue", "garden"]) buyBuilding(s, id);
  // diverse machines (set counts directly so operators appear regardless of unlock gating)
  Object.assign(s.buildings, { wooden_rollers: 2, rope_winch: 2, sled: 1, crane: 2, lubrication: 1, massive_ramp: 1, elevator: 2 });
  // a full, diverse crew so every staff role renders
  s.workers.laborer = 16; s.workers.mason = 5; s.workers.engineer = 4; s.workers.priest = 3; s.workers.architect = 2; s.workers.overseer = 3;
  s.layer = 3; s.blocksInLayer = Math.floor(blocksForLayer(2, 3) * 0.3);
  s.tutorial = { step: 0, done: true };
  s.lastSaved = Date.now();
  return JSON.stringify(s);
}
const SAVE = showcase();
const SP = "/tmp/claude-0/-home-user-Pyr/ccb84bd0-96dd-5e04-8d22-3015a984d891/scratchpad/";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: 1120, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));
await page.addInitScript((sv) => localStorage.setItem("btp_save_v1", sv), SAVE);
await page.goto(process.env.BASE || "http://localhost:8099/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const box = await (await page.$("#c")).boundingBox();
// wide shot: whole site
for (let i = 0; i < 3; i++) { await page.mouse.move(box.width * 0.45, box.height * 0.5); await page.mouse.wheel(0, -240); await page.waitForTimeout(60); }
await page.waitForTimeout(900);
await page.screenshot({ path: SP + "v17_wide.png", clip: { x: 20, y: 80, width: 760, height: 600 } });
// zoom in on the foot/machine zone (lower-front of the scene)
for (let i = 0; i < 6; i++) { await page.mouse.move(box.width * 0.4, box.height * 0.9); await page.mouse.wheel(0, -280); await page.waitForTimeout(55); }
await page.waitForTimeout(900);
await page.screenshot({ path: SP + "v17_zoom.png", clip: { x: 40, y: 420, width: 760, height: 470 } });
console.log("v17 shots saved", errs.length ? "ERRORS:" + errs.join(";") : "no errors");
await browser.close();
