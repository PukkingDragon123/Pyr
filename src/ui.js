// DOM UI layer over the canvas scene. Builds the HUD once, then refreshes
// values each tick. No user-facing literals here — all text via STR / data.
import { STR } from "../strings.js";
import {
  RES, RES_META, BUILDINGS, WORKERS, BLESSINGS,
  WEATHER, wonderFor, wonderGeom, blocksForLayer, UNLOCK_LEVEL, xpInfo, questFor,
  PLACEABLE, ADJ_REQ, ADJ_LABEL, MAX_TIER, TIER_MULT, sizeLabel,
} from "./data.js";
import { costFor, canAfford, resolveQty } from "./state.js";
import { isUnlocked, blessingCost, getLevel, placeReason, buildingTier, canUpgrade, upgradeCostFor } from "./sim.js";
import { icon } from "./icons.js";
import { fmt, fmtInt, fmtTime } from "./format.js";

const BDEF = {}; for (const b of BUILDINGS) BDEF[b.id] = b;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// Resource + city buildings are now placed on map tiles; the dock keeps the
// non-placed upgrades (crew / machines / blessings).
const CATS = ["crew", "machine", "blessing"];

export class UI {
  constructor(app) {
    this.app = app;
    this.tab = "crew";
    this.items = [];
    this.listSig = "";
    this.root = document.getElementById("ui");
    this._build();
  }

  _build() {
    const r = this.root;

    // ---- top bar ----
    const top = el("div", "topbar");
    this.brand = el("div", "brand", `<b>${STR.title}</b><span class="dyn"></span>`);
    this.resBar = el("div", "resbar");
    this.resChips = {};
    for (const k of RES) {
      const chip = el("div", "chip", `<span class="ic">${icon(k)}</span><span class="cmid"><span class="v"></span><span class="cbar"><span class="cfill"></span></span></span><span class="net"></span>`);
      chip.title = RES_META[k].name;
      this.resChips[k] = { chip, v: chip.querySelector(".v"), net: chip.querySelector(".net"), fill: chip.querySelector(".cfill") };
      this.resBar.appendChild(chip);
    }
    this.legacyChip = el("div", "chip legacy", `<span class="ic">${icon("legacy")}</span><span class="v"></span>`);
    this.legacyChip.title = STR.legacy;
    this.legacyV = this.legacyChip.querySelector(".v");
    const gear = el("button", "iconbtn", icon("blessing"));
    gear.title = STR.settings; gear.onclick = () => this._openModal("settings");
    const helpBtn = el("button", "iconbtn", "?"); helpBtn.title = STR.help;
    helpBtn.onclick = () => this._openModal("help");
    const menuBtn = el("button", "iconbtn", "≡"); menuBtn.title = STR.menuBtn;
    menuBtn.onclick = () => this.openMenu();
    top.append(this.brand, this.resBar, this.legacyChip, menuBtn, helpBtn, gear);
    r.appendChild(top);

    // ---- status (level + goal + build + weather) ----
    const status = el("div", "status");
    const lvlRow = el("div", "levelrow");
    this.levelName = el("span", "lvlname");
    this.levelXpWrap = el("div", "bar lvlbar"); this.levelXpFill = el("div", "fill");
    this.levelXpWrap.appendChild(this.levelXpFill);
    lvlRow.append(this.levelName, this.levelXpWrap);
    status.appendChild(lvlRow);
    this.goalLine = el("div", "goal");
    this.progWrap = el("div", "bar"); this.progFill = el("div", "fill gold");
    this.progWrap.appendChild(this.progFill);
    this.progText = el("div", "progtext");

    const build = el("div", "chain");
    build.appendChild(el("div", "chain-h", `${icon("transport")}<span>${STR.buildTitle}</span>`));
    this.buildRateEl = el("div", "buildrate");
    this.buildersEl = el("div", "buildersline");
    this.limitedEl = el("div", "limited hidden");
    build.append(this.buildRateEl, this.buildersEl, this.limitedEl);

    const wx = el("div", "weather");
    this.wxIc = el("span", "ic", icon("weather"));
    this.wxName = el("span", "wxn");
    this.wxNext = el("span", "wxx");
    wx.append(this.wxIc, this.wxName, this.wxNext);

    status.append(this.goalLine, this.progWrap, this.progText, build, wx);
    r.appendChild(status);

    // ---- contextual action banner (prestige) ----
    this.banner = el("div", "banner hidden");
    r.appendChild(this.banner);

    // ---- dock (tabs + list) ----
    const dock = el("div", "dock");
    const tabs = el("div", "tabs");
    this.tabBtns = {};
    for (const c of CATS) {
      const b = el("button", "tab", `<span class="ic">${icon(c === "crew" ? "crew" : c === "blessing" ? "blessing" : c === "machine" ? "transport" : c)}</span><span>${STR.tabs[c]}</span>`);
      b.onclick = () => this._setTab(c);
      this.tabBtns[c] = b; tabs.appendChild(b);
    }
    dock.appendChild(tabs);

    const qrow = el("div", "qrow");
    this.qBtns = {};
    for (const q of [1, 10, "max"]) {
      const b = el("button", "qbtn", q === "max" ? STR.qtyMax : "×" + q);
      b.onclick = () => { this.app.setQty(q); this._syncQty(); };
      this.qBtns[q] = b; qrow.appendChild(b);
    }
    this.tabHint = el("div", "tabhint");
    dock.append(qrow, this.tabHint);
    this.list = el("div", "list");
    dock.appendChild(this.list);
    r.appendChild(dock);

    // ---- toaster + simple hint + center popup + floating numbers ----
    this.toaster = el("div", "toaster"); r.appendChild(this.toaster);
    this.tip = el("div", "tip", STR.startTip); r.appendChild(this.tip);
    setTimeout(() => this.tip && this.tip.classList.add("hidden"), 9000);
    this.popupEl = el("div", "popup"); r.appendChild(this.popupEl);
    this.floatLayer = el("div", "floatlayer"); r.appendChild(this.floatLayer);

    // ---- build picker (tap an empty tile) + upgrade panel (tap a building) ----
    this.pickerEl = el("div", "picker hidden");
    r.appendChild(this.pickerEl);
    this.upgradeEl = el("div", "upgrade hidden");
    r.appendChild(this.upgradeEl);

    // ---- modals + title menu ----
    this._buildModals();
    this._buildMenu();
    this._setTab("crew");
    this._syncQty();
    this.openMenu();   // show the title screen on load
  }

