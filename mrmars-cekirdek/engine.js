/* Mr. Mars Music Studio · MRH DGN — ses motoru: grafik, aktarım (transport), zamanlayıcı, kayıt, render */
(function (OS) {
  const U = OS.U;

  const E = OS.engine = {
    ctx: null,
    buffers: new Map(),   // bufferId -> AudioBuffer
    nodes: new Map(),     // trackId -> canlı düğümler
    master: null,
    inputStream: null, inputSource: null, inputSplit: null,
    latencyMs: null,
  };

  // ---------------- Başlatma ----------------
  E.init = function () {
    if (E.ctx) return E.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    // gecikme hedefi: ayarlardan (en düşük ~3 ms tampon isteği; ses kartı/sürücü izin verdiği kadar)
    const lh = { low: 0.003, interactive: 'interactive', balanced: 'balanced', safe: 'playback' }[(OS.settings && OS.settings.latencyMode) || (OS.platform && OS.platform.touch ? 'safe' : 'balanced')] || 'balanced';
    const sr = OS.settings && +OS.settings.sampleRate;
    try { E.ctx = new AC(sr ? { latencyHint: lh, sampleRate: sr } : { latencyHint: lh }); } catch (e) { E.ctx = new AC({ latencyHint: 'interactive' }); }
    // "arka plandayken sürücüyü bırak": pencere gizlenince ve çalmıyorken ses motoru askıya alınır
    document.addEventListener('visibilitychange', () => {
      if (!OS.settings || !OS.settings.releaseBg) return;
      if (document.hidden && !OS.transport.playing && !OS.transport.recording && !(OS.ui && OS.ui.rig && OS.ui.rig.on)) E.ctx.suspend();
      else if (!document.hidden) E.ctx.resume();
    });
    E.clickOut = E.ctx.createGain(); E.clickOut.gain.value = 0.5; E.clickOut.connect(E.ctx.destination);
    E.monitorBus = E.ctx.createGain(); // DJ, amfi rack gibi bağımsız modüller buraya bağlanır
    E.monitorBus.connect(E.ctx.destination);
    return E.ctx;
  };
  E.resume = () => E.ctx && E.ctx.state !== 'running' ? E.ctx.resume() : Promise.resolve();

  // ---------------- Düğüm grafiği ----------------
  function makeStrip(ctx, opts) {
    const s = {
      input: ctx.createGain(), fader: ctx.createGain(), pan: ctx.createStereoPanner(), mute: ctx.createGain(),
      split: ctx.createChannelSplitter(2), anL: ctx.createAnalyser(), anR: ctx.createAnalyser(), sends: new Map(), devices: [], instrument: null,
    };
    s.anL.fftSize = s.anR.fftSize = 1024;
    s.fader.connect(s.pan); s.pan.connect(s.mute);
    s.mute.connect(s.split); s.split.connect(s.anL, 0); s.split.connect(s.anR, 1);
    if (opts && opts.dest) s.mute.connect(opts.dest);
    return s;
  }
  E.makeStrip = makeStrip;

  function wireChain(s, devices) {
    try { s.input.disconnect(); } catch (e) { }
    devices.forEach(d => { try { d.out.disconnect(); } catch (e) { } });
    let prev = s.input;
    devices.forEach(d => { prev.connect(d.in); prev = d.out; });
    prev.connect(s.fader);
    s.devices = devices;
  }
  E.wireChain = wireChain;

  // Yan zincir: seçilen parçanın sinyali, kompresörün kulağına gider
  function connectSide(nodes, P) {
    P.master.inserts.concat(...P.tracks.map(t => t.inserts)).forEach(d => {
      const side = d.inst && d.inst.side; if (!side) return;
      const want = d.extra && d.extra.source, s = want && nodes.get(want);
      if (d._scStrip === s) return;
      if (d._scStrip) { try { d._scStrip.fader.disconnect(side); } catch (e) { } }
      if (s) s.fader.connect(side);
      d._scStrip = s || null;
    });
  }

  function applyStrip(s, t, anySolo, live) {
    // canlıda otomasyon okunan parametrelere çalarken dokunulmaz (zamanlanmış rampaları bozar)
    if (!live) { s.fader.gain.value = U.dbToGain(t.vol); s.pan.pan.value = t.pan; }
    else {
      if (!OS.auto.liveControlled(t, 'vol')) { const v = OS.auto.staticVol(t); s.fader.gain.value = v <= -60 && OS.auto.readLane(t, 'vol') ? 0 : U.dbToGain(v); }
      if (!OS.auto.liveControlled(t, 'pan')) s.pan.pan.value = OS.auto.staticPan(t);
    }
    const muted = t.mute || (anySolo && !t.solo && t.type !== 'fx');
    s.mute.gain.value = muted ? 0 : 1;
  }

  E.ensureMaster = function () {
    const ctx = E.ctx, P = OS.project;
    if (!E.master) {
      E.master = makeStrip(ctx, { dest: ctx.destination });
      E.master.out = E.master.mute;
    }
    wireChain(E.master, P.master.inserts);
    E.master.fader.gain.value = U.dbToGain(P.master.vol);
  };

  // Projedeki tüm parçalar için canlı düğümleri oluşturur / günceller
  E.syncAll = function () {
    E.init(); E.ensureMaster();
    const P = OS.project;
    const ids = new Set(P.tracks.map(t => t.id));
    for (const [id, s] of E.nodes) if (!ids.has(id)) { try { s.mute.disconnect(); s.input.disconnect(); } catch (e) { } E.nodes.delete(id); }
    P.tracks.forEach(t => E.syncTrack(t, true));
    E.updateMix();
  };

  E.syncTrack = function (t, skipMix) {
    let s = E.nodes.get(t.id);
    if (!s) { s = makeStrip(E.ctx, { dest: E.master.input }); E.nodes.set(t.id, s); }
    if (t.instrument && s.instrument !== t.instrument) {
      if (s.instrument) { try { s.instrument.out.disconnect(); } catch (e) { } }
      t.instrument.out.connect(s.input); s.instrument = t.instrument;
    }
    wireChain(s, t.inserts);
    // gönderimler (sends) post-fader
    const P = OS.project;
    P.tracks.filter(b => b.type === 'fx' && b.id !== t.id).forEach(b => {
      let g = s.sends.get(b.id);
      if (!g) { g = E.ctx.createGain(); g.gain.value = 0; s.pan.connect(g); s.sends.set(b.id, g); }
    });
    E.updateMonitor(t);
    if (!skipMix) E.updateMix();
  };

  E.updateMix = function () {
    const P = OS.project, anySolo = P.tracks.some(t => t.solo);
    P.tracks.forEach(t => {
      const s = E.nodes.get(t.id); if (!s) return;
      applyStrip(s, t, anySolo, true);
      for (const [bid, g] of s.sends) {
        const bus = E.nodes.get(bid);
        if (bus && !g._to) { g.connect(bus.input); g._to = bid; }
        g.gain.value = (t.sends && t.sends[bid] != null) ? U.dbToGain(t.sends[bid]) : 0;
        if (t.sends && t.sends[bid] <= -60) g.gain.value = 0;
      }
    });
    if (E.master && !OS.auto.liveControlled(P.master, 'vol')) E.master.fader.gain.value = U.dbToGain(OS.auto.staticVol(P.master));
    if (E.master && !OS.auto.liveControlled(P.master, 'pan')) E.master.pan.pan.value = OS.auto.staticPan(P.master);
    connectSide(E.nodes, P);
  };

  // ---------------- Ses girişi ----------------
  E.openInput = async function (deviceId) {
    E.init();
    if (E.inputStream) E.inputStream.getTracks().forEach(t => t.stop());
    const c = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, latency: 0 };
    if (deviceId) c.deviceId = { exact: deviceId };
    E.inputStream = await navigator.mediaDevices.getUserMedia({ audio: c });
    E.inputSource = E.ctx.createMediaStreamSource(E.inputStream);
    E.inputSplit = E.ctx.createChannelSplitter(2);
    E.inputSource.connect(E.inputSplit);
    E.inputMono = { L: E.ctx.createGain(), R: E.ctx.createGain() };
    E.inputMono.L.channelCount = 1; E.inputMono.L.channelCountMode = 'explicit';
    E.inputMono.R.channelCount = 1; E.inputMono.R.channelCountMode = 'explicit';
    E.inputSplit.connect(E.inputMono.L, 0); E.inputSplit.connect(E.inputMono.R, 1);
    OS.project.tracks.forEach(E.updateMonitor);
    document.dispatchEvent(new CustomEvent('os-input'));
    return E.inputStream;
  };
  E.inputNode = function (ch) {
    if (!E.inputSource) return null;
    if (ch === 'L') return E.inputMono.L;
    if (ch === 'R') return E.inputMono.R;
    return E.inputSource;
  };
  E.updateMonitor = function (t) {
    const s = E.nodes.get(t.id); if (!s) return;
    if (s.monGain) { try { s.monGain.disconnect(); } catch (e) { } s.monGain = null; }
    if (t.type === 'audio' && t.monitor && E.inputSource) {
      s.monGain = E.ctx.createGain();
      E.inputNode(t.inputCh || 'L').connect(s.monGain);
      s.monGain.connect(s.input);
    }
  };

  // ---------------- Aktarım (transport) ----------------
  const T = OS.transport = {
    playing: false, recording: false,
    get bpm() { return OS.project ? OS.project.bpm : 120; },
    pos: 0,               // durdurulmuşken imleç (vuruş)
    seg: null, prevSeg: null,
    cursor: 0, timer: null, clampEnd: Infinity, sources: [], liveNotes: new Map(), recNotes: [],
  };
  const spb = () => 60 / T.bpm;
  // Swing: tek numaralı 16'lıklar geciktirilir (%100 = tam triyole)
  T.swing = function (b) {
    const sw = (OS.project && OS.project.swing) || 0;
    if (!sw) return b;
    const q = b * 4, r = Math.round(q);
    return Math.abs(q - r) < 0.02 && r % 2 === 1 ? b + sw / 100 * (1 / 12) : b;
  };
  T.secToBeat = s => s / spb();
  T.beatToSec = b => b * spb();
  T.beatToCtx = b => T.seg.ctx + (b - T.seg.beat) * spb();

  T.position = function () {
    if (!T.playing) return T.pos;
    const now = E.ctx.currentTime;
    let sg = T.seg;
    if (now < sg.ctx && T.prevSeg) sg = T.prevSeg;
    return sg.beat + (now - sg.ctx) / spb();
  };

  T.setPosition = function (b) {
    b = Math.max(0, b);
    if (T.playing) { T.stop(true); T.pos = b; T.play(); }
    else { T.pos = b; if (E.master) { E.updateMix(); OS.auto.applyAtPosition(); } }
    document.dispatchEvent(new CustomEvent('os-pos'));
  };

  function scheduleRange(a, b) {
    const P = OS.project;
    const anySolo = P.tracks.some(t => t.solo);
    P.tracks.forEach(t => {
      const s = E.nodes.get(t.id); if (!s) return;
      if (t.mute || (anySolo && !t.solo)) return;
      if (SES.owned.has(t.id)) return;
      t.clips.forEach(c => {
        if (c.muted) return;
        if (t.type === 'instrument' && c.notes && t.instrument) {
          if (c.start >= b || c.start + c.length <= a) return;
          c.notes.forEach(n => {
            const ns = c.start + n.s;
            if (n.s >= c.length) return;
            if (ns >= a && ns < b) {
              const len = Math.min(n.l, c.length - n.s);
              t.instrument.noteOn(n.p, n.v, T.beatToCtx(T.swing(ns)));
              t.instrument.noteOff(n.p, T.beatToCtx(Math.min(ns + len, T.clampEnd)));
            }
          });
        } else if (t.type === 'audio' && c.bufferId) {
          if (c.start >= a && c.start < b) startAudio(t, c, c.start, T.beatToCtx(c.start));
        }
      });
    });
    sessionSchedule(a, b);
    OS.auto.schedule(a, b);
    // tempoya bağlı cihazlar (pompa vb.)
    const devs = P.master.inserts.concat(...P.tracks.map(t => t.inserts));
    devs.forEach(d => { if (d.inst.schedule && !d.bypass) d.inst.schedule(a, b, T.beatToCtx); });
    if (P.metronome || (T.recording && P.metronomeRec !== false && P.metronome)) {
      for (let k = Math.ceil(a); k < b; k++) click(T.beatToCtx(k), k % P.sig[0] === 0);
    }
  }

  function startAudio(t, c, fromBeat, when) {
    const buf = E.buffers.get(c.bufferId); if (!buf) return;
    const s = E.nodes.get(t.id);
    const src = E.ctx.createBufferSource(), g = E.ctx.createGain();
    src.buffer = buf; g.gain.value = U.dbToGain(c.gain || 0);
    src.connect(g); g.connect(s.input);
    const into = T.beatToSec(fromBeat - c.start);
    const off = (c.offset || 0) + into, dur = T.beatToSec(c.length) - into;
    if (dur <= 0 || off >= buf.duration) return;
    // kenar yumuşatma (tık sesi önleme)
    const fi = c.fadeIn ? T.beatToSec(c.fadeIn) : 0.003, fo = c.fadeOut ? T.beatToSec(c.fadeOut) : 0.003;
    const gg = g.gain.value;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gg, when + Math.min(fi, dur / 2));
    g.gain.setValueAtTime(gg, when + Math.max(0, dur - fo)); g.gain.linearRampToValueAtTime(0, when + dur);
    src.start(when, off, Math.min(dur, buf.duration - off));
    src._track = t.id;
    T.sources.push(src);
    src.onended = () => { const i = T.sources.indexOf(src); if (i >= 0) T.sources.splice(i, 1); };
  }

  function startSpanning(beat, when) {
    OS.project.tracks.forEach(t => {
      if (t.type !== 'audio' || t.mute || SES.owned.has(t.id)) return;
      t.clips.forEach(c => { if (!c.muted && c.bufferId && c.start < beat && c.start + c.length > beat) startAudio(t, c, beat, when); });
      // MIDI: devam eden notalar
    });
    OS.project.tracks.forEach(t => {
      if (t.type !== 'instrument' || !t.instrument || t.mute || SES.owned.has(t.id)) return;
      t.clips.forEach(c => !c.muted && (c.notes || []).forEach(n => {
        const ns = c.start + n.s, ne = ns + Math.min(n.l, c.length - n.s);
        if (ns < beat && ne > beat + 0.01) { t.instrument.noteOn(n.p, n.v, when); t.instrument.noteOff(n.p, T.beatToCtx(ne)); }
      }));
    });
  }

  function click(when, accent) {
    const o = E.ctx.createOscillator(), g = E.ctx.createGain();
    o.frequency.value = accent ? 1600 : 1000; o.connect(g); g.connect(E.clickOut);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.5, when + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.start(when); o.stop(when + 0.06);
  }

  // ---------------- Session (klip başlatma) ----------------
  // playing: trackId -> { slot, start (vuruş) }, queue: trackId -> { slot | null (dur), at }
  const SES = OS.sessionState = { playing: new Map(), queue: new Map(), owned: new Set() };
  function sessionSchedule(a, b) {
    if (!SES.playing.size && !SES.queue.size) return;
    const P = OS.project;
    P.tracks.forEach(t => {
      const q = SES.queue.get(t.id);
      const segs = [];
      const cur = SES.playing.get(t.id);
      if (q && q.at < b) {
        if (cur) segs.push([cur, a, Math.max(a, q.at)]);
        const at = Math.max(a, q.at), wt = T.beatToCtx(at);
        T.sources.filter(s => s._track === t.id).forEach(s => { try { s.stop(wt); } catch (e) { } });
        SES.queue.delete(t.id);
        if (q.slot == null) SES.playing.delete(t.id);
        else { const nw = { slot: q.slot, start: q.at }; SES.playing.set(t.id, nw); SES.owned.add(t.id); segs.push([nw, at, b]); }
        document.dispatchEvent(new CustomEvent('os-session'));
      } else if (cur) segs.push([cur, a, b]);
      if (t.mute) return;
      segs.forEach(([pl, s0, s1]) => {
        const c = t.session && t.session[pl.slot]; if (!c || s1 <= s0) return;
        const L = Math.max(0.25, c.length), k0 = Math.max(0, Math.floor((s0 - pl.start) / L) - 1), k1 = Math.floor((s1 - pl.start) / L);
        for (let k = k0; k <= k1; k++) {
          const it = pl.start + k * L;
          if (c.notes && t.instrument) {
            c.notes.forEach(n => {
              if (n.s >= L) return;
              const ns = it + n.s; if (ns < s0 || ns >= s1 || ns < pl.start) return;
              const len = Math.min(n.l, L - n.s);
              t.instrument.noteOn(n.p, n.v, T.beatToCtx(T.swing(ns)));
              t.instrument.noteOff(n.p, T.beatToCtx(ns + len));
            });
          } else if (c.bufferId && it >= s0 && it < s1 && it >= pl.start) {
            startAudio(t, Object.assign({}, c, { start: it, length: L }), it, T.beatToCtx(it));
          }
        }
      });
    });
  }
  // Başlatma: niceleme (vuruş cinsinden) sonraki sınıra hizalanır
  E.sessionLaunch = async function (t, slot, quant) {
    const qn = quant == null ? OS.project.sig[0] : quant;
    if (!T.playing) {
      SES.queue.set(t.id, { slot, at: T.pos });
      await T.play();
    } else {
      const pos = T.position() + 0.05;
      const at = qn > 0 ? Math.ceil(pos / qn) * qn : pos;
      SES.queue.set(t.id, { slot, at: Math.max(at, T.cursor) });
    }
    document.dispatchEvent(new CustomEvent('os-session'));
  };
  E.sessionToArrangement = function () { SES.owned.clear(); SES.queue.clear(); SES.playing.forEach((v, k) => SES.queue.set(k, { slot: null, at: T.position() })); document.dispatchEvent(new CustomEvent('os-session')); };

  function tick() {
    const P = OS.project, ctx = E.ctx;
    const horizon = ctx.currentTime + 0.12;
    let guard = 0;
    while (guard++ < 8) {
      const hb = T.seg.beat + (horizon - T.seg.ctx) / spb();
      if (T.cursor >= hb) break;
      let end = hb;
      const loop = P.loop.on && !T.recording && !SES.playing.size && P.loop.end > P.loop.start && T.cursor < P.loop.end;
      if (loop && end >= P.loop.end) end = P.loop.end;
      T.clampEnd = loop ? P.loop.end : Infinity;
      scheduleRange(T.cursor, end);
      T.cursor = end;
      if (loop && T.cursor >= P.loop.end) {
        const wrap = T.beatToCtx(P.loop.end);
        T.sources.splice(0).forEach(s => { try { s.stop(wrap); } catch (e) { } });
        T.prevSeg = T.seg; T.seg = { ctx: wrap, beat: P.loop.start };
        T.cursor = P.loop.start;
        startSpanning(P.loop.start, wrap);
        OS.auto.start(P.loop.start, wrap);
      }
    }
    OS.auto.tickDevices();
    // proje sonunu geçince durdurma yok: kullanıcı durdurur
  }

  T.play = async function () {
    if (T.playing) return;
    await E.resume();
    E.syncAll();
    const P = OS.project;
    if (P.loop.on && !T.recording && (T.pos >= P.loop.end || T.pos < P.loop.start)) T.pos = P.loop.start;
    const when = E.ctx.currentTime + 0.06;
    T.seg = { ctx: when, beat: T.pos }; T.prevSeg = null;
    T.cursor = T.pos; T.playing = true;
    startSpanning(T.pos, when);
    OS.auto.start(T.pos, when);
    tick();
    T.timer = setInterval(tick, 25);
    document.dispatchEvent(new CustomEvent('os-transport'));
  };

  T.stop = function (keep) {
    if (!T.playing) { if (!keep) { T.pos = OS.project.loop.on ? OS.project.loop.start : 0; document.dispatchEvent(new CustomEvent('os-pos')); } return; }
    const at = T.position();
    clearInterval(T.timer); T.timer = null;
    T.sources.splice(0).forEach(s => { try { s.stop(); } catch (e) { } });
    OS.project.tracks.forEach(t => t.instrument && t.instrument.allOff());
    if (T.recording) finishRecording(at);
    SES.playing.clear(); SES.queue.clear(); SES.owned.clear();
    document.dispatchEvent(new CustomEvent('os-session'));
    T.playing = false;
    T.pos = at;
    OS.auto.stop(); E.updateMix(); OS.auto.applyAtPosition();
    OS.project.master.inserts.concat(...OS.project.tracks.map(t => t.inserts)).forEach(d => d.inst.stopped && d.inst.stopped());
    document.dispatchEvent(new CustomEvent('os-transport'));
  };

  // ---------------- Kayıt ----------------
  T.record = async function () {
    if (T.recording) { T.stop(true); return; }
    const P = OS.project;
    const armed = P.tracks.filter(t => t.arm);
    if (!armed.length) { U.toast('Kayıt için önce bir parçayı kayda hazırlayın (● düğmesi)'); return; }
    const audioArmed = armed.filter(t => t.type === 'audio');
    if (audioArmed.length && !E.inputSource) {
      try { await E.openInput(OS.settings.inputId); } catch (e) { U.toast('Ses girişi açılamadı: ' + e.message); return; }
    }
    if (T.playing) T.stop(true);
    T.recording = true;
    T.recStart = T.pos;
    T.recNotes = [];
    T.recTracks = audioArmed.map(t => {
      const sp = E.ctx.createScriptProcessor(4096, 2, 2), chunksL = [], chunksR = [], silent = E.ctx.createGain();
      silent.gain.value = 0;
      const node = E.inputNode(t.inputCh || 'L');
      const merger = E.ctx.createGain(); node.connect(merger); merger.connect(sp); sp.connect(silent); silent.connect(E.ctx.destination);
      const rec = { track: t, sp, chunksL, chunksR, node, merger, silent, firstTime: null };
      sp.onaudioprocess = e => {
        if (!T.recording) return;
        if (rec.firstTime == null) rec.firstTime = e.playbackTime;
        chunksL.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        chunksR.push(new Float32Array(e.inputBuffer.getChannelData(e.inputBuffer.numberOfChannels > 1 ? 1 : 0)));
      };
      return rec;
    });
    await T.play();
    T.recCtxStart = T.seg.ctx;
    document.dispatchEvent(new CustomEvent('os-transport'));
  };

  /** Kaydedilmekte olan çekimi (ses ve notalar) geri alma adımı bırakmadan atar ve aynı yerden yeniden kaydeder. */
  T.retryTake = async function () {
    if (!T.recording) { U.toast(OS.t('Şu an kayıt yapılmıyor')); return; }
    const start = T.recStart;
    T.recording = false;
    (T.recTracks || []).forEach(r => { try { r.merger.disconnect(); r.sp.disconnect(); r.silent.disconnect(); } catch (e) { } });
    T.recTracks = []; T.recNotes = [];
    T.stop(true);
    T.setPosition(start);
    U.toast(OS.t('Çekim atıldı, yeniden kaydediliyor'));
    await T.record();
  };

  function finishRecording(atBeat) {
    T.recording = false;
    const P = OS.project, sr = E.ctx.sampleRate;
    let changed = false;
    OS.history && OS.history.push();
    (T.recTracks || []).forEach(rec => {
      try { rec.merger.disconnect(); rec.sp.disconnect(); rec.silent.disconnect(); } catch (e) { }
      const total = rec.chunksL.reduce((a, c) => a + c.length, 0);
      if (!total) return;
      const L = new Float32Array(total), Rr = new Float32Array(total);
      let o = 0; rec.chunksL.forEach((c, i) => { L.set(c, o); Rr.set(rec.chunksR[i], o); o += c.length; });
      // gecikme telafisi + kayıt başlangıcına hizalama
      const lat = (OS.settings.latencyMs != null ? OS.settings.latencyMs : ((E.ctx.baseLatency || 0) + (E.ctx.outputLatency || 0)) * 1000) / 1000;
      const lead = Math.max(0, (T.recCtxStart - (rec.firstTime || T.recCtxStart)) + lat);
      const skip = Math.min(total - 1, Math.floor(lead * sr));
      const len = total - skip;
      const mono = rec.track.inputCh !== 'stereo';
      const buf = E.ctx.createBuffer(mono ? 1 : 2, len, sr);
      buf.copyToChannel(L.subarray(skip), 0);
      if (!mono) buf.copyToChannel(Rr.subarray(skip), 1);
      const id = U.uid();
      E.buffers.set(id, buf);
      OS.store && OS.store.saveBuffer(id, buf, rec.track.name + ' kayıt');
      const clen = Math.min(T.secToBeat(buf.duration), atBeat - T.recStart);
      // üst üste kayıt: eski kayıtlar silinmez, sessize alınıp "take" olarak saklanır (comping)
      const over = rec.track.clips.filter(c => c.bufferId && c.start < T.recStart + clen && c.start + c.length > T.recStart);
      over.forEach(c => { c.muted = true; });
      rec.track.clips.push({ id: U.uid(), start: T.recStart, length: clen, offset: 0, bufferId: id, name: rec.track.name + ' take ' + (over.length + 1), gain: 0 });
      changed = true;
    });
    // MIDI kaydı
    const byTrack = new Map();
    T.recNotes.forEach(n => { if (n.end == null) n.end = atBeat; if (!byTrack.has(n.track)) byTrack.set(n.track, []); byTrack.get(n.track).push(n); });
    for (const [t, notes] of byTrack) {
      const start = Math.floor(T.recStart);
      const end = Math.ceil(Math.max(atBeat, ...notes.map(n => n.end)));
      t.clips.push({ id: U.uid(), start, length: Math.max(1, end - start), name: t.name + ' MIDI', notes: notes.map(n => ({ p: n.p, s: n.start - start, l: Math.max(0.05, n.end - n.start), v: n.v })) });
      changed = true;
    }
    T.recTracks = [];
    if (changed) document.dispatchEvent(new CustomEvent('os-project'));
  }

  // ---------------- Canlı nota (MIDI klavye / bilgisayar klavyesi) ----------------
  E.liveTarget = function () {
    const P = OS.project;
    const sel = P.tracks.find(t => t.id === OS.ui.selectedTrack && t.type === 'instrument');
    return sel || P.tracks.find(t => t.type === 'instrument' && t.arm) || P.tracks.find(t => t.type === 'instrument');
  };
  // Çalarken/kayıtta 'when' (AudioContext zamanı) vuruş konumuna çevrilir
  const posAt = when => T.position() + (T.playing ? Math.max(0, when - E.ctx.currentTime) / spb() : 0);
  // MIDI araçlarından (arpej, akor ...) geçmiş notayı çalar; when verilmezse hemen
  E.playNoteOn = function (n, v, when) {
    E.init(); E.resume();
    const t = E.liveTarget(); if (!t || !t.instrument || n < 0 || n > 127) return;
    if (!E.nodes.get(t.id)) E.syncAll();
    when = Math.max(when || 0, E.ctx.currentTime);
    t.instrument.noteOn(n, v, when);
    if (T.recording && t.arm) T.recNotes.push({ track: t, p: n, v, start: posAt(when) });
    T.liveNotes.set(n, t);
    document.dispatchEvent(new CustomEvent('os-note', { detail: { n, on: true } }));
  };
  E.playNoteOff = function (n, when) {
    const t = T.liveNotes.get(n); if (!t) return;
    T.liveNotes.delete(n);
    when = Math.max(when || 0, E.ctx.currentTime);
    t.instrument.noteOff(n, when);
    if (T.recording) { const r = T.recNotes.slice().reverse().find(x => x.p === n && x.end == null); if (r) r.end = posAt(when); }
    document.dispatchEvent(new CustomEvent('os-note', { detail: { n, on: false } }));
  };
  // Klavye / MIDI girişinden gelen notalar önce MIDI araçlarına uğrar
  E.liveNoteOn = (n, v) => { if (!(OS.midiTools && OS.midiTools.noteOn(n, v))) E.playNoteOn(n, v); };
  E.liveNoteOff = n => { if (!(OS.midiTools && OS.midiTools.noteOff(n))) E.playNoteOff(n); };

  // ---------------- Çevrimdışı render (mixdown) ----------------
  E.render = async function (opts) {
    opts = opts || {};
    const P = OS.project, sr = opts.sampleRate || 44100;
    let from = 0, to = 0;
    P.tracks.forEach(t => t.clips.forEach(c => { to = Math.max(to, c.start + c.length); }));
    if (opts.loopOnly && P.loop.end > P.loop.start) { from = P.loop.start; to = P.loop.end; }
    if (to <= from) throw new Error('Render edilecek içerik yok');
    const tail = opts.tail != null ? opts.tail : 3;
    const lenSec = T.beatToSec(to - from) + tail;
    const ctx = new OfflineAudioContext(2, Math.ceil(lenSec * sr), sr);
    const b2s = b => T.beatToSec(b - from);
    const master = makeStrip(ctx, { dest: ctx.destination });
    const mk = st => new OS.Device(ctx, st.plugin, st);
    const mDevs = P.master.inserts.map(d => mk(d.serialize()));
    wireChain(master, mDevs); master.fader.gain.value = U.dbToGain(P.master.vol);
    const all = [...mDevs];
    const strips = new Map();
    const anySolo = P.tracks.some(t => t.solo);
    const only = opts.trackId ? P.tracks.find(t => t.id === opts.trackId) : null;
    P.tracks.forEach(t => {
      const s = makeStrip(ctx, { dest: master.input });
      const devs = t.inserts.map(d => mk(d.serialize()));
      all.push(...devs);
      wireChain(s, devs);
      if (t.instrument) { s.instrument = mk(t.instrument.serialize()); all.push(s.instrument); s.instrument.out.connect(s.input); }
      applyStrip(s, t, anySolo);
      if (only && t !== only && t.type !== 'fx') s.mute.gain.value = 0;
      strips.set(t.id, s);
    });
    P.tracks.forEach(t => {
      const s = strips.get(t.id);
      P.tracks.filter(b => b.type === 'fx' && b !== t).forEach(b => {
        const lvl = t.sends && t.sends[b.id];
        if (lvl == null || lvl <= -60) return;
        const g = ctx.createGain(); g.gain.value = U.dbToGain(lvl); s.pan.connect(g); g.connect(strips.get(b.id).input);
      });
    });
    await Promise.all(all.map(d => d.inst.ready).filter(Boolean));
    strips.master = master;
    all.forEach(d => { const side = d.inst && d.inst.side, s = side && d.extra && d.extra.source && strips.get(d.extra.source); if (s) s.fader.connect(side); });
    OS.auto.scheduleOffline(ctx, strips, new Map(all.map(d => [d.id, d])), from, to, b2s);
    P.tracks.forEach(t => {
      const s = strips.get(t.id);
      t.clips.forEach(c => {
        if (c.muted || c.start + c.length <= from || c.start >= to) return;
        if (t.type === 'audio' && c.bufferId) {
          const buf = E.buffers.get(c.bufferId); if (!buf) return;
          const src = ctx.createBufferSource(), g = ctx.createGain();
          src.buffer = buf; g.gain.value = U.dbToGain(c.gain || 0); src.connect(g); g.connect(s.input);
          const into = Math.max(0, from - c.start);
          const off = (c.offset || 0) + T.beatToSec(into), dur = T.beatToSec(Math.min(c.length, to - c.start) - into);
          if (dur > 0 && off < buf.duration) src.start(b2s(c.start + into), off, Math.min(dur, buf.duration - off));
        } else if (t.type === 'instrument' && s.instrument && c.notes) {
          c.notes.forEach(n => {
            const ns = c.start + n.s; if (n.s >= c.length || ns < from || ns >= to) return;
            const len = Math.min(n.l, c.length - n.s);
            s.instrument.noteOn(n.p, n.v, b2s(T.swing(ns))); s.instrument.noteOff(n.p, b2s(ns + len));
          });
        }
      });
    });
    all.forEach(d => { if (d.inst.schedule && !d.bypass) d.inst.schedule(from, to, b2s); });
    const out = await ctx.startRendering();
    all.forEach(d => d.dispose());
    if (opts.normalize) {
      let pk = 0; for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
      if (pk > 0) { const g = 0.98 / pk; for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } }
    }
    return out;
  };
})(window.OS);
