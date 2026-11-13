/* Mr. Mars Music Studio · MRH DGN — şarkı bölümleri, genel bakış şeridi ve cümle çizgileri */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, T = OS.transport;
  const S = ui.sections = {};
  const COLORS = ['#c0533a', '#3a8fc0', '#7aa83a', '#b08a2e', '#8a5cc0', '#3aa89a', '#c03a7a', '#6c7a8a'];
  const P = () => OS.project;
  const z = () => P().zoom;
  const bar = () => P().sig[0];
  let $lane, $ov, ovCv, $scroll;

  const list = () => (P().sections = P().sections || []);
  const sorted = () => list().slice().sort((a, b) => a.start - b.start);

  /** Kendiliğinden adlandırılan bölümler soldan sağa sıra numarası alır; elle verilen ad değişmez. */
  function autoNames() {
    sorted().forEach((s, i) => { if (s.auto !== false) s.name = OS.t('Bölüm') + ' ' + (i + 1); });
  }

  // ---------------- İçerik işlemleri (tüm parçalar + otomasyon) ----------------
  function allLanes() {
    const out = [];
    P().tracks.forEach(t => (t.automation || []).forEach(l => out.push(l)));
    (P().master.automation || []).forEach(l => out.push(l));
    return out;
  }

  /** Klibi verilen vuruşta ikiye böler (ses ofseti ve notalar korunur). */
  function splitClip(t, c, at) {
    const cut = at - c.start;
    const n = U.deepClone(c); n.id = U.uid(); n.start = at; n.length = c.length - cut;
    if (c.bufferId) n.offset = (c.offset || 0) + T.beatToSec(cut);
    if (c.notes) { n.notes = c.notes.filter(x => x.s >= cut).map(x => Object.assign({}, x, { s: x.s - cut })); c.notes = c.notes.filter(x => x.s < cut).map(x => Object.assign({}, x, { l: Math.min(x.l, cut - x.s) })); }
    if (c.fadeOut) { n.fadeOut = c.fadeOut; c.fadeOut = 0; }
    if (c.fadeIn) n.fadeIn = 0;
    c.length = cut;
    t.clips.push(n);
  }
  function cutAt(at) {
    P().tracks.forEach(t => t.clips.slice().forEach(c => { if (at > c.start + 1e-6 && at < c.start + c.length - 1e-6) splitClip(t, c, at); }));
  }
  /** at ve sonrasındaki her şeyi delta kadar kaydırır. */
  function shiftFrom(at, delta, except) {
    P().tracks.forEach(t => t.clips.forEach(c => { if (c.start >= at - 1e-6) c.start = Math.max(0, c.start + delta); }));
    allLanes().forEach(l => l.points.forEach(p => { if (p.b >= at - 1e-6) p.b = Math.max(0, p.b + delta); }));
    list().forEach(s => { if (s !== except && s.start >= at - 1e-6) { s.start += delta; s.end += delta; } });
    const L = P().loop; if (L.start >= at - 1e-6) { L.start = Math.max(0, L.start + delta); L.end = Math.max(L.start + 1, L.end + delta); }
  }
  /** [a, b) arasındaki klipleri ve otomasyon noktalarını göreli olarak kopyalar. */
  function extract(a, b) {
    cutAt(a); cutAt(b);
    const clips = [], points = [];
    P().tracks.forEach(t => t.clips.forEach(c => { if (c.start >= a - 1e-6 && c.start < b - 1e-6) { const n = U.deepClone(c); n.start -= a; clips.push({ t, c: n }); } }));
    allLanes().forEach(l => l.points.forEach(p => { if (p.b >= a - 1e-6 && p.b < b - 1e-6) points.push({ l, p: { b: p.b - a, v: p.v } }); }));
    return { clips, points, len: b - a };
  }
  function removeRange(a, b) {
    cutAt(a); cutAt(b);
    P().tracks.forEach(t => t.clips = t.clips.filter(c => !(c.start >= a - 1e-6 && c.start < b - 1e-6)));
    allLanes().forEach(l => l.points = l.points.filter(p => !(p.b >= a - 1e-6 && p.b < b - 1e-6)));
    P().sections = list().filter(s => !(s.start >= a - 1e-6 && s.end <= b + 1e-6));
    shiftFrom(b, -(b - a));
  }
  function insertAt(at, ex) {
    cutAt(at); shiftFrom(at, ex.len);
    ex.clips.forEach(({ t, c }) => { const n = U.deepClone(c); n.id = U.uid(); n.start += at; t.clips.push(n); });
    ex.points.forEach(({ l, p }) => l.points.push({ b: p.b + at, v: p.v }));
    allLanes().forEach(l => OS.auto.sort(l));
  }
  const commit = () => { autoNames(); OS.engine.syncAll(); ui.changed(); };

  S.duplicateWithContent = function (s) {
    OS.history.push();
    const ex = extract(s.start, s.end);
    insertAt(s.end, ex);
    list().push({ id: U.uid(), start: s.end, end: s.end + ex.len, name: s.name, auto: s.auto, color: s.color });
    commit();
  };
  S.deleteWithContent = function (s) {
    OS.history.push();
    P().sections = list().filter(x => x !== s);
    removeRange(s.start, s.end);
    commit();
  };
  /** Bölümü bir öncekinin yerine taşır; aradakiler yer değiştirir, şarkının uzunluğu değişmez. */
  S.moveEarlier = function (s) {
    const prev = sorted().filter(x => x !== s && x.end <= s.start + 1e-6).pop();
    if (!prev) { U.toast(OS.t('Önünde bölüm yok')); return; }
    OS.history.push();
    const len = s.end - s.start, to = prev.start;
    const ex = extract(s.start, s.end);
    P().sections = list().filter(x => x !== s);
    removeRange(s.start, s.end);
    insertAt(to, ex);
    s.start = to; s.end = to + len; list().push(s);
    commit();
  };
  S.moveLater = function (s) {
    const next = sorted().find(x => x !== s && x.start >= s.end - 1e-6);
    if (!next) { U.toast(OS.t('Arkasında bölüm yok')); return; }
    S.moveEarlier(next);
  };
  S.loop = function (s) { const L = P().loop; L.start = s.start; L.end = s.end; L.on = true; ui.updateTransportUI(); ui.arrange.drawRuler(); S.render(); };
  S.selectContent = function (s) {
    ui.selectedClips.clear();
    P().tracks.forEach(t => t.clips.forEach(c => { if (c.start < s.end && c.start + c.length > s.start) ui.selectedClips.add(c.id); }));
    ui.arrange.render();
  };
  S.rename = async function (s) {
    const n = await U.prompt(OS.t('Bölüm adı (boş bırakılırsa otomatik ad)'), s.auto === false ? s.name : '');
    if (n == null) return;
    OS.history.push();
    if (n.trim()) { s.name = n.trim(); s.auto = false; } else s.auto = true;
    commit();
  };
  S.atPlayhead = () => { const b = T.position(); return list().find(s => b >= s.start && b < s.end); };

  // ---------------- Bölüm şeridi ----------------
  S.init = function () {
    $scroll = document.getElementById('arr-scroll');
    $lane = document.getElementById('arr-sections');
    $ov = document.getElementById('arr-overview');
    ovCv = el('canvas'); $ov.appendChild(ovCv);
    laneEvents(); overviewEvents();
    $scroll.addEventListener('scroll', drawOverview);
    new ResizeObserver(drawOverview).observe($ov);
    document.addEventListener('os-pos', drawOverview);
    const tick = () => { if (T.playing && document.getElementById('view-arrange').classList.contains('active')) drawOverview(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };

  S.render = function () {
    if (!$lane) return;
    autoNames();
    const W = ui.arrange.totalBeats() * z();
    $lane.style.width = W + 'px';
    $lane.innerHTML = '';
    $lane.style.visibility = P().showSections === false ? 'hidden' : '';   // yer kaplamaya devam eder, başlık hizası bozulmaz
    sorted().forEach((s, i) => {
      if (!s.color) s.color = COLORS[i % COLORS.length];
      const d = el('div', { class: 'sec' + (S.atPlayhead() === s ? ' cur' : ''), style: { left: s.start * z() + 'px', width: Math.max(6, (s.end - s.start) * z()) + 'px', background: s.color }, title: s.name },
        el('span', s.auto === false ? { translate: 'no' } : null, s.name), el('i', { class: 'e l' }), el('i', { class: 'e r' }));
      d._sec = s;
      $lane.appendChild(d);
    });
    drawOverview();
  };

  function laneEvents() {
    $lane.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const r = $lane.getBoundingClientRect(), x0 = e.clientX - r.left;
      const target = e.target.closest('.sec');
      const snapBar = b => Math.max(0, Math.round(b / bar()) * bar());
      if (!target) {
        // boş alanda sürükle: yeni bölüm (tam ölçülere oturur)
        let ghost = null;
        U.drag(e, dx => {
          const a = snapBar(Math.min(x0, x0 + dx) / z()), b = Math.max(a + bar(), snapBar(Math.max(x0, x0 + dx) / z()));
          if (!ghost) { ghost = el('div', { class: 'sec ghost' }); $lane.appendChild(ghost); }
          ghost.style.left = a * z() + 'px'; ghost.style.width = (b - a) * z() + 'px'; ghost._a = a; ghost._b = b;
        }, () => {
          if (!ghost) return;
          OS.history.push();
          list().push({ id: U.uid(), start: ghost._a, end: ghost._b, auto: true });
          commit();
        });
        return;
      }
      const s = target._sec, edge = e.target.classList.contains('e') ? (e.target.classList.contains('l') ? 'l' : 'r') : null;
      const a0 = s.start, b0 = s.end;
      let moved = false;
      U.drag(e, dx => {
        if (Math.abs(dx) > 3 && !moved) { moved = true; OS.history.push(); }
        if (!moved) return;
        const db = Math.round(dx / z() / bar()) * bar();
        if (edge === 'l') s.start = Math.min(b0 - bar(), Math.max(0, a0 + db));
        else if (edge === 'r') s.end = Math.max(a0 + bar(), b0 + db);
        else { s.start = Math.max(0, a0 + db); s.end = s.start + (b0 - a0); }   // yalnız işaret taşınır, içerik yerinde kalır
        S.render();
      }, () => { if (moved) commit(); else { T.setPosition(s.start); S.render(); } });
    });
    $lane.addEventListener('dblclick', e => { const target = e.target.closest('.sec'); if (target) S.rename(target._sec); });
    $lane.addEventListener('contextmenu', e => {
      e.preventDefault();
      const target = e.target.closest('.sec');
      if (!target) {
        U.menu(e.clientX, e.clientY, [{ label: OS.t('Bölümleri gizle'), onclick: () => { P().showSections = false; S.render(); } }]);
        return;
      }
      const s = target._sec;
      U.menu(e.clientX, e.clientY, [
        { label: OS.t('Bu bölümü döngüye al'), onclick: () => S.loop(s) },
        { label: OS.t('Bölümün içeriğini seç'), onclick: () => S.selectContent(s) },
        '-',
        { label: OS.t('Önceye taşı (içeriğiyle)'), onclick: () => S.moveEarlier(s) },
        { label: OS.t('Sonraya taşı (içeriğiyle)'), onclick: () => S.moveLater(s) },
        { label: OS.t('İçeriğiyle çoğalt'), onclick: () => S.duplicateWithContent(s) },
        { label: OS.t('İçeriğiyle sil'), onclick: () => S.deleteWithContent(s) },
        '-',
        { label: OS.t('Yeniden adlandır…'), onclick: () => S.rename(s) },
        { label: OS.t('Otomatik ada dön'), disabled: s.auto !== false, onclick: () => { OS.history.push(); s.auto = true; commit(); } },
        { label: OS.t('Yalnız işareti sil'), onclick: () => { OS.history.push(); P().sections = list().filter(x => x !== s); commit(); } },
      ]);
    });
  }

  // ---------------- Genel bakış şeridi ----------------
  function view() { return { a: $scroll.scrollLeft / z(), b: ($scroll.scrollLeft + $scroll.clientWidth) / z() }; }

  function drawOverview() {
    if (!ovCv || !P() || !$ov.offsetParent) return;
    const w = ovCv.width = $ov.clientWidth, h = ovCv.height = $ov.clientHeight, g = ovCv.getContext('2d');
    const total = ui.arrange.totalBeats(), k = w / total;
    g.clearRect(0, 0, w, h);
    sorted().forEach(s => { g.fillStyle = (s.color || '#666') + '55'; g.fillRect(s.start * k, 0, (s.end - s.start) * k, h); });
    const tracks = P().tracks, rh = Math.max(1, (h - 4) / Math.max(1, tracks.length));
    tracks.forEach((t, i) => {
      g.fillStyle = t.color || '#888';
      t.clips.forEach(c => { if (!c.muted) g.fillRect(c.start * k, 2 + i * rh, Math.max(1, c.length * k), Math.max(1, rh - 1)); });
    });
    const L = P().loop;
    if (L.on) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(L.start * k, 0, (L.end - L.start) * k, h); }
    const v = view();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5;
    g.strokeRect(v.a * k + 0.5, 0.5, Math.max(4, (v.b - v.a) * k) - 1, h - 1);
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(v.a * k, 0, (v.b - v.a) * k, h);
    g.fillStyle = '#ff3b30'; g.fillRect(T.position() * k, 0, 1.5, h);
  }
  S.drawOverview = drawOverview;

  function overviewEvents() {
    $ov.addEventListener('mousedown', e => {
      const r = $ov.getBoundingClientRect(), total = ui.arrange.totalBeats(), k = r.width / total;
      const x = e.clientX - r.left, v = view(), xa = v.a * k, xb = v.b * k;
      const mode = Math.abs(x - xa) < 6 ? 'l' : Math.abs(x - xb) < 6 ? 'r' : (x > xa && x < xb ? 'move' : 'jump');
      if (mode === 'jump') { $scroll.scrollLeft = Math.max(0, x / k * z() - $scroll.clientWidth / 2); }
      const a0 = v.a, b0 = v.b, sl0 = $scroll.scrollLeft;
      U.drag(e, (dx, dy) => {
        if (mode === 'move' || mode === 'jump') {
          // dikey sürükleme yakınlaştırır
          if (Math.abs(dy) > 12 && mode === 'move') {
            const nz = U.clamp(P().zoom * Math.pow(1.01, -dy), 2, 400), center = (a0 + b0) / 2;
            P().zoom = nz; ui.arrange.render(); $scroll.scrollLeft = Math.max(0, center * nz - $scroll.clientWidth / 2);
          } else $scroll.scrollLeft = Math.max(0, sl0 + dx / k * z());
        } else {
          const a = mode === 'l' ? Math.max(0, a0 + dx / k) : a0, b = mode === 'r' ? b0 + dx / k : b0;
          if (b - a < 1) return;
          P().zoom = U.clamp($scroll.clientWidth / (b - a), 2, 400);
          ui.arrange.render(); $scroll.scrollLeft = a * P().zoom;
        }
        drawOverview();
      });
    });
    $ov.addEventListener('dblclick', () => S.fit());
  }
  /** Projenin tamamını pencereye sığdırır. */
  S.fit = function () {
    let end = 0; P().tracks.forEach(t => t.clips.forEach(c => end = Math.max(end, c.start + c.length)));
    sorted().forEach(s => end = Math.max(end, s.end));
    end = Math.max(end, bar() * 8);
    P().zoom = U.clamp($scroll.clientWidth / (end * 1.03), 2, 400);
    ui.arrange.render(); $scroll.scrollLeft = 0;
  };

  // ---------------- Cümle çizgileri ----------------
  /** Her N ölçüde bir kalın çizgi (0 = kapalı). Ölçü sayısına göre: tartım değişirse onu izler. */
  S.phraseBars = () => +P().phrase || 0;
})(window.OS);
