/* Mr. Mars Music Studio · MRH DGN — gerçek kayıtlar: enstrümanlara kayıtlı ses atama.
   Hazır paketler CC0 lisanslıdır ve parça çalınacağı zaman yüklenir. Kullanıcı kendi ses dosyalarını,
   SFZ klasörünü ya da SoundFont dosyasını herhangi bir enstrümana atayabilir. */
(function (OS) {
  const R = OS.real = {};
  const PACK = {
    'Piyano': 'piyano', 'Elektrik Piyano': 'empiyano', 'Elektrik Piyano Yumuşak': 'empiyano', 'Klavsen': 'klavsen', 'Org': 'org', 'Arp (Harp)': 'arp',
    'Marimba': 'marimba', 'Vibrafon': 'vibrafon', 'Müzik Kutusu / Çelesta': 'celesta', 'Çan': 'can', 'Balafon': 'balafon', 'Kalimba': 'kalimba', 'Mızıka': 'mizika',
    'Saksafon (Alto)': 'ayarsax', 'Saksafon (Tenor)': 'tenorsax', 'Kemik Flüt': 'blokflut', 'Söğüt Flütü': 'blokflut', 'Flüt': 'flut', 'Klarnet': 'klarnet', 'Klarnet (Türk / Sol)': 'klarnet', 'Obua': 'obua',
    'Trompet': 'trompet', 'Trombon': 'trombon', 'Korno': 'korno', 'Keman': 'keman', 'Viyola': 'viyola', 'Çello': 'cello', 'Kontrbas (Yay)': 'kontrbas', 'Yaylı Grubu (Orkestra)': 'orkestra', 'Akustik Gitar': 'agitar',
  };
  // Amfi ve efekt zinciri korunanlar: temiz kayıt modelin kendi zincirinden geçer
  const AMPED = { 'Elektrik Keman (Temiz)': 'keman', 'Elektrik Keman (Metal)': 'keman', 'Folk Metal Keman': 'keman', 'Hardanger Kemanı': 'keman', 'Metal Çello (Distorsiyon)': 'cello', 'Senfonik Metal Yaylıları': 'orkestra' };
  const packOf = name => PACK[name] || AMPED[name] || (/^E\.Gitar · /.test(name) ? 'egitar' : /^E\.Bas · /.test(name) ? 'ebas' : null);
  const amped = name => !!AMPED[name] || /^E\.(Gitar|Bas) · /.test(name);
  R.packOf = packOf;
  const loaded = new Map(), users = new Map(), pending = new Map();
  const decodeCtx = () => OS.engine.init();
  const toBytes = b64 => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  // Uzun notalar için döngü: perdenin katı uzunlukta en benzer iki bölge bulunur, birleşim yumuşatılır
  function makeLoop(buf, root) {
    const sr = buf.sampleRate, per = sr / hz(root), L = Math.max(Math.round(0.45 * sr / per), 1) * per, n = buf.length, a = buf.getChannelData(0), xf = Math.floor(Math.min(0.04 * sr, L * 0.3));
    const s0 = Math.floor(n * 0.35), last = n - L - Math.floor(0.06 * sr); if (last <= s0) return null;
    let best = s0, bv = -Infinity; const W = 1024;
    for (let k = 0; k < 96; k++) { const s = Math.floor(s0 + (last - s0) * k / 96), e = Math.round(s + L); let c = 0, x = 0, y = 0; for (let i = 0; i < W; i += 2) { const p = a[s + i], q = a[e + i]; c += p * q; x += p * p; y += q * q; } const v = c / Math.sqrt(x * y + 1e-12); if (v > bv) { bv = v; best = s; } }
    const s = best, e = Math.round(s + L); if (s < xf) return null;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < xf; i++) { const k = i / xf; d[e - xf + i] = d[e - xf + i] * (1 - k) + d[s - xf + i] * k; } }
    return [s / sr, e / sr];
  }
  const onsetOf = buf => { const d = buf.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk * 0.02) return Math.max(0, i - 40) / buf.sampleRate; return 0; };

  function loadScript(id) {
    return new Promise((res, rej) => { if (window.OS_REAL && window.OS_REAL[id]) return res(); const s = document.createElement('script'); s.src = 'mrh-sesler/' + id + '.js'; s.onload = res; s.onerror = () => rej(new Error(id)); document.head.appendChild(s); });
  }
  async function loadPack(id) {
    if (loaded.has(id)) return loaded.get(id);
    const p = (async () => {
      await loadScript(id);
      const P = window.OS_REAL[id], ctx = decodeCtx();
      const z = await Promise.all(P.z.map(async ([m, c, b]) => { const buf = await ctx.decodeAudioData(toBytes(b).buffer), root = m + c / 100; return { buf, root, start: onsetOf(buf), loop: P.sus ? makeLoop(buf, root) : null, lo: 0, hi: 127, lv: 0, hv: 127, gain: 1, rr: 0 }; }));
      delete window.OS_REAL[id];
      return z;
    })();
    loaded.set(id, p); p.then(z => loaded.set(id, z)).catch(() => loaded.delete(id));
    return p;
  }

  // ---------------- Kullanıcı atamaları ----------------
  const KEY = n => 'realsnd:' + n;
  async function decodeUser(rec) {
    if (rec.type === 'sf2') return decodeSF2(await rec.file.arrayBuffer(), rec.preset);
    const ctx = decodeCtx();
    return (await Promise.all(rec.files.map(async f => {
      try { const buf = await ctx.decodeAudioData(await f.blob.arrayBuffer()), root = f.root != null ? f.root : 60; return { buf, root: root - (f.tune || 0) / 100, start: f.offset ? f.offset / buf.sampleRate : onsetOf(buf), loop: f.loop ? [f.loop[0] / buf.sampleRate, f.loop[1] / buf.sampleRate] : (rec.sus ? makeLoop(buf, root) : null), lo: f.lo != null ? f.lo : 0, hi: f.hi != null ? f.hi : 127, lv: f.lv != null ? f.lv : 0, hv: f.hv != null ? f.hv : 127, gain: f.gain || 1, rr: f.rr || 0, rel: f.rel }; } catch (e) { console.warn(f.name, e); return null; }
    }))).filter(Boolean);
  }
  async function loadUser(name) {
    if (users.has(name)) return users.get(name);
    let rec = null; try { rec = await OS.store.get('kv', KEY(name)); } catch (e) { }
    if (!rec) { users.set(name, null); return null; }
    const z = await decodeUser(rec); const out = z.length ? { zones: z, label: rec.label } : null;
    users.set(name, out); return out;
  }
  R.prepare = name => {
    if (pending.has(name)) return pending.get(name);
    const p = (async () => { const u = await loadUser(name); if (u) return; const id = packOf(name); if (id) await loadPack(id); })().catch(e => console.warn(e));
    pending.set(name, p); return p;
  };
  // Çalınabilir kayıt: { zones, keep: amfi zinciri korunur mu, user }
  R.active = name => {
    const u = users.get(name); if (u) return { zones: u.zones, keep: amped(name), user: true, label: u.label };
    const id = packOf(name), z = id && loaded.get(id);
    return z && Array.isArray(z) ? { zones: z, keep: amped(name), user: false } : null;
  };
  const changed = name => { pending.delete(name); users.delete(name); document.dispatchEvent(new CustomEvent('os-real-changed', { detail: { name } })); };
  R.assign = async (name, rec) => { await OS.store.put('kv', KEY(name), rec); changed(name); await R.prepare(name); };
  R.clear = async name => { await OS.store.del('kv', KEY(name)).catch(() => { }); changed(name); await R.prepare(name); };

  // ---------------- Çalma ----------------
  const counters = new WeakMap();
  function pick(Z, n, vel) {
    let c = Z.filter(z => n >= z.lo && n <= z.hi && vel >= z.lv && vel <= z.hv);
    if (!c.length) { let bd = Infinity; Z.forEach(z => { const d = Math.abs(z.root - n); if (d < bd) bd = d; }); c = Z.filter(z => Math.abs(z.root - n) === bd); }
    if (c.length > 1) { const k = (counters.get(Z) || 0) + 1; counters.set(Z, k); return c[k % c.length]; }
    return c[0];
  }
  R.pick = pick;
  // vc: ses kaydı; amp: nota kazancı. Filtre, tek katmanlı kayıtlarda vuruş gücünü duyurur.
  R.voice = function (ctx, Z, nn, f, v, t, vc, amp, o) {
    o = o || {};
    const z = pick(Z, Math.round(nn), Math.round(v * 127)), s = ctx.createBufferSource(), lp = ctx.createBiquadFilter();
    s.buffer = z.buf; s.playbackRate.value = f / hz(z.root);
    if (z.loop) { s.loop = true; s.loopStart = z.loop[0]; s.loopEnd = z.loop[1]; }
    lp.type = 'lowpass'; lp.frequency.value = Math.min(20000, (o.palm ? 1000 : 2200) + 17000 * v * v); lp.Q.value = 0.5;
    s.connect(lp); lp.connect(amp);
    const lvl = (o.lvl || 0.8) * z.gain * (0.3 + 0.7 * v);
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(lvl, t + 0.002);
    if (o.palm) amp.gain.setTargetAtTime(0, t + 0.02, 0.07);
    else if (!z.loop && o.sustain && o.sustain < 0.95) amp.gain.setTargetAtTime(0, t + 0.04, Math.max(0.05, z.buf.duration * o.sustain / 3.5));
    s.start(t, z.start || 0); vc.src.push(s); vc.real = z;
    if (!z.loop) vc.auto = z.buf.duration / s.playbackRate.value + 0.05;
    return s;
  };

  // ---------------- Dosya ve nota adı çözümleme ----------------
  const NT = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  R.noteName = s => { const m = String(s).trim().toLowerCase().match(/^([a-g])([#b]?)(-?\d)$/); return m ? NT[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12 : null; };
  R.noteFromFile = name => {
    const b = name.replace(/\.\w+$/, ''); let m, r = null; const re = /(?:^|[_\- .(])([A-Ga-g][#b]?-?\d)(?=$|[_\- .)])/g;
    while ((m = re.exec(b))) r = R.noteName(m[1]);
    if (r != null) return r;
    const d = b.match(/(?:^|[_\- ])(\d{2,3})(?=$|[_\- ])/); return d && +d[1] >= 12 && +d[1] <= 115 ? +d[1] : null;
  };
  // Sesin perdesini kendisi bulur (dosya adında nota yoksa)
  R.detectRoot = function (buf) {
    const x = buf.getChannelData(0), sr = buf.sampleRate, W = 2048, st = Math.min(x.length - W * 3, Math.floor(sr * 0.12)); if (st < 0) return null;
    const tMin = Math.floor(sr / 4000), tMax = Math.min(Math.floor(sr / 27), W - 1), y = new Float32Array(tMax + 1);
    for (let t = 1; t <= tMax; t++) { let s = 0; for (let i = 0; i < W; i++) { const d = x[st + i] - x[st + i + t]; s += d * d; } y[t] = s; }
    let run = 0; const c = new Float32Array(tMax + 1); c[0] = 1;
    for (let t = 1; t <= tMax; t++) { run += y[t]; c[t] = run ? y[t] * t / run : 1; }
    for (let t = tMin; t < tMax; t++) if (c[t] < 0.15 && c[t] <= c[t + 1]) { const a = c[t - 1], b = c[t], e = c[t + 1], off = (a - e) / (2 * (a - 2 * b + e) || 1); return 69 + 12 * Math.log2(sr / (t + off) / 440); }
    return null;
  };

  // ---------------- SFZ ----------------
  R.parseSFZ = function (text, include) {
    const defs = {}; const inc = (t, d) => t.replace(/\/\/[^\n]*/g, '').replace(/#define\s+(\$\w+)\s+(\S+)/g, (m, k, v) => { defs[k] = v; return ''; }).replace(/#include\s+"([^"]+)"/g, (m, f) => d < 8 && include ? inc(include(f) || '', d + 1) : '');
    let src = inc(text, 0); Object.keys(defs).sort((a, b) => b.length - a.length).forEach(k => { src = src.split(k).join(defs[k]); });
    const zones = []; let section = null, global = {}, master = {}, group = {}, control = {}, cur = null;
    const parts = src.split(/(<\w+>)/);
    const opc = s => { const o = {}, re = /(\w+)=/g; let m, last = null, st = 0; while ((m = re.exec(s))) { if (last) o[last] = s.slice(st, m.index).trim(); last = m[1]; st = re.lastIndex; } if (last) o[last] = s.slice(st).split(/\r?\n/)[0].trim(); return o; };
    const close = () => { if (section === 'region' && cur && cur.sample) zones.push(Object.assign({}, global, master, group, cur)); };
    parts.forEach(p => {
      const h = p.match(/^<(\w+)>$/);
      if (h) { close(); section = h[1].toLowerCase(); cur = {}; if (section === 'group') group = {}; if (section === 'master') { master = {}; group = {}; } return; }
      const o = opc(p);
      if (section === 'region') Object.assign(cur, o); else if (section === 'group') Object.assign(group, o); else if (section === 'master') Object.assign(master, o); else if (section === 'global') Object.assign(global, o); else if (section === 'control') Object.assign(control, o);
    });
    close();
    const nv = (v, d) => { if (v == null) return d; const n = R.noteName(v); return n != null ? n : (+v === +v ? +v : d); };
    return zones.map(z => {
      const key = nv(z.key), lo = key != null ? key : nv(z.lokey, 0), hi = key != null ? key : nv(z.hikey, 127), root = nv(z.pitch_keycenter, key != null ? key : 60);
      const looped = z.loop_mode && /loop_(continuous|sustain)/.test(z.loop_mode) && z.loop_start != null && z.loop_end != null;
      return { sample: (control.default_path || '') + z.sample, lo, hi, root: root - (+z.transpose || 0) - (+z.note_offset || 0), lv: +z.lovel || 0, hv: z.hivel != null ? +z.hivel : 127, tune: +z.tune || 0, gain: z.volume != null ? Math.pow(10, +z.volume / 20) : 1, offset: +z.offset || 0, loop: looped ? [+z.loop_start, +z.loop_end] : null, rel: z.ampeg_release != null ? +z.ampeg_release : undefined, rr: +z.seq_position || 0, trig: z.trigger };
    }).filter(z => !z.trig || z.trig === 'attack');
  };
  const pathKey = p => p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  function resolve(base, rel) { const out = []; (base + rel).split('/').forEach(s => { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }); return out.join('/'); }
  R.fromFolder = async function (files, sfzFile) {
    const map = new Map(), rel = f => f.webkitRelativePath || f.name; files.forEach(f => map.set(pathKey(rel(f)), f));
    const dir = pathKey(rel(sfzFile)).replace(/[^/]*$/, ''), texts = new Map();
    for (const f of files) if (/\.(sfzh?|txt)$/i.test(f.name)) texts.set(pathKey(rel(f)), await f.text());
    const zs = R.parseSFZ(await sfzFile.text(), n => texts.get(resolve(dir, pathKey(n))) || '');
    const byName = new Map(); files.forEach(f => byName.set(f.name.toLowerCase(), f));
    const out = [], miss = [];
    zs.slice(0, 600).forEach(z => { const p = pathKey(z.sample), f = map.get(resolve(dir, p)) || byName.get(p.split('/').pop()); if (!f) { miss.push(z.sample); return; } out.push({ name: f.name, blob: f, root: z.root, lo: z.lo, hi: z.hi, lv: z.lv, hv: z.hv, tune: z.tune, gain: z.gain, offset: z.offset, loop: z.loop, rr: z.rr, rel: z.rel }); });
    return { files: out, missing: miss.length, total: zs.length };
  };

  // ---------------- SoundFont 2 ----------------
  function riff(ab) {
    const v = new DataView(ab), str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(o + i); if (c) s += String.fromCharCode(c); else break; } return s; };
    if (str(0, 4) !== 'RIFF' || str(8, 4) !== 'sfbk') throw new Error('SoundFont değil');
    const ch = {}; let i = 12;
    while (i + 8 <= ab.byteLength) { const id = str(i, 4), n = v.getUint32(i + 4, true); if (id === 'LIST') { const t = str(i + 8, 4); let j = i + 12; const e = i + 8 + n; while (j + 8 <= e) { const c = str(j, 4), m = v.getUint32(j + 4, true); ch[t + '.' + c] = [j + 8, m]; j += 8 + m + (m & 1); } } i += 8 + n + (n & 1); }
    const rec = (k, sz, fn) => { const [o, n] = ch[k]; return Array.from({ length: Math.floor(n / sz) }, (_, x) => fn(o + x * sz)); };
    return {
      v, str, smpl: ch['sdta.smpl'],
      phdr: rec('pdta.phdr', 38, o => ({ name: str(o, 20), preset: v.getUint16(o + 20, true), bank: v.getUint16(o + 22, true), bag: v.getUint16(o + 24, true) })),
      pbag: rec('pdta.pbag', 4, o => v.getUint16(o, true)), pgen: rec('pdta.pgen', 4, o => ({ g: v.getUint16(o, true), a: v.getInt16(o + 2, true), u: v.getUint16(o + 2, true), lo: v.getUint8(o + 2), hi: v.getUint8(o + 3) })),
      inst: rec('pdta.inst', 22, o => ({ name: str(o, 20), bag: v.getUint16(o + 20, true) })), ibag: rec('pdta.ibag', 4, o => v.getUint16(o, true)),
      igen: rec('pdta.igen', 4, o => ({ g: v.getUint16(o, true), a: v.getInt16(o + 2, true), u: v.getUint16(o + 2, true), lo: v.getUint8(o + 2), hi: v.getUint8(o + 3) })),
      shdr: rec('pdta.shdr', 46, o => ({ name: str(o, 20), start: v.getUint32(o + 20, true), end: v.getUint32(o + 24, true), ls: v.getUint32(o + 28, true), le: v.getUint32(o + 32, true), rate: v.getUint32(o + 36, true), key: v.getUint8(o + 40), corr: v.getInt8(o + 41) })),
    };
  }
  R.sf2Presets = ab => { const S = riff(ab); return S.phdr.slice(0, -1).map((p, i) => ({ i, name: p.name, bank: p.bank, preset: p.preset })).sort((a, b) => a.bank - b.bank || a.preset - b.preset); };
  function zones(gens) { const o = {}; gens.forEach(x => { o[x.g] = x; }); return o; }
  function decodeSF2(ab, idx) {
    const S = riff(ab), ctx = decodeCtx(), P = S.phdr[idx], out = [], cache = new Map(), pcm = new Int16Array(ab, S.smpl[0], S.smpl[1] >> 1);
    for (let b = P.bag; b < S.phdr[idx + 1].bag; b++) {
      const pg = zones(S.pgen.slice(S.pbag[b], S.pbag[b + 1])); if (!pg[41]) continue;
      const I = S.inst[pg[41].u], iEnd = S.inst[pg[41].u + 1].bag;
      let glob = {};
      for (let ib = I.bag; ib < iEnd; ib++) {
        const g = Object.assign({}, glob, zones(S.igen.slice(S.ibag[ib], S.ibag[ib + 1])));
        if (!g[53]) { glob = g; continue; }
        const sh = S.shdr[g[53].u], off = k => (g[k] ? g[k].a : 0);
        const st = sh.start + off(0) + off(4) * 32768, en = sh.end + off(1) + off(12) * 32768;
        const mode = g[54] ? g[54].u & 3 : 0;
        if (!cache.has(g[53].u)) { const buf = ctx.createBuffer(1, Math.max(1, en - st), sh.rate || 44100), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = pcm[st + i] / 32768; cache.set(g[53].u, buf); }
        const key = g[58] && g[58].a >= 0 ? g[58].a : sh.key, ct = off(51) + (pg[51] ? pg[51].a : 0), ft = off(52) + (pg[52] ? pg[52].a : 0) + sh.corr;
        const kr = g[43] || pg[43], vr = g[44] || pg[44], att = off(48) + (pg[48] ? pg[48].a : 0);
        const ls = sh.ls + off(2) + off(45) * 32768 - st, le = sh.le + off(3) + off(50) * 32768 - st, buf = cache.get(g[53].u);
        out.push({ buf, root: key - ct - ft / 100, start: 0, loop: mode === 1 || mode === 3 ? [ls / buf.sampleRate, le / buf.sampleRate] : null, lo: kr ? kr.lo : 0, hi: kr ? kr.hi : 127, lv: vr ? vr.lo : 0, hv: vr ? vr.hi : 127, gain: Math.pow(10, -att / 400 * 0.4), rr: 0 });
      }
    }
    return out;
  }


  // ---------------- Gerçek perküsyon: her tuşta bir kayıt ----------------
  const PERC = {"36": "Darbuka 1", "37": "Darbuka 2", "38": "Darbuka 3", "39": "Darbuka 4", "40": "Darbuka 5", "41": "Büyük Bendir", "42": "Büyük Bendir Boğuk", "43": "Büyük Bendir El", "44": "Küçük Def", "45": "Küçük Def Boğuk", "46": "Küçük Def El", "47": "Tumba", "48": "Conga", "49": "Quinto", "50": "Bongo Tiz", "51": "Bongo Pes", "52": "Cajon Bas", "53": "Cajon Orta", "54": "Cajon Tiz", "55": "Tef Vuruş", "56": "Tef Sallama", "57": "Claves", "58": "Cowbell", "59": "Shaker", "60": "Üçgen", "61": "Agogo Tiz", "62": "Agogo Pes", "63": "Guiro", "64": "Parmak Zili"};
  R.registerPerc = function () {
    const U = OS.U;
    OS.plugins.register({
      id: 'inst.realperc', name: 'Gerçek Perküsyon', type: 'instrument', category: 'Enstrüman', drumMap: PERC,
      params: [{ id: 'tune', name: 'Akort', min: -12, max: 12, def: 0, unit: 'st' }, { id: 'vol', name: 'Ses', min: -40, max: 6, def: -3, unit: 'dB' }],
      create(ctx) {
        const out = ctx.createGain(); let zs = null, tune = 0; const live = [];
        const ready = loadPack('perkusyon').then(z => { zs = z; }).catch(() => U.toast(OS.t('Sesler yüklenemedi')));
        return { output: out, ready, set(id, v) { if (id === 'tune') tune = v; else out.gain.value = U.dbToGain(v); },
          noteOn(n, v, t) { if (!zs) return; t = Math.max(t || 0, ctx.currentTime); const z = zs.find(x => x.root === n); if (!z) return; const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = z.buf; s.playbackRate.value = Math.pow(2, tune / 12); g.gain.value = Math.pow((v == null ? 100 : v) / 127, 1.3) * 1.1; s.connect(g); g.connect(out); s.start(t, z.start || 0); live.push(s); s.onended = () => { const i = live.indexOf(s); if (i >= 0) live.splice(i, 1); }; },
          noteOff() { }, allOff() { live.splice(0).forEach(s => { try { s.stop(); } catch (e) { } }); } };
      },
    });
  };
  // ---------------- Atama penceresi ----------------
  const pickDir = () => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.webkitdirectory = true; i.multiple = true; i.onchange = () => res([...i.files]); i.click(); });
  R.dialog = function (name, label) {
    const U = OS.U, el = U.el;
    const stat = el('div', { class: 'muted' }, OS.t('Çalışılıyor olabilir, lütfen bekleyin.')); stat.style.display = 'none';
    const sus = el('input', { type: 'checkbox' });
    const busy = t => { stat.style.display = ''; stat.textContent = t; };
    const done = (msg, m) => { U.toast(msg, 5000); m(); };
    const close = () => { const b = document.querySelector('.modal-back:last-of-type'); if (b) b.remove(); };
    const files = async () => {
      const fs = await U.pickFiles('audio/*,.wav,.flac,.ogg,.mp3,.m4a,.aif,.aiff', true); if (!fs.length) return;
      busy(OS.t('Dosyalar inceleniyor…'));
      const ctx = decodeCtx(), out = [];
      for (const f of fs) { let root = R.noteFromFile(f.name); if (root == null) { try { root = R.detectRoot(await ctx.decodeAudioData(await f.arrayBuffer())); } catch (e) { U.toast(OS.t('Dosya okunamadı') + ': ' + f.name); continue; } } if (root == null) root = 60; out.push({ name: f.name, blob: f, root }); }
      if (!out.length) return;
      await R.assign(name, { type: 'files', label: out.length === 1 ? out[0].name : out.length + ' ' + OS.t('dosya'), sus: sus.checked, files: out });
      done(label + ': ' + out.length + ' ' + OS.t('ses atandı'), close);
    };
    const sfz = async () => {
      const fs = await pickDir(); if (!fs.length) return;
      const list = fs.filter(f => /\.sfz$/i.test(f.name)); if (!list.length) { U.toast(OS.t('Klasörde SFZ dosyası yok')); return; }
      const go = async f => { busy(OS.t('Dosyalar inceleniyor…')); const r = await R.fromFolder(fs, f); if (!r.files.length) { U.toast(OS.t('SFZ içindeki ses dosyaları bulunamadı'), 6000); return; } await R.assign(name, { type: 'sfz', label: f.name, files: r.files }); done(label + ': ' + r.files.length + ' ' + OS.t('ses atandı') + (r.missing ? ' · ' + r.missing + ' ' + OS.t('eksik') : ''), close); };
      if (list.length === 1) return go(list[0]);
      const box = el('div', { class: 'lib-list', style: 'max-height:50vh;overflow:auto' }); list.forEach(f => box.appendChild(el('div', { class: 'lib-row', onclick: () => { document.querySelector('.modal-back:last-of-type').remove(); go(f); } }, f.name)));
      U.modal(OS.t('SFZ seç'), box, [{ label: 'İptal' }]);
    };
    const sf2 = async () => {
      const [f] = await U.pickFiles('.sf2'); if (!f) return;
      busy(OS.t('Dosyalar inceleniyor…'));
      let list; try { list = R.sf2Presets(await f.arrayBuffer()); } catch (e) { U.toast(e.message); return; }
      const box = el('div', { class: 'lib-list', style: 'max-height:50vh;overflow:auto' });
      list.forEach(p => box.appendChild(el('div', { class: 'lib-row', onclick: async () => { document.querySelector('.modal-back:last-of-type').remove(); await R.assign(name, { type: 'sf2', label: p.name, file: f, preset: p.i }); done(label + ': ' + p.name, close); } }, p.bank + ':' + p.preset + '  ' + p.name)));
      U.modal(OS.t('SoundFont sesi seç'), box, [{ label: 'İptal' }]);
    };
    const a = R.active(name);
    U.modal(OS.t('Gerçek ses ata') + ' · ' + label, el('div', { style: 'display:flex;flex-direction:column;gap:10px;max-width:520px' },
      el('div', null, OS.t('Şu anki ses') + ': ', el('b', null, a ? (a.user ? a.label : OS.t('Hazır gerçek kayıt')) : OS.t('Sentez'))),
      el('p', { class: 'muted' }, OS.t('Tek dosya bütün klavyeye yayılır. Birden çok dosyada her biri kendi notasına yerleşir; nota adını dosya adından okur (C4, F#3, 60), yoksa sesin perdesini kendisi bulur.')),
      el('label', { class: 'field' }, sus, OS.t('Uzun nota: basılı tuttukça sürsün')),
      el('button', { class: 'btn primary', onclick: files }, OS.t('Ses dosyaları seç…')),
      el('button', { class: 'btn', onclick: sfz }, OS.t('SFZ klasörü seç…')),
      el('button', { class: 'btn', onclick: sf2 }, OS.t('SoundFont (.sf2) seç…')),
      a && a.user ? el('button', { class: 'btn danger', onclick: async () => { await R.clear(name); U.toast(OS.t('Kendi sesin kaldırıldı')); close(); } }, OS.t('Kendi sesimi kaldır')) : null, stat), [{ label: 'Kapat' }]);
  };
})(window.OS);
