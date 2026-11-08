/* Mr. Mars Music Studio · MRH DGN — DJ mikser: 2/4 deck, key lock, ton ve BPM algılama, faz senkronu, beat jump,
   hot cue, döngü, deck efektleri, kulaklık cue, sampler pedleri, set kaydı, MIDI öğrenme */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, E = OS.engine;
  const DJ = ui.dj = { decks: [], count: 2, xfade: 0.5, curve: 0, learn: false, pending: null };
  const LETTERS = ['A', 'B', 'C', 'D'];
  const FX = [['', 'Efekt yok', null], ['fx.delay', 'Echo', 'mix'], ['fx.reverb', 'Reverb', 'mix'], ['fx.flanger', 'Flanger', 'mix'], ['fx.phaser', 'Phaser', 'mix'], ['fx.crusher', 'Bit Crush', 'mix'], ['fx.tremolo', 'Gater', 'depth'], ['fx.pitch', 'Perde', 'semi'], ['fx.chorus', 'Chorus', 'mix'], ['fx.ringmod', 'Ring Mod', 'mix'], ['fx.shimmer', 'Shimmer', 'mix']];
  let root, master, masterOut, cueBus, outMerger, built = false, recorder = null;
  let settings = (() => { try { return JSON.parse(localStorage.getItem('os.dj') || '{}'); } catch (e) { return {}; } })();
  settings = Object.assign({ count: 2, cueMode: 'off', cueMix: 0.5, cueVol: 0.8, quantize: true, jump: 4, map: {}, autoStems: false, slip: false, xBeats: 16, eqBands: 3, faderCurve: 'linear', vinyl: true, led: true, sendA: { band: 'all', ret: 0.8, time: 0.75, fb: 0.55 }, sendB: { type: 'shimmer', band: 'all', ret: 0.8 } }, settings);
  const STEMS = ['vocals', 'drums', 'bass', 'melody'], STEM_LBL = { vocals: 'VOKAL', drums: 'DAVUL', bass: 'BAS', melody: 'MELODİ' };
  const saveSettings = () => { try { localStorage.setItem('os.dj', JSON.stringify(settings)); } catch (e) { } };

  class Deck {
    constructor(ctx, idx) {
      this.idx = idx; this.ctx = ctx; this.L = LETTERS[idx];
      this.buffer = null; this.name = '—'; this.bpm = 0; this.grid = 0; this.key = ''; this.rate = 1; this.range = 0.08;
      this.playing = false; this.pos = 0; this.cue = 0; this.hot = new Array(16).fill(null); this.savedLoops = []; this.loop = null; this.nudge = 0;
      this.keylock = false; this.cueOn = false; this.xAssign = idx % 2 === 0 ? 'A' : 'B';
      const mk = (type, f) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; return b; };
      this.pre = ctx.createGain(); this.shifter = OS.makePitchShifter(ctx, 0.07);
      this.trim = ctx.createGain();
      this.low = mk('lowshelf', 200); this.mid = mk('peaking', 1000); this.mid.Q.value = 0.8; this.high = mk('highshelf', 3500);
      this.lomid = mk('peaking', 400); this.lomid.Q.value = 0.9; this.himid = mk('peaking', 2500); this.himid.Q.value = 0.9;
      this.lp = mk('lowpass', 22000); this.hp = mk('highpass', 10); this.lp.Q.value = this.hp.Q.value = 1.2;
      this.fxIn = ctx.createGain(); this.fader = ctx.createGain(); this.xf = ctx.createGain(); this.cueTap = ctx.createGain(); this.cueTap.gain.value = 0;
      this.an = ctx.createAnalyser(); this.an.fftSize = 1024;
      this.shifter.output.connect(this.trim);
      this.lg = ctx.createGain(); this.trim.connect(this.lg); this.lg.connect(this.low); this.low.connect(this.mid); this.mid.connect(this.lomid); this.lomid.connect(this.himid); this.himid.connect(this.high); this.high.connect(this.hp); this.hp.connect(this.lp); this.lp.connect(this.fxIn);
      this.fader.connect(this.xf); this.fader.connect(this.an); this.xf.connect(master);
      this.lp.connect(this.cueTap); this.cueTap.connect(cueBus); // kulaklık: fader öncesi
      this.eqVals = { low: 0, mid: 0, high: 0, lomid: 0, himid: 0 }; this.kills = { low: false, mid: false, high: false, lomid: false, himid: false };
      // Send/Return FX gönderimleri (fader sonrası)
      this.sendA = ctx.createGain(); this.sendB = ctx.createGain(); this.sendA.gain.value = this.sendB.gain.value = 0;
      this.fader.connect(this.sendA); this.fader.connect(this.sendB);
      if (DJ.sends) { this.sendA.connect(DJ.sends.a.in); this.sendB.connect(DJ.sends.b.in); }
      this.faderVal = 1; this.res = 1.2;
      this.applyEqMode();
      this.fx = [0, 1, 2].map(() => ({ id: '', amt: 0.5, dev: null }));
      // stem kanalları (vokal / davul / bas / melodi)
      this.stems = null; this.stemProg = null; this.stemG = {};
      this.stemL = {}; this.stemFx = {}; this.stemFxB = {};
      STEMS.forEach(k => {
        const g = ctx.createGain(), l = ctx.createGain(), fx = ctx.createGain(), fxb = ctx.createGain(); fx.gain.value = 0; fxb.gain.value = 0;
        g.connect(l); l.connect(this.pre); l.connect(fx); l.connect(fxb); if (DJ.sends) { fx.connect(DJ.sends.a.in); fxb.connect(DJ.sends.b.in); }
        this.stemG[k] = g; this.stemL[k] = l; this.stemFx[k] = fx; this.stemFxB[k] = fxb;
      });
      this.route(); this.setFx('');
    }
    route() {
      const ratio = (this.keylock && !this.scr ? 1 / this.eff : 1) * Math.pow(2, (this.keyShift || 0) / 12);
      const shift = Math.abs(ratio - 1) > 0.001;
      if (shift !== this._shifted) {
        this._shifted = shift;
        try { this.pre.disconnect(); } catch (e) { }
        this.pre.connect(shift ? this.shifter.input : this.trim);
      }
      if (shift) this.shifter.setRatio(ratio);
    }
    get fxId() { return this.fx[0].id; }
    get fxAmt() { return this.fx[0].amt; }
    // 3 FX yuvası sırayla zincirlenir; boş yuva sese dokunmaz
    rewireFx() {
      try { this.fxIn.disconnect(); } catch (e) { }
      let last = this.fxIn;
      this.fx.forEach(f => { if (!f.dev) return; try { f.dev.out.disconnect(); } catch (e) { } last.connect(f.dev.in); last = f.dev.out; });
      last.connect(this.fader);
    }
    setFx(id, slot = 0) {
      const f = this.fx[slot];
      if (f.dev) { f.dev.dispose(); f.dev = null; }
      f.id = id;
      if (id) { f.dev = new OS.Device(this.ctx, id); if (id === 'fx.delay') f.dev.setParam('fb', 0.45); if (id === 'fx.tremolo') f.dev.setParam('shape', 1); }
      this.rewireFx();
      if (id) this.setFxAmt(f.amt, slot);
    }
    setFxAmt(v, slot = 0) {
      const f = this.fx[slot], t = FX.find(x => x[0] === f.id);
      f.amt = v;
      if (!f.dev || !t) return;
      if (t[2] === 'semi') f.dev.setParam('semi', Math.round(v * 24 - 12));
      else f.dev.setParam(t[2], v);
      if (f.id === 'fx.delay') f.dev.setParam('sync', 7);
    }
    async load(file) {
      const ab = await U.readAsArrayBuffer(file);
      if (this.scr) { clearInterval(this._scrT); this.scr = null; }
      this.stop();
      if (this.video) URL.revokeObjectURL(this.video);
      this.video = /^video\//.test(file.type) || /\.(mp4|webm|m4v|mov|mkv)$/i.test(file.name) ? URL.createObjectURL(file) : null;
      try { this.buffer = await this.ctx.decodeAudioData(ab); }
      catch (e) { this.video = null; U.toast(OS.t('Bu dosya biçimi bu cihazda çalınamıyor') + ': ' + file.name, 5000); return; }
      this.name = file.name.replace(/\.[^.]+$/, '');
      this.pos = 0; this.cue = 0; this.hot = this.hot.map(() => null); this.loop = null; this.rev = false; this.remix = null; this.savedLoops = []; this.cover = null; this.peaks = null; this.key = '…'; this.bpm = 0;
      this.stems = null; this.stemProg = null; this.loadId = (this.loadId || 0) + 1; this.libId = file.libId || null;
      setTimeout(() => {
        this.bpm = U.detectBPM(this.buffer);
        this.grid = U.detectBeatOffset(this.buffer, this.bpm);
        this.pps = 150; this.peaks = U.peaks(this.buffer, Math.ceil(this.buffer.duration * this.pps));
        this.bands = bandPeaks(this.buffer, this.pps);
        this.endPos = trailingEnd(this.buffer);
        this.overview = U.peaks(this.buffer, 800);
        this.loud = measureLevel(this.buffer); this.applyLevel();
        DJ.renderInfo();
        setTimeout(() => { this.key = U.detectKey(this.buffer); DJ.renderInfo(); if (file.libId) DJ.lib.update(file.libId, { bpm: this.bpm, key: this.key, dur: this.buffer.duration }); if (settings.autoStems) this.makeStems(); }, 30);
      }, 20);
    }
    async makeStems() {
      if (!this.buffer || this.stems || this.stemProg != null) return;
      const id = this.loadId, buf = this.buffer;
      this.stemProg = 0; DJ.renderInfo();
      const st = await OS.dsp.separateFast(buf, p => { this.stemProg = p; DJ.renderInfo(); });
      if (id !== this.loadId) return;
      this.stems = OS.dsp.toBuffers(this.ctx, st, buf.sampleRate);
      this.stemProg = null;
      if (this.playing) { this.pause(); this.play(); }
      DJ.renderInfo();
    }
    toggleStem(k) { const g = this.stemG[k].gain; g.value = g.value > 0.5 ? 0 : 1; }
    get eff() { return this.scr ? Math.abs(this.scr.v) : this.rate * (1 + this.nudge); }
    get beat() { return 60 / (this.bpm || 120); }
    position() {
      if (!this.playing) return this.pos;
      if (this.ctx.currentTime < this.startCtx) return this.startPos;
      if (this.mv) return U.clamp(this.mv.f(Math.min(1, (this.ctx.currentTime - this.mv.t) / this.mv.dur)), 0, this.buffer ? this.buffer.duration : 0);
      let p = this.startPos + (this.ctx.currentTime - this.startCtx) * this.eff * (this.rev ? -1 : 1);
      if (p < 0) p = 0;
      if (this.loop && p >= this.loop.end) p = this.loop.start + ((p - this.loop.start) % (this.loop.end - this.loop.start));
      return Math.min(p, this.buffer ? this.buffer.duration : 0);
    }
    snap(t) { return settings.quantize && this.bpm ? this.grid + Math.round((t - this.grid) / this.beat) * this.beat : t; }
    play(delay = 0) {
      if (!this.buffer || this.playing) return;
      E.resume();
      if (DJ.mem) DJ.mem.start();
      // stem'ler hazırsa 4 kanal birlikte, değilse tek kaynak çalar
      if (this.loop) this.rev = false;
      const bufs = this.rev ? [[this.revBuf(), this.pre]] : this.stems ? STEMS.map(k => [this.stems[k], this.stemG[k]]) : [[this.buffer, this.pre]];
      const when = this.ctx.currentTime + 0.005 + delay, fade = this.pre.gain;
      fade.setValueAtTime(0, when); fade.linearRampToValueAtTime(1, when + 0.004);
      this.srcs = bufs.map(([b, dest]) => {
        const x = this.ctx.createBufferSource();
        x.buffer = b; x.playbackRate.value = this.eff;
        if (this.loop) { x.loop = true; x.loopStart = this.loop.start; x.loopEnd = this.loop.end; }
        x.connect(dest); x.start(when, U.clamp(this.rev ? b.duration - this.pos : this.pos, 0, b.duration - 0.001));
        return x;
      });
      const s = this.srcs[0];
      this.src = s; this.startCtx = when; this.startPos = this.pos;
      s.onended = () => { if (this.src === s && this.playing && !this.loop) { this.playing = false; this.pos = 0; DJ.renderInfo(); } };
      this.playing = true;
      if (this.histOf !== this.loadId) { this.histOf = this.loadId; DJ.hist.add(this); }
    }
    pause() { if (!this.playing) return; this.pos = this.position(); this.stop(); }
    stop() {
      clearTimeout(this._mvT); this.mv = null;
      const t = this.ctx.currentTime, fade = this.pre.gain;
      if (this.srcs && this.srcs.length) { fade.cancelScheduledValues(t); fade.setValueAtTime(fade.value, t); fade.linearRampToValueAtTime(0, t + 0.004); }
      (this.srcs || []).forEach(x => { try { x.stop(t + 0.004); } catch (e) { } });
      this.srcs = []; this.src = null; this.playing = false;
    }
    toggle() { if (this.scr) { this.scr.was = !this.scr.was; return; } if (this._cueHold) { this._cueHold = false; return; } this.playing ? this.pause() : this.playOnBeat(); }
    // Vuruşa başlat: çalan diğer deck varsa bu deck onun bir sonraki vuruşunda, kendi vuruşundan girer
    playOnBeat() {
      const o = settings.beatStart && this.bpm && DJ.decks.find(x => x !== this && x.playing && x.bpm && !x.scr);
      if (!o) { this.play(); return; }
      const ph = (((o.position() - o.grid) / o.beat) % 1 + 1) % 1;
      this.pos = this.grid + Math.round((this.pos - this.grid) / this.beat) * this.beat;
      this.play((1 - ph) * o.beat / o.eff);
    }
    seek(t) { const was = this.playing; this.pause(); this.pos = U.clamp(t, 0, this.buffer ? this.buffer.duration : 0); if (was) this.play(); }
    rebase() { if (this.playing) { this.startPos = this.position(); this.startCtx = this.ctx.currentTime; } }
    setRate(r) { this.rebase(); this.rate = r; (this.srcs || []).forEach(x => x.playbackRate.value = this.eff); this.route(); }
    setNudge(n) { this.rebase(); this.nudge = n; (this.srcs || []).forEach(x => x.playbackRate.value = this.eff); this.route(); }
    revBuf() {
      if (this._rev && this._revOf === this.loadId) return this._rev;
      const b = this.buffer, r = this.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
      for (let c = 0; c < b.numberOfChannels; c++) { const a = b.getChannelData(c), o = r.getChannelData(c), n = a.length; for (let i = 0; i < n; i++) o[i] = a[n - 1 - i]; }
      this._rev = r; this._revOf = this.loadId;
      return r;
    }
    setReverse(on) { if (!this.buffer) return; const was = this.playing; if (was) this.pause(); this.rev = on; if (on) this.loop = null; if (was) this.play(); }
    // Jog kenarı: çevirme hızıyla orantılı tempo itme; dur deyince yumuşakça sıfırlanır
    jogBend(delta) {
      this._bTicks = (this._bTicks || 0) + delta;
      if (this._bT) return;
      let last = performance.now(), idle = 0, n = this.nudge || 0;
      this._bT = setInterval(() => {
        const now = performance.now(), dt = Math.max(0.001, (now - last) / 1000); last = now;
        const normal = (settings.jogRes || 720) * 33.333 / 60, target = U.clamp((this._bTicks / (dt * normal)) * 0.25 * (settings.jogSens || 1), -0.5, 0.5);
        idle = this._bTicks ? 0 : idle + dt; this._bTicks = 0;
        n = n * 0.7 + target * 0.3;
        if (idle > 0.12 && Math.abs(n) < 0.002) { clearInterval(this._bT); this._bT = null; this.setNudge(0); return; }
        this.setNudge(n);
      }, 25);
    }
    // Scratch: jog'a dokununca plak el hızını izler, ileri ve geri ses duyulur
    scratchOn() {
      if (!this.buffer || this.mv || this.scr) return;
      this.rebase(); this.revBuf();
      const was = this.playing;
      this.scr = { v: 0, ticks: 0, was, rev0: this.rev, t: performance.now() };
      if (was) (this.srcs || []).forEach(x => x.playbackRate.value = 0); else this.play();
      this.route();
      this._scrT = setInterval(() => this.scratchTick(), 20);
    }
    scratchTick() {
      const s = this.scr; if (!s) return;
      const now = performance.now(), dt = Math.max(0.001, (now - s.t) / 1000); s.t = now;
      const normal = (settings.jogRes || 720) * 33.333 / 60; // normal hızda saniyedeki tık
      let v = s.direct != null ? s.direct : s.v * 0.55 + (s.ticks / (dt * normal)) * (settings.jogSens || 1) * 0.45;
      s.ticks = 0;
      if (Math.abs(v) < 0.01) v = 0;
      v = U.clamp(v, -4, 4);
      if (this.loop && v < 0) v = 0;
      const wantRev = v < -0.02 ? true : v > 0.02 ? false : this.rev;
      if (!this.playing) { s.v = v; if (v) { this.rev = wantRev; this.play(); } return; }
      if (wantRev !== this.rev) { const p = this.position(); this.stop(); this.pos = p; this.rev = wantRev; s.v = v; this.play(); return; }
      this.rebase(); s.v = v;
      const t = this.ctx.currentTime;
      (this.srcs || []).forEach(x => x.playbackRate.setTargetAtTime(Math.abs(v), t, 0.004));
    }
    scratchOff() {
      const s = this.scr; if (!s) return;
      clearInterval(this._scrT);
      const p = this.position();
      this.stop(); this.pos = p; this.rev = s.rev0; this.scr = null;
      this.route();
      if (s.was) this.play();
    }
    // Fren: plak gibi yavaşlayarak durur
    brake(dur = 1.2) {
      if (!this.playing || this.mv) return;
      const t = this.ctx.currentTime, p0 = this.position(), e = this.eff, dir = this.rev ? -1 : 1;
      (this.srcs || []).forEach(x => { x.playbackRate.cancelScheduledValues(t); x.playbackRate.setValueAtTime(e, t); x.playbackRate.linearRampToValueAtTime(0.01, t + dur); });
      this.mv = { t, dur, f: k => p0 + dir * e * dur * (k - k * k / 2) };
      this._mvT = setTimeout(() => { const p = this.position(); this.stop(); this.pos = p; DJ.renderInfo(); }, dur * 1000);
    }
    // Spinback: plağı elle geri çevirip durdurma
    spinback(dur = 0.9) {
      if (!this.buffer || this.mv) return;
      const t = this.ctx.currentTime, p0 = this.position(), r = this.revBuf();
      this.stop(); E.resume();
      this.pre.gain.setValueAtTime(1, t + 0.005);
      const x = this.ctx.createBufferSource(); x.buffer = r;
      x.playbackRate.setValueAtTime(3.5, t); x.playbackRate.exponentialRampToValueAtTime(0.05, t + dur);
      x.connect(this.pre); x.start(t, U.clamp(r.duration - p0, 0, r.duration - 0.001));
      this.srcs = [x]; this.playing = true;
      const dist = dur * 0.81;
      this.mv = { t, dur, f: k => p0 - dist * (1 - (1 - k) * (1 - k)) };
      this._mvT = setTimeout(() => { const p = this.position(); this.stop(); this.pos = p; DJ.renderInfo(); }, dur * 1000);
    }
    tap() {
      const now = performance.now();
      this.taps = (this.taps || []).filter(x => now - x < 2500); this.taps.push(now);
      if (this.taps.length >= 4) { const a = this.taps; this.bpm = Math.round(600000 / ((a[a.length - 1] - a[0]) / (a.length - 1))) / 10; }
    }
    shiftGrid(ms) { this.grid += ms / 1000; }
    setDownbeat() { this.grid = this.position(); }
    setKeyLock(b) { this.keylock = b; this.route(); }
    setKeyShift(k) { this.keyShift = U.clamp(Math.round(k), -12, 12); this.route(); }
    get shownKey() { if (!this.key || this.key === '…') return this.key; const m = this.key.endsWith('m'), r = U.NOTE_NAMES.indexOf(m ? this.key.slice(0, -1) : this.key); if (r < 0) return this.key; return U.NOTE_NAMES[(((r + (this.keyShift || 0)) % 12) + 12) % 12] + (m ? 'm' : ''); }
    cueBtn() {
      if (this.playing) { this.pause(); this.pos = this.cue; return; }
      if (this.buffer && Math.abs(this.pos - this.cue) < 0.02) { this._cueHold = true; this.play(); return; }
      this.cue = this.snap(this.pos); this.pos = this.cue;
    }
    cueUp() { if (this._cueHold) { this._cueHold = false; this.pause(); this.pos = this.cue; } }
    jump(beats) { if (this.buffer) this.seek(this.position() + beats * this.beat); }
    // other'ın bu deck'e uyması için gereken hız: yarım / çift tempoya en yakın olan
    fitRate(other) { const target = this.bpm * this.eff; return [0.5, 1, 2].map(k => target * k / other.bpm).reduce((a, b) => Math.abs(b - 1) < Math.abs(a - 1) ? b : a); }
    sync(other) {
      if (!this.bpm || !other.bpm) { U.toast('BPM henüz hesaplanmadı'); return false; }
      this.setRate(other.fitRate(this));
      if (other.playing && this.playing) {
        // faz hizalama: iki decki aynı vuruş kesirine getir
        const ph = x => (((x.position() - x.grid) / x.beat) % 1 + 1) % 1;
        let d = ph(other) - ph(this); if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
        this.seek(this.position() + d * this.beat);
      }
      return true;
    }
    setLoop(beats) {
      if (!this.buffer) return;
      if (!beats || (this.loop && this.loop.beats === beats)) {
        let p = this.position();
        if (this.slipRef) { p = this.slipRef.pos + (this.ctx.currentTime - this.slipRef.ctx) * this.eff; this.slipRef = null; this.loop = null; this.seek(p); return; }
        if (this.playing) { this.startPos = p; this.startCtx = this.ctx.currentTime; (this.srcs || []).forEach(x => x.loop = false); } else this.pos = p;
        this.loop = null; return;
      }
      const p = this.loop ? this.loop.start : this.snap(this.position()), len = beats * this.beat;
      if (settings.slip && this.playing && !this.slipRef) this.slipRef = { pos: this.position(), ctx: this.ctx.currentTime };
      if (this.playing && this.rev) { this.loop = { start: p, end: Math.min(this.buffer.duration, p + len), beats }; this.pause(); this.pos = p; this.play(); return; }
      this.rebase();
      this.loop = { start: p, end: Math.min(this.buffer.duration, p + len), beats };
      if (this.playing) (this.srcs || []).forEach(x => { x.loopStart = this.loop.start; x.loopEnd = this.loop.end; x.loop = true; }); else this.pos = p;
    }
    applyEqMode() {
      const four = settings.eqBands === 4;
      this.low.frequency.value = four ? 120 : 200; this.high.frequency.value = four ? 6000 : 3500;
      ['low', 'mid', 'high', 'lomid', 'himid'].forEach(b => this.setEQ(b, this.eqVals[b]));
    }
    setFader(v) { this.faderVal = v; this.fader.gain.value = faderGain(v); }
    setRes(q) { this.res = q; this.lp.Q.value = this.hp.Q.value = q; }
    setEQ(band, db) {
      this.eqVals[band] = db;
      const four = settings.eqBands === 4, unused = four ? band === 'mid' : (band === 'lomid' || band === 'himid');
      this[band].gain.value = unused ? 0 : (this.kills[band] || db <= -39.5 ? -40 : db);
    }
    kill(band) { this.kills[band] = !this.kills[band]; this.setEQ(band, this.eqVals[band]); return this.kills[band]; }
    setFilter(v) {
      this.filterVal = v;
      this.lp.frequency.value = v < 0 ? 20000 * Math.pow(0.01, -v) : 22000;
      this.hp.frequency.value = v > 0 ? 10 * Math.pow(800, v) : 10;
    }
    applyLevel() { this.lg.gain.value = settings.levelMatch && this.loud != null ? U.dbToGain(U.clamp(-14 - this.loud, -12, 12)) : 1; }
    setCue(on) { this.cueOn = on; this.cueTap.gain.value = on ? 1 : 0; }
  }

  // Parçanın algılanan seviyesi: sessiz bölümler hariç kısa blokların ortalaması (dB)
  function measureLevel(buf) {
    const ch = [...Array(buf.numberOfChannels).keys()].map(i => buf.getChannelData(i)), block = Math.floor(buf.sampleRate * 0.4), blocks = [];
    for (let s = 0; s + block <= buf.length; s += block) { let e = 0, n = 0; for (let i = s; i < s + block; i += 8) for (const c of ch) { e += c[i] * c[i]; n++; } blocks.push(e / Math.max(1, n)); }
    const above = v => blocks.filter(x => x > v), avg = a => a.reduce((p, c) => p + c, 0) / Math.max(1, a.length), g1 = above(1e-7);
    if (!g1.length) return null;
    const g2 = above(avg(g1) * 0.1);
    return 10 * Math.log10(avg(g2.length ? g2 : g1));
  }

  // ---------------- Grafik ve çıkışlar ----------------
  function build() {
    if (built) return;
    const ctx = E.init();
    master = ctx.createGain(); masterOut = ctx.createGain(); master.an = ctx.createAnalyser(); DJ.mfx = { id: '', amt: 0.5, dev: null }; DJ.limIn = ctx.createAnalyser(); DJ.limIn.fftSize = 1024; master.limit = ctx.createGain(); master.limit.gain.value = 0.25;
    const shaper = ctx.createWaveShaper(), n = 8193, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 4, m = Math.abs(x), knee = 0.89; cv[i] = Math.sign(x) * (m <= knee ? m : knee + (1 - knee) * Math.tanh((m - knee) / (1 - knee))); }
    shaper.curve = cv; master.limit.connect(shaper); shaper.connect(masterOut); DJ.tap = ctx.createGain(); shaper.connect(DJ.tap); master.limit.connect(DJ.limIn);
    master.connect(master.limit); masterOut.connect(master.an);
    cueBus = ctx.createGain();
    DJ.cueMaster = ctx.createGain(); masterOut.connect(DJ.cueMaster); DJ.cueMaster.connect(cueBus);
    DJ.sends = { a: makeSend(ctx, 'a'), b: makeSend(ctx, 'b') };
    DJ.pads = createPads(ctx);
    DJ.decks = [0, 1, 2, 3].map(i => new Deck(ctx, i));
    built = true;
    applyOut(); applyX();
  }
  // ---------------- Send / Return FX (yalnız seçili frekans bandına etki edebilir) ----------------
  const BANDS = [['all', 'Tüm frekanslar'], ['high', 'Sadece tiz'], ['mid', 'Sadece orta'], ['low', 'Sadece bas']];
  function makeSend(ctx, which) {
    const S = { in: ctx.createGain(), band: ctx.createBiquadFilter(), ret: ctx.createGain(), dev: null };
    S.in.connect(S.band); S.ret.connect(master);
    S.setBand = b => { const f = S.band; ({ all: () => { f.type = 'highpass'; f.frequency.value = 10; f.Q.value = 0.7; }, high: () => { f.type = 'highpass'; f.frequency.value = 2000; f.Q.value = 0.7; }, mid: () => { f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 0.7; }, low: () => { f.type = 'lowpass'; f.frequency.value = 250; f.Q.value = 0.7; } })[b](); };
    S.build = () => {
      try { S.band.disconnect(); } catch (e) { }
      if (S.dev && S.dev.dispose) S.dev.dispose();
      if (which === 'a') {
        // Dub delay: geri beslemede filtre ve hafif satürasyon
        const st = settings.sendA, d = ctx.createDelay(4), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), ws = ctx.createWaveShaper();
        lp.type = 'lowpass'; lp.frequency.value = 2600; hp.type = 'highpass'; hp.frequency.value = 220; ws.curve = U.curve('soft', 1.3);
        const bpm = () => { const dd = DJ.decks && DJ.decks.find(x => x.playing && x.bpm); return dd ? dd.bpm * dd.eff : OS.transport.bpm; };
        d.delayTime.value = Math.min(3.9, 60 / bpm() * st.time); fb.gain.value = st.fb;
        S.band.connect(d); d.connect(lp); lp.connect(hp); hp.connect(ws); ws.connect(fb); fb.connect(d); ws.connect(S.ret);
        S.dev = { dispose: () => { try { d.disconnect(); ws.disconnect(); } catch (e) { } }, retime: () => { d.delayTime.setTargetAtTime(Math.min(3.9, 60 / bpm() * settings.sendA.time), ctx.currentTime, 0.05); fb.gain.value = settings.sendA.fb; } };
      } else {
        const st = settings.sendB;
        const dev = st.type === 'shimmer' ? new OS.Device(ctx, 'fx.shimmer', { values: { mix: 1, size: 5, shimmer: 0.5 } }) : new OS.Device(ctx, 'fx.reverb', { values: { mix: 1, algo: st.type === 'spring' ? 4 : 2, size: st.type === 'spring' ? 2 : 4.5, decay: 2.5 } });
        S.band.connect(dev.in); dev.out.connect(S.ret); S.dev = dev;
      }
      S.setBand((which === 'a' ? settings.sendA : settings.sendB).band);
      S.ret.gain.value = (which === 'a' ? settings.sendA : settings.sendB).ret;
    };
    S.build();
    return S;
  }
  function sendUI() {
    const A = settings.sendA, B = settings.sendB, sa = DJ.sends.a, sb = DJ.sends.b;
    const bandSel = (st, S) => el('select', { onchange: e => { st.band = e.target.value; S.setBand(st.band); saveSettings(); } }, BANDS.map(([v, l]) => el('option', { value: v, selected: v === st.band }, l)));
    return el('div', { class: 'send-fx' },
      el('div', { class: 'row' }, el('b', null, 'Send A · Dub Delay'), bandSel(A, sa),
        el('select', { onchange: e => { A.time = +e.target.value; saveSettings(); sa.dev.retime(); } }, [[0.25, '1/16'], [0.5, '1/8'], [0.75, '3/16 (dub)'], [1, '1/4'], [1.5, '3/8']].map(([v, l]) => el('option', { value: v, selected: v === A.time }, l))),
        U.knob({ label: 'Geri Besleme', size: 28, min: 0, max: 0.9, def: 0.55, value: A.fb, fmt: v => Math.round(v * 100) + '%', onchange: v => { A.fb = v; saveSettings(); sa.dev.retime(); } }),
        U.knob({ label: 'Dönüş', size: 28, min: 0, max: 1.5, def: 0.8, value: A.ret, fmt: v => Math.round(v * 100) + '%', onchange: v => { A.ret = v; sa.ret.gain.value = v; saveSettings(); } })),
      el('div', { class: 'row' }, el('b', null, 'Send B'),
        el('select', { onchange: e => { B.type = e.target.value; saveSettings(); sb.build(); } }, [['shimmer', 'Lush Shimmer Reverb'], ['spring', 'Spring Reverb'], ['hall', 'Hall Reverb']].map(([v, l]) => el('option', { value: v, selected: v === B.type }, l))),
        bandSel(B, sb),
        U.knob({ label: 'Dönüş', size: 28, min: 0, max: 1.5, def: 0.8, value: B.ret, fmt: v => Math.round(v * 100) + '%', onchange: v => { B.ret = v; sb.ret.gain.value = v; saveSettings(); } })));
  }

  // Kulaklık (cue) çıkış modları: kapalı / bölünmüş stereo / 4 kanallı ses kartı (çıkış 3-4)
  function setMasterFx(id) {
    const m = DJ.mfx;
    try { master.disconnect(); } catch (e) { }
    if (m.dev) { m.dev.dispose(); m.dev = null; }
    m.id = id;
    if (id) { m.dev = new OS.Device(E.ctx, id); if (id === 'fx.delay') m.dev.setParam('fb', 0.45); master.connect(m.dev.in); m.dev.out.connect(master.limit); setMasterFxAmt(m.amt); }
    else master.connect(master.limit);
  }
  function setMasterFxAmt(v) {
    const m = DJ.mfx; m.amt = v; const f = FX.find(x => x[0] === m.id);
    if (!m.dev || !f) return;
    m.dev.setParam(f[2], f[2] === 'semi' ? Math.round(v * 24 - 12) : v);
    if (m.id === 'fx.delay') m.dev.setParam('sync', 7);
  }
  function applyOut() {
    const ctx = E.ctx;
    [masterOut, cueBus, outMerger].forEach(n => { if (n) try { n.disconnect(); } catch (e) { } });
    masterOut.connect(master.an); masterOut.connect(DJ.cueMaster); DJ.cueMaster.connect(cueBus);
    DJ.cueMaster.gain.value = settings.cueMix;
    DJ.decks.forEach(d => d.cueTap.gain.value = d.cueOn ? 1 - settings.cueMix * 0.5 : 0);
    const mode = settings.cueMode;
    if (mode === 'split') {
      outMerger = ctx.createChannelMerger(2);
      const mm = ctx.createGain(), cm = ctx.createGain();
      mm.channelCount = cm.channelCount = 1; mm.channelCountMode = cm.channelCountMode = 'explicit'; cm.gain.value = settings.cueVol;
      masterOut.connect(mm); cueBus.connect(cm); mm.connect(outMerger, 0, 0); cm.connect(outMerger, 0, 1);
      outMerger.connect(ctx.destination);
    } else if (mode === 'quad' && ctx.destination.maxChannelCount >= 4) {
      ctx.destination.channelCount = 4; ctx.destination.channelInterpretation = 'discrete';
      outMerger = ctx.createChannelMerger(4);
      const sp = ctx.createChannelSplitter(2), sm = ctx.createChannelSplitter(2), cg = ctx.createGain(); cg.gain.value = settings.cueVol;
      masterOut.connect(sm); sm.connect(outMerger, 0, 0); sm.connect(outMerger, 1, 1);
      cueBus.connect(cg); cg.connect(sp); sp.connect(outMerger, 0, 2); sp.connect(outMerger, 1, 3);
      outMerger.connect(ctx.destination);
    } else {
      if (mode === 'quad') U.toast('Ses çıkışınız 4 kanal desteklemiyor (' + ctx.destination.maxChannelCount + ' kanal)');
      masterOut.connect(E.monitorBus);
    }
  }
  // Fader eğrisi: doğrusal, döner mikser (logaritmik) ya da hızlı kesme (scratch)
  function faderGain(v) {
    if (settings.faderCurve === 'rotary') return v <= 0.001 ? 0 : U.dbToGain(-60 * Math.pow(1 - v, 1.6));
    if (settings.faderCurve === 'fast') return Math.min(1, v * 3);
    return v;
  }
  function applyX() {
    const x = DJ.xfade;
    let a, b;
    if (DJ.curve === 1) { a = x < 0.95 ? 1 : (1 - x) / 0.05; b = x > 0.05 ? 1 : x / 0.05; }
    else { a = Math.cos(x * Math.PI / 2); b = Math.sin(x * Math.PI / 2); }
    DJ.decks.forEach(d => d.xf.gain.value = d.xAssign === 'A' ? a : d.xAssign === 'B' ? b : 1);
  }

  // ---------------- Sampler pedleri ----------------
  const PAD_TRIG = [['one', 'Aç/Kapa'], ['stutter', 'Stutter'], ['hold', 'Basılı tut'], ['loop', 'Döngü'], ['unmute', 'Unmute']];
  const blankBank = n => ({ name: n, list: Array.from({ length: 16 }, (_, i) => ({ i, name: '', buffer: null, src: null, g: null, mode: 'one', data: null })) });
  function createPads(ctx) {
    const out = ctx.createGain(); out.connect(master); out.gain.value = 0.8;
    const pads = { out, banks: [blankBank('Banka 1')], bank: 0, get list() { return this.banks[this.bank].list; } };
    const persist = () => OS.store.put('kv', 'djpads', { banks: pads.banks.map(b => ({ name: b.name, pads: b.list.map(p => p.buffer ? { name: p.name, data: p.data, mode: p.mode } : null) })) }).catch(() => { });
    pads.persist = persist;
    pads.newBank = n => { pads.banks.push(blankBank(n)); pads.bank = pads.banks.length - 1; persist(); };
    OS.store.get('kv', 'djpads').then(saved => {
      if (!saved) return;
      const bs = Array.isArray(saved) ? [{ name: 'Banka 1', pads: saved }] : saved.banks; // eski biçim tek bankaydı
      pads.banks = bs.map(b => blankBank(b.name));
      bs.forEach((b, bi) => (b.pads || []).forEach((p, i) => { if (p && p.data && i < 16) ctx.decodeAudioData(U.b64ToAb(p.data)).then(buf => { Object.assign(pads.banks[bi].list[i], { buffer: buf, name: p.name, data: p.data, mode: p.mode || 'one' }); DJ.renderPads && DJ.renderPads(); }).catch(() => { }); }));
      DJ.renderPads && DJ.renderPads();
    }).catch(() => { });
    const stopPad = p => { if (p.src) { try { p.src.stop(); } catch (e) { } p.src = null; p.g = null; } };
    const startPad = (p, muted) => {
      const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = muted ? 0 : 1;
      s.buffer = p.buffer; s.loop = p.mode === 'loop' || p.mode === 'unmute'; s.connect(g); g.connect(out); s.start();
      p.src = s; p.g = g; s.onended = () => { if (p.src === s) { p.src = null; p.g = null; } DJ.renderPads && DJ.renderPads(); };
    };
    pads.trigger = i => {
      const p = pads.list[i]; if (!p.buffer) return;
      E.resume();
      if (p.mode === 'stutter') { stopPad(p); startPad(p); }
      else if (p.mode === 'unmute') { if (!p.src) startPad(p, true); p.g.gain.setTargetAtTime(1, ctx.currentTime, 0.005); }
      else if (p.mode === 'hold') { stopPad(p); startPad(p); }
      else if (p.src) stopPad(p);
      else startPad(p);
      DJ.renderPads && DJ.renderPads();
    };
    pads.release = i => {
      const p = pads.list[i];
      if (p.mode === 'hold') stopPad(p);
      else if (p.mode === 'unmute' && p.g) p.g.gain.setTargetAtTime(0, ctx.currentTime, 0.005);
      DJ.renderPads && DJ.renderPads();
    };
    pads.setBuffer = async (i, buf, name, ab) => {
      const p = pads.list[i]; stopPad(p); p.buffer = buf; p.name = name; p.data = U.abToB64(ab); persist();
    };
    pads.load = async (i, f) => {
      const ab = await U.readAsArrayBuffer(f);
      await pads.setBuffer(i, await ctx.decodeAudioData(ab.slice(0)), f.name.replace(/\.[^.]+$/, ''), ab);
    };
    pads.clear = i => { const p = pads.list[i]; stopPad(p); p.buffer = null; p.name = ''; p.data = null; persist(); };
    pads.setOut = v => { try { out.disconnect(); } catch (e) { } const d = DJ.decks[LETTERS.indexOf(v)]; out.connect(d ? d.trim : master); pads.outTo = v; };
    // Canlı kayıt: kaynaktan N vuruş alıp ilk boş pede koyar
    pads.record = (src, beats, done) => {
      const dk = DJ.decks.find(x => x.playing && x.bpm) || DJ.decks[0], sec = beats * 60 / ((dk.bpm || 120) * dk.eff);
      const node = src === 'master' ? master : DJ.decks[LETTERS.indexOf(src)].fader;
      const i = pads.list.findIndex(p => !p.buffer); if (i < 0) { U.toast(OS.t('Bu bankada boş ped yok')); done(); return; }
      const sp = ctx.createScriptProcessor(4096, 2, 2), sil = ctx.createGain(); sil.gain.value = 0;
      const need = Math.ceil(sec * ctx.sampleRate), L = new Float32Array(need), R = new Float32Array(need); let o = 0;
      sp.onaudioprocess = e => {
        if (o >= need) return;
        const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.getChannelData(1), n = Math.min(a.length, need - o);
        L.set(a.subarray(0, n), o); R.set(b.subarray(0, n), o); o += n;
        if (o >= need) {
          setTimeout(async () => {
            try { node.disconnect(sp); } catch (er) { } sp.disconnect(); sil.disconnect();
            const b2 = ctx.createBuffer(2, need, ctx.sampleRate); b2.copyToChannel(L, 0); b2.copyToChannel(R, 1);
            await pads.setBuffer(i, b2, OS.t('Kayıt') + ' ' + beats, await U.bufferToWav(b2, 16).arrayBuffer());
            pads.list[i].mode = 'loop'; persist(); done(); DJ.renderPads();
          }, 0);
        }
      };
      node.connect(sp); sp.connect(sil); sil.connect(ctx.destination);
    };
    return pads;
  }

  DJ._fn = { bandPeaks: (...a) => bandPeaks(...a), trailingEnd: (...a) => trailingEnd(...a), measureLevel: (...a) => measureLevel(...a) };
  DJ.init = function () { root = document.getElementById('view-dj'); OS.midiHooks = OS.midiHooks || []; OS.midiHooks.push(onMidi); };

  // ---------------- Arayüz ----------------
  const infoEls = [];
  let infoQueued = false;
  DJ.renderInfo = function () { if (infoQueued) return; infoQueued = true; requestAnimationFrame(() => { infoQueued = false; infoEls.forEach(f => f()); }); };

  function topBar() {
    const n = settings.count;
    return el('div', { class: 'toolbar dj-bar' },
      el('label', null, 'Deck sayısı', el('select', { onchange: e => { settings.count = +e.target.value; saveSettings(); DJ.render(); } }, [2, 4].map(k => el('option', { value: k, selected: k === n }, k)))),
      el('label', null, 'Kulaklık (cue) çıkışı', el('select', { onchange: e => { settings.cueMode = e.target.value; saveSettings(); applyOut(); } },
        [['off', 'Kapalı'], ['split', 'Bölünmüş: Sol=master, Sağ=kulaklık'], ['quad', '4 kanallı kart: çıkış 3-4']].map(([v, l]) => el('option', { value: v, selected: v === settings.cueMode }, l)))),
      U.knob({ label: 'Cue/Master', size: 30, min: 0, max: 1, def: 0.5, value: settings.cueMix, fmt: v => Math.round(v * 100) + '%', onchange: v => { settings.cueMix = v; saveSettings(); applyOut(); } }),
      U.knob({ label: 'Kulaklık', size: 30, min: 0, max: 1.5, def: 0.8, value: settings.cueVol, fmt: v => Math.round(v * 100) + '%', onchange: v => { settings.cueVol = v; saveSettings(); applyOut(); } }),
      el('button', { class: 'btn sm' + (settings.quantize ? ' on' : ''), title: 'Cue, döngü ve beat jump vuruşa oturur', onclick: e => { settings.quantize = !settings.quantize; e.target.classList.toggle('on', settings.quantize); saveSettings(); } }, 'Quantize'),
      el('button', { class: 'btn sm' + (settings.slip ? ' on' : ''), title: 'Döngüden çıkınca parça, döngü hiç olmamış gibi kaldığı yerden devam eder', onclick: e => { settings.slip = !settings.slip; e.target.classList.toggle('on', settings.slip); saveSettings(); } }, 'Slip'),
      el('button', { class: 'btn sm' + (settings.vinyl ? ' on' : ''), title: 'Jog’a dokununca plak elinizi izler: scratch (controller’daki jog dokunma eşlenmeli)', onclick: e => { settings.vinyl = !settings.vinyl; e.target.classList.toggle('on', settings.vinyl); saveSettings(); } }, 'Vinyl'),
      el('button', { class: 'btn sm' + (settings.led ? ' on' : ''), title: 'Controller’daki düğme ışıklarını (play, cue, hot cue, döngü, stem) yakar', onclick: e => { settings.led = !settings.led; e.target.classList.toggle('on', settings.led); saveSettings(); } }, 'LED'),
      el('button', { class: 'btn sm' + (settings.autoStems ? ' on' : ''), title: 'Yüklenen her parça otomatik olarak stem’lere ayrılır (birkaç saniye sürer)', onclick: e => { settings.autoStems = !settings.autoStems; e.target.classList.toggle('on', settings.autoStems); saveSettings(); } }, 'Otomatik stem'),
      el('button', { class: 'btn sm' + (settings.beatStart ? ' on' : ''), title: 'PLAY, çalan deckin bir sonraki vuruşunda ve kendi vuruşundan başlar', onclick: e => { settings.beatStart = !settings.beatStart; e.target.classList.toggle('on', settings.beatStart); saveSettings(); } }, 'Vuruşa başlat'),
      el('button', { class: 'btn sm' + (settings.levelMatch ? ' on' : ''), title: 'Parçaların ses seviyesini birbirine yaklaştırır', onclick: e => { settings.levelMatch = !settings.levelMatch; e.target.classList.toggle('on', settings.levelMatch); saveSettings(); DJ.decks.forEach(d => d.applyLevel()); } }, 'Seviye eşitle'),
      el('button', { class: 'btn sm' + (DJ.shift ? ' on' : ''), title: 'Pedlerin ikinci işlevi (dokunmatik için)', onclick: e => { DJ.shift = !DJ.shift; e.target.classList.toggle('on', DJ.shift); } }, 'SHIFT'),
      el('span', { class: 'spacer' }),
      DJ.ctrl && DJ.ctrl.connected() ? el('button', { class: 'btn sm dev-chip', title: OS.t('Cihaz menüsü'), onclick: () => DJ.ctrl.open() }, '🎛 ' + DJ.ctrl.connected()) : null,
      el('button', { class: 'btn sm', title: OS.t('Tam ekran dokunmatik DJ kontrolcüsü'), onclick: () => DJ.touch.enter() }, '⛶ ' + OS.t('Dokunmatik Kontrolcü')),
      el('button', { class: 'btn sm primary', onclick: () => DJ.ctrl.open() }, 'Controller Merkezi'));
  }

  DJ.render = function () {
    build();
    root.innerHTML = ''; infoEls.length = 0; learnEls.clear();
    if (DJ.touch && DJ.touch.on) { DJ.touch.render(root); if (!DJ._raf) { DJ._raf = true; requestAnimationFrame(frame); } return; }
    const n = settings.count, decks = DJ.decks.slice(0, n);
    const top = topBar();
    root.appendChild(top);
    if (DJ.learn) root.appendChild(el('div', { class: 'learn-hint' }, el('button', { class: 'btn sm primary', style: 'margin-right:8px', onclick: () => { DJ.learn = false; DJ.pending = null; DJ.render(); } }, 'Bitir'), 'MIDI öğrenme: önce ekranda bir kontrole tıklayın (yanıp söner), sonra controller’ınızda ilgili düğmeye / knob’a / fader’a dokunun. Tüm markaların MIDI controller’ları bu yolla eşlenebilir.'));
    const mix = mixerUI(decks);
    const wrap = el('div', { class: 'dj-wrap' + (n === 4 ? ' four' : '') });
    if (n === 2) wrap.append(deckUI(decks[0]), mix, deckUI(decks[1]));
    else { wrap.append(deckUI(decks[0]), mix, deckUI(decks[1]), deckUI(decks[2]), deckUI(decks[3])); }
    root.appendChild(wrap);
    root.appendChild(padsUI());
    root.appendChild(DJ.lib.ui());
    root.appendChild(el('div', { class: 'dj-bottom' }, DJ.auto.ui(), DJ.hist.ui()));
    root.appendChild(DJ.video.ui());
    root.appendChild(DJ.touch.extras());
    root.appendChild(el('div', { class: 'muted' }, 'İpucu: Parçaları decklere sürükleyip bırakın. Boşluk = Deck A, Enter = Deck B çal/duraklat. Key lock açıkken tempo değişse de perde korunur.'));
    if (!DJ._raf) { DJ._raf = true; requestAnimationFrame(frame); }
  };

  // MIDI öğrenilebilir kontroller
  const learnEls = new Map();
  function learnable(elx, action) {
    learnEls.set(action, elx);
    elx.dataset.learn = action;
    if (DJ.learn) {
      elx.classList.add('learnable');
      if (settings.map && Object.values(settings.map).includes(action)) elx.classList.add('mapped');
      elx.addEventListener('mousedown', e => { if (!DJ.learn) return; e.preventDefault(); e.stopPropagation(); learnEls.forEach(x => x.classList.remove('pending')); DJ.pending = action; elx.classList.add('pending'); }, true);
    }
    return elx;
  }

  function deckUI(d) {
    const A = d.L;
    const name = el('div', { class: 'dname' }), bpm = el('b'), key = el('b'), time = el('b'), rem = el('span'), pitchLbl = el('span', { class: 'mono' });
    const ov = el('canvas', { class: 'wave ov' }), wv = el('canvas', { class: 'wave' });
    const playB = learnable(el('button', { class: 'btn big', onclick: () => { d.toggle(); upd(); } }, '▶'), `${A}.play`);
    const cueB = learnable(el('button', { class: 'btn big', onmousedown: () => { if (DJ.learn) return; d.cueBtn(); upd(); }, onmouseup: () => { d.cueUp(); upd(); }, onmouseleave: () => { d.cueUp(); upd(); } }, 'CUE'), `${A}.cue`);
    const syncB = learnable(el('button', { class: 'btn', onclick: () => { const o = otherDeck(d); if (o && d.sync(o)) { pitch.value = U.clamp((d.rate - 1) / d.range, -1, 1); upd(); } } }, 'SYNC'), `${A}.sync`);
    const klB = learnable(el('button', { class: 'btn sm', title: 'Tempo değişince perdeyi koru', onclick: () => { d.setKeyLock(!d.keylock); upd(); } }, 'KEY LOCK'), `${A}.keylock`);
    const hpB = learnable(el('button', { class: 'btn sm', title: 'Kulaklıkta dinle', onclick: () => { d.setCue(!d.cueOn); applyOut(); upd(); } }, '🎧 CUE'), `${A}.headcue`);
    const hot = el('div', { class: 'hot pads8' }), loops = el('div', { class: 'ctl' }), stemRow = el('div', { class: 'ctl stems' }), keyRow = el('div', { class: 'ctl' });
    const jog = el('div', { class: 'jog' }, el('div', { class: 'mark' })); d.jogEl = jog.firstChild;
    learnable(jog, `${A}.jog`);
    const touchB = learnable(el('button', { class: 'btn sm jog-touch', title: OS.t('Jog dokunma (controller’daki jog üst yüzeyi)') }, '✋'), `${A}.jogtouch`);
    const pitch = learnable(el('input', { type: 'range', min: -1, max: 1, step: 0.001, value: (d.rate - 1) / d.range, oninput: e => { d.setRate(1 + (+e.target.value) * d.range); upd(); }, ondblclick: e => { e.target.value = 0; d.setRate(1); upd(); } }), `${A}.pitch`);
    d.pitchEl = pitch;
    const rangeSel = el('select', { onchange: () => { d.range = +rangeSel.value; d.setRate(1 + (+pitch.value) * d.range); upd(); } }, [['0.06', '±6%'], ['0.08', '±8%'], ['0.16', '±16%'], ['0.5', '±50%']].map(([v, l]) => el('option', { value: v, selected: +v === d.range }, l)));
    const jumpSel = el('select', { onchange: e => { settings.jump = +e.target.value; saveSettings(); } }, [1, 4, 8, 16, 32].map(v => el('option', { value: v, selected: v === settings.jump }, v + ' vuruş')));
    const xSel = el('select', { title: 'Crossfader ataması', onchange: e => { d.xAssign = e.target.value; applyX(); } }, [['A', 'X: A'], ['T', 'X: Thru'], ['B', 'X: B']].map(([v, l]) => el('option', { value: v, selected: v === d.xAssign }, l)));
    function upd() {
      name.textContent = d.name;
      bpm.textContent = d.bpm ? (d.bpm * d.rate).toFixed(1) : '--.-';
      key.textContent = (d.shownKey || '–') + (d.keyShift ? ' (' + (d.keyShift > 0 ? '+' : '') + d.keyShift + ')' : '');
      pitchLbl.textContent = ((d.rate - 1) * 100 >= 0 ? '+' : '') + ((d.rate - 1) * 100).toFixed(2) + '%';
      playB.textContent = d.playing ? '❚❚' : '▶'; playB.classList.toggle('on', d.playing);
      klB.classList.toggle('on', d.keylock); hpB.classList.toggle('on', d.cueOn);
      hot.innerHTML = '';
      const modeSel = el('select', { class: 'pad-mode', onchange: e => { d.padMode = e.target.value; upd(); } }, PAD_MODES.map(([v, l]) => el('option', { value: v, selected: v === (d.padMode || 'hot') }, l)));
      hot.appendChild(modeSel);
      for (let i = 0; i < 8; i++) {
        const b = learnable(el('button', { class: 'btn pad-btn ' + padClass(d, i), title: padTitle(d) }, padLabel(d, i)), `${A}.hot${i + 1}`);
        b.addEventListener('mousedown', e => { if (DJ.learn) return; e.preventDefault(); padPress(d, i, e.shiftKey || DJ.shift); upd(); const up = () => { removeEventListener('mouseup', up); padRelease(d, i); upd(); }; addEventListener('mouseup', up); });
        hot.appendChild(b);
      }
      keyRow.innerHTML = '';
      keyRow.append(el('span', { class: 'muted' }, OS.t('Ton')),
        learnable(el('button', { class: 'btn sm', onclick: () => { d.setKeyShift((d.keyShift || 0) - 1); upd(); } }, '−'), `${A}.keydown`),
        el('span', { class: 'mono' }, ((d.keyShift || 0) > 0 ? '+' : '') + (d.keyShift || 0)),
        learnable(el('button', { class: 'btn sm', onclick: () => { d.setKeyShift((d.keyShift || 0) + 1); upd(); } }, '+'), `${A}.keyup`),
        el('button', { class: 'btn sm', title: OS.t('Diğer deckin tonuna eşitle'), onclick: () => { keyMatch(d); upd(); } }, 'Key Match'),
        el('button', { class: 'btn sm', onclick: () => { d.setKeyShift(0); upd(); } }, '0'));
      stemRow.innerHTML = '';
      if (d.stems) STEMS.forEach(k => stemRow.appendChild(el('div', { class: 'stem-cell' },
        learnable(el('button', { class: 'btn sm stem-btn' + (d.stemG[k].gain.value > 0.5 ? ' on' : ''), title: OS.t('Stem aç/kapat'), onclick: () => { if (DJ.learn) return; d.toggleStem(k); upd(); } }, OS.t(STEM_LBL[k])), `${A}.stem_${k}`),
        learnable(U.knob({ label: OS.t('Seviye'), size: 22, min: 0, max: 1.5, def: 1, value: d.stemL[k].gain.value, fmt: v => Math.round(v * 100) + '%', onchange: v => d.stemL[k].gain.value = v }), `${A}.stemlvl_${k}`),
        learnable(U.knob({ label: 'FX A', size: 22, min: 0, max: 1, def: 0, value: d.stemFx[k].gain.value, fmt: v => Math.round(v * 100) + '%', onchange: v => d.stemFx[k].gain.value = v }), `${A}.stemfx_${k}`))));
      else if (d.stemProg != null) stemRow.appendChild(el('span', { class: 'muted' }, OS.t('Stem’ler hazırlanıyor') + ' %' + Math.round(d.stemProg * 100)));
      else if (d.buffer) stemRow.appendChild(el('button', { class: 'btn sm', onclick: () => d.makeStems() }, OS.t('Stem’leri ayır (vokal/davul/bas/melodi)')));
      loops.innerHTML = '';
      loops.appendChild(el('span', { class: 'muted' }, 'Döngü'));
      [0.25, 0.5, 1, 2, 4, 8, 16, 32].forEach(k => loops.appendChild(learnable(el('button', { class: 'btn sm' + (d.loop && d.loop.beats === k ? ' on' : ''), onclick: () => { if (DJ.learn) return; d.setLoop(k); upd(); } }, k < 1 ? '1/' + (1 / k) : String(k)), `${A}.loop${k}`)));
      if (d.loop) loops.appendChild(el('button', { class: 'btn sm', onclick: () => { d.setLoop(0); upd(); } }, 'Çık'));
    }
    infoEls.push(upd);
    d.draw = () => {
      const p = d.position(), dur = d.buffer ? d.buffer.duration : 0;
      time.textContent = U.fmtTime(p).slice(0, 7); rem.textContent = '-' + U.fmtTime(Math.max(0, dur - p)).slice(0, 7);
      drawOverview(ov, d, p); drawZoom(wv, d, p);
      d.jogEl.style.transform = `rotate(${(p * 33.3 / 60 * 360) % 360}deg)`;
    };
    ov.addEventListener('mousedown', e => { if (!d.buffer) return; const r = ov.getBoundingClientRect(); d.seek((e.clientX - r.left) / r.width * d.buffer.duration); upd(); });
    DJ.touch.bindJog(jog, d);
    const fxSlot = i => {
      const nm = i ? `${A}.fx${i + 1}` : `${A}.fx`;
      const k = learnable(U.knob({ label: 'FX ' + (i + 1), size: 28, min: 0, max: 1, def: 0.5, value: d.fx[i].amt, fmt: v => Math.round(v * 100) + '%', onchange: v => d.setFxAmt(v, i) }), nm);
      d['fxKnob' + i] = k;
      return el('div', { class: 'fx-slot' }, el('select', { onchange: e => d.setFx(e.target.value, i) }, FX.map(([id, l]) => el('option', { value: id, selected: id === d.fx[i].id }, l))), k);
    };
    const box = el('div', { class: 'deck deck-' + A },
      el('div', { class: 'dtitle' }, el('b', { class: 'dletter' }, A), name, xSel,
        el('button', { class: 'btn sm', onclick: async () => { const [f] = await U.pickFiles('audio/*,video/*'); if (f) { U.toast('Yükleniyor…'); await d.load(f); upd(); } } }, 'Yükle…')),
      ov, wv,
      el('div', { class: 'info' }, el('span', null, 'BPM ', bpm), el('span', null, 'Tonalite ', key), el('span', null, time), rem, el('span', null, 'Pitch ', pitchLbl)),
      el('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap' }, el('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:4px' }, jog, touchB),
        el('div', { style: 'flex:1;display:flex;flex-direction:column;gap:6px;min-width:0' },
          el('div', { class: 'ctl' }, cueB, playB, syncB, klB, hpB),
          stemRow, keyRow,
          el('div', { class: 'ctl' },
            learnable(el('button', { class: 'btn sm', title: 'Geri atla', onclick: () => d.jump(-settings.jump) }, '◀◀'), `${A}.jumpback`), jumpSel,
            learnable(el('button', { class: 'btn sm', title: 'İleri atla', onclick: () => d.jump(settings.jump) }, '▶▶'), `${A}.jumpfwd`),
            el('button', { class: 'btn sm', title: 'Basılı tut: yavaşlat', onmousedown: () => d.setNudge(-0.04), onmouseup: () => d.setNudge(0), onmouseleave: () => d.setNudge(0) }, '−'),
            el('button', { class: 'btn sm', title: 'Basılı tut: hızlandır', onmousedown: () => d.setNudge(0.04), onmouseup: () => d.setNudge(0), onmouseleave: () => d.setNudge(0) }, '+'),
            el('button', { class: 'btn sm', title: 'BPM elle gir', onclick: async () => { const v = await U.prompt('Parçanın orijinal BPM değeri', d.bpm); if (v && +v > 0) { d.bpm = +v; d.grid = U.detectBeatOffset(d.buffer, d.bpm); upd(); } } }, 'BPM…'),
            el('button', { class: 'btn sm', title: 'BPM yarıya/iki katına', onclick: () => { if (d.bpm) { d.bpm = d.bpm > 120 ? d.bpm / 2 : d.bpm * 2; upd(); } } }, '×2 / ÷2')),
          el('div', { class: 'pitch' }, el('span', { class: 'muted' }, 'Tempo'), pitch, rangeSel),
          el('div', { class: 'ctl fx-slots' }, fxSlot(0), fxSlot(1), fxSlot(2)),
          el('div', { class: 'ctl' },
            learnable(el('button', { class: 'btn sm', title: 'Plak gibi yavaşlayarak durur', onclick: () => { d.brake(); upd(); } }, 'Fren'), `${A}.brake`),
            learnable(el('button', { class: 'btn sm', title: 'Plağı geri çevirip durdurur', onclick: () => { d.spinback(); upd(); } }, 'Spinback'), `${A}.spin`),
            learnable(el('button', { class: 'btn sm' + (d.rev ? ' on' : ''), title: 'Parçayı tersten çalar', onclick: e => { d.setReverse(!d.rev); e.target.classList.toggle('on', d.rev); upd(); } }, 'Ters'), `${A}.reverse`),
            learnable(el('button', { class: 'btn sm', title: 'Vuruşa tıklayın: en az 4 tıkla BPM ölçülür', onclick: () => { d.tap(); upd(); } }, 'TAP'), `${A}.tap`),
            el('span', { class: 'muted' }, OS.t('Izgara')),
            el('button', { class: 'btn sm', title: 'Beat grid 10 ms geri', onclick: () => d.shiftGrid(-10) }, '◂'),
            el('button', { class: 'btn sm', title: 'Beat grid 10 ms ileri', onclick: () => d.shiftGrid(10) }, '▸'),
            el('button', { class: 'btn sm', title: 'Şu anki konumu 1. vuruş yap', onclick: () => d.setDownbeat() }, '1.')),
          loops)),
      hot);
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drop-hint'); });
    box.addEventListener('dragleave', () => box.classList.remove('drop-hint'));
    box.addEventListener('drop', async e => { e.preventDefault(); box.classList.remove('drop-hint'); const f = e.dataTransfer.files[0]; if (f) { U.toast('Yükleniyor…'); await d.load(f); upd(); } });
    upd();
    return box;
  }
  // ---------------- Ped modları ----------------
  const PAD_MODES = [['hot', 'Hot Cue'], ['roll', 'Loop Roll'], ['slicer', 'Slicer'], ['jump', 'Beat Jump'], ['cueloop', 'Cue Loop'], ['keycue', 'Key Cue'], ['stems', 'Stem'], ['manual', 'Manuel Döngü'], ['hot2', 'Hot Cue 9-16'], ['loop2', 'Döngü+ (1/32-128)'], ['saved', 'Kayıtlı Döngü'], ['remix', 'Remix Noktaları'], ['scratch', 'Scratch'], ['stemfx', 'Stem + FX']];
  const ROLLS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8], JUMPS = [-16, -8, -4, -1, 1, 4, 8, 16], LOOPS = [0.25, 0.5, 1, 2, 4, 8, 16, 32], KEYS = [-3, -2, -1, 0, 1, 2, 3, 4];
  const STEM_PADS = [['vocals'], ['drums'], ['bass'], ['melody'], ['only', 'vocals'], ['only', 'melody'], ['only', 'drums'], ['all']];
  const LOOPS2 = [1 / 32, 1 / 16, 1 / 8, 3 / 4, 1.5, 3, 64, 128];
  const STEM_FX = [['vocals', 'a'], ['vocals', 'b'], ['melody', 'a'], ['melody', 'b'], ['drums', 'a'], ['drums', 'b'], ['bass', 'a'], ['bass', 'b']];
  // Scratch kalıpları: [yön, vuruş, hız, kapı]
  const rpt = (a, n) => [].concat(...Array(n).fill(a));
  const SCRATCH = [
    ['Baby', rpt([[1, 0.25, 1.2], [-1, 0.25, 1.2]], 2)],
    ['Forward', rpt([[1, 0.25, 1.4], [-1, 0.25, 1.4, 0]], 2)],
    ['Transformer', rpt([[1, 0.125, 0.8], [1, 0.125, 0.8, 0]], 4)],
    ['Chirp', rpt([[1, 0.25, 1.6], [-1, 0.25, 1.6, 0.35]], 2)],
    ['Drag', [[-1, 1, 0.25], [1, 1, 0.25]]],
    ['Tear', rpt([[1, 0.125, 1], [1, 0.125, 0.6], [-1, 0.25, 1]], 2)],
    ['Stab', rpt([[1, 0.0625, 2], [1, 0.4375, 1, 0]], 2)],
    ['Hydroplane', rpt([[1, 0.0625, 1.1], [-1, 0.0625, 1.1]], 8)],
  ];
  // Ana parça sessizce akmaya devam eder; kalıp bitince aynı yerden duyulur
  function playScratch(d, i) {
    const pat = SCRATCH[i][1], ctx = d.ctx, sp = d.beat / d.eff;
    let t = ctx.currentTime + 0.01, p = d.snap(d.position());
    const t0 = t, bus = ctx.createGain(); bus.connect(d.trim);
    pat.forEach(([dir, beats, speed, gate]) => {
      const len = beats * sp, b = dir > 0 ? d.buffer : d.revBuf(), x = ctx.createBufferSource(), g = ctx.createGain(), lvl = gate == null ? 1 : gate;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + 0.003); g.gain.setValueAtTime(lvl, t + Math.max(0.004, len - 0.003)); g.gain.linearRampToValueAtTime(0, t + len);
      x.buffer = b; x.playbackRate.value = speed; x.connect(g); g.connect(bus);
      x.start(t, U.clamp(dir > 0 ? p : b.duration - p, 0, b.duration - 0.001)); x.stop(t + len + 0.01);
      p += dir * speed * len; t += len;
    });
    d.pre.gain.setTargetAtTime(0, t0, 0.004); d.pre.gain.setTargetAtTime(1, t, 0.004);
    setTimeout(() => { try { bus.disconnect(); } catch (e) { } }, (t - t0) * 1000 + 300);
  }
  // Remix noktaları: ölçü enerjisinin en çok değiştiği 8 bölüm başı
  function remixPoints(d) {
    if (d.remix) return d.remix;
    const b = d.buffer, a = b.getChannelData(0), bar = 4 * d.beat, n = Math.floor((b.duration - d.grid) / bar), E2 = [];
    for (let k = 0; k < n; k++) { const i0 = Math.floor((d.grid + k * bar) * b.sampleRate), i1 = Math.min(a.length, Math.floor((d.grid + (k + 1) * bar) * b.sampleRate)); let e = 0; for (let i = i0; i < i1; i += 64) e += a[i] * a[i]; E2.push(Math.sqrt(e / Math.max(1, (i1 - i0) / 64))); }
    const cand = E2.map((e, k) => ({ k, s: k ? Math.abs(e - E2[k - 1]) : 1 })).sort((x, y) => y.s - x.s), pick = [];
    cand.forEach(c => { if (pick.length < 8 && pick.every(q => Math.abs(q - c.k) >= 4)) pick.push(c.k); });
    d.remix = pick.sort((x, y) => x - y).map(k => d.grid + k * bar);
    return d.remix;
  }
  const fr = x => x < 1 ? (x === 0.75 ? '3/4' : '1/' + Math.round(1 / x)) : String(x);
  function padLabel(d, i) {
    switch (d.padMode || 'hot') {
      case 'roll': return fr(ROLLS[i]);
      case 'slicer': return String(i + 1);
      case 'jump': return (JUMPS[i] > 0 ? '+' : '') + JUMPS[i];
      case 'loop': return fr(LOOPS[i]);
      case 'keycue': return (KEYS[i] > 0 ? '+' : '') + KEYS[i];
      case 'stems': { const sp = STEM_PADS[i]; return sp[0] === 'all' ? OS.t('Hepsi') : sp[0] === 'only' ? OS.t('Sadece') + ' ' + OS.t(STEM_LBL[sp[1]]) : OS.t(STEM_LBL[sp[0]]); }
      case 'hot2': return String(i + 9);
      case 'loop2': return fr(LOOPS2[i]);
      case 'saved': return d.savedLoops[i] ? fr(d.savedLoops[i].beats) + ' ⟲' : '+';
      case 'remix': { const r = d.buffer && d.bpm ? remixPoints(d)[i] : null; return r != null ? U.fmtTime(r).slice(0, 5) : '—'; }
      case 'scratch': return SCRATCH[i][0];
      case 'stemfx': return OS.t(STEM_LBL[STEM_FX[i][0]]) + ' ' + (STEM_FX[i][1] === 'a' ? 'Echo' : 'Reverb');
      case 'manual': return ['IN', 'OUT', '½', '×2', '◀', '▶', OS.t('Aç/Kapa'), OS.t('Sil')][i];
      default: return String(i + 1);
    }
  }
  function padClass(d, i) {
    const m = d.padMode || 'hot';
    if ((m === 'hot' || m === 'cueloop') && d.hot[i] != null) return 'set';
    if (m === 'hot2' && d.hot[i + 8] != null) return 'set';
    if (m === 'loop2' && d.loop && d.loop.beats === LOOPS2[i]) return 'on';
    if (m === 'saved' && d.savedLoops[i]) return d.loop && d.loop.start === d.savedLoops[i].start ? 'on' : 'set';
    if (m === 'loop' && d.loop && d.loop.beats === LOOPS[i]) return 'on';
    if (m === 'roll' && d.roll && d.roll.i === i) return 'on';
    if (m === 'slicer' && d.slice === i) return 'on';
    if (m === 'keycue' && (d.keyShift || 0) === KEYS[i]) return 'on';
    if (m === 'stems' && d.stems && STEM_PADS[i][0] !== 'all' && STEM_PADS[i][0] !== 'only' && d.stemG[STEM_PADS[i][0]].gain.value > 0.5) return 'on';
    return '';
  }
  const padTitle = d => ({ hot: 'Tık: ayarla/atla • Shift+tık: sil', hot2: 'Tık: ayarla/atla • Shift+tık: sil', saved: 'Boş ped: aktif döngüyü kaydeder • Dolu ped: döngüyü aç/kapa • Shift+tık: sil', remix: 'Parçanın otomatik bulunan bölüm başlarına atlar', scratch: 'Hazır scratch kalıbını çalar; parça arkada akmaya devam eder', stemfx: 'Basılı tut: stem’i Send A (Echo) veya Send B (Reverb) efektine gönderir', roll: 'Basılı tut: döngüyü tekrarla (Shift: 3/4); bırakınca parça kaldığı yerden devam eder', slicer: 'Son ölçüyü 8 dilime böler; basılı tutulan dilim tekrarlanır', cueloop: 'Hot cue’ya atla ve 4 vuruşluk döngü kur', keycue: '1. hot cue’dan, seçilen tonda çal', manual: 'Döngü başı / sonu, yarıla / ikile, kaydır' })[d.padMode || 'hot'] || '';
  function padPress(d, i, shift) {
    const m = d.padMode || 'hot';
    if (!d.buffer) return;
    if (m === 'hot') hotCue(d, i, shift);
    else if (m === 'roll') { if (!d.roll) d.roll = { i, pos: d.position(), ctx: d.ctx.currentTime }; d.loop = null; const rb = ROLLS[i] * (shift ? 0.75 : 1), p = d.snap(d.position()), len = rb * d.beat; d.loop = { start: p, end: Math.min(d.buffer.duration, p + len), beats: rb }; d.roll.i = i; const was = d.playing; d.pause(); d.pos = p; if (was || true) d.play(); }
    else if (m === 'slicer') {
      if (d.sliceBase == null || !d.playing) d.sliceBase = d.grid + Math.floor((d.position() - d.grid) / (4 * d.beat)) * 4 * d.beat;
      if (!d.roll) d.roll = { i: -1, pos: d.position(), ctx: d.ctx.currentTime };
      const len = d.beat / 2, st = d.sliceBase + i * len; d.slice = i;
      d.loop = { start: st, end: st + len, beats: 0.5 }; d.pause(); d.pos = st; d.play();
    }
    else if (m === 'hot2') hotCue(d, i + 8, shift);
    else if (m === 'loop2') d.setLoop(LOOPS2[i]);
    else if (m === 'saved') {
      const sv = d.savedLoops[i], persist = () => { if (d.libId) DJ.lib.update(d.libId, { loops: d.savedLoops.slice() }); };
      if (shift) { d.savedLoops[i] = null; persist(); }
      else if (!sv) { if (d.loop) { d.savedLoops[i] = { start: d.loop.start, end: d.loop.end, beats: d.loop.beats }; persist(); } else U.toast(OS.t('Önce bir döngü kurun')); }
      else if (d.loop && d.loop.start === sv.start) d.setLoop(0);
      else { d.loop = Object.assign({}, sv); const was = d.playing; d.pause(); d.pos = sv.start; if (was) d.play(); }
    }
    else if (m === 'remix') { if (d.bpm) { const r = remixPoints(d)[i]; if (r != null) { d.seek(r); if (!d.playing) d.play(); } } }
    else if (m === 'scratch') playScratch(d, i);
    else if (m === 'stemfx') { if (!d.stems) { U.toast(OS.t('Önce stem’leri ayırın')); return; } const [k, w] = STEM_FX[i]; (w === 'a' ? d.stemFx : d.stemFxB)[k].gain.value = 0.8; }
    else if (m === 'jump') d.jump(JUMPS[i]);
    else if (m === 'loop') d.setLoop(LOOPS[i]);
    else if (m === 'cueloop') { if (d.hot[i] == null) d.hot[i] = d.snap(d.position()); d.loop = null; d.pause(); d.pos = d.hot[i]; d.loop = { start: d.hot[i], end: Math.min(d.buffer.duration, d.hot[i] + 4 * d.beat), beats: 4 }; d.play(); }
    else if (m === 'keycue') { d.setKeyShift(KEYS[i]); if (d.hot[0] != null) d.seek(d.hot[0]); if (!d.playing) d.play(); }
    else if (m === 'stems') {
      if (!d.stems) { U.toast(OS.t('Önce stem’leri ayırın')); return; }
      const sp = STEM_PADS[i];
      if (sp[0] === 'all') STEMS.forEach(k => d.stemG[k].gain.value = 1);
      else if (sp[0] === 'only') STEMS.forEach(k => d.stemG[k].gain.value = k === sp[1] ? 1 : 0);
      else d.toggleStem(sp[0]);
    }
    else if (m === 'manual') {
      const p = d.snap(d.position());
      if (i === 0) d.manIn = p;
      else if (i === 1 && d.manIn != null && p > d.manIn) { d.loop = { start: d.manIn, end: p, beats: (p - d.manIn) / d.beat }; d.pause(); d.pos = d.manIn; d.play(); }
      else if (d.loop && i === 2) { d.loop.end = d.loop.start + (d.loop.end - d.loop.start) / 2; d.loop.beats /= 2; d.pause(); d.pos = d.loop.start; d.play(); }
      else if (d.loop && i === 3) { d.loop.end = Math.min(d.buffer.duration, d.loop.start + (d.loop.end - d.loop.start) * 2); d.loop.beats *= 2; d.pause(); d.pos = d.loop.start; d.play(); }
      else if (d.loop && (i === 4 || i === 5)) { const sh = (i === 4 ? -1 : 1) * (d.loop.end - d.loop.start); d.loop.start += sh; d.loop.end += sh; d.pause(); d.pos = d.loop.start; d.play(); }
      else if (i === 6) { if (d.loop) { d.lastLoop = d.loop; d.setLoop(0); } else if (d.lastLoop) { d.loop = d.lastLoop; d.pause(); d.pos = d.loop.start; d.play(); } }
      else if (i === 7) { d.loop = null; d.manIn = null; d.lastLoop = null; d.seek(d.position()); }
    }
  }
  function padRelease(d, i) {
    const m = d.padMode || 'hot';
    if (m === 'stemfx' && d.stems) { const [k, w] = STEM_FX[i]; (w === 'a' ? d.stemFx : d.stemFxB)[k].gain.value = 0; }
    if ((m === 'roll' || m === 'slicer') && d.roll) {
      // slip: parça, döngü hiç olmamış gibi kaldığı yerden devam eder
      const back = d.roll.pos + (d.ctx.currentTime - d.roll.ctx) * d.eff;
      d.roll = null; d.slice = null; d.loop = null; d.seek(back);
    }
  }
  function cyclePad(d, dir) { const i = PAD_MODES.findIndex(x => x[0] === (d.padMode || 'hot')), n = PAD_MODES.length; d.padMode = PAD_MODES[(i + dir + n) % n][0]; U.toast(d.L + ': ' + OS.t(PAD_MODES[(i + dir + n) % n][1])); }
  function keyMatch(d) {
    const o = otherDeck(d);
    if (!o || !o.key || !d.key || o.key === '…' || d.key === '…') { U.toast(OS.t('Ton henüz bulunamadı')); return; }
    const root = k => U.NOTE_NAMES.indexOf(k.endsWith('m') ? k.slice(0, -1) : k) + (k.endsWith('m') ? 3 : 0); // minörü göreli majöre çevir
    let diff = ((root(o.key) + (o.keyShift || 0)) - root(d.key)) % 12; if (diff > 6) diff -= 12; if (diff < -6) diff += 12;
    d.setKeyShift(diff);
  }

  function hotCue(d, i, clear) {
    setTimeout(() => { if (d.libId) DJ.lib.update(d.libId, { hot: d.hot.slice() }); }, 0);
    if (clear) d.hot[i] = null;
    else if (d.hot[i] == null) d.hot[i] = d.snap(d.position());
    else d.seek(d.hot[i]);
  }
  function otherDeck(d) {
    const live = DJ.decks.slice(0, settings.count).filter(x => x !== d && x.bpm);
    return live.find(x => x.playing) || live[0];
  }

  function drawOverview(cv, d, p) {
    const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (!d.overview) return;
    const n = d.overview.length / 2, dur = d.buffer.duration;
    g.fillStyle = '#4a7f9c';
    for (let x = 0; x < w; x++) { const i = Math.floor(x / w * n); const mn = d.overview[i * 2], mx = d.overview[i * 2 + 1]; g.fillRect(x, h / 2 - mx * h / 2, 1, Math.max(1, (mx - mn) * h / 2)); }
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, p / dur * w, h);
    d.hot.forEach(t => { if (t != null) { g.fillStyle = '#9a74f0'; g.fillRect(t / dur * w, 0, 2, h); } });
    g.fillStyle = '#f5b942'; g.fillRect(d.cue / dur * w, 0, 2, h);
    if (d.loop) { g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(d.loop.start / dur * w, 0, (d.loop.end - d.loop.start) / dur * w, h); }
    g.fillStyle = '#fff'; g.fillRect(p / dur * w, 0, 2, h);
  }
  // her 1/pps saniyelik dilim için bas / orta / tiz enerjisi (renkli dalga formu)
  function bandPeaks(buf, pps) {
    const d = buf.getChannelData(0), sr = buf.sampleRate, step = Math.floor(sr / pps), n = Math.floor(d.length / step), out = new Float32Array(n * 3);
    const aL = 1 - Math.exp(-2 * Math.PI * 200 / sr), aH = 1 - Math.exp(-2 * Math.PI * 2500 / sr);
    let lo = 0, lp2 = 0;
    for (let b = 0; b < n; b++) {
      let eL = 0, eM = 0, eH = 0;
      for (let i = b * step, z = i + step; i < z; i++) { const x = d[i]; lo += aL * (x - lo); lp2 += aH * (x - lp2); const l = lo, m = lp2 - lo, h = x - lp2; eL += l * l; eM += m * m; eH += h * h; }
      out[b * 3] = Math.sqrt(eL / step); out[b * 3 + 1] = Math.sqrt(eM / step); out[b * 3 + 2] = Math.sqrt(eH / step);
    }
    return out;
  }
  function trailingEnd(buf) { const d = buf.getChannelData(0); let i = d.length - 1; while (i > 0 && Math.abs(d[i]) < 0.01) i--; return i / buf.sampleRate; }
  function drawZoom(cv, d, p) {
    const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (!d.peaks) { g.fillStyle = '#6c7484'; g.font = '12px Segoe UI'; g.fillText(OS.t(d.buffer ? 'Analiz ediliyor…' : 'Parça yükleyin veya sürükleyip bırakın'), 10, h / 2); return; }
    const span = 8, pxs = w / span, n = d.peaks.length / 2;
    for (let x = 0; x < w; x++) {
      const t = p - span / 2 + x / pxs, i = Math.floor(t * d.pps);
      if (i < 0 || i >= n) continue;
      const mn = d.peaks[i * 2], mx = d.peaks[i * 2 + 1], a = Math.max(Math.abs(mn), mx);
      if (d.bands) { const L = d.bands[i * 3], M = d.bands[i * 3 + 1], H = d.bands[i * 3 + 2], s2 = L + M + H + 1e-9; g.fillStyle = `rgb(${Math.round(60 + 195 * L / s2)},${Math.round(60 + 195 * M / s2)},${Math.round(80 + 175 * H / s2)})`; }
      else g.fillStyle = a > 0.6 ? '#ff5a4f' : a > 0.3 ? '#e6e6e6' : '#7d7d7d';
      g.fillRect(x, h / 2 - mx * h / 2, 1, Math.max(1, (mx - mn) * h / 2));
    }
    if (d.bpm) {
      const beat = d.beat;
      for (let t = d.grid + Math.ceil((p - span / 2 - d.grid) / beat) * beat, k = 0; t < p + span / 2; t += beat, k++) {
        const bi = Math.round((t - d.grid) / beat);
        g.fillStyle = bi % 4 === 0 ? 'rgba(255,90,90,.8)' : 'rgba(255,255,255,.25)';
        g.fillRect((t - p + span / 2) * pxs, 0, bi % 4 === 0 ? 2 : 1, bi % 4 === 0 ? h : 8);
      }
    }
    if (d.loop) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect((d.loop.start - p + span / 2) * pxs, 0, (d.loop.end - d.loop.start) * pxs, h); }
    g.fillStyle = '#fff'; g.fillRect(w / 2, 0, 2, h);
  }

  function mixerUI(decks) {
    const ch = d => {
      const meter = el('canvas'); d.meterCv = meter;
      const band = (b, label) => {
        const iso = settings.eqBands === 4;
        const k = learnable(U.knob({ label, size: 32, min: iso ? -40 : -26, max: 6, def: 0, value: d.eqVals[b], fmt: v => v <= -39.5 ? 'KILL' : v.toFixed(0), onchange: v => d.setEQ(b, v) }), `${d.L}.eq${b}`);
        d['knob_' + b] = k;
        const kb = learnable(el('button', { class: 'btn kill' + (d.kills[b] ? ' on' : ''), onclick: e => { if (!DJ.learn) e.target.classList.toggle('on', d.kill(b)); } }, 'KILL'), `${d.L}.kill${b}`);
        return el('div', { class: 'ch' }, k, kb);
      };
      const fader = learnable(el('input', { type: 'range', class: 'vfader', min: 0, max: 1, step: 0.005, value: d.faderVal, oninput: e => d.setFader(+e.target.value) }), `${d.L}.vol`);
      d.faderEl = fader;
      const filt = learnable(U.knob({ label: 'Filtre', size: 32, min: -1, max: 1, def: 0, value: d.filterVal || 0, fmt: v => Math.abs(v) < 0.01 ? '—' : v < 0 ? 'LP' : 'HP', onchange: v => d.setFilter(v) }), `${d.L}.filter`);
      d.filterKnob = filt;
      return el('div', { class: 'ch' },
        el('b', null, d.L),
        learnable(U.knob({ label: 'Trim', size: 32, min: -12, max: 12, def: 0, value: U.gainToDb(d.trim.gain.value), fmt: v => v.toFixed(1), onchange: v => d.trim.gain.value = U.dbToGain(v) }), `${d.L}.trim`),
        ...(settings.eqBands === 4 ? [band('high', 'Tiz'), band('himid', 'Üst Orta'), band('lomid', 'Alt Orta'), band('low', 'Bas')] : [band('high', 'Tiz'), band('mid', 'Orta'), band('low', 'Bas')]),
        filt,
        learnable(U.knob({ label: 'Rez', size: 26, min: 0.5, max: 15, def: 1.2, value: d.res, curve: 'log', fmt: v => v.toFixed(1), onchange: v => d.setRes(v) }), `${d.L}.res`),
        el('div', { class: 'row send-knobs' },
          learnable(U.knob({ label: 'FX A', size: 26, min: 0, max: 1, def: 0, value: d.sendA.gain.value, fmt: v => Math.round(v * 100) + '%', onchange: v => d.sendA.gain.value = v }), `${d.L}.sendA`),
          learnable(U.knob({ label: 'FX B', size: 26, min: 0, max: 1, def: 0, value: d.sendB.gain.value, fmt: v => Math.round(v * 100) + '%', onchange: v => d.sendB.gain.value = v }), `${d.L}.sendB`)),
        el('div', { class: 'fadebox' }, fader, meter));
    };
    const xf = learnable(el('input', { type: 'range', class: 'xfader', min: 0, max: 1, step: 0.005, value: DJ.xfade, oninput: e => { DJ.xfade = +e.target.value; applyX(); }, ondblclick: e => { DJ.xfade = 0.5; e.target.value = 0.5; applyX(); } }), 'xfader');
    DJ.xfEl = xf;
    const curve = el('select', { onchange: () => { DJ.curve = +curve.value; applyX(); } }, el('option', { value: 0 }, 'Yumuşak eğri'), el('option', { value: 1, selected: DJ.curve === 1 }, 'Keskin (scratch)'));
    const recB = el('button', { class: 'btn', onclick: () => toggleRec(recB) }, recorder ? '■ Kaydı Bitir ve İndir' : '● Seti Kaydet');
    const mk = learnable(U.knob({ label: 'Master', min: -40, max: 6, def: 0, value: U.gainToDb(master.gain.value), fmt: v => v.toFixed(1) + ' dB', onchange: v => master.gain.value = U.dbToGain(v) }), 'master');
    DJ.masterKnob = mk;
    return el('div', { class: 'dj-mixer' + (decks.length === 4 ? ' tall' : '') },
      el('div', { class: 'chs' }, decks.map(ch), micStrip()),
      sendUI(),
      el('div', { class: 'row xf-row' }, 'A', xf, 'B'), curve,
      el('div', { class: 'row', style: 'justify-content:center' },
        el('label', { class: 'field' }, 'EQ', el('select', { onchange: e => { settings.eqBands = +e.target.value; saveSettings(); DJ.decks.forEach(x => x.applyEqMode()); DJ.render(); } }, [[3, '3 bant'], [4, '4 bant izolatör']].map(([v, l]) => el('option', { value: v, selected: v === settings.eqBands }, l)))),
        el('label', { class: 'field' }, 'Fader', el('select', { onchange: e => { settings.faderCurve = e.target.value; saveSettings(); DJ.decks.forEach(x => x.setFader(x.faderVal)); } }, [['linear', 'Doğrusal'], ['rotary', 'Döner (logaritmik)'], ['fast', 'Hızlı kesme']].map(([v, l]) => el('option', { value: v, selected: v === settings.faderCurve }, l))))),
      el('div', { class: 'row', style: 'justify-content:center' },
        el('button', { class: 'btn sm', title: 'B’yi A’nın temposuna eşitler, ölçü başında başlatır ve bas takaslı geçiş yapar', onclick: () => autoMix(0, 1) }, 'Akıllı geçiş A→B'),
        el('button', { class: 'btn sm', onclick: () => autoMix(1, 0) }, 'B→A'),
        el('select', { title: OS.t('Geçiş tarifi'), onchange: e => { settings.xRecipe = e.target.value; saveSettings(); } }, Object.keys(DJ.TRANS).map(id => el('option', { value: id, selected: id === (settings.xRecipe || 'bass') }, OS.t(DJ.TRANS[id].name)))),
        el('select', { onchange: e => { settings.xBeats = +e.target.value; saveSettings(); } }, [8, 16, 32, 64].map(n => el('option', { value: n, selected: n === settings.xBeats }, n + ' ' + OS.t('vuruş'))))),
      el('div', { class: 'row', style: 'justify-content:center' }, mk,
        el('div', { class: 'fx-slot' }, el('select', { title: OS.t('Master efekti'), onchange: e => setMasterFx(e.target.value) }, FX.map(([id, l]) => el('option', { value: id, selected: id === DJ.mfx.id }, id ? l : OS.t('Master FX yok')))),
          learnable(U.knob({ label: 'M.FX', size: 28, min: 0, max: 1, def: 0.5, value: DJ.mfx.amt, fmt: v => Math.round(v * 100) + '%', onchange: setMasterFxAmt }), 'mfx'))),
      el('div', { class: 'row', style: 'justify-content:center' }, (DJ.limEl = el('span', { class: 'lim-led', title: OS.t('Ses sınırlayıcı çalışıyor; seviyeyi kısın') }, 'LIM')),
        el('button', { class: 'btn sm', title: OS.t('Kayıt düğmesine basmadan önceki son 30 dakikayı indirir'), onclick: () => DJ.mem.save() }, '⏪ ' + OS.t('Son 30 dk')), recB,
        el('select', { title: OS.t('Kayıt biçimi'), onchange: e => { settings.recFmt = e.target.value; saveSettings(); } }, [['wav', 'WAV'], ['webm', 'Sıkıştırılmış (WebM / M4A)']].map(([v, l]) => el('option', { value: v, selected: v === (settings.recFmt || 'wav') }, l)))));
  }

  function padsUI() {
    const box = el('div', { class: 'pads' });
    const P = () => DJ.pads;
    DJ.renderPads = () => {
      box.innerHTML = '';
      const bankSel = el('select', { onchange: e => { if (e.target.value === 'fx' || e.target.value === 'kit') { U.toast(OS.t('Hazır banka yükleniyor…')); DJ.sounds.addBank(e.target.value).catch(err => { console.warn(err); U.toast(OS.t('Davul sesleri yüklenemedi')); }).then(() => DJ.renderPads()); return; } if (e.target.value === '+') { U.prompt(OS.t('Yeni banka adı'), 'Banka ' + (P().banks.length + 1)).then(n => { if (n) { P().banks.push(blankBank(n)); P().bank = P().banks.length - 1; P().persist(); } DJ.renderPads(); }); return; } P().bank = +e.target.value; DJ.renderPads(); } },
        P().banks.map((b, i) => el('option', { value: i, selected: i === P().bank }, b.name)), el('option', { value: 'fx' }, OS.t('Hazır: DJ Efektleri')), el('option', { value: 'kit' }, OS.t('Hazır: Kayıtlı Davullar')), el('option', { value: '+' }, OS.t('+ Yeni banka…')));
      const outSel = el('select', { title: OS.t('Sampler çıkışı'), onchange: e => P().setOut(e.target.value) }, [['master', 'Master'], ...DJ.decks.slice(0, settings.count).map(d => [d.L, 'Deck ' + d.L])].map(([v, l]) => el('option', { value: v, selected: v === (P().outTo || 'master') }, l)));
      const srcSel = el('select', { title: OS.t('Kayıt kaynağı') }, [['master', 'Master'], ...DJ.decks.slice(0, settings.count).map(d => [d.L, 'Deck ' + d.L])].map(([v, l]) => el('option', { value: v }, l)));
      const lenSel = el('select', { title: OS.t('Kayıt uzunluğu') }, [4, 8, 16, 32].map(n => el('option', { value: n }, n + ' ' + OS.t('vuruş'))));
      const recBtn = el('button', { class: 'btn sm', onclick: () => { recBtn.classList.add('on'); recBtn.disabled = true; E.resume(); P().record(srcSel.value, +lenSel.value, () => { recBtn.classList.remove('on'); recBtn.disabled = false; }); } }, '● ' + OS.t('Pede kaydet'));
      box.appendChild(el('div', { class: 'pad-head' }, el('b', null, 'Sampler'), bankSel, outSel, srcSel, lenSel, recBtn,
        U.knob({ label: 'Sampler', size: 28, min: 0, max: 1.5, def: 0.8, value: P().out.gain.value, fmt: v => Math.round(v * 100) + '%', onchange: v => P().out.gain.value = v })));
      const grid = el('div', { class: 'pad-grid' });
      P().list.forEach(p => {
        const trig = (PAD_TRIG.find(x => x[0] === p.mode) || PAD_TRIG[0])[1];
        const b = learnable(el('div', { class: 'pad' + (p.buffer ? ' full' : '') + (p.src ? ' play' : '') + (p.mode === 'hold' || p.mode === 'unmute' ? ' momentary' : ''), title: 'Tık: çal • Sağ tık: yükle / mod' },
          el('div', { class: 'pn' }, String(p.i + 1)), el('div', { class: 'pl' }, p.name || OS.t('Boş')), p.buffer && p.mode !== 'one' ? el('div', { class: 'pm' }, OS.t(trig)) : null), `pad${p.i + 1}`);
        b.addEventListener('mousedown', e => { if (DJ.learn || e.button !== 0) return; if (p.buffer) { P().trigger(p.i); const up = () => { removeEventListener('mouseup', up); P().release(p.i); }; addEventListener('mouseup', up); } else loadPad(p.i); });
        b.addEventListener('contextmenu', e => {
          e.preventDefault();
          U.menu(e.clientX, e.clientY, [
            { label: 'Ses yükle…', onclick: () => loadPad(p.i) },
            { header: 'Tetikleme' },
            ...PAD_TRIG.map(([v, l]) => ({ label: (p.mode === v ? '✓ ' : '') + OS.t(l), onclick: () => { p.mode = v; P().persist(); DJ.renderPads(); } })),
            '-',
            { label: 'Temizle', onclick: () => { P().clear(p.i); DJ.renderPads(); } },
          ]);
        });
        grid.appendChild(b);
      });
      box.appendChild(grid);
    };
    const loadPad = async i => { const [f] = await U.pickFiles('audio/*'); if (f) { await DJ.pads.load(i, f); DJ.renderPads(); } };
    DJ.renderPads();
    return box;
  }

  function toggleRec(btn) {
    if (recorder && recorder.mr) { recorder.mr.stop(); recorder = null; btn.textContent = OS.t('● Seti Kaydet'); btn.classList.remove('on'); return; }
    if (!recorder && settings.recFmt === 'webm' && window.MediaRecorder) {
      const dest = E.ctx.createMediaStreamDestination(), chunks = []; masterOut.connect(dest);
      const mime = ['audio/webm;codecs=opus', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '', isMp4 = mime.startsWith('audio/mp4');
      const mr = new MediaRecorder(dest.stream, Object.assign({ audioBitsPerSecond: 256000 }, mime ? { mimeType: mime } : {}));
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => { try { masterOut.disconnect(dest); } catch (e) { } U.download(new Blob(chunks, { type: isMp4 ? 'audio/mp4' : 'audio/webm' }), 'dj-set-' + U.stamp() + (isMp4 ? '.m4a' : '.webm')); };
      mr.start(1000); recorder = { mr };
      btn.textContent = OS.t('■ Kaydı Bitir ve İndir'); btn.classList.add('on');
      return;
    }
    if (recorder) {
      recorder.sp.disconnect(); recorder.sil.disconnect();
      const tot = recorder.L.reduce((a, c) => a + c.length, 0), L = new Float32Array(tot), R = new Float32Array(tot);
      let o = 0; recorder.L.forEach((c, i) => { L.set(c, o); R.set(recorder.R[i], o); o += c.length; });
      DJ.lastRec = { L, R, sr: E.ctx.sampleRate, name: 'dj-set-' + U.stamp() };
      U.download(U.encodeWav([L, R], E.ctx.sampleRate, 16), 'dj-set-' + U.stamp() + '.wav');
      recorder = null; btn.textContent = OS.t('● Seti Kaydet'); btn.classList.remove('on');
      return;
    }
    const sp = E.ctx.createScriptProcessor(4096, 2, 2), sil = E.ctx.createGain(); sil.gain.value = 0;
    recorder = { sp, sil, L: [], R: [] };
    sp.onaudioprocess = e => { if (recorder) { recorder.L.push(new Float32Array(e.inputBuffer.getChannelData(0))); recorder.R.push(new Float32Array(e.inputBuffer.getChannelData(1))); } };
    masterOut.connect(sp); sp.connect(sil); sil.connect(E.ctx.destination);
    btn.textContent = OS.t('■ Kaydı Bitir ve İndir'); btn.classList.add('on');
  }

  // ---------------- Akıllı geçiş (otomatik tempo eşleme + bas takaslı crossfade) ----------------
  let mixTimer = null;
  // Geçiş tarifleri: her parametre, geçiş ilerlemesine (0..1) bağlı nokta listesidir
  const TRANS = {
    bass: { name: 'Bas Takası', x: [[0, 0], [0.25, 0.5], [0.75, 0.5], [1, 1]], lowA: [[0, 1], [0.47, 1], [0.5, 0], [1, 0]], lowB: [[0, 0], [0.5, 0], [0.501, 1], [1, 1]] },
    fade: { name: 'Düz geçiş (fade)', x: [[0, 0], [1, 1]] },
    echo: { name: 'Echo Out', startB: 0.5, sendA: [[0, 0], [0.5, 1], [1, 1]], x: [[0, 0], [0.5, 0], [0.75, 1], [1, 1]] },
    filter: { name: 'Filtre Süpürme', filA: [[0, 0], [0.75, 0.9], [1, 0.9]], filB: [[0, -0.85], [0.5, -0.4], [1, 0]], x: [[0, 0], [0.5, 0.5], [1, 1]] },
    reverb: { name: 'Reverb Out', startB: 0.5, sendB: [[0, 0], [0.5, 1], [1, 1]], x: [[0, 0], [0.5, 0], [0.75, 1], [1, 1]] },
    tape: { name: 'Tape Stop', startB: 0.6, tapeAt: 0.3, x: [[0, 0], [0.6, 0], [0.62, 1], [1, 1]] },
    cut: { name: 'Kesme (arka arkaya)', cut: true },
  };
  const curveAt = (pts, k) => { for (let i = 1; i < pts.length; i++) if (k <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (k - x0) / Math.max(1e-6, x1 - x0); } return pts[pts.length - 1][1]; };
  let mixEnd = null;
  function autoMix(fromI, toI, opts = {}) {
    const a = DJ.decks[fromI], b = DJ.decks[toI], rec = TRANS[opts.recipe || settings.xRecipe] || TRANS.bass, beats = opts.beats || settings.xBeats;
    if (!a.buffer || !b.buffer) { U.toast(OS.t('İki decke de parça yükleyin')); return; }
    if (!a.playing) { U.toast(OS.t('Geçiş yapılacak deck çalmıyor')); return; }
    if (!opts.auto && (!a.bpm || !b.bpm)) { U.toast(OS.t('BPM henüz hesaplanmadı')); return; }
    clearInterval(mixTimer); clearTimeout(DJ._mixWait); if (mixEnd) mixEnd();
    if (a.bpm && b.bpm) { const fit = a.fitRate(b); if (!opts.auto || Math.abs(fit - 1) < 0.08) b.setRate(fit); }
    a.xAssign = fromI % 2 === 0 ? 'A' : 'B'; b.xAssign = toI % 2 === 0 ? 'A' : 'B';
    const dir = toI > fromI ? 1 : -1, setX = v => { DJ.xfade = U.clamp(v, 0, 1); applyX(); if (DJ.xfEl) DJ.xfEl.value = DJ.xfade; };
    b.pause(); b.pos = b.cue || b.grid;
    if (rec.cut) { b.play(); a.pause(); setX(dir > 0 ? 1 : 0); DJ.renderInfo(); return; }
    // b, a'nın bir sonraki ölçü başında girer
    const phase = (((a.position() - a.grid) / a.beat) % 4 + 4) % 4, wait = (4 - phase) * a.beat / a.eff;
    DJ._mixWait = setTimeout(() => {
      const dur = beats * a.beat / a.eff * 1000, t0 = performance.now(), x0 = DJ.xfade, keep = { lowA: a.eqVals.low, lowB: b.eqVals.low, filA: a.filterVal || 0, filB: b.filterVal || 0, sA: a.sendA.gain.value, sB: a.sendB.gain.value };
      let bOn = false, taped = false;
      const set = (d, band, on, db) => d.setEQ(band, on >= 0.5 ? db : -26);
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        if (!bOn && k >= (rec.startB || 0)) { bOn = true; b.play(); DJ.renderInfo(); }
        const f = curveAt(rec.x, k); setX(dir > 0 ? x0 + (1 - x0) * f : x0 * (1 - f));
        if (rec.lowA) set(a, 'low', curveAt(rec.lowA, k), keep.lowA);
        if (rec.lowB) set(b, 'low', curveAt(rec.lowB, k), keep.lowB);
        if (rec.filA) { a.setFilter(curveAt(rec.filA, k)); setKnob(a.filterKnob, a.filterVal); }
        if (rec.filB) { b.setFilter(curveAt(rec.filB, k)); setKnob(b.filterKnob, b.filterVal); }
        if (rec.sendA) a.sendA.gain.value = curveAt(rec.sendA, k);
        if (rec.sendB) a.sendB.gain.value = curveAt(rec.sendB, k);
        if (rec.tapeAt && !taped && k >= rec.tapeAt) { taped = true; a.brake((rec.startB - rec.tapeAt) * dur / 1000); }
        if (k >= 1) { clearInterval(mixTimer); a.pause(); mixEnd(); DJ.renderInfo(); }
      };
      mixEnd = () => {
        mixEnd = null; clearInterval(mixTimer);
        a.setEQ('low', keep.lowA); b.setEQ('low', keep.lowB);
        if (rec.filA) { a.setFilter(keep.filA); setKnob(a.filterKnob, keep.filA); }
        if (rec.filB) { b.setFilter(keep.filB); setKnob(b.filterKnob, keep.filB); }
        if (rec.sendA) a.sendA.gain.value = keep.sA;
        if (rec.sendB) a.sendB.gain.value = keep.sB;
      };
      if (rec.lowB) b.setEQ('low', -26);
      if (rec.filB) b.setFilter(curveAt(rec.filB, 0));
      mixTimer = setInterval(tick, 30); tick();
    }, Math.max(0, wait * 1000 - 5));
    U.toast(OS.t('Geçiş bir sonraki ölçüde başlıyor'));
  }
  DJ.TRANS = TRANS;

  // Set belleği: kayıt düğmesine basılmasa da son dakikalar saklanır
  const MEM_MIN = 30;
  const MEM = DJ.mem = { chunks: [], mr: null, type: 'audio/webm', slice: 5000 };
  MEM.start = () => {
    if (MEM.mr || !window.MediaRecorder || !MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return;
    const dest = E.ctx.createMediaStreamDestination(); masterOut.connect(dest); MEM.dest = dest;
    MEM.mr = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 });
    MEM.mr.ondataavailable = e => { if (!e.data.size) return; MEM.chunks.push(e.data); MEM.trim(); };
    MEM.mr.start(MEM.slice);
  };
  MEM.trim = () => { const max = Math.ceil(MEM_MIN * 60000 / MEM.slice); while (MEM.chunks.length > max) MEM.chunks.splice(1, 1); }; // ilk parça dosya başlığını taşır
  // Bellekteki mixi Blob olarak verir (Telefona Gönder kullanır)
  MEM.blob = () => new Promise(res => { const f = () => { MEM.mr.removeEventListener('dataavailable', f); res(new Blob(MEM.chunks, { type: MEM.type })); }; MEM.mr.addEventListener('dataavailable', f); MEM.mr.requestData(); });
  MEM.save = () => {
    if (!MEM.mr) { U.toast(OS.t('Henüz kaydedilecek bir şey yok')); return; }
    const finish = () => { MEM.mr.removeEventListener('dataavailable', finish); U.download(new Blob(MEM.chunks, { type: MEM.type }), 'dj-set-bellek-' + U.stamp() + '.webm'); };
    MEM.mr.addEventListener('dataavailable', finish); MEM.mr.requestData();
  };

  // ---------------- Müzik kütüphanesi (taşınabilir profilde saklanır) ----------------
  DJ.lib = {
    items: [], q: '', sort: 'name',
    async load() { try { this.items = (await OS.store.get('kv', 'djlib-index')) || []; } catch (e) { this.items = []; } },
    save() { return OS.store.put('kv', 'djlib-index', this.items).catch(() => { }); },
    async addOne(f, meta) {
      const id = U.uid();
      meta = Object.assign(await readTags(f), meta || {});
      try { await OS.store.put('kv', 'djlib:' + id, f); } catch (e) { U.toast(OS.t('Kütüphaneye eklenemedi') + ': ' + f.name); return null; }
      const it = Object.assign({ id, name: f.name.replace(/\.[^.]+$/, ''), file: f.name, size: f.size, added: Date.now(), bpm: 0, key: '', dur: 0 }, meta || {});
      this.items.push(it);
      return it;
    },
    async add(files) {
      for (const f of files) await this.addOne(f);
      await this.save(); DJ.lib.refresh && DJ.lib.refresh();
    },
    // ---------- DJ Kütüphanesi XML / DJ Koleksiyonu NML / M3U içe aktarma ----------
    async importForeign() {
      const [f] = await U.pickFiles('.xml,.nml,.m3u,.m3u8'); if (!f) return;
      let entries, lists;
      try { ({ entries, lists } = parseForeign(await U.readAsText(f), f.name)); } catch (e) { U.toast(e.message, 6000); return; }
      if (!entries.length) { U.toast(OS.t('Dosyada parça bulunamadı')); return; }
      U.toast(entries.length + ' ' + OS.t('parça bulundu. Şimdi müzik dosyalarınızın bulunduğu klasörü seçin…'), 6000);
      const files = await pickFolder(); if (!files.length) return;
      const byName = new Map(files.map(x => [x.name.toLowerCase(), x]));
      const known = new Map(this.items.map(it => [it.file.toLowerCase(), it]));
      let added = 0, updated = 0, missing = 0;
      const ids = new Map();
      for (const e of entries) {
        const nm = (e.file || '').toLowerCase(), meta = { bpm: e.bpm || 0, key: e.key || '', grid: e.grid, hot: e.hot && e.hot.length ? Array.from({ length: 8 }, (_, i) => e.hot[i] != null ? e.hot[i] : null) : undefined, name: e.title ? (e.artist ? e.artist + ' - ' : '') + e.title : undefined, imported: true };
        Object.keys(meta).forEach(k => meta[k] === undefined && delete meta[k]);
        if (known.has(nm)) { Object.assign(known.get(nm), meta); ids.set(nm, known.get(nm).id); updated++; continue; }
        const fl = byName.get(nm); if (!fl) { missing++; continue; }
        const it = await this.addOne(fl, meta); if (it) { ids.set(nm, it.id); known.set(nm, it); added++; }
      }
      Object.keys(lists).forEach(ln => lists[ln].forEach(fn => { const it = known.get((fn || '').toLowerCase()); if (it) { it.lists = it.lists || []; if (!it.lists.includes(ln)) it.lists.push(ln); } }));
      await this.save(); this.refresh();
      U.toast(`${added} ${OS.t('eklendi')}, ${updated} ${OS.t('güncellendi')}, ${missing} ${OS.t('klasörde bulunamadı')}`, 7000);
    },
    // ---------- Dışa aktarma ----------
    exportDjXml() {
      const esc = x => String(x == null ? '' : x).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
      const items = this.items;
      let x = '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">\n  <PRODUCT Name="Mr. Mars Music Studio All in 1" Version="' + OS.ui.VERSION + '" Company=""/>\n  <COLLECTION Entries="' + items.length + '">\n';
      items.forEach((it, i) => {
        x += `    <TRACK TrackID="${i + 1}" Name="${esc(it.name)}" Location="file://localhost/${esc(encodeURI(it.file))}" AverageBpm="${(it.bpm || 0).toFixed(2)}" Tonality="${esc(it.key || '')}" TotalTime="${Math.round(it.dur || 0)}">\n`;
        if (it.bpm) x += `      <TEMPO Inizio="${(it.grid || 0).toFixed(3)}" Bpm="${it.bpm.toFixed(2)}" Metro="4/4" Battito="1"/>\n`;
        (it.hot || []).forEach((h, n) => { if (h != null) x += `      <POSITION_MARK Name="" Type="0" Start="${(+h).toFixed(3)}" Num="${n}"/>\n`; });
        x += '    </TRACK>\n';
      });
      const lists = [...new Set(items.flatMap(it => it.lists || []))];
      x += '  </COLLECTION>\n  <PLAYLISTS>\n    <NODE Type="0" Name="ROOT" Count="' + lists.length + '">\n';
      lists.forEach(ln => { const tr = items.map((it, i) => (it.lists || []).includes(ln) ? i + 1 : 0).filter(Boolean); x += `      <NODE Name="${esc(ln)}" Type="1" KeyType="0" Entries="${tr.length}">\n` + tr.map(k => `        <TRACK Key="${k}"/>\n`).join('') + '      </NODE>\n'; });
      x += '    </NODE>\n  </PLAYLISTS>\n</DJ_PLAYLISTS>\n';
      U.download(new Blob([x], { type: 'application/xml' }), 'mr-mars-kutuphane-dj.xml');
    },
    exportM3U(list) {
      const items = this.items.filter(it => !list || (it.lists || []).includes(list));
      const txt = '#EXTM3U\n' + items.map(it => `#EXTINF:${Math.round(it.dur || -1)},${it.name}\n${it.file}`).join('\n') + '\n';
      U.download(new Blob([txt], { type: 'audio/x-mpegurl' }), (list || 'mr-mars-kutuphane') + '.m3u8');
    },
    async buildSet() {
      const pool = (this.rows || this.items).slice();
      if (pool.length < 2) { U.toast(OS.t('Set için en az iki parça gerekli')); return; }
      const n = Math.round(+(await U.prompt(OS.t('Kaç parça? (seçili parçadan başlar)'), String(Math.min(12, pool.length)))) || 0); if (!n) return;
      const start = pool.find(x => x.id === this.sel) || null;
      const set = DJ.setOrder(pool, start).slice(0, Math.max(2, n));
      AM.queue = set.map(x => x.id); AM.refresh && AM.refresh();
      const f = DJ.setFlow(set);
      U.toast(set.length + ' ' + OS.t('parça Automix kuyruğuna dizildi') + (f != null ? ' · ' + OS.t('akış') + ' ' + f + '%' : ''), 5000);
    },
    update(id, data) { const it = this.items.find(x => x.id === id); if (it) { if (it.imported) { data = Object.assign({}, data); if (it.bpm) delete data.bpm; if (it.key) delete data.key; } Object.assign(it, data); this.save(); DJ.lib.refresh && DJ.lib.refresh(); } },
    // Kulaklıktan ön dinleme: parçayı decke yüklemeden çalar
    async preview(id) {
      const was = this.pv; this.stopPreview();
      if (was === id) { this.refresh(); return; }
      const blob = await OS.store.get('kv', 'djlib:' + id); if (!blob) return;
      E.resume();
      const ctx = E.ctx, buf = await ctx.decodeAudioData(await blob.arrayBuffer()), x = ctx.createBufferSource(), g = ctx.createGain();
      g.gain.value = 0.8; x.buffer = buf; x.connect(g); g.connect(settings.cueMode === 'off' ? E.monitorBus : cueBus);
      x.start(0, buf.duration * 0.3);
      this.pv = id; this.pvSrc = x; x.onended = () => { if (this.pvSrc === x) { this.pv = null; this.pvSrc = null; this.refresh(); } };
      this.refresh();
    },
    stopPreview() { if (this.pvSrc) { const x = this.pvSrc; this.pvSrc = null; try { x.stop(); } catch (e) { } } this.pv = null; },
    info(it) {
      const f = {}, inp = (k, attrs) => (f[k] = el('input', Object.assign({ class: 'inp', value: it[k] != null ? it[k] : '' }, attrs || {})));
      U.modal(OS.t('Parça Bilgisi'), el('div', { class: 'form-grid' },
        it.cover ? el('img', { src: it.cover, style: 'width:96px;grid-column:1/3;border-radius:6px' }) : null,
        OS.t('Ad'), inp('name'), OS.t('Sanatçı'), inp('artist'), OS.t('Albüm'), inp('album'), OS.t('Tür'), inp('genre'), OS.t('Yıl'), inp('year'),
        'BPM', inp('bpm', { type: 'number', step: 0.1 }), OS.t('Tonalite'), inp('key'), OS.t('Puan (0-5)'), inp('rating', { type: 'number', min: 0, max: 5 }), OS.t('Not'), inp('comment'), OS.t('Dosya'), el('span', { class: 'mono' }, it.file)),
        [{ label: 'İptal' }, { label: 'Kaydet', primary: true, onclick: () => { Object.keys(f).forEach(k => { const v = f[k].value; it[k] = ['bpm', 'rating'].includes(k) ? +v || 0 : v; }); this.save(); this.refresh(); } }]);
    },
    move(n) { if (!this.rows || !this.rows.length) return; const i = this.rows.findIndex(x => x.id === this.sel); this.sel = this.rows[U.clamp((i < 0 ? 0 : i) + n, 0, this.rows.length - 1)].id; this.refresh(); const e = document.querySelector('.lib-row.sel'); if (e) e.scrollIntoView({ block: 'nearest' }); },
    async remove(id) { this.items = this.items.filter(x => x.id !== id); await OS.store.del('kv', 'djlib:' + id).catch(() => { }); await this.save(); this.refresh(); },
    async toDeck(id, di) {
      const it = this.items.find(x => x.id === id); if (!it) return;
      const blob = await OS.store.get('kv', 'djlib:' + id);
      if (!blob) { U.toast(OS.t('Dosya bulunamadı')); return; }
      const f = new File([blob], it.file, { type: blob.type }); f.libId = id;
      U.toast(OS.t('Yükleniyor…'));
      const d = DJ.decks[di];
      await d.load(f);
      d.cover = it.cover || null;
      if (it.loops) d.savedLoops = it.loops.slice();
      if (it.imported || (it.hot && it.hot.some(h => h != null))) {
        await waitReady(d);
        if (it.imported && it.bpm) { d.bpm = it.bpm; if (it.grid != null) d.grid = it.grid; }
        if (it.imported && it.key) d.key = it.key;
        if (it.hot) d.hot = Array.from({ length: 16 }, (_, i) => it.hot[i] != null ? it.hot[i] : null);
      }
      DJ.renderInfo();
    },
    ui() {
      const box = el('div', { class: 'dj-lib' });
      const list = el('div', { class: 'lib-list' });
      const search = el('input', { class: 'inp', placeholder: OS.t('Ara (ad, BPM, ton)…'), value: this.q, oninput: e => { this.q = e.target.value; this.refresh(); } });
      const lists = () => [...new Set(this.items.flatMap(it => it.lists || []))].sort();
      const listSel = el('select', { onchange: e => { if (e.target.value === '+') { U.prompt(OS.t('Yeni liste adı')).then(n => { if (n) { this.newList = n; this.list = n; } this.refresh(); box.replaceWith(this.ui()); }); return; } this.list = e.target.value; this.refresh(); } },
        el('option', { value: '' }, OS.t('Tüm parçalar')), [...new Set(lists().concat(this.newList ? [this.newList] : []))].map(l => el('option', { value: l, selected: l === this.list }, '♫ ' + l)), el('option', { value: '+' }, OS.t('+ Yeni liste…')));
      const harm = el('select', { title: OS.t('Seçili deckin tonuyla uyumlu parçaları göster'), onchange: e => { this.harm = e.target.value; this.refresh(); } }, el('option', { value: '' }, OS.t('Tüm tonlar')), DJ.decks.slice(0, settings.count).map(d => el('option', { value: d.L, selected: this.harm === d.L }, OS.t('Uyumlu: Deck') + ' ' + d.L)));
      const bpmLo = el('input', { class: 'inp', type: 'number', placeholder: 'BPM min', style: 'width:76px', value: this.bpmLo || '', oninput: e => { this.bpmLo = +e.target.value || 0; this.refresh(); } });
      const bpmHi = el('input', { class: 'inp', type: 'number', placeholder: 'BPM max', style: 'width:76px', value: this.bpmHi || '', oninput: e => { this.bpmHi = +e.target.value || 0; this.refresh(); } });
      box.append(el('div', { class: 'row' }, el('b', null, OS.t('Kütüphane')), listSel, harm, bpmLo, bpmHi, search,
        el('select', { onchange: e => { this.sort = e.target.value; this.refresh(); } }, [['name', 'Ada göre'], ['fit', 'Uyuma göre'], ['artist', 'Sanatçıya göre'], ['bpm', 'BPM’e göre'], ['key', 'Tona göre'], ['rating', 'Puana göre'], ['added', 'Eklenme']].map(([v, l]) => el('option', { value: v, selected: v === this.sort }, l))),
        el('button', { class: 'btn sm primary', onclick: () => DJ.myMusic.open() }, '🎵 ' + window.OS_MY_MUSIC.artist),
        el('button', { class: 'btn sm', onclick: async () => { const fs = await U.pickFiles('audio/*,video/*', true); if (fs.length) this.add(fs); } }, '+ Parça ekle'),
        el('button', { class: 'btn sm', title: OS.t('DJ Kütüphanesi XML, DJ Koleksiyonu NML veya M3U çalma listesi; BPM, ton, beat grid, hot cue ve listeler aktarılır'), onclick: () => this.importForeign() }, 'İçe aktar (XML / NML / M3U)…'),
        el('button', { class: 'btn sm', onclick: e => U.menu(e.clientX, e.clientY, [{ label: 'DJ Kütüphanesi XML (BPM, ton, hot cue, listeler)', onclick: () => this.exportDjXml() }, { label: 'M3U8 (tüm kütüphane)', onclick: () => this.exportM3U() }, ...(this.list ? [{ label: 'M3U8 (' + this.list + ')', onclick: () => this.exportM3U(this.list) }] : [])]) }, 'Dışa aktar ▾'),
        el('button', { class: 'btn sm', title: OS.t('Seçili parçadan başlayarak görünen listeden ton ve BPM uyumlu bir set kurar ve Automix kuyruğuna dizer'), onclick: () => this.buildSet() }, OS.t('Set kur…')),
        el('span', { class: 'muted' }, OS.t('BPM ve ton, parça bir deck’e ilk yüklendiğinde kaydedilir.'))), list);
      this.refresh = () => {
        if (!list.isConnected && list.parentNode == null && box.isConnected === false) { }
        list.innerHTML = '';
        const q = this.q.toLowerCase();
        const hd = this.harm && DJ.decks[LETTERS.indexOf(this.harm)], hk = hd && hd.shownKey;
        const ref = DJ.decks.find(d => d.playing && d.bpm) || DJ.decks[0];
        const fitOf = it => (ref.shownKey && it.key && keysFit(it.key, ref.shownKey) ? 0 : 20) + (it.bpm && ref.bpm ? Math.min(...[0.5, 1, 2].map(k => Math.abs(it.bpm * k / (ref.bpm * ref.eff) - 1))) * 100 : 15);
        const rows = this.rows = this.items.filter(it => (!q || [it.name, it.artist, it.album, it.genre, it.key, Math.round(it.bpm)].join(' ').toLowerCase().includes(q)) && (!hk || keysFit(it.key, hk)) && (!this.list || (it.lists || []).includes(this.list)) && (!this.bpmLo || it.bpm >= this.bpmLo) && (!this.bpmHi || (it.bpm && it.bpm <= this.bpmHi)))
          .sort((a, b) => this.sort === 'fit' ? fitOf(a) - fitOf(b) : this.sort === 'bpm' ? a.bpm - b.bpm : this.sort === 'key' ? (a.key || '').localeCompare(b.key || '') : this.sort === 'added' ? b.added - a.added : this.sort === 'rating' ? (b.rating || 0) - (a.rating || 0) : this.sort === 'artist' ? (a.artist || '').localeCompare(b.artist || '', 'tr') : a.name.localeCompare(b.name, 'tr'));
        if (!rows.length) list.appendChild(el('div', { class: 'muted', style: 'padding:6px' }, OS.t('Kütüphane boş. “+ Parça ekle” ile müzik ekleyin.')));
        rows.forEach(it => list.appendChild(el('div', { class: 'lib-row' + (it.id === this.sel ? ' sel' : ''), onclick: () => { this.sel = it.id; this.refresh(); } },
          it.cover ? el('img', { class: 'lib-cover', src: it.cover, alt: '' }) : null,
          el('span', { class: 'ln' }, (it.artist ? it.artist + ' - ' : '') + it.name),
          el('span', { class: 'mono' }, it.rating ? '★'.repeat(it.rating) : ''), el('span', { class: 'mono' }, it.bpm ? it.bpm.toFixed(1) : '--'), el('span', { class: 'mono' }, it.key || '–'),
          el('span', { class: 'mono' }, it.dur ? U.fmtTime(it.dur).slice(0, 5) : ''),
          ...DJ.decks.slice(0, settings.count).map((d, i) => el('button', { class: 'btn sm', onclick: () => this.toDeck(it.id, i) }, '→ ' + LETTERS[i])),
          el('button', { class: 'btn sm' + (this.pv === it.id ? ' on' : ''), title: OS.t('Ön dinleme (kulaklık)'), onclick: () => this.preview(it.id) }, '🎧'),
          el('button', { class: 'btn sm', title: OS.t('Parça bilgisi'), onclick: () => this.info(it) }, 'ℹ'),
          el('button', { class: 'btn sm', title: OS.t('Automix kuyruğuna ekle'), onclick: () => DJ.auto.add(it.id) }, '+⏵'),
          el('button', { class: 'btn sm', title: OS.t('Listeye ekle / çıkar'), onclick: e => { const ls = [...new Set((this.items.flatMap(x => x.lists || [])).concat(this.newList ? [this.newList] : []))]; U.menu(e.clientX, e.clientY, ls.length ? ls.map(l => ({ label: ((it.lists || []).includes(l) ? '✓ ' : '') + l, onclick: () => { it.lists = it.lists || []; const k = it.lists.indexOf(l); if (k >= 0) it.lists.splice(k, 1); else it.lists.push(l); this.save(); this.refresh(); } })) : [{ label: OS.t('Önce “+ Yeni liste…” ile liste oluşturun'), disabled: true }]); } }, '♫'),
          el('button', { class: 'btn sm danger', title: OS.t('Kütüphaneden çıkar'), onclick: () => this.remove(it.id) }, '✕'))));
      };
      this.load().then(() => this.refresh());
      return box;
    },
  };

  // ---------------- Mikrofon kanalı (talkover / ducking, eko) ----------------
  const MIC = DJ.mic = { on: false, vol: 0.9, echo: 0, talk: true, duck: -12 };
  function micStrip() {
    const ensure = () => {
      if (MIC.g) return;
      const ctx = E.ctx;
      MIC.g = ctx.createGain(); MIC.hp = ctx.createBiquadFilter(); MIC.hp.type = 'highpass'; MIC.hp.frequency.value = 100;
      MIC.an = ctx.createAnalyser(); MIC.an.fftSize = 512;
      MIC.d = ctx.createDelay(1); MIC.fb = ctx.createGain(); MIC.eg = ctx.createGain(); MIC.d.delayTime.value = 0.32; MIC.fb.gain.value = 0.35;
      MIC.hp.connect(MIC.g); MIC.g.connect(master); MIC.g.connect(MIC.an); MIC.g.connect(MIC.eg); MIC.eg.connect(MIC.d); MIC.d.connect(MIC.fb); MIC.fb.connect(MIC.d); MIC.d.connect(master);
      const b = new Float32Array(512);
      // talkover: mikrofon konuşurken müzik kısılır
      setInterval(() => {
        if (!MIC.on || !MIC.talk) { DJ.decks.forEach(d => d.duckG && (d.duckG.gain.value = 1)); return; }
        MIC.an.getFloatTimeDomainData(b); let r = 0; for (const x of b) r += x * x; r = Math.sqrt(r / b.length);
        const target = r > 0.02 ? U.dbToGain(MIC.duck) : 1, t = E.ctx.currentTime;
        DJ.decks.forEach(d => { if (!d.duckG) { d.duckG = E.ctx.createGain(); try { d.xf.disconnect(master); } catch (e) { } d.xf.connect(d.duckG); d.duckG.connect(master); } d.duckG.gain.setTargetAtTime(target, t, target < 1 ? 0.05 : 0.4); });
      }, 50);
    };
    const btn = el('button', { class: 'btn sm' + (MIC.on ? ' on' : ''), onclick: async () => {
      ensure();
      if (!MIC.on) { try { if (!E.inputSource) await E.openInput(OS.settings.inputId); E.inputNode('L').connect(MIC.hp); MIC.on = true; } catch (er) { U.toast(OS.t('Mikrofon açılamadı') + ': ' + er.message); return; } }
      else { try { E.inputNode('L').disconnect(MIC.hp); } catch (er) { } MIC.on = false; }
      btn.classList.toggle('on', MIC.on);
    } }, '🎤 MIC');
    return el('div', { class: 'ch mic-ch' }, el('b', null, 'MIC'), btn,
      U.knob({ label: 'Ses', size: 32, min: 0, max: 1.5, def: 0.9, value: MIC.vol, fmt: v => Math.round(v * 100) + '%', onchange: v => { ensure(); MIC.vol = v; MIC.g.gain.value = v; } }),
      U.knob({ label: 'Eko', size: 32, min: 0, max: 1, def: 0, value: MIC.echo, fmt: v => Math.round(v * 100) + '%', onchange: v => { ensure(); MIC.echo = v; MIC.eg.gain.value = v; MIC.d.delayTime.value = Math.min(0.9, 60 / (DJ.decks[0].bpm * DJ.decks[0].rate || 120) * 0.75); } }),
      el('label', { class: 'field', title: 'Konuşurken müziği kıs' }, el('input', { type: 'checkbox', checked: MIC.talk, onchange: e => MIC.talk = e.target.checked }), 'Talkover'));
  }

  // ---------------- Automix (kuyruk ile otomatik DJ) ----------------
  const AM = DJ.auto = { queue: [], on: false, type: 'bass', beats: 16, beatmatch: true, repeat: false, removePlayed: true, cur: 0, busy: false };
  AM.add = id => { AM.queue.push(id); AM.refresh && AM.refresh(); U.toast(OS.t('Kuyruğa eklendi')); };
  AM.start = async function () {
    if (!AM.queue.length) { U.toast(OS.t('Önce kuyruğa parça ekleyin')); return; }
    AM.on = true; AM.cur = 0;
    const A = DJ.decks[0];
    if (!A.playing) { await DJ.lib.toDeck(AM.queue[0], 0); await waitReady(A); A.xAssign = 'A'; DJ.decks[1].xAssign = 'B'; DJ.xfade = 0; applyX(); A.play(); if (AM.removePlayed) AM.queue.shift(); }
    AM.refresh(); DJ.renderInfo();
  };
  AM.stop = () => { AM.on = false; AM.refresh(); };
  const waitReady = d => new Promise(r => { const iv = setInterval(() => { if (d.buffer && d.bpm) { clearInterval(iv); r(); } }, 100); setTimeout(() => { clearInterval(iv); r(); }, 8000); });
  setInterval(async () => {
    if (!AM.on || AM.busy || !built) return;
    const cur = DJ.decks.slice(0, 2).find(d => d.playing); if (!cur) return;
    const next = DJ.decks[1 - cur.idx];
    const fadeSec = AM.type === 'cut' ? 0.05 : AM.beats * cur.beat / cur.eff;
    const end = (cur.endPos || (cur.buffer && cur.buffer.duration) || 0);
    if (end - cur.position() > fadeSec + 1.5) return;
    if (!AM.queue.length) { if (!AM.repeat) { AM.on = false; AM.refresh(); } return; }
    AM.busy = true;
    const id = AM.queue[0];
    if (AM.removePlayed) AM.queue.shift(); else AM.queue.push(AM.queue.shift());
    AM.refresh();
    await DJ.lib.toDeck(id, next.idx); await waitReady(next);
    autoMix(cur.idx, next.idx, { recipe: AM.type, beats: AM.beats, auto: true });
    setTimeout(() => { AM.busy = false; }, fadeSec * 1000 + 2000);
    DJ.renderInfo();
  }, 400);
  AM.ui = function () {
    const box = el('div', { class: 'dj-panel' });
    AM.refresh = () => {
      box.innerHTML = '';
      box.append(el('div', { class: 'row' }, el('b', null, 'Automix'),
        el('button', { class: 'btn sm ' + (AM.on ? 'on' : 'primary'), onclick: () => AM.on ? AM.stop() : AM.start() }, AM.on ? '■ ' + OS.t('Durdur') : '▶ ' + OS.t('Başlat')),
        el('select', { title: OS.t('Geçiş tarifi'), onchange: e => AM.type = e.target.value }, Object.keys(DJ.TRANS).map(v => [v, DJ.TRANS[v].name]).map(([v, l]) => el('option', { value: v, selected: v === AM.type }, l))),
        el('select', { onchange: e => AM.beats = +e.target.value }, [8, 16, 32].map(n => el('option', { value: n, selected: n === AM.beats }, n + ' ' + OS.t('vuruş')))),
        el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: AM.repeat, onchange: e => AM.repeat = e.target.checked }), 'Tekrarla'),
        el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: AM.removePlayed, onchange: e => AM.removePlayed = e.target.checked }), 'Çalınanı listeden çıkar'),
        el('button', { class: 'btn sm', title: OS.t('Kuyruğu ton uyumu ve BPM akışına göre sırala (çalan parçadan devam eder)'), onclick: () => {
          const items = AM.queue.map(id => DJ.lib.items.find(x => x.id === id)).filter(Boolean); if (items.length < 2) return;
          const pl = DJ.decks.slice(0, 2).find(d => d.playing && d.bpm), ref = pl ? { key: pl.shownKey || pl.key, bpm: pl.bpm * (pl.eff || 1) } : null;
          AM.queue = DJ.setOrder(items, ref).map(x => x.id); AM.refresh();
          const f = DJ.setFlow(AM.queue.map(id => DJ.lib.items.find(x => x.id === id))); U.toast(OS.t('Uyumlu sıralandı') + (f != null ? ' · ' + OS.t('akış') + ' ' + f + '%' : ''));
        } }, OS.t('Uyumlu sırala')),
        el('button', { class: 'btn sm', onclick: () => { for (let i = AM.queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [AM.queue[i], AM.queue[j]] = [AM.queue[j], AM.queue[i]]; } AM.refresh(); } }, 'Karıştır'),
        el('button', { class: 'btn sm', onclick: () => { AM.queue = []; AM.refresh(); } }, 'Temizle')));
      const list = el('div', { class: 'lib-list' });
      if (!AM.queue.length) list.appendChild(el('div', { class: 'muted' }, OS.t('Kuyruk boş. Kütüphanedeki “+⏵” ile parça ekleyin.')));
      AM.queue.forEach((id, i) => { const it = DJ.lib.items.find(x => x.id === id); list.appendChild(el('div', { class: 'lib-row q-row' }, el('span', { class: 'mono' }, String(i + 1)), el('span', { class: 'ln' }, it ? it.name : id), el('span', { class: 'mono' }, it && it.bpm ? it.bpm.toFixed(1) : ''),
        el('button', { class: 'btn sm', title: OS.t('Sıradaki yap'), onclick: () => { AM.queue.unshift(AM.queue.splice(i, 1)[0]); AM.refresh(); } }, '⤒'),
        el('button', { class: 'btn sm', onclick: () => { AM.queue.splice(i, 1); AM.refresh(); } }, '✕'))); });
      box.appendChild(list);
    };
    AM.refresh();
    return box;
  };

  // ---------------- Çalma geçmişi ----------------
  const HI = DJ.hist = { items: (() => { try { return JSON.parse(localStorage.getItem('os.djhist') || '[]'); } catch (e) { return []; } })() };
  HI.add = d => { HI.items.push({ t: Date.now(), name: d.name, bpm: d.bpm ? +(d.bpm * d.rate).toFixed(1) : 0, key: d.key || '', deck: d.L }); if (HI.items.length > 500) HI.items.shift(); try { localStorage.setItem('os.djhist', JSON.stringify(HI.items)); } catch (e) { } HI.refresh && HI.refresh(); };
  HI.session = () => { const a = HI.items; let i = a.length - 1; while (i > 0 && a[i].t - a[i - 1].t < 45 * 60000) i--; return a.slice(Math.max(0, i)); };
  HI.export = kind => {
    const S = HI.session(); if (!S.length) { U.toast(OS.t('Henüz çalınan parça yok.')); return; }
    const t0 = S[0].t, off = h => (h.t - t0) / 1000, two = n => String(Math.floor(n)).padStart(2, '0');
    const hms = s => (s >= 3600 ? two(s / 3600) + ':' : '') + two(s / 60 % 60) + ':' + two(s % 60);
    const q = x => String(x || '').replace(/"/g, "'");
    let txt, type = 'text/plain;charset=utf-8', ext = kind;
    if (kind === 'txt') txt = S.map((h, i) => hms(off(h)) + '  ' + (i + 1) + '. ' + h.name + (h.bpm ? '  [' + h.bpm + ' BPM' + (h.key ? ' · ' + h.key : '') + ']' : '')).join('\n') + '\n';
    else if (kind === 'csv') { type = 'text/csv;charset=utf-8'; txt = '\ufeff#,Time,Name,BPM,Key,Deck\n' + S.map((h, i) => [i + 1, hms(off(h)), '"' + String(h.name).replace(/"/g, '""') + '"', h.bpm || '', h.key || '', h.deck].join(',')).join('\n') + '\n'; }
    else {
      const art = (window.OS_MY_MUSIC && OS_MY_MUSIC.artist) || '';
      txt = 'PERFORMER "' + q(art) + '"\nTITLE "DJ Set ' + new Date(t0).toLocaleDateString() + '"\nFILE "mix.wav" WAVE\n' + S.map((h, i) => { const s = off(h), m = Math.floor(s / 60), sc = Math.floor(s % 60), fr = Math.floor((s % 1) * 75); return '  TRACK ' + two(i + 1) + ' AUDIO\n    TITLE "' + q(h.name) + '"\n    INDEX 01 ' + two(m) + ':' + two(sc) + ':' + two(fr); }).join('\n') + '\n';
    }
    U.download(new Blob([txt], { type }), 'dj-set-' + new Date(t0).toISOString().slice(0, 10) + '.' + ext);
  };
  HI.ui = function () {
    const box = el('div', { class: 'dj-panel' });
    HI.refresh = () => {
      box.innerHTML = '';
      box.append(el('div', { class: 'row' }, el('b', null, OS.t('Geçmiş')),
        el('button', { class: 'btn sm', onclick: () => U.download(new Blob([HI.items.map(h => new Date(h.t).toLocaleString() + '\t' + h.deck + '\t' + h.name + '\t' + h.bpm + ' BPM\t' + h.key).join('\n')], { type: 'text/plain;charset=utf-8' }), 'dj-gecmis.txt') }, 'TXT indir'),
        el('button', { class: 'btn sm', title: OS.t('Son oturumun zaman damgalı parça listesi (mix açıklaması için)'), onclick: () => HI.export('txt') }, 'Tracklist'),
        el('button', { class: 'btn sm', title: OS.t('Kaydedilmiş mix dosyası için CUE sayfası'), onclick: () => HI.export('cue') }, 'CUE'),
        el('button', { class: 'btn sm', onclick: () => HI.export('csv') }, 'CSV'),
        el('button', { class: 'btn sm', onclick: () => { HI.items = []; localStorage.removeItem('os.djhist'); HI.refresh(); } }, 'Temizle')));
      const list = el('div', { class: 'lib-list' });
      HI.items.slice().reverse().slice(0, 100).forEach(h => list.appendChild(el('div', { class: 'lib-row q-row' }, el('span', { class: 'mono' }, new Date(h.t).toLocaleTimeString().slice(0, 5)), el('span', { class: 'ln' }, h.name), el('span', { class: 'mono' }, h.bpm ? String(h.bpm) : ''), el('span', { class: 'mono' }, h.key))));
      if (!HI.items.length) list.appendChild(el('div', { class: 'muted' }, OS.t('Henüz çalınan parça yok.')));
      box.appendChild(list);
    };
    HI.refresh();
    return box;
  };

  // ---------------- Dosya etiketleri (ID3v2) ve uyumlu ton ----------------
  async function readTags(f) {
    const out = {};
    try {
      const head = new Uint8Array(await f.slice(0, 600000).arrayBuffer());
      if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return out;
      const ver = head[3], sz = b => ver === 4 ? (head[b] << 21) | (head[b + 1] << 14) | (head[b + 2] << 7) | head[b + 3] : (head[b] * 16777216) + (head[b + 1] << 16) + (head[b + 2] << 8) + head[b + 3];
      const end = Math.min(head.length, 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]));
      const text = (a, b) => { const e = head[a], u = head.subarray(a + 1, b); return new TextDecoder(e === 1 ? 'utf-16' : e === 2 ? 'utf-16be' : e === 3 ? 'utf-8' : 'iso-8859-1').decode(u).replace(/\0+$/, '').trim(); };
      const MAP = { TIT2: 'name', TPE1: 'artist', TALB: 'album', TCON: 'genre', TYER: 'year', TDRC: 'year', COMM: null };
      let o = 10;
      if (ver < 3) return out;
      while (o + 10 < end) {
        const id = String.fromCharCode(head[o], head[o + 1], head[o + 2], head[o + 3]), n = sz(o + 4);
        if (!/^[A-Z0-9]{4}$/.test(id) || n <= 0 || o + 10 + n > head.length) break;
        const a = o + 10, b = a + n;
        if (MAP[id]) { const v = text(a, b); if (v) out[MAP[id]] = v; }
        else if (id === 'APIC' && n < 400000) {
          let c = a + 1; while (c < b && head[c]) c++;
          const mime = new TextDecoder().decode(head.subarray(a + 1, c)) || 'image/jpeg', wide = head[a] === 1 || head[a] === 2; c += 2;
          if (wide) { while (c + 1 < b && (head[c] || head[c + 1])) c += 2; c += 2; } else { while (c < b && head[c]) c++; c++; }
          out.cover = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(undefined); fr.readAsDataURL(new Blob([head.subarray(c, b)], { type: mime })); });
          if (!out.cover) delete out.cover;
        }
        o = b;
      }
    } catch (e) { }
    return out;
  }
  // Uyum: aynı ton, göreli majör/minör, beşli çemberinde komşu
  // ---------------- Uyumlu set sıralama (ton çemberi + BPM akışı) ----------------
  function keyPos(k) {
    if (!k || k === '…') return null;
    const m = k.endsWith('m'), r = U.NOTE_NAMES.indexOf(m ? k.slice(0, -1) : k);
    return r < 0 ? null : { m, p: ((m ? r + 3 : r) * 7) % 12 };
  }
  function keyDist(a, b) {
    const x = keyPos(a), y = keyPos(b); if (!x || !y) return null;
    const df = Math.abs(x.p - y.p), c = Math.min(df, 12 - df);
    return c + (x.m === y.m ? 0 : 1);
  }
  function bpmGap(a, b) {
    if (!a || !b) return null;
    return Math.min(...[0.5, 1, 2].map(k => Math.abs(b * k / a - 1))) * 100;
  }
  // Bir parçadan diğerine geçişin maliyeti: ton uzaklığı + BPM farkı (%), hafif yükselen tempo tercih edilir
  function stepCost(a, b) {
    const kd = keyDist(a.key, b.key), bg = bpmGap(a.bpm, b.bpm);
    if (kd == null && bg == null) return 60;
    let c = (kd == null ? 4 : kd <= 1 ? kd : kd * 2.5) * 3 + (bg == null ? 6 : bg);
    if (a.bpm && b.bpm && b.bpm < a.bpm * 0.985 && bpmGap(a.bpm, b.bpm) > 1.5) c += 1.5;
    return c;
  }
  DJ.setOrder = function (items, start) {
    const pool = items.slice(), out = [];
    let cur = start && start.id ? pool.find(x => x.id === start.id) : null;
    if (cur) { pool.splice(pool.indexOf(cur), 1); out.push(cur); }
    else if (start) cur = start;
    else { pool.sort((a, b) => (a.bpm || 999) - (b.bpm || 999)); cur = pool.shift(); if (!cur) return out; out.push(cur); }
    while (pool.length) {
      let bi = 0, bc = Infinity;
      pool.forEach((x, i) => { const c = stepCost(cur, x); if (c < bc) { bc = c; bi = i; } });
      cur = pool.splice(bi, 1)[0]; out.push(cur);
    }
    return out;
  };
  DJ.setFlow = function (list) {
    let ok = 0, n = 0;
    for (let i = 1; i < list.length; i++) { const kd = keyDist(list[i - 1].key, list[i].key), bg = bpmGap(list[i - 1].bpm, list[i].bpm); if (kd == null && bg == null) continue; n++; if ((kd == null || kd <= 1) && (bg == null || bg <= 6)) ok++; }
    return n ? Math.round(ok / n * 100) : null;
  };
  DJ._set = { keyDist, bpmGap, stepCost };

  function keysFit(a, b) {
    if (!a || !b || a === '…' || b === '…') return false;
    const pos = k => { const m = k.endsWith('m'), r = U.NOTE_NAMES.indexOf(m ? k.slice(0, -1) : k); return r < 0 ? null : { m, p: (((m ? r + 3 : r) * 7) % 12) }; };
    const x = pos(a), y = pos(b); if (!x || !y) return false;
    const df = (x.p - y.p + 12) % 12;
    return x.m === y.m ? (df === 0 || df === 1 || df === 11) : df === 0;
  }

  // ---------------- Yabancı kütüphane biçimleri ----------------
  const baseName = p => decodeURIComponent(String(p || '')).replace(/\\/g, '/').split('/').pop();
  const SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  function normKey(k) {
    if (!k) return '';
    k = k.trim();
    const m = /^([A-G])([#b♯♭]?)(m|min|minor)?/i.exec(k); if (!m) return '';
    let root = m[1].toUpperCase() + (m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2]);
    root = SHARP[root] || root; return root + (m[3] ? 'm' : '');
  }
  const NML_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function parseForeign(txt, name) {
    const entries = [], lists = {};
    if (/\.m3u8?$/i.test(name)) {
      txt.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).forEach(l => entries.push({ file: baseName(l) }));
      lists[name.replace(/\.[^.]+$/, '')] = entries.map(e => e.file);
      return { entries, lists };
    }
    const doc = new DOMParser().parseFromString(txt, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error(OS.t('Dosya okunamadı (XML hatası)'));
    if (doc.querySelector('DJ_PLAYLISTS')) { // XML kütüphane biçimi
      const byId = {};
      doc.querySelectorAll('COLLECTION > TRACK').forEach(t => {
        const e = { file: baseName(t.getAttribute('Location')), title: t.getAttribute('Name'), artist: t.getAttribute('Artist'), bpm: +t.getAttribute('AverageBpm') || 0, key: normKey(t.getAttribute('Tonality')), hot: [] };
        const tempo = t.querySelector('TEMPO'); if (tempo) e.grid = +tempo.getAttribute('Inizio') || 0;
        t.querySelectorAll('POSITION_MARK').forEach(m => { const n = +m.getAttribute('Num'); if (n >= 0 && n < 8) e.hot[n] = +m.getAttribute('Start'); });
        byId[t.getAttribute('TrackID')] = e; entries.push(e);
      });
      doc.querySelectorAll('NODE[Type="1"]').forEach(n => { lists[n.getAttribute('Name')] = [...n.querySelectorAll('TRACK')].map(t => byId[t.getAttribute('Key')]).filter(Boolean).map(e => e.file); });
    } else if (doc.querySelector('NML')) { // NML koleksiyon biçimi
      doc.querySelectorAll('COLLECTION > ENTRY').forEach(en => {
        const loc = en.querySelector('LOCATION'); if (!loc) return;
        const e = { file: loc.getAttribute('FILE'), title: en.getAttribute('TITLE'), artist: en.getAttribute('ARTIST'), hot: [] };
        const tempo = en.querySelector('TEMPO'); if (tempo) e.bpm = +tempo.getAttribute('BPM') || 0;
        const mk = en.querySelector('MUSICAL_KEY'); if (mk) { const v = +mk.getAttribute('VALUE'); e.key = NML_KEYS[v % 12] + (v >= 12 ? 'm' : ''); }
        en.querySelectorAll('CUE_V2').forEach(c => { const type = +c.getAttribute('TYPE'), h = +c.getAttribute('HOTCUE'), st = +c.getAttribute('START') / 1000; if (type === 4) { if (e.grid == null) e.grid = st; } else if (h >= 0 && h < 8) e.hot[h] = st; });
        entries.push(e);
      });
      doc.querySelectorAll('NODE[TYPE="PLAYLIST"]').forEach(n => { lists[n.getAttribute('NAME')] = [...n.querySelectorAll('PRIMARYKEY')].map(pk => baseName((pk.getAttribute('KEY') || '').replace(/\/:/g, '/'))); });
    } else throw new Error(OS.t('Desteklenmeyen dosya: DJ Kütüphanesi XML, DJ Koleksiyonu NML veya M3U seçin'));
    return { entries, lists };
  }
  function pickFolder() {
    return new Promise(res => {
      const i = el('input', { type: 'file', webkitdirectory: true, multiple: true, style: 'display:none' });
      i.addEventListener('change', () => { res(Array.from(i.files || []).filter(f => /\.(mp3|wav|aiff?|flac|m4a|aac|ogg|opus|mp4|webm)$/i.test(f.name))); i.remove(); });
      document.body.appendChild(i); i.click();
    });
  }
  DJ.parseForeign = parseForeign;

  // ---------------- MIDI controller eşleme ----------------
  function midiKey(st, d1) { const cmd = st & 0xf0, ch = st & 0x0f; return cmd === 0xe0 ? 'pb:' + ch : (cmd === 0xb0 ? 'cc' : 'note') + ':' + ch + ':' + d1; }
  const MSB = {}, HAS_LSB = {}, MOMENTARY = /^(shift|pad\d+|[ABCD]\.hot\d|[ABCD]\.jogtouchs?|[ABCD]\.cue|xenable)$/;
  // Göreli enkoder biçimleri: ikiye tümleyen (1..63 / 127..65), merkez 64, işaret biti
  function relDelta(raw) {
    const m = settings.jogMode || 'auto';
    if (m === 'offset' || (m === 'auto' && raw >= 40 && raw <= 88)) return raw - 64;
    if (m === 'sign') return raw & 64 ? -(raw & 63) : raw;
    return raw < 64 ? raw : raw - 128;
  }
  // Yumuşak devralma: donanım konumu ekrandaki değere ulaşmadan sıçrama olmaz
  const picked = {};
  function softBlock(a, d, act, v) {
    if (!settings.soft) return false;
    let cur = null;
    if (a === 'xfader') cur = DJ.xfade;
    else if (d && act === 'vol') cur = d.faderVal;
    else if (d && act === 'pitch') cur = (d.rate - 1) / d.range * (settings.pitchInv ? -0.5 : 0.5) + 0.5;
    else if (d && act === 'filter') cur = (d.filterVal || 0) * 0.5 + 0.5;
    if (cur == null) return false;
    if (Math.abs(cur - v) > (picked[a] ? 0.25 : 0.04)) { picked[a] = false; return true; }
    picked[a] = true;
    return false;
  }
  // Öğrenme: jog ve faderler yalnız sürekli sinyalle bağlanır, jog dokunma sinyali dönüş sanılmaz.
  // Jog'un iki bölgesi (üst yüzey / kenar) aynı eyleme bağlanabilir.
  function learnBind(key, isCC) {
    const p = DJ.pending, cur = settings.map[key], isJog = /\.jog$/.test(p);
    if (DJ.ctrl.continuous(p) && !isCC) return;
    if (cur && /\.jog$/.test(cur) && cur !== p) return;
    Object.keys(settings.map).forEach(k => { if (settings.map[k] === p && !(isJog && /^cc:/.test(k))) delete settings.map[k]; });
    settings.map[key] = p; DJ.ctrl.mapChanged();
    const e = learnEls.get(p); if (e) { e.classList.remove('pending'); e.classList.add('mapped'); }
    U.toast(p + ' ← ' + key); DJ.pending = null;
    if (DJ.ctrl.menuLearn) { DJ.ctrl.menuLearn = false; DJ.learn = false; DJ.ctrl.drawMenu && DJ.ctrl.drawMenu(); }
  }
  // Dış girişler (HID): MIDI ile aynı öğrenme ve eylem yolu
  DJ.input = function (key, v, raw, press, release, isCC) {
    DJ.monitor && DJ.monitor(key, null);
    if (DJ.learn && DJ.pending) {
      if (release) return;
      learnBind(key, isCC);
      return;
    }
    const action = settings.map[key]; if (!action || !built) return;
    if (release) {
      if (action === 'shift') DJ.shift = false;
      if (/^pad\d+$/.test(action)) DJ.pads.release(+action.slice(3) - 1);
      if (/^[ABCD]\.hot\d$/.test(action)) { padRelease(DJ.decks[LETTERS.indexOf(action[0])], +action.slice(5) - 1); DJ.renderInfo(); }
      if (/^[ABCD]\.jogtouchs?$/.test(action)) jogTouch(DJ.decks[LETTERS.indexOf(action[0])], false);
      if (action === 'xenable') { DJ.xOff = true; DJ.xfade = 0.5; applyX(); }
      if (/^[ABCD]\.cue$/.test(action)) { DJ.decks[LETTERS.indexOf(action[0])].cueUp(); DJ.renderInfo(); }
      return;
    }
    runAction(action, v, raw, press, isCC);
  };
  function onMidi(data) {
    const [st, d1, d2] = data, cmd = st & 0xf0, ch = st & 0x0f;
    if (cmd !== 0x90 && cmd !== 0x80 && cmd !== 0xb0 && cmd !== 0xe0) return false;
    // 14-bit CC: MSB (0-31) + LSB (32-63) çiftleri; LSB gelince ince değer üretilir
    if (cmd === 0xb0 && d1 >= 32 && d1 < 64) {
      const mk = 'cc:' + ch + ':' + (d1 - 32), act = settings.map[mk];
      if (!settings.map['cc:' + ch + ':' + d1] && MSB[mk] != null && (act || (DJ.learn && DJ.pending))) {
        HAS_LSB[mk] = true;
        if (act && built && !DJ.learn) runAction(act, (MSB[mk] * 128 + d2) / 16383, MSB[mk], false, true);
        return true;
      }
    }
    if (cmd === 0xb0 && d1 < 32) MSB['cc:' + ch + ':' + d1] = d2;
    DJ.monitor && DJ.monitor(midiKey(st, d1), data);
    if (cmd === 0xb0 && !(DJ.learn && DJ.pending) && HAS_LSB['cc:' + ch + ':' + d1]) return true;
    if (cmd === 0xe0) { // pitch bend (çoğu controller'da tempo faderi), 14-bit
      const key = 'pb:' + ch, val = ((d2 << 7) | d1) / 16383;
      if (DJ.learn && DJ.pending) { learnBind(key, true); return true; }
      const act = settings.map[key]; if (!act || !built) return false;
      runAction(act, val, Math.round(val * 127), false, true); return true;
    }
    const key = midiKey(st, d1);
    if (DJ.learn && DJ.pending) {
      if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) return true;
      learnBind(key, cmd === 0xb0);
      return true;
    }
    const action = settings.map[key];
    if (!action && built && (cmd === 0x90 ? d2 > 0 : cmd === 0xb0) && DJ.ctrl && DJ.ctrl.unmapped) DJ.ctrl.unmapped(key);
    if (!action || !built) return false;
    const press = cmd === 0x90 && d2 > 0, release = cmd === 0x80 || (cmd === 0x90 && d2 === 0) || (cmd === 0xb0 && d2 === 0 && MOMENTARY.test(action)), v = d2 / 127;
    if (release) {
      if (action === 'shift') DJ.shift = false;
      if (/^pad\d+$/.test(action)) DJ.pads.release(+action.slice(3) - 1);
      if (/^[ABCD]\.hot\d$/.test(action)) { const dk = DJ.decks[LETTERS.indexOf(action[0])]; padRelease(dk, +action.slice(5) - 1); DJ.renderInfo(); }
      if (/^[ABCD]\.jogtouchs?$/.test(action)) jogTouch(DJ.decks[LETTERS.indexOf(action[0])], false);
      if (action === 'xenable') { DJ.xOff = true; DJ.xfade = 0.5; applyX(); }
      if (/^[ABCD]\.cue$/.test(action)) { DJ.decks[LETTERS.indexOf(action[0])].cueUp(); DJ.renderInfo(); }
      return true;
    }
    runAction(action, cmd === 0xb0 ? v : 1, d2, press, cmd === 0xb0);
    return true;
  }
  // Vinyl modu: jog'a dokununca plak el hızını izler, bırakınca kaldığı yerden devam eder
  function jogTouch(d, on) {
    if (!d) return;
    d.touched = on;
    if (!settings.vinyl) { d.scratchOff(); return; }
    if (on) d.scratchOn(); else d.scratchOff();
    DJ.renderInfo();
  }
  // ---------------- Controller LED geri bildirimi ----------------
  const ledState = {};
  function feedback() {
    if (!settings.led || !OS.midiAccess || !built) return;
    const outs = [...OS.midiAccess.outputs.values()]; if (!outs.length) return;
    Object.keys(settings.map).forEach(k => {
      const a = settings.map[k], d = DJ.decks[LETTERS.indexOf(a[0])], act = a.slice(2);
      if (!d || a[1] !== '.') return;
      let on = null;
      if (act === 'play') on = d.playing; else if (act === 'cue') on = !d.playing && Math.abs(d.pos - d.cue) < 0.02;
      else if (act === 'keylock') on = d.keylock; else if (act === 'headcue') on = d.cueOn; else if (act === 'sync') on = !!d.bpm && Math.abs(d.rate - 1) > 0.0005;
      else if (act.startsWith('hot')) on = d.hot[+act.slice(3) - 1] != null;
      else if (/^loop\d/.test(act)) on = !!(d.loop && d.loop.beats === +act.slice(4));
      else if (act.startsWith('stem_')) on = !!d.stems && d.stemG[act.slice(5)].gain.value > 0.5;
      else if (act.startsWith('kill')) on = d.kills[act.slice(4)];
      if (on == null || ledState[k] === on) return;
      ledState[k] = on;
      const [type, ch, num] = k.split(':'); if (type !== 'cc' && type !== 'note') return;
      const msg = [(type === 'cc' ? 0xb0 : 0x90) | +ch, +num, on ? 127 : 0];
      outs.forEach(o => { try { o.send(msg); } catch (e) { } });
    });
  }
  DJ.feedback = feedback;
  setInterval(feedback, 150);
  function setKnob(k, v) { if (k && k.setValue) k.setValue(v); }
  function runAction(a, v, raw, press, isCC) {
    const btn = press || (isCC && raw > 63);
    const dA = DJ.decks[LETTERS.indexOf(a[0])], actA = a.slice(2);
    if (isCC && a[1] === '.' && softBlock(a, dA, actA, v)) return;
    if (a === 'xfader' && isCC && softBlock(a, null, '', v)) return;
    if (a === 'shift') { if (btn) DJ.shift = true; return; }
    if (a === 'mfx') { setMasterFxAmt(v); return; }
    if (a === 'lib.scroll') { DJ.lib.move(isCC ? Math.sign(relDelta(raw)) : 1); return; }
    if (a === 'lib.up') { if (btn) DJ.lib.move(-1); return; }
    if (a === 'lib.down') { if (btn) DJ.lib.move(1); return; }
    if (a === 'xcurve') { DJ.curve = raw > 63 ? 1 : 0; applyX(); return; }
    if (a === 'xenable') { if (btn) { DJ.xOff = false; if (DJ.xfEl) { DJ.xfade = +DJ.xfEl.value; applyX(); } } return; }
    if (/^mfx[0-4]$/.test(a)) { if (btn) { const id = ['', 'fx.delay', 'fx.reverb', 'fx.flanger', 'fx.tremolo'][+a[3]]; setMasterFx(DJ.mfx.id === id ? '' : id); DJ.render(); } return; }
    if (a === 'smartmix') { if (btn) { const [p, q] = DJ.decks; const ab = p.playing && q.playing ? DJ.xfade < 0.5 : p.playing; autoMix(ab ? 0 : 1, ab ? 1 : 0); } return; }
    if (a === 'automix') { if (btn) { const M = DJ.auto; M.on ? M.stop() : M.start(); DJ.renderInfo(); } return; }
    if (a === 'cuemix') { settings.cueMix = v; saveSettings(); applyOut(); return; }
    if (a === 'cuevol') { settings.cueVol = v * 1.5; saveSettings(); applyOut(); return; }
    if (a === 'samplervol') { DJ.pads.out.gain.value = v * 1.5; return; }
    if (a === 'bankprev' || a === 'banknext') { if (btn) { const P = DJ.pads, n = P.banks.length; P.bank = (P.bank + (a === 'banknext' ? 1 : -1) + n) % n; DJ.renderPads(); } return; }
    if (a === 'xfader') { if (DJ.xfEl) DJ.xfEl.value = v; if (DJ.xOff) return; DJ.xfade = v; applyX(); return; }
    if (a === 'master') { const db = -40 + v * 46; master.gain.value = U.dbToGain(db); setKnob(DJ.masterKnob, db); return; }
    if (a.startsWith('pad')) { if (btn) DJ.pads.trigger(+a.slice(3) - 1); return; }
    const d = DJ.decks[LETTERS.indexOf(a[0])], act = a.slice(2);
    if (!d) return;
    const upd = () => DJ.renderInfo();
    switch (true) {
      case act === 'play': if (btn) { d.toggle(); upd(); } break;
      case act === 'cue': if (btn) { d.cueBtn(); upd(); } break;
      case act === 'sync': if (btn) { const o = otherDeck(d); if (o) d.sync(o); if (d.pitchEl) d.pitchEl.value = U.clamp((d.rate - 1) / d.range, -1, 1); upd(); } break;
      case act === 'keylock': if (btn) { d.setKeyLock(!d.keylock); upd(); } break;
      case act === 'headcue': if (btn) { d.setCue(!d.cueOn); applyOut(); upd(); } break;
      case act === 'brake': if (btn) { d.brake(); upd(); } break;
      case act === 'spin': if (btn) { d.spinback(); upd(); } break;
      case act === 'reverse': if (btn) { d.setReverse(!d.rev); upd(); } break;
      case act === 'tap': if (btn) { d.tap(); upd(); } break;
      case act === 'load': if (btn && DJ.lib.sel) DJ.lib.toDeck(DJ.lib.sel, d.idx); break;
      case act === 'padnext': if (btn) { cyclePad(d, 1); upd(); } break;
      case act === 'padprev': if (btn) { cyclePad(d, -1); upd(); } break;
      case act === 'trim': d.trim.gain.value = U.dbToGain(-12 + v * 24); break;
      case act === 'loopin': if (btn) { const m0 = d.padMode; d.padMode = 'manual'; padPress(d, 0, false); d.padMode = m0; upd(); } break;
      case act === 'loopout': if (btn) { const m0 = d.padMode; d.padMode = 'manual'; padPress(d, 1, false); d.padMode = m0; upd(); } break;
      case act === 'loophalf': if (btn) { const m0 = d.padMode; d.padMode = 'manual'; padPress(d, 2, false); d.padMode = m0; upd(); } break;
      case act === 'loopdouble': if (btn) { const m0 = d.padMode; d.padMode = 'manual'; padPress(d, 3, false); d.padMode = m0; upd(); } break;
      case act === 'loopexit': if (btn) { d.setLoop(0); upd(); } break;
      case act === 'stutter': if (btn && d.buffer) { if (d.playing) d.seek(d.cue); else { d.pos = d.cue; d.play(); } upd(); } break;
      case act === 'tostart': if (btn && d.buffer) { d.seek(0); upd(); } break;
      case act === 'keymatch': if (btn) { keyMatch(d); upd(); } break;
      case act === 'jogtouchs': break;
      case act === 'jumpenc': { const s = relDelta(raw); if (s) d.jump(s > 0 ? settings.jump : -settings.jump); upd(); break; }
      case act === 'jogseek': { d._skT = (d._skT || 0) + relDelta(raw); if (!d._sk) d._sk = setTimeout(() => { d._sk = null; const t = d._skT; d._skT = 0; d.seek(d.position() + t * 0.02 * (settings.jogSens || 1)); DJ.renderInfo(); }, 40); break; }
      case act === 'loopauto': if (btn) { d.setLoop(d.loop ? 0 : (d.loopSize || 4)); upd(); } break;
      case act === 'loopenc': { const s = relDelta(raw); if (!s) break; d.loopSize = U.clamp((d.loopSize || 4) * (s > 0 ? 2 : 0.5), 1 / 32, 128); if (d.loop) d.setLoop(d.loopSize); U.toast(d.L + ': ' + d.loopSize + ' ' + OS.t('vuruş')); upd(); break; }
      case act === 'slip': if (btn) { settings.slip = !settings.slip; saveSettings(); DJ.render(); } break;
      case act === 'quant': if (btn) { settings.quantize = !settings.quantize; saveSettings(); DJ.render(); } break;
      case act === 'vinyl': if (btn) { settings.vinyl = !settings.vinyl; saveSettings(); DJ.render(); } break;
      case act.startsWith('padm_'): if (btn) { d.padMode = act.slice(5); upd(); } break;
      case act === 'fx2': d.setFxAmt(v, 1); setKnob(d.fxKnob1, v); break;
      case act === 'fx3': d.setFxAmt(v, 2); setKnob(d.fxKnob2, v); break;
      case act === 'jumpback': if (btn) d.jump(-settings.jump); break;
      case act === 'jumpfwd': if (btn) d.jump(settings.jump); break;
      case act === 'pitch': { const x = (v * 2 - 1) * (settings.pitchInv ? -1 : 1); d.setRate(1 + x * d.range); if (d.pitchEl) d.pitchEl.value = x; upd(); break; }
      case act === 'vol': d.setFader(v); if (d.faderEl) d.faderEl.value = v; break;
      case act === 'res': d.setRes(0.5 * Math.pow(30, v)); break;
      case act === 'sendA': d.sendA.gain.value = v; break;
      case act === 'sendB': d.sendB.gain.value = v; break;
      case act.startsWith('stemlvl_'): if (d.stems) d.stemL[act.slice(8)].gain.value = v * 1.5; break;
      case act.startsWith('stemfx_'): if (d.stems) d.stemFx[act.slice(7)].gain.value = v; break;
      case act === 'jogtouch': if (press) jogTouch(d, true); break;
      case act === 'filter': { const x = v * 2 - 1; const xx = Math.abs(x) < 0.03 ? 0 : x; d.setFilter(xx); setKnob(d.filterKnob, xx); break; }
      case act === 'fx': d.setFxAmt(v); setKnob(d.fxKnob0, v); break;
      case act.startsWith('eq'): { const b = act.slice(2), lo = settings.eqBands === 4 ? -40 : -26, db = Math.abs(v - 0.5) < 0.012 ? 0 : v < 0.5 ? lo * (1 - v * 2) : (v - 0.5) * 12; d.setEQ(b, db); setKnob(d['knob_' + b], db); break; }
      case act.startsWith('kill'): if (btn) d.kill(act.slice(4)); break;
      case act.startsWith('stem_'): if (btn && d.stems) { d.toggleStem(act.slice(5)); upd(); } break;
      case act.startsWith('hot'): if (btn) { padPress(d, +act.slice(3) - 1, !!DJ.shift); upd(); } break;
      case act === 'keyup': if (btn) { d.setKeyShift((d.keyShift || 0) + 1); upd(); } break;
      case act === 'keydown': if (btn) { d.setKeyShift((d.keyShift || 0) - 1); upd(); } break;
      case act.startsWith('loop'): if (btn) { d.setLoop(+act.slice(4)); upd(); } break;
      case act === 'jog': {
        // göreli CC: 1..63 ileri, 65..127 geri (çoğu controller böyle gönderir)
        const delta = isCC ? relDelta(raw) : 0, sens = settings.jogSens || 1;
        if (!delta) break;
        if (d.scr) { d.scr.ticks += delta; break; } // vinyl: plak el hızını izler
        if (d.playing) { d.jogBend(delta); }
        else d.seek(d.position() + delta * 4 * sens * 60 / (33.333 * (settings.jogRes || 720)));
        break;
      }
    }
  }
  function midiMenu(e) {
    const n = Object.keys(settings.map || {}).length;
    U.menu(e.clientX, e.clientY, [
      { header: n + ' eşleme kayıtlı' },
      { label: 'Eşlemeyi dosyaya kaydet…', onclick: () => U.download(new Blob([JSON.stringify({ app: 'MrMars-DJ-MIDI', map: settings.map }, null, 1)], { type: 'application/json' }), 'dj-midi-esleme.json') },
      { label: 'Eşleme dosyası yükle…', onclick: async () => { const [f] = await U.pickFiles('.json'); if (!f) return; try { const j = JSON.parse(await U.readAsText(f)); settings.map = j.map || {}; saveSettings(); U.toast('Eşleme yüklendi'); DJ.render(); } catch (er) { U.toast('Geçersiz dosya'); } } },
      { label: 'Tüm eşlemeleri sil', onclick: () => { settings.map = {}; saveSettings(); DJ.render(); } },
    ]);
  }

  const mb = new Float32Array(1024);
  function frame() {
    if (root.classList.contains('active')) {
      if (DJ.limEl && DJ.limIn) { DJ.limIn.getFloatTimeDomainData(mb); let pk = 0; for (let i = 0; i < mb.length; i++) { const a = Math.abs(mb[i]); if (a > pk) pk = a; } if (pk * 4 > 0.89) DJ.limT = performance.now(); DJ.limEl.classList.toggle('on', performance.now() - (DJ.limT || -1e9) < 300); }
      DJ.decks.slice(0, settings.count).forEach(d => {
        d.draw && d.draw();
        if (d.meterCv && d.meterCv.isConnected) {
          const cv = d.meterCv, w = cv.width = 10, h = cv.height = cv.clientHeight || 120, g = cv.getContext('2d');
          const f = U.clamp((U.gainToDb(U.meterLevel(d.an, mb)) + 50) / 53, 0, 1);
          g.clearRect(0, 0, w, h); g.fillStyle = f > 0.94 ? '#ef4444' : f > 0.75 ? '#e5d43a' : '#39c27a'; g.fillRect(0, h - f * h, w, f * h);
        }
      });
    }
    requestAnimationFrame(frame);
  }

  // Klavye: 1-8 Deck A pedleri, Q-I Deck B pedleri, Z/X cue, C/V sync, ok tuşları crossfader
  const KEY_PADS = { Digit1: [0, 0], Digit2: [0, 1], Digit3: [0, 2], Digit4: [0, 3], Digit5: [0, 4], Digit6: [0, 5], Digit7: [0, 6], Digit8: [0, 7], KeyQ: [1, 0], KeyW: [1, 1], KeyE: [1, 2], KeyR: [1, 3], KeyT: [1, 4], KeyY: [1, 5], KeyU: [1, 6], KeyI: [1, 7] };
  DJ.KEY_HELP = [['Boşluk / Enter', 'Deck A / B çal-duraklat'], ['1 … 8', 'Deck A pedleri'], ['Q … I', 'Deck B pedleri'], ['Z / X', 'Deck A / B cue'], ['C / V', 'Deck A / B sync'], ['← / →', 'Crossfader'], ['Shift + ped', 'Pedin ikinci işlevi']];
  DJ.key = function (e) {
    if (!built) return false;
    if (e.code === 'Space') { DJ.decks[0].toggle(); DJ.renderInfo(); return true; }
    if (e.code === 'Enter') { DJ.decks[1].toggle(); DJ.renderInfo(); return true; }
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const kp = KEY_PADS[e.code];
    if (kp) { if (!e.repeat) { padPress(DJ.decks[kp[0]], kp[1], e.shiftKey); DJ.renderInfo(); } return true; }
    if (e.code === 'KeyZ' || e.code === 'KeyX') { DJ.decks[e.code === 'KeyZ' ? 0 : 1].cueBtn(); DJ.renderInfo(); return true; }
    if (e.code === 'KeyC' || e.code === 'KeyV') { const d = DJ.decks[e.code === 'KeyC' ? 0 : 1], o = otherDeck(d); if (o) d.sync(o); DJ.renderInfo(); return true; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { DJ.xfade = U.clamp(DJ.xfade + (e.code === 'ArrowLeft' ? -0.05 : 0.05), 0, 1); applyX(); if (DJ.xfEl) DJ.xfEl.value = DJ.xfade; return true; }
    return false;
  };
  addEventListener('keyup', e => { const kp = KEY_PADS[e.code]; if (kp && built && ui.view === 'dj') { padRelease(DJ.decks[kp[0]], kp[1]); DJ.renderInfo(); } });
  // Controller Merkezi ve video katmanı için iç erişim
  DJ._i = { settings, saveSettings, relDelta, applyOut, midiMenu, getMasterOut: () => masterOut, getMaster: () => master, getTap: () => DJ.tap, isBuilt: () => built, build,
    infoEls, topBar, padsUI, sendUI, runAction, padPress, padRelease, padLabel, padClass, padTitle, PAD_MODES, STEMS, STEM_LBL, FX, LETTERS, applyX, otherDeck, keyMatch, drawOverview, drawZoom, autoMix, toggleRec, setMasterFx, setMasterFxAmt, jogTouch };
})(window.OS);