  // ---- title / main menu: a golden-hour desert hero with Play / Settings / Credits ----
  _buildMenu() {
    const m = el("div", "menu-screen");
    m.innerHTML =
      '<div class="menu-ground"></div>' +
      '<div class="menu-pyr back"></div>' +
      '<div class="menu-pyr main"></div>';
    const content = el("div", "menu-content");
    const top = el("div", "menu-top");
    top.appendChild(el("h1", "menu-title", STR.title));
    top.appendChild(el("div", "menu-tag", STR.menuTag));
    const bottom = el("div", "menu-bottom");
    const play = el("button", "menu-btn play", STR.menuPlay); play.onclick = () => this.closeMenu();
    const set = el("button", "menu-btn", STR.menuSettings); set.onclick = () => this._openModal("settings");
    const cr = el("button", "menu-btn", STR.menuCredits); cr.onclick = () => this._openModal("credits");
    bottom.append(play, set, cr);
    const credit = el("div", "menu-credit");
    credit.innerHTML = `${STR.creditsMade} · <a href="https://itch.io" target="_blank" rel="noopener">itch.io</a>`;
    content.append(top, bottom, credit);
    m.appendChild(content);
    this.menuEl = m;
    this.root.appendChild(m);
  }
  openMenu() { this._menuOpen = true; this.menuEl.classList.remove("hidden"); }
  closeMenu() {
    this._menuOpen = false; this.menuEl.classList.add("hidden");
    if (this._pendingOffline) { const d = this._pendingOffline; this._pendingOffline = null; this._openModal("offline", d); }
  }

