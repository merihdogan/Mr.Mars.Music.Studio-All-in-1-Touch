/* Mr. Mars Music Studio · MRH DGN — MIDI Clock (giriş / çıkış) ve MIDI ayarları
 * Çıkış: 24 PPQN saat + Start / Stop; başka DJ yazılımları, groovebox'lar ve drum machine'ler
 *        bu uygulamanın temposunu izler (kaynak: proje aktarımı veya çalan DJ deck'i).
 * Giriş: harici cihaz / yazılımın saatinden tempo okunur; istenirse proje temposu ve
 *        çal / durdur ona bağlanır.
 */
(function (OS) {
  const U = OS.U, el = U.el, T = OS.transport;
  const C = OS.midiClock = Object.assign({ out: false, outSrc: 'project', outIds: [], follow: false, followTransport: true },
    (() => { try { return JSON.parse(localStorage.getItem('os.midiclock') || '{}'); } catch (e) { return {}; } })());
  C.save = () => { const o = {}; ['out', 'outSrc', 'outIds', 'follow', 'followTransport'].forEach(k => o[k] = C[k]); try { localStorage.setItem('os.midiclock', JSON.stringify(o)); } catch (e) { } };
  C.extBpm = 0;

  const outs = () => OS.midiAccess ? [...OS.midiAccess.outputs.values()].filter(o => !C.outIds.length || C.outIds.includes(o.id)) : [];
  const srcBpm = () => {
    if (C.outSrc === 'dj') { const d = OS.ui.dj && OS.ui.dj.decks && OS.ui.dj.decks.find(x => x.playing && x.bpm); if (d) return d.bpm * d.eff; }
    return T.bpm;
  };
  // ---------------- Saat çıkışı ----------------
  let nextTick = 0, timer = null, running = false;
  function pump() {
    if (!C.out) return;
    const o = outs(); if (!o.length) return;
    const now = performance.now(), iv = 60000 / srcBpm() / 24;
    const live = C.outSrc === 'dj' ? true : T.playing;
    if (!live) { nextTick = 0; return; }
    if (!nextTick || nextTick < now - 100) nextTick = now + 5;
    while (nextTick < now + 60) { o.forEach(x => { try { x.send([0xf8], nextTick); } catch (e) { } }); nextTick += iv; }
  }
  C.start = () => { clearInterval(timer); timer = setInterval(pump, 15); };
  function sendRT(b) { if (C.out && C.outSrc === 'project') outs().forEach(x => { try { x.send([b]); } catch (e) { } }); }
  document.addEventListener('os-transport', () => {
    if (T.playing !== running) { running = T.playing; sendRT(running ? 0xfa : 0xfc); nextTick = 0; }
  });

  // ---------------- Saat girişi ----------------
  const ticks = [];
  OS.midiHooks = OS.midiHooks || [];
  OS.midiHooks.unshift(d => {
    const st = d[0];
    if (st === 0xf8) {
      const now = performance.now(); ticks.push(now); while (ticks.length > 49) ticks.shift();
      if (ticks.length >= 25) {
        const bpm = 60000 / ((ticks[ticks.length - 1] - ticks[0]) / (ticks.length - 1) * 24);
        C.extBpm = Math.round(bpm * 10) / 10;
        if (C.follow && Math.abs(OS.project.bpm - C.extBpm) >= 0.3) { OS.project.bpm = C.extBpm; OS.ui.updateTransportUI && OS.ui.updateTransportUI(); }
      }
      return true;
    }
    if (st === 0xfa || st === 0xfb) { if (C.follow && C.followTransport && !T.playing) T.play(); return true; }
    if (st === 0xfc) { if (C.follow && C.followTransport && T.playing) T.stop(true); return true; }
    if (st >= 0xf8) return true; // diğer gerçek zamanlı mesajlar (active sensing vb.) yok sayılır
    return false;
  });

  // ---------------- MIDI ayarları penceresi ----------------
  C.dialog = function () {
    const acc = OS.midiAccess;
    const ins = acc ? [...acc.inputs.values()] : [], os = acc ? [...acc.outputs.values()] : [];
    const outBoxes = os.map(o => el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: !C.outIds.length || C.outIds.includes(o.id), 'data-id': o.id }), o.name));
    const bpmLbl = el('b', null, C.extBpm ? C.extBpm + ' BPM' : '—');
    const iv = setInterval(() => { if (!bpmLbl.isConnected) clearInterval(iv); else bpmLbl.textContent = C.extBpm ? C.extBpm + ' BPM' : '—'; }, 500);
    const outOn = el('input', { type: 'checkbox', checked: C.out }), follow = el('input', { type: 'checkbox', checked: C.follow }), fT = el('input', { type: 'checkbox', checked: C.followTransport });
    const mpeOn = el('input', { type: 'checkbox', checked: !!(OS.mpe && OS.mpe.on) });
    const srcSel = el('select', null, [['project', 'Proje aktarımı (çal / durdur ile)'], ['dj', 'Çalan DJ deck’inin temposu (sürekli)']].map(([v, l]) => el('option', { value: v, selected: v === C.outSrc }, l)));
    const body = el('div', { style: 'display:flex;flex-direction:column;gap:8px;max-width:620px' },
      el('div', { class: 'form-grid' },
        'MIDI girişleri', el('span', null, ins.length ? ins.map(i => i.name).join(', ') : OS.t('yok')),
        'MIDI çıkışları', el('div', { style: 'display:flex;flex-direction:column;gap:2px' }, outBoxes.length ? outBoxes : el('span', null, OS.t('yok'))),
        'MIDI Clock gönder', outOn,
        'Saat kaynağı', srcSel,
        'Harici MIDI Clock’u izle', follow,
        'Harici Start / Stop ile çal / durdur', fT,
        'Gelen harici tempo', bpmLbl,
        'MPE (nota başına perde ve basınç)', mpeOn),
      el('p', { class: 'muted' }, 'MIDI Clock ile bu uygulama; DJ yazılımları, DAW’lar, drum machine ve groovebox’larla aynı tempoda çalışır. Gönderirken diğer program “harici saat / MIDI Clock slave” moduna alınmalıdır. Controller düğme ışıkları DJ Mikser’deki “LED” düğmesiyle açılır; düğme, fader ve jog eşlemeleri “MIDI Öğren” ile yapılır (14-bit fader ve pitch-bend tempo faderleri desteklenir).'));
    U.modal(OS.t('MIDI Ayarları'), body, [{ label: 'İptal' }, {
      label: 'Uygula', primary: true, onclick: () => {
        C.out = outOn.checked; C.outSrc = srcSel.value; C.follow = follow.checked; C.followTransport = fT.checked;
        const chosen = outBoxes.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.dataset.id);
        C.outIds = chosen.length === os.length ? [] : chosen;
        C.save(); C.start(); OS.mpe.on = mpeOn.checked; OS.mpe.save();
      },
    }]);
  };
  C.start();
})(window.OS);
