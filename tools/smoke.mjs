// Browser smoke test: load the served game, catch errors, exercise input, shoot.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "playwright");
import { newGame } from "../src/state.js";
import { buyBuilding } from "../src/sim.js";
import { blocksForLayer } from "../src/data.js";

const BASE = process.env.BASE || "http://localhost:8099/";
const errors = [];

// A partially-built showcase save (layers 0–1 done, layer 2 half-built).
function showcase() {
  const s = newGame();
  s.stats.totalBlocksAllTime = 400; s.stats.totalBlocksThisDynasty = 400;
  s.res.limestone = 5e5; s.res.wood = 5e4; s.res.granite = 8e3; s.res.copper = 8e3;
  s.res.food = 2e3; s.res.water = 2e3;
  for (let i = 0; i < 8; i++) buyBuilding(s, "quarry");
  for (const id of ["well", "farm", "lumber_camp", "granite_mine", "copper_mine"]) for (let i = 0; i < 4; i++) buyBuilding(s, id);
  for (const id of ["wooden_rollers"]) for (let i = 0; i < 3; i++) buyBuilding(s, id);
  for (const id of ["village", "granary", "storage_yard", "docks", "temple"]) for (let i = 0; i < 3; i++) buyBuilding(s, id);
  s.workers.laborer = 9; s.workers.mason = 3; s.workers.engineer = 2; // modest so it won't finish mid-test
  s.layer = 1; s.blocksInLayer = Math.floor(blocksForLayer(0, 1) * 0.4);
  s.tutorial = { step: 0, done: true };
  s.lastSaved = Date.now();
  return JSON.stringify(s);
}
const SAVE = showcase();

const browser = await chromium.launch();

async function run(label, vp, shot, mobile, seed) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: !!mobile, hasTouch: !!mobile });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${label}] console: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on("requestfailed", (r) => { const u = r.url(); if (!u.includes("favicon.ico")) errors.push(`[${label}] reqfail: ${u} ${r.failure()?.errorText}`); });
  await page.addInitScript((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem("btp_save_v1", sv); } catch (e) {} }, seed || "");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const info = await page.evaluate(() => ({
    uiKids: document.getElementById("ui")?.children.length || 0,
    canvasW: document.getElementById("c")?.width || 0,
    goal: document.querySelector(".goal")?.textContent || "",
    chips: document.querySelectorAll(".chip").length,
    items: document.querySelectorAll(".item").length,
    tabs: document.querySelectorAll(".tab").length,
    tutorial: !document.querySelector(".tut")?.classList.contains("hidden"),
  }));
  console.log(`[${label}]`, JSON.stringify(info));
  const modalOpen = await page.evaluate(() => !document.querySelector(".modalwrap").classList.contains("hidden"));
  if (modalOpen) { const h = await page.evaluate(() => document.querySelector(".modal h2")?.textContent || (document.querySelector(".modal")?.textContent || "").slice(0, 40)); console.log(`[${label}] MODAL OPEN: ${h}`); await page.keyboard.press("Escape"); await page.waitForTimeout(120); }

  // click the desert/workers a few times (whips workers) + switch a tab + buy first item
  const c = await page.$("#c"); const box = await c.boundingBox();
  for (let i = 0; i < 6; i++) await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.58);
  await page.waitForTimeout(300);
  const crew = await page.$$(".tab"); if (crew[1]) await crew[1].click();
  await page.waitForTimeout(150);
  const firstItem = await page.$(".item"); if (firstItem) await firstItem.click();
  await page.waitForTimeout(900);

  const after = await page.evaluate(() => ({
    goal: document.querySelector(".goal")?.textContent || "",
    build: document.querySelector(".buildrate")?.textContent || "",
  }));
  console.log(`[${label}] after-input`, JSON.stringify(after));

  // exercise every tab (Legacy/blessing uses a different render path)
  const tabs = await page.$$(".tab");
  for (const t of tabs) { await t.click(); await page.waitForTimeout(120); }
  const itemsPerTab = await page.evaluate(() => document.querySelectorAll(".item").length);
  console.log(`[${label}] legacy-tab items=${itemsPerTab}`);
  // settings + help modals
  await page.click(".iconbtn:last-child"); await page.waitForTimeout(150);
  const setOpen = await page.evaluate(() => !document.querySelector(".modalwrap").classList.contains("hidden"));
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  const setClosed = await page.evaluate(() => document.querySelector(".modalwrap").classList.contains("hidden"));
  console.log(`[${label}] settings-closed=${setClosed}`);
  console.log(`[${label}] settings-modal-opened=${setOpen}`);
  const q = await page.$$(".tab"); if (q[0]) await q[0].click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: shot });
  console.log(`[${label}] shot -> ${shot}`);
  await ctx.close();
}

const SP = "/tmp/claude-0/-home-user-Pyr/ccb84bd0-96dd-5e04-8d22-3015a984d891/scratchpad/";
await run("desktop-fresh", { width: 1280, height: 800 }, SP + "shot_fresh.png", false, "");
await run("desktop", { width: 1280, height: 800 }, SP + "shot_desktop.png", false, SAVE);
await run("mobile", { width: 390, height: 844 }, SP + "shot_mobile.png", true, SAVE);

await browser.close();
if (errors.length) { console.log("\nERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("\nSMOKE OK — no console/page errors");
