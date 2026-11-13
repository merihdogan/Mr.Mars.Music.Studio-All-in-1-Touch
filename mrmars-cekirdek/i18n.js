/* Mr. Mars Music Studio · MRH DGN — çok dilli arayüz
 * Uygulama işletim sisteminin / tarayıcının diliyle açılır (navigator.languages).
 * Desteklenmeyen dillerde İngilizce kullanılır. Kaynak metinler Türkçedir; çeviriler
 * mrmars-cekirdek/dil/strings.js tablosundadır ve ekrana eklenen her metin otomatik çevrilir.
 */
window.OS = window.OS || {};
(function (OS) {
  const LANGS = ['tr', 'en', 'de', 'es', 'fr', 'sv', 'ru'];
  OS.LANG_NAMES = { tr: 'Türkçe', en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français', sv: 'Svenska', ru: 'Русский' };
  OS.LANGS = LANGS;

  function detect() {
    let saved = null;
    try { saved = localStorage.getItem('os.lang'); } catch (e) { }
    if (saved && LANGS.includes(saved)) return saved;
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
    for (const l of list) { const c = String(l).slice(0, 2).toLowerCase(); if (LANGS.includes(c)) return c; }
    return 'en';
  }
  OS.lang = detect();
  OS.langAuto = (() => { try { return !localStorage.getItem('os.lang'); } catch (e) { return true; } })();
  const idx = LANGS.indexOf(OS.lang);
  const map = new Map();
  if (idx > 0) (window.OS_STRINGS || []).forEach(r => { if (r[idx] != null && !map.has(r[0])) map.set(r[0], r[idx]); });

  const translated = new Set([...map.values()].filter(v => !map.has(v)));
  const SEPS = [' › ', ' • ', ': '];
  function lookup(t) {
    let r = map.get(t);
    if (r != null) return r;
    // "Gitar › Amfi Kafası", "Yükleniyor: dosya.wav" gibi bileşik metinler
    for (const sep of SEPS) {
      if (!t.includes(sep)) continue;
      let changed = false;
      const parts = t.split(sep).map((p, i, a) => {
        const k = p.trim(), key = sep === ': ' && i < a.length - 1 ? k + ':' : k;
        let x = map.get(key);
        if (x != null && sep === ': ' && i < a.length - 1) x = x.replace(/\s*:\s*$/, '');
        if (x == null) x = lookup(k);
        if (x != null) { changed = true; return p.replace(k, x); }
        return p;
      });
      if (changed) return parts.join(sep);
    }
    // "♪ Davul Makinesi", "✓ Otomatik" gibi simgeyle başlayan metinler
    const y = /^([^\p{L}\d]+)(.+)$/u.exec(t);
    if (y && map.has(y[2])) return y[1] + map.get(y[2]);
    // "5 klip kopyalandı" gibi sayıyla başlayan metinler
    const m = /^([\d.,]+ )(.+)$/.exec(t);
    if (m && map.has(m[2])) return m[1] + map.get(m[2]);
    // "Örs 3", "Bozuk Synth C#" gibi sonda sayı / nota adı olan metinler
    const e = /^(.+)( (?:\d+|[A-G]#?))$/.exec(t);
    if (e && map.has(e[1])) return map.get(e[1]) + e[2];
    return null;
  }
  OS.t = function (s) {
    if (idx <= 0 || !s || typeof s !== 'string') return s;
    const t = s.trim();
    if (!t || translated.has(t)) return s;
    const r = lookup(t);
    return r == null ? s : s.replace(t, r);
  };

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
  function walk(node) {
    if (node.nodeType === 3) { const v = node.nodeValue, n = OS.t(v); if (n !== v) node.nodeValue = n; return; }
    // translate="no": kullanıcının yazdığı adlar (bölüm adı gibi) çevrilmez
    if (node.nodeType !== 1 || SKIP.has(node.tagName) || (node.classList && node.classList.contains('code')) || (node.getAttribute && node.getAttribute('translate') === 'no')) return;
    attrs(node);
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  function attrs(e) {
    ['title', 'placeholder'].forEach(a => { const v = e.getAttribute && e.getAttribute(a); if (v) { const n = OS.t(v); if (n !== v) e.setAttribute(a, n); } });
  }
  function start() {
    document.documentElement.lang = OS.lang;
    if (idx <= 0) return;
    walk(document.body);
    new MutationObserver(ms => ms.forEach(m => {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') walk(m.target);
      else if (m.type === 'attributes') attrs(m.target);
    })).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  OS.setLang = function (code) {
    try { if (code === 'auto') localStorage.removeItem('os.lang'); else localStorage.setItem('os.lang', code); } catch (e) { }
    location.reload();
  };
})(window.OS);
