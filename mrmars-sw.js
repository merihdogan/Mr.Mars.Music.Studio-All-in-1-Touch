/* Mr. Mars Music Studio · MRH DGN — çevrimdışı önbellek
 * Dosya listesi index.html'den okunur, yeni dosya için liste tutmak gerekmez.
 * Program dosyaları önce ağdan istenir, böylece yenileme hep son sürümü açar; ağ yoksa önbellek kullanılır.
 * Görsel ve büyük dosyalar önbellekten hemen açılır, arka planda güncellenir. */
const CACHE = 'mrmars-v30';
const FIXED = ['./', 'index.html', 'manifest.webmanifest', 'mrmars-eklentiler/index.js', 'mrh-cihazlar/ornek-davul.js', 'telefon.html', 'dinle.html', 'mrmars-cekirdek/mp3kod.js', 'mrmars-cekirdek/telefon-baglanti.js', 'mrmars-cekirdek/qr.js', 'mrmars-cekirdek/kayipsiz.js', 'User Manual_en_english.html',
  'mrmars-gorseller/icon-128.png', 'mrmars-gorseller/icon-256.png', 'mrmars-gorseller/icon-512.png', 'mrmars-gorseller/logo-1024.png', 'mrmars-gorseller/logo-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE), html = await (await fetch('index.html', { cache: 'no-cache' })).text();
    const list = new Set(FIXED);
    for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) list.add(m[1]);
    try {
      const idx = await (await fetch('mrmars-eklentiler/index.js', { cache: 'no-cache' })).text();
      for (const m of idx.matchAll(/'([^'\n]+\.js)'/g)) list.add('mrmars-eklentiler/' + m[1]);
    } catch (err) { }
    await Promise.allSettled([...list].map(u => cache.add(new Request(u, { cache: 'no-cache' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    const isCode = req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname);
    if (isCode && !url.pathname.endsWith('ornek-davul.js')) {
      // Tarayıcının HTTP önbelleğini de atla; ağ yavaşsa 4 sn sonra önbellekten aç
      const fresh = fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(res => { if (res.ok) cache.put(url.pathname.endsWith('/') ? 'index.html' : req, res.clone()); return res; });
      if (!hit) return fresh;
      return Promise.race([fresh.then(r => (r.ok ? r : hit)).catch(() => hit), new Promise(r => setTimeout(() => r(hit), 4000))]);
    }
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (hit) { e.waitUntil(net.catch(() => { })); return hit; }
    return net;
  })());
});