  // --- building info helpers ---
  _catLabel(d) { return d.cat === "resource" ? STR.typeProducer : d.cat === "city" ? STR.typeCivic : d.cat === "machine" ? STR.typeMachine : d.cat === "deco" ? STR.typeDeco : d.cat; }
  _defIcon(d) { const p = d.effect.produce && Object.keys(d.effect.produce)[0]; return p ? p : d.cat === "deco" ? "blessing" : d.cat === "machine" ? "transport" : "city"; }
  _effectText(d, mult = 1) {
    const e = d.effect, parts = [];
    if (e.produce) for (const k in e.produce) parts.push(`+${fmt(e.produce[k] * mult)} ${RES_META[k].name}/s`);
    if (e.buildSpeed) parts.push(`+${Math.round(e.buildSpeed * mult * 100)}% build`);
    if (e.prodAll) parts.push(`+${Math.round(e.prodAll * mult * 100)}% all output`);
    if (e.cap) parts.push(STR.addsStorage);
    return parts.join(" · ") || "—";
  }
  _costChips(state, cost) {
    let s = ""; for (const rk in cost) s += `<span class="costchip ${state.res[rk] >= cost[rk] - 1e-6 ? "" : "no"}"><span class="ic">${icon(rk)}</span>${fmt(cost[rk])}</span>`;
    return s;
  }

  // tap an empty tile → choose a building to place there
  openBuildPicker(gx, gz) {
    this.closeUpgrade();
    this._pickTile = { gx, gz };
    this._selectedBuildId = null; // first eligible card sets this below
    if (!this._buildSection) this._buildSection = "produce";
    const state = this.app.getState();
    this.pickerEl.innerHTML = "";
    const head = el("div", "pk-head");
    head.appendChild(el("span", "pk-title", STR.buildHere));
    const x = el("button", "pk-x", "✕"); x.onclick = () => this.closeBuildPicker();
    head.appendChild(x);
    this.pickerEl.appendChild(head);
    // section toggle: Produce vs Deco
    const segs = el("div", "pk-segs");
    for (const [sec, label] of [["produce", STR.sectionProduce], ["deco", STR.sectionDeco]]) {
      const b = el("button", "pk-seg" + (this._buildSection === sec ? " on" : ""), label);
      b.onclick = () => { this._buildSection = sec; this.openBuildPicker(gx, gz); };
      segs.appendChild(b);
    }
    this.pickerEl.appendChild(segs);
    const grid = el("div", "pk-grid");
    for (const id of PLACEABLE) {
      const d = BDEF[id]; if (!d) continue;
      if ((this._buildSection === "deco") !== (d.cat === "deco")) continue;
      const reason = placeReason(state, id, gx, gz);
      if (reason === "no") continue;
      const owned = state.buildings[id] || 0;
      const it = el("button", "pk-item");
      let note = "";
      if (reason === "locked") note = `<span class="pk-lock">🔒 ${STR.level} ${UNLOCK_LEVEL[id] || 1}</span>`;
      else if (reason === "adjacency") note = `<span class="pk-req">⚲ ${STR.needsNear(ADJ_LABEL[ADJ_REQ[id]] || ADJ_REQ[id])}</span>`;
      it.innerHTML = `<span class="pk-ic">${icon(this._defIcon(d))}</span>
        <span class="pk-main">
          <span class="pk-name">${d.name} <span class="cnt sizechip">${sizeLabel(id)}</span>${owned ? ` <span class="cnt">×${owned}</span>` : ""}<span class="pk-type">${this._catLabel(d)}</span></span>
          <span class="pk-eff">${this._effectText(d)}</span>
          <span class="pk-cost">${this._costChips(state, costFor(d, owned, 1))}</span>${note}</span>`;
      if (reason !== "") it.classList.add("disabled");
      // Track the selected build id so the renderer can preview the footprint
      // while the picker is open. Default to the first eligible card; update on
      // hover/focus so the highlight follows the player's pointer.
      if (this._selectedBuildId == null) this._selectedBuildId = id;
      const select = () => { this._selectedBuildId = id; };
      it.addEventListener("pointerenter", select);
      it.addEventListener("focus", select);
      it.onclick = () => {
        if (this.app.place(id, gx, gz)) this.closeBuildPicker();
        else { const r2 = placeReason(state, id, gx, gz); this.toast(r2 === "cost" ? STR.cantAfford : r2 === "adjacency" ? STR.needsNear(ADJ_LABEL[ADJ_REQ[id]] || ADJ_REQ[id]) : STR.locked, "bad"); }
      };
      grid.appendChild(it);
    }
    this.pickerEl.appendChild(grid);
    this.pickerEl.classList.remove("hidden");
  }
  closeBuildPicker() { this.pickerEl.classList.add("hidden"); this._pickTile = null; this._selectedBuildId = null; }

