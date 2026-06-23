// Procedural audio (Web Audio API) — no asset files. SFX + generative ambient.
// Mixed conservatively: master kept well below clipping, music quiet under SFX.
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// D Phrygian-dominant ("Hijaz") scale for an ancient-Egyptian colour.
const SCALE = [62, 63, 66, 67, 69, 70, 72, 74, 75, 78];

export class Audio {
  constructor() {
    this.ctx = null; this.ok = false;
    this.muted = false; this.music = true;
    this.master = null; this.sfxBus = null; this.musicBus = null;
    this.noise = null; this._timer = null; this._beat = 0; this._next = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.32;
      this.sfxBus.connect(this.master);

      // gentle reverb-ish feedback delay shared by music
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.0;
      const delay = this.ctx.createDelay(); delay.delayTime.value = 0.33;
      const fb = this.ctx.createGain(); fb.gain.value = 0.32;
      const wet = this.ctx.createGain(); wet.gain.value = 0.25;
      this.musicBus.connect(delay); delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(this.master);
      this.musicBus.connect(this.master);

      // shared noise buffer
      const n = this.ctx.sampleRate * 1.0;
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.ok = true;
    } catch (e) { this.ok = false; }
  }

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }

  setMuted(b) { this.muted = b; if (this.master) this.master.gain.value = b ? 0 : 0.9; }
  setMusic(b) {
    this.music = b;
    if (!this.ok) return;
    if (b) this.startMusic(); else this.stopMusic();
  }

  _env(node, t, a, d, peak) {
    const g = node.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _tone(freq, type, t, a, d, peak, bus) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    o.connect(g); g.connect(bus || this.sfxBus);
    this._env(g, t, a, d, peak);
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }

  _noiseBurst(t, dur, peak, freq, type) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type || "lowpass"; f.frequency.value = freq || 800;
    const g = this.ctx.createGain();
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // ---- SFX ----
  play(name) {
    if (!this.ok || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case "place":
        this._tone(120, "triangle", t, 0.004, 0.13, 0.7);
        this._tone(64, "sine", t, 0.004, 0.18, 0.5);
        this._noiseBurst(t, 0.09, 0.25, 1600, "lowpass");
        break;
      case "tap":
        this._tone(180, "triangle", t, 0.003, 0.07, 0.4);
        this._noiseBurst(t, 0.05, 0.12, 2400, "lowpass");
        break;
      case "layer":
        this._tone(midi(74), "sine", t, 0.005, 0.25, 0.5);
        this._tone(midi(78), "sine", t + 0.06, 0.005, 0.3, 0.4);
        break;
      case "unlock":
        [72, 76, 79, 84].forEach((m, i) =>
          this._tone(midi(m), "sine", t + i * 0.07, 0.005, 0.32, 0.45));
        this._tone(midi(48), "triangle", t, 0.01, 0.4, 0.25);
        break;
      case "buy":
        this._tone(midi(67), "triangle", t, 0.004, 0.09, 0.3);
        this._tone(midi(72), "triangle", t + 0.04, 0.004, 0.09, 0.25);
        break;
      case "disaster":
        for (let i = 0; i < 3; i++)
          this._tone(95 + i * 2, "sawtooth", t + i * 0.02, 0.12, 0.9, 0.5);
        this._noiseBurst(t, 0.5, 0.15, 380, "lowpass");
        break;
      case "capstone":
        [60, 64, 67, 72, 76, 79, 84].forEach((m, i) =>
          this._tone(midi(m), "triangle", t + i * 0.09, 0.01, 0.7, 0.4));
        this._noiseBurst(t + 0.1, 1.2, 0.12, 6000, "highpass");
        break;
      case "error":
        this._tone(110, "sine", t, 0.004, 0.12, 0.3);
        break;
    }
  }

  // ---- generative ambient music ----
  startMusic() {
    if (!this.ok || this._timer || !this.music) return;
    this.musicBus.gain.setTargetAtTime(0.12, this.ctx.currentTime, 1.5);
    this._next = this.ctx.currentTime + 0.1; this._beat = 0;
    // continuous low drone (root + fifth)
    this._drone = [];
    [38, 45].forEach((m) => {
      const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.value = midi(m);
      const g = this.ctx.createGain(); g.gain.value = 0.06;
      o.connect(g); g.connect(this.musicBus); o.start();
      this._drone.push(o);
    });
    this._timer = setInterval(() => this._sched(), 120);
  }

  stopMusic() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.8);
    if (this._drone) { this._drone.forEach((o) => { try { o.stop(this.ctx.currentTime + 1); } catch (e) {} }); this._drone = null; }
  }

  _sched() {
    if (!this.ok) return;
    const beatDur = 0.5;
    while (this._next < this.ctx.currentTime + 0.25) {
      const t = this._next, b = this._beat;
      // soft arpeggio note most beats
      if (b % 2 === 0 || Math.random() < 0.5) {
        const m = SCALE[Math.floor(Math.random() * SCALE.length)];
        const o = this.ctx.createOscillator(); o.type = "triangle"; o.frequency.value = midi(m);
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.musicBus);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.start(t); o.stop(t + 1.0);
      }
      // soft hand-drum every 4th beat
      if (b % 4 === 0) this._softDrum(t);
      this._next += beatDur; this._beat++;
    }
  }

  _softDrum(t) {
    const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    const g = this.ctx.createGain();
    o.connect(g); g.connect(this.musicBus);
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.start(t); o.stop(t + 0.3);
  }
}
