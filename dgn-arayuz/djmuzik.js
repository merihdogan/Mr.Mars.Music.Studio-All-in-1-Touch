/* Mr. Mars Music Studio · MRH DGN — DJ Mikser: sanatçının kendi parçaları.
   Dinleme SoundCloud'un resmî oynatıcısıyla yapılır. Decke yalnız sanatçının bu siteye koyduğu kendi dosyası yüklenir:
   SoundCloud sesi kopyalanmaz. Yalnız bu tek sayfa listelenir, başka adres girilemez. */
(function (OS) {
  const U = OS.U, el = U.el, DJ = OS.ui.dj, CFG = window.OS_MY_MUSIC;
  const SITE = 'https://merihdogan.github.io/Mr.Mars.Music.Studio-All-in-1-Touch/';
  const M = DJ.myMusic = { base: null, tracks: null };
  const base = () => M.base || (/^https?:$/.test(location.protocol) ? new URL('.', location.href).href : SITE);
  const fileUrl = slug => base() + 'mrmars-muzik/' + encodeURIComponent(slug) + '.mp3';
  const slugOf = u => { try { return new URL(u).pathname.split('/').filter(Boolean).pop(); } catch (e) { return ''; } };
  const nice = s => s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const owner = new URL(CFG.profile).pathname.split('/')[1];
  const trackLink = slug => 'https://soundcloud.com/' + owner + '/' + slug;
  const addScript = src => new Promise((res, rej) => { if (window.SC && window.SC.Widget) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  // Liste resmî oynatıcıdan okunur; sayfaya yeni parça eklenince burada da görünür
  M.liveList = async function () {
    await addScript('https://w.soundcloud.com/player/api.js');
    const frame = el('iframe', { allow: 'autoplay', title: 'list', style: 'position:absolute;width:1px;height:1px;left:-9999px;border:0', src: 'https://w.soundcloud.com/player/?auto_play=false&url=' + encodeURIComponent(CFG.profile) });
    document.body.appendChild(frame);
    try {
      return await new Promise((res, rej) => {
        const w = window.SC.Widget(frame), t = setTimeout(() => rej(new Error('timeout')), 15000);
        w.bind(window.SC.Widget.Events.READY, () => w.getSounds(list => { clearTimeout(t); res(list); }));
      });
    } finally { frame.remove(); }
  };
  M.list = async function () {
    let rows = CFG.fallback.map(slug => ({ slug, title: nice(slug), art: '' }));
    try {
      const live = await M.liveList(), seen = new Set(), out = [];
      live.forEach(s => {
        if (!s.permalink_url) return; // oynatıcı bazı parçaların ayrıntısını sonradan verir: yedek listeden tamamlanır
        const slug = slugOf(s.permalink_url); if (new URL(s.permalink_url).pathname.split('/')[1] !== owner) return;
        seen.add(slug); out.push({ slug, title: s.title || nice(slug), art: s.artwork_url || '', seconds: s.duration ? s.duration / 1000 : 0 });
      });
      M.liveCount = live.length;
      rows.forEach(r => { if (!seen.has(r.slug)) out.push(r); });
      rows = out;
      M.live = true;
    } catch (e) { console.warn(e); M.live = false; }
    return rows;
  };
  const hasFile = async slug => { try { const r = await fetch(fileUrl(slug), { method: 'HEAD', cache: 'no-cache' }); return r.ok; } catch (e) { return false; } };
  M.loadToDeck = async function (slug, title, i, onP) {
    const r = await fetch(fileUrl(slug)); if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    await DJ.decks[i].load(new File([blob], title + '.mp3', { type: 'audio/mpeg' }));
    if (DJ.renderInfo) DJ.renderInfo();
  };

  M.open = async function () {
    const status = el('div', { class: 'muted', style: 'min-height:1.3em' }, OS.t('Liste alınıyor…'));
    const list = el('div', { class: 'lib-list', style: 'max-height:52vh;overflow:auto;display:flex;flex-direction:column;gap:6px' });
    const player = el('div');
    const listen = slug => {
      player.innerHTML = '';
      player.appendChild(el('iframe', { allow: 'autoplay', title: 'player', style: 'width:100%;height:120px;border:0;border-radius:6px', src: 'https://w.soundcloud.com/player/?auto_play=true&visual=false&url=' + encodeURIComponent(trackLink(slug)) }));
    };
    const body = el('div', { style: 'display:flex;flex-direction:column;gap:8px;width:min(720px,88vw)' },
      el('p', { class: 'muted', style: 'margin:0' }, OS.t('Bu listedeki parçaları dinleyebilir, dosyası eklenmiş olanları decke yükleyip miksleyebilirsin.')), list, player, status,
      el('a', { href: CFG.profile, target: '_blank', rel: 'noopener', style: 'color:var(--acc);font-size:12px' }, CFG.artist + ' · SoundCloud'));
    U.modal(CFG.artist, body, [{ label: 'Kapat', onclick: () => { player.innerHTML = ''; } }]);
    const rows = await M.list();
    M.tracks = rows;
    status.textContent = '';
    let ready = 0;
    await Promise.all(rows.map(async r => { r.file = await hasFile(r.slug); if (r.file) ready++; }));
    list.innerHTML = '';
    rows.forEach(r => {
      const decks = DJ.decks.slice(0, DJ.count || 2);
      list.appendChild(el('div', { class: 'lib-row my-track', style: 'display:flex;align-items:center;gap:8px;padding:4px 6px' },
        r.art ? el('img', { class: 'lib-cover', src: r.art, alt: '' }) : null,
        el('a', { href: trackLink(r.slug), target: '_blank', rel: 'noopener', style: 'flex:1;min-width:0;color:inherit' }, r.title),
        el('button', { class: 'btn sm', onclick: () => listen(r.slug) }, OS.t('Dinle')),
        r.file ? decks.map((d, i) => el('button', { class: 'btn sm primary', 'data-deck': i, onclick: async e => { const b = e.target; b.disabled = true; status.textContent = r.title + ' · ' + OS.t('Yükleniyor…'); try { await M.loadToDeck(r.slug, r.title, i); status.textContent = r.title + ' → Deck ' + 'ABCD'[i]; } catch (err) { console.error(err); status.textContent = OS.t('Dosya yüklenemedi'); } b.disabled = false; } }, 'ABCD'[i]))
          : el('span', { class: 'muted', style: 'font-size:11px' }, OS.t('Yalnız dinleme'))));
    });
    status.textContent = (M.live ? '' : OS.t('SoundCloud listesine ulaşılamadı, kayıtlı liste gösteriliyor. ')) + rows.length + ' ' + OS.t('parça') + ' · ' + ready + ' ' + OS.t('decke hazır');
  };
})(window.OS);
