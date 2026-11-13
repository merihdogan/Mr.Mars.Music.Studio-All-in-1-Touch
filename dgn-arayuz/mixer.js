/* Mr. Mars Music Studio · MRH DGN — mikser konsolu */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui;
  const M = ui.mixer = {};
  let root, meters = [];

  ui.openDeviceModal = function (dev, owner) {
    const box = el('div', { class: 'dev-panel', style: 'min-width:560px' });
    ui.buildDevice(box, dev);
    U.modal((owner ? owner + ' › ' : '') + dev.def.name, box);
  };

  M.init = function () {
    root = document.getElementById('view-mixer');
    document.addEventListener('os-project', () => { if (root.classList.contains('active')) M.render(); });
    document.addEventListener('os-devices', () => { if (root.classList.contains('active')) M.render(); });
    document.addEventListener('os-mix', () => { if (root.classList.contains('active')) M.syncValues(); });
    requestAnimationFrame(loop);
  };

  M.mode = 'strips';
  M.setMode = function (m) { M.mode = m; M.render(); };
  M.render = function () {
    root.innerHTML = ''; meters = [];
    const P = OS.project;
    root.appendChild(el('div', { class: 'mx-mode' },
      el('button', { class: 'btn sm' + (M.mode === 'strips' ? ' on' : ''), onclick: () => M.setMode('strips') }, OS.t('Şeritler')),
      el('button', { class: 'btn sm' + (M.mode === 'map' ? ' on' : ''), title: OS.t('Her parça bir nokta: yatayda pan, dikeyde ses. Sürükleyerek ikisini birden ayarlayın.'), onclick: () => M.setMode('map') }, OS.t('Stereo harita'))));
    if (M.mode === 'map') { ui.stereoMap.render(root); return; }
    P.tracks.forEach(t => root.appendChild(strip(t)));
    root.appendChild(strip(null));
  };

  function strip(t) {
    const P = OS.project, isM = !t;
    const data = isM ? P.master : t;
    const name = isM ? 'MASTER' : t.name;
    const inserts = isM ? P.master.inserts : t.inserts;
    const resync = () => { isM ? OS.engine.ensureMaster() : OS.engine.syncTrack(t); OS.store.markDirty(); M.render(); };
    const ins = el('div', { class: 'ins' });
    if (!isM && t.instrument) ins.appendChild(el('div', { class: 'slot', style: 'border-color:var(--acc2)', onclick: () => ui.openDeviceModal(t.instrument, name) }, el('span', { class: 'nm' }, '♪ ' + t.instrument.def.name)));
    inserts.forEach((d, i) => {
      const s = el('div', { class: 'slot' + (d.bypass ? ' byp' : ''), onclick: () => ui.openDeviceModal(d, name) }, el('span', { class: 'nm' }, d.def.name));
      s.addEventListener('contextmenu', e => {
        e.preventDefault();
        U.menu(e.clientX, e.clientY, [
          { label: d.bypass ? 'Aç' : 'Bypass', onclick: () => { d.setBypass(!d.bypass); M.render(); } },
          { label: 'Kaldır', onclick: () => { OS.history.push(); inserts.splice(i, 1); d.dispose(); resync(); } },
        ]);
      });
      ins.appendChild(s);
    });
    ins.appendChild(el('button', { class: 'btn sm', onclick: e => ui.pluginMenu(e.clientX, e.clientY, 'effect', id => { OS.history.push(); const d = OS.newDevice(id); inserts.push(d); resync(); ui.openDeviceModal(d, name); }) }, '+'));

    const sends = el('div', { class: 'sends' });
    if (!isM) P.tracks.filter(b => b.type === 'fx' && b !== t).forEach(b => sends.appendChild(U.knob({
      label: b.name, size: 30, min: -60, max: 6, def: -60, value: t.sends[b.id] != null ? t.sends[b.id] : -60,
      fmt: v => v <= -60 ? '-∞' : v.toFixed(0), onchange: v => { t.sends[b.id] = v; OS.engine.updateMix(); },
    })));
    const pan = isM ? null : U.knob({ label: 'Pan', size: 34, min: -1, max: 1, def: 0, value: t.pan, fmt: v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100), onchange: v => { t.pan = v; OS.auto.touch(t, 'pan', v); OS.engine.updateMix(); } });
    const db = el('div', { class: 'db' }, data.vol.toFixed(1) + ' dB');
    const fader = el('input', {
      type: 'range', class: 'vfader', min: -60, max: 12, step: 0.1, value: data.vol,
      oninput: e => { data.vol = +e.target.value; db.textContent = data.vol.toFixed(1) + ' dB'; if (!isM) OS.auto.touch(t, 'vol', data.vol); OS.engine.updateMix(); },
      ondblclick: e => { data.vol = 0; e.target.value = 0; db.textContent = '0.0 dB'; OS.engine.updateMix(); },
    });
    fader._data = data; fader._db = db;
    const mc = el('canvas');
    const node = isM ? OS.engine.master : OS.engine.nodes.get(t.id);
    meters.push({ cv: mc, node, peak: 0, hold: 0 });
    const btns = el('div', { class: 'btns' });
    if (!isM) {
      btns.append(
        el('button', { class: 'mini m' + (t.mute ? ' on' : ''), onclick: e => { t.mute = !t.mute; e.target.classList.toggle('on', t.mute); OS.engine.updateMix(); ui.emit('os-project'); } }, 'M'),
        el('button', { class: 'mini s' + (t.solo ? ' on' : ''), onclick: e => { t.solo = !t.solo; e.target.classList.toggle('on', t.solo); OS.engine.updateMix(); ui.emit('os-project'); } }, 'S'),
      );
      if (t.type !== 'fx') btns.append(el('button', { class: 'mini r' + (t.arm ? ' on' : ''), onclick: e => { t.arm = !t.arm; e.target.classList.toggle('on', t.arm); ui.emit('os-project'); } }, '●'));
    }
    return el('div', { class: 'strip' + (isM ? ' master' : '') },
      el('div', { class: 'sname', style: { background: isM ? 'var(--acc)' : t.color }, title: name }, name),
      ins, sends, pan,
      el('div', { class: 'fz' }, fader, mc), db, btns);
  }

  M.syncValues = function () {
    root.querySelectorAll('.vfader').forEach(f => { f.value = f._data.vol; f._db.textContent = f._data.vol.toFixed(1) + ' dB'; });
  };

  const buf = new Float32Array(1024);
  function loop() {
    if (root && root.classList.contains('active')) {
      meters.forEach(m => {
        if (!m.node) return;
        const cv = m.cv, w = cv.width = 14, h = cv.height = cv.clientHeight || 160, g = cv.getContext('2d');
        const l = U.meterLevel(m.node.anL, buf), r = U.meterLevel(m.node.anR, buf);
        g.clearRect(0, 0, w, h);
        [l, r].forEach((pk, i) => {
          const db = U.gainToDb(pk), f = U.clamp((db + 60) / 66, 0, 1);
          const grd = g.createLinearGradient(0, h, 0, 0); grd.addColorStop(0, '#39c27a'); grd.addColorStop(0.75, '#e5d43a'); grd.addColorStop(0.92, '#ef4444');
          g.fillStyle = grd; g.fillRect(i * 7, h - f * h, 6, f * h);
        });
        const pk = Math.max(l, r);
        if (pk > m.peak || m.hold-- <= 0) { m.peak = pk; m.hold = 60; }
        const py = h - U.clamp((U.gainToDb(m.peak) + 60) / 66, 0, 1) * h;
        g.fillStyle = m.peak >= 1 ? '#ef4444' : '#fff'; g.fillRect(0, py, 14, 1);
      });
    }
    requestAnimationFrame(loop);
  }
})(window.OS);
