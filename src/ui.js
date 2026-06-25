// DOM UI layer over the canvas scene. Builds the HUD once, then refreshes
// values each tick. No user-facing literals here — all text via STR / data.
import { STR } from "../strings.js";
import {
  RES, RES_META, BUILDINGS, WORKERS, BLESSINGS,
  WEATHER, wonderFor, wonderGeom, blocksForLayer, UNLOCK_LEVEL, xpInfo, questFor,
} from "./data.js";
import { costFor, canAfford, resolveQty } from "./state.js";
import { isUnlocked, blessingCost, getLevel } from "./sim.js";
import { icon } from "./icons.js";
import { fmt, fmtInt, fmtTime } from "./format.js";

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

const CATS = ["resource", "crew", "machine", "city", "blessing"];

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

    // ---- center reward popup ----
    this.popupEl = el("div", "popup"); r.appendChild(this.popupEl);

    // ---- floating +resource numbers (tap-to-harvest feedback) ----
    this.floatLayer = el("div", "floatlayer"); r.appendChild(this.floatLayer);

    // ---- Pharaoh guide + quest panel ----
    this.questEl = el("div", "quest");
    this.questEl.innerHTML = `<div class="ph-portrait">${icon("pharaoh")}</div>
      <div class="q-main"><div class="q-head">${STR.pharaohName}</div><div class="q-text"></div>
      <div class="q-foot"><span class="q-prog"></span><span class="q-reward"></span></div></div>`;
    this.qText = this.questEl.querySelector(".q-text");
    this.qProg = this.questEl.querySelector(".q-prog");
    this.qReward = this.questEl.querySelector(".q-reward");
    r.appendChild(this.questEl);

    // ---- Pharaoh speech bubble ----
    this.speechEl = el("div", "speech hidden");
    this.speechEl.innerHTML = `<div class="ph-portrait big">${icon("pharaoh")}</div><div class="sp-text"></div>`;
    this.spText = this.speechEl.querySelector(".sp-text");
    r.appendChild(this.speechEl);

    // ---- modals ----
    this._buildModals();
    this._setTab("resource");
    this._syncQty();
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
  _updateQuest(state) {
    const q = questFor(state);
    if (this._questText !== q.text) {
      this._questText = q.text; this.qText.textContent = q.text;
      this._clearGlow();
      if (q.tab && this.tabBtns[q.tab]) this._glow(this.tabBtns[q.tab]);
    }
    const p = q.prog ? q.prog(state) : null;
    this.qProg.textContent = p ? `${fmt(p.cur)}/${fmt(p.max)}` : "";
    let rw = "";
    if (q.reward) {
      if (q.reward.legacy) rw = `+${q.reward.legacy} ${STR.legacy}`;
      else if (q.reward.res) { const k = Object.keys(q.reward.res)[0]; rw = `+${fmt(q.reward.res[k])} ${RES_META[k].name}`; }
    }
    this.qReward.textContent = rw ? STR.reward + " " + rw : "";
  }
  _glow(elm) { if (elm) elm.classList.add("tut-glow"); this._glowed = elm; }
  _clearGlow() { if (this._glowed) this._glowed.classList.remove("tut-glow"); this._glowed = null; }

  pharaohSpeak(text) {
    this.spText.textContent = text;
    this.speechEl.classList.remove("hidden"); this.speechEl.classList.add("show");
    clearTimeout(this._speechT);
    this._speechT = setTimeout(() => { this.speechEl.classList.remove("show"); setTimeout(() => this.speechEl.classList.add("hidden"), 350); }, 4200);
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
      let net = stats.prod[k] || 0;
      if (k === "limestone") net -= (state._lastFlow || 0) * stats.lpb;
      // at cap, surplus production is wasted — show "FULL" instead of a phantom +rate
      const full = Number.isFinite(cap) && state.res[k] >= cap - 1 && net > 0;
      ref.net.textContent = full ? STR.res.full : (net >= 0 ? "+" : "") + fmt(net) + STR.res.perSec;
      ref.net.className = "net " + (full ? "full" : net >= -1e-6 ? "up" : "down");
      ref.chip.classList.toggle("isfull", full);
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
    this._log(state);
    this._updateLevel(state);
    this._updateQuest(state);
    this.tip.classList.add("hidden");
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
