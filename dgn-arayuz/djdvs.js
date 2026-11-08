/* Mr. Mars Music Studio · MRH DGN — timecode vinil / CD: pikaptan gelen stereo taşıyıcı sinyalin
   hızını ve yönünü okur, deck'i buna göre sürer. Göreli modda çalışır: plağın hızı ve yönü izlenir,
   iğnenin plaktaki mutlak yeri okunmaz. */
(function (OS) {
  const U = OS.U, el = U.el, E = OS.engine, DJ = OS.ui.dj;
  const D = DJ.dvs = { carrier: 1000, invert: false, pair: 0, deviceId: '', on: [false, false, false, false], view: {}, inputs: [] };
  try { Object.assign(D, JSON.parse(localStorage.getItem('os.dvs') || '{}'), { on: [false, false, false, false], view: {}, inputs: [] }); } catch (e) { }
  const save = () => { try { localStorage.setItem('os.dvs', JSON.stringify({ carrier: D.carrier, invert: D.invert, pair: D.pair, deviceId: D.deviceId })); } catch (e) { } };

  // Çözücü: L+jR fazının örnekten örneğe değişimi frekansı, işareti yönü verir
  const WORK = `class Q extends AudioWorkletProcessor{constructor(){super();this.pl=0;this.pr=0;this.sum=0;this.n=0;this.e=0;this.cx=0;this.cy=0;this.dl=0;this.dr=0}
  process(inp){const c=inp[0];if(!c||c.length<2)return true;const L=c[0],R=c[1];for(let i=0;i<L.length;i++){
   this.dl+=(L[i]-this.dl)*.001;this.dr+=(R[i]-this.dr)*.001;const l=L[i]-this.dl,r=R[i]-this.dr;
   const x=l*this.pl+r*this.pr,y=r*this.pl-l*this.pr,a=Math.atan2(y,x),m=Math.hypot(x,y);
   this.sum+=a;this.e+=l*l+r*r;if(m>1e-9){this.cx+=x/m;this.cy+=y/m}this.n++;this.pl=l;this.pr=r;
   if(this.n>=128){this.port.postMessage({f:this.sum/this.n*sampleRate/(2*Math.PI),a:Math.sqrt(this.e/this.n),q:Math.hypot(this.cx,this.cy)/this.n});this.sum=this.e=this.cx=this.cy=this.n=0}}return true}}
  registerProcessor('mm-timecode',Q)`;
  let ready = null;
  function loadWorklet(ctx) {
    if (!ready || ready.ctx !== ctx) { const url = URL.createObjectURL(new Blob([WORK], { type: 'text/javascript' })); ready = { ctx, p: ctx.audioWorklet.addModule(url) }; }
    return ready.p;
  }
  // Tek taşıyıcı ölçümünü deck hızına çevirir: kısa medyan titremeyi alır
  D.speedOf = (f, carrier, invert) => (invert ? -1 : 1) * f / carrier;
  D.feed = function (d, m) {
    const v = D.view[d.L] = D.view[d.L] || { hist: [], lost: 0 };
    v.amp = m.a; v.q = m.q; v.f = m.f;
    const good = m.a > 0.004 && m.q > 0.55;
    if (!good) { v.lost++; if (v.lost > 6) { v.speed = 0; v.hist.length = 0; } }
    else {
      v.lost = 0; v.hist.push(D.speedOf(m.f, D.carrier, D.invert)); if (v.hist.length > 5) v.hist.shift();
      const s = v.hist.slice().sort((a, b) => a - b); v.speed = s[s.length >> 1];
      if (Math.abs(v.speed - 1) < 0.004) v.speed = 1;
    }
    if (!d.scr) { if (!d.buffer) return; d.scratchOn(); }
    if (d.scr) d.scr.direct = U.clamp(v.speed || 0, -4, 4);
  };
  async function stream() {
    if (D.stream) return D.stream;
    D.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: D.deviceId ? { exact: D.deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 6 } } });
    return D.stream;
  }
  // deck 0/1 → giriş 1-2 / 3-4 ; tek deck için seçili çift kullanılır
  D.start = async function (i, sourceNode) {
    const ctx = E.init(), d = DJ.decks[i]; await loadWorklet(ctx);
    let src = sourceNode;
    if (!src) { src = D.src = D.src || ctx.createMediaStreamSource(await stream()); }
    const n = new AudioWorkletNode(ctx, 'mm-timecode', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
    const split = ctx.createChannelSplitter(6), merge = ctx.createChannelMerger(2), base = D.pair * 2 + (i % 2) * 2;
    src.connect(split);
    split.connect(merge, base, 0); split.connect(merge, base + 1, 1); merge.connect(n);
    n.port.onmessage = e => { if (D.calib) D.calib(e.data); else if (D.on[i]) D.feed(d, e.data); };
    D.nodes = D.nodes || {}; D.nodes[i] = { n, split, merge, src };
    D.on[i] = true;
    return n;
  };
  D.stop = function (i) {
    D.on[i] = false;
    const x = D.nodes && D.nodes[i];
    if (x) { try { x.src.disconnect(x.split); } catch (e) { } x.n.port.onmessage = null; try { x.merge.disconnect(); } catch (e) { } delete D.nodes[i]; }
    const d = DJ.decks[i]; if (d.scr) { d.scr.direct = null; d.scratchOff(); }
    if (!D.on.some(Boolean) && D.stream) { D.stream.getTracks().forEach(t => t.stop()); D.stream = null; D.src = null; }
  };
  // Plak 33⅓'te dönerken gelen taşıyıcıyı ölçer
  D.calibrate = function (i) {
    if (!D.on[i]) { U.toast(OS.t('Önce deck için timecode’u açın')); return; }
    const a = []; D.calib = m => { if (m.a > 0.004 && m.q > 0.55) a.push(Math.abs(m.f)); };
    setTimeout(() => { D.calib = null; if (a.length < 20) { U.toast(OS.t('Sinyal alınamadı')); return; } a.sort((x, y) => x - y); D.carrier = Math.round(a[a.length >> 1]); save(); U.toast(OS.t('Taşıyıcı') + ': ' + D.carrier + ' Hz'); D.refresh && D.refresh(); }, 1500);
  };
  D.ui = function () {
    const box = el('div', { class: 'dj-panel dj-dvs' });
    const stat = {};
    const build = async () => {
      box.innerHTML = '';
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) D.inputs = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(x => x.kind === 'audioinput');
      const n = DJ._i.settings.count;
      box.append(
        el('div', { class: 'row wrap' }, el('b', null, 'Timecode'),
          el('label', { class: 'field' }, OS.t('Giriş'), el('select', { onchange: e => { D.deviceId = e.target.value; save(); } }, el('option', { value: '' }, OS.t('Varsayılan')), D.inputs.map(x => el('option', { value: x.deviceId, selected: x.deviceId === D.deviceId }, x.label || x.deviceId.slice(0, 8))))),
          el('label', { class: 'field' }, OS.t('Kanallar'), el('select', { onchange: e => { D.pair = +e.target.value; save(); } }, [[0, 'A: 1-2 · B: 3-4'], [1, 'A: 3-4 · B: 5-6']].map(([v, l]) => el('option', { value: v, selected: v === D.pair }, l)))),
          el('label', { class: 'field' }, OS.t('Taşıyıcı (Hz)'), el('input', { class: 'inp', type: 'number', value: D.carrier, style: 'width:80px', onchange: e => { D.carrier = +e.target.value || 1000; save(); } })),
          [1000, 2000, 2500].map(v => el('button', { class: 'btn sm' + (D.carrier === v ? ' on' : ''), onclick: () => { D.carrier = v; save(); build(); } }, v / 1000 + ' kHz')),
          el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: D.invert, onchange: e => { D.invert = e.target.checked; save(); } }), OS.t('Yönü ters çevir'))),
        ...DJ.decks.slice(0, n).map((d, i) => { const s = stat[d.L] = el('span', { class: 'mono' }, '—'); return el('div', { class: 'row wrap' }, el('b', null, 'Deck ' + d.L),
          el('button', { class: 'btn sm' + (D.on[i] ? ' on' : ''), onclick: async () => { try { D.on[i] ? D.stop(i) : await D.start(i); } catch (e) { U.toast(OS.t('Giriş açılamadı') + ': ' + e.message, 6000); } build(); } }, OS.t('Timecode ile sür')),
          el('button', { class: 'btn sm', onclick: () => D.calibrate(i) }, OS.t('Ölç (33⅓)')), s); }),
        el('p', { class: 'muted' }, OS.t('Göreli mod: plağın hızı ve yönü deck’i sürer; iğneyi plakta başka yere koymak parçada atlama yapmaz. Ses kartı stereo hat girişi gerekir, pikap önamfisi açık olmalı.')));
      D.refresh = build;
    };
    build();
    const iv = setInterval(() => { if (!box.isConnected) { clearInterval(iv); return; } Object.keys(stat).forEach(L => { const v = D.view[L]; if (stat[L]) stat[L].textContent = v && DJ.decks[DJ._i.LETTERS.indexOf(L)] && D.on[DJ._i.LETTERS.indexOf(L)] ? ((v.speed || 0) * 100).toFixed(1) + '% · ' + OS.t('sinyal') + ' ' + Math.round((v.q || 0) * 100) + '%' : '—'; }); }, 150);
    return box;
  };
})(window.OS);
