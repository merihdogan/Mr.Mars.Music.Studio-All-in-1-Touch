/* Mr. Mars Music Studio · MRH DGN — stereo harita
   Her parça bir nokta: yatayda pan, dikeyde ses düzeyi. Noktanın çevresindeki bulut, sesin gerçekte nerede durduğunu
   (sol-sağ dengesi), ne kadar geniş olduğunu (faz uyumundan) ve ne kadar yüksek olduğunu ölçerek gösterir. */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui;
  const SM = ui.stereoMap = {};
  const DB_TOP = 6, DB_BOT = -48;
  let cv, wrap, hover = null, drag = null, raf = 0;
  const meas = new Map();   // parça kimliği → yumuşatılmış ölçüm
  const bufL = new Float32Array(1024), bufR = new Float32Array(1024);

  /** Analizör çiftinden denge (-1..1), genişlik (0..1), uyum (-1..1) ve düzey (dB). */
  SM.measure = function (anL, anR) {
    anL.getFloatTimeDomainData(bufL); anR.getFloatTimeDomainData(bufR);
    let ll = 0, rr = 0, lr = 0;
    for (let i = 0; i < bufL.length; i++) { const l = bufL[i], r = bufR[i]; ll += l * l; rr += r * r; lr += l * r; }
    const rl = Math.sqrt(ll / bufL.length), rrm = Math.sqrt(rr / bufR.length);
    const corr = ll > 1e-12 && rr > 1e-12 ? lr / Math.sqrt(ll * rr) : 1;
    return { bal: rl + rrm > 1e-9 ? (rrm - rl) / (rrm + rl) : 0, width: U.clamp((1 - corr) / 2, 0, 1), corr, db: U.gainToDb(Math.max(rl, rrm) * Math.SQRT2) };
  };

  const yOf = (db, h) => 20 + (1 - (U.clamp(db, DB_BOT, DB_TOP) - DB_BOT) / (DB_TOP - DB_BOT)) * (h - 50);
  const dbOf = (y, h) => DB_BOT + (1 - U.clamp((y - 20) / (h - 50), 0, 1)) * (DB_TOP - DB_BOT);
  const xOf = (pan, w) => 40 + (pan + 1) / 2 * (w - 80);
  const panOf = (x, w) => U.clamp((x - 40) / (w - 80) * 2 - 1, -1, 1);

  SM.render = function (root) {
    cancelAnimationFrame(raf);
    wrap = el('div', { class: 'smap' }); cv = el('canvas'); wrap.appendChild(cv); root.appendChild(wrap);
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', e => { if (!drag) { hover = hit(e); cv.style.cursor = hover ? 'grab' : 'crosshair'; } });
    cv.addEventListener('dblclick', e => {
      const t = hit(e); if (!t) return;
      OS.history.push();
      if (e.altKey) t.vol = 0; else t.pan = 0;
      OS.engine.updateMix(); ui.emit('os-mix');
    });
    raf = requestAnimationFrame(frame);
  };

  function tracks() { return OS.project.tracks.filter(t => OS.engine.nodes.get(t.id)); }
  function hit(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 16;
    tracks().forEach(t => { const d = Math.hypot(xOf(t.pan || 0, r.width) - x, yOf(t.vol, r.height) - y); if (d < bd) { bd = d; best = t; } });
    return best;
  }
  function down(e) {
    const t = hit(e); if (!t) return;
    OS.history.push();
    drag = t; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
    const move = ev => {
      const r = cv.getBoundingClientRect();
      t.pan = Math.round(panOf(ev.clientX - r.left, r.width) * 100) / 100;
      t.vol = Math.round(dbOf(ev.clientY - r.top, r.height) * 10) / 10;
      OS.auto.touch(t, 'pan', t.pan); OS.auto.touch(t, 'vol', t.vol);
      OS.engine.updateMix(); ui.emit('os-mix');
    };
    const up = () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); drag = null; cv.style.cursor = 'grab'; OS.store.markDirty(); };
    cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
  }

  function frame() {
    if (!cv || !cv.isConnected) return;
    raf = requestAnimationFrame(frame);
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    // ızgara
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '10px Segoe UI'; g.lineWidth = 1;
    [6, 0, -6, -12, -24, -36, -48].forEach(db => { const y = yOf(db, h) + 0.5; g.beginPath(); g.moveTo(40, y); g.lineTo(w - 40, y); g.stroke(); g.fillText(db + ' dB', 4, y + 3); });
    [-1, -0.5, 0, 0.5, 1].forEach(p => { const x = xOf(p, w) + 0.5; g.beginPath(); g.moveTo(x, 14); g.lineTo(x, h - 28); g.stroke(); g.fillText(p === 0 ? 'C' : (p < 0 ? 'L' : 'R') + Math.abs(p * 100), x - 8, 11); });
    const anySolo = OS.project.tracks.some(t => t.solo);
    const labels = [];   // aynı yerdeki parçaların adları üst üste binmesin
    tracks().forEach(t => {
      const n = OS.engine.nodes.get(t.id), m = SM.measure(n.anL, n.anR);
      const o = meas.get(t.id) || m; ['bal', 'width', 'corr', 'db'].forEach(k => o[k] += (m[k] - o[k]) * 0.15); meas.set(t.id, o);
      const x = xOf(t.pan || 0, w), y = yOf(t.vol, h);
      const dim = t.mute || (anySolo && !t.solo);
      // ölçülen bulut: gerçek konum ve genişlik
      if (!dim && o.db > -70) {
        const cx = xOf(o.bal, w), rx = 16 + o.width * (w - 80) / 2, ry = 14 + o.width * 22, a = U.clamp((o.db + 50) / 45, 0.12, 0.7);
        const grd = g.createRadialGradient(cx, y, 2, cx, y, rx);
        grd.addColorStop(0, hexA(t.color, a)); grd.addColorStop(0.7, hexA(t.color, a * 0.45)); grd.addColorStop(1, hexA(t.color, 0));
        g.fillStyle = grd; g.beginPath(); g.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = hexA(t.color, Math.min(0.9, a + 0.2)); g.lineWidth = 1; g.beginPath(); g.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2); g.stroke();
        if (Math.abs(o.bal - (t.pan || 0)) > 0.35) { g.strokeStyle = 'rgba(255,200,80,.6)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, y); g.lineTo(cx, y); g.stroke(); g.setLineDash([]); }
      }
      g.globalAlpha = dim ? 0.3 : 1;
      g.fillStyle = t.color; g.strokeStyle = hover === t || drag === t ? '#fff' : 'rgba(0,0,0,.6)'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.stroke();
      let ly = y - 8;
      while (labels.some(l => Math.abs(l.x - (x + 10)) < 90 && Math.abs(l.y - ly) < 13)) ly += 13;
      labels.push({ x: x + 10, y: ly });
      g.fillStyle = '#fff'; g.font = '11px Segoe UI'; g.fillText(t.name, x + 10, ly);
      g.globalAlpha = 1;
      if (hover === t || drag === t) {
        const lines = [t.name, 'Pan ' + (Math.abs(t.pan || 0) < 0.01 ? 'C' : ((t.pan < 0 ? 'L' : 'R') + Math.round(Math.abs(t.pan) * 100))) + ' · ' + t.vol.toFixed(1) + ' dB',
          OS.t('Genişlik') + ' ' + Math.round(o.width * 100) + '% · ' + OS.t('Uyum') + ' ' + o.corr.toFixed(2), OS.t('Düzey') + ' ' + (o.db > -90 ? o.db.toFixed(1) : '-∞') + ' dB'];
        const bx = Math.min(w - 170, x + 12), by = Math.max(4, y + 10);
        g.fillStyle = 'rgba(10,10,12,.92)'; g.fillRect(bx, by, 162, lines.length * 15 + 8);
        g.fillStyle = '#ddd'; lines.forEach((l, i) => g.fillText(l, bx + 6, by + 16 + i * 15));
      }
    });
    // master uyumu: -1'e yakın değerler mono'da ses kaybı demektir
    const mm = SM.measure(OS.engine.master.anL, OS.engine.master.anR);
    const cx = w / 2, cy = h - 12, bw = Math.min(260, w - 120);
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(cx - bw / 2, cy - 3, bw, 6);
    g.fillStyle = mm.corr < 0 ? '#ef4444' : '#39c27a'; g.fillRect(cx + mm.corr * bw / 2 - 2, cy - 5, 4, 10);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText(OS.t('Master uyumu') + ' ' + mm.corr.toFixed(2), cx + bw / 2 + 8, cy + 4);
  }
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '#888888') || [0, '88', '88', '88'];
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }
})(window.OS);
