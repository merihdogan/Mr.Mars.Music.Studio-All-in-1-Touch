/* Mr. Mars Music Studio · MRH DGN — platform katmanı: dokunmatik köprü, telefon panelleri,
   ses kilidi açma, kurulabilir çevrimdışı uygulama (PWA). Diğer tüm betiklerden önce yüklenir. */
(function () {
  const OS = window.OS = window.OS || {};
  const P = OS.platform = {
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    ios: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    web: /^https?:$/.test(location.protocol),
    installEvent: null,
  };
  // Dokunmatik arayüz: otomatik (dokunmatik ekran varsa), her zaman açık ya da kapalı
  P.touchPref = (() => { try { return localStorage.getItem('os.touchui') || 'auto'; } catch (e) { return 'auto'; } })();
  P.touchUI = P.touchPref === 'on' || (P.touchPref === 'auto' && P.touch);
  P.setTouchPref = v => { try { localStorage.setItem('os.touchui', v); } catch (e) { } };
  if (P.touchUI) document.documentElement.classList.add('touch-ui');

  // ---------------- Dokunmatik köprü ----------------
  // Kod fare olaylarıyla yazıldı: basılı tutma ve sürükleme isteyen kontrollere dokunuşlar fare olayı
  // olarak iletilir; öteki yerlerde tarayıcının kendi kaydırması ve dokunuşu çalışır.
  if (P.touch) {
    let bindTid = null;
    const wraps = new WeakMap();
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opt) {
      if (type === 'mousedown' && this instanceof Element) this.__md = true;
      // Bir parmağın sürüklemesi yalnız o parmağı dinler; aynı anda iki fader ya da knob çevrilebilir
      if (bindTid !== null && (type === 'mouseup' || type === 'mousemove') && (this === window || this === document) && typeof fn === 'function') {
        const tid = bindTid, self = this, w = ev => { if (ev.__tid === undefined || ev.__tid === tid) fn.call(self, ev); };
        wraps.set(fn, w);
        return orig.call(this, type, w, opt);
      }
      return orig.call(this, type, fn, opt);
    };
    const origRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.removeEventListener = function (type, fn, opt) {
      return origRemove.call(this, type, (fn && wraps.get(fn)) || fn, opt);
    };
    const NATIVE = 'input,select,textarea,a,label,option';
    const scrolls = e => { const s = getComputedStyle(e); return (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1) || (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1); };
    function holder(t) {
      for (let e = t; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
        if (e.classList.contains('modal-back')) return null;
        if (e.__md) return e;
        if (scrolls(e)) return null;
      }
      return null;
    }
    const live = new Map();
    let lastTap = null;
    function move(e) {
      for (const t of e.changedTouches) {
        const r = live.get(t.identifier); if (!r) continue;
        if (Math.hypot(t.clientX - r.x, t.clientY - r.y) > 8) { r.moved = true; clearTimeout(r.timer); }
        if (r.bridged) { e.preventDefault(); fire('mousemove', r.target, t.clientX, t.clientY, t.identifier); }
      }
    }
    const fire = (type, target, x, y, tid) => {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' ? 0 : 1 });
      ev.__tid = tid;
      if (type === 'mousedown') bindTid = tid;
      // yeniden çizilen kontrol DOM'dan çıkmış olabilir: bırakma olayı yine de pencereye ulaşmalı
      try { (target.isConnected ? target : document).dispatchEvent(ev); } finally { bindTid = null; }
    };
    // Sürgüler: tarayıcının kendi sürgüsü tek parmak bekler. Burada her parmak kendi sürgüsünü taşır;
    // sürgü yönünde kayınca değer değişir, dik kayınca sayfa kayar, çift dokunuş varsayılana döner.
    const sliders = new Map();
    let lastSlider = null;
    function sliderStart(t, s) {
      const cs = getComputedStyle(s), vertical = cs.writingMode.startsWith('vertical') || cs.appearance === 'slider-vertical';
      const r = s.getBoundingClientRect();
      sliders.set(t.identifier, { el: s, x: t.clientX, y: t.clientY, v0: +s.value, vertical, sign: cs.direction === 'rtl' ? -1 : 1, len: Math.max(1, (vertical ? r.height : r.width) - 28), axis: s.closest('.tq') ? true : null, min: +s.min || 0, max: s.max === '' ? 100 : +s.max });
    }
    function sliderMove(e) {
      let used = false;
      for (const t of e.changedTouches) {
        const r = sliders.get(t.identifier); if (!r) continue;
        const dx = t.clientX - r.x, dy = t.clientY - r.y, along = r.vertical ? dy : dx, across = r.vertical ? dx : dy;
        if (r.axis === null) { if (Math.hypot(dx, dy) < 6) continue; r.axis = Math.abs(along) >= Math.abs(across); if (!r.axis) { sliders.delete(t.identifier); continue; } r.x = t.clientX; r.y = t.clientY; continue; }
        const d = (r.vertical ? t.clientY - r.y : t.clientX - r.x) * r.sign;
        const v = Math.min(r.max, Math.max(r.min, r.v0 + d / r.len * (r.max - r.min)));
        if (+r.el.value !== v) { r.el.value = v; r.el.dispatchEvent(new Event('input', { bubbles: true })); r.moved = true; }
        used = true;
      }
      if (used && e.cancelable) e.preventDefault();
    }
    function sliderEnd(e) {
      for (const t of e.changedTouches) {
        const r = sliders.get(t.identifier); if (!r) continue;
        sliders.delete(t.identifier);
        if (r.moved) { r.el.dispatchEvent(new Event('change', { bubbles: true })); continue; }
        const now = performance.now();
        if (lastSlider && lastSlider.el === r.el && now - lastSlider.t < 320) { r.el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); lastSlider = null; }
        else lastSlider = { el: r.el, t: now };
      }
    }
    document.addEventListener('touchmove', sliderMove, { passive: false, capture: true });
    document.addEventListener('touchend', sliderEnd, { capture: true });
    document.addEventListener('touchcancel', sliderEnd, { capture: true });
    document.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        const target = t.target.nodeType === 1 ? t.target : t.target.parentElement;
        if (target && target.matches('input[type=range]')) { sliderStart(t, target); continue; }
        if (!target || target.closest(NATIVE)) continue;
        const bridged = !!holder(target);
        if (!bridged && !P.ios) continue; // Android uzun basmayı kendi iletir
        const rec = { target, bridged, x: t.clientX, y: t.clientY, moved: false, menu: false };
        // basılı tutulan sampler pedinde menü geç açılır
        rec.timer = setTimeout(() => { if (!rec.moved) { rec.menu = true; fire('contextmenu', target, rec.x, rec.y); } }, target.closest('.pad.momentary') ? 1500 : 550);
        live.set(t.identifier, rec);
        if (!target.__tb) { target.__tb = true; target.addEventListener('touchmove', move, { passive: false }); target.addEventListener('touchend', end, { passive: false }); target.addEventListener('touchcancel', end, { passive: false }); }
        if (bridged) { e.preventDefault(); fire('mousedown', target, t.clientX, t.clientY, t.identifier); }
      }
    }, { passive: false, capture: true });
    document.addEventListener('touchmove', move, { passive: false, capture: true });
    function end(e) {
      for (const t of e.changedTouches) {
        const r = live.get(t.identifier); if (!r) continue;
        live.delete(t.identifier); clearTimeout(r.timer);
        if (!r.bridged) continue;
        e.preventDefault();
        fire('mouseup', r.target, t.clientX, t.clientY, t.identifier);
        if (e.type === 'touchend' && !r.moved && !r.menu && r.target.isConnected) {
          fire('click', r.target, t.clientX, t.clientY);
          const now = performance.now();
          if (lastTap && lastTap.target === r.target && now - lastTap.t < 320) { fire('dblclick', r.target, t.clientX, t.clientY); lastTap = null; }
          else lastTap = { target: r.target, t: now };
        }
      }
    }
    document.addEventListener('touchend', end, { passive: false, capture: true });
    document.addEventListener('touchcancel', end, { passive: false, capture: true });
  }

  // ---------------- Ses kilidi: mobil tarayıcılar sesi yalnız dokunuşla başlatır ----------------
  const unlock = () => { const c = OS.engine && OS.engine.ctx; if (c && c.state !== 'running') c.resume().catch(() => { }); };
  ['touchend', 'click', 'keydown'].forEach(t => document.addEventListener(t, unlock, { capture: true, passive: true }));

  // ---------------- Dar ekran panelleri ----------------
  addEventListener('DOMContentLoaded', () => {
    const bar = document.getElementById('topbar'); if (!bar) return;
    const t = s => (OS.t ? OS.t(s) : s);
    const tog = (label, cls) => { const b = document.createElement('button'); b.className = 'btn ghost m-toggle'; b.textContent = label[0]; b.title = t(label[1]); b.onclick = () => b.classList.toggle('on', document.body.classList.toggle(cls)); bar.appendChild(b); };
    tog(['☰', 'Panel'], 'show-panel');
    tog(['🎹', 'Klavye'], 'show-keys');
  });

  // ---------------- Kurulabilir uygulama ----------------
  if (P.web && isSecureContext) {
    const link = document.createElement('link'); link.rel = 'manifest'; link.href = 'manifest.webmanifest'; document.head.appendChild(link);
    if ('serviceWorker' in navigator) {
      // Açık pencerede yeni sürüm yayınlanınca haber ver: çalan müzik kesilmesin diye kendiliğinden yenilemez
      const had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!had || document.getElementById('update-banner')) return;
        const b = document.createElement('div'); b.id = 'update-banner';
        b.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:100000;background:#134e4a;color:#fff;padding:8px 12px;border-radius:8px;display:flex;gap:10px;align-items:center;box-shadow:0 4px 16px rgba(0,0,0,.5);font-size:13px';
        const t = document.createElement('span'); t.textContent = 'Yeni sürüm hazır';
        const r = document.createElement('button'); r.className = 'btn sm primary'; r.textContent = 'Yenile'; r.onclick = () => location.reload();
        b.append(t, r); document.body.appendChild(b);
      });
      navigator.serviceWorker.register('mrmars-sw.js').then(reg => {
        window.OS_checkUpdate = () => reg.update().catch(() => { });
        setInterval(window.OS_checkUpdate, 3600000);
      }).catch(() => { });
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); P.installEvent = e; });
  }
  P.canInstall = () => !P.standalone && !!(P.installEvent || (P.ios && P.web));
  P.install = () => {
    if (P.installEvent) { P.installEvent.prompt(); P.installEvent = null; return; }
    OS.U.modal(OS.t('Ana ekrana ekle'), OS.t('Safari’de Paylaş düğmesine dokunun, sonra “Ana Ekrana Ekle”yi seçin. Uygulama bundan sonra internetsiz de açılır.'));
  };
})();
