/* Mr. Mars Music Studio · MRH DGN — proje sürüm geçmişi
   Her kayıt projenin içinde bir sürüm olarak tutulur. Eski bir sürüme dönülüp kaydedilirse yeni bir dal açılır.
   Sürümler ses dosyalarını paylaşır: her sürüm yalnız proje verisi kadar yer kaplar. */
(function (OS) {
  const U = OS.U, el = U.el;
  const V = OS.versions = {};
  const key = name => 'ver:' + name;
  const MAX = 200;

  V.list = async function (name) {
    try { const s = await OS.store.get('kv', key(name)); return s ? JSON.parse(s) : []; } catch (e) { return []; }
  };
  const save = (name, arr) => OS.store.put('kv', key(name), JSON.stringify(arr));

  /** İki proje verisi arasındaki farkı kısa cümlelerle anlatır. */
  V.describe = function (a, b) {
    if (!a) return [OS.t('İlk kayıt')];
    const out = [];
    const ta = new Map((a.tracks || []).map(t => [t.id, t])), tb = new Map((b.tracks || []).map(t => [t.id, t]));
    tb.forEach((t, id) => { if (!ta.has(id)) out.push(OS.t('Eklendi') + ': ' + t.name); });
    ta.forEach((t, id) => { if (!tb.has(id)) out.push(OS.t('Silindi') + ': ' + t.name); });
    tb.forEach((t, id) => {
      const o = ta.get(id); if (!o) return;
      if (o.name !== t.name) out.push(o.name + ' → ' + t.name);
      const dc = (t.clips || []).length - (o.clips || []).length;
      if (dc) out.push((dc > 0 ? '+' : '') + dc + ' ' + OS.t('klip') + ' (' + t.name + ')');
      const nn = c => (c.clips || []).reduce((s, x) => s + (x.notes ? x.notes.length : 0), 0);
      const dn = nn(t) - nn(o);
      if (dn && !dc) out.push((dn > 0 ? '+' : '') + dn + ' ' + OS.t('nota') + ' (' + t.name + ')');
      const di = (t.inserts || []).length - (o.inserts || []).length;
      if (di) out.push((di > 0 ? '+' : '') + di + ' ' + OS.t('efekt') + ' (' + t.name + ')');
      if (Math.abs((o.vol || 0) - (t.vol || 0)) >= 0.5) out.push(t.name + ' ' + OS.t('ses') + ' ' + (o.vol || 0).toFixed(1) + ' → ' + (t.vol || 0).toFixed(1) + ' dB');
    });
    if (a.bpm !== b.bpm) out.push(OS.t('Tempo') + ' ' + (+a.bpm).toFixed(2) + ' → ' + (+b.bpm).toFixed(2));
    if (String(a.sig) !== String(b.sig)) out.push(OS.t('Ölçü') + ' ' + a.sig.join('/') + ' → ' + b.sig.join('/'));
    const sa = (a.sections || []).length, sb = (b.sections || []).length;
    if (sa !== sb) out.push((sb > sa ? '+' : '') + (sb - sa) + ' ' + OS.t('bölüm'));
    if ((a.master && a.master.inserts || []).length !== (b.master && b.master.inserts || []).length) out.push(OS.t('Master efektleri değişti'));
    return out.length ? out : [OS.t('Küçük değişiklikler')];
  };

  /** Adlı kaydın hemen ardından çağrılır. */
  V.record = async function (name, note) {
    const data = OS.serialize();
    const arr = await V.list(name);
    const parentId = OS.project._ver && arr.find(v => v.id === OS.project._ver) ? OS.project._ver : (arr.length ? arr[arr.length - 1].id : null);
    const parent = arr.find(v => v.id === parentId);
    const json = JSON.stringify(data);
    if (parent && parent.data === json && !note) return parent.id;   // değişiklik yoksa yeni sürüm açılmaz
    const v = { id: U.uid(), t: Date.now(), parent: parentId, note: note || '', star: false, summary: V.describe(parent ? JSON.parse(parent.data) : null, data), data: json };
    arr.push(v);
    // Sınır: adsız, yıldızsız en eski sürümler silinir
    while (arr.length > MAX) { const i = arr.findIndex(x => !x.star && !x.note); if (i < 0) break; arr.splice(i, 1); }
    await save(name, arr);
    OS.project._ver = v.id;
    return v.id;
  };

  V.bufferIds = async function () {
    const used = new Set();
    for (const k of await OS.store.keys('kv')) {
      if (!String(k).startsWith('ver:')) continue;
      (JSON.parse(await OS.store.get('kv', k)) || []).forEach(v => { try { JSON.parse(v.data).tracks.forEach(t => t.clips.forEach(c => c.bufferId && used.add(c.bufferId))); } catch (e) { } });
    }
    return used;
  };

  async function open(name, v, asCopy) {
    const data = JSON.parse(v.data);
    await OS.store.loadBuffersFor(data);
    if (asCopy) data.name = name + ' (' + new Date(v.t).toLocaleString() + ')';
    OS.loadProject(data); OS.history.clear();
    OS.project._ver = asCopy ? null : v.id;
    if (asCopy) { await OS.store.saveNamed(data.name); await V.record(data.name, OS.t('Kopya olarak açıldı')); }
    U.toast(OS.t('Sürüm açıldı'));
  }

  /** Dal yapısı: her sürüm ebeveyninin altında, en yenisi üstte. */
  function order(arr) {
    const kids = new Map(); arr.forEach(v => { const p = v.parent || '_'; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(v); });
    const out = [];
    const walk = (p, depth) => (kids.get(p) || []).slice().sort((x, y) => y.t - x.t).forEach(v => { out.push({ v, depth }); walk(v.id, depth + (kids.get(p).length > 1 ? 1 : 0)); });
    walk('_', 0);
    const seen = new Set(out.map(x => x.v.id));
    arr.filter(v => !seen.has(v.id)).forEach(v => out.push({ v, depth: 0 }));   // ebeveyni silinmiş sürümler
    return out.sort((a, b) => b.v.t - a.v.t);
  }

  V.dialog = async function () {
    const name = OS.project.name;
    let arr = await V.list(name), onlyStar = false;
    const box = el('div', { class: 'vers' });
    const render = () => {
      box.innerHTML = '';
      const rows = order(arr).filter(x => !onlyStar || x.v.star);
      if (!rows.length) { box.appendChild(el('div', { class: 'nt' }, OS.t('Henüz sürüm yok. Projeyi kaydettiğinizde (Ctrl+S) her kayıt burada bir sürüm olur.'))); return; }
      rows.forEach(({ v, depth }) => {
        const prev = arr.find(x => x.id === v.parent);
        const branch = prev && arr.some(x => x !== v && x.parent === v.parent);
        box.appendChild(el('div', { class: 'vr' + (OS.project._ver === v.id ? ' cur' : ''), style: { marginLeft: depth * 14 + 'px' } },
          el('span', { class: 'star' + (v.star ? ' on' : ''), title: OS.t('Yıldızla'), onclick: async () => { v.star = !v.star; await save(name, arr); render(); } }, '★'),
          el('span', { class: 'tm' }, new Date(v.t).toLocaleString()),
          el('span', { class: 'sm' }, (v.name ? v.name + ' · ' : '') + v.summary.join(' · '), v.note ? el('div', { class: 'nt' }, v.note) : null, branch ? el('div', { class: 'br' }, '↳ ' + OS.t('dal')) : null),
          el('button', { class: 'btn sm', onclick: async () => { m.close(); await open(name, v, false); } }, OS.t('Aç')),
          el('button', { class: 'btn sm', title: OS.t('Ayrı bir proje olarak aç'), onclick: async () => { m.close(); await open(name, v, true); } }, OS.t('Kopya')),
          el('button', { class: 'btn sm', title: OS.t('Ad ve not'), onclick: async () => { const n = await U.prompt(OS.t('Sürüm notu'), v.note); if (n != null) { v.note = n; await save(name, arr); render(); } } }, '✎'),
          el('button', { class: 'btn sm danger', title: OS.t('Sil'), onclick: async () => { arr = arr.filter(x => x !== v); arr.forEach(x => { if (x.parent === v.id) x.parent = v.parent; }); await save(name, arr); render(); } }, '✕'),
        ));
      });
    };
    const head = el('div', { class: 'row', style: 'gap:6px;margin-bottom:6px' },
      el('strong', null, name),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn sm', onclick: e => { onlyStar = !onlyStar; e.target.classList.toggle('on', onlyStar); render(); } }, '★ ' + OS.t('Yalnız yıldızlılar')),
      el('button', { class: 'btn sm', title: OS.t('Notu ve yıldızı olmayan sürümleri siler'), onclick: async () => { const keep = arr.filter(v => v.star || v.note || v.id === OS.project._ver); keep.forEach(v => { let p = v.parent; while (p && !keep.find(k => k.id === p)) p = (arr.find(x => x.id === p) || {}).parent; v.parent = p || null; }); arr = keep; await save(name, arr); render(); } }, OS.t('Adsızları sil')));
    const m = U.modal(OS.t('Sürüm geçmişi'), el('div', null, head, box), [{ label: OS.t('Kapat') }]);
    render();
  };
})(window.OS);