  // True while the build picker is open (so pointer-move can switch from the
  // single-tile highlight to a multi-cell footprint preview).
  isPickerOpen() { return !this.pickerEl.classList.contains("hidden"); }
  // The build id the picker currently has selected (null when closed). Consumed
  // by main.js pointer-move → renderer.hoverFootprint(sx, sy, selectedBuildId).
  selectedBuildId() { return this.isPickerOpen() ? this._selectedBuildId : null; }

  // tap a placed building → upgrade it through tiers
  openUpgrade(id) {
    this.closeBuildPicker();
    this._upId = id;
    const state = this.app.getState(), d = BDEF[id]; if (!d) return;
    const tier = buildingTier(state, id), owned = state.buildings[id] || 0, maxed = tier >= MAX_TIER;
    const curMul = TIER_MULT[tier - 1] || 1;
    let pips = ""; for (let i = 1; i <= MAX_TIER; i++) pips += `<span class="up-pip ${i <= tier ? "on" : ""}"></span>`;
    let body = `<div class="up-head"><span class="pk-ic">${icon(this._defIcon(d))}</span>
        <div class="up-id"><div class="up-name">${d.name} <span class="cnt sizechip">${sizeLabel(id)}</span> <span class="up-tier">Lv ${tier}</span></div><div class="up-type">${this._catLabel(d)} · ×${owned}</div></div>
        <button class="pk-x up-x">✕</button></div>
      <div class="up-desc">${d.desc || ""}</div>
      <div class="up-now">${STR.nowProducing}: <b>${this._effectText(d, curMul)}</b></div>
      <div class="up-pips">${pips}</div>`;
    if (maxed) body += `<div class="up-max">${STR.maxTier}</div>`;
    else {
      const cost = upgradeCostFor(state, id), nextMul = TIER_MULT[tier] || curMul;
      body += `<div class="up-next">→ Lv ${tier + 1}: <b>${this._effectText(d, nextMul)}</b></div>
        <div class="up-cost">${this._costChips(state, cost)}</div>
        <button class="btn primary up-go">${STR.upgrade} (Lv ${tier + 1})</button>`;
    }
    this.upgradeEl.innerHTML = body;
    this.upgradeEl.querySelector(".up-x").onclick = () => this.closeUpgrade();
    const go = this.upgradeEl.querySelector(".up-go");
    if (go) go.onclick = () => {
      // capture tier BEFORE the purchase so we can compute the multiplier jump
      const prevTier = buildingTier(this.app.getState(), id);
      if (this.app.upgrade(id)) {
        this._tierUpJuice(d, prevTier);
        this.openUpgrade(id);
      } else this.toast(STR.cantAfford, "bad");
    };
    this.upgradeEl.classList.remove("hidden");
  }
  closeUpgrade() { this.upgradeEl.classList.add("hidden"); this._upId = null; }
  closePanels() { this.closeBuildPicker(); this.closeUpgrade(); }

