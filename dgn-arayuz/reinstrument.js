/* Mr. Mars Music Studio · MRH DGN — Yeniden Çal: müzik dosyasını notaya çevir, istediğin çalgıyla çal,
   nota / tab / riff / MIDI / XML çıktısı al */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, E = OS.engine, TR = OS.transcribe;
  const RI = ui.reinstrument = { model: 0, makam: 0, tonic: 9, mode: 'melody', sens: 0.5, quant: 0.25, voices: 4, tempoMode: 'auto' };
  let root, st = { file: null, buf: null, res: null, name: '' }, preview = null;

  RI.init = function () { root = document.getElementById('view-reinst'); };

  // Gruplanmış enstrüman menüsü (aynı liste her yerde kullanılır)
  RI.instrumentSelect = function (value, onchange, cls) {
    const s = el('select', { class: cls || 'inst-select', onchange: () => onchange(+s.value) });
    const groups = {};
    OS.LIBRARY.forEach((m, i) => { if (!m.hidden || i === value) (groups[m.group] = groups[m.group] || []).push([i, m.name]); });
    Object.keys(groups).forEach(g => s.appendChild(el('optgroup', { label: OS.t(g) }, groups[g].map(([i, n]) => el('option', { value: i, selected: i === value }, n)))));
    return s;
  };

  const instName = () => OS.LIBRARY[RI.model].name;
  const instValues = () => ({ model: RI.model, makam: RI.makam, tonic: RI.tonic });
  // Makam seçimi yalnız komalı çalınabilen çalgılarda görünür
  const canMakam = () => /Türk/.test(OS.LIBRARY[RI.model].group);
  const sig = () => OS.project.sig;

  RI.render = function () {
    stopPreview();
    root.innerHTML = '';
    const top = el('div', { class: 'reinst-top' },
      el('span', { class: 'reinst-label' }, 'Çalgı'),
      RI.instrumentSelect(RI.model, v => { const was = canMakam(); RI.model = v; if (preview) startPreview(); if (was !== canMakam()) RI.render(); }, 'inst-select big'),
      canMakam() ? el('label', { class: 'field' }, 'Makam', sel(OS.LIBRARY_MAKAMS.map((n, i) => [i, n]), RI.makam, v => { RI.makam = +v; if (preview) startPreview(); })) : null,
      canMakam() ? el('label', { class: 'field' }, 'Makam tonu', sel(OS.tuning.NOTE.map((n, i) => [i, n]), RI.tonic, v => { RI.tonic = +v; if (preview) startPreview(); })) : null,
      el('button', { class: 'btn primary', onclick: () => startPreview() }, '▶ Bu çalgıyla dinle'),
      el('button', { class: 'btn', onclick: () => playOriginal() }, '▶ Orijinali dinle'),
      el('button', { class: 'btn', onclick: stopPreview }, '■ Durdur'),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn', onclick: () => applyToTrack() }, 'Seçili parçanın çalgısını değiştir'));
    root.appendChild(top);

    const drop = el('div', { class: 'reinst-drop' },
      el('div', { class: 'big-ico' }, '♫'),
      el('div', null, st.file ? st.name : OS.t('Müzik dosyasını buraya sürükleyin veya seçin')),
      el('div', { class: 'muted' }, 'MP3, WAV, OGG, FLAC, M4A/AAC, MP4/WebM (videonun sesi) veya MIDI (.mid)'),
      el('button', { class: 'btn', onclick: async () => { const [f] = await U.pickFiles('audio/*,video/*,.mid,.midi'); if (f) load(f); } }, 'Dosya seç…'));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drop-hint'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drop-hint'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drop-hint'); const f = e.dataTransfer.files[0]; if (f) load(f); });

    const prog = el('div', { class: 'progress' }, el('div', { class: 'bar' }));
    const isMidi = st.file && /\.midi?$/i.test(st.name);
    const opts = el('div', { class: 'row' },
      el('label', { class: 'field' }, 'Analiz', sel([['melody', 'Melodi / riff (tek ses)'], ['poly', 'Çok sesli (akorlar)']], RI.mode, v => RI.mode = v)),
      el('label', { class: 'field' }, 'Hassasiyet', el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: RI.sens, oninput: e => RI.sens = +e.target.value })),
      el('label', { class: 'field' }, 'Kuantize', sel([[0, 'Kapalı'], [0.5, '1/8'], [0.25, '1/16'], [0.125, '1/32']], RI.quant, v => RI.quant = +v)),
      el('label', { class: 'field' }, 'En fazla ses', sel([[2, 2], [3, 3], [4, 4], [6, 6]], RI.voices, v => RI.voices = +v)),
      el('label', { class: 'field' }, 'Tempo', sel([['auto', 'Otomatik algıla'], ['project', 'Proje temposu']], RI.tempoMode, v => RI.tempoMode = v)),
      el('button', { class: 'btn primary', disabled: !st.buf || isMidi, onclick: () => analyze(prog) }, 'Notaya çevir'));

    root.appendChild(el('div', { class: 'reinst-grid' },
      el('div', { class: 'mini-box' }, el('div', { class: 'mini-title' }, '1. Müzik dosyası'), drop),
      el('div', { class: 'mini-box' }, el('div', { class: 'mini-title' }, '2. Notaya çevir'), opts, prog,
        el('div', { class: 'muted' }, 'Melodi modu tek bir çalgı / ses için en doğru sonucu verir. Çok sesli mod akorları da yakalamaya çalışır. Tam bir şarkı miksinde sonuç yaklaşıktır: en baskın melodi ve akorlar bulunur, her çalgı ayrı ayrı ayrılamaz.'))));

    if (st.res) root.appendChild(resultsBox());
  };

  function sel(options, value, on) { const s = el('select', { onchange: () => on(s.value) }, options.map(([v, l]) => el('option', { value: v, selected: String(v) === String(value) }, l))); return s; }

  async function load(f) {
    stopPreview();
    st = { file: f, buf: null, res: null, name: f.name };
    try {
      if (/\.midi?$/i.test(f.name)) {
        const tracks = OS.parseMidi(new Uint8Array(await U.readAsArrayBuffer(f)));
        const notes = tracks.filter(t => !t.drums).flatMap(t => t.notes).sort((a, b) => a.s - b.s);
        if (!notes.length) throw new Error(OS.t('MIDI dosyasında nota yok'));
        st.res = { notes, bpm: OS.project.bpm, offset: 0, beats: Math.max(...notes.map(n => n.s + n.l)) };
        U.toast(OS.t('MIDI yüklendi; doğrudan çalgı seçip dinleyebilirsiniz'));
      } else {
        U.toast(OS.t('Yükleniyor…'));
        st.buf = await TR.decode(f);
      }
    } catch (e) { U.toast(e.message, 6000); }
    RI.render();
  }

  async function analyze(prog) {
    if (!st.buf) return;
    const bar = prog.firstChild;
    try {
      st.res = await TR.run(st.buf, { mode: RI.mode, sens: RI.sens, quant: RI.quant, voices: RI.voices, bpm: RI.tempoMode === 'project' ? OS.project.bpm : null }, p => { bar.style.width = Math.round(p * 100) + '%'; });
      U.toast(st.res.notes.length + ' ' + OS.t('nota bulundu'));
    } catch (e) { U.toast(e.message, 6000); console.error(e); }
    RI.render();
  }

  // ---------------- Sonuçlar ----------------
  function resultsBox() {
    const r = st.res, notes = r.notes;
    const cv = el('canvas', { class: 'reinst-roll' });
    requestAnimationFrame(() => drawRoll(cv, notes));
    const riffs = TR.riffs(notes, sig());
    const riffList = el('div', { class: 'riff-list' });
    if (!riffs.length) riffList.appendChild(el('div', { class: 'muted' }, 'Tekrar eden riff bulunamadı.'));
    riffs.forEach(rf => riffList.appendChild(el('div', { class: 'riff' },
      el('b', null, rf.name), el('span', null, ` ${rf.bars} ${OS.t('ölçü')} • ${rf.count}× • ${OS.t('Ölçüler')}: ${rf.starts.join(', ')}`),
      el('div', { class: 'muted mono' }, rf.names),
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', onclick: () => startPreview(rf.notes) }, '▶ Dinle'),
        el('button', { class: 'btn sm', onclick: () => showText(rf.name + ' — ' + OS.t('Gitar tabı'), TR.tab(rf.notes, sig(), 'gitar')) }, 'Gitar tabı'),
        el('button', { class: 'btn sm', onclick: () => U.download(TR.toMidi(rf.notes, r.bpm, rf.name, TR.gmProgram(instName())), safe(st.name) + ' - ' + rf.name + '.mid') }, 'MIDI')))));
    const base = safe(st.name);
    return el('div', { class: 'reinst-grid' },
      el('div', { class: 'mini-box', style: 'grid-column: 1 / -1' },
        el('div', { class: 'mini-title' }, '3. Sonuç'),
        el('div', { class: 'row' }, el('span', null, `${notes.length} ${OS.t('nota')} • ${Math.round(r.bpm * 10) / 10} BPM`),
          el('button', { class: 'btn primary', onclick: addToArrange }, 'Aranjmana ekle'),
          el('label', { class: 'field' }, el('input', { type: 'checkbox', id: 'ri-orig' }), 'Orijinal sesi de ekle (sessiz)')),
        cv,
        el('div', { class: 'mini-title', style: 'margin-top:6px' }, 'Çıktılar (notalar ve riff’ler)'),
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => showScore(notes, r.bpm, riffs) }, 'Notayı görüntüle / yazdır'),
          el('button', { class: 'btn', onclick: () => U.download(new Blob([TR.scoreXml(notes, sig(), r.bpm, st.name, instName())], { type: 'application/vnd.recordare.musicxml+xml' }), base + '.musicxml') }, 'Nota (XML)'),
          el('button', { class: 'btn', onclick: () => U.download(TR.toMidi(notes, r.bpm, st.name, TR.gmProgram(instName())), base + '.mid') }, 'MIDI'),
          el('button', { class: 'btn', onclick: () => showText(OS.t('Gitar tabı'), TR.tab(notes, sig(), 'gitar')) }, 'Gitar tabı'),
          el('button', { class: 'btn', onclick: () => showText(OS.t('Bas tabı'), TR.tab(notes, sig(), 'bas')) }, 'Bas tabı'),
          el('button', { class: 'btn', onclick: () => showText(OS.t('Nota listesi'), TR.noteList(notes, sig())) }, 'Nota listesi (Do Re Mi)'),
          el('button', { class: 'btn', onclick: () => U.download(new Blob([report(notes, r.bpm, riffs)], { type: 'text/plain;charset=utf-8' }), base + ' - notalar ve riffler.txt') }, 'Tümünü rapor olarak indir')),
        el('div', { class: 'mini-title', style: 'margin-top:6px' }, 'Riff’ler'), riffList));
  }
  const safe = s => (s || 'muzik').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');

  function report(notes, bpm, riffs) {
    const s = sig();
    return [`${st.name} — ${instName()}`, `${Math.round(bpm * 10) / 10} BPM, ${s[0]}/${s[1]}`, '',
      '== ' + OS.t('Riff’ler') + ' ==', ...riffs.flatMap(rf => [`${rf.name}: ${rf.bars} ${OS.t('ölçü')}, ${rf.count}×, ${OS.t('Ölçüler')}: ${rf.starts.join(', ')}`, rf.names, TR.tab(rf.notes, s, 'gitar'), '']),
      '== ' + OS.t('Nota listesi') + ' ==', TR.noteList(notes, s), '',
      '== ' + OS.t('Gitar tabı') + ' ==', TR.tab(notes, s, 'gitar'), '',
      '== ' + OS.t('Bas tabı') + ' ==', TR.tab(notes, s, 'bas')].join('\n');
  }
  RI.report = report;

  function drawRoll(cv, notes) {
    const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, g = cv.getContext('2d');
    g.fillStyle = '#121418'; g.fillRect(0, 0, w, h);
    if (!notes.length) return;
    const lo = Math.min(...notes.map(n => n.p)) - 2, hi = Math.max(...notes.map(n => n.p)) + 2, end = Math.max(...notes.map(n => n.s + n.l));
    const bpb = sig()[0];
    g.fillStyle = 'rgba(255,255,255,.07)';
    for (let b = 0; b < end; b += bpb) g.fillRect(b / end * w, 0, 1, h);
    notes.forEach(n => { g.fillStyle = `hsla(${(n.p % 12) * 30}, 70%, 60%, ${0.4 + n.v / 210})`; g.fillRect(n.s / end * w, h - (n.p - lo + 1) / (hi - lo + 1) * h, Math.max(2, n.l / end * w), Math.max(2, h / (hi - lo + 1) - 1)); });
  }

  // ---------------- Önizleme ----------------
  function stopPreview() {
    if (!preview) return;
    clearTimeout(preview.timer);
    try { if (preview.dev) preview.dev.allOff(); if (preview.src) preview.src.stop(); } catch (e) { }
    if (preview.dispose) preview.dispose();
    preview = null;
  }
  async function startPreview(notesOverride) {
    const notes = notesOverride || (st.res && st.res.notes);
    if (!notes || !notes.length) { U.toast(OS.t('Önce müziği notaya çevirin')); return; }
    stopPreview(); E.resume();
    const dev = new OS.Device(E.ctx, 'inst.library', { values: instValues() });
    dev.out.connect(E.monitorBus);
    const me = preview = { dev, dispose: () => setTimeout(() => dev.dispose(), 2000) };
    // Gerçek kayıt yüklenmeden başlarsa ilk notalar sentezle çalar
    if (dev.inst.ready) await dev.inst.ready;
    if (preview !== me) return;
    const spb = 60 / (st.res ? st.res.bpm : OS.project.bpm), t0 = E.ctx.currentTime + 0.1;
    // çok sayıda notayı parça parça zamanla
    const sorted = notes.slice().sort((a, b) => a.s - b.s);
    let i = 0;
    const pump = () => {
      const horizon = E.ctx.currentTime + 1;
      while (i < sorted.length && t0 + sorted[i].s * spb < horizon) { const n = sorted[i++]; dev.noteOn(n.p, n.v, t0 + n.s * spb); dev.noteOff(n.p, t0 + (n.s + n.l) * spb); }
      if (i < sorted.length) preview.timer = setTimeout(pump, 250);
    };
    pump();
  }
  function playOriginal() {
    if (!st.buf) { U.toast(OS.t('Önce bir ses dosyası yükleyin')); return; }
    stopPreview(); E.resume();
    const s = E.ctx.createBufferSource(); s.buffer = st.buf; s.connect(E.monitorBus); s.start();
    preview = { src: s };
  }

  // ---------------- Projeye aktarma ----------------
  function addToArrange() {
    const r = st.res; if (!r) return;
    OS.history.push();
    const P = OS.project;
    if (RI.tempoMode === 'auto' && st.buf) P.bpm = Math.round(r.bpm * 10) / 10;
    const t = OS.makeTrack('instrument', instName(), { instrument: 'inst.library', values: instValues() });
    const len = Math.ceil(Math.max(...r.notes.map(n => n.s + n.l)) / P.sig[0]) * P.sig[0];
    t.clips.push({ id: U.uid(), start: 0, length: len, name: safe(st.name), notes: r.notes.map(n => Object.assign({}, n)) });
    const at = P.tracks.filter(x => x.type !== 'fx').length;
    P.tracks.splice(at, 0, t);
    if (st.buf && document.getElementById('ri-orig') && document.getElementById('ri-orig').checked) {
      const id = U.uid(); E.buffers.set(id, st.buf); OS.store.saveBuffer(id, st.buf, st.name);
      const a = OS.makeTrack('audio', OS.t('Orijinal') + ': ' + safe(st.name)); a.inputCh = 'stereo'; a.mute = true;
      a.clips.push({ id: U.uid(), start: -0 + 0, length: OS.transport.secToBeat(st.buf.duration), offset: Math.max(0, r.offset || 0), bufferId: id, name: safe(st.name), gain: 0 });
      P.tracks.splice(at + 1, 0, a);
    }
    ui.selectedTrack = t.id;
    E.syncAll(); ui.changed(); ui.updateTransportUI();
    OS.transport.setPosition(0);
    // Başka bir parça solodaysa yeni parça duyulmaz: sesi kesmeden haber ver
    U.toast(P.tracks.some(x => x.solo) ? OS.t('Aranjmana eklendi. Başka bir parça solo açık olduğu için yeni parça duyulmaz; solo’yu kapatın.') : OS.t('Aranjmana eklendi'), P.tracks.some(x => x.solo) ? 7000 : undefined);
    ui.showView('arrange');
  }
  function applyToTrack() {
    const t = OS.project.tracks.find(x => x.id === ui.selectedTrack && x.type === 'instrument');
    if (!t) { U.toast(OS.t('Önce Aranjman’da bir enstrüman (MIDI) parçası seçin')); return; }
    OS.history.push();
    if (t.instrument) t.instrument.dispose();
    t.instrument = OS.newDevice('inst.library', instValues());
    const s = E.nodes.get(t.id); if (s) s.instrument = null;
    t.name = instName();
    E.syncTrack(t); ui.changed(); ui.renderInspector();
    U.toast(t.name);
  }

  // ---------------- Görüntüleme ----------------
  function showText(title, text) {
    const pre = el('div', { class: 'code', style: 'max-width:900px;max-height:60vh' }, text);
    U.modal(title, pre, [{ label: 'Kopyala', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(text); return false; } }, { label: 'TXT indir', onclick: () => { U.download(new Blob([text], { type: 'text/plain;charset=utf-8' }), safe(st.name) + ' - ' + title + '.txt'); return false; } }, { label: 'Kapat' }]);
  }
  RI.showText = showText;
  function showScore(notes, bpm, riffs) {
    const marks = {}; (riffs || []).forEach(rf => rf.starts.forEach(s => { marks[s - 1] = (marks[s - 1] ? marks[s - 1] + ' ' : '') + rf.name; }));
    const svg = TR.scoreSVG(notes, sig(), { title: safe(st.name), sub: `${instName()} • ${Math.round(bpm)} BPM`, marks });
    RI.openScore(svg, safe(st.name));
  }
  RI.openScore = function (svg, name) {
    const wrap = el('div', { class: 'score-wrap' }); wrap.innerHTML = svg;
    U.modal(OS.t('Nota'), wrap, [
      { label: 'Yazdır / PDF', onclick: () => { const w = window.open('', '_blank'); if (!w) { U.toast('Açılır pencere engellendi'); return false; } w.document.write('<!doctype html><meta charset="utf-8"><title>' + name + '</title><style>@page{margin:10mm}body{margin:0}svg{width:100%;height:auto}</style>' + svg + '<script>setTimeout(()=>print(),300)<\/script>'); w.document.close(); return false; } },
      { label: 'SVG indir', onclick: () => { U.download(new Blob([svg], { type: 'image/svg+xml' }), name + '.svg'); return false; } },
      { label: 'Kapat' }]);
  };
})(window.OS);
