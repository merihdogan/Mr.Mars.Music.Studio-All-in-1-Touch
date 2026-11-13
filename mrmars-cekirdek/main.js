/* Mr. Mars Music Studio · MRH DGN — başlatma, menüler, aktarım çubuğu, kısayollar */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, T = OS.transport, E = OS.engine;
  const $ = id => document.getElementById(id);

  // ---------------- Görünümler ----------------
  ui.view = 'arrange';
  ui.showView = function (v) {
    ui.view = v;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    // ayrı pencerede olan sekmeler her zaman etkin kalır; ana alanda yer tutucu görünür
    document.querySelectorAll('.view').forEach(s => { if (!s.classList.contains('floated')) s.classList.toggle('active', s.id === 'view-' + v || s.id === 'ph-' + v); });
    if (!$('inspector').classList.contains('in-win')) $('inspector').classList.toggle('hidden', v !== 'arrange');
    if (v === 'mixer') ui.mixer.render();
    if (v === 'rack') ui.channelRack.render();
    if (v === 'mini') ui.miniTools.render();
    if (v === 'reinst') ui.reinstrument.render();
    if (v === 'session') ui.session.render();
    if (v === 'world') ui.world.render();
    if (v === 'metal') ui.metal.render();
    if (v === 'rig') ui.rig.render();
    if (v === 'dj') ui.dj.render();
    if (v === 'plugins') ui.plugins.render();
    if (v === 'arrange') ui.arrange.render();
  };

  // ---------------- Aktarım çubuğu ----------------
  ui.updateTransportUI = function () {
    const P = OS.project;
    $('t-play').textContent = T.playing ? '❚❚' : '▶';
    $('t-play').classList.toggle('on', T.playing);
    $('t-rec').classList.toggle('on', T.recording);
    $('t-loop').classList.toggle('on', P.loop.on);
    $('t-metro').classList.toggle('on', P.metronome);
    if (document.activeElement !== $('t-bpm')) $('t-bpm').value = P.bpm;
    if (document.activeElement !== $('t-sig')) $('t-sig').value = P.sig.join('/');
    ui.arrange.drawRuler && ui.arrange.drawRuler();
  };
  function wireTransport() {
    $('t-play').onclick = () => T.playing ? T.stop(true) : T.play();
    $('t-stop').onclick = () => T.stop();
    $('t-start').onclick = () => T.setPosition(0);
    $('t-rec').onclick = () => T.record();
    $('t-loop').onclick = () => { OS.project.loop.on = !OS.project.loop.on; ui.updateTransportUI(); };
    $('t-metro').onclick = () => { OS.project.metronome = !OS.project.metronome; ui.updateTransportUI(); };
    $('t-bpm').onchange = e => { const v = U.clamp(+e.target.value || 120, 20, 300); setBpm(v); };
    $('t-sig').onchange = e => { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(e.target.value); if (m) { OS.history.push(); OS.project.sig = [U.clamp(+m[1], 1, 16), +m[2]]; ui.changed(); } ui.updateTransportUI(); };
    let taps = [];
    $('t-tap').onclick = () => {
      const now = performance.now(); taps = taps.filter(t => now - t < 3000); taps.push(now);
      if (taps.length >= 3) { const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); setBpm(Math.round(60000 / d * 10) / 10); }
    };
    document.addEventListener('os-transport', ui.updateTransportUI);
  }
  function setBpm(v) {
    const was = T.playing; if (was) T.stop(true);
    OS.history.push();
    // ses klipleri gerçek süresini korusun: uzunluk vuruş olarak yeniden hesaplanır
    const old = OS.project.bpm;
    OS.project.tracks.forEach(t => t.clips.forEach(c => { if (c.bufferId) c.length = c.length * v / old; }));
    OS.project.bpm = v;
    OS.project.tracks.forEach(t => t.inserts.forEach(d => d.inst.tempoChanged && d.inst.tempoChanged()));
    ui.changed(); ui.updateTransportUI();
    if (was) T.play();
  }

  // ---------------- Menüler ----------------
  const menus = {
    file: () => [
      { label: 'Yeni proje', onclick: () => confirmLose(() => OS.newProject(false)) },
      { label: 'Demo proje', onclick: () => confirmLose(() => OS.newProject(true)) },
      '-',
      { label: 'Projeyi kaydet (Ctrl+S)', onclick: () => saveNamed() },
      { label: 'Notla sürüm kaydet…', onclick: async () => { const n = await U.prompt(OS.t('Bu sürüm için kısa not'), ''); if (n != null) saveNamed(n || ' '); } },
      { label: 'Sürüm geçmişi…', onclick: () => OS.versions.dialog() },
      { label: 'Kayıtlı proje aç…', onclick: openNamed },
      '-',
      { label: 'Proje dosyasına aktar (.mrmars)…', onclick: () => OS.exportProjectFile() },
      { label: 'Proje dosyası aç (.mrmars)…', onclick: async () => { const [f] = await U.pickFiles('.mrmars,.orbit,application/json'); if (f) try { await OS.importProjectFile(f); U.toast('Proje açıldı'); } catch (e) { U.toast(e.message); } } },
      '-',
      { label: 'Ses dosyası içe aktar…', onclick: () => ui.arrange.importAudio() },
      { label: 'MIDI dosyası içe aktar…', onclick: importMidi },
      { label: 'Mixdown / WAV dışa aktar…', onclick: () => ui.exportDialog() },
    ],
    edit: () => [
      { label: 'Geri al (Ctrl+Z)', onclick: () => OS.history.doUndo() },
      { label: 'Yinele (Ctrl+Y)', onclick: () => OS.history.doRedo() },
      '-',
      { label: 'Kopyala (Ctrl+C)', onclick: ui.arrange.copySelected },
      { label: 'Yapıştır (Ctrl+V)', onclick: ui.arrange.paste },
      { label: 'Çoğalt (Ctrl+D)', onclick: ui.arrange.duplicateSelected },
      { label: 'İmleçte böl (S)', onclick: ui.arrange.splitAtPlayhead },
      { label: 'Sil (Del)', onclick: ui.arrange.deleteSelected },
      { label: 'Tüm klipleri seç (Ctrl+A)', onclick: selectAll },
      '-',
      { label: 'Kaydı at ve yeniden çek (Ctrl+.)', onclick: () => T.retryTake() },
      { label: 'Komut paleti (Ctrl+Shift+P)', onclick: () => ui.palette.open() },
    ],
    track: () => [
      { label: 'Ses parçası ekle', onclick: () => ui.arrange.addTrack('audio') },
      { header: 'Enstrüman parçası ekle' },
      ...OS.plugins.all('instrument').map(d => ({ label: '  ' + d.name, onclick: () => ui.arrange.addTrack('instrument', d.id) })),
      { label: 'FX kanalı ekle', onclick: () => ui.arrange.addTrack('fx') },
      '-',
      { label: 'Gitar parçası (amfi + kabin hazır)', onclick: () => { const t = ui.arrange.addTrack('audio'); t.name = 'Gitar'; ui.applyRig(t, 'Blues Crunch'); ui.changed(); } },
      { label: 'Bas gitar parçası (bas amfi hazır)', onclick: () => { const t = ui.arrange.addTrack('audio'); t.name = 'Bas Gitar'; ui.applyRig(t, 'Bas - Temiz'); ui.changed(); } },
    ],
    lang: langMenu,
    tools: () => [
      { label: 'Format Dönüştürücü…', onclick: () => OS.converter.open() },
      { label: 'Ortak Proje…', onclick: () => OS.collab.dialog() },
      { label: 'Ses ayarları (giriş/çıkış, gecikme)…', onclick: audioSettings },
      { label: 'MIDI ayarları (Clock, controller)…', onclick: () => OS.midiClock.dialog() },
      { label: OS.t('Dokunmatik arayüz') + ': ' + OS.t({ auto: 'Otomatik', on: 'Açık', off: 'Kapalı' }[OS.platform.touchPref]), onclick: () => { const P = OS.platform, next = { auto: 'on', on: 'off', off: 'auto' }[P.touchPref]; P.setTouchPref(next); location.reload(); } },
      { label: 'Klavye kısayolları', onclick: shortcutsHelp },
      { label: 'Depolama: kullanılmayan sesleri temizle', onclick: cleanAudio },
      ...(OS.platform.canInstall() ? [{ label: 'Ana ekrana ekle', onclick: OS.platform.install }] : []),
    ],
  };
  ui.menus = menus;
  function wireMenus() {
    document.querySelector('.lang-btn').textContent = '🌐 ' + OS.LANG_NAMES[OS.lang];
    document.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => { const r = b.getBoundingClientRect(); U.menu(r.left, r.bottom + 2, menus[b.dataset.menu]()); });
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => ui.showView(b.dataset.view));
  }
  function confirmLose(fn) {
    U.modal('Emin misiniz?', el('div', null, 'Kaydedilmemiş değişiklikler kaybolabilir. (Otomatik kayıt son durumu tutar, ancak yeni proje onun üzerine yazar.)'),
      [{ label: 'İptal' }, { label: 'Devam', primary: true, onclick: fn }]);
  }
  function selectAll() { ui.selectedClips.clear(); OS.project.tracks.forEach(t => t.clips.forEach(c => ui.selectedClips.add(c.id))); ui.arrange.render(); }

  async function saveNamed(note) {
    const n = await U.prompt('Proje adı', OS.project.name);
    if (!n) return;
    await OS.store.saveNamed(n); await OS.versions.record(n, typeof note === 'string' ? note.trim() : '');
    await OS.store.autosave(); U.toast('Kaydedildi: ' + n); document.title = n + ' — Mr. Mars Music Studio All in 1';
  }
  async function openNamed() {
    const keys = await OS.store.keys('projects');
    if (!keys.length) { U.toast('Kayıtlı proje yok'); return; }
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:4px;min-width:320px' });
    const m = U.modal('Kayıtlı projeler', list, [{ label: 'Kapat' }]);
    keys.forEach(k => list.appendChild(el('div', { class: 'slot' },
      el('span', { class: 'nm', onclick: async () => { m.close(); await OS.store.openNamed(k); U.toast('Açıldı: ' + k); } }, k),
      el('button', { class: 'btn sm danger', onclick: async e => { e.stopPropagation(); await OS.store.del('projects', k); e.target.closest('.slot').remove(); } }, 'Sil'))));
  }

  // ---------------- Dışa aktarma ----------------
  ui.exportDialog = function () {
    const bits = el('select', null, el('option', { value: 16 }, '16-bit'), el('option', { value: 24, selected: true }, '24-bit'), el('option', { value: 32 }, '32-bit float'));
    const sr = el('select', null, el('option', { value: 44100 }, '44.1 kHz'), el('option', { value: 48000 }, '48 kHz'), el('option', { value: 96000 }, '96 kHz'));
    const loopOnly = el('input', { type: 'checkbox' }), norm = el('input', { type: 'checkbox' }), stems = el('input', { type: 'checkbox' });
    const wantMidi = el('input', { type: 'checkbox' }), wantScore = el('input', { type: 'checkbox' }), wantTab = el('input', { type: 'checkbox' }), audioOn = el('input', { type: 'checkbox', checked: true });
    const tail = el('input', { class: 'inp', type: 'number', value: 3, min: 0, max: 30, style: 'width:70px' });
    const outFmt = el('select', null, [['wav', 'WAV'], ['aiff', 'AIFF'], ['flac', 'FLAC'], ['alac', 'Apple Lossless (M4A)'], ['mp3', 'MP3 320 kbps'], ['aac', 'AAC (M4A)'], ['opus', 'Opus (OGG)']].map(([v, t]) => el('option', { value: v }, t)));
    const makeOut = async (b, name) => { const Lab = OS.audioLab, q = await Lab.process(b.getChannelData(0), b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0), b.sampleRate, Lab.settings, 0), bi = +bits.value, k = outFmt.value; const f = await Lab.encode(q, { kind: k, bits: (k === 'wav' || bi !== 32) ? bi : 24, kbps: k === 'mp3' ? 320 : k === 'aac' ? 256 : 192 }, name, Object.assign({}, Lab.meta, { title: Lab.meta.title || name }), null, Lab.settings.dither); U.download(f, f.name); U.toast(f.name + ' · ' + Lab.dbStr(q.after.lufs) + ' LUFS · ' + Lab.dbStr(q.after.truePeakDb) + ' dBTP'); };
    const body = el('div', { class: 'form-grid' },
      'Biçim', outFmt, 'Bit derinliği', bits, 'Örnekleme hızı', sr, 'Yalnızca döngü bölgesi', loopOnly, 'Normalize et', norm, 'Kuyruk (saniye)', tail, 'Her parçayı ayrı (stem)', stems,
      'Ses (WAV)', audioOn, 'MIDI dosyaları', wantMidi, 'Nota (XML + yazdırılabilir SVG)', wantScore, 'Tab, riff ve nota listesi (TXT)', wantTab);
    const outer = el('div', { style: 'display:flex;flex-direction:column;gap:10px;width:min(640px,86vw)' }, body, OS.audioLab.panel(null));
    U.modal('Mixdown / Dışa Aktar', outer, [{ label: 'İptal' }, {
      label: 'Dışa aktar', primary: true, onclick: () => {
        (async () => {
          const o = { sampleRate: +sr.value, loopOnly: loopOnly.checked, normalize: norm.checked, tail: +tail.value };
          try {
            if (wantMidi.checked || wantScore.checked || wantTab.checked) exportNotation({ midi: wantMidi.checked, score: wantScore.checked, tab: wantTab.checked });
            if (!audioOn.checked) { U.toast('Dışa aktarma tamamlandı'); return; }
            if (stems.checked) {
              for (const t of OS.project.tracks.filter(t => t.clips.length)) { U.toast('Render: ' + t.name); const b = await E.render(Object.assign({ trackId: t.id }, o)); await makeOut(b, OS.project.name + ' - ' + t.name); }
            } else { U.toast('Render ediliyor…'); const b = await E.render(o); await makeOut(b, OS.project.name); }
            U.toast('Dışa aktarma tamamlandı');
          } catch (e) { U.toast('Hata: ' + e.message); console.error(e); }
        })();
      },
    }]);
  };

  // ---------------- MIDI dosyası içe aktarma ----------------
  async function importMidi() {
    const [f] = await U.pickFiles('.mid,.midi,audio/midi'); if (!f) return;
    try {
      const tracks = parseMidi(new Uint8Array(await U.readAsArrayBuffer(f)));
      if (!tracks.length) { U.toast('MIDI dosyasında nota yok'); return; }
      OS.history.push();
      tracks.forEach(tr => {
        const t = OS.makeTrack('instrument', tr.name || f.name, { instrument: tr.drums ? 'inst.drums' : 'inst.synth' });
        const len = Math.ceil(Math.max(...tr.notes.map(n => n.s + n.l)) / 4) * 4;
        t.clips.push({ id: U.uid(), start: 0, length: len, name: tr.name || 'MIDI', notes: tr.notes });
        OS.project.tracks.splice(OS.project.tracks.filter(x => x.type !== 'fx').length, 0, t);
      });
      E.syncAll(); ui.changed(); U.toast(tracks.length + ' MIDI parçası eklendi');
    } catch (e) { U.toast('MIDI okunamadı: ' + e.message); }
  }
  // Proje içindeki her MIDI parçasının notalarını nota / tab / riff / MIDI olarak verir
  function exportNotation(w) {
    const P = OS.project, TR = OS.transcribe, RI = ui.reinstrument;
    const tracks = P.tracks.filter(t => t.type === 'instrument' && t.clips.some(c => c.notes && c.notes.length));
    if (!tracks.length) { U.toast('Nota çıktısı için MIDI notası olan parça yok'); return; }
    tracks.forEach(t => {
      const notes = [];
      t.clips.forEach(c => !c.muted && (c.notes || []).forEach(n => { if (n.s < c.length) notes.push({ p: n.p, s: c.start + n.s, l: Math.min(n.l, c.length - n.s), v: n.v }); }));
      notes.sort((a, b) => a.s - b.s);
      const name = (P.name + ' - ' + t.name).replace(/[\\/:*?"<>|]/g, '_');
      const instName = t.instrument && t.instrument.pluginId === 'inst.library' ? OS.LIBRARY[Math.round(t.instrument.values.model)].name : t.name;
      const drums = t.instrument && t.instrument.def.drumMap;
      if (w.midi) U.download(TR.toMidi(notes, P.bpm, t.name, drums ? null : TR.gmProgram(instName)), name + '.mid');
      if (drums) return;
      if (w.score) {
        U.download(new Blob([TR.scoreXml(notes, P.sig, P.bpm, P.name, instName)], { type: 'application/vnd.recordare.musicxml+xml' }), name + '.musicxml');
        U.download(new Blob([TR.scoreSVG(notes, P.sig, { title: P.name, sub: t.name + ' • ' + P.bpm + ' BPM' })], { type: 'image/svg+xml' }), name + ' - nota.svg');
      }
      if (w.tab) {
        const riffs = TR.riffs(notes, P.sig);
        const txt = [t.name + ' — ' + P.bpm + ' BPM', '', '== Riff ==', ...riffs.flatMap(rf => [rf.name + ': ' + rf.bars + ' / ' + rf.count + '× / ' + rf.starts.join(', '), rf.names, TR.tab(rf.notes, P.sig, 'gitar'), '']), '== Notalar ==', TR.noteList(notes, P.sig), '', '== Tab ==', TR.tab(notes, P.sig, notes.reduce((a, n) => a + n.p, 0) / notes.length < 48 ? 'bas' : 'gitar')].join('\n');
        U.download(new Blob([txt], { type: 'text/plain;charset=utf-8' }), name + ' - tab ve riffler.txt');
      }
    });
  }

  function parseMidi(d) {
    let p = 0;
    const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d[p++]); return s; };
    const u32 = () => (d[p++] << 24) | (d[p++] << 16) | (d[p++] << 8) | d[p++];
    const u16 = () => (d[p++] << 8) | d[p++];
    const vlq = () => { let v = 0, b; do { b = d[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    if (str(4) !== 'MThd') throw new Error('Geçersiz MIDI');
    u32(); u16(); const nt = u16(), div = u16();
    const out = [];
    for (let k = 0; k < nt; k++) {
      if (str(4) !== 'MTrk') break;
      const end = u32() + p;
      let tick = 0, rs = 0, name = '';
      const open = {}, notes = []; let drums = false;
      while (p < end) {
        tick += vlq();
        let st = d[p];
        if (st & 0x80) p++; else st = rs;
        if (st === 0xff) { const type = d[p++], len = vlq(); if (type === 3) name = str(len); else p += len; continue; }
        if (st === 0xf0 || st === 0xf7) { p += vlq(); continue; }
        rs = st;
        const cmd = st & 0xf0, ch = st & 0x0f;
        const a = d[p++], b = (cmd === 0xc0 || cmd === 0xd0) ? 0 : d[p++];
        if (ch === 9) drums = true;
        const beat = tick / div;
        if (cmd === 0x90 && b > 0) (open[a] = open[a] || []).push({ s: beat, v: b });
        else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) { const o = open[a] && open[a].shift(); if (o) notes.push({ p: a, s: o.s, l: Math.max(0.03, beat - o.s), v: o.v }); }
      }
      p = end;
      if (notes.length) out.push({ name, notes, drums });
    }
    return out;
  }
  OS.parseMidi = parseMidi;

  // ---------------- Ses ayarları ----------------
  async function audioSettings() {
    E.init();
    let devs = [];
    try { devs = await navigator.mediaDevices.enumerateDevices(); } catch (e) { }
    if (!devs.some(d => d.label)) { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); devs = await navigator.mediaDevices.enumerateDevices(); } catch (e) { } }
    const ins = devs.filter(d => d.kind === 'audioinput'), outs = devs.filter(d => d.kind === 'audiooutput');
    const inSel = el('select', null, el('option', { value: '' }, 'Varsayılan'), ins.map(d => el('option', { value: d.deviceId, selected: d.deviceId === OS.settings.inputId }, d.label || 'Giriş')));
    const outSel = el('select', null, el('option', { value: '' }, 'Varsayılan'), outs.map(d => el('option', { value: d.deviceId, selected: d.deviceId === OS.settings.outputId }, d.label || 'Çıkış')));
    const autoLat = Math.round(((E.ctx.baseLatency || 0) + (E.ctx.outputLatency || 0)) * 1000);
    const lat = el('input', { class: 'inp', type: 'number', min: 0, max: 1000, placeholder: OS.t('Otomatik') + ' (' + autoLat + ')', value: OS.settings.latencyMs != null ? OS.settings.latencyMs : '', style: 'width:120px' });
    const latMode = el('select', null, [['low', 'En düşük (~3 ms, güçlü bilgisayar)'], ['interactive', 'Düşük (önerilen)'], ['balanced', 'Dengeli'], ['safe', 'Güvenli (çıtırtı olursa)']].map(([v, l]) => el('option', { value: v, selected: (OS.settings.latencyMode || 'interactive') === v }, l)));
    const srSel = el('select', null, [['', 'Ses kartı varsayılanı'], ['44100', '44.1 kHz'], ['48000', '48 kHz'], ['88200', '88.2 kHz'], ['96000', '96 kHz']].map(([v, l]) => el('option', { value: v, selected: String(OS.settings.sampleRate || '') === v }, l)));
    const relBg = el('input', { type: 'checkbox', checked: !!OS.settings.releaseBg });
    let inLat = OS.t('giriş açık değil');
    try { const tr = E.inputStream && E.inputStream.getAudioTracks()[0], st = tr && tr.getSettings(); if (st && st.latency != null) inLat = Math.round(st.latency * 1000) + ' ms'; } catch (e) { }
    const body = el('div', { class: 'form-grid' },
      'Ses girişi', inSel, 'Ses çıkışı', outSel, 'Kayıt gecikme telafisi (ms)', lat,
      'Gecikme modu (yeniden başlatınca)', latMode,
      'Örnekleme hızı (yeniden başlatınca)', srSel,
      'Şu anki örnekleme hızı', el('span', null, E.ctx.sampleRate + ' Hz'),
      'Çıkış gecikmesi', el('span', null, autoLat + ' ms (' + OS.t('tampon') + ' ' + Math.round((E.ctx.baseLatency || 0) * E.ctx.sampleRate) + ' ' + OS.t('örnek') + ')'),
      'Giriş gecikmesi', el('span', null, inLat),
      'İşlem hassasiyeti', el('span', null, '32-bit float'),
      'Arka plandayken sesi bırak', relBg,
      'Ses motoru', el('button', { class: 'btn sm', onclick: async () => { await OS.store.autosave(); location.reload(); } }, 'Sıfırla / yeniden başlat'));
    U.modal('Ses Ayarları', el('div', null, body, el('p', { class: 'muted', style: 'max-width:520px' }, 'İpucu: Ses kartınızın sürücüsünde tampon boyutunu küçültmek gecikmeyi azaltır. Kayıtlar arka plana göre geç kalıyorsa gecikme telafisini artırın.')),
      [{ label: 'İptal' }, {
        label: 'Uygula', primary: true, onclick: () => {
          (async () => {
            OS.settings.inputId = inSel.value; OS.settings.outputId = outSel.value;
            OS.settings.latencyMs = lat.value === '' ? null : +lat.value;
            const oldMode = OS.settings.latencyMode || 'interactive'; OS.settings.latencyMode = latMode.value; OS.saveSettings();
            const oldSr = String(OS.settings.sampleRate || ''); OS.settings.sampleRate = srSel.value ? +srSel.value : null; OS.settings.releaseBg = relBg.checked; OS.saveSettings();
            if (oldMode !== latMode.value || oldSr !== srSel.value) U.toast(OS.t('Gecikme modu, uygulama yeniden açılınca uygulanır'), 5000);
            if (E.ctx.setSinkId) { try { await E.ctx.setSinkId(outSel.value || ''); } catch (e) { U.toast('Çıkış değiştirilemedi: ' + e.message); } }
            if (E.inputStream || inSel.value) { try { await E.openInput(inSel.value); U.toast('Giriş açıldı'); } catch (e) { U.toast('Giriş açılamadı: ' + e.message); } }
          })();
        },
      }]);
  }
  async function cleanAudio() {
    const used = new Set(); OS.project.tracks.forEach(t => t.clips.forEach(c => c.bufferId && used.add(c.bufferId)));
    const named = await OS.store.keys('projects');
    for (const k of named) { const s = await OS.store.get('projects', k); JSON.parse(s).tracks.forEach(t => t.clips.forEach(c => c.bufferId && used.add(c.bufferId))); }
    for (const h of OS.history.undo.concat(OS.history.redo)) JSON.parse(h).tracks.forEach(t => t.clips.forEach(c => c.bufferId && used.add(c.bufferId)));
    (await OS.versions.bufferIds()).forEach(id => used.add(id));   // eski sürümlerin sesleri korunur
    const keys = await OS.store.keys('audio'); let n = 0;
    for (const k of keys) if (!used.has(k)) { await OS.store.del('audio', k); n++; }
    U.toast(n + ' kullanılmayan ses kaydı silindi');
  }
  function shortcutsHelp() {
    const rows = [['Boşluk', 'Çal / Durdur'], ['R', 'Kayıt'], ['L', 'Döngü aç/kapa'], ['M', 'Metronom'], ['Home', 'Başa dön'], ['S', 'İmleçte böl'], ['Del', 'Seçili klipleri sil'], ['Ctrl+Z / Ctrl+Y', 'Geri al / Yinele'], ['Ctrl+C / V / D', 'Kopyala / Yapıştır / Çoğalt'], ['Ctrl+S', 'Kaydet'], ['Ctrl+Shift+P', 'Komut paleti'], ['Ctrl+.', 'Kaydı at ve yeniden çek'], ['Ctrl+Fare tekerleği', 'Yatay yakınlaştır'], ['Alt+Sürükle', 'Klibi kopyalayarak taşı'], ['Shift+Sürükle', 'Izgarayı yok say'], ['Cetvelde sürükle', 'Döngü bölgesi seç'], ['Piyano rulosu: Q', 'Kuantize'], ['Klavyeyle çal açıkken', 'A W S E D F T G Y H U J K: notalar, Z/X oktav, C/V velocity'], ['DJ: Boşluk / Enter', 'Deck A / Deck B çal']];
    U.modal('Klavye Kısayolları', el('div', { class: 'form-grid' }, rows.flatMap(([a, b]) => [el('b', null, a), el('span', null, b)])));
  }
  function langMenu() {
    const items = [{ label: (OS.langAuto ? '✓ ' : '') + 'Otomatik (sistem dili) / Auto', onclick: () => OS.setLang('auto') }];
    [...OS.LANGS].sort((a, b) => OS.LANG_NAMES[a].localeCompare(OS.LANG_NAMES[b])).forEach(c => items.push({ label: (!OS.langAuto && OS.lang === c ? '✓ ' : '') + OS.LANG_NAMES[c], onclick: () => OS.setLang(c) }));
    return items;
  }
  ui.VERSION = 'M.D.26/ V.08.11. Touch · Upd.13.11';
  OS.YAPIMCI = 'MRH DGN';
  ui.openManual = () => window.open(encodeURI('User Manual_en_english.html'), '_blank');
  function about() {
    const feat = ['Üret: aranjman, Session, Desen Rafı, mikser ve 23 türde hazır altyapı', 'Çal: 125 çalgı sesi, Amfi Rack ve 50’den fazla efekt', 'Sahne: 4 deck DJ Mikser, stem, Automix ve kontrolcü tanıma', 'Doğu ve Batı: parça başına 15 Türk makamı, perdesiz elektro gitar, Viking çalgıları', 'Dönüştür: sesi notaya çevir, nota, tab ve MIDI al', 'Paylaş: QR ile telefona gönder; FLAC, Apple Lossless ve LUFS ayarları'];
    const box = el('div', { class: 'about' },
      el('img', { class: 'about-logo', src: 'mrmars-gorseller/logo-512.png', srcset: 'mrmars-gorseller/logo-512.png 1x, mrmars-gorseller/logo-1024.png 2x', alt: 'Mr. Mars Music Studio All in 1' }),
      el('div', { class: 'about-info' },
        el('div', { class: 'about-name' }, 'Mr. Mars Music Studio'), el('div', { class: 'about-sub' }, 'All in 1 • ' + ui.VERSION), el('div', { class: 'about-sub' }, 'Merih Dogan'),
        el('p', { style: 'font-size:15px;font-weight:600' }, 'Tarayıcında tam bir müzik stüdyosu.'), el('p', null, 'Kurulum, hesap ve ücret yok. Parçanı yap, setini çal, QR kodu okutup müziğini telefonuna al. Açık kaynak; projelerin ve dosyaların kendi bilgisayarında kalır.'),
        el('ul', null, feat.map(f => el('li', null, f))),
        el('div', { class: 'about-tech' },
          el('div', null, el('span', null, 'Ses motoru'), el('b', null, E.ctx.sampleRate + ' Hz, 32-bit float')),
          el('div', null, el('span', null, 'Yüklü eklenti'), el('b', null, String(OS.plugins.all().length))),
          el('div', null, el('span', null, 'Dil'), el('b', null, OS.LANG_NAMES[OS.lang])),
          el('div', null, el('span', null, 'Veri klasörü'), el('b', null, 'veri\\profil'))),
        el('p', { class: 'muted' }, 'Projeler ve ayarlar uygulama klasöründeki “veri” dizininde saklanır; klasörü USB’ye kopyalayıp başka bilgisayarda kurulumsuz çalıştırabilirsiniz.'),
        el('button', { class: 'btn sm', onclick: ui.openManual }, 'Kullanım kılavuzu (İngilizce)'),
        el('p', { class: 'muted' }, '© 2026 Mr. Mars Music Studio'), el('p', { class: 'muted' }, 'MIT lisansı. MP3 kodlayıcı: LAME / lamejs (LGPL-3.0), lame.sourceforge.net. Ayrıntı: THIRD-PARTY-NOTICES.txt')));
    U.modal('Hakkında', box);
  }
  ui.about = about;

  // ---------------- Klavye kısayolları ----------------
  function keys() {
    addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (document.querySelector('.modal-back')) return;
      if (ui.keys.keydown(e)) { e.preventDefault(); return; }
      if (ui.view === 'dj' && ui.dj.key(e)) { e.preventDefault(); return; }
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'p') { ui.palette.open(); e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === '.') { T.retryTake(); e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z' && !e.shiftKey) { OS.history.doUndo(); e.preventDefault(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { OS.history.doRedo(); e.preventDefault(); }
        else if (k === 's') { saveNamed(); e.preventDefault(); }
        else if (k === 'c') ui.arrange.copySelected();
        else if (k === 'v') ui.arrange.paste();
        else if (k === 'd') { ui.arrange.duplicateSelected(); e.preventDefault(); }
        else if (k === 'a') { selectAll(); e.preventDefault(); }
        return;
      }
      if (e.code === 'Space') { T.playing ? T.stop(true) : T.play(); e.preventDefault(); }
      else if (k === 'r') T.record();
      else if (k === 'l') { OS.project.loop.on = !OS.project.loop.on; ui.updateTransportUI(); }
      else if (k === 'm') { OS.project.metronome = !OS.project.metronome; ui.updateTransportUI(); }
      else if (e.key === 'Home') T.setPosition(0);
      else if (k === 's') ui.arrange.splitAtPlayhead();
      else if (e.key === 'Delete' || e.key === 'Backspace') ui.arrange.deleteSelected();
    });
    addEventListener('keyup', e => { ui.keys.keyup(e); });
  }

  // ---------------- Ekran güncellemesi ----------------
  const mb = new Float32Array(1024);
  function tick() {
    const P = OS.project;
    if (P) {
      const b = T.position();
      $('lcd-bars').textContent = U.fmtBars(b, P.sig[0]);
      $('lcd-time').textContent = U.fmtTime(T.beatToSec(b));
      if (E.master) {
        const cv = $('master-meter'), g = cv.getContext('2d'), w = cv.width, h = cv.height;
        g.clearRect(0, 0, w, h);
        [E.master.anL, E.master.anR].forEach((an, i) => {
          const f = U.clamp((U.gainToDb(U.meterLevel(an, mb)) + 60) / 63, 0, 1);
          g.fillStyle = f > 0.95 ? '#ef4444' : f > 0.8 ? '#e5d43a' : '#39c27a';
          g.fillRect(0, i * 7, f * w, 6);
        });
      }
    }
    requestAnimationFrame(tick);
  }

  // ---------------- Başlatma ----------------
  // ---------------- Açılış ekranı ----------------
  const t0 = performance.now();
  function splash(msg, p) { const s = $('splash'); if (!s) return; s.querySelector('.splash-msg').textContent = OS.t(msg); s.querySelector('.splash-bar div').style.width = Math.round(p * 100) + '%'; }
  function hideSplash() {
    const s = $('splash'); if (!s) return;
    const wait = Math.max(0, 1400 - (performance.now() - t0));
    setTimeout(() => { s.classList.add('gone'); setTimeout(() => s.remove(), 600); }, wait);
    s.onclick = () => s.remove();
  }
  async function boot() {
    E.init();
    splash('Arayüz hazırlanıyor…', 0.2);
    ui.arrange.init(); ui.sections.init(); ui.channelRack.init(); ui.mixer.init(); ui.miniTools.init(); ui.reinstrument.init(); ui.session.init(); ui.world.init(); ui.metal.init(); ui.rig.init(); ui.dj.init(); ui.plugins.init(); ui.keys.init();
    wireTransport(); wireMenus(); keys();
    $('lz-close').onclick = ui.closeLower;
    document.addEventListener('os-project', () => { ui.updateTransportUI(); if (!OS.project.tracks.find(t => t.id === ui.selectedTrack)) ui.selectedTrack = null; ui.renderInspector(); OS.store.markDirty(); });
    // ilk kullanıcı etkileşiminde ses motorunu uyandır
    const wake = () => { E.resume(); };
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);

    $('about-btn').onclick = about;
    $('manual-btn').onclick = ui.openManual;
    $('phone-btn').onclick = () => OS.phone.open();
    splash('Eklentiler yükleniyor…', 0.45);
    await ui.plugins.loadFolder();
    await ui.plugins.loadStored();
    splash('Proje açılıyor…', 0.7);
    let restored = false;
    try { restored = await OS.store.restoreAutosave(); } catch (e) { console.warn('Otomatik kayıt açılamadı', e); }
    if (!restored) OS.newProject(true);
    OS.history.clear();
    ui.renderInspector(); ui.updateTransportUI(); ui.arrange.render();
    OS.dock.init(); OS.dock.restore();
    splash('Hazır', 1); hideSplash();
    setInterval(() => { if (OS.store.dirty && !T.recording) OS.store.autosave(); }, 5000);
    addEventListener('beforeunload', () => { OS.store.autosave(); });
    requestAnimationFrame(tick);
    if (OS.settings.outputId && E.ctx.setSinkId) E.ctx.setSinkId(OS.settings.outputId).catch(() => { });
  }
  boot().catch(e => { console.error(e); U.toast('Başlatma hatası: ' + e.message, 8000); });
})(window.OS);
