/* Mr. Mars Music Studio · MRH DGN — dokunmatik DJ kontrolcüsü: tam ekran masa, büyük jog tekerlekleri,
   çok parmakla pedler ve faderler. Normal DJ sekmesiyle aynı deck'leri ve aynı MIDI eşlemelerini kullanır. */
(function (OS) {
  const U = OS.U, el = U.el, E = OS.engine, DJ = OS.ui.dj;
  const T = DJ.touch = { on: false, side: [0, 1], tab: {}, sheet: null };
  const I = () => DJ._i;

  // ---------------- Jog: açıyı izler, plak gibi elle çevrilir ----------------
  // Plak yüzeyi: scratch (Vinyl açıkken). Dış halka ya da Vinyl kapalıyken: tempo itme, durmuşken konum.
  T.bindJog = function (jog, d) {
    let P = null;
    const geo = e => { const r = jog.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); return { a: Math.atan2(y, x) * 180 / Math.PI, r: Math.hypot(x, y) / (r.width / 2) }; };
    jog.addEventListener('pointerdown', e => {
      if (DJ.learn || P || e.button > 0 || !d.buffer) return;
      e.preventDefault(); E.resume();
      try { jog.setPointerCapture(e.pointerId); } catch (err) { }
      const g = geo(e), scratch = I().settings.vinyl && g.r < 0.8;
      P = { id: e.pointerId, a: g.a, scratch };
      jog.classList.add('touched');
      if (scratch) d.scratchOn();
      DJ.renderInfo();
    });
    jog.addEventListener('pointermove', e => {
      if (!P || e.pointerId !== P.id) return;
      const g = geo(e); if (g.r < 0.06) return;
      let da = g.a - P.a; P.a = g.a;
      if (da > 180) da -= 360; else if (da < -180) da += 360;
      const S = I().settings, res = S.jogRes || 720, sens = S.jogSens || 1;
      if (P.scratch && d.scr) d.scr.ticks += da / 360 * res / sens;
      else if (d.playing) d.jogBend(da / 360 * res * 1.5);
      else d.seek(d.position() + da / 360 * (60 / 33.333));
    });
    const end = e => { if (!P || e.pointerId !== P.id) return; if (P.scratch) d.scratchOff(); P = null; jog.classList.remove('touched'); DJ.renderInfo(); };
    jog.addEventListener('pointerup', end); jog.addEventListener('pointercancel', end); jog.addEventListener('lostpointercapture', end);
    jog.addEventListener('contextmenu', e => e.preventDefault());
  };

  // Basılı tutulabilen düğme: parmak başına ayrı çalışır
  function hold(b, down, up) {
    let id = null;
    b.addEventListener('pointerdown', e => { if (id !== null || e.button > 0) return; e.preventDefault(); id = e.pointerId; try { b.setPointerCapture(id); } catch (err) { } b.classList.add('held'); E.resume(); down && down(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; b.classList.remove('held'); up && up(e); };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return b;
  }
  const btn = (cls, label, down, up) => hold(el('button', { class: 'tq-b ' + cls }, label), down, up);
  const upd = () => DJ.renderInfo();

  // ---------------- Deck ----------------
  const TABS = [['pad', 'PAD'], ['loop', 'LOOP'], ['fx', 'FX'], ['stem', 'STEM'], ['key', 'TON']];
  function panel(d, tab, ks) {
    const S = I().settings, box = el('div', { class: 'tq-panel tqp-' + tab });
    if (tab === 'pad') {
      box.appendChild(el('div', { class: 'tq-modes' }, I().PAD_MODES.map(([v, l]) => btn('tq-mode' + ((d.padMode || 'hot') === v ? ' on' : ''), OS.t(l), () => { d.padMode = v; rebuild(d); }))));
      const grid = el('div', { class: 'tq-pads' });
      const labels = [];
      for (let i = 0; i < 8; i++) {
        const b = btn('tq-pad', '', () => { I().padPress(d, i, !!DJ.shift); upd(); }, () => { I().padRelease(d, i); upd(); });
        labels.push(b); grid.appendChild(b);
      }
      box.appendChild(grid);
      d._tqPads = () => labels.forEach((b, i) => { const c = 'tq-b tq-pad ' + I().padClass(d, i) + (b.classList.contains('held') ? ' held' : ''); if (b.className !== c) b.className = c; const t = String(I().padLabel(d, i)); if (b.textContent !== t) b.textContent = t; });
    } else if (tab === 'loop') {
      const g = el('div', { class: 'tq-grid4' });
      [0.25, 0.5, 1, 2, 4, 8, 16, 32].forEach(k => g.appendChild(btn('tq-mode' + (d.loop && d.loop.beats === k ? ' on' : ''), k < 1 ? '1/' + (1 / k) : String(k), () => { d.setLoop(d.loop && d.loop.beats === k ? 0 : k); rebuild(d); })));
      const run = a => I().runAction(d.L + '.' + a, 1, 127, true, false);
      const act = el('div', { class: 'tq-grid4' },
        btn('', 'IN', () => run('loopin')), btn('', 'OUT', () => run('loopout')), btn('', '½', () => run('loophalf')), btn('', '×2', () => run('loopdouble')),
        btn('', '◀◀ ' + S.jump, () => d.jump(-S.jump)), btn('', S.jump + ' ▶▶', () => d.jump(S.jump)),
        btn('', OS.t('Çık'), () => { d.setLoop(0); rebuild(d); }), btn('', '|◀', () => { if (d.buffer) d.seek(0); }));
      box.append(g, act);
    } else if (tab === 'fx') {
      d.fx.forEach((f, i) => {
        const k = U.knob({ label: 'FX ' + (i + 1), size: ks, exact: true, min: 0, max: 1, def: 0.5, value: f.amt, fmt: v => Math.round(v * 100) + '%', onchange: v => d.setFxAmt(v, i) });
        d['fxKnob' + i] = k;
        box.appendChild(el('div', { class: 'tq-fx' }, el('select', { onchange: e => d.setFx(e.target.value, i) }, I().FX.map(([id, l]) => el('option', { value: id, selected: id === f.id }, l))), k));
      });
      box.appendChild(el('div', { class: 'tq-fx' },
        U.knob({ label: 'Send A', size: ks, exact: true, min: 0, max: 1, def: 0, value: d.sendA.gain.value, fmt: v => Math.round(v * 100) + '%', onchange: v => d.sendA.gain.value = v }),
        U.knob({ label: 'Send B', size: ks, exact: true, min: 0, max: 1, def: 0, value: d.sendB.gain.value, fmt: v => Math.round(v * 100) + '%', onchange: v => d.sendB.gain.value = v }),
        U.knob({ label: 'Rez', size: ks, exact: true, min: 0.5, max: 15, def: 1.2, value: d.res, curve: 'log', fmt: v => v.toFixed(1), onchange: v => d.setRes(v) })));
    } else if (tab === 'stem') {
      if (d.stems) I().STEMS.forEach(k => box.appendChild(el('div', { class: 'tq-stem' },
        btn('tq-mode' + (d.stemG[k].gain.value > 0.5 ? ' on' : ''), OS.t(I().STEM_LBL[k]), () => { d.toggleStem(k); rebuild(d); }),
        U.knob({ label: OS.t('Seviye'), size: ks, exact: true, min: 0, max: 1.5, def: 1, value: d.stemL[k].gain.value, fmt: v => Math.round(v * 100) + '%', onchange: v => d.stemL[k].gain.value = v }))));
      else if (d.stemProg != null) box.appendChild(el('div', { class: 'tq-note' }, OS.t('Stem’ler hazırlanıyor') + ' %' + Math.round(d.stemProg * 100)));
      else box.appendChild(btn('tq-wide', OS.t('Stem’leri ayır (vokal/davul/bas/melodi)'), () => { d.makeStems().then(() => rebuild(d)); rebuild(d); }));
    } else {
      const set = v => { d.setKeyShift(v); rebuild(d); };
      box.append(el('div', { class: 'tq-grid4' },
        btn('', '♭', () => set((d.keyShift || 0) - 1)), el('div', { class: 'tq-val' }, ((d.keyShift || 0) > 0 ? '+' : '') + (d.keyShift || 0)), btn('', '♯', () => set((d.keyShift || 0) + 1)), btn('', 'Key Match', () => { I().keyMatch(d); rebuild(d); }),
        btn('', OS.t('Fren'), () => d.brake()), btn('', 'Spinback', () => d.spinback()), btn('tq-mode' + (d.rev ? ' on' : ''), OS.t('Ters'), () => { d.setReverse(!d.rev); rebuild(d); }), btn('', 'TAP', () => { d.tap(); upd(); }),
        btn('', '×2 / ÷2', () => { if (d.bpm) { d.bpm = d.bpm > 120 ? d.bpm / 2 : d.bpm * 2; upd(); } }), btn('', '1.', () => d.setDownbeat()), btn('', '◂ ' + OS.t('Izgara'), () => d.shiftGrid(-10)), btn('', OS.t('Izgara') + ' ▸', () => d.shiftGrid(10))));
    }
    return box;
  }
  function rebuild(d) { const h = T.hosts && T.hosts.get(d); if (h) h(); }

  function deckSide(sideI, ks) {
    const S = I().settings, d = DJ.decks[T.side[sideI]];
    const name = el('div', { class: 'tq-name' }), bpm = el('b', { class: 'tq-bpm' }), key = el('span', { class: 'tq-key' }), time = el('span', { class: 'tq-time' }), pct = el('span', { class: 'tq-pct' });
    const platter = el('div', { class: 'tq-platter' }, el('div', { class: 'tq-grooves' }), el('div', { class: 'tq-label' }), el('div', { class: 'tq-mark' }));
    const jog = el('div', { class: 'tq-jog' }, el('div', { class: 'tq-strobe' }), platter);
    T.bindJog(jog, d); d.jogEl = platter;
    const label = platter.children[1];
    const pitch = el('input', { type: 'range', class: 'tq-pitch', min: -1, max: 1, step: 0.001, value: (d.rate - 1) / d.range, oninput: e => { d.setRate(1 + (+e.target.value) * d.range); upd(); }, ondblclick: e => { e.target.value = 0; d.setRate(1); upd(); } });
    d.pitchEl = pitch;
    const cue = btn('tq-cue', 'CUE', () => { d.cueBtn(); upd(); }, () => { d.cueUp(); upd(); });
    const play = btn('tq-play', '▶', () => { d.toggle(); upd(); });
    const sync = btn('tq-side', 'SYNC', () => { const o = I().otherDeck(d); if (o && d.sync(o)) { pitch.value = U.clamp((d.rate - 1) / d.range, -1, 1); upd(); } });
    const kl = btn('tq-side', 'KEY', () => { d.setKeyLock(!d.keylock); upd(); });
    const vinyl = btn('tq-side' + (S.vinyl ? ' on' : ''), 'VINYL', () => { S.vinyl = !S.vinyl; I().saveSettings(); vinyl.classList.toggle('on', S.vinyl); });
    const range = el('select', { class: 'tq-range', onchange: e => { d.range = +e.target.value; d.setRate(1 + (+pitch.value) * d.range); upd(); } }, [['0.06', '±6%'], ['0.08', '±8%'], ['0.16', '±16%'], ['0.5', '±50%']].map(([v, l]) => el('option', { value: v, selected: +v === d.range }, l)));
    const host = el('div', { class: 'tq-host' }), tabs = el('div', { class: 'tq-tabs' });
    const cur = () => T.tab[d.L] || 'pad';
    const draw = () => {
      d._tqPads = null; host.innerHTML = ''; host.appendChild(panel(d, cur(), ks));
      tabs.innerHTML = ''; TABS.forEach(([v, l]) => tabs.appendChild(btn('tq-tab' + (cur() === v ? ' on' : ''), l, () => { T.tab[d.L] = v; draw(); })));
    };
    T.hosts.set(d, draw); draw();
    const swap = S.count === 4 ? btn('tq-swap', d.L + ' ⇄ ' + (DJ.decks[T.side[sideI] === sideI ? sideI + 2 : sideI]).L, () => { T.side[sideI] = T.side[sideI] === sideI ? sideI + 2 : sideI; DJ.render(); }) : null;
    let stemWas = null, covWas;
    I().infoEls.push(() => {
      name.textContent = d.name; bpm.textContent = d.bpm ? (d.bpm * d.rate).toFixed(1) : '--.-';
      key.textContent = (d.shownKey || '–') + (d.keyShift ? ' (' + (d.keyShift > 0 ? '+' : '') + d.keyShift + ')' : '');
      pct.textContent = ((d.rate - 1) * 100 >= 0 ? '+' : '') + ((d.rate - 1) * 100).toFixed(2) + '%';
      play.textContent = d.playing ? '❚❚' : '▶'; play.classList.toggle('on', d.playing);
      kl.classList.toggle('on', d.keylock); cue.classList.toggle('on', !d.playing && !!d.buffer && Math.abs(d.pos - d.cue) < 0.02);
      if (d._tqPads) d._tqPads();
      const st = (d.stems ? 'y' : 'n') + (d.stemProg != null ? Math.floor(d.stemProg * 20) : '');
      if (cur() === 'stem' && st !== stemWas) draw();
      stemWas = st;
      if (d.cover !== covWas) { covWas = d.cover; label.style.backgroundImage = d.cover ? `url("${d.cover}")` : ''; }
    });
    const ov = T.ovs[sideI], wv = T.wvs[sideI];
    d.draw = () => {
      const p = d.position(), dur = d.buffer ? d.buffer.duration : 0;
      time.textContent = '-' + U.fmtTime(Math.max(0, dur - p)).slice(0, 7);
      I().drawOverview(ov, d, p); I().drawZoom(wv, d, p);
      platter.style.transform = `rotate(${(p * 33.3 / 60 * 360) % 360}deg)`;
    };
    if (ov.__h) ov.removeEventListener('pointerdown', ov.__h);
    ov.__h = e => { if (!d.buffer) return; const r = ov.getBoundingClientRect(); d.seek((e.clientX - r.left) / r.width * d.buffer.duration); upd(); };
    ov.addEventListener('pointerdown', ov.__h);
    wv.onclick = null;
    const load = btn('tq-load', OS.t('Yükle'), async () => { T.open('lib'); T.loadTo = d.idx; });
    const left = sideI === 0;
    const pitchCol = el('div', { class: 'tq-pitchcol' }, range, pitch, pct);
    const sideCol = el('div', { class: 'tq-sidecol' }, sync, kl, vinyl, btn('tq-side tq-shift', 'SHIFT', () => { DJ.shift = true; }, () => { DJ.shift = false; }));
    return el('section', { class: 'tq-deck tq-' + (left ? 'l' : 'r') },
      el('header', { class: 'tq-head' }, el('b', { class: 'tq-letter' }, d.L), swap, name, key, bpm, time, load),
      el('div', { class: 'tq-mid' }, left ? pitchCol : sideCol, jog, left ? sideCol : pitchCol),
      el('div', { class: 'tq-bottom' }, el('div', { class: 'tq-transport' }, cue, play), el('div', { class: 'tq-right' }, tabs, host)));
  }

  // ---------------- Mikser ----------------
  function channel(d, ks) {
    const S = I().settings, meter = el('canvas', { class: 'tq-meter' }); d.meterCv = meter;
    const band = (b, label) => {
      const k = U.knob({ label, size: ks, exact: true, min: S.eqBands === 4 ? -40 : -26, max: 6, def: 0, value: d.eqVals[b], fmt: v => v <= -39.5 ? 'KILL' : v.toFixed(0), onchange: v => d.setEQ(b, v) });
      d['knob_' + b] = k;
      const kb = btn('tq-kill' + (d.kills[b] ? ' on' : ''), 'K', () => kb.classList.toggle('on', d.kill(b)));
      return el('div', { class: 'tq-band' }, k, kb);
    };
    const filt = U.knob({ label: 'Filtre', size: ks, exact: true, min: -1, max: 1, def: 0, value: d.filterVal || 0, fmt: v => Math.abs(v) < 0.01 ? '—' : v < 0 ? 'LP' : 'HP', onchange: v => d.setFilter(v) });
    d.filterKnob = filt;
    const fader = el('input', { type: 'range', class: 'tq-vfader', min: 0, max: 1, step: 0.005, value: d.faderVal, oninput: e => d.setFader(+e.target.value) });
    d.faderEl = fader;
    const cue = btn('tq-pfl' + (d.cueOn ? ' on' : ''), '🎧', () => { d.setCue(!d.cueOn); I().applyOut(); cue.classList.toggle('on', d.cueOn); });
    const bands = S.eqBands === 4 ? [band('high', 'Tiz'), band('himid', 'Üst Orta'), band('lomid', 'Alt Orta'), band('low', 'Bas')] : [band('high', 'Tiz'), band('mid', 'Orta'), band('low', 'Bas')];
    return el('div', { class: 'tq-ch' }, el('b', null, d.L),
      U.knob({ label: 'Trim', size: ks, exact: true, min: -12, max: 12, def: 0, value: U.gainToDb(d.trim.gain.value), fmt: v => v.toFixed(1), onchange: v => d.trim.gain.value = U.dbToGain(v) }),
      ...bands, filt, cue, el('div', { class: 'tq-fadebox' }, fader, meter));
  }
  function mixer(ks) {
    const S = I().settings, decks = DJ.decks.slice(0, S.count);
    const xf = el('input', { type: 'range', class: 'tq-xfader', min: 0, max: 1, step: 0.005, value: DJ.xfade, oninput: e => { DJ.xfade = +e.target.value; I().applyX(); }, ondblclick: e => { DJ.xfade = 0.5; e.target.value = 0.5; I().applyX(); } });
    DJ.xfEl = xf;
    const mk = U.knob({ label: 'Master', size: ks, exact: true, min: -40, max: 6, def: 0, value: U.gainToDb(I().getMaster().gain.value), fmt: v => v.toFixed(1), onchange: v => I().getMaster().gain.value = U.dbToGain(v) });
    DJ.masterKnob = mk;
    const rec = btn('tq-rec', '●', () => { I().toggleRec(rec); });
    return el('section', { class: 'tq-mixer' },
      el('div', { class: 'tq-chs' }, decks.map(d => channel(d, ks))),
      el('div', { class: 'tq-master' }, mk,
        U.knob({ label: 'Cue/Mix', size: ks, exact: true, min: 0, max: 1, def: 0.5, value: S.cueMix, fmt: v => Math.round(v * 100) + '%', onchange: v => { S.cueMix = v; I().saveSettings(); I().applyOut(); } }),
        U.knob({ label: 'Kulaklık', size: ks, exact: true, min: 0, max: 1.5, def: 0.8, value: S.cueVol, fmt: v => Math.round(v * 100) + '%', onchange: v => { S.cueVol = v; I().saveSettings(); I().applyOut(); } }), rec),
      el('div', { class: 'tq-smart' }, btn('', 'A → B', () => I().autoMix(0, 1)), btn('', 'B → A', () => I().autoMix(1, 0))),
      el('div', { class: 'tq-xrow' }, el('b', null, 'A'), xf, el('b', null, 'B')));
  }

  // ---------------- Menüler ----------------
  // Normal sekmedeki bölümlerin hepsi burada da açılır; dokunmatik boyutlarıyla.
  const PANELS = () => [
    ['lib', 'Kütüphane', () => DJ.lib.ui()], ['pads', 'Sampler', () => I().padsUI()], ['auto', 'Automix', () => DJ.auto.ui()], ['hist', 'Geçmiş', () => DJ.hist.ui()],
    ['video', 'Video', () => DJ.video.ui()], ['karaoke', 'Karaoke', () => DJ.karaoke.ui()], ['live', 'Canlı Yayın', () => DJ.live.ui()], ['light', 'Işık', () => DJ.light.ui()],
    ['dvs', 'Timecode', () => DJ.dvs.ui()], ['script', 'Script', () => DJ.script.ui()],
    ['set', 'Ayarlar', () => el('div', { class: 'dj-panel' }, I().topBar(), I().sendUI(), settingsExtra())],
  ];
  function settingsExtra() {
    const S = I().settings, sv = I().saveSettings;
    const sel = (lbl, opts, val, on) => el('label', { class: 'field' }, lbl, el('select', { onchange: e => on(e.target.value) }, opts.map(([v, l]) => el('option', { value: v, selected: String(v) === String(val) }, l))));
    return el('div', { class: 'row wrap' },
      sel('EQ', [[3, '3 bant'], [4, '4 bant izolatör']], S.eqBands, v => { S.eqBands = +v; sv(); DJ.decks.forEach(x => x.applyEqMode()); DJ.render(); }),
      sel('Fader', [['linear', 'Doğrusal'], ['rotary', 'Döner (logaritmik)'], ['fast', 'Hızlı kesme']], S.faderCurve, v => { S.faderCurve = v; sv(); DJ.decks.forEach(x => x.setFader(x.faderVal)); }),
      sel('Crossfader', [[0, 'Yumuşak eğri'], [1, 'Keskin (scratch)']], DJ.curve, v => { DJ.curve = +v; I().applyX(); }),
      sel(OS.t('Geçiş tarifi'), Object.keys(DJ.TRANS).map(id => [id, OS.t(DJ.TRANS[id].name)]), S.xRecipe || 'bass', v => { S.xRecipe = v; sv(); }),
      sel('Master FX', I().FX.map(([id, l]) => [id, l]), DJ.mfx.id, I().setMasterFx),
      el('button', { class: 'btn sm', onclick: () => OS.midiClock.dialog() }, 'MIDI Clock…'),
      U.knob({ label: 'M.FX', size: 44, exact: true, min: 0, max: 1, def: 0.5, value: DJ.mfx.amt, fmt: v => Math.round(v * 100) + '%', onchange: I().setMasterFxAmt }));
  }
  T.open = function (id) {
    const box = T.sheetEl; if (!box) return;
    if (T.sheet === id) { T.close(); return; }
    T.sheet = id; box.innerHTML = '';
    const p = PANELS().find(x => x[0] === id);
    box.append(el('div', { class: 'tq-sheet-head' }, el('b', null, OS.t(p[1])), el('span', { class: 'spacer' }), btn('tq-close', '✕', () => T.close())), el('div', { class: 'tq-sheet-body' }, p[2]()));
    box.classList.add('open');
    document.querySelectorAll('.tq-menu .tq-b').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  };
  T.close = function () { T.sheet = null; T.loadTo = null; if (T.sheetEl) { T.sheetEl.classList.remove('open'); T.sheetEl.innerHTML = ''; } document.querySelectorAll('.tq-menu .tq-b').forEach(b => b.classList.remove('on')); };

  // ---------------- Giriş / çıkış ----------------
  T.enter = function () {
    T.on = true; document.body.classList.add('dj-touch');
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
    try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => T.lock = l).catch(() => { }); } catch (e) { }
    DJ.render();
  };
  T.exit = function () {
    T.on = false; T.sheet = null; document.body.classList.remove('dj-touch');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    try { T.lock && T.lock.release(); } catch (e) { }
    DJ.decks.forEach(d => d._tqPads = null);
    DJ.render();
  };
  T.render = function (root) {
    const S = I().settings;
    if (S.count === 2) T.side = [0, 1];
    T.hosts = new Map(); T.sheet = null;
    const H = window.innerHeight, ks = H < 820 ? 30 : Math.round(U.clamp(H * 0.05, 32, 60));
    T.ovs = [el('canvas', { class: 'tq-ov' }), el('canvas', { class: 'tq-ov' })];
    T.wvs = [el('canvas', { class: 'tq-wv' }), el('canvas', { class: 'tq-wv' })];
    const menu = el('nav', { class: 'tq-menu' },
      btn('tq-exit', '✕', () => T.exit()),
      PANELS().map(([id, l]) => { const b = btn('', OS.t(l), () => T.open(id)); b.dataset.id = id; return b; }),
      el('span', { class: 'spacer' }),
      (DJ.limEl = el('span', { class: 'lim-led' }, 'LIM')),
      el('select', { class: 'tq-count', onchange: e => { S.count = +e.target.value; I().saveSettings(); DJ.render(); } }, [2, 4].map(k => el('option', { value: k, selected: k === S.count }, k + ' Deck'))),
      btn('', '⛶', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { }); }));
    const waves = el('div', { class: 'tq-waves' }, T.ovs[0], T.wvs[0], T.wvs[1], T.ovs[1]);
    T.sheetEl = el('aside', { class: 'tq-sheet' });
    const desk = el('main', { class: 'tq-desk' + (S.count === 4 ? ' four' : '') }, deckSide(0, ks), mixer(ks), deckSide(1, ks));
    root.appendChild(el('div', { class: 'tq' }, menu, waves, desk, T.sheetEl));
    DJ.renderInfo();
  };
  // Kütüphaneden dokunmatikle yükleme: "Yükle" hangi deckten açıldıysa parça oraya gider
  const toDeck0 = DJ.lib.toDeck.bind(DJ.lib);
  DJ.lib.toDeck = async function (id, di) { const r = await toDeck0(id, T.loadTo != null ? T.loadTo : di); if (T.loadTo != null) T.close(); return r; };
  let rz;
  addEventListener('resize', () => { if (!T.on || T.sheet) return; clearTimeout(rz); rz = setTimeout(() => DJ.render(), 250); });
  addEventListener('fullscreenchange', () => { if (T.on && !T.sheet) { clearTimeout(rz); rz = setTimeout(() => DJ.render(), 250); } });

  // Normal DJ sekmesi: sahne bölümleri tek sekmeli panelde
  T.extras = function () {
    const list = [['karaoke', 'Karaoke', () => DJ.karaoke.ui()], ['live', 'Canlı Yayın', () => DJ.live.ui()], ['light', 'Işık', () => DJ.light.ui()], ['dvs', 'Timecode', () => DJ.dvs.ui()], ['script', 'Script', () => DJ.script.ui()]];
    const body = el('div'), bar = el('div', { class: 'row wrap' }, el('b', null, OS.t('Sahne')));
    const show = id => { T.extra = id; body.innerHTML = ''; body.appendChild(list.find(x => x[0] === id)[2]()); bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === id)); };
    list.forEach(([id, l]) => { const b = el('button', { class: 'btn sm', onclick: () => show(id) }, OS.t(l)); b.dataset.id = id; bar.appendChild(b); });
    show(T.extra || 'karaoke');
    return el('div', { class: 'dj-panel dj-extras' }, bar, body);
  };
})(window.OS);
