/* Mr. Mars Music Studio · MRH DGN — proje modeli, geri al, kalıcı depolama */
(function (OS) {
  const U = OS.U, E = OS.engine;
  const COLORS = ['#b8605a', '#b8845e', '#ada05c', '#7d9e68', '#5f9a8c', '#5f88a3', '#7279ad', '#8b74aa', '#a57198', '#8c8c8c'];
  OS.TRACK_COLORS = COLORS;

  OS.settings = Object.assign({ inputId: '', outputId: '', latencyMs: null, midiIn: 'all' }, (() => { try { return JSON.parse(localStorage.getItem('os.settings') || '{}'); } catch (e) { return {}; } })());
  OS.saveSettings = () => { try { localStorage.setItem('os.settings', JSON.stringify(OS.settings)); } catch (e) { } };

  const dev = (pid, values) => new OS.Device(E.init(), pid, values ? { values } : null);
  OS.newDevice = dev;

  OS.makeTrack = function (type, name, opts) {
    opts = opts || {};
    const P = OS.project;
    const t = {
      id: U.uid(), type, name: name || (type === 'audio' ? 'Ses Parçası' : type === 'fx' ? 'FX Kanalı' : 'Enstrüman'),
      color: COLORS[(P ? P.tracks.length : 0) % COLORS.length],
      vol: 0, pan: 0, mute: false, solo: false, arm: false, monitor: false, inputCh: 'L',
      inserts: [], instrument: null, sends: {}, clips: [], height: 64, automation: [], showAuto: false,
    };
    if (type === 'instrument') t.instrument = dev(opts.instrument || 'inst.synth', opts.values);
    return t;
  };

  OS.serialize = function () {
    const P = OS.project;
    return {
      app: 'MrMarsStudio', yapimci: 'MRH DGN', version: 1, name: P.name, bpm: P.bpm, swing: P.swing || 0, sig: P.sig, loop: P.loop, metronome: P.metronome, zoom: P.zoom,
      master: { vol: P.master.vol, inserts: P.master.inserts.map(d => d.serialize()), automation: P.master.automation || [], showAuto: !!P.master.showAuto },
      tracks: P.tracks.map(t => Object.assign({}, t, { inserts: t.inserts.map(d => d.serialize()), instrument: t.instrument ? t.instrument.serialize() : null })),
    };
  };

  function disposeProject(P) {
    if (!P) return;
    P.master.inserts.forEach(d => d.dispose());
    P.tracks.forEach(t => { t.inserts.forEach(d => d.dispose()); t.instrument && t.instrument.dispose(); });
    for (const [, s] of E.nodes) { try { s.mute.disconnect(); s.input.disconnect(); } catch (e) { } }
    E.nodes.clear();
  }

  OS.loadProject = function (data) {
    const ctx = E.init();
    if (OS.transport.playing) OS.transport.stop(true);
    disposeProject(OS.project);
    const mk = st => new OS.Device(ctx, st.plugin, st);
    OS.project = {
      name: data.name || 'Yeni Proje', bpm: data.bpm || 120, sig: data.sig || [4, 4],
      loop: data.loop || { on: false, start: 0, end: 16 }, metronome: !!data.metronome, zoom: data.zoom || 28, swing: data.swing || 0,
      master: { id: 'master', name: 'Master', type: 'master', pan: 0, vol: data.master ? data.master.vol : 0, inserts: ((data.master && data.master.inserts) || []).map(mk), automation: (data.master && data.master.automation) || [], showAuto: !!(data.master && data.master.showAuto) },
      tracks: (data.tracks || []).map(t => Object.assign({}, t, {
        inserts: (t.inserts || []).map(mk),
        instrument: t.instrument ? mk(t.instrument) : null,
        clips: (t.clips || []).map(c => Object.assign({}, c, c.notes ? { notes: c.notes.map(n => Object.assign({}, n)) } : {})),
        sends: Object.assign({}, t.sends || {}),
        automation: (t.automation || []).map(l => Object.assign({}, l, { points: (l.points || []).map(p => Object.assign({}, p)) })),
      })),
    };
    E.syncAll();
    document.dispatchEvent(new CustomEvent('os-project', { detail: { full: true } }));
  };

  OS.newProject = function (demo) {
    OS.project = OS.project || null;
    const base = { name: 'Yeni Proje', bpm: 120, sig: [4, 4], loop: { on: false, start: 0, end: 16 }, metronome: false, master: { vol: 0, inserts: [] }, tracks: [] };
    OS.loadProject(base);
    const P = OS.project;
    P.master.inserts.push(dev('fx.limiter'));
    const rev = OS.makeTrack('fx', 'Reverb FX'); rev.inserts.push(dev('fx.reverb', { mix: 1, size: 2.5 })); rev.vol = -4;
    const dly = OS.makeTrack('fx', 'Delay FX'); dly.inserts.push(dev('fx.delay', { mix: 1, sync: 7, fb: 0.35 })); dly.vol = -8;
    if (demo) {
      const dr = OS.makeTrack('instrument', 'Davullar', { instrument: 'inst.drums' });
      const bs = OS.makeTrack('instrument', 'Bas Synth', { instrument: 'inst.synth', values: OS.plugins.get('inst.synth').presets['Kalın Bas'] });
      const pd = OS.makeTrack('instrument', 'Pad', { instrument: 'inst.synth', values: OS.plugins.get('inst.synth').presets['Yumuşak Pad'] });
      pd.sends[rev.id] = -6;
      const notes = [];
      for (let b = 0; b < 16; b++) {
        if (b % 4 === 0 || b % 4 === 2.5) notes.push({ p: 36, s: b, l: 0.25, v: 115 });
        if (b % 2 === 1) notes.push({ p: 38, s: b, l: 0.25, v: 105 });
        for (let h = 0; h < 2; h++) notes.push({ p: 42, s: b + h * 0.5, l: 0.2, v: h ? 70 : 95 });
      }
      notes.push({ p: 36, s: 2.5, l: 0.25, v: 100 }, { p: 36, s: 10.5, l: 0.25, v: 100 }, { p: 49, s: 0, l: 1, v: 100 });
      dr.clips.push({ id: U.uid(), start: 0, length: 16, name: 'Ritim', notes });
      const roots = [45, 41, 48, 43];
      const bn = [];
      roots.forEach((r, i) => { [0, 0.75, 1.5, 2, 2.75, 3.5].forEach((o, k) => bn.push({ p: r - 12 + (k === 4 ? 12 : 0), s: i * 4 + o, l: 0.4, v: 100 })); });
      bs.clips.push({ id: U.uid(), start: 0, length: 16, name: 'Bas', notes: bn });
      const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
      const pn = []; chords.forEach((c, i) => c.forEach(p => pn.push({ p, s: i * 4, l: 3.9, v: 80 })));
      pd.clips.push({ id: U.uid(), start: 0, length: 16, name: 'Akorlar', notes: pn });
      P.tracks.push(dr, bs, pd);
      P.loop = { on: true, start: 0, end: 16 };
    }
    const gt = OS.makeTrack('audio', 'Gitar');
    ['gtr.amp', 'gtr.cab'].forEach(id => gt.inserts.push(dev(id)));
    gt.sends[rev.id] = -12;
    const vo = OS.makeTrack('audio', 'Vokal'); vo.inserts.push(dev('fx.eq', { hp: 90 }), dev('fx.comp')); vo.sends[rev.id] = -10;
    P.tracks.push(gt, vo, rev, dly);
    P.tracks.forEach((t, i) => t.color = COLORS[i % COLORS.length]);
    P.name = demo ? 'Demo Proje' : 'Yeni Proje';
    E.syncAll();
    OS.history.clear();
    document.dispatchEvent(new CustomEvent('os-project', { detail: { full: true } }));
  };

  // ---------------- Geri al / yinele ----------------
  OS.history = {
    undo: [], redo: [],
    push() { this.undo.push(JSON.stringify(OS.serialize())); if (this.undo.length > 80) this.undo.shift(); this.redo = []; OS.store.markDirty(); },
    clear() { this.undo = []; this.redo = []; },
    doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(OS.serialize())); OS.loadProject(JSON.parse(this.undo.pop())); U.toast('Geri alındı'); },
    doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(OS.serialize())); OS.loadProject(JSON.parse(this.redo.pop())); U.toast('Yinelendi'); },
  };

  // ---------------- IndexedDB depolama ----------------
  const DB_NAME = 'mrmars-mrh-dgn';
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { const d = r.result; ['kv', 'audio', 'plugins', 'projects'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); };
      r.onsuccess = () => moveOldData(r.result).then(() => res(r.result), () => res(r.result)); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  // Adı değişen eski veritabanındaki projeler bir kez yeni ada taşınır; başarısız olursa eskisi silinmez
  const idb = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function moveOldData(d) {
    if (!indexedDB.databases) return;
    const old = (await indexedDB.databases()).map(x => x.name).find(n => n && n.startsWith('mrmars-') && n !== DB_NAME);
    if (!old) return;
    const src = await idb(indexedDB.open(old));
    try {
      for (const store of ['kv', 'audio', 'plugins', 'projects']) {
        if (!src.objectStoreNames.contains(store)) continue;
        const keys = await idb(src.transaction(store).objectStore(store).getAllKeys());
        for (const k of keys) {
          const val = await idb(src.transaction(store).objectStore(store).get(k));
          const has = await idb(d.transaction(store).objectStore(store).count(k));
          if (!has) await idb(d.transaction(store, 'readwrite').objectStore(store).put(val, k));
        }
      }
    } finally { src.close(); }
    indexedDB.deleteDatabase(old);
  }
  const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };

  OS.store = {
    put: (store, key, val) => tx(store, 'readwrite', s => s.put(val, key)),
    get: (store, key) => tx(store, 'readonly', s => s.get(key)),
    del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
    keys: store => tx(store, 'readonly', s => s.getAllKeys()),
    saveBuffer(id, buf, name) {
      const ch = []; for (let i = 0; i < buf.numberOfChannels; i++) ch.push(buf.getChannelData(i).slice());
      return this.put('audio', id, { name, sr: buf.sampleRate, ch }).catch(e => console.warn('ses kaydedilemedi', e));
    },
    async loadBuffer(id) {
      const r = await this.get('audio', id); if (!r) return null;
      const b = E.ctx.createBuffer(r.ch.length, r.ch[0].length, r.sr);
      r.ch.forEach((c, i) => b.copyToChannel(c, i));
      return b;
    },
    dirty: false,
    markDirty() { this.dirty = true; },
    async autosave() {
      if (!OS.project) return;
      try { await this.put('kv', 'autosave', JSON.stringify(OS.serialize())); this.dirty = false; } catch (e) { console.warn(e); }
    },
    async restoreAutosave() {
      const s = await this.get('kv', 'autosave').catch(() => null);
      if (!s) return false;
      const data = JSON.parse(s);
      await this.loadBuffersFor(data);
      OS.loadProject(data);
      return true;
    },
    async loadBuffersFor(data) {
      const ids = new Set();
      (data.tracks || []).forEach(t => (t.clips || []).forEach(c => c.bufferId && ids.add(c.bufferId)));
      for (const id of ids) if (!E.buffers.has(id)) { const b = await this.loadBuffer(id).catch(() => null); if (b) E.buffers.set(id, b); }
    },
    async saveNamed(name) {
      OS.project.name = name;
      await this.put('projects', name, JSON.stringify(OS.serialize()));
    },
    async openNamed(name) {
      const s = await this.get('projects', name); if (!s) return;
      const data = JSON.parse(s); await this.loadBuffersFor(data); OS.loadProject(data); OS.history.clear();
    },
  };

  // ---------------- Dosyaya aktar / içe al (.mrmars) ----------------
  OS.exportProjectFile = async function () {
    const data = OS.serialize();
    data.audio = {};
    const used = new Set();
    data.tracks.forEach(t => t.clips.forEach(c => c.bufferId && used.add(c.bufferId)));
    for (const id of used) {
      const b = E.buffers.get(id); if (!b) continue;
      const wav = await U.bufferToWav(b, 24).arrayBuffer();
      data.audio[id] = U.abToB64(wav);
    }
    U.download(new Blob([JSON.stringify(data)], { type: 'application/json' }), (OS.project.name || 'proje').replace(/[\\/:*?"<>|]/g, '_') + '.mrmars');
  };
  OS.importProjectFile = async function (file) {
    const data = JSON.parse(await U.readAsText(file));
    if (!/^(MrMarsStudio|OrbitStudio)$/.test(data.app)) throw new Error(OS.t('Bu bir Mr. Mars Music Studio proje dosyası değil'));
    E.init();
    for (const id in (data.audio || {})) {
      const b = await E.ctx.decodeAudioData(U.b64ToAb(data.audio[id]));
      E.buffers.set(id, b); OS.store.saveBuffer(id, b, id);
    }
    delete data.audio;
    OS.loadProject(data); OS.history.clear();
  };

  // ---------------- Ses dosyası içe aktarma ----------------
  OS.importAudioFile = async function (file) {
    E.init();
    const ab = await U.readAsArrayBuffer(file);
    const buf = await E.ctx.decodeAudioData(ab);
    const id = U.uid();
    E.buffers.set(id, buf);
    OS.store.saveBuffer(id, buf, file.name);
    return { id, buf, name: file.name.replace(/\.[^.]+$/, '') };
  };
})(window.OS);
