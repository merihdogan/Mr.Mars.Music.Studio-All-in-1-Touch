/* Mr. Mars Music Studio · MRH DGN — ortak proje: birkaç kişi aynı projede çalışır.
   Proje doğrudan cihazdan cihaza gider; aracı yalnız şifreli el sıkışmayı taşır. Aynı anda değişiklikte son yazan geçerli olur. */
(function (OS) {
  const U = OS.U, el = U.el, E = OS.engine, T = OS.transport;
  const C = OS.collab = { on: false, role: null, peers: new Map(), url: '' };
  const CHUNK = 15000, MAX = 4, PAGE = 'https://merihdogan.github.io/Mr.Mars.Music.Studio-All-in-1-Touch/';
  const lazy = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const need = async () => { if (!window.OSLink) await lazy('mrmars-cekirdek/telefon-baglanti.js'); if (!window.OSQR) await lazy('mrmars-cekirdek/qr.js').catch(() => { }); };
  let relay = null, last = '', iv = 0, pressed = false, held = null, mid = 0;
  const parts = new Map();
  addEventListener('pointerdown', () => pressed = true, true); addEventListener('pointerup', () => pressed = false, true); addEventListener('pointercancel', () => pressed = false, true);
  const snap = () => { const d = OS.serialize(); delete d.zoom; return JSON.stringify(d); };
  async function sendTo(p, o) {
    const s = JSON.stringify(o), id = ++mid, n = Math.ceil(s.length / CHUNK);
    for (let i = 0; i < n; i++) {
      if (p.dc.readyState !== 'open') return;
      while (p.dc.bufferedAmount > 1 << 20) await new Promise(r => setTimeout(r, 30));
      p.dc.send(JSON.stringify({ c: id, i, n, d: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
    }
  }
  const broadcast = (o, except) => C.peers.forEach(p => { if (p !== except && p.dc && p.dc.readyState === 'open') sendTo(p, o).catch(() => { }); });
  const ids = s => [...new Set([...s.matchAll(/"bufferId":"([^"]+)"/g)].map(m => m[1]))];
  async function apply(s, from) {
    if (T.playing || pressed) { held = { s, from }; return; }
    held = null; if (s === last) return; last = s;
    const miss = ids(s).filter(i => !E.buffers.has(i));
    OS.loadProject(JSON.parse(s)); E.syncAll();
    if (miss.length && from) sendTo(from, { k: 'need', ids: miss });
  }
  async function onData(p, raw) {
    const m = JSON.parse(raw); let e = parts.get(p.key + ':' + m.c); if (!e) { e = []; parts.set(p.key + ':' + m.c, e); }
    e[m.i] = m.d; if (Object.keys(e).length < m.n) return; parts.delete(p.key + ':' + m.c);
    const o = JSON.parse(e.join(''));
    if (o.k === 'state') { await apply(o.s, p); if (C.role === 'host') broadcast(o, p); }
    if (o.k === 'need') for (const id of o.ids) { const b = E.buffers.get(id); if (!b) continue; const a = new Uint8Array(await U.bufferToWav(b, 16).arrayBuffer()); let t = ''; for (let i = 0; i < a.length; i += 32766) t += btoa(String.fromCharCode.apply(null, a.subarray(i, i + 32766))); sendTo(p, { k: 'buf', id, t }); }
    if (o.k === 'buf') { const a = Uint8Array.from(atob(o.t), c => c.charCodeAt(0)), b = await E.init().decodeAudioData(a.buffer); E.buffers.set(o.id, b); OS.store.saveBuffer && OS.store.saveBuffer(o.id, b, o.id); }
  }
  function bind(key, pc, dc) {
    const p = { key, pc, dc }; C.peers.set(key, p);
    const open = () => { if (C.role === 'host') sendTo(p, { k: 'state', s: last || (last = snap()) }); C.refresh && C.refresh(); U.toast(OS.t('Ortak projeye biri bağlandı')); };
    dc.onopen = open; if (dc.readyState === 'open') open();
    dc.onmessage = e => onData(p, e.data).catch(console.warn);
    dc.onclose = () => { C.peers.delete(key); C.refresh && C.refresh(); };
  }
  function tick() {
    if (held && !T.playing && !pressed) { apply(held.s, held.from); return; }
    if (pressed || T.playing || !C.peers.size) return;
    const s = snap(); if (s !== last) { last = s; broadcast({ k: 'state', s }); }
  }
  C.start = async function () {
    if (C.on) return; await need();
    const room = OSLink.rand(9), raw = crypto.getRandomValues(new Uint8Array(16)), key = btoa(String.fromCharCode.apply(null, raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    C.role = 'host'; last = snap();
    relay = await OSLink.relay(room, key, 'host', async m => {
      if (m.t === 'hello' && !C.peers.has(m.from) && C.peers.size < MAX) { const { pc, dc, desc } = await OSLink.createOffer(); bind(m.from, pc, dc); relay.send({ to: m.from, t: 'offer', desc }); }
      if (m.t === 'answer') { const p = C.peers.get(m.from); if (p) p.pc.setRemoteDescription(m.desc).catch(console.warn); }
    }, () => { });
    C.on = true; C.url = (/^https?:$/.test(location.protocol) ? location.href.replace(/#.*/, '') : PAGE) + '#ortak=' + room + '.' + key;
    iv = setInterval(tick, 700); C.refresh && C.refresh();
  };
  C.join = async function (room, key) {
    await need(); const me = OSLink.rand(6); C.role = 'guest'; C.on = true; let done = false, hello;
    relay = await OSLink.relay(room, key, me, async m => {
      if (m.t !== 'offer' || done) return; done = true; clearInterval(hello);
      const { pc, desc } = await OSLink.createAnswer(m.desc); pc.ondatachannel = e => bind('host', pc, e.channel); relay.send({ to: 'host', t: 'answer', desc });
    }, () => { });
    const say = () => relay.send({ to: 'host', t: 'hello' }); say(); hello = setInterval(say, 3000);
    iv = setInterval(tick, 700); U.toast(OS.t('Ortak projeye bağlanılıyor…'));
  };
  C.stop = function () { clearInterval(iv); C.peers.forEach(p => { try { p.pc.close(); } catch (e) { } }); C.peers.clear(); if (relay) relay.close(); relay = null; C.on = false; C.url = ''; C.refresh && C.refresh(); };
  C.dialog = function () {
    const box = el('div', { style: 'display:flex;flex-direction:column;gap:10px;max-width:520px' });
    C.refresh = () => {
      if (!box.isConnected && C._drawn) return; C._drawn = true; box.innerHTML = '';
      box.append(el('p', { class: 'muted' }, OS.t('Bağlantıyı paylaş; açan kişi projeyi görür ve değiştirir. En fazla 4 kişi. Değişiklikler çalma durunca gelir, aynı anda düzenlemede son yazan geçerli olur.')));
      if (C.on) {
        if (C.url && window.OSQR) { const q = el('canvas', { class: 'live-qr' }); window.OSQR.draw(q, C.url, 264); box.appendChild(q); }
        if (C.url) box.appendChild(el('div', { class: 'row' }, el('input', { class: 'inp', readonly: true, value: C.url, style: 'flex:1', onclick: e => e.target.select() }), el('button', { class: 'btn sm', onclick: () => navigator.clipboard.writeText(C.url).then(() => U.toast(OS.t('Kopyalandı'))) }, OS.t('Kopyala'))));
        box.append(el('div', null, OS.t('Bağlı kişi') + ': ' + C.peers.size), el('button', { class: 'btn danger', onclick: C.stop }, OS.t('Oturumu kapat')));
      } else box.appendChild(el('button', { class: 'btn primary', onclick: () => C.start().catch(e => U.toast(e.message)) }, OS.t('Ortak oturum başlat')));
    };
    C.refresh();
    U.modal(OS.t('Ortak Proje'), box, [{ label: 'Kapat' }]);
  };
  addEventListener('DOMContentLoaded', () => { const m = location.hash.match(/^#ortak=([^.]+)\.(.+)$/); if (m) setTimeout(() => { C.join(m[1], m[2]).catch(e => U.toast(e.message)); }, 2500); });

  // ---------------- MPE: her nota kendi kanalında; perde ve basınç notaya özeldir ----------------
  const M = OS.mpe = { on: false, range: 48, ch: {} };
  try { Object.assign(M, JSON.parse(localStorage.getItem('os.mpe') || '{}'), { ch: {} }); } catch (e) { }
  M.save = () => { try { localStorage.setItem('os.mpe', JSON.stringify({ on: M.on, range: M.range })); } catch (e) { } };
  OS.midiHooks = OS.midiHooks || [];
  OS.midiHooks.unshift(d => {
    if (!M.on) return false;
    const cmd = d[0] & 0xf0, ch = d[0] & 0x0f; if (!ch) return false;
    if (cmd === 0x90 && d[2] > 0) { M.ch[ch] = d[1]; E.liveNoteOn(d[1], d[2]); return true; }
    if (cmd === 0x80 || cmd === 0x90) { if (M.ch[ch] === d[1]) delete M.ch[ch]; E.liveNoteOff(d[1]); return true; }
    const n = M.ch[ch]; if (n == null) return cmd === 0xe0 || cmd === 0xd0;
    const t = E.liveTarget(), i = t && t.instrument && t.instrument.inst; if (!i) return true;
    if (cmd === 0xe0 && i.noteBend) i.noteBend(n, (((d[2] << 7) | d[1]) - 8192) / 8192 * M.range * 100);
    if (cmd === 0xd0 && i.notePress) i.notePress(n, d[1] / 127);
    return cmd === 0xe0 || cmd === 0xd0;
  });
})(window.OS);
