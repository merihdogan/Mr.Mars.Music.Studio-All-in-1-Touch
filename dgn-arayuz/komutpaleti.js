/* Mr. Mars Music Studio · MRH DGN — komut paleti (Ctrl+Shift+P): her komut tek arama kutusunda */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui;
  const CP = ui.palette = {};
  const GROUPS = { file: 'Dosya', edit: 'Düzen', add: 'Ekle', tools: 'Araçlar', view: 'Görünüm' };
  const fold = s => String(s).toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

  /** Menülerdeki komutlar + sekmeler + düzenleme ekranı komutları. */
  function commands() {
    const out = [];
    const menus = ui.menus || {};
    Object.keys(menus).forEach(k => {
      let items = []; try { items = menus[k]() || []; } catch (e) { }
      items.forEach(it => { if (it && it !== '-' && it.label && !it.disabled && it.onclick) out.push({ group: OS.t(GROUPS[k] || k), label: OS.t(it.label.trim()), raw: it.label.trim(), run: it.onclick }); });
    });
    document.querySelectorAll('#tabs button[data-view]').forEach(b => out.push({ group: OS.t('Görünüm'), label: b.textContent.trim(), raw: b.textContent.trim(), run: () => ui.showView(b.dataset.view) }));
    const S = ui.sections, T = OS.transport;
    const extra = [
      ['Bölüm: içinde bulunulanı döngüye al', () => S.atPlayhead() && S.loop(S.atPlayhead())],
      ['Bölüm: önceye taşı (içeriğiyle)', () => S.atPlayhead() && S.moveEarlier(S.atPlayhead())],
      ['Bölüm: sonraya taşı (içeriğiyle)', () => S.atPlayhead() && S.moveLater(S.atPlayhead())],
      ['Bölüm: içeriğiyle çoğalt', () => S.atPlayhead() && S.duplicateWithContent(S.atPlayhead())],
      ['Bölüm: içeriğiyle sil', () => S.atPlayhead() && S.deleteWithContent(S.atPlayhead())],
      ['Bölüm: otomatik ada dön', () => { const s = S.atPlayhead(); if (s) { OS.history.push(); s.auto = true; ui.changed(); } }],
      ['Şarkının tamamını sığdır', () => S.fit()],
      ['Cümle çizgileri: kapalı / 4 / 8 / 16 / 32', () => { const seq = [0, 4, 8, 16, 32]; OS.project.phrase = seq[(seq.indexOf(+OS.project.phrase || 0) + 1) % seq.length]; ui.arrange.render(); U.toast(OS.t('Cümle çizgisi') + ': ' + (OS.project.phrase || OS.t('Kapalı'))); }],
      ['Kaydı at ve yeniden çek (Ctrl+.)', () => T.retryTake()],
      ['Oynat / durdur (Boşluk)', () => T.playing ? T.stop(true) : T.play()],
      ['Kaydet (R)', () => T.record()],
      ['Döngü aç / kapat (L)', () => { OS.project.loop.on = !OS.project.loop.on; ui.updateTransportUI(); }],
      ['Metronom aç / kapat (M)', () => { OS.project.metronome = !OS.project.metronome; ui.updateTransportUI(); }],
      ['İmleci başa al (Home)', () => T.setPosition(0)],
      ['Sürüm geçmişi…', () => OS.versions.dialog()],
      ['Stereo harita', () => { ui.showView('mixer'); ui.mixer.setMode('map'); }],
    ];
    extra.forEach(([l, run]) => out.push({ group: OS.t('Komut'), label: OS.t(l), raw: l, run }));
    const seen = new Set();
    return out.filter(c => { const k = c.group + '|' + c.label; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /** Bütün sözcükler geçmeli; başta geçen ve kısa olan önce gelir. */
  function score(c, q) {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const hay = fold(c.label + ' ' + c.raw + ' ' + c.group);
    let s = 0;
    for (const w of words) { const i = hay.indexOf(w); if (i < 0) return -1; s += i === 0 ? 30 : (hay[i - 1] === ' ' ? 15 : 5); }
    return s - c.label.length * 0.05;
  }

  CP.open = function () {
    if (document.querySelector('.palette')) return;
    const all = commands();
    let shown = all, idx = 0;
    const inp = el('input', { type: 'text', placeholder: OS.t('Komut ara… (ör. bölüm, kaydet, mikser)') });
    const listEl = el('div', { class: 'pl' });
    const box = el('div', { class: 'palette' }, inp, listEl);
    const m = U.modal(OS.t('Komut paleti'), box, []);
    const run = c => { m.close(); setTimeout(() => { try { c.run(); } catch (e) { U.toast(e.message); } }, 0); };
    const draw = () => {
      listEl.innerHTML = '';
      shown.slice(0, 60).forEach((c, i) => {
        const r = el('div', { class: 'pi' + (i === idx ? ' on' : ''), onclick: () => run(c) }, el('span', { class: 'grp' }, c.group), el('span', null, c.label));
        listEl.appendChild(r);
        if (i === idx) r.scrollIntoView({ block: 'nearest' });
      });
      if (!shown.length) listEl.appendChild(el('div', { class: 'pi' }, OS.t('Eşleşen komut yok')));
    };
    inp.addEventListener('input', () => {
      const q = inp.value.trim();
      shown = q ? all.map(c => [c, score(c, q)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1]).map(x => x[0]) : all;
      idx = 0; draw();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { idx = Math.min(shown.length - 1, idx + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (shown[idx]) run(shown[idx]); e.preventDefault(); }
      else if (e.key === 'Escape') { m.close(); e.preventDefault(); }
    });
    draw();
    // Pencere kendi düğmesine odak verdikten sonra arama kutusuna geç
    [0, 60, 200].forEach(ms => setTimeout(() => { if (document.activeElement !== inp) inp.focus(); }, ms));
  };
})(window.OS);
