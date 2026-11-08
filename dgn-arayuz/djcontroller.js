/* Mr. Mars Music Studio · MRH DGN — Controller Merkezi: bağlı cihazlar, canlı sinyal izleme, adım adım
   eşleme sihirbazı, cihaz profilleri, jog biçimi, yumuşak devralma ve genel HID desteği */
(function (OS) {
  const U = OS.U, el = U.el, DJ = OS.ui.dj;
  const C = DJ.ctrl = { log: [], hid: [] };
  const S = () => DJ._i.settings, save = () => DJ._i.saveSettings();

  // Sihirbazın sorduğu kontroller
  const deckSteps = L => [
    ['play', 'PLAY'], ['cue', 'CUE'], ['sync', 'SYNC'], ['headcue', 'Kulaklık (PFL)'], ['vol', 'Kanal faderı', 1], ['pitch', 'Tempo faderı', 1], ['jog', 'Jog üst yüzeyi (dokunup çevirin)', 1], ['jog', 'Jog kenarı (çevirin)', 1], ['jogtouch', 'Jog üstüne dokunma'],
    ['eqhigh', 'EQ Tiz', 1], ['eqmid', 'EQ Orta', 1], ['eqlow', 'EQ Bas', 1], ['filter', 'Filtre', 1], ['trim', 'Gain / Trim', 1], ['fx', 'FX 1 düğmesi', 1], ['fx2', 'FX 2 düğmesi', 1], ['fx3', 'FX 3 düğmesi', 1],
    ['hot1', 'Ped 1'], ['hot2', 'Ped 2'], ['hot3', 'Ped 3'], ['hot4', 'Ped 4'], ['hot5', 'Ped 5'], ['hot6', 'Ped 6'], ['hot7', 'Ped 7'], ['hot8', 'Ped 8'],
    ['padnext', 'Sonraki ped sayfası'], ['padprev', 'Önceki ped sayfası'], ['loopin', 'Döngü başı (IN)'], ['loopout', 'Döngü sonu (OUT)'], ['loophalf', 'Döngü ½'], ['loopdouble', 'Döngü ×2'], ['loopexit', 'Döngüden çık'],
    ['jumpback', 'Beat jump geri'], ['jumpfwd', 'Beat jump ileri'], ['keylock', 'Key Lock'], ['load', 'Seçili parçayı yükle'],
  ].map(([a, l, c]) => ({ action: L + '.' + a, label: 'Deck ' + L, what: l, cont: !!c }));
  const STEPS = n => [
    { action: 'xfader', label: 'Mikser', what: 'Crossfader', cont: true }, { action: 'master', label: 'Mikser', what: 'Master seviye', cont: true },
    { action: 'cuemix', label: 'Mikser', what: 'Cue/Master karışımı', cont: true }, { action: 'cuevol', label: 'Mikser', what: 'Kulaklık seviyesi', cont: true },
    { action: 'lib.scroll', label: 'Kütüphane', what: 'Gezinme düğmesi (çevirin)', cont: true }, { action: 'shift', label: 'Genel', what: 'SHIFT' },
    ...['A', 'B', 'C', 'D'].slice(0, n).flatMap(deckSteps),
  ];
  C.continuous = a => { const k = a.includes('.') ? a.slice(a.indexOf('.') + 1) : a; return /^(vol|pitch|jog|eq\w+|filter|trim|fx\d?|res|send[AB]|scroll|loopenc|jumpenc|jogseek)$/.test(k) || ['xfader', 'master', 'cuemix', 'cuevol', 'samplervol', 'mfx', 'xcurve'].includes(a); };

  // ---------------- Hazır tablodaki boşluklar ve eşlenmemiş kontroller ----------------
  const BASICS = [['play', 'Çal'], ['cue', 'Cue'], ['sync', 'Sync'], ['vol', 'Kanal fader'], ['pitch', 'Tempo'], ['eqhigh', 'EQ tiz'], ['eqmid', 'EQ orta'], ['eqlow', 'EQ bas'], ['jog', 'Jog']];
  C.gaps = name => {
    const m = C.presetFor(name); if (!m) return [];
    const cmds = Object.values(m), out = [];
    BASICS.forEach(([k, label]) => { if (!['A', 'B'].every(L => cmds.includes(L + '.' + k))) out.push(label); });
    if (!cmds.includes('xfader')) out.push('Crossfader');
    return out;
  };
  // Haritada karşılığı olmayan bir kontrol kullanılınca küçük bir uyarı çıkar; tıklayınca o kontrol atanır
  let chipT = 0;
  C.unmapped = key => {
    const now = performance.now(); if (now - chipT < 400) { if (C._chipKey === key) return; }
    chipT = now; C._chipKey = key;
    let chip = document.getElementById('unmapped-chip');
    if (!chip) {
      chip = el('div', { id: 'unmapped-chip', style: 'position:fixed;left:12px;bottom:64px;z-index:9999;display:flex;gap:8px;align-items:center;background:var(--bg3);border:1px solid var(--line2);border-radius:8px;padding:6px 10px;box-shadow:0 6px 20px rgba(0,0,0,.45);font-size:12px' });
      document.body.appendChild(chip);
    }
    chip.innerHTML = '';
    chip.append(el('span', null, OS.t('Eşlenmemiş kontrol') + ': '), el('b', { class: 'mono' }, key),
      el('button', { class: 'btn sm primary', onclick: () => { chip.remove(); C.last = key; C.open(); setTimeout(() => { C.last = key; if (C.drawAssign) C.drawAssign(); }, 60); } }, OS.t('Ata')),
      el('button', { class: 'btn sm', onclick: () => { chip.remove(); C.mutedUnmapped = true; } }, '×'));
    if (C.mutedUnmapped) chip.remove();
    clearTimeout(C._chipHide); C._chipHide = setTimeout(() => chip.remove(), 6000);
  };

  // ---------------- Canlı sinyal izleme ----------------
  DJ.monitor = function (key, data) {
    C.last = key; if (C.drawAssign) C.drawAssign(); C.flash(key);
    C.log.unshift({ key, hex: data ? [...data].map(x => x.toString(16).padStart(2, '0')).join(' ') : '', action: S().map[key] || '' });
    if (C.log.length > 12) C.log.length = 12;
    if (C.drawLog) C.drawLog();
  };

  // ---------------- Cihaz profilleri: cihaz takılınca kendi eşlemesi yüklenir ----------------
  const midiIns = () => OS.midiAccess ? [...OS.midiAccess.inputs.values()] : [];
  const midiOuts = () => OS.midiAccess ? [...OS.midiAccess.outputs.values()] : [];
  // Hazır eşleme: cihazın bildirdiği addaki kelime dizileri özetlenip tabloda aranır
  const fnv = t => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const presetIdx = name => {
    const P = DJ.PRESETS; if (!P || !name) return null;
    const w = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (let i = 0; i < w.length; i++) for (let j = w.length; j > i; j--) { const k = P.ids[fnv(w.slice(i, j).join(''))]; if (k != null) return k; }
    return null;
  };
  C.presetFor = name => { const k = presetIdx(name); return k == null ? null : Object.fromEntries(DJ.PRESETS.maps[k].split(',').map(x => x.split('='))); };
  // Dönüşü olmayan bir düğmeye bağlanmış jog çalışamaz: dokunma olarak düzeltilir
  const repair = m => { Object.keys(m).forEach(k => { if (/\.jog$/.test(m[k]) && !/^(cc|pb|hid):/.test(k)) { const t = m[k] + 'touch'; if (Object.values(m).includes(t)) delete m[k]; else m[k] = t; } }); return m; };
  C.applyPreset = (name, keepUser) => {
    const s = S(), p = C.presetFor(name); if (!p) return false;
    s.profiles = s.profiles || {};
    const user = keepUser && s.profiles[name] ? repair(Object.assign({}, s.profiles[name])) : {};
    const m = Object.assign({}, p);
    // Tablo güncellenince kullanıcının kendi atamaları korunur
    const upgrade = keepUser && s.presetDone && s.presetDone[name];
    Object.keys(user).forEach(k => { if (upgrade || !p[k]) { const a = user[k]; if (upgrade || !Object.values(p).includes(a)) m[k] = a; } });
    s.profiles[name] = m; s.map = Object.assign({}, m); s.activeProfile = name;
    s.presetDone = s.presetDone || {}; s.presetDone[name] = DJ.PRESETS.ver;
    s.pitchInv = (DJ.PRESETS.inv || []).includes(presetIdx(name));
    save(); return true;
  };
  C.mapChanged = () => { const s = S(); if (s.activeProfile && s.profiles && s.profiles[s.activeProfile]) s.profiles[s.activeProfile] = Object.assign({}, s.map); save(); if (C.drawMenu) C.drawMenu(); };
  // Cihaz menüsünde görünen ek komutlar
  const MODES = { hot: 'Hot Cue', loop2: 'Döngü+ (1/32-128)', slicer: 'Slicer', keycue: 'Key Cue', roll: 'Loop Roll', stemfx: 'Stem + FX', jump: 'Beat Jump' };
  const EXTRA = { slip: 'Slip', quant: 'Quantize', vinyl: 'Vinyl', loopenc: 'Döngü düğmesi', loopauto: 'Döngü aç/kapa', brake: 'Fren', spin: 'Spinback', reverse: 'Ters', tap: 'TAP', keyup: 'Ton +', keydown: 'Ton −', stutter: 'Stutter', tostart: 'Başa dön', keymatch: 'Key Match', jumpenc: 'Beat jump düğmesi', jogseek: 'Hızlı arama (jog)', jogtouchs: 'Jog dokunma (SHIFT)', loophalf: 'Döngü ½', loopdouble: 'Döngü ×2' };
  const GLOBAL = { xcurve: 'Crossfader eğrisi', xenable: 'Crossfader aç/kapa', smartmix: 'Akıllı geçiş', mfx0: 'Master FX kapalı', mfx1: 'Master FX: Echo', mfx2: 'Master FX: Reverb', mfx3: 'Master FX: Flanger', mfx4: 'Master FX: Gater' };
  C.label = a => {
    if (a === 'automix') return 'Automix';
    if (GLOBAL[a]) return OS.t(GLOBAL[a]);
    if (a === 'lib.down') return OS.t('Kütüphane: sonraki parça');
    if (/^pad\d+$/.test(a)) return 'Sampler ' + a.slice(3);
    const k = a.includes('.') ? a.slice(a.indexOf('.') + 1) : a;
    if (k === 'jog') return OS.t('Jog tekerleği');
    if (k.startsWith('padm_')) return OS.t('Ped modu') + ': ' + OS.t(MODES[k.slice(5)] || k.slice(5));
    if (EXTRA[k]) return OS.t(EXTRA[k]);
    const st = STEPS(4).find(x => x.action === a);
    return st ? OS.t(st.what) : a;
  };
  // Bağlı cihazın kendi kontrolleri: eşlemede olanlar bölüm bölüm listelenir
  C.groups = () => {
    const map = S().map, by = {};
    Object.keys(map).forEach(k => { const a = map[k], g = /^[ABCD]\./.test(a) ? 'Deck ' + a[0] : /^pad/.test(a) ? 'Sampler' : 'Mikser'; ((by[g] = by[g] || {})[a] = by[g][a] || []).push(k); });
    return ['Mikser', 'Deck A', 'Deck B', 'Deck C', 'Deck D', 'Sampler'].filter(g => by[g]).map(g => [g, by[g]]);
  };
  C.connected = () => { const s = S(); return s.activeProfile && (midiIns().some(i => i.name === s.activeProfile) || C.hid.some(h => h.name === s.activeProfile)) ? s.activeProfile : null; };
  // Düğme sırası: cihazda hangi kontrol varsa bölümünde sırayla
  const order = a => { const k = a.includes('.') ? a.slice(a.indexOf('.') + 1) : a, seq = ['play', 'cue', 'sync', 'headcue', 'load', 'jog', 'jogtouch', 'vol', 'pitch', 'trim', 'eqhigh', 'eqmid', 'eqlow', 'filter']; const i = seq.indexOf(k); return i < 0 ? 99 : i; };
  // Controller'ın kendi ses kartı: master 1-2, kulaklık 3-4
  C.useDeviceAudio = async name => {
    try {
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      const dev = outs.find(d => d.label.toLowerCase().includes(name.toLowerCase()));
      if (!dev) { U.toast(OS.t('Cihazın ses çıkışı bulunamadı. Araçlar > Ses ayarları’ndan seçin.'), 5000); return false; }
      const ctx = OS.engine.ctx;
      if (!ctx.setSinkId) { U.toast(OS.t('Bu tarayıcı çıkış seçmeyi desteklemiyor.'), 5000); return false; }
      await ctx.setSinkId(dev.deviceId);
      OS.settings.outputId = dev.deviceId; try { localStorage.setItem('os.settings', JSON.stringify(OS.settings)); } catch (e) { }
      const s = S(); s.cueMode = ctx.destination.maxChannelCount >= 4 ? 'quad' : 'off'; save();
      if (DJ._i.isBuilt()) { DJ._i.applyOut(); DJ.render(); }
      U.toast(OS.t(s.cueMode === 'quad' ? 'Cihaz ses kartı seçildi: kulaklık ayrı' : 'Cihaz ses kartı seçildi'), 4000);
      return true;
    } catch (e) { U.toast(e.message, 5000); return false; }
  };
  function deviceMenu(box) {
    C.drawMenu = () => {
      if (!box.isConnected && C._menuDrawn) { C.drawMenu = null; return; }
      C._menuDrawn = true; box.innerHTML = '';
      const name = C.connected(), n = Object.keys(S().map).length;
      if (!n) { box.appendChild(el('div', { class: 'muted' }, OS.t('Bu cihaz için henüz eşleme yok. Sihirbazla bir kez eşleyin.'))); return; }
      const count = Object.keys(C.groups().reduce((o, [g]) => (g.startsWith('Deck') ? (o[g] = 1, o) : o), {})).length;
      box.appendChild(el('div', { class: 'dev-head' }, el('b', null, name || OS.t('Kayıtlı eşleme')), el('span', { class: 'muted' }, new Set(Object.values(S().map)).size + ' ' + OS.t('kontrol') + ' · ' + count + ' deck'), el('span', { class: 'muted' }, OS.t('Dokunduğunuz kontrol burada parlar.'))));
      const wrap = el('div', { class: 'dev-groups' });
      C.groups().forEach(([g, acts]) => {
        const col = el('div', { class: 'dev-col' }, el('h4', null, OS.t(g)));
        Object.keys(acts).sort((a, b) => order(a) - order(b) || a.localeCompare(b, undefined, { numeric: true })).forEach(a => {
          const pending = DJ.learn && DJ.pending === a;
          const row = el('button', { class: 'dev-row' + (pending ? ' pending' : ''), title: acts[a].join(', '), onclick: () => { DJ.learn = true; DJ.pending = a; C.menuLearn = true; C.drawMenu(); } }, el('span', null, C.label(a)), el('span', { class: 'mono muted' }, pending ? OS.t('Dokunun') : acts[a].length > 1 ? acts[a].length + '×' : ''));
          row.dataset.keys = '|' + acts[a].join('|') + '|';
          col.appendChild(row);
        });
        wrap.appendChild(col);
      });
      box.appendChild(wrap);
      box.appendChild(el('div', { class: 'muted' }, OS.t('Değiştirmek için satıra tıklayın, sonra cihazda yeni kontrole dokunun.')));
      if (name && navigator.mediaDevices) box.appendChild(el('div', { class: 'row wrap' }, el('button', { class: 'btn sm', title: OS.t('Master ve kulaklık bu cihazdan çıkar'), onclick: () => C.useDeviceAudio(name) }, OS.t('Cihazın ses kartını kullan'))));
    };
    C.drawMenu();
  }
  // Donanımda dokunulan kontrol menüde parlar
  C.flash = key => { document.querySelectorAll('.dev-row').forEach(r => { if (r.dataset.keys.includes('|' + key + '|')) { r.classList.add('hit'); clearTimeout(r._t); r._t = setTimeout(() => r.classList.remove('hit'), 300); } }); };
  function recognised(name) {
    if (banner || !C.groups) return;
    const n = new Set(Object.values(S().map)).size, done = () => { if (banner) { banner.remove(); banner = null; setTimeout(C.checkNew, 300); } };
    banner = el('div', { class: 'ctrl-banner' },
      el('div', null, el('b', null, name), el('div', { class: 'muted' }, OS.t('Cihaz tanındı') + ' · ' + n + ' ' + OS.t('kontrol'))),
      el('button', { class: 'btn sm primary', onclick: () => { done(); OS.ui.showView('dj'); setTimeout(() => C.open(), 100); } }, OS.t('Cihaz menüsü')),
      el('button', { class: 'btn sm', onclick: done }, OS.t('Tamam')));
    document.body.appendChild(banner);
    const b = banner; setTimeout(() => { if (banner === b) done(); }, 12000);
  }
  C.saveProfile = name => { const s = S(); s.profiles = s.profiles || {}; s.profiles[name] = Object.assign({}, s.map); save(); U.toast(OS.t('Profil kaydedildi') + ': ' + name); };
  C.loadProfile = name => { const s = S(), m = s.profiles && s.profiles[name]; if (!m) return false; s.map = repair(Object.assign({}, m)); s.profiles[name] = Object.assign({}, s.map); s.activeProfile = name; save(); return true; };
  function autoProfile() {
    const s = S();
    const known = midiIns().find(i => C.presetFor(i.name) && !(s.presetDone && s.presetDone[i.name] === DJ.PRESETS.ver));
    if (known) { C.applyPreset(known.name, true); if (DJ._i.isBuilt()) DJ.render(); recognised(known.name); return; }
    if (!s.profiles) return;
    const dev = midiIns().find(i => s.profiles[i.name]) || C.hid.find(h => s.profiles[h.name]);
    if (dev && s.activeProfile !== dev.name) { C.loadProfile(dev.name); U.toast(OS.t('Controller profili yüklendi') + ': ' + dev.name); if (DJ._i.isBuilt()) DJ.render(); }
  }
  // Profili olmayan yeni cihaz takılınca eşleme önerilir; sanal portlar için sorulmaz
  const VIRTUAL = /through|loopback|loopmidi|virtual|microsoft|\biac\b/i;
  const asked = new Set();
  let banner = null, checkT = null;
  C.checkNew = function () {
    const s = S();
    if (banner || C.wizardOn || document.querySelector('.ctrl-center')) return;
    const names = midiIns().map(i => i.name).concat(C.hid.map(h => h.name));
    const name = names.find(n => n && !VIRTUAL.test(n) && !asked.has(n) && !(s.profiles && s.profiles[n]) && !(s.noAsk || []).includes(n));
    if (!name) return;
    asked.add(name);
    const close = () => { if (banner) { banner.remove(); banner = null; setTimeout(C.checkNew, 300); } };
    banner = el('div', { class: 'ctrl-banner' },
      el('div', null, el('b', null, name), el('div', { class: 'muted' }, OS.t('Yeni cihaz bağlandı. DJ controller ise düğmelerini bir kez eşleyelim.'))),
      el('button', { class: 'btn sm primary', onclick: () => { close(); OS.ui.showView('dj'); setTimeout(() => C.open(name), 100); } }, OS.t('Eşle')),
      el('button', { class: 'btn sm', onclick: close }, OS.t('Şimdi değil')),
      el('button', { class: 'btn sm', onclick: () => { s.noAsk = (s.noAsk || []).concat(name); save(); close(); } }, OS.t('Bir daha sorma')));
    document.body.appendChild(banner);
  };
  const devicesChanged = () => { autoProfile(); if (C.drawDevices) C.drawDevices(); clearTimeout(checkT); checkT = setTimeout(C.checkNew, 800); };
  let bound = null;
  setInterval(() => {
    if (OS.midiAccess && OS.midiAccess !== bound) { bound = OS.midiAccess; bound.addEventListener('statechange', devicesChanged); devicesChanged(); }
  }, 1000);

  // ---------------- Genel HID: düğmeler bit, faderler bayt olarak öğrenilir ----------------
  C.hidSupported = () => !!navigator.hid;
  function attachHid(dev) {
    if (C.hid.some(h => h.dev === dev)) return;
    const h = { dev, name: dev.productName || 'HID', id: dev.vendorId.toString(16) + '_' + dev.productId.toString(16), last: {}, noisy: {}, t0: performance.now() };
    C.hid.push(h);
    dev.addEventListener('inputreport', e => onReport(h, e));
  }
  function onReport(h, e) {
    const rid = e.reportId, b = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), prev = h.last[rid];
    h.last[rid] = b.slice();
    if (!prev) return;
    const calibrating = performance.now() - h.t0 < 1500;
    for (let i = 0; i < b.length; i++) {
      if (b[i] === prev[i]) continue;
      const bk = rid + ':' + i;
      if (calibrating) { h.noisy[bk] = true; continue; } // dokunulmadan değişen baytlar (sayaç, sensör) yok sayılır
      if (h.noisy[bk]) continue;
      const base = 'hid:' + h.id + ':' + bk, byteKey = base, map = S().map, pend = DJ.learn && DJ.pending;
      // jog / sürekli kontrol
      if ((pend && C.continuous(DJ.pending)) || map[byteKey]) {
        const act = pend ? DJ.pending : map[byteKey], isJog = /\.jog$|^lib\.scroll$/.test(act);
        if (isJog) { let dl = b[i] - prev[i]; if (dl > 127) dl -= 256; if (dl < -127) dl += 256; DJ.input(byteKey, 0.5, dl < 0 ? 128 + Math.max(dl, -63) : Math.min(dl, 63), false, false, true); }
        else DJ.input(byteKey, b[i] / 255, b[i] >> 1, false, false, true);
        continue;
      }
      // düğmeler
      const xor = b[i] ^ prev[i];
      for (let bit = 0; bit < 8; bit++) {
        if (!(xor & (1 << bit))) continue;
        const on = !!(b[i] & (1 << bit));
        DJ.input(base + ':' + bit, on ? 1 : 0, on ? 127 : 0, on, !on, false);
      }
    }
  }
  C.addHid = async function () {
    try {
      const list = await navigator.hid.requestDevice({ filters: [] });
      for (const dev of list) { if (!dev.opened) await dev.open(); attachHid(dev); }
      devicesChanged();
    } catch (e) { U.toast(OS.t('HID cihazı açılamadı') + ': ' + e.message); }
  };
  if (navigator.hid) {
    navigator.hid.getDevices().then(async list => { for (const dev of list) { try { if (!dev.opened) await dev.open(); attachHid(dev); } catch (e) { } } devicesChanged(); }).catch(() => { });
    navigator.hid.addEventListener('disconnect', e => { C.hid = C.hid.filter(h => h.dev !== e.device); if (C.drawDevices) C.drawDevices(); });
  }

  // ---------------- Sihirbaz ----------------
  function wizard(body, onDone) {
    const steps = STEPS(S().count); let i = 0, timer = null;
    C.wizardOn = true;
    const finish = () => { clearInterval(timer); DJ.learn = false; DJ.pending = null; C.wizardOn = false; onDone(); };
    const title = el('div', { class: 'wiz-title' }), prog = el('div', { class: 'muted' });
    const show = () => {
      if (i >= steps.length) { finish(); return; }
      const st = steps[i]; DJ.learn = true; DJ.pending = st.action;
      title.textContent = OS.t(st.label) + ': ' + OS.t(st.what);
      prog.textContent = (i + 1) + ' / ' + steps.length + ' · ' + OS.t(st.cont ? 'Kontrolü hareket ettirin' : 'Düğmeye basın');
    };
    body.innerHTML = '';
    body.append(title, prog, el('div', { class: 'row wrap' },
      el('button', { class: 'btn sm', onclick: () => { i++; show(); } }, 'Bu kontrol yok, atla'),
      el('button', { class: 'btn sm', onclick: () => { i = Math.max(0, i - 1); show(); } }, 'Geri'),
      el('button', { class: 'btn sm', onclick: () => { const g = steps[i].label; while (i < steps.length && steps[i].label === g) i++; show(); } }, 'Bu bölümü atla'),
      el('button', { class: 'btn sm primary', onclick: finish }, 'Bitir')));
    timer = setInterval(() => { if (!body.isConnected) { finish(); return; } if (DJ.pending == null && i < steps.length) { i++; show(); } }, 80);
    show();
  }

  // ---------------- Pencere ----------------
  C.open = function (forDevice) {
    const s = S(), devices = el('div', { class: 'ctrl-list' }), logBox = el('div', { class: 'ctrl-log mono' }), wizBox = el('div', { class: 'ctrl-wiz' });
    // takılan cihazdan başlatılınca eşleme bitişte o cihazın profiline kaydedilir
    const startWizard = dev => wizard(wizBox, () => {
      if (dev && Object.keys(S().map).length) { C.saveProfile(dev); S().activeProfile = dev; save(); }
      wizBox.innerHTML = '';
      if (wizBox.isConnected) wizBox.appendChild(el('div', { class: 'muted' }, OS.t(dev ? 'Eşleme tamamlandı ve bu cihaza kaydedildi.' : 'Eşleme tamamlandı. Yukarıdan “Profil kaydet” ile cihaza kaydedin.')));
      if (C.drawDevices) C.drawDevices();
      DJ.render();
    });
    C.drawDevices = () => {
      if (!devices.isConnected && C._drawn) { C.drawDevices = null; return; }
      C._drawn = true; devices.innerHTML = '';
      const row = (name, kind, out) => el('div', { class: 'lib-row q-row' }, el('span', { class: 'mono' }, kind), el('span', { class: 'ln' }, name), el('span', { class: 'muted' }, out ? OS.t('Işık çıkışı var') : ''),
        el('button', { class: 'btn sm', onclick: () => C.saveProfile(name) }, 'Profil kaydet'),
        (s.profiles && s.profiles[name]) ? el('button', { class: 'btn sm', onclick: () => { C.loadProfile(name); U.toast(OS.t('Profil yüklendi')); } }, 'Profili yükle') : null,
        C.presetFor(name) ? el('button', { class: 'btn sm', title: OS.t('Kendi değişikliklerinizi silip cihazın hazır eşlemesine döner'), onclick: () => { C.applyPreset(name, false); U.toast(OS.t('Hazır eşleme yüklendi')); C.drawAssign && C.drawAssign(); DJ.render(); } }, 'Hazır eşlemeye dön') : null);
      midiIns().forEach(i => { devices.appendChild(row(i.name, 'MIDI', midiOuts().some(o => o.name === i.name))); const g = C.gaps(i.name); if (g.length) devices.appendChild(el('div', { class: 'muted', style: 'font-size:12px;padding:0 6px 6px' }, OS.t('Bu modelin hazır tablosunda olmayanlar') + ': ' + g.map(x => OS.t(x)).join(', ') + '. ' + OS.t('Cihazda bu kontrole dokunup aşağıdan atayın; atama cihaza kaydedilir.'))); });
      C.hid.forEach(h => devices.appendChild(row(h.name, 'HID')));
      if (!midiIns().length && !C.hid.length) devices.appendChild(el('div', { class: 'muted' }, OS.t(OS.midiAccess ? 'Bağlı controller yok. USB’yi takın; liste kendiliğinden yenilenir.' : !navigator.requestMIDIAccess ? 'Bu tarayıcı MIDI desteklemiyor. iPhone ve iPad’de hiçbir tarayıcıda yoktur; Mac’te Safari’de de yoktur.' : 'MIDI izni verilmedi veya tarayıcı desteklemiyor.')));
    };
    C.drawLog = () => {
      if (!logBox.isConnected && C._logDrawn) { C.drawLog = null; return; }
      C._logDrawn = true;
      logBox.innerHTML = '';
      if (!C.log.length) logBox.appendChild(el('div', { class: 'muted' }, OS.t('Controller’da bir kontrole dokunun; sinyal burada görünür.')));
      C.log.forEach(l => logBox.appendChild(el('div', null, l.key + (l.hex ? '  [' + l.hex + ']' : '') + (l.action ? '  → ' + l.action : ''))));
    };
    // Kullanıcı ataması: cihazda bir kontrole dokunun, listeden istediği komutu seçin
    const assignBox = el('div', { class: 'row wrap' });
    const ACTIONS = () => { const seen = new Set(), extra = ['A', 'B', 'C', 'D'].slice(0, S().count).flatMap(L => [...Object.keys(EXTRA), ...Object.keys(MODES).map(m => 'padm_' + m)].map(k => ({ action: L + '.' + k, label: 'Deck ' + L, what: C.label(L + '.' + k) }))); return [...STEPS(S().count), ...extra, ...[...Object.keys(GLOBAL), 'automix'].map(k => ({ action: k, label: 'Mikser', what: C.label(k) }))].filter(x => !seen.has(x.action) && seen.add(x.action)); };
    C.drawAssign = () => {
      if (!assignBox.isConnected && C._asDrawn) { C.drawAssign = null; return; }
      C._asDrawn = true; assignBox.innerHTML = '';
      if (!C.last) { assignBox.appendChild(el('span', { class: 'muted' }, OS.t('Cihazda değiştirmek istediğiniz kontrole dokunun.'))); return; }
      const cur = S().map[C.last] || '';
      const sel = el('select', { onchange: e => { const m = S().map; if (e.target.value) m[C.last] = e.target.value; else delete m[C.last]; C.mapChanged(); DJ.render(); if (C.drawLog) C.drawLog(); } },
        el('option', { value: '' }, OS.t('Atama yok')), ACTIONS().map(a => el('option', { value: a.action, selected: a.action === cur }, OS.t(a.label) + ' · ' + OS.t(a.what))),
        cur && !ACTIONS().some(a => a.action === cur) ? el('option', { value: cur, selected: true }, cur) : null);
      assignBox.append(el('span', { class: 'mono' }, C.last), sel);
    };
    const menuBox = el('div', { class: 'dev-menu' });
    const body = el('div', { class: 'ctrl-center' },
      el('b', null, OS.t('Bağlı cihazlar')), devices,
      el('b', null, OS.t('Cihaz menüsü')), menuBox,
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn sm primary', onclick: () => startWizard() }, 'Eşleme sihirbazını başlat'),
        el('button', { class: 'btn sm', title: OS.t('Ekranda bir kontrole tıklayın, sonra cihazda ilgili kontrole dokunun'), onclick: () => { document.querySelectorAll('.modal-back').forEach(x => x.remove()); DJ.learn = true; DJ.pending = null; DJ.render(); } }, 'MIDI Öğren (controller)'),
        el('button', { class: 'btn sm', onclick: e => DJ._i.midiMenu(e) }, 'Eşleme ▾'),
        C.hidSupported() ? el('button', { class: 'btn sm', title: OS.t('MIDI modu olmayan controller için. Cihaz seçildikten sonra 2 saniye dokunmayın.'), onclick: C.addHid }, 'HID cihazı ekle (deneysel)') : null),
      wizBox,
      el('b', null, OS.t('Ayarlar')),
      el('div', { class: 'form-grid' },
        OS.t('Jog / enkoder biçimi'), el('select', { onchange: e => { s.jogMode = e.target.value; save(); } }, [['auto', 'Otomatik'], ['twos', 'İkiye tümleyen (1…63 / 127…65)'], ['offset', 'Merkez 64 (63 / 65)'], ['sign', 'İşaret biti (1…63 / 65…127)']].map(([v, l]) => el('option', { value: v, selected: v === (s.jogMode || 'auto') }, l))),
        OS.t('Jog hassasiyeti'), el('input', { type: 'range', min: 0.25, max: 4, step: 0.05, value: s.jogSens || 1, oninput: e => { s.jogSens = +e.target.value; save(); } }),
        OS.t('Tempo faderi yönü'), el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: !!s.pitchInv, onchange: e => { s.pitchInv = e.target.checked; save(); } }), OS.t('Ters çevir')),
        OS.t('Yumuşak devralma'), el('label', { class: 'field', title: OS.t('Fader ekrandaki değere ulaşana kadar ses sıçramaz') }, el('input', { type: 'checkbox', checked: !!s.soft, onchange: e => { s.soft = e.target.checked; save(); } }), OS.t('Fader ve tempo için açık'))),
      el('b', null, OS.t('Kontrol ata')), assignBox,
      el('b', null, OS.t('Canlı sinyal')), logBox,
      el('b', null, OS.t('Bilgisayar klavyesi')),
      el('div', { class: 'form-grid' }, DJ.KEY_HELP.flatMap(([k, d]) => [el('span', { class: 'mono' }, k), OS.t(d)])),
      el('p', { class: 'muted' }, 'USB’den standart MIDI gönderen controller’lar sürücü veya lisans istemeden çalışır. Yaygın modeller takılınca tanınır ve hazır eşlemesi yüklenir; diğerleri sihirbazla bir kez eşlenir. Hazır eşlemeler her cihazda denenmedi; çalışmayan kontrolü yukarıdan değiştirebilirsiniz. Bazı modeller önce üreticinin sürücüsünü veya bir MIDI moduna geçirilmeyi ister. Yalnızca kendi HID protokolünü kullanan modellerde deneysel HID yolu dener; ışıklar ve yüksek çözünürlüklü jog bu yolda çalışmaz.'));
    C.log.length = 0; C._drawn = false; C._logDrawn = false; C._asDrawn = false; C.last = null;
    const m = U.modal(OS.t('Controller Merkezi'), body, [{ label: 'Kapat', onclick: () => { DJ.learn = false; DJ.pending = null; C.menuLearn = false; } }]);
    C.drawDevices(); C.drawLog(); C.drawAssign(); C._menuDrawn = false; deviceMenu(menuBox);
    if (forDevice) startWizard(forDevice);
    return m;
  };
})(window.OS);
