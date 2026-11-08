/* Mr. Mars Music Studio · MRH DGN — otomasyon: ses, pan ve cihaz parametreleri için zaman eğrileri
 *
 * Parça modeli: track.automation = [{ id, target, points: [{ b, v }], read, write }]
 *   target: 'vol' | 'pan' | 'dev:<cihazId>:<parametreId>'
 *   b: vuruş (beat), v: hedefin kendi birimindeki değer (dB, pan, Hz ...)
 * Ses ve pan AudioParam üzerinde örnek hassasiyetinde zamanlanır; cihaz
 * parametreleri canlıda ~25 ms aralıkla, render'da OfflineAudioContext.suspend ile uygulanır.
 */
(function (OS) {
  const U = OS.U, E = OS.engine, T = OS.transport;
  const A = OS.auto = {};
  const VOL = { name: 'Ses', min: -60, max: 12, def: 0, unit: 'dB' };
  const PAN = { name: 'Pan', min: -1, max: 1, def: 0 };
  const writing = new Map(); // lane.id -> son yazılan vuruş
  const applied = new Map(); // lane.id -> canlıda son uygulanan değer
  // Master kanalı da otomasyonda bir parça gibidir
  const allT = () => OS.project.tracks.concat(OS.project.master);
  const nodeOf = t => t === OS.project.master ? E.master : E.nodes.get(t.id);

  // ---------------- Hedefler ----------------
  A.devices = t => [t.instrument, ...t.inserts].filter(Boolean);
  A.spec = function (t, target) {
    if (target === 'vol') return VOL;
    if (target === 'pan') return PAN;
    const [, did, pid] = target.split(':');
    const dev = A.devices(t).find(d => d.id === did);
    const p = dev && dev.def.params.find(x => x.id === pid);
    if (!p) return null;
    return Object.assign({}, p, { name: dev.def.name + ' › ' + p.name, dev, pid });
  };
  A.targets = function (t) {
    const out = [{ target: 'vol', name: 'Ses (Volume)' }, { target: 'pan', name: 'Pan' }];
    A.devices(t).forEach(d => d.def.params.forEach(p => out.push({ target: `dev:${d.id}:${p.id}`, name: d.def.name + ' › ' + p.name, group: d.def.name })));
    return out;
  };

  // ---------------- Değer hesaplama ----------------
  const isLog = s => s.curve === 'log' && s.min > 0;
  const stepped = s => s.type === 'choice' || s.type === 'bool' || !!s.step;
  A.norm = (s, v) => isLog(s) ? Math.log(v / s.min) / Math.log(s.max / s.min) : (v - s.min) / (s.max - s.min);
  A.denorm = (s, n) => {
    n = U.clamp(n, 0, 1);
    let v = isLog(s) ? s.min * Math.pow(s.max / s.min, n) : s.min + n * (s.max - s.min);
    if (s.type === 'choice' || s.type === 'bool' || s.step) v = Math.round(v / (s.step || 1)) * (s.step || 1);
    return v;
  };
  A.valueAt = function (lane, s, b) {
    const pts = lane.points;
    if (!pts.length) return null;
    if (b <= pts[0].b) return pts[0].v;
    const last = pts[pts.length - 1];
    if (b >= last.b) return last.v;
    let i = 1; while (pts[i].b < b) i++;
    const p0 = pts[i - 1], p1 = pts[i];
    if (stepped(s) || p1.b === p0.b) return p0.v;
    const f = (b - p0.b) / (p1.b - p0.b);
    return A.denorm(s, A.norm(s, p0.v) + f * (A.norm(s, p1.v) - A.norm(s, p0.v)));
  };
  // Çalınacak (okuma modunda, noktası olan, yazma modunda olmayan) şerit
  A.readLane = (t, target) => (t.automation || []).find(l => l.target === target && l.read !== false && !(l.write && T.playing) && l.points.length);
  A.sort = lane => lane.points.sort((x, y) => x.b - y.b);

  // ---------------- Canlı çalma ----------------
  function paramOf(s, target) { return target === 'vol' ? s.fader.gain : s.pan.pan; }
  const toParam = (target, v) => target === 'vol' ? (v <= -60 ? 0 : U.dbToGain(v)) : v;

  // Durağan değerler (aktarım dururken veya hiç otomasyon yokken)
  A.staticVol = t => { const l = A.readLane(t, 'vol'); return l ? A.valueAt(l, VOL, T.position()) : t.vol; };
  A.staticPan = t => { const l = A.readLane(t, 'pan'); return l ? A.valueAt(l, PAN, T.position()) : t.pan; };
  A.liveControlled = (t, target) => T.playing && !!A.readLane(t, target);

  A.start = function (beat, when) {
    allT().forEach(t => {
      const s = nodeOf(t); if (!s) return;
      ['vol', 'pan'].forEach(tg => {
        const l = A.readLane(t, tg); if (!l) return;
        const p = paramOf(s, tg);
        p.cancelScheduledValues(0);
        p.setValueAtTime(toParam(tg, A.valueAt(l, tg === 'vol' ? VOL : PAN, beat)), when);
      });
    });
    applied.clear();
  };
  // [a, b) aralığını zamanla: kırılma noktalarına ve (ses için) ara noktalara doğrusal rampa
  A.schedule = function (a, b) {
    allT().forEach(t => {
      const s = nodeOf(t); if (!s) return;
      ['vol', 'pan'].forEach(tg => {
        const l = A.readLane(t, tg); if (!l) return;
        const sp = tg === 'vol' ? VOL : PAN, p = paramOf(s, tg);
        const xs = l.points.filter(q => q.b > a && q.b < b).map(q => q.b);
        if (tg === 'vol') for (let x = Math.ceil(a * 8) / 8; x < b; x += 0.125) if (x > a) xs.push(x);
        xs.push(b);
        xs.sort((x, y) => x - y).forEach(x => p.linearRampToValueAtTime(toParam(tg, A.valueAt(l, sp, x)), T.beatToCtx(x)));
      });
    });
  };
  // Cihaz parametreleri: aktarım zamanlayıcısıyla (~25 ms) güncellenir
  A.tickDevices = function () {
    const b = T.position();
    allT().forEach(t => (t.automation || []).forEach(l => {
      if (!l.target.startsWith('dev:') || l.read === false || l.write || !l.points.length) return;
      const s = A.spec(t, l.target); if (!s) return;
      const v = A.valueAt(l, s, b), last = applied.get(l.id);
      if (last != null && Math.abs(A.norm(s, v) - A.norm(s, last)) < 0.004) return;
      applied.set(l.id, v);
      s.dev.setParam(s.pid, v);
    }));
  };
  A.stop = function () {
    writing.clear(); applied.clear();
    allT().forEach(t => {
      const s = nodeOf(t); if (!s) return;
      s.fader.gain.cancelScheduledValues(0); s.pan.pan.cancelScheduledValues(0);
    });
  };
  // Durdurulmuşken imleç değişince cihaz parametrelerini o konuma getir
  A.applyAtPosition = function () {
    const b = T.position();
    allT().forEach(t => (t.automation || []).forEach(l => {
      if (!l.target.startsWith('dev:') || l.read === false || !l.points.length) return;
      const s = A.spec(t, l.target); if (s) s.dev.setParam(s.pid, A.valueAt(l, s, b));
    }));
  };

  // ---------------- Yazma (çalarken kontrol hareketlerini kaydetme) ----------------
  A.touch = function (t, target, v) {
    if (!T.playing || !t) return;
    const l = (t.automation || []).find(x => x.target === target && x.write);
    if (!l) return;
    const pos = T.position();
    let from = writing.get(l.id);
    if (from == null || from > pos) { OS.history.push(); from = pos - 0.0001; }
    l.points = l.points.filter(p => !(p.b > from && p.b <= pos));
    l.points.push({ b: pos, v }); A.sort(l);
    writing.set(l.id, pos);
    A.redraw && A.redraw(t, l);
  };
  A.touchDevice = function (dev, pid, v) {
    if (!T.playing) return;
    const t = allT().find(x => A.devices(x).includes(dev));
    if (t) A.touch(t, `dev:${dev.id}:${pid}`, v);
  };

  // ---------------- Çevrimdışı render ----------------
  A.scheduleOffline = function (ctx, strips, devById, from, to, b2s) {
    const q = 128 / ctx.sampleRate, used = new Set(), jobs = new Map();
    allT().forEach(t => (t.automation || []).forEach(l => {
      if (l.read === false || !l.points.length) return;
      const st = t === OS.project.master ? strips.master : strips.get(t.id); if (!st) return;
      if (l.target === 'vol' || l.target === 'pan') {
        const sp = l.target === 'vol' ? VOL : PAN, p = paramOf(st, l.target);
        p.setValueAtTime(toParam(l.target, A.valueAt(l, sp, from)), 0);
        const xs = l.points.filter(x => x.b > from && x.b < to).map(x => x.b);
        for (let x = from; x < to; x += 0.125) xs.push(x);
        xs.push(to);
        xs.sort((a, b) => a - b).forEach(x => p.linearRampToValueAtTime(toParam(l.target, A.valueAt(l, sp, x)), b2s(x)));
        return;
      }
      const s = A.spec(t, l.target); if (!s) return;
      const dev = devById.get(s.dev.id); if (!dev) return;
      dev.setParam(s.pid, A.valueAt(l, s, from));
      let last = null;
      for (let x = from; x < to; x += 0.0625) {
        const v = A.valueAt(l, s, x);
        if (last != null && Math.abs(A.norm(s, v) - A.norm(s, last)) < 0.004) continue;
        last = v;
        const at = Math.round(b2s(x) / q) * q;
        if (at <= 0) { dev.setParam(s.pid, v); continue; }
        if (!jobs.has(at)) jobs.set(at, []);
        jobs.get(at).push(() => dev.setParam(s.pid, v));
      }
    }));
    for (const [at, fns] of jobs) {
      if (at >= ctx.length / ctx.sampleRate || used.has(at)) continue;
      used.add(at);
      ctx.suspend(at).then(() => { fns.forEach(f => f()); ctx.resume(); });
    }
  };

  // Çoğaltılan parçada cihaz kimlikleri değişince hedefleri yeniden eşle
  A.remapTargets = function (t, idMap) {
    (t.automation || []).forEach(l => {
      if (!l.target.startsWith('dev:')) return;
      const [, did, pid] = l.target.split(':');
      if (idMap[did]) l.target = `dev:${idMap[did]}:${pid}`;
      l.id = U.uid();
    });
  };
})(window.OS);
