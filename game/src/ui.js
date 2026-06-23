// DOM UI layer over the canvas scene. Builds the HUD once, then refreshes
// values each tick. No user-facing literals here — all text via STR / data.
import { STR } from "../strings.js";
import {
  RES, RES_META, BUILDINGS, WORKERS, BLESSINGS,
  WEATHER, wonderFor, wonderGeom, blocksForLayer,
} from "./data.js";
import { costFor, canAfford, resolveQty } from "./state.js";
import { isUnlocked, blessingCost, hasEvent } from "./sim.js";
import { icon } from "./icons.js";
import { fmt, fmtInt, fmtTime } from "./format.js";

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

const CATS = ["resource", "crew", "transport", "city", "blessing"];

export class UI {
  constructor(app) {
    this.app = app;
    this.tab = "resource";
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
      const chip = el("div", "chip", `<span class="ic">${icon(k)}</span><span class="v"></span><span class="net"></span>`);
      chip.title = RES_META[k].name;
      this.resChips[k] = { chip, v: chip.querySelector(".v"), net: chip.querySelector(".net") };
      this.resBar.appendChild(chip);
    }
    this.legacyChip = el("div", "chip legacy", `<span class="ic">${icon("legacy")}</span><span class="v"></span>`);
    this.legacyChip.title = STR.legacy;
    this.legacyV = this.legacyChip.querySelector(".v");
    const gear = el("button", "iconbtn", icon("blessing"));
    gear.title = STR.settings; gear.onclick = () => this._openModal("settings");
    const helpBtn = el("button", "iconbtn", "?"); helpBtn.title = STR.help;
    helpBtn.onclick = () => this._openModal("help");
    top.append(this.brand, this.resBar, this.legacyChip, helpBtn, gear);
    r.appendChild(top);

    // ---- status (goal + chain + weather + morale) ----
    const status = el("div", "status");
    this.goalLine = el("div", "goal");
    this.progWrap = el("div", "bar"); this.progFill = el("div", "fill gold");
    this.progWrap.appendChild(this.progFill);
    this.progText = el("div", "progtext");

    const chain = el("div", "chain");
    chain.appendChild(el("div", "chain-h", `${icon("transport")}<span>${STR.chainTitle}</span>`));
    this.chainRows = {};
    for (const key of ["supply", "transport", "placement"]) {
      const row = el("div", "chain-row");
      const lab = el("span", "lab", STR.chain[key]);
      const bar = el("div", "bar mini"); const fill = el("div", "fill");
      bar.appendChild(fill);
      const val = el("span", "cval");
      row.append(lab, bar, val);
      this.chainRows[key] = { row, fill, val };
      chain.appendChild(row);
    }
    this.bottleneck = el("div", "bottleneck");
    chain.appendChild(this.bottleneck);

    const wx = el("div", "weather");
    this.wxIc = el("span", "ic", icon("weather"));
    this.wxName = el("span", "wxn");
    this.wxNext = el("span", "wxx");
    wx.append(this.wxIc, this.wxName, this.wxNext);

    const mor = el("div", "morale");
    mor.appendChild(el("span", "lab", STR.moraleLabel));
    const mbar = el("div", "bar mini"); this.moraleFill = el("div", "fill");
    mbar.appendChild(this.moraleFill); mor.appendChild(mbar);
    this.moraleV = el("span", "cval"); mor.appendChild(this.moraleV);

    status.append(this.goalLine, this.progWrap, this.progText, chain, wx, mor);
    r.appendChild(status);

    // ---- contextual action banner (disasters / prestige) ----
    this.banner = el("div", "banner hidden");
    r.appendChild(this.banner);

    // ---- dock (tabs + list) ----
    const dock = el("div", "dock");
    const tabs = el("div", "tabs");
    this.tabBtns = {};
    for (const c of CATS) {
      const b = el("button", "tab", `<span class="ic">${icon(c === "crew" ? "crew" : c === "blessing" ? "blessing" : c)}</span><span>${STR.tabs[c]}</span>`);
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

    // ---- chronicle ----
    const chron = el("div", "chron");
    chron.appendChild(el("div", "chron-h", STR.eventLog));
    this.logEl = el("div", "log");
    chron.appendChild(this.logEl);
    r.appendChild(chron);

    // ---- toaster ----
    this.toaster = el("div", "toaster"); r.appendChild(this.toaster);

    // ---- tip ----
    this.tip = el("div", "tip", STR.startTip);
    r.appendChild(this.tip);

    // ---- modals ----
    this._buildModals();
    this._setTab("resource");
    this._syncQty();
  }

  _buildModals() {
    this.modalWrap = el("div", "modalwrap hidden");
    this.modalBox = el("div", "modal");
    this.modalWrap.appendChild(this.modalBox);
    this.modalWrap.onclick = (e) => { if (e.target === this.modalWrap) this._closeModal(); };
    addEventListener("keydown", (e) => { if (e.code === "Escape") this._closeModal(); });
    this.root.appendChild(this.modalWrap);
  }

