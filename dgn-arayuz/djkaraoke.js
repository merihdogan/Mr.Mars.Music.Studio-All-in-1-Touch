/* Mr. Mars Music Studio · MRH DGN — karaoke: zamanlı söz (LRC), elle zamanlama, vokal azaltma,
   şarkıcı sırası, video çıkışına söz yazma */
(function (OS) {
  const U = OS.U, el = U.el, DJ = OS.ui.dj;
  const K = DJ.karaoke = { queue: [], overlay: true, vocal: 1 };

  // [mm:ss.xx] biçimi; bir satırda birden çok zaman olabilir. Zamansız metin de kabul edilir.
  K.parse = function (text) {
    const out = []; let offset = 0, timed = false;
    text.replace(/\r/g, '').split('\n').forEach(raw => {
      const off = raw.match(/^\[offset:\s*([+-]?\d+)\]/i); if (off) { offset = +off[1] / 1000; return; }
      if (/^\[[a-z]+:.*\]$/i.test(raw.trim())) return;
      const times = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
      const t = raw.replace(/\[[^\]]*\]/g, '').replace(/<[^>]*>/g, '').trim();
      if (times.length) { timed = true; times.forEach(m => out.push({ t: +m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3]) : 0), text: t })); }
      else if (t) out.push({ t: null, text: t });
    });
    const lines = timed ? out.filter(l => l.t != null).map(l => ({ t: Math.max(0, l.t - offset), text: l.text })).sort((a, b) => a.t - b.t) : out;
    return { lines, timed };
  };
  K.toLrc = lines => lines.filter(l => l.t != null).map(l => { const m = Math.floor(l.t / 60), s = l.t - m * 60; return '[' + String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0') + ']' + l.text; }).join('\n') + '\n';
  K.set = function (d, text, save) {
    d.lyrics = K.parse(text); d._lyrOf = d.loadId;
    if (save && d.libId) DJ.lib.update(d.libId, { lyrics: text });
    K.refresh && K.refresh();
  };
  // Kütüphanede kayıtlı söz parça yüklenince kendiliğinden gelir
  function sync(d) {
    if (d._lyrOf === d.loadId) return;
    d._lyrOf = d.loadId; d.lyrics = null;
    const it = d.libId && DJ.lib.items.find(x => x.id === d.libId);
    if (it && it.lyrics) d.lyrics = K.parse(it.lyrics);
  }
  const active = () => { const ds = DJ.decks.slice(0, DJ._i.settings.count); ds.forEach(sync); return ds.filter(d => d.playing && d.lyrics).sort((a, b) => b.fader.gain.value * b.xf.gain.value - a.fader.gain.value * a.xf.gain.value)[0] || ds.find(d => d.lyrics); };
  K.at = function (d, p) {
    const L = d && d.lyrics; if (!L || !L.timed) return null;
    let i = -1; for (let n = 0; n < L.lines.length; n++) { if (L.lines[n].t <= p + 0.05) i = n; else break; }
    return { i, cur: i >= 0 ? L.lines[i].text : '', next: L.lines[i + 1] ? L.lines[i + 1].text : '' };
  };
  // Video çıkışına yazı
  K.draw = function (g, W, H) {
    if (!K.overlay) return;
    const d = active(), a = d && K.at(d, d.position()); if (!a || !(a.cur || a.next)) return;
    g.save(); g.textAlign = 'center'; g.lineJoin = 'round';
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 190, W, 190);
    g.font = '700 56px Segoe UI, sans-serif'; g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(a.cur, W / 2, H - 112, W - 60); g.fillStyle = '#fff'; g.fillText(a.cur, W / 2, H - 112, W - 60);
    g.font = '400 36px Segoe UI, sans-serif'; g.fillStyle = '#a8a8a8'; g.fillText(a.next, W / 2, H - 50, W - 60);
    g.restore();
  };
  // Vokal seviyesi stem'ler üzerinden çalışır; stem yoksa önce ayrılır
  K.setVocal = async function (v) {
    K.vocal = v;
    const ds = DJ.decks.slice(0, DJ._i.settings.count);
    for (const d of ds) { if (d.buffer && !d.stems && d.stemProg == null && v < 0.99) d.makeStems(); if (d.stems) d.stemL.vocals.gain.value = v; }
  };
  // Elle zamanlama: metni çalarken her satırda dokunulur
  function tapSync(d) {
    if (!d.lyrics || !d.lyrics.lines.length) { U.toast(OS.t('Önce söz metni ekleyin')); return; }
    const L = d.lyrics.lines.map(l => ({ t: null, text: l.text }));
    let i = 0;
    const cur = el('div', { class: 'kar-cur' }), nxt = el('div', { class: 'kar-next' });
    const show = () => { cur.textContent = L[i] ? L[i].text : OS.t('Bitti'); nxt.textContent = L[i + 1] ? L[i + 1].text : ''; };
    show();
    const tap = el('button', { class: 'btn primary kar-tap', onclick: () => { if (i >= L.length) return; L[i].t = d.position(); i++; show(); } }, OS.t('Bu satır şimdi başladı'));
    U.modal(OS.t('Dokunarak zamanla'), el('div', null, el('p', { class: 'muted' }, OS.t('Parçayı çalın, her satır başlarken düğmeye dokunun.')), cur, nxt, tap),
      [{ label: 'İptal' }, { label: 'Kaydet', primary: true, onclick: () => { const done = L.filter(l => l.t != null); if (done.length) K.set(d, K.toLrc(done), true); } }]);
  }
  K.next = async function () {
    const q = K.queue.shift(); K.refresh && K.refresh(); if (!q) { U.toast(OS.t('Sıra boş')); return; }
    const ds = DJ.decks.slice(0, DJ._i.settings.count), d = ds.find(x => !x.playing) || ds[0];
    await DJ.lib.toDeck(q.id, d.idx);
    U.toast(q.singer + ' · ' + q.name, 5000);
  };
  K.ui = function () {
    const box = el('div', { class: 'dj-panel dj-kar' });
    const ds = DJ.decks.slice(0, DJ._i.settings.count);
    let deck = ds[0];
    const big = el('div', { class: 'kar-cur' }), small = el('div', { class: 'kar-next' }), list = el('div', { class: 'lib-list' });
    const deckSel = el('select', { onchange: e => { deck = ds[+e.target.value]; } }, ds.map((d, i) => el('option', { value: i }, 'Deck ' + d.L)));
    const paste = () => { const ta = el('textarea', { class: 'inp', rows: 12, style: 'width:min(560px,80vw)', placeholder: '[00:12.50] ...' }, (deck.lyrics ? (deck.lyrics.timed ? K.toLrc(deck.lyrics.lines) : deck.lyrics.lines.map(l => l.text).join('\n')) : '')); U.modal(OS.t('Söz metni'), ta, [{ label: 'İptal' }, { label: 'Kaydet', primary: true, onclick: () => K.set(deck, ta.value, true) }]); };
    const singer = el('input', { class: 'inp', placeholder: OS.t('Şarkıcı adı'), style: 'width:140px' });
    K.refresh = () => {
      list.innerHTML = '';
      K.queue.forEach((q, i) => list.appendChild(el('div', { class: 'lib-row q-row' }, el('span', { class: 'mono' }, String(i + 1)), el('b', null, q.singer), el('span', { class: 'ln' }, q.name), el('button', { class: 'btn sm', onclick: () => { K.queue.splice(i, 1); K.refresh(); } }, '✕'))));
      if (!K.queue.length) list.appendChild(el('div', { class: 'muted' }, OS.t('Sıra boş')));
    };
    K.refresh();
    box.append(
      el('div', { class: 'row wrap' }, deckSel,
        el('button', { class: 'btn sm', onclick: async () => { const [f] = await U.pickFiles('.lrc,.txt'); if (f) K.set(deck, await U.readAsText(f), true); } }, OS.t('Söz dosyası (LRC)…')),
        el('button', { class: 'btn sm', onclick: paste }, OS.t('Söz yaz / yapıştır')),
        el('button', { class: 'btn sm', onclick: () => tapSync(deck) }, OS.t('Dokunarak zamanla')),
        el('button', { class: 'btn sm', onclick: () => { if (deck.lyrics && deck.lyrics.timed) U.download(new Blob([K.toLrc(deck.lyrics.lines)], { type: 'text/plain;charset=utf-8' }), (deck.name || 'sozler') + '.lrc'); } }, OS.t('LRC indir')),
        el('label', { class: 'field' }, OS.t('Vokal'), el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: K.vocal, oninput: e => K.setVocal(+e.target.value) })),
        el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: K.overlay, onchange: e => K.overlay = e.target.checked }), OS.t('Video çıkışına yaz')),
        el('button', { class: 'btn sm', onclick: () => { DJ.video.start(); DJ.video.openOutput(); } }, OS.t('Söz ekranı'))),
      el('div', { class: 'kar-view' }, big, small),
      el('div', { class: 'row wrap' }, singer,
        el('button', { class: 'btn sm', onclick: () => { const it = DJ.lib.items.find(x => x.id === DJ.lib.sel); if (!it) { U.toast(OS.t('Kütüphaneden bir parça seçin')); return; } K.queue.push({ id: it.id, name: it.name, singer: singer.value.trim() || '—' }); singer.value = ''; K.refresh(); } }, OS.t('Seçili parçayı sıraya ekle')),
        el('button', { class: 'btn sm primary', onclick: K.next }, OS.t('Sıradakini yükle'))),
      list);
    const tick = () => {
      if (!box.isConnected) return;
      const d = active(), a = d && K.at(d, d.position());
      const t1 = a ? a.cur : d && d.lyrics && !d.lyrics.timed ? d.lyrics.lines.slice(0, 2).map(l => l.text).join(' / ') : OS.t('Söz yok'), t2 = a ? a.next : '';
      if (big.textContent !== t1) big.textContent = t1; if (small.textContent !== t2) small.textContent = t2;
      setTimeout(tick, 100);
    };
    setTimeout(tick, 0);
    return box;
  };
})(window.OS);
