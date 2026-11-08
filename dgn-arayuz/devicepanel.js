/* Mr. Mars Music Studio · MRH DGN — cihaz panelleri, eklenti menüsü, inspektör */
(function (OS) {
  const U = OS.U, el = U.el;
  const ui = OS.ui = OS.ui || {};
  ui.selectedTrack = null;
  ui.selectedClips = new Set();

  ui.emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  ui.changed = () => { OS.store.markDirty(); ui.emit('os-project'); };

  // ---------------- Eklenti seçme menüsü ----------------
  ui.pluginMenu = function (x, y, type, cb) {
    const defs = OS.plugins.all(type).sort((a, b) => a.category.localeCompare(b.category, 'tr') || a.name.localeCompare(b.name, 'tr'));
    const items = []; let cat = null;
    defs.forEach(d => { if (d.category !== cat) { cat = d.category; items.push({ header: cat }); } items.push({ label: d.name, onclick: () => cb(d.id) }); });
    if (!items.length) items.push({ label: 'Eklenti yok', disabled: true });
    U.menu(x, y, items);
  };

  // ---------------- Cihaz arayüzü ----------------
  ui.buildDevice = function (container, dev, opts) {
    opts = opts || {};
    container.innerHTML = '';
    const def = dev.def;
    const head = el('div', { class: 'dev-head' },
      el('span', { class: 'title' }, def.name),
      el('span', { class: 'muted' }, def.category),
      el('span', { class: 'spacer' }),
    );
    if (!dev.isInstrument || opts.allowBypass) {
      const b = el('button', { class: 'btn sm' + (dev.bypass ? '' : ' on'), onclick: () => { dev.setBypass(!dev.bypass); b.className = 'btn sm' + (dev.bypass ? '' : ' on'); b.textContent = dev.bypass ? 'Kapalı' : 'Açık'; ui.emit('os-devices'); } }, dev.bypass ? 'Kapalı' : 'Açık');
      head.appendChild(b);
    }
    head.appendChild(el('button', { class: 'btn sm', onclick: e => presetMenu(e, dev, () => ui.buildDevice(container, dev, opts)) }, 'Ön Ayarlar ▾'));
    if (opts.onRemove) head.appendChild(el('button', { class: 'btn sm danger', onclick: opts.onRemove }, 'Kaldır'));
    container.appendChild(head);
    if (dev.missing) container.appendChild(el('div', { class: 'muted' }, 'Bu eklenti yüklü değil. Eklentiler sekmesinden yükleyin; ayarları korunur.'));
    if (dev.error) container.appendChild(el('div', { style: 'color:var(--rec)' }, 'Hata: ' + dev.error));
    const custom = el('div');
    container.appendChild(custom);
    const knobs = el('div', { class: 'knobs' });
    def.params.forEach(p => knobs.appendChild(paramControl(dev, p)));
    container.appendChild(knobs);
    if (def.ui) { try { def.ui(custom, dev); } catch (e) { console.warn(e); } }
  };

  function paramControl(dev, p) {
    const v = dev.values[p.id];
    let ctl;
    if (p.type === 'choice') {
      const s = el('select', { onchange: () => { dev.setParam(p.id, +s.value); OS.auto.touchDevice(dev, p.id, +s.value); } }, p.options.map((o, i) => (p.hide && p.hide.includes(i) && Math.round(v) !== i) ? null : el('option', { value: i, selected: Math.round(v) === i }, o)).filter(Boolean));
      ctl = el('label', { class: 'choice' }, el('span', null, p.name), s);
      ctl.setValue = x => s.value = Math.round(x);
    } else if (p.type === 'bool') {
      const b = el('button', { class: 'btn sm' + (v >= 0.5 ? ' on' : ''), onclick: () => { const nv = dev.values[p.id] >= 0.5 ? 0 : 1; dev.setParam(p.id, nv); OS.auto.touchDevice(dev, p.id, nv); b.classList.toggle('on', nv >= 0.5); } }, p.name);
      ctl = el('div', { class: 'knob', style: 'justify-content:center' }, b);
      ctl.setValue = x => b.classList.toggle('on', x >= 0.5);
    } else ctl = U.knob({ label: p.name, min: p.min, max: p.max, value: v, def: p.def, step: p.step, curve: p.curve, fmt: x => U.fmtParam(p, x), onchange: x => { dev.setParam(p.id, x); OS.auto.touchDevice(dev, p.id, x); } });
    // her düğme MIDI controller'a öğretilebilir (sağ tık)
    const key = dev.id + '|' + p.id;
    ML.ctls.set(key, ctl);
    if (ML.boundKey(key)) ctl.classList.add('midi-mapped');
    ctl.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const bound = ML.boundKey(key);
      U.menu(e.clientX, e.clientY, [
        { header: p.name + (bound ? ' • ' + bound : '') },
        { label: 'MIDI öğren (sonra controller’da düğmeyi çevirin)', onclick: () => { ML.pending = { dev: dev.id, p: p.id }; ctl.classList.add('midi-learning'); U.toast(OS.t('Controller’da bir düğme / fader hareket ettirin')); } },
        bound ? { label: 'MIDI eşlemesini kaldır', onclick: () => { ML.unbind(key); ctl.classList.remove('midi-mapped'); } } : null,
        { label: 'Varsayılan değer', onclick: () => { const d = p.def != null ? p.def : p.min; dev.setParam(p.id, d); ctl.setValue && ctl.setValue(d); } },
      ].filter(Boolean));
    });
    return ctl;
  }

  // ---------------- Genel MIDI öğrenme (her cihaz parametresi) ----------------
  const ML = OS.midiLearn = {
    map: (() => { try { return JSON.parse(localStorage.getItem('os.midimap') || '{}'); } catch (e) { return {}; } })(),
    pending: null, ctls: new Map(), extra: new Map(),
    save() { try { localStorage.setItem('os.midimap', JSON.stringify(ML.map)); } catch (e) { } },
    boundKey(key) { const k = Object.keys(ML.map).find(m => ML.map[m].dev + '|' + ML.map[m].p === key); return k || null; },
    unbind(key) { Object.keys(ML.map).forEach(m => { if (ML.map[m].dev + '|' + ML.map[m].p === key) delete ML.map[m]; }); ML.save(); },
    findDevice(id) {
      const P = OS.project, list = [...P.master.inserts];
      P.tracks.forEach(t => { list.push(...t.inserts); if (t.instrument) list.push(t.instrument); });
      if (ui.rig && ui.rig.allDevices) list.push(...ui.rig.allDevices());
      return list.find(d => d.id === id) || ML.extra.get(id);
    },
  };
  OS.midiHooks = OS.midiHooks || [];
  OS.midiHooks.push(data => {
    const [st, d1, d2] = data, cmd = st & 0xf0;
    if (cmd !== 0xb0 && !(cmd === 0x90 && d2 > 0)) return false;
    const mk = (cmd === 0xb0 ? 'cc:' : 'note:') + (st & 15) + ':' + d1;
    if (ML.pending) {
      ML.unbind(ML.pending.dev + '|' + ML.pending.p);
      ML.map[mk] = ML.pending; ML.save();
      const c = ML.ctls.get(ML.pending.dev + '|' + ML.pending.p); if (c) { c.classList.remove('midi-learning'); c.classList.add('midi-mapped'); }
      U.toast(OS.t('MIDI eşlendi') + ': ' + mk); ML.pending = null; return true;
    }
    const m = ML.map[mk]; if (!m) return false;
    const dev = ML.findDevice(m.dev); if (!dev) return false;
    const p = dev.def.params.find(x => x.id === m.p); if (!p) return false;
    let v;
    if (p.type === 'bool') v = cmd === 0x90 ? (dev.values[p.id] >= 0.5 ? 0 : 1) : (d2 >= 64 ? 1 : 0);
    else if (cmd === 0x90 && p.type === 'choice') v = (Math.round(dev.values[p.id]) + 1) % p.options.length;
    else v = OS.auto.denorm(p, d2 / 127);
    dev.setParam(p.id, v); OS.auto.touchDevice(dev, p.id, v);
    const c = ML.ctls.get(dev.id + '|' + p.id); if (c && c.isConnected && c.setValue) c.setValue(v);
    return true;
  });
  ui.paramControl = paramControl;

  function presetMenu(e, dev, rerender) {
    const user = OS.presets.list(dev.pluginId), fac = dev.def.presets || {};
    const apply = vals => { Object.keys(vals).forEach(k => dev.setParam(k, vals[k])); rerender(); };
    const items = [];
    if (Object.keys(fac).length) { items.push({ header: 'Fabrika' }); Object.keys(fac).forEach(n => items.push({ label: n, onclick: () => apply(fac[n]) })); }
    if (Object.keys(user).length) { items.push({ header: 'Kullanıcı' }); Object.keys(user).forEach(n => items.push({ label: n, onclick: () => apply(user[n]) })); }
    items.push('-');
    items.push({ label: 'Ayarları kopyala', onclick: () => { OS.paramClipboard = { plugin: dev.pluginId, values: Object.assign({}, dev.values) }; U.toast(OS.t('Ayarlar kopyalandı')); } });
    const cb = OS.paramClipboard;
    items.push({ label: 'Ayarları yapıştır', disabled: !cb || cb.plugin !== dev.pluginId, onclick: () => { Object.keys(cb.values).forEach(k => dev.setParam(k, cb.values[k])); rerender(); } });
    items.push({ label: 'Varsayılana sıfırla', onclick: () => { dev.def.params.forEach(p => dev.setParam(p.id, p.def != null ? p.def : p.min)); rerender(); } });
    items.push({ label: 'Ön ayarı kaydet…', onclick: async () => { const n = await U.prompt('Ön ayar adı'); if (n) { OS.presets.save(dev.pluginId, n, Object.assign({}, dev.values)); U.toast('Kaydedildi'); } } });
    if (Object.keys(user).length) items.push({ label: 'Kullanıcı ön ayarı sil…', onclick: async () => { const n = await U.prompt('Silinecek ön ayar adı'); if (n) OS.presets.remove(dev.pluginId, n); } });
    const r = e.target.getBoundingClientRect();
    U.menu(r.left, r.bottom + 2, items);
  }

  // ---------------- Alt bölge ----------------
  ui.openLower = function (title, render) {
    const lz = document.getElementById('lower-zone');
    lz.classList.remove('hidden');
    document.getElementById('lz-title').textContent = title;
    const c = document.getElementById('lz-content');
    if (ui._lowerCleanup) { ui._lowerCleanup(); ui._lowerCleanup = null; }
    c.innerHTML = '';
    ui._lowerCleanup = render(c) || null;
    ui.emit('os-layout');
  };
  ui.closeLower = function () {
    if (ui._lowerCleanup) { ui._lowerCleanup(); ui._lowerCleanup = null; }
    document.getElementById('lower-zone').classList.add('hidden');
    ui.lowerKind = null;
    ui.emit('os-layout');
  };
  ui.openDevice = function (dev, owner, onRemove) {
    ui.lowerKind = 'device:' + dev.id;
    ui.openLower((owner ? owner + ' › ' : '') + dev.def.name, c => {
      const p = el('div', { class: 'dev-panel' }); c.appendChild(p);
      ui.buildDevice(p, dev, { onRemove: onRemove ? () => { onRemove(); ui.closeLower(); } : null });
    });
  };

  // ---------------- Takma (insert) listesi ----------------
  ui.insertList = function (list, owner, onChange) {
    const box = el('div', { class: 'ins-list', style: 'display:flex;flex-direction:column;gap:3px' });
    const render = () => {
      box.innerHTML = '';
      list.forEach((d, i) => {
        const pw = el('span', { class: 'mini' + (d.bypass ? '' : ' i on'), title: 'Aç/Kapat', onclick: ev => { ev.stopPropagation(); d.setBypass(!d.bypass); render(); } }, '⏻');
        const slot = el('div', { class: 'slot' + (d.bypass ? ' byp' : '') + (d.missing || d.error ? ' err' : ''), onclick: () => ui.openDevice(d, owner.name, () => remove(i)) },
          pw, el('span', { class: 'nm' }, d.def.name),
          el('span', { class: 'mini', title: 'Yukarı', onclick: ev => { ev.stopPropagation(); if (i > 0) { OS.history.push(); list.splice(i - 1, 0, list.splice(i, 1)[0]); done(); } } }, '▲'),
          el('span', { class: 'mini', title: 'Kaldır', onclick: ev => { ev.stopPropagation(); remove(i); } }, '✕'));
        slot.addEventListener('contextmenu', ev => {
          ev.preventDefault();
          U.menu(ev.clientX, ev.clientY, [
            { label: 'Aç', onclick: () => ui.openDevice(d, owner.name, () => remove(i)) },
            { label: 'Değiştir…', onclick: () => ui.pluginMenu(ev.clientX, ev.clientY, 'effect', id => { OS.history.push(); d.dispose(); list[i] = OS.newDevice(id); done(); }) },
            { label: 'Çoğalt', onclick: () => { OS.history.push(); const s = d.serialize(); delete s.id; list.splice(i + 1, 0, new OS.Device(OS.engine.ctx, d.pluginId, s)); done(); } },
            { label: 'Kaldır', onclick: () => remove(i) },
          ]);
        });
        box.appendChild(slot);
      });
      box.appendChild(el('button', { class: 'btn sm', onclick: ev => ui.pluginMenu(ev.clientX, ev.clientY, 'effect', id => { OS.history.push(); const d = OS.newDevice(id); list.push(d); done(); ui.openDevice(d, owner.name, () => remove(list.indexOf(d))); }) }, '+ Efekt Ekle'));
    };
    const remove = i => { if (i < 0) return; OS.history.push(); const [d] = list.splice(i, 1); if (d) { if (ui.lowerKind === 'device:' + d.id) ui.closeLower(); d.dispose(); } done(); };
    const done = () => { onChange(); render(); };
    render();
    box.refresh = render;
    return box;
  };

  // ---------------- İnspektör ----------------
  ui.renderInspector = function () {
    const box = document.getElementById('inspector');
    box.innerHTML = '';
    const P = OS.project, t = P.tracks.find(x => x.id === ui.selectedTrack);
    if (!t) {
      box.appendChild(sec('Master', masterBody()));
      box.appendChild(el('div', { class: 'muted', style: 'padding:6px' }, 'Ayrıntılar için bir parça seçin.'));
      return;
    }
    const resync = () => { OS.engine.syncTrack(t); OS.store.markDirty(); ui.emit('os-devices'); };
    const name = el('input', { class: 'inp', value: OS.t(t.name), style: 'flex:1', onchange: () => { OS.history.push(); t.name = name.value; ui.changed(); } });
    const color = el('input', { type: 'color', value: t.color, style: 'width:34px;height:26px;padding:0;border:none;background:none', onchange: () => { t.color = color.value; ui.changed(); } });
    const typeLabel = { audio: 'Ses Parçası', instrument: 'Enstrüman Parçası', fx: 'FX Kanalı' }[t.type];
    box.appendChild(sec(typeLabel, el('div', { class: 'row' }, color, name)));

    if (t.type === 'audio') {
      const sel = el('select', { onchange: () => { t.inputCh = sel.value; OS.engine.updateMonitor(t); } },
        [['L', 'Giriş 1 (Sol / Mono)'], ['R', 'Giriş 2 (Sağ / Mono)'], ['stereo', 'Stereo 1+2']].map(([v, l]) => el('option', { value: v, selected: t.inputCh === v }, l)));
      const presetSel = el('select', { onchange: () => { if (presetSel.value) applyRig(t, presetSel.value); presetSel.value = ''; } },
        el('option', { value: '' }, 'Gitar/Bas zinciri uygula…'), Object.keys(OS.RIG_PRESETS).map(k => el('option', { value: k }, k)));
      box.appendChild(sec('Giriş', el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, sel, presetSel,
        el('div', { class: 'muted', style: 'font-size:11px' }, 'Gitarı canlı çalmak için ses kartı girişini seçip “İzle” (🎧) düğmesini açın.'))));
    }
    if (t.type === 'instrument') {
      const body = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
      const instSlot = el('div', { class: 'slot', onclick: () => ui.openDevice(t.instrument, t.name) }, el('span', { class: 'nm' }, t.instrument ? t.instrument.def.name : '—'), el('span', { class: 'muted' }, 'Aç'));
      body.append(instSlot, el('button', {
        class: 'btn sm', onclick: e => ui.pluginMenu(e.clientX, e.clientY, 'instrument', id => {
          OS.history.push();
          if (t.instrument) t.instrument.dispose();
          t.instrument = OS.newDevice(id);
          const s = OS.engine.nodes.get(t.id); if (s) s.instrument = null;
          resync(); ui.renderInspector(); ui.openDevice(t.instrument, t.name);
        }),
      }, 'Enstrümanı Değiştir…'));
      box.appendChild(sec('Enstrüman', body));
    }
    box.appendChild(sec('Efekt Yuvaları', ui.insertList(t.inserts, t, resync)));
    const buses = P.tracks.filter(b => b.type === 'fx' && b !== t);
    if (buses.length) {
      const k = el('div', { class: 'knobs' });
      buses.forEach(b => k.appendChild(U.knob({
        label: b.name, min: -60, max: 6, def: -60, value: t.sends[b.id] != null ? t.sends[b.id] : -60, size: 36,
        fmt: v => v <= -60 ? '-∞' : v.toFixed(1) + ' dB', onchange: v => { t.sends[b.id] = v; OS.engine.updateMix(); OS.store.markDirty(); },
      })));
      box.appendChild(sec('Gönderimler (Send)', k));
    }
    const k2 = el('div', { class: 'knobs' });
    k2.append(
      U.knob({ label: 'Ses', min: -60, max: 12, def: 0, value: t.vol, fmt: v => v.toFixed(1) + ' dB', onchange: v => { t.vol = v; OS.auto.touch(t, 'vol', v); OS.engine.updateMix(); ui.emit('os-mix'); } }),
      U.knob({ label: 'Pan', min: -1, max: 1, def: 0, value: t.pan, fmt: v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100), onchange: v => { t.pan = v; OS.auto.touch(t, 'pan', v); OS.engine.updateMix(); ui.emit('os-mix'); } }),
    );
    box.appendChild(sec('Kanal', k2));
    box.appendChild(el('button', { class: 'btn sm', onclick: () => renderTrack(t) }, 'Parçayı WAV olarak dışa aktar'));
  };

  async function renderTrack(t) {
    U.toast('Render ediliyor…');
    try { const b = await OS.engine.render({ trackId: t.id }); U.download(U.bufferToWav(b, 24), t.name + '.wav'); }
    catch (e) { U.toast(e.message); }
  }

  function applyRig(t, name) {
    OS.history.push();
    t.inserts.forEach(d => d.dispose());
    t.inserts.length = 0;
    OS.RIG_PRESETS[name].forEach(([id, vals]) => { const d = OS.newDevice(id); Object.keys(vals).forEach(k => d.setParam(k, vals[k])); t.inserts.push(d); });
    OS.engine.syncTrack(t); ui.renderInspector(); ui.emit('os-devices');
    U.toast(name + ' zinciri uygulandı');
  }
  ui.applyRig = applyRig;

  function masterBody() {
    const P = OS.project;
    return el('div', { style: 'display:flex;flex-direction:column;gap:6px' },
      ui.insertList(P.master.inserts, { name: 'Master' }, () => { OS.engine.ensureMaster(); ui.emit('os-devices'); }),
      U.el('button', { class: 'btn sm' + (P.master.showAuto ? ' on' : ''), title: OS.t('Master kanalının ses, pan ve efekt otomasyonu'), onclick: e => { P.master.showAuto = !P.master.showAuto; if (P.master.showAuto && !(P.master.automation || []).length) ui.autoLanes.addLane(P.master, 'vol'); e.target.classList.toggle('on', P.master.showAuto); ui.arrange.render && ui.arrange.render(); } }, OS.t('Master otomasyonu')),
      U.knob({ label: 'Master', min: -60, max: 12, def: 0, value: P.master.vol, fmt: v => v.toFixed(1) + ' dB', onchange: v => { P.master.vol = v; OS.auto.touch(P.master, 'vol', v); OS.engine.updateMix(); ui.emit('os-mix'); } }));
  }

  function sec(title, body) {
    return el('div', { class: 'insp-sec' }, el('div', { class: 'h' }, title), el('div', { class: 'b' }, body));
  }
  ui.sec = sec;
})(window.OS);