  _openModal(kind, data) {
    const m = this.modalBox; m.innerHTML = "";
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

  showOffline(data) { if (data) this._openModal("offline", data); }
  showCeremony(name, gain) { this._openModal("ceremony", { name, gain }); }

  toast(text, kind = "info") {
    const t = el("div", "toast " + kind, text);
    this.toaster.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 3600);
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
    if (tab === "transport") return BUILDINGS.filter((b) => b.cat === "transport").map((d) => ({ d, kind: "b" }));
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
        lock.innerHTML = `${STR.locked} ${fmt(d.unlock)} ${STR.blocksUnit}`;
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
      if (kind === "w") {
        const room = stats.workerCap - stats.workersUsed;
        if (room <= 0) { afford = false; chips += `<span class="costchip no">${STR.housing} full</span>`; }
      }
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
      ref.v.textContent = fmt(state.res[k]);
      let net = stats.prod[k] || 0;
      if (k === "food") net -= stats.upkeep.food;
      if (k === "water") net -= stats.upkeep.water;
      if (k === "limestone") net -= (state._lastFlow || 0) * stats.lpb;
      ref.net.textContent = (net >= 0 ? "+" : "") + fmt(net) + STR.res.perSec;
      ref.net.className = "net " + (net >= -1e-6 ? "up" : "down");
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

    // chain
    const maxR = Math.max(stats.supplySustain, stats.transport, stats.placement, 0.001);
    const cv = { supply: stats.supplySustain, transport: stats.transport, placement: stats.placement };
    for (const key in this.chainRows) {
      const row = this.chainRows[key];
      row.fill.style.width = (100 * Math.max(0, cv[key]) / maxR).toFixed(0) + "%";
      row.val.textContent = fmt(cv[key]) + STR.res.perSec;
      row.fill.classList.toggle("limit", stats.bottleneck === key);
      row.row.classList.toggle("limit", stats.bottleneck === key);
    }
    this.bottleneck.innerHTML = `${STR.effective} <b>${fmt(state._lastFlow || 0)}${STR.res.perSec}</b> · ${STR.bottleneckPrefix}<b>${STR.bottleneck[stats.bottleneck] || ""}</b>`;

    // weather
    const wx = WEATHER.find((w) => w.id === state.weather.id) || WEATHER[0];
    const nx = WEATHER.find((w) => w.id === state.weather.nextId);
    this.wxName.textContent = wx.name + " · " + fmtTime(state.weather.timeLeft);
    this.wxNext.textContent = nx ? STR.weatherNext + nx.name : "";
    this.wxIc.className = "ic wx-" + wx.id;

    // morale
    const mp = Math.max(0, Math.min(120, state.morale));
    this.moraleFill.style.width = (mp / 120 * 100).toFixed(0) + "%";
    this.moraleFill.style.background = mp < 25 ? "#e0564a" : mp < 60 ? "#e0a64a" : "#67c98a";
    this.moraleV.textContent = Math.round(state.morale) + (hasEvent(state, "strike") ? " ⚠" : "");

    // banner (disasters / prestige)
    this._banner(state, stats);

    // list
    this._rebuildList(state, stats);
    this._refreshList(state, stats);

    // log
    this._log(state);

    // tip
    this.tip.classList.toggle("hidden", state.stats.taps > 2 || state.stats.totalBlocksAllTime > 10);
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
    if (hasEvent(state, "ramp_collapse")) {
      this.banner.className = "banner danger";
      this.banner.innerHTML = `<span>${STR.banner.ramp}</span>`;
      const b = el("button", "btn", STR.repairBtn + ` (${fmt(80 + 20 * state.wonderIndex)} ${RES_META.wood.name})`);
      b.onclick = () => this.app.repairRamp();
      this.banner.appendChild(b);
      this.banner.classList.remove("hidden");
      return;
    }
    if (hasEvent(state, "pharaoh_death")) {
      this.banner.className = "banner danger";
      this.banner.innerHTML = `<span>${STR.banner.pharaoh}</span>`;
      const b = el("button", "btn", STR.crownBtn);
      b.onclick = () => this.app.crownSuccessor();
      this.banner.appendChild(b);
      this.banner.classList.remove("hidden");
      return;
    }
    if (hasEvent(state, "strike")) {
      this.banner.className = "banner danger";
      this.banner.innerHTML = `<span>${STR.banner.strike}</span>`;
      this.banner.classList.remove("hidden");
      return;
    }
    this.banner.classList.add("hidden");
  }

  _log(state) {
    const sig = state.log.length ? state.log[0].t + state.log[0].text : "";
    if (sig === this._logSig) return;
    this._logSig = sig;
    this.logEl.innerHTML = "";
    for (const e of state.log.slice(0, 14)) {
      this.logEl.appendChild(el("div", "logline " + (e.kind || ""), `<span class="lt">${fmtTime(e.t)}</span> ${e.text}`));
    }
  }
}
