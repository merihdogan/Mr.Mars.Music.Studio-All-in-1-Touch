/* Mr. Mars Music Studio · MRH DGN — ortak yardımcılar */
window.OS = window.OS || {};

(function (OS) {
  const U = {};

  U.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.dbToGain = db => Math.pow(10, db / 20);
  U.gainToDb = g => (g <= 0.000001 ? -120 : 20 * Math.log10(g));
  U.midiToFreq12 = n => 440 * Math.pow(2, (n - 69) / 12);
  // mikrotonal akort (makam / akort dosyası) etkinse enstrümanlar bu yolla doğru frekansı alır
  U.midiToFreq = n => (OS.tuning && OS.tuning.active ? OS.tuning.freq(n) : 440 * Math.pow(2, (n - 69) / 12));
  U.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  U.noteName = n => U.NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  U.deepClone = o => JSON.parse(JSON.stringify(o));

  U.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (k === 'class') e.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else if (v !== false && v != null) e.setAttribute(k, v);
      }
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    }
    return e;
  };

  U.fmtTime = sec => {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };
  U.fmtBars = (beat, bpb) => {
    beat = Math.max(0, beat);
    const bar = Math.floor(beat / bpb) + 1, b = Math.floor(beat % bpb) + 1, t = Math.floor((beat % 1) * 4) + 1;
    return `${bar}.${b}.${t}`;
  };
  U.fmtParam = (p, v) => {
    if (p.type === 'choice') return p.options[Math.round(v)] || '';
    if (p.type === 'bool') return v >= 0.5 ? 'Açık' : 'Kapalı';
    let s;
    const a = Math.abs(v);
    if (p.unit === 'Hz' && a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 1 : 2) + ' kHz';
    if (p.unit === 's' && a < 1) return Math.round(v * 1000) + ' ms';
    if (a >= 100) s = v.toFixed(0); else if (a >= 10) s = v.toFixed(1); else s = v.toFixed(2);
    return s + (p.unit ? ' ' + p.unit : '');
  };

  // ---- Dalga biçimlendirici eğrileri ----
  U.curve = function (type, amount, n = 4096) {
    const c = new Float32Array(n);
    const k = Math.max(0.0001, amount);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      let y;
      switch (type) {
        case 'soft': y = Math.tanh(x * k) / Math.tanh(k); break;
        case 'asym': { const z = x * k; y = z >= 0 ? Math.tanh(z) : Math.tanh(z * 0.6) / 0.6 * 0.8; y /= Math.tanh(k); break; }
        case 'hard': y = U.clamp(x * k, -1, 1); break;
        case 'fuzz': { const z = x * k * 2; y = Math.sign(z) * (1 - Math.exp(-Math.abs(z))); break; }
        case 'tube': { const z = x * k; y = z < -1 ? -2 / 3 : z > 1 ? 2 / 3 : z - (z * z * z) / 3; y *= 1.5; break; }
        case 'fold': { let z = x * k; while (Math.abs(z) > 1) z = Math.sign(z) * 2 - z; y = z; break; }
        case 'crush': { const steps = Math.pow(2, Math.round(amount)); y = Math.round(x * steps) / steps; break; }
        default: y = x;
      }
      c[i] = y;
    }
    return c;
  };

  // ---- Sentetik dürtü yanıtı (reverb) ----
  U.makeReverbIR = function (ctx, seconds, decay, damp, reverse) {
    const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        const n = Math.random() * 2 - 1;
        const a = damp * (0.2 + 0.8 * t);
        lp = lp + (1 - a) * (n - lp);
        d[reverse ? len - 1 - i : i] = lp * env;
      }
    }
    return buf;
  };

  // Tip: 0 genel, 1 oda (erken yansımalar), 2 salon (yavaş yoğunlaşma, koyu),
  //      3 plaka (yoğun, parlak), 4 yay (yinelenen "boing" yansımaları), 5 katedral (çok uzun)
  U.makeReverbIR2 = function (ctx, algo, seconds, decay, damp, reverse) {
    if (!algo) return U.makeReverbIR(ctx, seconds, decay, damp, reverse);
    const sec = algo === 1 ? Math.min(seconds, 1.2) : algo === 5 ? Math.max(seconds, 5) : seconds;
    const dmp = algo === 3 ? damp * 0.3 : algo === 2 || algo === 5 ? Math.min(0.95, damp + 0.2) : damp;
    const b = U.makeReverbIR(ctx, sec, decay, dmp, false), sr = ctx.sampleRate;
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c), n = d.length;
      if (algo === 1) { // erken yansımalar
        [0.007, 0.011, 0.017, 0.023, 0.031, 0.041, 0.053].forEach((t, i) => { const k = Math.floor((t + c * 0.0013) * sr); if (k < n) d[k] += (0.7 - i * 0.08) * (i % 2 ? -1 : 1); });
      } else if (algo === 2 || algo === 5) { // yavaş yoğunlaşan başlangıç
        const rise = Math.floor(sr * (algo === 5 ? 0.08 : 0.04));
        for (let i = 0; i < rise && i < n; i++) d[i] *= i / rise;
      } else if (algo === 4) { // yay: periyodik yansımalar
        const per = Math.floor(sr * 0.029);
        for (let i = per; i < n; i++) d[i] += d[i - per] * 0.55;
        let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); if (pk > 1) for (let i = 0; i < n; i++) d[i] /= pk;
      }
      if (reverse) d.reverse();
    }
    return b;
  };

  // ---- WAV kodlayıcı ----
  U.stamp = () => { const d = new Date(), p = v => String(v).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + '-' + p(d.getMinutes()); };
  U.encodeWav = function (channels, sampleRate, bits = 16) {
    const nCh = channels.length, len = channels[0].length, bps = bits / 8;
    const buf = new ArrayBuffer(44 + len * nCh * bps), v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + len * nCh * bps, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, nCh, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nCh * bps, true);
    v.setUint16(32, nCh * bps, true); v.setUint16(34, bits, true); ws(36, 'data'); v.setUint32(40, len * nCh * bps, true);
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        const s = U.clamp(channels[c][i], -1, 1);
        if (bits === 32) { v.setFloat32(o, s, true); o += 4; }
        else if (bits === 24) { const x = Math.round(s * 8388607); v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); o += 3; }
        else { v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2; }
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  };
  U.bufferToWav = (ab, bits) => U.encodeWav(Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i)), ab.sampleRate, bits);

  U.download = function (blob, name) {
    const a = U.el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  U.pickFiles = function (accept, multiple) {
    return new Promise(res => {
      const i = U.el('input', { type: 'file', accept, multiple: !!multiple, style: 'display:none' });
      i.addEventListener('change', () => { res(Array.from(i.files || [])); i.remove(); });
      document.body.appendChild(i); i.click();
    });
  };

  U.readAsText = f => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsText(f); });
  U.readAsArrayBuffer = f => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsArrayBuffer(f); });

  U.abToB64 = function (ab) {
    const bytes = new Uint8Array(ab); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  U.b64ToAb = function (b64) {
    const s = atob(b64), bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  };

  // ---- Dalga biçimi tepe değerleri ----
  U.peaks = function (buffer, buckets) {
    const d0 = buffer.getChannelData(0), d1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : d0;
    const out = new Float32Array(buckets * 2), step = d0.length / buckets;
    for (let b = 0; b < buckets; b++) {
      let mn = 0, mx = 0;
      const s = Math.floor(b * step), e = Math.min(d0.length, Math.floor((b + 1) * step));
      const inc = Math.max(1, Math.floor((e - s) / 200));
      for (let i = s; i < e; i += inc) { const v = (d0[i] + d1[i]) * 0.5; if (v < mn) mn = v; if (v > mx) mx = v; }
      out[b * 2] = mn; out[b * 2 + 1] = mx;
    }
    return out;
  };

  U.drawWave = function (canvas, buffer, offsetSec, durSec, color) {
    const w = canvas.width = Math.max(1, Math.floor(canvas.clientWidth)), h = canvas.height = Math.max(1, Math.floor(canvas.clientHeight));
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (!buffer) return;
    const d0 = buffer.getChannelData(0), sr = buffer.sampleRate;
    const s0 = Math.floor(offsetSec * sr), n = Math.floor(durSec * sr), spp = n / w;
    g.fillStyle = color || 'rgba(255,255,255,.75)';
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const a = s0 + Math.floor(x * spp), b = Math.min(d0.length, s0 + Math.floor((x + 1) * spp));
      if (a >= d0.length) break;
      let mn = 0, mx = 0;
      const inc = Math.max(1, Math.floor((b - a) / 64));
      for (let i = a; i < b; i += inc) { const v = d0[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      g.fillRect(x, mid - mx * mid, 1, Math.max(1, (mx - mn) * mid));
    }
  };

  // ---- Basit ton algılama (otokorelasyon) ----
  U.detectPitch = function (buf, sr) {
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < 0.01) return -1;
    let r1 = 0, r2 = buf.length - 1;
    const th = 0.2;
    for (let i = 0; i < buf.length / 2; i++) if (Math.abs(buf[i]) < th) { r1 = i; break; }
    for (let i = 1; i < buf.length / 2; i++) if (Math.abs(buf[buf.length - i]) < th) { r2 = buf.length - i; break; }
    const b = buf.slice(r1, r2), n = b.length, c = new Float32Array(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) c[i] += b[j] * b[j + i];
    let d = 0; while (d < n - 1 && c[d] > c[d + 1]) d++;
    let mx = -1, mp = -1;
    for (let i = d; i < n; i++) if (c[i] > mx) { mx = c[i]; mp = i; }
    if (mp <= 0) return -1;
    let T0 = mp;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);
    return sr / T0;
  };

  // ---- Tempo (BPM) tahmini ----
  U.detectBPM = function (buffer) {
    // Başlangıç algılama: kısa pencerelerin log enerjisindeki artış, yerel ortalaması çıkarılmış
    const sr = buffer.sampleRate, d = buffer.getChannelData(0), hop = 512, fps = sr / hop;
    const n = Math.min(Math.floor(d.length / hop), Math.floor(fps * 90));
    const le = new Float32Array(n);
    for (let f = 0; f < n; f++) { let e = 1e-9; for (let i = f * hop, z = i + hop; i < z; i++) e += d[i] * d[i]; le[f] = Math.log(e); }
    const odf = new Float32Array(n);
    for (let f = 1; f < n; f++) odf[f] = Math.max(0, le[f] - le[f - 1]);
    const sm = new Float32Array(n); let acc = 0; const W = 16;
    for (let f = 0; f < n; f++) { acc += odf[f]; if (f >= W) acc -= odf[f - W]; sm[f] = Math.max(0, odf[f] - acc / Math.min(f + 1, W) * 1.2); }
    const at = x => { const i = Math.floor(x), fr = x - i; return i + 1 < n ? sm[i] * (1 - fr) + sm[i + 1] * fr : 0; };
    const score = bpm => {
      const lag = 60 / bpm * fps; let s = 0;
      for (let k = 1; k <= 4; k++) { let q = 0; for (let f = 0; f + lag * k < n; f++) q += sm[f] * at(f + lag * k); s += q / k; }
      return s;
    };
    let best = 120, bs = -1;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) { const s = score(bpm); if (s > bs) { bs = s; best = bpm; } }
    const c = best;
    for (let bpm = c - 0.5; bpm <= c + 0.5; bpm += 0.05) { const s = score(bpm); if (s > bs) { bs = s; best = bpm; } }
    // yarım/iki kat belirsizliği: 70-180 içinde, güçlü olanı tercih et
    if (best < 90 && best * 2 <= 180 && score(best * 2) > bs * 0.85) best *= 2;
    return Math.round(best * 10) / 10;
  };

  // ---- İlk vuruşun konumu (beat grid ofseti, saniye) ----
  U.detectBeatOffset = function (buffer, bpm) {
    const sr = buffer.sampleRate, d = buffer.getChannelData(0), hop = Math.floor(sr / 200), fps = sr / hop;
    const env = []; let lp = 0;
    for (let i = 0; i < Math.min(d.length, sr * 30); i += hop) { let e = 0; for (let j = i; j < Math.min(d.length, i + hop); j++) { lp += 0.02 * (d[j] - lp); e += lp * lp; } env.push(e); }
    const fl = env.map((v, i) => i ? Math.max(0, v - env[i - 1]) : 0);
    const per = 60 / bpm * fps; let best = 0, bs = -1;
    for (let o = 0; o < per; o++) { let s = 0; for (let k = o; k < fl.length; k += per) s += fl[Math.round(k)] || 0; if (s > bs) { bs = s; best = o; } }
    return best / fps;
  };

  // ---- Ton (key) tahmini: Goertzel kromagramı + Krumhansl profilleri ----
  U.detectKey = function (buffer) {
    const sr = buffer.sampleRate, d = buffer.getChannelData(0), N = 8192, chroma = new Float64Array(12);
    const frames = Math.min(60, Math.floor(d.length / N));
    const step = Math.max(N, Math.floor(d.length / Math.max(1, frames)));
    for (let f = 0; f < frames; f++) {
      const o = f * step;
      for (let m = 36; m < 84; m++) {
        const w = 2 * Math.PI * U.midiToFreq12(m) / sr, c = 2 * Math.cos(w);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i += 2) { const s0 = d[o + i] + c * s1 - s2; s2 = s1; s1 = s0; }
        chroma[m % 12] += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2));
      }
    }
    const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const corr = (prof, k) => { let mx = 0, my = 0; for (let i = 0; i < 12; i++) { mx += chroma[(i + k) % 12]; my += prof[i]; } mx /= 12; my /= 12; let a = 0, b = 0, c = 0; for (let i = 0; i < 12; i++) { const x = chroma[(i + k) % 12] - mx, y = prof[i] - my; a += x * y; b += x * x; c += y * y; } return a / Math.sqrt(b * c || 1); };
    let best = '', bs = -2;
    for (let k = 0; k < 12; k++) { const a = corr(MAJ, k), b = corr(MIN, k); if (a > bs) { bs = a; best = U.NOTE_NAMES[k]; } if (b > bs) { bs = b; best = U.NOTE_NAMES[k] + 'm'; } }
    return best;
  };

  // ---- Basit diyaloglar ----
  U.toast = function (msg, ms = 2600) {
    let t = document.getElementById('toast');
    if (!t) { t = U.el('div', { id: 'toast' }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
  };

  U.modal = function (title, body, buttons) {
    const back = U.el('div', { class: 'modal-back' });
    const box = U.el('div', { class: 'modal' }, U.el('div', { class: 'modal-title' }, title), U.el('div', { class: 'modal-body' }, body));
    const bar = U.el('div', { class: 'modal-buttons' });
    const close = () => back.remove();
    (buttons || [{ label: 'Kapat' }]).forEach(b => bar.appendChild(U.el('button', { class: b.primary ? 'btn primary' : 'btn', onclick: () => { if (!b.onclick || b.onclick() !== false) close(); } }, b.label)));
    box.appendChild(bar); back.appendChild(box);
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    document.body.appendChild(back);
    return { close, box };
  };

  U.prompt = function (title, value) {
    return new Promise(res => {
      const inp = U.el('input', { class: 'inp', value: value || '' });
      U.modal(title, inp, [{ label: 'İptal', onclick: () => res(null) }, { label: 'Tamam', primary: true, onclick: () => res(inp.value) }]);
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { res(inp.value); inp.closest('.modal-back').remove(); } });
    });
  };

  U.menu = function (x, y, items) {
    document.querySelectorAll('.ctx-menu').forEach(m => m.remove());
    const m = U.el('div', { class: 'ctx-menu', style: { left: x + 'px', top: y + 'px' } });
    items.forEach(it => {
      if (it === '-') { m.appendChild(U.el('div', { class: 'sep' })); return; }
      if (it.header) { m.appendChild(U.el('div', { class: 'hdr' }, it.header)); return; }
      m.appendChild(U.el('div', { class: 'item' + (it.disabled ? ' disabled' : ''), onclick: () => { m.remove(); if (!it.disabled) it.onclick(); } }, it.label));
    });
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    if (r.right > innerWidth) m.style.left = Math.max(0, innerWidth - r.width - 4) + 'px';
    if (r.bottom > innerHeight) m.style.top = Math.max(0, innerHeight - r.height - 4) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', h); } }), 0);
  };

  // ---- Sürükleme yardımcısı ----
  U.drag = function (e, move, up) {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const mm = ev => move(ev.clientX - sx, ev.clientY - sy, ev);
    const mu = ev => { removeEventListener('mousemove', mm); removeEventListener('mouseup', mu); up && up(ev); };
    addEventListener('mousemove', mm); addEventListener('mouseup', mu);
  };

  // ---- Döner düğme (knob) ----
  U.knob = function (opts) {
    // opts: {label, min, max, value, def, step, curve:'log', size, fmt, onchange}
    const size = Math.round((opts.size || 42) * (OS.platform && OS.platform.touchUI && !opts.exact ? 1.3 : 1));
    const wrap = U.el('div', { class: 'knob', title: opts.title || opts.label || '' });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('viewBox', '0 0 40 40');
    const track = document.createElementNS(svgNS, 'path'), arc = document.createElementNS(svgNS, 'path'), dot = document.createElementNS(svgNS, 'line');
    track.setAttribute('class', 'k-track'); arc.setAttribute('class', 'k-arc'); dot.setAttribute('class', 'k-dot');
    const body = document.createElementNS(svgNS, 'circle'); body.setAttribute('cx', 20); body.setAttribute('cy', 20); body.setAttribute('r', 12.5); body.setAttribute('class', 'k-body');
    svg.append(track, arc, body, dot);
    const lab = U.el('div', { class: 'k-label' }, opts.label || '');
    const val = U.el('div', { class: 'k-val' });
    wrap.append(svg, val, lab);
    const A0 = -135, A1 = 135;
    const pt = a => { const r = (a - 90) * Math.PI / 180; return [20 + 16 * Math.cos(r), 20 + 16 * Math.sin(r)]; };
    const arcPath = (a, b) => { const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M${x0} ${y0} A16 16 0 ${b - a > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
    track.setAttribute('d', arcPath(A0, A1));
    const log = opts.curve === 'log' && opts.min > 0;
    const toNorm = v => log ? Math.log(v / opts.min) / Math.log(opts.max / opts.min) : (v - opts.min) / (opts.max - opts.min);
    const fromNorm = n => { n = U.clamp(n, 0, 1); let v = log ? opts.min * Math.pow(opts.max / opts.min, n) : opts.min + n * (opts.max - opts.min); if (opts.step) v = Math.round(v / opts.step) * opts.step; return v; };
    let value = opts.value;
    const bipolar = !log && opts.min < 0 && opts.max > 0;
    function render() {
      const n = U.clamp(toNorm(value), 0, 1), a = A0 + n * (A1 - A0);
      const z = bipolar ? A0 + toNorm(0) * (A1 - A0) : A0;
      arc.setAttribute('d', a === z ? '' : arcPath(Math.min(a, z), Math.max(a, z)));
      const r = (a - 90) * Math.PI / 180;
      dot.setAttribute('x1', 20 + 5 * Math.cos(r)); dot.setAttribute('y1', 20 + 5 * Math.sin(r));
      dot.setAttribute('x2', 20 + 11 * Math.cos(r)); dot.setAttribute('y2', 20 + 11 * Math.sin(r));
      val.textContent = opts.fmt ? opts.fmt(value) : (Math.round(value * 100) / 100);
    }
    function set(v, fire) { value = U.clamp(v, opts.min, opts.max); render(); if (fire && opts.onchange) opts.onchange(value); }
    svg.addEventListener('mousedown', e => {
      const n0 = toNorm(value);
      U.drag(e, (dx, dy, ev) => set(fromNorm(n0 - dy / (ev.shiftKey ? 600 : 150)), true));
    });
    svg.addEventListener('dblclick', () => set(opts.def != null ? opts.def : opts.min, true));
    svg.addEventListener('wheel', e => { e.preventDefault(); set(fromNorm(toNorm(value) - Math.sign(e.deltaY) * 0.02), true); }, { passive: false });
    render();
    wrap.setValue = v => set(v, false);
    wrap.getValue = () => value;
    return wrap;
  };

  // ---- Seviye göstergesi ----
  U.meterLevel = function (an, buf) {
    an.getFloatTimeDomainData(buf);
    let pk = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; }
    return pk;
  };

  OS.U = U;
})(window.OS);
