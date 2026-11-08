/* Mr. Mars Music Studio · MRH DGN — çevrimdışı DSP: stem ayırma, zaman esnetme (WSOLA), perde kaydırma
 *
 * Stem ayırma, makine öğrenimi modeli kullanmaz (çevrimdışı ve kurulumsuz kalmak için).
 * Yöntem: STFT + harmonik/perküsif ayrıştırma (medyan filtre) + orta/yan (mid/side) analizi
 * + frekans bantları. Sonuç; davul, bas, vokal ve melodi için kullanılabilir ama ML tabanlı
 * ayırıcılar kadar temiz değildir.
 */
(function (OS) {
  const DSP = OS.dsp = {};
  const pause = () => new Promise(r => setTimeout(r, 0));

  function fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < h; j++) {
          const k = i + j + h, vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr;
          re[k] = re[i + j] - vr; im[k] = im[i + j] - vi; re[i + j] += vr; im[i + j] += vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  DSP.fft = fft;

  function med9(a) { // küçük dizi için yerinde sıralama ile medyan
    for (let i = 1; i < a.length; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
    return a[a.length >> 1];
  }

  // ---------------- Stem ayırma ----------------
  // Döndürür: { vocals, drums, bass, melody } -> her biri [L, R] Float32Array
  DSP.separate = async function (buffer, progress) {
    const N = 2048, hop = 1024, half = N / 2, sr = buffer.sampleRate, len = buffer.length;
    const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); // sqrt-Hann (analiz+sentez)
    const frames = Math.ceil(len / hop) + 1, K = 9, HK = K >> 1;
    const out = {}; ['vocals', 'drums', 'bass', 'melody'].forEach(k => out[k] = [new Float32Array(len + N), new Float32Array(len + N)]);
    const binHz = sr / N, band = (f, lo, hi, w) => Math.min(1, Math.max(0, (f - lo) / w + 0.5)) * Math.min(1, Math.max(0, (hi - f) / w + 0.5));
    // sliding pencere: K kare kadar spektrum tutulur
    const ring = [];
    const spec = f => {
      const mr = new Float32Array(N), mi = new Float32Array(N), sr_ = new Float32Array(N), si = new Float32Array(N);
      const o = f * hop - half;
      for (let i = 0; i < N; i++) { const j = o + i, l = j >= 0 && j < len ? L[j] : 0, r = j >= 0 && j < len ? R[j] : 0; mr[i] = (l + r) * 0.5 * win[i]; sr_[i] = (l - r) * 0.5 * win[i]; }
      fft(mr, mi); fft(sr_, si);
      const mag = new Float32Array(half + 1), smag = new Float32Array(half + 1);
      for (let k = 0; k <= half; k++) { mag[k] = Math.hypot(mr[k], mi[k]); smag[k] = Math.hypot(sr_[k], si[k]); }
      return { idx: f, mr, mi, sr: sr_, si, mag, smag };
    };
    for (let f = 0; f < HK && f < frames; f++) ring.push(spec(f));
    const tmp = new Float32Array(K), tre = new Float32Array(N), tim = new Float32Array(N);
    for (let f = 0; f < frames; f++) {
      if (f + HK < frames) ring.push(spec(f + HK));
      while (ring.length && ring[0].idx < f - HK) ring.shift();
      const ci = ring.findIndex(x => x.idx === f), cur = ring[ci], mag = cur.mag;
      const masks = { vocals: new Float32Array(half + 1), drums: new Float32Array(half + 1), bass: new Float32Array(half + 1) };
      for (let k = 0; k <= half; k++) {
        for (let t = 0; t < K; t++) { const fr = ring[Math.min(ring.length - 1, Math.max(0, t - HK + ci))]; tmp[t] = fr.mag[k]; }
        const Hm = med9(tmp);
        for (let t = 0; t < K; t++) tmp[t] = mag[Math.min(half, Math.max(0, k + t - HK))];
        const Pm = med9(tmp);
        const h2 = Hm * Hm, p2 = Pm * Pm, d = h2 + p2 + 1e-12, harm = h2 / d, perc = p2 / d;
        const fq = k * binHz, center = mag[k] / (mag[k] + cur.smag[k] * 1.5 + 1e-9);
        const bassW = band(fq, 0, 200, 80);
        masks.bass[k] = harm * bassW + perc * bassW * 0.2;
        masks.drums[k] = perc * (1 - bassW * 0.2);
        masks.vocals[k] = harm * (1 - bassW) * band(fq, 180, 7500, 300) * Math.pow(center, 3);
      }
      const o = f * hop - half;
      const emit = (name, m, useSide) => {
        for (let k = 0; k <= half; k++) { tre[k] = cur.mr[k] * m[k]; tim[k] = cur.mi[k] * m[k]; if (k > 0 && k < half) { tre[N - k] = tre[k]; tim[N - k] = -tim[k]; } }
        fft(tre, tim, true);
        const [oL, oR] = out[name];
        for (let i = 0; i < N; i++) { const j = o + i; if (j < 0) continue; const v = tre[i] * win[i]; oL[j] += v; oR[j] += v; }
        if (useSide) {
          for (let k = 0; k <= half; k++) { tre[k] = cur.sr[k]; tim[k] = cur.si[k]; if (k > 0 && k < half) { tre[N - k] = tre[k]; tim[N - k] = -tim[k]; } }
          fft(tre, tim, true);
          for (let i = 0; i < N; i++) { const j = o + i; if (j < 0) continue; const v = tre[i] * win[i]; oL[j] += v; oR[j] -= v; }
        }
      };
      const rest = new Float32Array(half + 1);
      for (let k = 0; k <= half; k++) rest[k] = Math.max(0, 1 - masks.vocals[k] - masks.drums[k] - masks.bass[k]);
      emit('vocals', masks.vocals); emit('drums', masks.drums); emit('bass', masks.bass); emit('melody', rest, true);
      if (f % 40 === 0) { progress && progress(f / frames); await pause(); }
    }
    Object.keys(out).forEach(k => out[k] = out[k].map(a => a.subarray(0, len)));
    progress && progress(1);
    return out;
  };
  // Çok çekirdekli ayırma: parça dilimlere bölünür, her dilim ayrı iş parçacığında işlenir, arayüz hiç beklemez.
  // Dilimler kare ızgarasına oturur ve kenar payıyla işlenir; birleşim yerinde iz kalmaz.
  DSP.separateFast = async function (buffer, progress) {
    const cores = Math.min(8, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)), len = buffer.length, hop = 1024, pad = hop * 8;
    if (typeof Worker === 'undefined' || cores < 2 || len < buffer.sampleRate * 8) return DSP.separate(buffer, progress);
    const src = 'const pause=()=>Promise.resolve();const fft=' + fft + ';const med9=' + med9 + ';const separate=' + DSP.separate + ';' +
      'onmessage=async e=>{const m=e.data,b={sampleRate:m.sr,length:m.L.length,numberOfChannels:2,getChannelData:c=>c?m.R:m.L};' +
      'const o=await separate(b,p=>postMessage({p}));const r={},t=[];for(const k in o){r[k]=[o[k][0].slice(m.a,m.b),o[k][1].slice(m.a,m.b)];t.push(r[k][0].buffer,r[k][1].buffer)}postMessage({r,i:m.i},t)}';
    let url;
    try {
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
      const size = Math.ceil(len / cores / hop) * hop, parts = new Array(cores), prog = new Array(cores).fill(0);
      const out = {}; ['vocals', 'drums', 'bass', 'melody'].forEach(k => out[k] = [new Float32Array(len), new Float32Array(len)]);
      await Promise.all(Array.from({ length: cores }, (_, i) => new Promise((res, rej) => {
        const w = new Worker(url), s = i * size, e = Math.min(len, s + size), s0 = Math.max(0, s - pad), e0 = Math.min(len, e + pad);
        w.onerror = ev => { w.terminate(); rej(ev); };
        w.onmessage = ev => {
          if (ev.data.r) { for (const k in out) { out[k][0].set(ev.data.r[k][0], s); out[k][1].set(ev.data.r[k][1], s); } w.terminate(); res(); return; }
          prog[i] = ev.data.p; progress && progress(prog.reduce((x, y) => x + y, 0) / cores);
        };
        w.postMessage({ i, sr: buffer.sampleRate, L: L.slice(s0, e0), R: R.slice(s0, e0), a: s - s0, b: e - s0 });
      })));
      progress && progress(1);
      return out;
    } catch (e) { console.warn(e); return DSP.separate(buffer, progress); }
    finally { if (url) URL.revokeObjectURL(url); }
  };
  DSP.STEM_NAMES = { vocals: 'Vokal', drums: 'Davul', bass: 'Bas', melody: 'Melodi' };
  DSP.toBuffers = (ctx, stems, sr) => {
    const o = {};
    Object.keys(stems).forEach(k => { const [l, r] = stems[k], b = ctx.createBuffer(2, l.length, sr); b.copyToChannel(l, 0); b.copyToChannel(r, 1); o[k] = b; });
    return o;
  };

  // ---------------- Zaman esnetme (WSOLA) ----------------
  // ratio > 1: daha uzun (yavaş), < 1: daha kısa (hızlı). Perde değişmez.
  DSP.stretch = async function (ctx, buffer, ratio, progress) {
    const ch = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
    const W = 2048, Ha = 512, Hs = Ha / ratio, tol = 384;
    const outLen = Math.ceil(len * ratio) + W, outs = [], ins = [];
    for (let c = 0; c < ch; c++) { ins.push(buffer.getChannelData(c)); outs.push(new Float32Array(outLen)); }
    const wsum = new Float32Array(outLen), win = new Float32Array(W);
    for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W);
    const mono = new Float32Array(len); for (let c = 0; c < ch; c++) for (let i = 0; i < len; i++) mono[i] += ins[c][i] / ch;
    let prevPos = 0, k = 0;
    for (let outPos = 0; outPos < outLen - W; outPos += Ha, k++) {
      const target = Math.round(k * Hs);
      let best = target;
      if (k > 0) {
        // önceki parçanın doğal devamına en çok benzeyen konumu ara (4 örnekte bir)
        const nat = prevPos + Ha; let bestC = -Infinity;
        for (let d = -tol; d <= tol; d += 4) {
          const p = target + d; if (p < 0 || p + W >= len) continue;
          let c = 0; for (let i = 0; i < W / 2; i += 8) c += mono[p + i] * mono[nat + i] || 0;
          if (c > bestC) { bestC = c; best = p; }
        }
      }
      if (best + W >= len) break;
      for (let c = 0; c < ch; c++) { const o = outs[c], s = ins[c]; for (let i = 0; i < W; i++) o[outPos + i] += s[best + i] * win[i]; }
      for (let i = 0; i < W; i++) wsum[outPos + i] += win[i];
      prevPos = best;
      if (k % 400 === 0) { progress && progress(outPos / outLen); await pause(); }
    }
    const n = Math.round(len * ratio), res = ctx.createBuffer(ch, n, sr);
    for (let c = 0; c < ch; c++) { const o = outs[c]; for (let i = 0; i < n; i++) o[i] = wsum[i] > 1e-3 ? o[i] / wsum[i] : 0; res.copyToChannel(o.subarray(0, n), c); }
    progress && progress(1);
    return res;
  };
  // Perde kaydırma: süreyi koruyarak yarım ton kadar değiştir
  DSP.pitchShift = async function (ctx, buffer, semis, progress) {
    const f = Math.pow(2, semis / 12);
    const st = await DSP.stretch(ctx, buffer, f, progress);
    const n = buffer.length, res = ctx.createBuffer(buffer.numberOfChannels, n, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const s = st.getChannelData(c), o = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i * f, i0 = Math.floor(x), fr = x - i0; o[i] = (s[i0] || 0) * (1 - fr) + (s[i0 + 1] || 0) * fr; }
      res.copyToChannel(o, c);
    }
    return res;
  };
})(window.OS);