  // Cosmetic celebration after a SUCCESSFUL upgrade: a "+220% limestone/s" delta
  // toast (computed from the tier multiplier jump) plus the existing burst/ring.
  _tierUpJuice(d, prevTier) {
    const prevMul = TIER_MULT[prevTier - 1] || 1;
    const nextMul = TIER_MULT[prevTier] || prevMul;
    // Find the primary produced resource (if any) to label the delta.
    const prod = d.effect && d.effect.produce;
    const rk = prod && Object.keys(prod)[0];
    if (rk && nextMul > prevMul) {
      const pct = Math.round((nextMul / prevMul - 1) * 100);
      this.toast(STR.upgradeDelta(pct, RES_META[rk].name), "go");
    }
    // Reuse the existing celebratory burst/ring. Renderer is not exposed to the
    // UI directly, so trigger it through the app facade when available.
    if (this.app.upgradeFx) this.app.upgradeFx(this._upId);
  }

  popup(text, cls) {
    this.popupEl.textContent = text;
    this.popupEl.className = "popup " + (cls || "") + " show";
    clearTimeout(this._popupT);
    this._popupT = setTimeout(() => { this.popupEl.className = "popup " + (cls || ""); }, 1500);
  }

  // Clash-of-Clans style "+N 🪵" that floats up where a node was tapped.
  floatGain(sx, sy, res, amount) {
    const e = el("div", "floatgain", `<span class="ic">${icon(RES_META[res].icon)}</span>+${fmt(amount)}`);
    e.style.left = sx + "px"; e.style.top = sy + "px";
    e.style.setProperty("--c", RES_META[res].color);
    this.floatLayer.appendChild(e);
    setTimeout(() => e.remove(), 1000);
  }

  // ---- level bar ----
  _updateLevel(state) {
    const xi = xpInfo(state.stats.totalBlocksAllTime);
    this.levelName.innerHTML = `<b>${STR.level} ${xi.level}</b>`;
    this.levelXpFill.style.width = (xi.frac * 100).toFixed(0) + "%";
    this.levelXpWrap.title = `${fmt(xi.cur)} / ${fmt(xi.need)} XP`;
  }

  // ---- Pharaoh quest panel + tab highlight ----
  pharaohSpeak() { /* tutorial removed — kept as a no-op so callers stay safe */ }

  _buildModals() {
    this.modalWrap = el("div", "modalwrap hidden");
    this.modalBox = el("div", "modal");
    this.modalWrap.appendChild(this.modalBox);
    this.modalWrap.onclick = (e) => { if (e.target === this.modalWrap) this._closeModal(); };
    addEventListener("keydown", (e) => { if (e.code === "Escape") this._closeModal(); });
    this.root.appendChild(this.modalWrap);
  }

