/* Mr. Mars Music Studio · MRH DGN — ışık kontrolü: USB seri arabirimden DMX512 çıkışı ve müziğe bağlı sahneler.
   Armatürler adres ve tip ile tanımlanır; sahne vuruşa ve bas seviyesine göre 40 Hz'de hesaplanır. */
(function (OS) {
  const U = OS.U, el = U.el, DJ = OS.ui.dj;
  const TYPES = { rgb: ['R', 'G', 'B'], drgb: ['D', 'R', 'G', 'B'], rgbw: ['R', 'G', 'B', 'W'], drgbs: ['D', 'R', 'G', 'B', 'S'], dim: ['D'] };
  const TYPE_L = { rgb: 'RGB (3 kanal)', drgb: 'Dimmer+RGB (4)', rgbw: 'RGBW (4)', drgbs: 'Dimmer+RGB+Strobe (5)', dim: 'Dimmer (1)' };
  const L = DJ.light = { port: null, mode: 'open', scene: 'pulse', color: [255, 40, 30], color2: [255, 255, 255], master: 1, on: false, fixtures: [], frame: new Uint8Array(513), sent: 0 };
  try { const s = JSON.parse(localStorage.getItem('os.light') || '{}'); ['mode', 'scene', 'color', 'color2', 'master', 'fixtures'].forEach(k => { if (s[k] !== undefined) L[k] = s[k]; }); } catch (e) { }
  if (!L.fixtures.length) L.fixtures = [0, 1, 2, 3].map(i => ({ type: 'drgb', addr: 1 + i * 4 }));
  const save = () => { try { localStorage.setItem('os.light', JSON.stringify({ mode: L.mode, scene: L.scene, color: L.color, color2: L.color2, master: L.master, fixtures: L.fixtures })); } catch (e) { } };
  const SCENES = L.SCENES = [['pulse', 'Vuruşta nabız'], ['chase', 'Sıralı koşu'], ['alt', 'Tek-çift'], ['bass', 'Basa tepki'], ['rainbow', 'Gökkuşağı'], ['strobe', 'Strobe'], ['static', 'Sabit renk'], ['black', 'Karartma']];

  const hsv = (h, s, v) => { const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6), p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i].map(x => x * 255); };
  // Müzik: en yüksek sesli çalan deckin vuruşu
  function beatInfo() {
    const ds = DJ.decks ? DJ.decks.slice(0, DJ._i.settings.count) : [];
    const d = ds.filter(x => x.playing && x.bpm).sort((a, b) => b.fader.gain.value * b.xf.gain.value - a.fader.gain.value * a.xf.gain.value)[0];
    if (!d) return { beat: performance.now() / 500, bass: 0, live: false };
    return { beat: (d.position() - d.grid) / d.beat, bass: bassOf(d), live: true };
  }
  const fb = new Uint8Array(128);
  function bassOf(d) { if (!d.an) return 0; const n = d.an.frequencyBinCount; const a = n === fb.length ? fb : new Uint8Array(n); d.an.getByteFrequencyData(a); let s = 0; for (let i = 0; i < 4; i++) s += a[i]; return s / (4 * 255); }
  // Bir armatürün o anki rengi ve parlaklığı
  L.compute = function (i, n, m) {
    const ph = ((m.beat % 1) + 1) % 1, b = Math.floor(m.beat), A = L.color, B = L.color2;
    switch (L.scene) {
      case 'pulse': { const v = Math.exp(-ph * 4); return A.map(x => x * v); }
      case 'chase': return b % n === i ? A : [0, 0, 0];
      case 'alt': return (b + i) % 2 ? A : B;
      case 'bass': return A.map(x => x * Math.pow(m.bass, 1.5));
      case 'rainbow': return hsv((((m.beat / 16 + i / n) % 1) + 1) % 1, 1, 1);
      case 'strobe': return ph * 4 % 1 < 0.35 ? [255, 255, 255] : [0, 0, 0];
      case 'static': return A;
      default: return [0, 0, 0];
    }
  };
  // Armatür rengini DMX kanallarına yazar
  L.render = function (m) {
    const f = L.frame, n = L.fixtures.length; f.fill(0); L.colors = [];
    L.fixtures.forEach((x, i) => {
      const c = L.compute(i, n, m).map(v => U.clamp(v * L.master, 0, 255)); L.colors.push(c);
      TYPES[x.type].forEach((ch, k) => {
        const a = x.addr + k; if (a < 1 || a > 512) return;
        f[a] = ch === 'R' ? c[0] : ch === 'G' ? c[1] : ch === 'B' ? c[2] : ch === 'W' ? Math.min(c[0], c[1], c[2]) : ch === 'D' ? (x.type === 'dim' ? Math.max(c[0], c[1], c[2]) : 255) : 0;
      });
    });
    return f;
  };
  // Çıkış paketleri. Açık tip: BREAK sonra başlangıç kodu + 512 kanal. Pro tip: 0x7E etiket 6 ... 0xE7
  L.packet = function (f) {
    if (L.mode === 'pro') { const n = 513, p = new Uint8Array(n + 5); p[0] = 0x7e; p[1] = 6; p[2] = n & 255; p[3] = n >> 8; p.set(f, 4); p[n + 4] = 0xe7; return p; }
    return f.slice();
  };
  let busy = false;
  L.send = async function () {
    if (!L.writer || busy) return;
    busy = true;
    try {
      const f = L.render(beatInfo());
      if (L.mode === 'open') { await L.port.setSignals({ break: true }); await new Promise(r => setTimeout(r, 1)); await L.port.setSignals({ break: false }); }
      await L.writer.write(L.packet(f)); L.sent++;
    } catch (e) { console.warn(e); L.disconnect(); U.toast(OS.t('DMX bağlantısı kesildi')); }
    busy = false;
  };
  L.attach = async function (port) {
    L.port = port;
    await port.open({ baudRate: L.mode === 'pro' ? 57600 : 250000, dataBits: 8, stopBits: 2, parity: 'none' });
    L.writer = port.writable.getWriter(); L.on = true;
    clearInterval(L.iv); L.iv = setInterval(L.send, 25);
  };
  L.connect = async function () {
    if (!navigator.serial) { U.toast(OS.t('Bu tarayıcı USB seri bağlantıyı desteklemiyor'), 6000); return; }
    try { await L.attach(await navigator.serial.requestPort()); } catch (e) { U.toast(OS.t('Bağlanılamadı') + ': ' + e.message, 6000); }
    L.refresh && L.refresh();
  };
  L.disconnect = async function () {
    clearInterval(L.iv); L.on = false;
    try { if (L.writer) { L.writer.releaseLock(); L.writer = null; } if (L.port) await L.port.close(); } catch (e) { }
    L.port = null; L.refresh && L.refresh();
  };
  const hex = c => '#' + c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  L.ui = function () {
    const box = el('div', { class: 'dj-panel dj-light' });
    const stage = el('canvas', { class: 'light-stage', width: 720, height: 96 });
    const draw = () => {
      box.innerHTML = '';
      box.append(
        el('div', { class: 'row wrap' }, el('b', null, 'DMX'),
          el('label', { class: 'field' }, OS.t('Arabirim'), el('select', { onchange: e => { L.mode = e.target.value; save(); } }, [['open', 'Açık tip (250 kbit seri)'], ['pro', 'Pro tip (mesajlı)']].map(([v, l]) => el('option', { value: v, selected: v === L.mode }, l)))),
          el('button', { class: 'btn sm ' + (L.on ? 'on' : 'primary'), onclick: () => L.on ? L.disconnect() : L.connect() }, L.on ? OS.t('Bağlantıyı kes') : OS.t('USB arabirime bağlan')),
          el('label', { class: 'field' }, 'Master', el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: L.master, oninput: e => { L.master = +e.target.value; save(); } })),
          el('input', { type: 'color', value: hex(L.color), oninput: e => { L.color = rgb(e.target.value); save(); } }), el('input', { type: 'color', value: hex(L.color2), oninput: e => { L.color2 = rgb(e.target.value); save(); } })),
        el('div', { class: 'row wrap' }, SCENES.map(([v, l]) => el('button', { class: 'btn sm' + (L.scene === v ? ' on' : ''), onclick: () => { L.scene = v; save(); draw(); } }, OS.t(l)))),
        stage,
        el('div', { class: 'light-fix' }, L.fixtures.map((x, i) => el('div', { class: 'row' }, el('span', { class: 'mono' }, String(i + 1)),
          el('select', { onchange: e => { x.type = e.target.value; save(); } }, Object.keys(TYPES).map(t => el('option', { value: t, selected: t === x.type }, TYPE_L[t]))),
          el('label', { class: 'field' }, OS.t('Adres'), el('input', { class: 'inp', type: 'number', min: 1, max: 512, value: x.addr, style: 'width:72px', onchange: e => { x.addr = U.clamp(+e.target.value || 1, 1, 512); save(); } })),
          el('button', { class: 'btn sm danger', onclick: () => { L.fixtures.splice(i, 1); save(); draw(); } }, '✕')))),
        el('button', { class: 'btn sm', onclick: () => { const l = L.fixtures[L.fixtures.length - 1]; L.fixtures.push({ type: l ? l.type : 'drgb', addr: l ? l.addr + TYPES[l.type].length : 1 }); save(); draw(); } }, OS.t('+ Armatür')));
    };
    L.refresh = draw; draw();
    const g = stage.getContext('2d');
    const tick = () => {
      if (!box.isConnected) return;
      requestAnimationFrame(tick);
      L.render(beatInfo());
      g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, 720, 96);
      const n = L.colors.length;
      L.colors.forEach((c, i) => { const x = (i + 0.5) / n * 720, gr = g.createRadialGradient(x, 48, 2, x, 48, 42); gr.addColorStop(0, `rgb(${c.map(Math.round)})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 44, 2, 88, 92); });
    };
    tick();
    return box;
  };
})(window.OS);
