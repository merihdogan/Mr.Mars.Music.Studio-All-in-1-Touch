/* Mr. Mars Music Studio · MRH DGN — profesyonel ekler: pompa (sidechain ducking), çok bantlı kompresör,
   perde kaydırıcı, spektrum analizörü, FM sentezleyici */
(function (OS) {
  const R = OS.plugins.register, U = OS.U;
  const tempo = () => (OS.transport ? OS.transport.bpm : 120);

  // ---------------- Perde kaydırıcı (gecikme hattı tabanlı, AudioWorklet gerektirmez) ----------------
  // İki modüle gecikme hattı yarım periyot kaymayla çalışır, sin²/cos² pencerelerle karışır.
  OS.makePitchShifter = function (ctx, windowSec) {
    const W = windowSec || 0.08, base = 0.003;
    const input = ctx.createGain(), output = ctx.createGain();
    const len = ctx.sampleRate, ramp = ctx.createBuffer(1, len, ctx.sampleRate), fade = ctx.createBuffer(1, len, ctx.sampleRate);
    const rd = ramp.getChannelData(0), fd = fade.getChannelData(0);
    for (let i = 0; i < len; i++) { const ph = i / len; rd[i] = ph; fd[i] = Math.pow(Math.sin(Math.PI * ph), 2); }
    const taps = [0, 0.5].map(off => {
      const d = ctx.createDelay(1), mod = ctx.createGain(), vca = ctx.createGain();
      const rs = ctx.createBufferSource(), fs = ctx.createBufferSource();
      rs.buffer = ramp; fs.buffer = fade; rs.loop = fs.loop = true;
      vca.gain.value = 0; d.delayTime.value = base;
      rs.connect(mod); mod.connect(d.delayTime); fs.connect(vca.gain);
      input.connect(d); d.connect(vca); vca.connect(output);
      rs.playbackRate.value = fs.playbackRate.value = 0;
      rs.start(0, off); fs.start(0, off);
      return { d, mod, rs, fs };
    });
    let ratio = 1;
    function setRatio(r) {
      ratio = U.clamp(r, 0.25, 4);
      const f = Math.abs(1 - ratio) / W, t = ctx.currentTime;
      taps.forEach(tp => {
        tp.rs.playbackRate.setTargetAtTime(f, t, 0.01); tp.fs.playbackRate.setTargetAtTime(f, t, 0.01);
        // perde düşükse gecikme artar, yüksekse azalır
        if (ratio < 1) { tp.mod.gain.value = W; tp.d.delayTime.value = base; }
        else { tp.mod.gain.value = -W; tp.d.delayTime.value = base + W; }
      });
    }
    setRatio(1);
    return { input, output, setRatio, get ratio() { return ratio; }, dispose() { taps.forEach(tp => { try { tp.rs.stop(); tp.fs.stop(); } catch (e) { } }); } };
  };

  R({
    id: 'fx.pitch', name: 'Perde Kaydırıcı', category: 'Perde',
    params: [
      { id: 'semi', name: 'Yarım Ton', min: -12, max: 12, def: 0, step: 1 },
      { id: 'cents', name: 'İnce', min: -100, max: 100, def: 0, unit: 'c' },
      { id: 'win', name: 'Pencere', min: 0.02, max: 0.2, def: 0.08, unit: 's' },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 1 },
    ],
    create(ctx) {
      const s = OS.fxShell(ctx);
      let ps = OS.makePitchShifter(ctx, 0.08);
      s.input.connect(ps.input); ps.output.connect(s.wet);
      const p = { semi: 0, cents: 0 };
      const apply = () => ps.setRatio(Math.pow(2, (p.semi + p.cents / 100) / 12));
      return {
        input: s.input, output: s.output,
        set(id, v) {
          if (id in p) { p[id] = v; apply(); }
          if (id === 'win') { ps.dispose(); try { s.input.disconnect(ps.input); } catch (e) { } ps = OS.makePitchShifter(ctx, v); s.input.connect(ps.input); ps.output.connect(s.wet); apply(); }
          if (id === 'mix') s.mix(v);
        },
        dispose() { ps.dispose(); },
      };
    },
  });

  // ---------------- Pompa / sidechain ducking (tempoya kilitli) ----------------
  const RATES = ['1/1', '1/2', '1/4', '1/8', '1/16'], RB = [4, 2, 1, 0.5, 0.25];
  R({
    id: 'fx.pump', name: 'Pompa (Sidechain Ducking)', category: 'Dinamik & EQ',
    params: [
      { id: 'rate', name: 'Aralık', type: 'choice', options: RATES, min: 0, max: 4, def: 2 },
      { id: 'depth', name: 'Derinlik', min: 0, max: 1, def: 0.8 },
      { id: 'att', name: 'Dalış', min: 0.001, max: 0.05, def: 0.005, unit: 's', curve: 'log' },
      { id: 'rel', name: 'Toparlanma', min: 0.02, max: 1, def: 0.18, unit: 's', curve: 'log' },
      { id: 'off', name: 'Kaydırma', min: 0, max: 0.5, def: 0, unit: 'vuruş' },
    ],
    create(ctx) {
      // Aktarım çalarken motor schedule(a, b, zaman) çağırır; vuruşlarda kazanç düşürülür.
      const vca = ctx.createGain();
      const p = { rate: 2, depth: 0.8, att: 0.005, rel: 0.18, off: 0 };
      return {
        input: vca, output: vca,
        set(id, v) { p[id] = v; },
        schedule(a, b, toTime) {
          const step = RB[Math.round(p.rate)];
          for (let k = Math.ceil((a - p.off) / step) * step + p.off; k < b; k += step) {
            if (k < a) continue;
            const t = toTime(k);
            if (t < ctx.currentTime) continue;
            vca.gain.setTargetAtTime(1 - p.depth, t, p.att / 3);
            vca.gain.setTargetAtTime(1, t + p.att, p.rel / 3);
          }
        },
        stopped() { vca.gain.cancelScheduledValues(0); vca.gain.value = 1; },
      };
    },
  });

  // ---------------- Çok bantlı kompresör ----------------
  R({
    id: 'fx.mbcomp', name: 'Çok Bantlı Kompresör', category: 'Dinamik & EQ',
    params: [
      { id: 'x1', name: 'Geçiş 1', min: 60, max: 1000, def: 200, unit: 'Hz', curve: 'log' },
      { id: 'x2', name: 'Geçiş 2', min: 1000, max: 10000, def: 3000, unit: 'Hz', curve: 'log' },
      { id: 'tl', name: 'Alçak Eşik', min: -60, max: 0, def: -20, unit: 'dB' },
      { id: 'tm', name: 'Orta Eşik', min: -60, max: 0, def: -20, unit: 'dB' },
      { id: 'th', name: 'Yüksek Eşik', min: -60, max: 0, def: -20, unit: 'dB' },
      { id: 'ratio', name: 'Oran', min: 1, max: 20, def: 3, unit: ':1' },
      { id: 'gl', name: 'Alçak Kazanç', min: -12, max: 12, def: 0, unit: 'dB' },
      { id: 'gm', name: 'Orta Kazanç', min: -12, max: 12, def: 0, unit: 'dB' },
      { id: 'gh', name: 'Yüksek Kazanç', min: -12, max: 12, def: 0, unit: 'dB' },
    ],
    create(ctx) {
      const input = ctx.createGain(), out = ctx.createGain();
      const f = (type) => { const a = ctx.createBiquadFilter(), b = ctx.createBiquadFilter(); a.type = b.type = type; a.Q.value = b.Q.value = 0.707; a.connect(b); return [a, b]; };
      const lo = f('lowpass'), mh = f('highpass'), ml = f('lowpass'), hi = f('highpass');
      const comps = [0, 1, 2].map(() => ctx.createDynamicsCompressor()), gains = [0, 1, 2].map(() => ctx.createGain());
      input.connect(lo[0]); lo[1].connect(comps[0]);
      input.connect(mh[0]); mh[1].connect(ml[0]); ml[1].connect(comps[1]);
      input.connect(hi[0]); hi[1].connect(comps[2]);
      comps.forEach((c, i) => { c.attack.value = 0.01; c.release.value = 0.15; c.knee.value = 6; c.connect(gains[i]); gains[i].connect(out); });
      return {
        input, output: out,
        set(id, v) {
          if (id === 'x1') { lo.forEach(n => n.frequency.value = v); mh.forEach(n => n.frequency.value = v); }
          if (id === 'x2') { ml.forEach(n => n.frequency.value = v); hi.forEach(n => n.frequency.value = v); }
          if (id === 'tl') comps[0].threshold.value = v; if (id === 'tm') comps[1].threshold.value = v; if (id === 'th') comps[2].threshold.value = v;
          if (id === 'ratio') comps.forEach(c => c.ratio.value = v);
          if (id === 'gl') gains[0].gain.value = U.dbToGain(v); if (id === 'gm') gains[1].gain.value = U.dbToGain(v); if (id === 'gh') gains[2].gain.value = U.dbToGain(v);
        },
      };
    },
  });

  // ---------------- Spektrum analizörü ----------------
  R({
    id: 'fx.spectrum', name: 'Spektrum Analizörü', category: 'Yardımcı',
    params: [{ id: 'smooth', name: 'Yumuşatma', min: 0, max: 0.95, def: 0.8 }],
    create(ctx) {
      const g = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 4096; g.connect(an);
      return { input: g, output: g, analyser: an, set(id, v) { if (id === 'smooth') an.smoothingTimeConstant = v; } };
    },
    ui(container, dev) {
      const cv = U.el('canvas', { class: 'eq-curve', style: 'height:160px' }); container.prepend(cv);
      const an = dev.inst.analyser, data = new Float32Array(an.frequencyBinCount), sr = an.context.sampleRate;
      const draw = () => {
        if (!cv.isConnected) return;
        const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, g = cv.getContext('2d');
        an.getFloatFrequencyData(data);
        g.clearRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,.08)'; g.fillStyle = '#6c7484'; g.font = '10px Segoe UI';
        [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => { const x = Math.log(f / 20) / Math.log(1000) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.fillText(f >= 1000 ? f / 1000 + 'k' : f, x + 2, h - 3); });
        g.beginPath();
        for (let x = 0; x < w; x++) {
          const f = 20 * Math.pow(1000, x / w), i = Math.min(data.length - 1, Math.round(f / (sr / 2) * data.length));
          const y = h - U.clamp((data[i] + 100) / 100, 0, 1) * h;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.strokeStyle = '#eeeeee'; g.lineWidth = 1.5; g.stroke();
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    },
  });

  // ---------------- FM sentezleyici ----------------
  R({
    id: 'inst.fm', name: 'FM Sentezleyici', type: 'instrument', category: 'Enstrüman',
    params: [
      { id: 'ratio', name: 'Mod Oranı', min: 0.5, max: 16, def: 2, step: 0.5 },
      { id: 'index', name: 'Mod Miktarı', min: 0, max: 20, def: 4 },
      { id: 'idec', name: 'Mod Düşüş', min: 0.01, max: 4, def: 0.6, unit: 's', curve: 'log' },
      { id: 'fb', name: 'Parlaklık', min: 0, max: 1, def: 0.2 },
      { id: 'a', name: 'Atak', min: 0.001, max: 3, def: 0.002, unit: 's', curve: 'log' },
      { id: 'd', name: 'Düşüş', min: 0.01, max: 6, def: 1.2, unit: 's', curve: 'log' },
      { id: 's', name: 'Süreklilik', min: 0, max: 1, def: 0.3 },
      { id: 'r', name: 'Bırakma', min: 0.01, max: 6, def: 0.5, unit: 's', curve: 'log' },
      { id: 'vol', name: 'Ses', min: -40, max: 6, def: -8, unit: 'dB' },
    ],
    presets: {
      'Elektrik Piyano': { ratio: 1, index: 3, idec: 0.8, fb: 0.1, a: 0.002, d: 1.8, s: 0.2, r: 0.4 },
      'Çan': { ratio: 3.5, index: 8, idec: 2.5, fb: 0, a: 0.001, d: 4, s: 0, r: 2 },
      'FM Bas': { ratio: 1, index: 6, idec: 0.25, fb: 0.3, a: 0.001, d: 0.4, s: 0.6, r: 0.1, vol: -6 },
      'Marimba': { ratio: 4, index: 5, idec: 0.15, fb: 0, a: 0.001, d: 0.5, s: 0, r: 0.3 },
    },
    create(ctx) {
      const out = ctx.createGain(), p = {}, voices = [];
      const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 3000; hs.connect(out);
      const rel = (param, t, r) => { if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t); param.setTargetAtTime(0, t, Math.max(0.005, r / 4)); };
      return {
        output: out,
        set(id, v) { p[id] = v; if (id === 'vol') out.gain.value = U.dbToGain(v); if (id === 'fb') hs.gain.value = v * 12 - 3; },
        noteOn(n, vel, t) {
          t = Math.max(t || 0, ctx.currentTime);
          const f = U.midiToFreq(n), v = (vel == null ? 100 : vel) / 127;
          const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), amp = ctx.createGain();
          car.frequency.value = f; mod.frequency.value = f * p.ratio;
          mod.connect(mg); mg.connect(car.frequency); car.connect(amp); amp.connect(hs);
          const peak = f * p.index * (0.4 + 0.6 * v);
          mg.gain.setValueAtTime(peak, t); mg.gain.setTargetAtTime(peak * 0.1, t, p.idec / 3);
          amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(v * 0.5, t + p.a); amp.gain.setTargetAtTime(v * 0.5 * p.s, t + p.a, p.d / 3);
          car.start(t); mod.start(t);
          const vc = { n, car, mod, amp, released: false, start: t };
          voices.push(vc); car.onended = () => { const i = voices.indexOf(vc); if (i >= 0) voices.splice(i, 1); };
        },
        noteOff(n, t) {
          t = Math.max(t || 0, ctx.currentTime);
          const vc = voices.find(x => x.n === n && !x.released && x.start <= t + 0.001); if (!vc) return;
          vc.released = true; rel(vc.amp.gain, t, p.r); [vc.car, vc.mod].forEach(o => o.stop(t + p.r * 1.5 + 0.05));
        },
        allOff() { voices.forEach(v => { try { v.car.stop(); v.mod.stop(); } catch (e) { } }); },
      };
    },
  });

  // ---------------- Gerçek sidechain kompresör: başka parçanın sesi bu parçayı kısar ----------------
  OS.plugins.register({
    id: 'fx.sidechain', name: 'Sidechain Kompresör', type: 'effect', category: 'Dinamik',
    params: [
      { id: 'th', name: 'Eşik', min: -50, max: 0, def: -24, unit: 'dB' },
      { id: 'ratio', name: 'Oran', min: 1, max: 20, def: 6 },
      { id: 'rel', name: 'Bırakma', min: 0.02, max: 0.8, def: 0.16, unit: 's', curve: 'log' },
      { id: 'gain', name: 'Çıkış', min: -12, max: 12, def: 0, unit: 'dB' },
    ],
    create(ctx) {
      const inp = ctx.createGain(), del = ctx.createDelay(0.02), vca = ctx.createGain(), out = ctx.createGain(), side = ctx.createGain();
      del.delayTime.value = 0.004; vca.gain.value = 1; inp.connect(del); del.connect(vca); vca.connect(out);
      const abs = ctx.createWaveShaper(), N = 4097, c = new Float32Array(N); for (let i = 0; i < N; i++) c[i] = Math.abs(i / (N - 1) * 2 - 1); abs.curve = c;
      const slow = ctx.createBiquadFilter(), fast = ctx.createBiquadFilter(), sg = ctx.createGain(), fg = ctx.createGain(), sum = ctx.createGain(), curve = ctx.createWaveShaper();
      slow.type = fast.type = 'lowpass'; fast.frequency.value = 150; sg.gain.value = fg.gain.value = 0.5;
      side.connect(abs); abs.connect(slow); abs.connect(fast); slow.connect(sg); fast.connect(fg); sg.connect(sum); fg.connect(sum); sum.connect(curve); curve.connect(vca.gain);
      const p = { th: -24, ratio: 6, rel: 0.16 };
      const draw = () => { const n = 2049, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = Math.abs(i / (n - 1) * 2 - 1), db = 20 * Math.log10(x + 1e-6), over = db - p.th, gr = over > 0 ? -over * (1 - 1 / p.ratio) : 0; a[i] = Math.pow(10, gr / 20) - 1; } curve.curve = a; };
      draw();
      const setRel = () => { slow.frequency.value = 1 / (2 * Math.PI * p.rel); };
      setRel();
      return { input: inp, output: out, side, set(id, v) { if (id === 'gain') out.gain.value = U.dbToGain(v); else { p[id] = v; if (id === 'rel') setRel(); else draw(); } } };
    },
    ui(box, dev) {
      const el = U.el, P = OS.project; dev.extra = dev.extra || {};
      const tracks = P.tracks.filter(t => !t.inserts.includes(dev));
      box.appendChild(el('label', { class: 'field', style: 'margin:6px 0' }, OS.t('Tetikleyen parça'), el('select', { onchange: e => { dev.extra.source = e.target.value || null; OS.engine.updateMix(); } }, el('option', { value: '' }, OS.t('Seçilmedi')), tracks.map(t => el('option', { value: t.id, selected: t.id === dev.extra.source }, t.name)))));
    },
  });
})(window.OS);