  _openModal(kind, data) {
    const m = this.modalBox; m.innerHTML = ""; m.className = "modal";
    if (kind === "settings") {
      m.appendChild(el("h2", null, STR.settings));
      const s = this.app.getState();
      const row = (label, on, fn) => {
        const d = el("div", "setrow");
        const b = el("button", "toggle" + (on ? " on" : ""), label);
        b.onclick = () => { fn(!b.classList.contains("on")); b.classList.toggle("on"); };
        d.appendChild(b); return d;
      };
      m.appendChild(row(STR.sound, !s.settings.muted, (v) => this.app.toggleMute(!v)));
      m.appendChild(row(STR.music, s.settings.music, (v) => this.app.toggleMusic(v)));
      const btns = el("div", "modal-btns");
      const mk = (t, fn, cls) => { const b = el("button", "btn " + (cls || ""), t); b.onclick = fn; return b; };
      btns.append(
        mk(STR.save, () => { this.app.saveNow(); this.toast("Saved", "good"); }),
        mk(STR.export, () => this._exportFlow()),
        mk(STR.import, () => this._importFlow()),
        mk(STR.reset, () => { if (confirm(STR.resetConfirm)) this.app.hardReset(); }, "danger"),
      );
      m.appendChild(btns);
      m.appendChild(this._closeBtn());
    } else if (kind === "help") {
      m.appendChild(el("h2", null, STR.helpTitle));
      const ul = el("ul", "help");
      for (const line of STR.helpBody) ul.appendChild(el("li", null, line));
      m.appendChild(ul); m.appendChild(this._closeBtn());
    } else if (kind === "offline") {
      m.appendChild(el("h2", null, STR.offlineTitle));
      m.appendChild(el("p", null, STR.offlineBody(fmtTime(data.seconds))));
      const g = el("div", "offgrid");
      g.appendChild(el("div", "offblk", `<span class="ic">${icon("block")}</span><b>${fmt(data.blocks)}</b><small>${STR.offlineBlocks}</small>`));
      for (const k of RES) if (data.gained[k] > 1)
        g.appendChild(el("div", "offblk", `<span class="ic">${icon(k)}</span><b>+${fmt(data.gained[k])}</b><small>${RES_META[k].name}</small>`));
      m.appendChild(g);
      const b = el("button", "btn primary big", STR.collect); b.onclick = () => this._closeModal();
      m.appendChild(b);
    } else if (kind === "ceremony") {
      m.classList.add ? 0 : 0;
      m.appendChild(el("div", "ceremony-ic", icon("pyramid")));
      m.appendChild(el("h2", null, STR.ceremonyTitle));
      m.appendChild(el("p", null, STR.ceremonyBody(data.name)));
      const b = el("button", "btn primary big", `${STR.prestigeBtn} (+${data.gain} ${STR.legacy})`);
      b.onclick = () => { this._closeModal(); this.app.prestige(); };
      m.appendChild(b);
    } else if (kind === "credits") {
      m.classList.add("credits");
      m.appendChild(el("div", "ceremony-ic", icon("pyramid")));
      m.appendChild(el("h2", null, STR.creditsTitle));
      m.appendChild(el("p", "cr-made", STR.creditsMade));
      const a = el("a", "cr-itch", STR.creditsItch); a.href = "https://itch.io"; a.target = "_blank"; a.rel = "noopener";
      m.appendChild(a);
      m.appendChild(el("p", "cr-tech", STR.creditsTech));
      m.appendChild(el("p", "cr-thanks", STR.creditsThanks));
      m.appendChild(this._closeBtn());
    }
    this.modalWrap.classList.remove("hidden");
  }
  _closeBtn() { const b = el("button", "btn", "Close"); b.onclick = () => this._closeModal(); return b; }
  _closeModal() { this.modalWrap.classList.add("hidden"); }

  _exportFlow() {
    const code = this.app.exportSave();
    const ta = el("textarea", "exportta"); ta.value = code; ta.readOnly = true;
    this.modalBox.innerHTML = ""; this.modalBox.appendChild(el("h2", null, STR.export));
    this.modalBox.appendChild(ta); this.modalBox.appendChild(this._closeBtn());
    ta.select();
  }
  _importFlow() {
    this.modalBox.innerHTML = ""; this.modalBox.appendChild(el("h2", null, STR.import));
    const ta = el("textarea", "exportta"); ta.placeholder = "Paste save code…";
    const b = el("button", "btn primary", STR.import);
    b.onclick = () => { if (this.app.importSave(ta.value)) { this.toast("Loaded", "good"); this._closeModal(); } else this.toast("Invalid code", "bad"); };
    this.modalBox.append(ta, b, this._closeBtn());
  }

  showOffline(data) { if (!data) return; if (this._menuOpen) { this._pendingOffline = data; return; } this._openModal("offline", data); }
  showCeremony(name, gain) { this._openModal("ceremony", { name, gain }); }

