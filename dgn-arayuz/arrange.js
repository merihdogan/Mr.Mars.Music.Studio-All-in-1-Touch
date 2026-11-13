/* Mr. Mars Music Studio · MRH DGN — aranjman penceresi */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, T = OS.transport;
  const A = ui.arrange = { snap: 1, clipboard: null };
  const SNAPS = [['0', 'Kapalı'], ['4', '1 Ölçü'], ['1', '1/4'], ['0.5', '1/8'], ['0.25', '1/16'], ['0.125', '1/32']];
  let $headers, $scroll, $ruler, $lanes, $ph, rulerCv;

  const P = () => OS.project;
  const zoom = () => P().zoom;
  const snap = (b, force) => { const s = A.snap; return s > 0 && !force ? Math.round(b / s) * s : b; };
  const totalBeats = () => { let e = 0; P().tracks.forEach(t => t.clips.forEach(c => e = Math.max(e, c.start + c.length))); (P().sections || []).forEach(s => e = Math.max(e, s.end)); return Math.max(P().sig[0] * 64, Math.ceil(e / 4) * 4 + 64); };
  A.totalBeats = totalBeats;

  A.init = function () {
    $headers = document.getElementById('arr-headers');
    $scroll = document.getElementById('arr-scroll');
    $ruler = document.getElementById('arr-ruler');
    $lanes = document.getElementById('arr-lanes');
    $ph = document.getElementById('arr-playhead');
    rulerCv = el('canvas'); $ruler.appendChild(rulerCv);
    buildToolbar();
    $scroll.addEventListener('scroll', () => { $headers.scrollTop = $scroll.scrollTop; drawRuler(); });
    $headers.addEventListener('wheel', e => { $scroll.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
    $scroll.addEventListener('wheel', e => {
      if (e.ctrlKey) {
        e.preventDefault();
        const r = $scroll.getBoundingClientRect(), x = e.clientX - r.left + $scroll.scrollLeft, beat = x / zoom();
        P().zoom = U.clamp(zoom() * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 4, 400);
        A.render();
        $scroll.scrollLeft = beat * zoom() - (e.clientX - r.left);
      }
    }, { passive: false });
    rulerEvents();
    laneDrop();
    new ResizeObserver(() => { if (P()) { drawRuler(); A.updatePlayhead(false); } }).observe($scroll);
    document.addEventListener('os-project', () => A.render());
    document.addEventListener('os-pos', () => A.updatePlayhead(true));
    document.addEventListener('os-layout', () => A.render());
    requestAnimationFrame(loop);
  };

  function buildToolbar() {
    const tb = document.getElementById('arr-toolbar');
    const snapSel = el('select', { onchange: () => { A.snap = +snapSel.value; } }, SNAPS.map(([v, l]) => el('option', { value: v, selected: +v === A.snap }, l)));
    const phraseSel = el('select', { title: OS.t('Her N ölçüde bir kalın çizgi'), onchange: () => { P().phrase = +phraseSel.value; A.render(); } },
      [['0', OS.t('Kapalı')], ['4', '4'], ['8', '8'], ['16', '16'], ['32', '32']].map(([v, l]) => el('option', { value: v }, l)));
    A.phraseSel = phraseSel;
    tb.append(
      el('div', { class: 'sep' }),
      el('label', null, 'Izgara', snapSel),
      el('label', null, OS.t('Cümle çizgisi'), phraseSel),
      el('button', { class: 'btn sm', title: OS.t('Bölüm şeridini göster/gizle'), onclick: () => { P().showSections = P().showSections === false; ui.sections.render(); } }, OS.t('Bölümler')),
      el('button', { class: 'btn sm', title: OS.t('Şarkının tamamını sığdır'), onclick: () => ui.sections.fit() }, OS.t('Sığdır')),
      el('label', null, 'Yakınlaştır', A.zoomInp = el('input', { type: 'range', min: 4, max: 200, value: 28, oninput: e => { P().zoom = +e.target.value; A.render(); } })),
    );
  }

  // ---------------- Parça işlemleri ----------------
  A.addTrack = function (type, instrumentId) {
    OS.history.push();
    const t = OS.makeTrack(type, null, { instrument: instrumentId });
    if (type === 'instrument') t.name = OS.plugins.get(instrumentId).name;
    const Pp = P();
    const idx = Pp.tracks.findIndex(x => x.id === ui.selectedTrack);
    if (type === 'fx') Pp.tracks.push(t); else Pp.tracks.splice(idx >= 0 ? idx + 1 : Pp.tracks.filter(x => x.type !== 'fx').length, 0, t);
    t.color = OS.TRACK_COLORS[Pp.tracks.length % OS.TRACK_COLORS.length];
    ui.selectedTrack = t.id;
    OS.engine.syncAll();
    ui.changed(); ui.renderInspector();
    return t;
  };
  A.deleteTrack = function (t) {
    OS.history.push();
    const Pp = P();
    Pp.tracks.splice(Pp.tracks.indexOf(t), 1);
    t.inserts.forEach(d => d.dispose()); t.instrument && t.instrument.dispose();
    Pp.tracks.forEach(x => delete x.sends[t.id]);
    if (ui.selectedTrack === t.id) ui.selectedTrack = null;
    OS.engine.syncAll(); ui.changed(); ui.renderInspector();
  };
  A.duplicateTrack = function (t) {
    OS.history.push();
    const s = JSON.parse(JSON.stringify(OS.serialize().tracks.find(x => x.id === t.id)));
    const mk = st => { delete st.id; return new OS.Device(OS.engine.ctx, st.plugin, st); };
    const idMap = {};
    const mkMap = st => { const old = st.id, d = mk(st); idMap[old] = d.id; return d; };
    const nt = Object.assign(s, { id: U.uid(), name: t.name + ' (kopya)', inserts: s.inserts.map(mkMap), instrument: s.instrument ? mkMap(s.instrument) : null });
    OS.auto.remapTargets(nt, idMap);
    nt.clips.forEach(c => c.id = U.uid());
    P().tracks.splice(P().tracks.indexOf(t) + 1, 0, nt);
    OS.engine.syncAll(); ui.changed();
  };

  A.importAudio = async function (atBeat, track) {
    const files = await U.pickFiles('audio/*', true);
    if (files.length) await A.addAudioFiles(files, atBeat, track);
  };
  A.addAudioFiles = async function (files, atBeat, track) {
    OS.history.push();
    let beat = atBeat != null ? atBeat : T.position();
    for (const f of files) {
      try {
        U.toast('Yükleniyor: ' + f.name);
        const r = await OS.importAudioFile(f);
        let t = track && track.type === 'audio' ? track : null;
        if (!t) { t = OS.makeTrack('audio', r.name); t.inputCh = 'stereo'; P().tracks.splice(P().tracks.filter(x => x.type !== 'fx').length, 0, t); t.color = OS.TRACK_COLORS[P().tracks.length % 10]; }
        t.clips.push({ id: U.uid(), start: beat, length: T.secToBeat(r.buf.duration), offset: 0, bufferId: r.id, name: r.name, gain: 0 });
        track = null;
      } catch (e) { U.toast('Açılamadı: ' + f.name + ' (' + e.message + ')'); }
    }
    OS.engine.syncAll(); ui.changed();
  };

  // ---------------- Klip işlemleri ----------------
  const findClip = id => { for (const t of P().tracks) { const c = t.clips.find(x => x.id === id); if (c) return [t, c]; } return [null, null]; };
  A.findClip = findClip;
  A.deleteSelected = function () {
    if (!ui.selectedClips.size) return;
    OS.history.push();
    P().tracks.forEach(t => t.clips = t.clips.filter(c => !ui.selectedClips.has(c.id)));
    ui.selectedClips.clear(); ui.changed();
  };
  A.duplicateSelected = function () {
    if (!ui.selectedClips.size) return;
    OS.history.push();
    const sel = [];
    let mn = Infinity, mx = -Infinity;
    ui.selectedClips.forEach(id => { const [t, c] = findClip(id); if (c) { sel.push([t, c]); mn = Math.min(mn, c.start); mx = Math.max(mx, c.start + c.length); } });
    ui.selectedClips.clear();
    sel.forEach(([t, c]) => { const n = U.deepClone(c); n.id = U.uid(); n.start = c.start + (mx - mn); t.clips.push(n); ui.selectedClips.add(n.id); });
    ui.changed();
  };
  A.copySelected = function () {
    const sel = []; ui.selectedClips.forEach(id => { const [t, c] = findClip(id); if (c) sel.push({ trackId: t.id, clip: U.deepClone(c) }); });
    if (sel.length) { A.clipboard = sel; U.toast(sel.length + ' klip kopyalandı'); }
  };
  A.paste = function () {
    if (!A.clipboard) return;
    OS.history.push();
    const mn = Math.min(...A.clipboard.map(x => x.clip.start)), at = T.position();
    ui.selectedClips.clear();
    A.clipboard.forEach(x => { const t = P().tracks.find(tt => tt.id === x.trackId) || P().tracks.find(tt => tt.id === ui.selectedTrack); if (!t) return; const n = U.deepClone(x.clip); n.id = U.uid(); n.start = at + (n.start - mn); t.clips.push(n); ui.selectedClips.add(n.id); });
    ui.changed();
  };
  A.splitAtPlayhead = function () {
    const at = T.position();
    let done = false;
    const targets = ui.selectedClips.size ? [...ui.selectedClips].map(findClip) : P().tracks.flatMap(t => t.clips.map(c => [t, c]));
    targets.forEach(([t, c]) => {
      if (!c || at <= c.start + 0.01 || at >= c.start + c.length - 0.01) return;
      if (!done) { OS.history.push(); done = true; }
      const cut = at - c.start;
      const n = U.deepClone(c); n.id = U.uid(); n.start = at; n.length = c.length - cut;
      if (c.bufferId) n.offset = (c.offset || 0) + T.beatToSec(cut);
      if (c.notes) { n.notes = c.notes.filter(x => x.s >= cut).map(x => Object.assign({}, x, { s: x.s - cut })); c.notes = c.notes.filter(x => x.s < cut); }
      c.length = cut;
      t.clips.push(n);
    });
    if (done) ui.changed(); else U.toast('İmleç bir klibin üzerinde değil');
  };
  // ---------------- V.02: stem, warp, perde, take ----------------
  const busy = msg => { const st = { p: 0 }; U.toast(msg + '…', 60000); st.set = p => { const pc = Math.round(p * 100); if (pc !== st.p) { st.p = pc; U.toast(msg + ' %' + pc, 60000); } }; return st; };
  A.stemSplit = async function (t, c) {
    const b = OS.engine.buffers.get(c.bufferId); if (!b) return;
    const pr = busy(OS.t('Stem’lere ayrılıyor'));
    const stems = OS.dsp.toBuffers(OS.engine.ctx, await OS.dsp.separate(b, pr.set), b.sampleRate);
    OS.history.push();
    let at = P().tracks.indexOf(t) + 1;
    Object.keys(stems).forEach(k => {
      const id = U.uid(); OS.engine.buffers.set(id, stems[k]); OS.store.saveBuffer(id, stems[k], c.name + ' ' + k);
      const nt = OS.makeTrack('audio', (c.name || t.name) + ' – ' + OS.t(OS.dsp.STEM_NAMES[k])); nt.inputCh = 'stereo';
      nt.clips.push(Object.assign(U.deepClone(c), { id: U.uid(), bufferId: id, muted: false, name: OS.t(OS.dsp.STEM_NAMES[k]) }));
      P().tracks.splice(at++, 0, nt);
    });
    c.muted = true;
    OS.engine.syncAll(); ui.changed(); U.toast(OS.t('4 stem parçası oluşturuldu'));
  };
  A.warpClip = async function (c) {
    const b = OS.engine.buffers.get(c.bufferId); if (!b) return;
    const guess = U.detectBPM(b);
    const v = await U.prompt(OS.t('Klibin orijinal temposu (BPM). Proje temposuna esnetilecek:'), guess); if (!v || !(+v > 0)) return;
    const ratio = +v / P().bpm; if (Math.abs(ratio - 1) < 0.001) return;
    const pr = busy(OS.t('Zaman esnetiliyor'));
    const nb = await OS.dsp.stretch(OS.engine.ctx, b, ratio, pr.set);
    OS.history.push();
    const id = U.uid(); OS.engine.buffers.set(id, nb); OS.store.saveBuffer(id, nb, c.name + ' warp');
    c.bufferId = id; c.offset = (c.offset || 0) * ratio; c.length = c.length * ratio; c.name = (c.name || '') + ' (' + Math.round(P().bpm) + ' BPM)';
    ui.changed(); U.toast(OS.t('Klip proje temposuna uyduruldu'));
  };
  A.pitchClip = async function (c) {
    const b = OS.engine.buffers.get(c.bufferId); if (!b) return;
    const v = await U.prompt(OS.t('Perde kaydırma (yarım ton, ör. -2 veya 3):'), 0); if (v == null || !+v) return;
    const pr = busy(OS.t('Perde kaydırılıyor'));
    const nb = await OS.dsp.pitchShift(OS.engine.ctx, b, +v, pr.set);
    OS.history.push();
    const id = U.uid(); OS.engine.buffers.set(id, nb); OS.store.saveBuffer(id, nb, c.name + ' pitch');
    c.bufferId = id; c.name = (c.name || '') + ' (' + (v > 0 ? '+' : '') + (+v) + ')';
    ui.changed(); U.toast(OS.t('Perde kaydırıldı'));
  };
  A.takesOf = (t, c) => t.clips.filter(x => x !== c && x.bufferId && x.start < c.start + c.length && x.start + x.length > c.start);
  A.useTake = function (t, c) {
    OS.history.push();
    A.takesOf(t, c).forEach(x => x.muted = true); c.muted = false;
    ui.changed();
  };

  A.reverseClip = function (c) {
    const b = OS.engine.buffers.get(c.bufferId); if (!b) return;
    OS.history.push();
    const nb = OS.engine.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let i = 0; i < b.numberOfChannels; i++) { const d = b.getChannelData(i).slice().reverse(); nb.copyToChannel(d, i); }
    const id = U.uid(); OS.engine.buffers.set(id, nb); OS.store.saveBuffer(id, nb, c.name + ' (ters)');
    const used = T.beatToSec(c.length);
    c.offset = Math.max(0, b.duration - (c.offset || 0) - used); c.bufferId = id;
    ui.changed();
  };
  A.normalizeClip = function (c) {
    const b = OS.engine.buffers.get(c.bufferId); if (!b) return;
    let pk = 0; for (let i = 0; i < b.numberOfChannels; i++) { const d = b.getChannelData(i); for (let k = 0; k < d.length; k++) pk = Math.max(pk, Math.abs(d[k])); }
    if (!pk) return;
    OS.history.push(); c.gain = Math.round(U.gainToDb(0.98 / pk) * 10) / 10; ui.changed(); U.toast('Klip kazancı: ' + c.gain + ' dB');
  };

  // ---------------- Çizim ----------------
  A.render = function () {
    if (!$lanes) return;
    const Pp = P(), z = zoom(), W = totalBeats() * z, bpb = Pp.sig[0];
    $headers.innerHTML = ''; $lanes.innerHTML = '';
    $lanes.style.width = W + 'px'; $ruler.style.width = W + 'px';
    const ph = +Pp.phrase || 0;
    $lanes.style.backgroundImage = (ph ? 'linear-gradient(90deg, rgba(255,255,255,.26) 2px, transparent 2px), ' : '') + `linear-gradient(90deg, rgba(255,255,255,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)`;
    $lanes.style.backgroundSize = (ph ? `${z * bpb * ph}px 100%, ` : '') + `${z * bpb}px 100%, ${z}px 100%`;
    if (A.phraseSel) A.phraseSel.value = String(ph);
    ui.autoLanes.reset();
    Pp.tracks.forEach(t => {
      $headers.appendChild(header(t)); $lanes.appendChild(lane(t));
      if (t.showAuto) ui.autoLanes.rows(t, W).forEach(r => { $headers.appendChild(r.head); $lanes.appendChild(r.lane); });
      if (t === P().tracks[P().tracks.length - 1] && P().master.showAuto) ui.autoLanes.rows(P().master, W).forEach(r => { $headers.appendChild(r.head); $lanes.appendChild(r.lane); });
    });
    const filler = el('div', { style: 'height:120px' });
    filler.addEventListener('dblclick', () => A.addTrack('audio'));
    $lanes.appendChild(filler);
    $headers.appendChild(el('div', { style: 'height:140px' }));
    drawRuler();
    A.updatePlayhead(false);
    ui.sections && ui.sections.render();
  };

  function header(t) {
    const sel = ui.selectedTrack === t.id;
    const mb = (cls, txt, on, title, fn) => el('button', { class: `mini ${cls}${on ? ' on' : ''}`, title, onclick: e => { e.stopPropagation(); fn(); } }, txt);
    const meter = el('div', { class: 'tmeter' }, el('div', { 'data-meter': t.id }));
    const vol = el('input', { type: 'range', min: -60, max: 12, step: 0.1, value: t.vol, title: 'Ses', oninput: e => { t.vol = +e.target.value; OS.auto.touch(t, 'vol', t.vol); OS.engine.updateMix(); ui.emit('os-mix'); }, onclick: e => e.stopPropagation(), ondblclick: e => { t.vol = 0; e.target.value = 0; OS.engine.updateMix(); } });
    const btns = el('div', { class: 'btns' },
      mb('m', 'M', t.mute, 'Sessiz', () => { t.mute = !t.mute; OS.engine.updateMix(); A.render(); ui.emit('os-mix'); }),
      mb('s', 'S', t.solo, 'Solo', () => { t.solo = !t.solo; OS.engine.updateMix(); A.render(); ui.emit('os-mix'); }),
      t.type !== 'fx' ? mb('r', '●', t.arm, 'Kayda hazırla', () => { t.arm = !t.arm; A.render(); }) : null,
      t.type === 'audio' ? mb('i', '🎧', t.monitor, 'Girişi izle (canlı çalma)', async () => {
        t.monitor = !t.monitor;
        if (t.monitor && !OS.engine.inputSource) { try { await OS.engine.openInput(OS.settings.inputId); } catch (e) { U.toast('Ses girişi açılamadı: ' + e.message); t.monitor = false; } }
        OS.engine.updateMonitor(t); A.render();
      }) : null,
      t.type === 'instrument' ? mb('', 'e', false, 'Enstrümanı aç', () => ui.openDevice(t.instrument, t.name)) : null,
      mb('a', 'A', t.showAuto, 'Otomasyon şeritlerini göster/gizle', () => { t.showAuto = !t.showAuto; if (t.showAuto && !(t.automation || []).length) ui.autoLanes.addLane(t); else A.render(); }),
      vol,
    );
    const h = el('div', { class: 'thead' + (sel ? ' sel' : ''), style: { height: t.height + 'px' } },
      el('div', { class: 'color', style: { background: t.color } }),
      el('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, el('span', { class: 'name' }, t.name), el('span', { class: 'ttype' }, { audio: 'SES', instrument: 'MIDI', fx: 'FX' }[t.type])),
      btns, meter);
    h.addEventListener('mousedown', () => { if (ui.selectedTrack !== t.id) { ui.selectedTrack = t.id; ui.renderInspector(); markSel(); } });
    h.addEventListener('dblclick', async () => { const n = await U.prompt('Parça adı', t.name); if (n) { OS.history.push(); t.name = n; ui.changed(); ui.renderInspector(); } });
    h.addEventListener('contextmenu', e => {
      e.preventDefault();
      const i = P().tracks.indexOf(t);
      U.menu(e.clientX, e.clientY, [
        { label: 'Yeniden adlandır…', onclick: async () => { const n = await U.prompt('Parça adı', t.name); if (n) { OS.history.push(); t.name = n; ui.changed(); } } },
        { label: 'Çoğalt', onclick: () => A.duplicateTrack(t) },
        { label: 'Yukarı taşı', disabled: i === 0, onclick: () => { OS.history.push(); P().tracks.splice(i - 1, 0, P().tracks.splice(i, 1)[0]); ui.changed(); } },
        { label: 'Aşağı taşı', disabled: i === P().tracks.length - 1, onclick: () => { OS.history.push(); P().tracks.splice(i + 1, 0, P().tracks.splice(i, 1)[0]); ui.changed(); } },
        { label: 'Yükseklik: küçük / orta / büyük', onclick: () => { t.height = t.height >= 110 ? 48 : t.height >= 64 ? 120 : 64; A.render(); } },
        '-',
        { label: 'Parçayı sil', onclick: () => A.deleteTrack(t) },
      ]);
    });
    return h;
  }

  function markSel() {
    $headers.querySelectorAll('.thead:not(.auto-head)').forEach((h, i) => h.classList.toggle('sel', P().tracks[i] && P().tracks[i].id === ui.selectedTrack));
    $lanes.querySelectorAll('.lane:not(.auto-lane)').forEach((l, i) => l.classList.toggle('sel', P().tracks[i] && P().tracks[i].id === ui.selectedTrack));
  }

  function lane(t) {
    const L = el('div', { class: 'lane' + (ui.selectedTrack === t.id ? ' sel' : ''), style: { height: t.height + 'px' } });
    L._track = t;
    t.clips.forEach(c => L.appendChild(clipEl(t, c)));
    L.addEventListener('mousedown', e => {
      if (e.target !== L) return;
      if (e.button === 0) { ui.selectedClips.clear(); $lanes.querySelectorAll('.clip.sel').forEach(x => x.classList.remove('sel')); }
      if (ui.selectedTrack !== t.id) { ui.selectedTrack = t.id; ui.renderInspector(); markSel(); }
    });
    L.addEventListener('dblclick', e => {
      if (e.target !== L || t.type !== 'instrument') return;
      const beat = Math.floor(e.offsetX / zoom() / P().sig[0]) * P().sig[0];
      OS.history.push();
      const c = { id: U.uid(), start: beat, length: P().sig[0], name: t.name, notes: [] };
      t.clips.push(c); ui.changed();
      ui.pianoRoll.open(t, c);
    });
    L.addEventListener('contextmenu', e => {
      if (e.target !== L) return;
      e.preventDefault();
      const beat = snap(e.offsetX / zoom());
      const items = [];
      if (t.type === 'instrument') items.push({ label: 'Yeni MIDI klip', onclick: () => { OS.history.push(); const c = { id: U.uid(), start: Math.floor(beat / P().sig[0]) * P().sig[0], length: P().sig[0] * 2, name: t.name, notes: [] }; t.clips.push(c); ui.changed(); ui.pianoRoll.open(t, c); } });
      if (t.type === 'audio') items.push({ label: 'Ses dosyası içe aktar…', onclick: () => A.importAudio(beat, t) });
      items.push({ label: 'Yapıştır', disabled: !A.clipboard, onclick: () => { T.setPosition(beat); A.paste(); } });
      U.menu(e.clientX, e.clientY, items);
    });
    return L;
  }

  function clipEl(t, c) {
    const z = zoom();
    const sel = ui.selectedClips.has(c.id);
    const e = el('div', { class: 'clip' + (sel ? ' sel' : '') + (c.muted ? ' muted' : ''), style: { left: c.start * z + 'px', width: Math.max(4, c.length * z) + 'px', background: t.color + 'cc' } },
      el('div', { class: 'cname' }, c.name || ''), el('div', { class: 'edge l' }), el('div', { class: 'edge r' }));
    const cv = el('canvas'); e.appendChild(cv);
    requestAnimationFrame(() => drawClip(cv, t, c));
    e.addEventListener('mousedown', ev => clipMouse(ev, t, c, e));
    e.addEventListener('dblclick', () => { if (c.notes) ui.pianoRoll.open(t, c); });
    e.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      if (!ui.selectedClips.has(c.id)) { ui.selectedClips.clear(); ui.selectedClips.add(c.id); A.render(); }
      const items = [
        c.notes ? { label: 'Piyano rulosunda aç', onclick: () => ui.pianoRoll.open(t, c) } : null,
        { label: 'Yeniden adlandır…', onclick: async () => { const n = await U.prompt('Klip adı', c.name); if (n != null) { OS.history.push(); c.name = n; ui.changed(); } } },
        { label: 'Çoğalt (Ctrl+D)', onclick: A.duplicateSelected },
        { label: 'Kopyala (Ctrl+C)', onclick: A.copySelected },
        { label: 'İmleçte böl (S)', onclick: A.splitAtPlayhead },
        { label: c.muted ? 'Sesi aç' : 'Sessize al', onclick: () => { OS.history.push(); c.muted = !c.muted; ui.changed(); } },
        c.bufferId ? { label: 'Kazanç…', onclick: async () => { const v = await U.prompt('Klip kazancı (dB)', c.gain || 0); if (v != null && !isNaN(+v)) { OS.history.push(); c.gain = +v; ui.changed(); } } } : null,
        c.bufferId ? { label: 'Normalize et', onclick: () => A.normalizeClip(c) } : null,
        c.bufferId ? { label: 'Ters çevir', onclick: () => A.reverseClip(c) } : null,
        c.bufferId ? '-' : null,
        c.bufferId ? { label: 'Stem’lere ayır (vokal / davul / bas / melodi)', onclick: () => A.stemSplit(t, c) } : null,
        c.bufferId ? { label: 'Tempoya uydur (warp)…', onclick: () => A.warpClip(c) } : null,
        c.bufferId ? { label: 'Perde kaydır (süre aynı)…', onclick: () => A.pitchClip(c) } : null,
        c.bufferId && A.takesOf(t, c).length ? { label: 'Bu take’i kullan (diğerlerini sustur)', onclick: () => A.useTake(t, c) } : null,
        c.notes ? { label: 'Session’a gönder', onclick: () => ui.session && ui.session.sendClip(t, c) } : null,
        c.bufferId ? { label: 'Session’a gönder', onclick: () => ui.session && ui.session.sendClip(t, c) } : null,
        c.bufferId ? { label: 'Fade in / out…', onclick: async () => { const v = await U.prompt('Fade in, fade out (vuruş) ör: 0.5, 1', `${c.fadeIn || 0}, ${c.fadeOut || 0}`); if (v) { const [a, b] = v.split(',').map(Number); OS.history.push(); c.fadeIn = a || 0; c.fadeOut = b || 0; ui.changed(); } } } : null,
        c.bufferId ? { label: 'WAV olarak kaydet', onclick: () => { const b = OS.engine.buffers.get(c.bufferId); if (b) U.download(U.bufferToWav(b, 24), (c.name || 'klip') + '.wav'); } } : null,
        '-',
        { label: 'Sil (Del)', onclick: A.deleteSelected },
      ].filter(Boolean);
      U.menu(ev.clientX, ev.clientY, items);
    });
    return e;
  }

  function drawClip(cv, t, c) {
    if (!cv.isConnected) return;
    if (c.bufferId) {
      const b = OS.engine.buffers.get(c.bufferId);
      U.drawWave(cv, b, c.offset || 0, T.beatToSec(c.length), 'rgba(255,255,255,.8)');
    } else if (c.notes) {
      const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, g = cv.getContext('2d');
      if (!c.notes.length) return;
      let lo = 127, hi = 0; c.notes.forEach(n => { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); });
      const range = Math.max(12, hi - lo + 1), nh = Math.max(1.5, (h - 4) / range);
      g.fillStyle = 'rgba(255,255,255,.85)';
      c.notes.forEach(n => { if (n.s >= c.length) return; const x = n.s / c.length * w, y = h - 2 - (n.p - lo + 1) * ((h - 4) / range); g.fillRect(x, y, Math.max(1.5, Math.min(n.l, c.length - n.s) / c.length * w), Math.min(nh, 5)); });
    }
  }

  function clipMouse(ev, t, c, elx) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (ui.selectedTrack !== t.id) { ui.selectedTrack = t.id; ui.renderInspector(); markSel(); }
    if (ev.ctrlKey || ev.metaKey) { ui.selectedClips.has(c.id) ? ui.selectedClips.delete(c.id) : ui.selectedClips.add(c.id); elx.classList.toggle('sel'); return; }
    if (!ui.selectedClips.has(c.id)) { ui.selectedClips.clear(); $lanes.querySelectorAll('.clip.sel').forEach(x => x.classList.remove('sel')); ui.selectedClips.add(c.id); elx.classList.add('sel'); }
    const z = zoom(), mode = ev.target.classList.contains('edge') ? (ev.target.classList.contains('l') ? 'l' : 'r') : 'move';
    const items = [...ui.selectedClips].map(id => { const [tt, cc] = findClip(id); return { t: tt, c: cc, s: cc.start, l: cc.length, o: cc.offset || 0, notes: cc.notes ? U.deepClone(cc.notes) : null }; });
    const lanes = [...$lanes.querySelectorAll('.lane:not(.auto-lane)')];
    const lane0 = lanes.findIndex(l => l._track === t);
    let pushed = false, copy = ev.altKey, laneShift = 0;
    U.drag(ev, (dx, dy, e2) => {
      if (!pushed && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) { OS.history.push(); pushed = true; if (copy) items.forEach(it => { const n = U.deepClone(it.c); n.id = U.uid(); it.t.clips.push(n); }); }
      if (!pushed) return;
      const db = dx / z;
      if (mode === 'move') {
        const ns0 = snap(items[0].s + db, e2.shiftKey), d = ns0 - items[0].s;
        // dikey: parça değiştirme
        let li = lanes.findIndex(ln => e2.clientY < ln.getBoundingClientRect().bottom);
        if (li < 0) li = lanes.length - 1;
        laneShift = li - lane0;
        items.forEach(it => { it.c.start = Math.max(0, it.s + d); });
      } else if (mode === 'r') {
        items.forEach(it => {
          let nl = snap(it.s + it.l + db, e2.shiftKey) - it.s;
          nl = Math.max(0.0625, nl);
          if (it.c.bufferId) { const b = OS.engine.buffers.get(it.c.bufferId); if (b) nl = Math.min(nl, T.secToBeat(b.duration - it.o)); }
          it.c.length = nl;
        });
      } else {
        items.forEach(it => {
          let ns = snap(it.s + db, e2.shiftKey);
          ns = Math.min(ns, it.s + it.l - 0.0625);
          if (it.c.bufferId) ns = Math.max(ns, it.s - T.secToBeat(it.o));
          ns = Math.max(0, ns);
          const d = ns - it.s;
          it.c.start = ns; it.c.length = it.l - d;
          if (it.c.bufferId) it.c.offset = it.o + T.beatToSec(d);
          if (it.notes) it.c.notes = it.notes.map(n => Object.assign({}, n, { s: n.s - d })).filter(n => n.s >= 0);
        });
      }
      // hızlı görsel güncelleme
      items.forEach(it => {
        const ce = it.c === c ? elx : null;
        if (ce) { ce.style.left = it.c.start * z + 'px'; ce.style.width = Math.max(4, it.c.length * z) + 'px'; ce.style.transform = laneShift && mode === 'move' ? `translateY(${lanes[lane0 + laneShift].getBoundingClientRect().top - lanes[lane0].getBoundingClientRect().top}px)` : ''; }
      });
      if (items.length > 1) A.render();
    }, () => {
      if (!pushed) return;
      if (mode === 'move' && laneShift) {
        items.forEach(it => {
          const i = P().tracks.indexOf(it.t) + laneShift, nt = P().tracks[i];
          if (nt && nt !== it.t && ((nt.type === 'audio' && it.c.bufferId) || (nt.type === 'instrument' && it.c.notes))) {
            it.t.clips.splice(it.t.clips.indexOf(it.c), 1); nt.clips.push(it.c);
          }
        });
      }
      ui.changed();
    });
  }

  // ---------------- Cetvel ----------------
  function drawRuler() {
    const Pp = P(), z = zoom(), bpb = Pp.sig[0];
    const w = $scroll.clientWidth, h = 26, sl = $scroll.scrollLeft;
    rulerCv.width = w; rulerCv.height = h; rulerCv.style.left = sl + 'px';
    const g = rulerCv.getContext('2d');
    g.clearRect(0, 0, w, h);
    // döngü bölgesi
    const L = Pp.loop;
    g.fillStyle = L.on ? 'rgba(255,255,255,.14)' : 'rgba(160,160,160,.12)';
    g.fillRect(L.start * z - sl, 0, (L.end - L.start) * z, h);
    g.fillStyle = L.on ? '#e8e8e8' : '#6c7484';
    g.fillRect(L.start * z - sl, 0, 2, h); g.fillRect(L.end * z - sl - 2, 0, 2, h);
    g.fillStyle = '#9aa3b2'; g.strokeStyle = '#555c6a'; g.font = '11px Segoe UI';
    const barPx = z * bpb, every = Math.max(1, Math.ceil(40 / barPx));
    const first = Math.floor(sl / barPx);
    for (let b = first; b * barPx < sl + w; b++) {
      const x = Math.round(b * barPx - sl) + 0.5;
      if (b % every === 0) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x, h); g.stroke(); g.fillText(String(b + 1), x + 3, 11); }
      if (Pp.phrase && b % Pp.phrase === 0) { g.fillStyle = '#e8e8e8'; g.fillRect(x - 0.5, 0, 2, h); g.fillStyle = '#9aa3b2'; }
      if (barPx > 40) for (let k = 1; k < bpb; k++) { const xx = Math.round(x + k * z) + 0.5; g.beginPath(); g.moveTo(xx, 19); g.lineTo(xx, h); g.stroke(); }
    }
  }
  A.drawRuler = drawRuler;

  function rulerEvents() {
    $ruler.addEventListener('mousedown', e => {
      const r = $ruler.getBoundingClientRect(), x0 = e.clientX - r.left, b0 = x0 / zoom();
      let moved = false;
      const Pp = P();
      U.drag(e, (dx) => {
        if (Math.abs(dx) > 4) moved = true;
        if (!moved) return;
        const b1 = (x0 + dx) / zoom();
        const s = A.snap || 1;
        Pp.loop.start = Math.max(0, Math.round(Math.min(b0, b1) / s) * s);
        Pp.loop.end = Math.max(Pp.loop.start + s, Math.round(Math.max(b0, b1) / s) * s);
        Pp.loop.on = true; drawRuler(); ui.updateTransportUI && ui.updateTransportUI();
      }, () => { if (!moved) T.setPosition(snap(b0)); });
    });
    $ruler.addEventListener('dblclick', () => { P().loop.on = !P().loop.on; drawRuler(); ui.updateTransportUI(); });
  }

  // ---------------- Dosya bırakma ----------------
  function laneDrop() {
    $scroll.addEventListener('dragover', e => { e.preventDefault(); $scroll.classList.add('drop-hint'); });
    $scroll.addEventListener('dragleave', () => $scroll.classList.remove('drop-hint'));
    $scroll.addEventListener('drop', e => {
      e.preventDefault(); $scroll.classList.remove('drop-hint');
      const files = [...e.dataTransfer.files].filter(f => /audio|\.wav|\.mp3|\.ogg|\.flac|\.m4a|\.aif/i.test(f.type + f.name));
      if (!files.length) return;
      const r = $lanes.getBoundingClientRect();
      const beat = snap((e.clientX - r.left) / zoom());
      const laneEl = e.target.closest('.lane');
      A.addAudioFiles(files, beat, laneEl ? laneEl._track : null);
    });
  }

  // ---------------- Oynatma imleci ----------------
  A.updatePlayhead = function (scrollIntoView) {
    if (!$ph) return;
    const b = T.position(), x = b * zoom();
    $ph.style.left = x + 'px';
    $ph.style.height = Math.max($scroll.scrollHeight, $scroll.clientHeight) + 'px';
    if (scrollIntoView && (x < $scroll.scrollLeft || x > $scroll.scrollLeft + $scroll.clientWidth - 40)) $scroll.scrollLeft = Math.max(0, x - 80);
  };
  const mbuf = new Float32Array(1024);
  function loop() {
    if (T.playing) A.updatePlayhead(true);
    if (document.getElementById('view-arrange').classList.contains('active')) {
      $headers.querySelectorAll('[data-meter]').forEach(m => {
        const s = OS.engine.nodes.get(m.dataset.meter); if (!s) return;
        const pk = Math.max(U.meterLevel(s.anL, mbuf), U.meterLevel(s.anR, mbuf));
        m.style.width = Math.min(100, Math.max(0, (U.gainToDb(pk) + 60) / 60 * 100)) + '%';
      });
    }
    requestAnimationFrame(loop);
  }
})(window.OS);
