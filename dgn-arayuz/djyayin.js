/* Mr. Mars Music Studio · MRH DGN — canlı yayın.
   1) Dinleme bağlantısı: dinleyiciler dinle.html sayfasından doğrudan bağlanır, ses ve video cihazdan cihaza akar.
   2) İnternet radyosu: MP3 akışı yerel köprü programı (yayin-kopru.js) üzerinden radyo sunucusuna gider. */
(function (OS) {
  const U = OS.U, el = U.el, E = OS.engine, DJ = OS.ui.dj;
  const PAGE = 'https://merihdogan.github.io/Mr.Mars.Music.Studio-All-in-1-Touch/dinle.html';
  const MAX = 8;
  const L = DJ.live = { on: false, peers: new Map(), radio: null, kbps: 192, host: '127.0.0.1', port: 8000, mount: '/live', user: 'source', title: 'Mr. Mars Live', bridge: 8765, useVideo: true };
  try { Object.assign(L, JSON.parse(localStorage.getItem('os.live') || '{}')); } catch (e) { }
  const save = () => { try { localStorage.setItem('os.live', JSON.stringify({ kbps: L.kbps, host: L.host, port: L.port, mount: L.mount, user: L.user, title: L.title, bridge: L.bridge, useVideo: L.useVideo })); } catch (e) { } };
  const lazy = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const LINK = () => window.OSLink ? Promise.resolve() : lazy('mrmars-cekirdek/telefon-baglanti.js');
  const pageUrl = () => /^https?:$/.test(location.protocol) ? new URL('dinle.html', location.href).href : PAGE;

  function gather(pc, ms) { return new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); }); }
  // Mesaj sınırına sığsın, müzik kalitesi yüksek olsun
  const tune = sdp => sdp.split('\r\n').filter(l => !(l.startsWith('a=candidate:') && / tcp /i.test(l)) && !l.startsWith('a=extmap') && !l.startsWith('a=ssrc-group')).map(l => /^a=fmtp:\d+ .*useinbandfec=1/.test(l) ? l.replace(/;?stereo=\d|;?maxaveragebitrate=\d+/g, '') + ';stereo=1;sprop-stereo=1;maxaveragebitrate=256000' : l).join('\r\n');
  function outStream() {
    const ctx = E.init();
    if (!L.dest) { L.dest = ctx.createMediaStreamDestination(); DJ._i.getTap().connect(L.dest); }
    return L.dest.stream;
  }
  async function welcome(from) {
    if (L.peers.size >= MAX) { L.relay.send({ to: from, t: 'full' }); return; }
    const pc = new RTCPeerConnection({ iceServers: window.OS_ICE !== undefined ? window.OS_ICE : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] });
    L.peers.set(from, pc);
    const au = outStream().getAudioTracks()[0], tr = pc.addTransceiver(au, { direction: 'sendonly' });
    if (RTCRtpSender.getCapabilities) { try { tr.setCodecPreferences(RTCRtpSender.getCapabilities('audio').codecs.filter(c => /opus/i.test(c.mimeType))); } catch (e) { } }
    if (L.useVideo && DJ.video.stream) {
      const vt = DJ.video.stream().getVideoTracks()[0];
      if (vt) { const v = pc.addTransceiver(vt, { direction: 'sendonly' }); try { v.setCodecPreferences(RTCRtpSender.getCapabilities('video').codecs.filter(c => /vp8/i.test(c.mimeType))); } catch (e) { } }
    }
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { try { pc.close(); } catch (e) { } L.peers.delete(from); L.refresh && L.refresh(); } else L.refresh && L.refresh(); };
    await pc.setLocalDescription(await pc.createOffer());
    await gather(pc, 1500);
    L.relay.send({ to: from, t: 'offer', desc: { type: 'offer', sdp: tune(pc.localDescription.sdp) } });
    L.refresh && L.refresh();
  }
  L.start = async function () {
    if (L.on) return;
    await LINK();
    if (!window.OSQR) await lazy('mrmars-cekirdek/qr.js').catch(() => { });
    L.room = OSLink.rand(9); L.key = OSLink.rand(16).replace(/[^A-Za-z0-9_-]/g, '');
    const raw = crypto.getRandomValues(new Uint8Array(16)); L.key = btoa(String.fromCharCode.apply(null, raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    L.me = 'host';
    L.relay = await OSLink.relay(L.room, L.key, L.me, async m => {
      if (m.t === 'hello') welcome(m.from).catch(console.warn);
      if (m.t === 'answer') { const pc = L.peers.get(m.from); if (pc) pc.setRemoteDescription(m.desc).catch(console.warn); }
      if (m.t === 'bye') { const pc = L.peers.get(m.from); if (pc) { pc.close(); L.peers.delete(m.from); L.refresh && L.refresh(); } }
    }, n => { L.links = n; L.refresh && L.refresh(); });
    L.on = true; L.url = pageUrl() + '#' + L.room + '.' + L.key;
    L.refresh && L.refresh();
  };
  L.stop = function () {
    L.peers.forEach(pc => { try { pc.close(); } catch (e) { } }); L.peers.clear();
    if (L.relay) { L.relay.close(); L.relay = null; }
    L.on = false; L.url = ''; L.refresh && L.refresh();
  };

  // ---------------- İnternet radyosu ----------------
  L.radioStart = async function (password) {
    if (L.radio) return;
    if (!window.lamejs) await lazy('mrmars-cekirdek/mp3kod.js');
    const ctx = E.init(), sr = ctx.sampleRate;
    if (![44100, 48000, 32000].includes(sr)) { U.toast(OS.t('Bu örnekleme hızı MP3 için uygun değil') + ': ' + sr, 6000); return; }
    const ws = new WebSocket('ws://127.0.0.1:' + L.bridge); ws.binaryType = 'arraybuffer';
    const R = L.radio = { ws, state: 'connecting', bytes: 0, t0: performance.now() };
    const fail = msg => { if (L.radio !== R) return; L.radioStop(); U.toast(msg, 7000); };
    ws.onerror = () => fail(OS.t('Köprü programına bağlanılamadı. Bilgisayarda yayin-kopru.js çalışıyor mu?'));
    ws.onclose = () => fail(OS.t('Yayın bağlantısı kapandı'));
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (er) { return; }
      if (m.state === 'on') { R.state = 'on'; startEncoder(R, ctx, sr); L.refresh && L.refresh(); }
      if (m.error) fail(OS.t('Radyo sunucusu reddetti') + ': ' + m.error);
    };
    ws.onopen = () => ws.send(JSON.stringify({ host: L.host, port: +L.port, mount: L.mount, user: L.user, pass: password, name: L.title, bitrate: L.kbps }));
    L.refresh && L.refresh();
  };
  function startEncoder(R, ctx, sr) {
    const enc = new window.lamejs.Mp3Encoder(2, sr, L.kbps), sp = ctx.createScriptProcessor(4096, 2, 2), sil = ctx.createGain(); sil.gain.value = 0;
    const toInt = a => { const o = new Int16Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.max(-32768, Math.min(32767, a[i] * 32767)); return o; };
    sp.onaudioprocess = e => {
      if (R.ws.readyState !== 1) return;
      if (R.ws.bufferedAmount > 1 << 20) { R.dropped = (R.dropped || 0) + 1; return; }
      const out = enc.encodeBuffer(toInt(e.inputBuffer.getChannelData(0)), toInt(e.inputBuffer.getChannelData(1)));
      if (out.length) { R.ws.send(new Uint8Array(out).buffer); R.bytes += out.length; }
    };
    DJ._i.getTap().connect(sp); sp.connect(sil); sil.connect(ctx.destination);
    R.stop = () => { try { DJ._i.getTap().disconnect(sp); sp.disconnect(); sil.disconnect(); } catch (e) { } sp.onaudioprocess = null; };
  }
  L.radioStop = function () {
    const R = L.radio; if (!R) return; L.radio = null;
    R.stop && R.stop(); R.ws.onclose = R.ws.onerror = null; try { R.ws.close(); } catch (e) { }
    L.refresh && L.refresh();
  };

  L.ui = function () {
    const box = el('div', { class: 'dj-panel dj-live' });
    const inp = (lbl, k, w, type) => el('label', { class: 'field' }, OS.t(lbl), el('input', { class: 'inp', type: type || 'text', value: L[k], style: 'width:' + w + 'px', onchange: e => { L[k] = type === 'number' ? +e.target.value : e.target.value; save(); } }));
    const pw = el('input', { class: 'inp', type: 'password', autocomplete: 'off', style: 'width:130px' });
    const draw = () => {
      box.innerHTML = '';
      let qr = null;
      if (L.on && window.OSQR) { try { qr = el('canvas', { class: 'live-qr' }); window.OSQR.draw(qr, L.url, 264); } catch (e) { qr = null; } }
      box.append(
        el('div', { class: 'row wrap' }, el('b', null, OS.t('Dinleme bağlantısı')),
          el('button', { class: 'btn sm ' + (L.on ? 'on' : 'primary'), onclick: () => L.on ? L.stop() : L.start().catch(e => U.toast(e.message)) }, L.on ? OS.t('Yayını durdur') : OS.t('Yayını başlat')),
          el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: L.useVideo, onchange: e => { L.useVideo = e.target.checked; save(); } }), OS.t('Video da gönder')),
          L.on ? el('span', { class: 'mono' }, OS.t('Dinleyici') + ': ' + [...L.peers.values()].filter(p => p.connectionState === 'connected').length + ' / ' + MAX) : null),
        L.on ? el('div', { class: 'row wrap' }, qr, el('input', { class: 'inp', readonly: true, value: L.url, style: 'flex:1;min-width:240px', onclick: e => e.target.select() }), el('button', { class: 'btn sm', onclick: () => navigator.clipboard.writeText(L.url).then(() => U.toast(OS.t('Kopyalandı'))) }, OS.t('Kopyala'))) : null,
        el('p', { class: 'muted' }, OS.t('Bağlantıyı açan dinleyici, sesi doğrudan bu cihazdan alır; en fazla 8 kişi. Daha geniş kitle için radyo sunucusu kullanın.')),
        el('div', { class: 'row wrap' }, el('b', null, OS.t('İnternet radyosu')), inp('Sunucu', 'host', 150), inp('Port', 'port', 80, 'number'), inp('Yayın noktası', 'mount', 100), inp('Kullanıcı', 'user', 90),
          el('label', { class: 'field' }, OS.t('Parola'), pw), inp('Yayın adı', 'title', 150),
          el('label', { class: 'field' }, 'kbps', el('select', { onchange: e => { L.kbps = +e.target.value; save(); } }, [128, 160, 192, 256, 320].map(v => el('option', { value: v, selected: v === L.kbps }, v)))),
          el('button', { class: 'btn sm ' + (L.radio ? 'on' : 'primary'), onclick: () => L.radio ? L.radioStop() : L.radioStart(pw.value).catch(e => U.toast(e.message)) }, L.radio ? OS.t('Radyoyu durdur') : OS.t('Radyoya bağlan')),
          L.radio ? el('span', { class: 'mono' }, L.radio.state === 'on' ? '● ON AIR' : '…') : null),
        el('p', { class: 'muted' }, OS.t('Tarayıcı radyo sunucusuna doğrudan bağlanamaz. Program klasöründeki yayin-kopru.js dosyasını Node ile çalıştırın; parola yalnız bu köprüye gider ve kaydedilmez.')));
    };
    L.refresh = draw; draw();
    return box;
  };
})(window.OS);