  toast(text, kind = "info") {
    const t = el("div", "toast " + kind, text);
    this.toaster.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 3600);
    while (this.toaster.children.length > 4) this.toaster.firstChild.remove();
  }

  // Celebratory milestone toast (cosmetic). Driven by {type:"milestone",text}
  // fx drained from the sim. Reuses the toast mechanism with a distinct class.
  milestone(text) {
    const t = el("div", "toast milestone", `<span class="ic">${icon("legacy")}</span><span class="ms-body"><b>${STR.milestone}</b><span>${text}</span></span>`);
    this.toaster.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 4200);
    while (this.toaster.children.length > 4) this.toaster.firstChild.remove();
  }

  _setTab(c) {
    this.tab = c;
    for (const k in this.tabBtns) this.tabBtns[k].classList.toggle("active", k === c);
    this.tabHint.textContent = STR.tabHint[c];
    this.qrowHidden = (c === "blessing");
    document.querySelector(".qrow").style.display = c === "blessing" ? "none" : "";
    this.listSig = ""; // force rebuild
    this._rebuildList(this.app.getState(), this.app.getStats());
  }
  _syncQty() {
    const q = this.app.getState().settings.qty;
    for (const k in this.qBtns) this.qBtns[k].classList.toggle("active", String(k) === String(q));
  }

  _defsFor(tab) {
    if (tab === "resource") return BUILDINGS.filter((b) => b.cat === "resource").map((d) => ({ d, kind: "b" }));
    if (tab === "machine") return BUILDINGS.filter((b) => b.cat === "machine").map((d) => ({ d, kind: "b" }));
    if (tab === "city") return BUILDINGS.filter((b) => b.cat === "city").map((d) => ({ d, kind: "b" }));
    if (tab === "crew") return WORKERS.map((d) => ({ d, kind: "w" }));
    if (tab === "blessing") return BLESSINGS.map((d) => ({ d, kind: "g" }));
    return [];
  }

  _rebuildList(state, stats) {
    const defs = this._defsFor(this.tab);
    const sig = this.tab + "|" + defs.map(({ d, kind }) =>
      kind === "g" ? d.id : (isUnlocked(state, d) ? d.id : d.id + "L")).join(",");
    if (sig === this.listSig) return;
    this.listSig = sig;
    this.list.innerHTML = ""; this.items = [];
    for (const { d, kind } of defs) {
      const item = el("button", "item");
      const ic = el("span", "item-ic", icon(this._iconFor(d, kind)));
      const main = el("div", "item-main");
      const name = el("div", "item-name");
      const desc = el("div", "item-desc", d.desc || "");
      const cost = el("div", "item-cost");
      const lock = el("div", "lock hidden");
      main.append(name, desc, cost);
      item.append(ic, main, lock);
      item.onclick = () => this.app.buy(kind, d.id);
      this.list.appendChild(item);
      this.items.push({ d, kind, item, name, cost, lock, desc });
    }
    this._refreshList(state, stats);
  }

  _iconFor(d, kind) {
    if (kind === "w") return d.id;
    if (kind === "g") return "blessing";
    if (d.cat === "transport") return "transport";
    if (d.cat === "city") return "city";
    return "resource";
  }

  _refreshList(state, stats) {
    for (const it of this.items) {
      const { d, kind, item, name, cost, lock } = it;
      if (kind === "g") {
        const lvl = state.blessings[d.id] || 0;
        const c = blessingCost(state, d.id);
        name.innerHTML = `${d.name} <span class="cnt">Lv ${lvl}</span>`;
        cost.innerHTML = `<span class="costchip ${state.legacy >= c ? "" : "no"}"><span class="ic">${icon("legacy")}</span>${fmt(c)}</span>`;
        item.classList.toggle("disabled", state.legacy < c);
        lock.classList.add("hidden");
        continue;
      }
      const unlocked = isUnlocked(state, d);
      if (!unlocked) {
        lock.classList.remove("hidden");
        lock.innerHTML = `${STR.locked} ${STR.level} ${UNLOCK_LEVEL[d.id] || 1}`;
        item.classList.add("locked");
        name.textContent = d.name;
        cost.innerHTML = "";
        continue;
      }
      item.classList.remove("locked"); lock.classList.add("hidden");
      const owned = (kind === "b" ? state.buildings : state.workers)[d.id] || 0;
      const qty = resolveQty(state, d, owned);
      const c = costFor(d, owned, qty);
      name.innerHTML = `${d.name} <span class="cnt">${owned}</span>${qty > 1 ? `<span class="qbadge">+${qty}</span>` : ""}`;
      let chips = "";
      let afford = canAfford(state.res, c);
      for (const rk in c) chips += `<span class="costchip ${state.res[rk] >= c[rk] - 1e-6 ? "" : "no"}"><span class="ic">${icon(rk)}</span>${fmt(c[rk])}</span>`;
      cost.innerHTML = chips;
      item.classList.toggle("disabled", !afford);
    }
  }

  update(state, stats) {
    // dynasty label
    this.brand.querySelector(".dyn").textContent = " · " + STR.dynasty(state.stats.dynasties + 1);
    // resources
    for (const k of RES) {
      const ref = this.resChips[k];
      const cap = stats.caps ? stats.caps[k] : Infinity;
      ref.v.textContent = fmt(state.res[k]);
      const net = stats.prod[k] || 0;   // build no longer drains limestone
      // at cap, surplus production is wasted — show "FULL" instead of a phantom +rate
      const full = Number.isFinite(cap) && state.res[k] >= cap - 1 && net > 0;
      ref.net.textContent = full ? STR.res.full : (net >= 0 ? "+" : "") + fmt(net) + STR.res.perSec;
      ref.net.className = "net " + (full ? "full" : net >= -1e-6 ? "up" : "down");
      ref.chip.classList.toggle("isfull", full);
      if (ref.fill) { const frac = Number.isFinite(cap) && cap > 0 ? Math.max(0, Math.min(1, state.res[k] / cap)) : 0; ref.fill.style.width = (frac * 100).toFixed(0) + "%"; ref.fill.className = "cfill" + (full ? " full" : ""); }
      ref.chip.title = RES_META[k].name + " · " + fmt(Math.floor(state.res[k])) + " / " + fmt(cap);
    }
    this.legacyV.textContent = fmt(state.legacy);

    // goal
    const g = wonderGeom(state.wonderIndex);
    const wonder = wonderFor(state.wonderIndex);
    if (state.complete) {
      this.goalLine.textContent = `${wonder.name} — ${STR.complete}`;
      this.progFill.style.width = "100%";
      this.progText.textContent = STR.prestigeReady;
    } else {
      this.goalLine.textContent = STR.goalLayer(wonder.name, state.layer + 1, g.layers);
      const need = blocksForLayer(state.wonderIndex, state.layer);
      this.progFill.style.width = (100 * state.blocksInLayer / need).toFixed(1) + "%";
      this.progText.textContent = STR.layerProgress(fmt(state.blocksInLayer), fmt(need));
    }

    // build readout
    this.buildRateEl.innerHTML = `${STR.buildRate} <b>${fmt(state._lastFlow || 0)}</b> ${STR.blocksPerSec}`;
    this.buildersEl.innerHTML = `${STR.builders} <b>${fmt(stats.builders || 0)}</b>${stats.whipMult > 1 ? ` · <span class="hot">${STR.whipGo}</span>` : ""}`;
    this.limitedEl.classList.toggle("hidden", !state._limited);
    this.limitedEl.textContent = STR.shortLimestone;

    // weather (light)
    const wx = WEATHER.find((w) => w.id === state.weather.id) || WEATHER[0];
    const nx = WEATHER.find((w) => w.id === state.weather.nextId);
    this.wxName.textContent = wx.name + " · " + fmtTime(state.weather.timeLeft);
    this.wxNext.textContent = nx ? STR.weatherNext + nx.name : "";

    this._banner(state, stats);
    this._rebuildList(state, stats);
    this._refreshList(state, stats);
    this._updateLevel(state);
  }

  _banner(state, stats) {
    let html = "", cls = "banner";
    if (state.complete) {
      const gain = this.app.legacyGain();
      cls += " prestige";
      html = `<span>${STR.prestigeReady} ${STR.prestigeGain(gain)}</span>`;
      this.banner.className = cls; this.banner.innerHTML = html;
      let btn = el("button", "btn primary", STR.prestigeBtn);
      btn.onclick = () => this.app.prestige();
      this.banner.appendChild(btn);
      this.banner.classList.remove("hidden");
      return;
    }
    this.banner.classList.add("hidden");
  }
}
