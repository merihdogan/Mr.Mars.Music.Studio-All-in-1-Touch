/* Mr. Mars Music Studio · MRH DGN — DJ video katmanı: deck videoları, görselleştirici, kamera, slayt,
   kapak; iki kaynak arası geçiş, başlık katmanı ve ayrı çıkış penceresi */
(function (OS) {
  const U = OS.U, el = U.el, E = OS.engine, DJ = OS.ui.dj;
  const V = DJ.video = { on: false, source: 'auto', vis: 'bars', link: 'smart', manual: 0.5, trans: 'fade', title: true, slides: [], slideSec: 6, cam: null };
  const W = 1280, H = 720;
  let cv, g, outWin = null, outCtx = null, raf = 0;
  const vids = new Map(), fbuf = new Uint8Array(512), tbuf = new Uint8Array(1024);

  function videoFor(d) {
    let e = vids.get(d);
    if (!d.video) { if (e) { e.el.pause(); vids.delete(d); } return null; }
    if (!e || e.url !== d.video) {
      if (e) e.el.pause();
      const x = document.createElement('video'); x.src = d.video; x.muted = true; x.playsInline = true; x.preload = 'auto';
      e = { el: x, url: d.video }; vids.set(d, e);
    }
    const x = e.el, p = d.position();
    if (d.playing && !d.rev) {
      if (x.paused) x.play().catch(() => { });
      if (Math.abs(x.playbackRate - d.eff) > 0.005) x.playbackRate = U.clamp(d.eff, 0.25, 4);
      if (Math.abs(x.currentTime - p) > 0.2) x.currentTime = p;
    } else { if (!x.paused) x.pause(); if (Math.abs(x.currentTime - p) > 0.05) x.currentTime = p; }
    return x.readyState >= 2 ? x : null;
  }
  const coverCache = new Map();
  function coverFor(d) {
    if (!d.cover) return null;
    let i = coverCache.get(d.cover);
    if (!i) { i = new Image(); i.src = d.cover; coverCache.set(d.cover, i); }
    return i.complete && i.naturalWidth ? i : null;
  }
  function fit(c, img, w, h, a) {
    const iw = img.videoWidth || img.naturalWidth || w, ih = img.videoHeight || img.naturalHeight || h, k = Math.max(W / iw, H / ih), dw = iw * k, dh = ih * k;
    c.globalAlpha = a; c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); c.globalAlpha = 1;
  }
  function visual(c, a, an) {
    if (!an) return;
    c.globalAlpha = a;
    if (V.vis === 'scope') {
      an.getByteTimeDomainData(tbuf); c.strokeStyle = '#ff7a1a'; c.lineWidth = 4; c.beginPath();
      for (let i = 0; i < tbuf.length; i += 2) { const x = i / tbuf.length * W, y = H / 2 + (tbuf[i] - 128) / 128 * H * 0.45; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
    } else if (V.vis === 'radial') {
      an.getByteFrequencyData(fbuf); const n = 96; c.lineWidth = 6;
      for (let i = 0; i < n; i++) { const l = fbuf[i * 2] / 255, r = 90 + l * 230, t = i / n * Math.PI * 2 + performance.now() / 4000; c.strokeStyle = `hsl(${(i * 4 + 15) % 360},90%,${40 + l * 25}%)`; c.beginPath(); c.moveTo(W / 2 + Math.cos(t) * 90, H / 2 + Math.sin(t) * 90); c.lineTo(W / 2 + Math.cos(t) * r, H / 2 + Math.sin(t) * r); c.stroke(); }
    } else {
      an.getByteFrequencyData(fbuf); const n = 64, bw = W / n;
      for (let i = 0; i < n; i++) { const l = fbuf[Math.floor(Math.pow(i / n, 1.8) * 300)] / 255, h = l * H * 0.85; c.fillStyle = `hsl(${(200 + i * 3) % 360},85%,${35 + l * 30}%)`; c.fillRect(i * bw + 1, H - h, bw - 2, h); }
    }
    c.globalAlpha = 1;
  }
  // Bir deckin görüntüsü: video > kapak > görselleştirici
  function layer(c, d, a) {
    if (a <= 0.003) return;
    const x = d ? videoFor(d) : null, cvr = d && !x ? coverFor(d) : null;
    if (x) fit(c, x, W, H, a);
    else if (cvr) { fit(c, cvr, W, H, a * 0.55); visual(c, a * 0.7, d.an); }
    else if (d) visual(c, a, d.an);
  }
  function mixAmount(a, b) {
    if (V.link === 'manual') return V.manual;
    if (V.link === 'linked') return DJ.xfade;
    // Akıllı: seyircinin duyduğuna göre (crossfader + kanal faderı + çalıyor mu)
    const lvl = d => d && d.playing ? d.xf.gain.value * d.fader.gain.value : 0, la = lvl(a), lb = lvl(b);
    return la + lb < 0.001 ? DJ.xfade : lb / (la + lb);
  }
  let off = null;
  function offscreen() { if (off) return; off = [0, 1].map(() => { const c = document.createElement('canvas'); c.width = W; c.height = H; return { c, g: c.getContext('2d') }; }); }
  function ensure() { if (!cv) { cv = el('canvas', { class: 'dj-video-cv', width: W, height: H }); g = cv.getContext('2d'); } }
  let stream = null;
  V.stream = () => { ensure(); if (!stream) stream = cv.captureStream(30); V.start(); return stream; };
  // Elle geçişi 2 saniyede diğer kaynağa götürür
  V.auto = function (sec) {
    V.link = 'manual'; const a = V.manual, b = a < 0.5 ? 1 : 0, t0 = performance.now(), T = (sec || 2) * 1000;
    if (!V.on) V.start();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / T); V.manual = a + (b - a) * k; if (V._x) V._x.value = V.manual; if (k < 1) requestAnimationFrame(step); };
    step();
  };
  function frame() {
    raf = 0;
    if (!V.on) return;
    raf = requestAnimationFrame(frame);
    if (!cv || !DJ.decks.length) return;
    const n = DJ._i.settings.count, ds = DJ.decks.slice(0, n);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (V.source === 'cam' && V.cam && V.cam.readyState >= 2) fit(g, V.cam, W, H, 1);
    else if (V.source === 'slides' && V.slides.length) fit(g, V.slides[Math.floor(performance.now() / 1000 / V.slideSec) % V.slides.length], W, H, 1);
    else if (V.source === 'vis') visual(g, 1, DJ._i.getMaster().an);
    else {
      const a = ds.find(d => d.playing && d.xAssign === 'A') || ds.find(d => d.xAssign === 'A') || ds[0];
      const b = ds.find(d => d.playing && d.xAssign === 'B') || ds.find(d => d.xAssign === 'B') || ds[1];
      const k = U.clamp(mixAmount(a, b), 0, 1);
      if (k <= 0.002) layer(g, a, 1);
      else if (k >= 0.998) layer(g, b, 1);
      else {
        offscreen();
        off[0].g.fillStyle = off[1].g.fillStyle = '#000'; off[0].g.fillRect(0, 0, W, H); off[1].g.fillRect(0, 0, W, H);
        layer(off[0].g, a, 1); layer(off[1].g, b, 1);
        const out = DJ.gecis && DJ.gecis.draw(V.trans, off[0].c, off[1].c, k);
        if (out) g.drawImage(out, 0, 0); else { layer(g, a, 1 - k); layer(g, b, k); }
      }
      if (V.title) { const top = k < 0.5 ? a : b; if (top && top.buffer) { g.font = '600 34px Segoe UI, sans-serif'; g.fillStyle = 'rgba(0,0,0,.55)'; const t = top.name, w2 = g.measureText(t).width; g.fillRect(24, H - 84, w2 + 32, 56); g.fillStyle = '#fff'; g.fillText(t, 40, H - 44); } }
    }
    if (DJ.karaoke) DJ.karaoke.draw(g, W, H);
    if (outWin) {
      if (outWin.closed) { outWin = null; outCtx = null; }
      else outCtx.drawImage(cv, 0, 0);
    }
  }
  V.start = () => { V.on = true; if (!raf) raf = requestAnimationFrame(frame); };
  V.stop = () => { V.on = false; vids.forEach(e => e.el.pause()); };
  V.openOutput = function () {
    if (outWin && !outWin.closed) { outWin.focus(); return; }
    outWin = window.open('', 'mrmars-video', 'width=960,height=540');
    if (!outWin) { U.toast(OS.t('Pencere açılamadı: açılır pencere izni gerekiyor')); return; }
    const doc = outWin.document;
    doc.title = 'Mr. Mars Video';
    doc.body.style.cssText = 'margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden';
    const c = doc.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'width:100%;height:100%;object-fit:contain';
    c.title = OS.t('Çift tık: tam ekran');
    c.ondblclick = () => { if (doc.fullscreenElement) doc.exitFullscreen(); else doc.documentElement.requestFullscreen(); };
    doc.body.appendChild(c); outCtx = c.getContext('2d');
    if (!V.on) V.start();
  };
  V.setSource = async function (s) {
    V.source = s;
    if (s === 'cam' && !V.cam) {
      try { const st = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); const x = document.createElement('video'); x.srcObject = st; x.muted = true; x.playsInline = true; await x.play(); V.cam = x; }
      catch (e) { U.toast(OS.t('Kamera açılamadı')); }
    }
    if (s !== 'cam' && V.cam) { V.cam.srcObject.getTracks().forEach(t => t.stop()); V.cam = null; }
  };
  V.pickSlides = async function () {
    const fs = await U.pickFiles('image/*', true); if (!fs.length) return;
    V.slides = await Promise.all(fs.map(f => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = URL.createObjectURL(f); })));
    V.slides = V.slides.filter(Boolean); V.setSource('slides');
    U.toast(V.slides.length + ' ' + OS.t('görsel yüklendi'));
  };
  V.ui = function () {
    ensure();
    const sel = (opts, val, on) => el('select', { onchange: e => on(e.target.value) }, opts.map(([v, l]) => el('option', { value: v, selected: v === val }, l)));
    const onB = el('button', { class: 'btn sm' + (V.on ? ' on' : ''), onclick: () => { V.on ? V.stop() : V.start(); onB.classList.toggle('on', V.on); } }, 'Video');
    const xSl = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: V.manual, title: OS.t('Elle video geçişi'), oninput: e => V.manual = +e.target.value }); V._x = xSl;
    if (V.on && !raf) V.start();
    return el('div', { class: 'dj-panel dj-video' },
      el('div', { class: 'row wrap' }, el('b', null, OS.t('Video Motoru')), onB,
        el('label', { class: 'field' }, OS.t('Kaynak'), sel([['auto', 'Decklerin görüntüsü'], ['vis', 'Görselleştirici'], ['cam', 'Kamera'], ['slides', 'Slayt gösterisi']], V.source, V.setSource)),
        el('label', { class: 'field' }, OS.t('Görsel'), sel([['bars', 'Çubuk'], ['scope', 'Dalga'], ['radial', 'Halka']], V.vis, v => V.vis = v)),
        el('label', { class: 'field' }, OS.t('Geçiş'), sel(DJ.gecis.LIST.map(x => [x[0], x[1]]), V.trans, v => V.trans = v)),
        el('button', { class: 'btn sm', title: OS.t('Görüntüyü 2 saniyede diğer kaynağa geçirir'), onclick: () => V.auto(2) }, OS.t('Geçişi çalıştır')),
        el('label', { class: 'field' }, OS.t('Video crossfader'), sel([['smart', 'Akıllı (duyulana göre)'], ['linked', 'Crossfader’a bağlı'], ['manual', 'Elle']], V.link, v => V.link = v)), xSl,
        el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: V.title, onchange: e => V.title = e.target.checked }), OS.t('Parça adı')),
        el('button', { class: 'btn sm', onclick: V.pickSlides }, 'Slayt görselleri…'),
        el('button', { class: 'btn sm primary', onclick: V.openOutput }, 'Çıkış penceresi')),
      cv,
      el('p', { class: 'muted' }, 'Decke video dosyası (MP4, WebM) yüklerseniz görüntüsü sesle senkron oynar; videosu olmayan parçada kapak ve görselleştirici gösterilir. Çıkış penceresini ikinci ekrana taşıyıp çift tıkla tam ekran yapın. Video kapalıyken işlemci harcamaz.'));
  };
})(window.OS);
